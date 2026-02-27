import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { DEXProtocol, PriceDelta, PriceSnapshot } from "../monitor/types.js";
import type { PriceMonitor } from "../monitor/PriceMonitor.js";
import type {
  ArbitrageOpportunity,
  CostEstimate,
  FlashLoanFees,
  OpportunityDetectorConfig,
  SwapPath,
  SwapStep,
} from "./types.js";
import { InputOptimizer } from "../optimizer/InputOptimizer.js";
import type { OptimizationResult } from "../optimizer/types.js";

/** Safely coerce an unknown caught value to an Error */
function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

/** Maximum allowed detection-to-execution latency in milliseconds */
const MAX_STALENESS_MS = 200;

const DEFAULT_FLASH_LOAN_FEES: FlashLoanFees = {
  aaveV3: 0.0005, // 0.05%
  dydx: 0,
  balancer: 0,
};

/**
 * Analyzes price deltas from PriceMonitor and identifies profitable
 * arbitrage opportunities after accounting for flash loan fees,
 * gas costs, and slippage.
 */
export class OpportunityDetector extends EventEmitter {
  private readonly config: Required<Omit<OpportunityDetectorConfig, "flashLoanFees" | "gasEstimatorFn" | "maxInputByDex">> & {
    flashLoanFees: FlashLoanFees;
  };
  private readonly maxInputByDex: Partial<Record<DEXProtocol, number>>;
  private gasEstimatorFn: ((numSwaps: number) => Promise<{ gasCost: number; l1DataFee?: number }>) | undefined;
  private monitor: PriceMonitor | null = null;
  private stalePools = new Set<string>();
  private optimizer: InputOptimizer;

  constructor(config: OpportunityDetectorConfig = {}) {
    super();
    this.config = {
      minProfitThreshold: config.minProfitThreshold ?? 0.01,
      maxSlippage: config.maxSlippage ?? 0.005,
      defaultInputAmount: config.defaultInputAmount ?? 10,
      gasPriceGwei: config.gasPriceGwei ?? 30,
      gasPerSwap: config.gasPerSwap ?? 150_000,
      flashLoanFees: {
        ...DEFAULT_FLASH_LOAN_FEES,
        ...config.flashLoanFees,
      },
    };
    this.gasEstimatorFn = config.gasEstimatorFn;
    this.maxInputByDex = {
      traderjoe_lb: 5, // Conservative: LB bins typically hold 2-20 ETH depth
      ...config.maxInputByDex,
    };

    // Initialize optimizer with conservative defaults
    this.optimizer = new InputOptimizer({
      maxIterations: 20,
      timeoutMs: 100,
      fallbackAmount: this.config.defaultInputAmount,
      minAmount: 1,
      maxAmount: Math.min(1000, this.config.defaultInputAmount * 100),
      convergenceThreshold: 1.0,
    });
  }

  /**
   * Set or replace the async gas estimator function.
   * When set, the detector uses this function instead of the simple gasPriceGwei formula.
   * Useful for L2 chains like Arbitrum where L1 data fees are a significant cost component.
   */
  public setGasEstimator(fn: (numSwaps: number) => Promise<{ gasCost: number; l1DataFee?: number }>): void {
    this.gasEstimatorFn = fn;
  }

  /** Attach to a PriceMonitor and start listening for opportunities */
  attach(monitor: PriceMonitor): void {
    this.detach();
    this.monitor = monitor;
    monitor.on("opportunity", this.handleDelta);
    monitor.on("stale", this.handleStale);
  }

  /** Detach from the current PriceMonitor */
  detach(): void {
    if (this.monitor) {
      this.monitor.off("opportunity", this.handleDelta);
      this.monitor.off("stale", this.handleStale);
      this.monitor = null;
    }
    this.stalePools.clear();
  }

  /** Whether the detector is attached to a PriceMonitor */
  get isAttached(): boolean {
    return this.monitor !== null;
  }

  /**
   * Check if an opportunity is too stale to execute.
   *
   * @param opportunity - The opportunity to check
   * @returns { fresh: boolean; latencyMs: number } - Fresh if latency <= 200ms
   */
  checkStaleness(opportunity: ArbitrageOpportunity): { fresh: boolean; latencyMs: number } {
    const now = Date.now();
    const latencyMs = now - opportunity.timestamp;
    return {
      fresh: latencyMs <= MAX_STALENESS_MS,
      latencyMs,
    };
  }

