import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { PriceDelta, PriceSnapshot } from "../monitor/types.js";
import type { PriceMonitor } from "../monitor/PriceMonitor.js";
import type {
  ArbitrageOpportunity,
  CostEstimate,
  FlashLoanFees,
  OpportunityDetectorConfig,
  SwapPath,
  SwapStep,
} from "./types.js";

/** Safely coerce an unknown caught value to an Error */
function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

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
  private readonly config: Required<Omit<OpportunityDetectorConfig, "flashLoanFees" | "gasEstimatorFn">> & {
    flashLoanFees: FlashLoanFees;
  };
  private gasEstimatorFn: ((numSwaps: number) => Promise<{ gasCost: number; l1DataFee?: number }>) | undefined;
  private monitor: PriceMonitor | null = null;
  private stalePools = new Set<string>();

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
    const inputAmount = this.config.defaultInputAmount;
    const grossProfit = this.calculateGrossProfit(path, inputAmount);
    const costs = this.estimateCosts(path, inputAmount);
    const netProfit = grossProfit - costs.totalCost;
    const netProfitPercent = (netProfit / inputAmount) * 100;

    if (netProfit < this.config.minProfitThreshold) {
      this.emit(
        "opportunityRejected",
        `Net profit ${netProfit.toFixed(6)} below threshold ${this.config.minProfitThreshold}`,
        delta,
      );
      return null;
    }

    const opportunity: ArbitrageOpportunity = {
      id: randomUUID(),
      path,
      inputAmount,
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
    const inputAmount = this.config.defaultInputAmount;
    const grossProfit = this.calculateGrossProfit(path, inputAmount);
    const costs = await this.estimateCostsWithL1(path, inputAmount);
    const netProfit = grossProfit - costs.totalCost;
    const netProfitPercent = (netProfit / inputAmount) * 100;

    if (netProfit < this.config.minProfitThreshold) {
      this.emit(
        "opportunityRejected",
        `Net profit ${netProfit.toFixed(6)} below threshold ${this.config.minProfitThreshold}`,
        delta,
      );
      return null;
    }

    const opportunity: ArbitrageOpportunity = {
      id: randomUUID(),
      path,
      inputAmount,
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
   * Calculate gross profit for a swap path (before costs).
   * For a 2-step path (buy low, sell high):
   *   gross = inputAmount * (sellPrice / buyPrice - 1)
   * For multi-hop: chain the expected prices.
   */
  calculateGrossProfit(path: SwapPath, inputAmount: number): number {
    // Chain prices through the path to get output amount
    let amount = inputAmount;
    for (const step of path.steps) {
      amount = amount * step.expectedPrice;
    }

    // Gross profit = final amount - initial amount
    return amount - inputAmount;
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
   * Estimate slippage cost based on configured max slippage.
   * Conservative estimate: assume we lose maxSlippage on each step.
   */
  estimateSlippage(path: SwapPath, inputAmount: number): number {
    // Compound slippage across all steps
    const slippageMultiplier =
      1 - (1 - this.config.maxSlippage) ** path.steps.length;
    return inputAmount * slippageMultiplier;
  }

  /** Check if a pool is marked as stale */
  private isPoolStale(snapshot: PriceSnapshot): boolean {
    return this.stalePools.has(snapshot.pool.poolAddress.toLowerCase());
  }
}
