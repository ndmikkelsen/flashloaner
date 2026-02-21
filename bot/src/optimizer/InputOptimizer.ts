import type { PriceSnapshot } from "../monitor/types.js";
import type { SwapPath, SwapStep } from "../detector/types.js";
import type { InputOptimizerConfig, OptimizationResult } from "./types.js";

/**
 * Computes optimal trade size per opportunity using ternary search over pool liquidity depth.
 * Uses constant-product formula for V2 pools and virtual reserve approximation for V3 pools.
 * Completes within 100ms or falls back to conservative fixed size.
 */
export class InputOptimizer {
  private readonly config: Required<InputOptimizerConfig>;

  constructor(config: InputOptimizerConfig = {}) {
    this.config = {
      maxIterations: config.maxIterations ?? 20,
      timeoutMs: config.timeoutMs ?? 100,
      fallbackAmount: config.fallbackAmount ?? 10,
      minAmount: config.minAmount ?? 1,
      maxAmount: config.maxAmount ?? 1000,
      convergenceThreshold: config.convergenceThreshold ?? 1.0,
    };
  }

  /**
   * Compute optimal input amount for a swap path.
   * Uses ternary search to maximize net profit over the input amount space.
   */
  optimize(
    path: SwapPath,
    profitFunction: (inputAmount: number) => number,
  ): OptimizationResult {
    const startTime = Date.now();

    let left = this.config.minAmount;
    let right = this.config.maxAmount;
    let iterations = 0;
    let bestAmount = this.config.fallbackAmount;
    let bestProfit = profitFunction(bestAmount);
    let convergedEarly = false;

    // Ternary search: find maximum of unimodal profit function
    while (iterations < this.config.maxIterations) {
      // Check timeout
      if (Date.now() - startTime > this.config.timeoutMs) {
        return {
          optimalAmount: this.config.fallbackAmount,
          expectedProfit: profitFunction(this.config.fallbackAmount),
          iterations,
          durationMs: Date.now() - startTime,
          converged: false,
          fallbackReason: "timeout",
        };
      }

      // Check convergence
      if (right - left < this.config.convergenceThreshold) {
        convergedEarly = true;
        break;
      }

      // Ternary search iteration
      const mid1 = left + (right - left) / 3;
      const mid2 = right - (right - left) / 3;

      const profit1 = profitFunction(mid1);
      const profit2 = profitFunction(mid2);

      // Track best seen so far
      if (profit1 > bestProfit) {
        bestProfit = profit1;
        bestAmount = mid1;
      }
      if (profit2 > bestProfit) {
        bestProfit = profit2;
        bestAmount = mid2;
      }

      // Narrow search space
      if (profit1 < profit2) {
        left = mid1;
      } else {
        right = mid2;
      }

      iterations++;
    }

    const durationMs = Date.now() - startTime;

    // Check if no profitable size exists (check this first - it's a more critical failure)
    if (bestProfit <= 0) {
      return {
        optimalAmount: this.config.fallbackAmount,
        expectedProfit: profitFunction(this.config.fallbackAmount),
        iterations,
        durationMs,
        converged: false,
        fallbackReason: "no_profitable_size",
      };
    }

    // Check if we hit iteration cap without converging
    if (!convergedEarly && iterations >= this.config.maxIterations) {
      return {
        optimalAmount: bestAmount,
        expectedProfit: bestProfit,
        iterations,
        durationMs,
        converged: false,
        fallbackReason: "max_iterations",
      };
    }

    // Success: converged to optimal amount
    return {
      optimalAmount: bestAmount,
      expectedProfit: bestProfit,
      iterations,
      durationMs,
      converged: true,
    };
  }

  /**
   * Compute virtual reserve for a swap step.
   * V2: uses actual reserves from getReserves()
   * V3: computes virtual reserves from L and sqrtPriceX96
   */
  computeVirtualReserve(
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