  /** Handle a price delta event from PriceMonitor */
  private handleDelta = (delta: PriceDelta): void => {
    if (this.gasEstimatorFn) {
      // Async path: use gas estimator for L1+L2 cost breakdown
      void this.analyzeDeltaAsync(delta).catch((err) => {
        this.emit("error", toError(err));
      });
    } else {
      try {
        this.analyzeDelta(delta);
      } catch (err) {
        this.emit("error", toError(err));
      }
    }
  };

  /** Handle a stale pool event from PriceMonitor */
  private handleStale = (pool: { poolAddress: string }): void => {
    this.stalePools.add(pool.poolAddress.toLowerCase());
  };

  /**
   * Check if a price delta involves a Ramses pool (either buy or sell side).
   * Returns true if either pool.dex is "ramses_v3".
   */
  private involvesRamses(delta: PriceDelta): boolean {
    return delta.buyPool.pool.dex === "ramses_v3" || delta.sellPool.pool.dex === "ramses_v3";
  }

  /**
   * Check if a swap path includes any Trader Joe LB steps.
   * Used to apply higher profit threshold for LB opportunities.
   */
  private usesTraderJoeLB(path: SwapPath): boolean {
    return path.steps.some((step) => step.dex === "traderjoe_lb");
  }

  /**
   * Analyze a price delta and emit an opportunity if profitable.
   * This is the main entry point for processing detected price differences.
   */
  analyzeDelta(delta: PriceDelta): ArbitrageOpportunity | null {
    // Skip if either pool is stale
    if (this.isPoolStale(delta.buyPool) || this.isPoolStale(delta.sellPool)) {
      this.emit(
        "opportunityRejected",
        "Pool marked as stale",
        delta,
      );
      return null;
    }

    const path = this.buildSwapPath(delta);

    // Optimize input amount based on pool depth
    let inputAmount: number;
    let optimizationResult: OptimizationResult | undefined;

    // Check if we have reserve data for optimization
    const hasReserveData = path.steps.some(
      (s) => s.virtualReserveIn !== undefined && s.virtualReserveIn > 0,
    );

    if (hasReserveData) {
      const profitFn = this.buildProfitFunction(path);
      // Cap search range to 30% of buy pool depth to avoid testing absurd sizes
      const reserveCap = this.computeReserveCap(path);
      optimizationResult = this.optimizer.optimize(path, profitFn, reserveCap);
      inputAmount = optimizationResult.optimalAmount;

      // Optimizer exhausted search range without finding any profitable size — skip early.
      // Computing netProfit at fallbackAmount (outside the searched range) would produce
      // a misleading large negative value due to uncapped slippage.
      if (optimizationResult.fallbackReason === "no_profitable_size") {
        this.emit("opportunityRejected", "No profitable input size found", delta);
        return null;
      }
    } else {
      // No reserve data: fall back to fixed amount
      inputAmount = this.config.defaultInputAmount;
    }

    // Apply per-DEX max input cap (for pools without reserve data like TJ LB)
    const dexCap = this.getDexInputCap(path);
    if (dexCap !== undefined && inputAmount > dexCap) {
      inputAmount = dexCap;
    }

    const grossProfit = this.calculateGrossProfit(path, inputAmount);
    const costs = this.estimateCosts(path, inputAmount);
    const netProfit = grossProfit - costs.totalCost;
    const netProfitPercent = (netProfit / inputAmount) * 100;

    // Apply higher thresholds for risky DEXes
    // Ramses: 2x threshold (fee manipulation risk)
    // Trader Joe LB: 1.33x threshold (fee volatility)
    let effectiveThreshold = this.config.minProfitThreshold;
    let thresholdLabel = "";

    if (this.involvesRamses(delta)) {
      effectiveThreshold = this.config.minProfitThreshold * 2;
      thresholdLabel = " (2x for Ramses)";
    } else if (this.usesTraderJoeLB(path)) {
      effectiveThreshold = this.config.minProfitThreshold * 1.33;
      thresholdLabel = " (1.33x for Trader Joe LB)";
    }

    if (netProfit < effectiveThreshold) {
      this.emit(
        "opportunityRejected",
        `Net profit ${netProfit.toFixed(6)} below threshold ${effectiveThreshold.toFixed(6)}${thresholdLabel}`,
        delta,
      );
      return null;
    }

    const opportunity: ArbitrageOpportunity = {
      id: randomUUID(),
      path,
      inputAmount,
      optimizationResult,
      grossProfit,
      costs,
      netProfit,
      netProfitPercent,
      priceDelta: delta,
      blockNumber: delta.buyPool.blockNumber,
      timestamp: Date.now(),
    };

    this.emit("opportunityFound", opportunity);
    return opportunity;
  }

