import { describe, it, expect, vi } from "vitest";
import { InputOptimizer } from "../../src/optimizer/InputOptimizer.js";
import type { SwapPath } from "../../src/detector/types.js";
import type { PriceSnapshot, PoolConfig } from "../../src/monitor/types.js";

// Helper to create mock SwapPath
function makeSwapPath(): SwapPath {
  return {
    steps: [],
    baseToken: "0x0000000000000000000000000000000000000000",
    label: "Test path",
  };
}

// Helper to create mock PriceSnapshot
function makeSnapshot(opts: {
  reserves?: [bigint, bigint];
  liquidity?: bigint;
  sqrtPriceX96?: bigint;
}): PriceSnapshot {
  return {
    pool: {
      label: "Test pool",
      dex: "uniswap_v2",
      poolAddress: "0x0000000000000000000000000000000000000001",
      token0: "0x0000000000000000000000000000000000000002",
      token1: "0x0000000000000000000000000000000000000003",
      decimals0: 18,
      decimals1: 18,
    },
    price: 1.0,
    inversePrice: 1.0,
    blockNumber: 1000000,
    timestamp: Date.now(),
    ...opts,
  };
}

describe("InputOptimizer", () => {
  describe("construction", () => {
    it("should use default config values", () => {
      const optimizer = new InputOptimizer();
      const path = makeSwapPath();

      // Test that defaults are applied by checking behavior
      const result = optimizer.optimize(path, (x) => 100 - x); // linear decreasing
      expect(result.optimalAmount).toBeGreaterThanOrEqual(1); // default minAmount
    });

    it("should accept custom config", () => {
      const optimizer = new InputOptimizer({
        maxIterations: 5,
        timeoutMs: 200,
        fallbackAmount: 20,
        minAmount: 5,
        maxAmount: 500,
        convergenceThreshold: 0.001,
      });
      const path = makeSwapPath();

      const result = optimizer.optimize(path, (x) => 100 - Math.abs(x - 50));
      expect(result.iterations).toBeLessThanOrEqual(5);
      expect(result.durationMs).toBeLessThan(200);
    });
  });

  describe("optimize with simple profit function", () => {
    it("should find optimal for convex profit function", () => {
      const optimizer = new InputOptimizer();
      const path = makeSwapPath();

      // Convex function: -(x-50)^2 + 100, maximum at x=50
      const profitFn = (x: number) => -Math.pow(x - 50, 2) + 100;

      const result = optimizer.optimize(path, profitFn);

      expect(result.converged).toBe(true);
      expect(result.optimalAmount).toBeCloseTo(50, 0); // within 1 unit
      expect(result.expectedProfit).toBeCloseTo(100, 0);
      expect(result.iterations).toBeGreaterThan(0);
      expect(result.iterations).toBeLessThanOrEqual(20);
    });

    it("should find boundary for linear profit function", () => {
      const optimizer = new InputOptimizer({ minAmount: 1, maxAmount: 100 });
      const path = makeSwapPath();

      // Linear increasing: optimal is at boundary (maxAmount)
      const profitFn = (x: number) => x * 0.1;

      const result = optimizer.optimize(path, profitFn);

      expect(result.converged).toBe(true);
      expect(result.optimalAmount).toBeCloseTo(100, 0); // within 1 unit (convergence threshold)
    });

    it("should converge for constant profit function", () => {
      const optimizer = new InputOptimizer();
      const path = makeSwapPath();

      // Constant function: all points are equally optimal
      const profitFn = () => 50;

      const result = optimizer.optimize(path, profitFn);

      expect(result.converged).toBe(true);
      expect(result.expectedProfit).toBe(50);
    });
  });

  describe("optimize with iteration cap", () => {
    it("should respect maxIterations limit", () => {
      const optimizer = new InputOptimizer({ maxIterations: 1 });
      const path = makeSwapPath();

      // Use a profit function that's always positive to test iteration cap
      // (not no_profitable_size)
      const profitFn = (x: number) => 100 - x * 0.01; // always positive for x < 10000

      const result = optimizer.optimize(path, profitFn);

      expect(result.iterations).toBe(1);
      expect(result.converged).toBe(false);
      expect(result.fallbackReason).toBe("max_iterations");
      expect(result.optimalAmount).toBeGreaterThan(0); // should still have best seen amount
    });
  });

  describe("optimize with timeout", () => {
    it("should timeout on slow profit function", () => {
      const optimizer = new InputOptimizer({ timeoutMs: 10 });
      const path = makeSwapPath();

      // Slow profit function with artificial delay
      const profitFn = (x: number) => {
        const start = Date.now();
        while (Date.now() - start < 5) {
          // busy wait for 5ms per evaluation
        }
        return -Math.pow(x - 50, 2) + 100;
      };

      const result = optimizer.optimize(path, profitFn);

      expect(result.converged).toBe(false);
      expect(result.fallbackReason).toBe("timeout");
      expect(result.optimalAmount).toBe(10); // fallbackAmount
      expect(result.durationMs).toBeGreaterThan(10);
    });
  });

  describe("optimize with no profitable size", () => {
    it("should detect negative profit and fallback", () => {
      const optimizer = new InputOptimizer({ fallbackAmount: 15 });
      const path = makeSwapPath();

      // Always negative profit
      const profitFn = (x: number) => -x - 10;

      const result = optimizer.optimize(path, profitFn);

      expect(result.converged).toBe(false);
      expect(result.fallbackReason).toBe("no_profitable_size");
      expect(result.optimalAmount).toBe(15); // fallbackAmount
    });
  });

  describe("optimize convergence", () => {
    it("should converge within 20 iterations for normal function", () => {
      const optimizer = new InputOptimizer({ maxIterations: 20 });
      const path = makeSwapPath();

      // Convex function
      const profitFn = (x: number) => -Math.pow(x - 75, 2) + 200;

      const result = optimizer.optimize(path, profitFn);

      expect(result.converged).toBe(true);
      expect(result.iterations).toBeLessThanOrEqual(20);
      expect(result.optimalAmount).toBeCloseTo(75, 1);
      expect(result.expectedProfit).toBeCloseTo(200, 1);
      expect(result.fallbackReason).toBeUndefined();
    });
  });

  describe("computeVirtualReserve for V2 pools", () => {
    it("should compute reserve for token0 input", () => {
      const optimizer = new InputOptimizer();
      const snapshot = makeSnapshot({
        reserves: [BigInt(100e18), BigInt(200e18)], // 100 token0, 200 token1
      });

      const reserve = optimizer.computeVirtualReserve(
        snapshot,
        snapshot.pool.token0,
        18
      );

      expect(reserve).toBeCloseTo(100, 1);
    });

    it("should compute reserve for token1 input", () => {
      const optimizer = new InputOptimizer();
      const snapshot = makeSnapshot({
        reserves: [BigInt(100e18), BigInt(200e18)],
      });

      const reserve = optimizer.computeVirtualReserve(
        snapshot,
        snapshot.pool.token1,
        18
      );

      expect(reserve).toBeCloseTo(200, 1);
    });

    it("should handle case insensitive address matching", () => {
      const optimizer = new InputOptimizer();
      const snapshot = makeSnapshot({
        reserves: [BigInt(100e18), BigInt(200e18)],
      });

      // Use uppercase version of token0
      const reserve = optimizer.computeVirtualReserve(
        snapshot,
        snapshot.pool.token0.toUpperCase(),
        18
      );

      expect(reserve).toBeCloseTo(100, 1);
    });
  });

  describe("computeVirtualReserve for V3 pools", () => {
    it("should compute virtual reserve for token0 input", () => {
      const optimizer = new InputOptimizer();
      const L = BigInt(1e18); // 1e18 liquidity
      const sqrtPriceX96 = BigInt(79228162514264337593543950336n); // sqrt(1) * 2^96

      const snapshot = makeSnapshot({
        liquidity: L,
        sqrtPriceX96,
      });

      const reserve = optimizer.computeVirtualReserve(
        snapshot,
        snapshot.pool.token0,
        18
      );

      // x_virtual = L / sqrtP = 1e18 / 1 = 1e18
      expect(reserve).toBeCloseTo(1, 0.1);
    });

    it("should compute virtual reserve for token1 input", () => {
      const optimizer = new InputOptimizer();
      const L = BigInt(1e18);
      const sqrtPriceX96 = BigInt(79228162514264337593543950336n); // sqrt(1) * 2^96

      const snapshot = makeSnapshot({
        liquidity: L,
        sqrtPriceX96,
      });

      const reserve = optimizer.computeVirtualReserve(
        snapshot,
        snapshot.pool.token1,
        18
      );

      // y_virtual = L * sqrtP = 1e18 * 1 = 1e18
      expect(reserve).toBeCloseTo(1, 0.1);
    });

    it("should return undefined when L=0", () => {
      const optimizer = new InputOptimizer();
      const snapshot = makeSnapshot({
        liquidity: 0n,
        sqrtPriceX96: BigInt(79228162514264337593543950336n),
      });

      const reserve = optimizer.computeVirtualReserve(
        snapshot,
        snapshot.pool.token0,
        18
      );

      expect(reserve).toBeUndefined();
    });

    it("should return undefined when sqrtP=0", () => {
      const optimizer = new InputOptimizer();
      const snapshot = makeSnapshot({
        liquidity: BigInt(1e18),
        sqrtPriceX96: 0n,
      });

      const reserve = optimizer.computeVirtualReserve(
        snapshot,
        snapshot.pool.token0,
        18
      );

      expect(reserve).toBeUndefined();
    });
  });

  describe("computeVirtualReserve fallback", () => {
    it("should return undefined when no reserve data available", () => {
      const optimizer = new InputOptimizer();
      const snapshot = makeSnapshot({}); // no reserves, no liquidity/sqrtPrice

      const reserve = optimizer.computeVirtualReserve(
        snapshot,
        snapshot.pool.token0,
        18
      );

      expect(reserve).toBeUndefined();
    });
  });

  describe("maxAmountOverride (reserve-based capping)", () => {
    it("should cap search range when maxAmountOverride is provided", () => {
      const optimizer = new InputOptimizer({ minAmount: 1, maxAmount: 1000 });
      const path = makeSwapPath();

      // Linear profit: optimal is at the upper bound. Without cap, optimal is 1000.
      // With cap at 2.5, optimal should be at or near 2.5.
      const profitFn = (x: number) => x * 0.01;

      const resultCapped = optimizer.optimize(path, profitFn, 2.5);
      const resultUncapped = optimizer.optimize(path, profitFn);

      expect(resultCapped.converged).toBe(true);
      expect(resultCapped.optimalAmount).toBeLessThanOrEqual(2.5);
      expect(resultCapped.optimalAmount).toBeGreaterThanOrEqual(1);
      // Uncapped should find much larger amount
      expect(resultUncapped.optimalAmount).toBeGreaterThan(100);
    });

    it("should use config maxAmount when override is larger", () => {
      const optimizer = new InputOptimizer({ minAmount: 1, maxAmount: 100 });
      const path = makeSwapPath();

      // Override is larger than config: config wins (min of the two)
      const profitFn = (x: number) => -Math.pow(x - 50, 2) + 100;

      const result = optimizer.optimize(path, profitFn, 500);

      expect(result.converged).toBe(true);
      // Should find the peak at 50, constrained by config maxAmount=100
      expect(result.optimalAmount).toBeCloseTo(50, 0);
    });

    it("should ignore override when undefined", () => {
      const optimizer = new InputOptimizer({ minAmount: 1, maxAmount: 1000 });
      const path = makeSwapPath();

      const profitFn = (x: number) => -Math.pow(x - 500, 2) + 100;

      const result = optimizer.optimize(path, profitFn, undefined);

      expect(result.converged).toBe(true);
      expect(result.optimalAmount).toBeCloseTo(500, 0);
    });
  });

  describe("realistic profit function with slippage", () => {
    it("should find optimal with slippage-based profit function", () => {
      const optimizer = new InputOptimizer({ minAmount: 1, maxAmount: 200 });
      const path = makeSwapPath();

      // Simulate: gross profit increases linearly, slippage increases quadratically
      const profitFn = (x: number) => {
        const grossProfit = x * 0.01; // 1% spread
        const slippage = x * x * 0.0001; // quadratic slippage
        return grossProfit - slippage;
      };

      const result = optimizer.optimize(path, profitFn);

      expect(result.converged).toBe(true);
      // Optimal at x = 0.01 / (2 * 0.0001) = 50
      expect(result.optimalAmount).toBeCloseTo(50, 0); // within 1 unit (convergence threshold)
      expect(result.expectedProfit).toBeGreaterThan(0);

      // Verify it's actually optimal by checking nearby points
      const optimalProfit = profitFn(result.optimalAmount);
      expect(profitFn(result.optimalAmount - 5)).toBeLessThan(optimalProfit);
      expect(profitFn(result.optimalAmount + 5)).toBeLessThan(optimalProfit);
    });
  });
});