  /**
   * Estimate costs for a path, calling the async gas estimator when available.
   * Falls back to synchronous estimateCosts() if no gas estimator is set.
   */
  async estimateCostsWithL1(path: SwapPath, inputAmount: number): Promise<CostEstimate> {
    if (!this.gasEstimatorFn) {
      return this.estimateCosts(path, inputAmount);
    }

    const flashLoanFee = this.estimateFlashLoanFee(inputAmount);
    const slippageCost = this.estimateSlippage(path, inputAmount);

    const gasResult = await this.gasEstimatorFn(path.steps.length);
    const gasCost = gasResult.gasCost;
    const l1DataFee = gasResult.l1DataFee;

    const totalCost = flashLoanFee + gasCost + (l1DataFee ?? 0) + slippageCost;

    return {
      flashLoanFee,
      gasCost,
      l1DataFee,
      slippageCost,
      totalCost,
    };
  }

  /**
   * Async version of analyzeDelta — used when gasEstimatorFn is set.
   * Mirrors analyzeDelta but awaits the gas estimate for L1+L2 breakdown.
   */
  private async analyzeDeltaAsync(delta: PriceDelta): Promise<ArbitrageOpportunity | null> {
    // Skip if either pool is stale
    if (this.isPoolStale(delta.buyPool) || this.isPoolStale(delta.sellPool)) {
      this.emit(
        "opportunityRejected",
        "Pool marked as stale",
        delta,
      );
      return null;
    }

    const path = this.buildSwapPath(delta);

    // Optimize input amount based on pool depth
    let inputAmount: number;
    let optimizationResult: OptimizationResult | undefined;

    // Check if we have reserve data for optimization
    const hasReserveData = path.steps.some(
      (s) => s.virtualReserveIn !== undefined && s.virtualReserveIn > 0,
    );

    if (hasReserveData) {
      const profitFn = this.buildProfitFunction(path);
      // Cap search range to 30% of buy pool depth to avoid testing absurd sizes
      const reserveCap = this.computeReserveCap(path);
      optimizationResult = this.optimizer.optimize(path, profitFn, reserveCap);
      inputAmount = optimizationResult.optimalAmount;

      // Optimizer exhausted search range without finding any profitable size — skip early.
      if (optimizationResult.fallbackReason === "no_profitable_size") {
        this.emit("opportunityRejected", "No profitable input size found", delta);
        return null;
      }
    } else {
      // No reserve data: fall back to fixed amount
      inputAmount = this.config.defaultInputAmount;
    }

    // Apply per-DEX max input cap (for pools without reserve data like TJ LB)
    const dexCap = this.getDexInputCap(path);
    if (dexCap !== undefined && inputAmount > dexCap) {
      inputAmount = dexCap;
    }

    const grossProfit = this.calculateGrossProfit(path, inputAmount);
    const costs = await this.estimateCostsWithL1(path, inputAmount);
    const netProfit = grossProfit - costs.totalCost;
    const netProfitPercent = (netProfit / inputAmount) * 100;

    // Apply higher thresholds for risky DEXes
    // Ramses: 2x threshold (fee manipulation risk)
    // Trader Joe LB: 1.33x threshold (fee volatility)
    let effectiveThreshold = this.config.minProfitThreshold;
    let thresholdLabel = "";

    if (this.involvesRamses(delta)) {
      effectiveThreshold = this.config.minProfitThreshold * 2;
      thresholdLabel = " (2x for Ramses)";
    } else if (this.usesTraderJoeLB(path)) {
      effectiveThreshold = this.config.minProfitThreshold * 1.33;
      thresholdLabel = " (1.33x for Trader Joe LB)";
    }

    if (netProfit < effectiveThreshold) {
      this.emit(
        "opportunityRejected",
        `Net profit ${netProfit.toFixed(6)} below threshold ${effectiveThreshold.toFixed(6)}${thresholdLabel}`,
        delta,
      );
      return null;
    }

    const opportunity: ArbitrageOpportunity = {
      id: randomUUID(),
      path,
      inputAmount,
      optimizationResult,
      grossProfit,
      costs,
      netProfit,
      netProfitPercent,
      priceDelta: delta,
      blockNumber: delta.buyPool.blockNumber,
      timestamp: Date.now(),
    };

    this.emit("opportunityFound", opportunity);
    return opportunity;
  }

  /**
   * Build a swap path from a price delta.
   * For a simple 2-pool delta: buy on cheap DEX, sell on expensive DEX.
   */
  buildSwapPath(delta: PriceDelta): SwapPath {
    const { buyPool, sellPool } = delta;

    // Step 1: Buy token0 on the cheap pool (swap token1 → token0)
    const buyStep: SwapStep = {
      dex: buyPool.pool.dex,
      poolAddress: buyPool.pool.poolAddress,
      tokenIn: buyPool.pool.token1,
      tokenOut: buyPool.pool.token0,
      decimalsIn: buyPool.pool.decimals1,
      decimalsOut: buyPool.pool.decimals0,
      expectedPrice: buyPool.inversePrice,
      feeTier: buyPool.pool.feeTier,
      virtualReserveIn: this.computeVirtualReserveIn(
        delta.buyPool, buyPool.pool.token1, buyPool.pool.decimals1,
      ),
    };

    // Step 2: Sell token0 on the expensive pool (swap token0 → token1)
    const sellStep: SwapStep = {
      dex: sellPool.pool.dex,
      poolAddress: sellPool.pool.poolAddress,
      tokenIn: sellPool.pool.token0,
      tokenOut: sellPool.pool.token1,
      decimalsIn: sellPool.pool.decimals0,
      decimalsOut: sellPool.pool.decimals1,
      expectedPrice: sellPool.price,
      feeTier: sellPool.pool.feeTier,
      virtualReserveIn: this.computeVirtualReserveIn(
        delta.sellPool, sellPool.pool.token0, sellPool.pool.decimals0,
      ),
    };

    return {
      steps: [buyStep, sellStep],
      baseToken: buyPool.pool.token1,
      label: `${buyPool.pool.label} → ${sellPool.pool.label}`,
    };
  }

  /**
   * Build a triangular arbitrage path: A → B → C → A.
   * Takes three price snapshots forming a triangle.
   */
  buildTriangularPath(
    snapAB: PriceSnapshot,
    snapBC: PriceSnapshot,
    snapCA: PriceSnapshot,
  ): SwapPath {
    const stepAB: SwapStep = {
      dex: snapAB.pool.dex,
      poolAddress: snapAB.pool.poolAddress,
      tokenIn: snapAB.pool.token0,
      tokenOut: snapAB.pool.token1,
      decimalsIn: snapAB.pool.decimals0,
      decimalsOut: snapAB.pool.decimals1,
      expectedPrice: snapAB.price,
      feeTier: snapAB.pool.feeTier,
    };

    const stepBC: SwapStep = {
      dex: snapBC.pool.dex,
      poolAddress: snapBC.pool.poolAddress,
      tokenIn: snapBC.pool.token0,
      tokenOut: snapBC.pool.token1,
      decimalsIn: snapBC.pool.decimals0,
      decimalsOut: snapBC.pool.decimals1,
      expectedPrice: snapBC.price,
      feeTier: snapBC.pool.feeTier,
    };

    const stepCA: SwapStep = {
      dex: snapCA.pool.dex,
      poolAddress: snapCA.pool.poolAddress,
      tokenIn: snapCA.pool.token0,
      tokenOut: snapCA.pool.token1,
      decimalsIn: snapCA.pool.decimals0,
      decimalsOut: snapCA.pool.decimals1,
      expectedPrice: snapCA.price,
      feeTier: snapCA.pool.feeTier,
    };

    return {
      steps: [stepAB, stepBC, stepCA],
      baseToken: snapAB.pool.token0,
      label: `${snapAB.pool.label} → ${snapBC.pool.label} → ${snapCA.pool.label}`,
    };
  }

  /**
   * Calculate gross profit for a swap path (before non-trading costs).
   * Deducts DEX trading fees from each swap step, since fees reduce actual output.
   *
   * For a 2-step path (buy low, sell high):
   *   output = input * (1 - fee1) * price1 * (1 - fee2) * price2
   *   gross = output - input
   */
  calculateGrossProfit(path: SwapPath, inputAmount: number): number {
    // Chain prices through the path, deducting DEX trading fees at each step
    let amount = inputAmount;
    for (const step of path.steps) {
      const feeRate = this.getSwapFeeRate(step);
      amount = amount * (1 - feeRate) * step.expectedPrice;
    }

    // Gross profit = final amount - initial amount
    return amount - inputAmount;
  }

  /**
   * Get the trading fee rate for a swap step.
   * V3 pools: feeTier is in hundredths of a bip (500 = 0.05%, 3000 = 0.3%, 10000 = 1%)
   * V2/Camelot V2 pools: standard 0.3% fee
   * Trader Joe LB: feeTier is binStep in basis points (15 = 0.15%, 25 = 0.25%)
   *   PLUS 50% buffer to account for volatility accumulator
   */
  private getSwapFeeRate(step: SwapStep): number {
    if (step.dex === "traderjoe_lb") {
      // LB: feeTier is binStep in basis points
      // Apply 50% buffer: effective fee = base fee * 1.5
      if (step.feeTier === undefined) {
        throw new Error("Trader Joe LB swap step missing feeTier (binStep)");
      }
      const baseFee = step.feeTier / 10_000; // Convert basis points to decimal
      return baseFee * 1.5; // 50% buffer
    }

    if (step.feeTier !== undefined) {
      // UniV3/SushiV3/CamelotV3: feeTier in hundredths of a bip
      return step.feeTier / 1_000_000;
    }
    // V2-style pools (SushiSwap V2, Camelot V2, Uniswap V2): standard 0.3%
    return 0.003;
  }

  /**
   * Estimate all costs for executing an arbitrage path.
   */
  estimateCosts(path: SwapPath, inputAmount: number): CostEstimate {
    const flashLoanFee = this.estimateFlashLoanFee(inputAmount);
    const gasCost = this.estimateGasCost(path.steps.length);
    const slippageCost = this.estimateSlippage(path, inputAmount);

    return {
      flashLoanFee,
      gasCost,
      slippageCost,
      totalCost: flashLoanFee + gasCost + slippageCost,
    };
  }

  /**
   * Estimate flash loan fee.
   * Uses the cheapest available provider (dYdX/Balancer = 0, Aave = 0.05%).
   */
  estimateFlashLoanFee(inputAmount: number): number {
    const fees = this.config.flashLoanFees;
    // Pick the cheapest provider
    const minFeeRate = Math.min(fees.aaveV3, fees.dydx, fees.balancer);
    return inputAmount * minFeeRate;
  }

  /**
   * Estimate gas cost in ETH for a given number of swap steps.
   * gas cost = (gasPerSwap * numSteps + baseGas) * gasPriceGwei / 1e9
   */
  estimateGasCost(numSwaps: number): number {
    const BASE_GAS = 21_000; // base transaction gas
    const totalGas = BASE_GAS + this.config.gasPerSwap * numSwaps;
    return (totalGas * this.config.gasPriceGwei) / 1e9;
  }

  /**
   * Estimate slippage cost using pool-aware AMM simulation when reserve data
   * is available, otherwise falls back to the static maxSlippage model.
   *
   * Pool-aware mode compares spot output (no price impact) vs AMM-simulated
   * output (with constant-product price impact). The difference is the slippage cost.
   *
   * For V2 pools: uses actual reserves from getReserves()
   * For V3 pools: uses virtual reserves computed from liquidity L and sqrtPriceX96
   */
  estimateSlippage(path: SwapPath, inputAmount: number): number {
    const hasReserveData = path.steps.some(
      (s) => s.virtualReserveIn !== undefined && s.virtualReserveIn > 0,
    );

    if (!hasReserveData) {
      // Fallback: static slippage model (compound across steps)
      const slippageMultiplier =
        1 - (1 - this.config.maxSlippage) ** path.steps.length;
      return inputAmount * slippageMultiplier;
    }

    // Pool-aware: simulate AMM output and compare to spot output
    const grossProfit = this.calculateGrossProfit(path, inputAmount);
    const spotOutput = inputAmount + grossProfit;

    // Trace through each step with AMM price impact
    let amount = inputAmount;
    for (const step of path.steps) {
      const feeRate = this.getSwapFeeRate(step);
      const amountAfterFee = amount * (1 - feeRate);

      if (step.virtualReserveIn !== undefined && step.virtualReserveIn > 0) {
        // AMM constant-product impact: actual output < spot output
        // impact = amountIn / (reserveIn + amountIn)
        const impact = amountAfterFee / (step.virtualReserveIn + amountAfterFee);
        amount = amountAfterFee * (1 - impact) * step.expectedPrice;
      } else {
        // No reserve data for this step: assume no additional impact
        amount = amountAfterFee * step.expectedPrice;
      }
    }

    const slippageCost = spotOutput - amount;
    return Math.max(0, slippageCost);
  }

  /**
   * Get the minimum per-DEX input cap across all steps in a path.
   * Returns undefined if no step's DEX has a cap configured.
   */
  private getDexInputCap(path: SwapPath): number | undefined {
    let minCap: number | undefined;
    for (const step of path.steps) {
      const cap = this.maxInputByDex[step.dex];
      if (cap !== undefined) {
        if (minCap === undefined || cap < minCap) {
          minCap = cap;
        }
      }
    }
    return minCap;
  }

  /**
   * Compute a reserve-based cap for the optimizer search range.
   * Returns the minimum virtual reserve across all steps (scaled to 30% of depth),
   * or undefined if no reserve data is available.
   *
   * Prevents the optimizer from testing absurd input sizes on thin pools
   * (e.g., 500 ETH on a pool with only 8.3 WETH liquidity).
   */
  private computeReserveCap(path: SwapPath): number | undefined {
    let minReserve: number | undefined;
    let hasUnknownStep = false;

    for (const step of path.steps) {
      if (step.virtualReserveIn !== undefined && step.virtualReserveIn > 0) {
        if (minReserve === undefined || step.virtualReserveIn < minReserve) {
          minReserve = step.virtualReserveIn;
        }
      } else {
        hasUnknownStep = true;
      }
    }

    // If any step lacks reserve data, apply per-DEX cap as conservative bound
    if (hasUnknownStep) {
      const dexCap = this.getDexInputCap(path);
      if (dexCap !== undefined) {
        if (minReserve === undefined || dexCap < minReserve * 0.3) {
          return dexCap;
        }
      }
      // If no per-DEX cap and no reserve data at all, return undefined (fallback to default)
      if (minReserve === undefined) return undefined;
    }

    // Cap at 30% of the shallowest pool's depth
    return minReserve! * 0.3;
  }

  /** Check if a pool is marked as stale */
  private isPoolStale(snapshot: PriceSnapshot): boolean {
    return this.stalePools.has(snapshot.pool.poolAddress.toLowerCase());
  }

  /**
   * Build a profit function for input optimization.
   * Wraps existing cost estimation logic to compute net profit for any input amount.
   */
  private buildProfitFunction(path: SwapPath): (inputAmount: number) => number {
    return (inputAmount: number) => {
      const grossProfit = this.calculateGrossProfit(path, inputAmount);
      const costs = this.estimateCosts(path, inputAmount);
      return grossProfit - costs.totalCost;
    };
  }

  /**
   * Compute the virtual reserve of the input token for slippage estimation.
   *
   * V2 pools: uses actual reserves from getReserves()
   * V3 pools: computes virtual reserves from in-range liquidity L and sqrtPriceX96
   *   - token0 virtual reserve = L / sqrt(P)
   *   - token1 virtual reserve = L * sqrt(P)
   *
   * Returns undefined when reserve data is not available (falls back to static slippage).
   */
  private computeVirtualReserveIn(
    snapshot: PriceSnapshot,
    tokenIn: string,
    decimalsIn: number,
  ): number | undefined {
    const pool = snapshot.pool;

    // V2: use actual reserves
    if (snapshot.reserves) {
      const isToken0 = tokenIn.toLowerCase() === pool.token0.toLowerCase();
      const reserveRaw = isToken0 ? snapshot.reserves[0] : snapshot.reserves[1];
      return Number(reserveRaw) / 10 ** decimalsIn;
    }

    // V3: compute virtual reserves from L and sqrtPriceX96
    if (snapshot.liquidity !== undefined && snapshot.sqrtPriceX96 !== undefined) {
      const L = Number(snapshot.liquidity);
      const Q96 = Number(2n ** 96n);
      const sqrtP = Number(snapshot.sqrtPriceX96) / Q96;
      if (sqrtP === 0 || L === 0) return undefined;

      const isToken0 = tokenIn.toLowerCase() === pool.token0.toLowerCase();
      if (isToken0) {
        // x_virtual = L / sqrtP (raw token0 units)
        return (L / sqrtP) / 10 ** decimalsIn;
      } else {
        // y_virtual = L * sqrtP (raw token1 units)
        return (L * sqrtP) / 10 ** decimalsIn;
      }
    }

    return undefined;
  }
}
