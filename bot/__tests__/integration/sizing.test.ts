import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { OpportunityDetector } from "../../src/detector/OpportunityDetector.js";
import type { ArbitrageOpportunity } from "../../src/detector/types.js";
import type { PriceDelta, PoolConfig } from "../../src/monitor/types.js";

/**
 * Integration tests for optimal input sizing end-to-end flow.
 * Validates that OpportunityDetector with InputOptimizer produces
 * varying input amounts based on pool depth and reserve data.
 */
describe("Optimal Input Sizing Integration", () => {
  let detector: OpportunityDetector;
  const opportunities: ArbitrageOpportunity[] = [];

  beforeEach(() => {
    opportunities.length = 0;
  });

  afterEach(() => {
    detector?.detach();
  });

  it("should produce varying input amounts across deep and thin pools", () => {
    // Setup detector with default input = 10
    detector = new OpportunityDetector({
      minProfitThreshold: 0,
      gasPriceGwei: 0,
      maxSlippage: 0.005,
      defaultInputAmount: 10,
    });
    detector.on("error", () => {});
    detector.on("opportunityFound", (opp) => opportunities.push(opp));

    // Simulate two deltas: one with deep pool, one with thin pool

    // Deep pool delta (large reserves → expect larger input amount)
    const deepBuyPool: PoolConfig = {
      label: "WETH/USDC UniV2 (Deep)",
      dex: "uniswap_v2",
      poolAddress: "0x0000000000000000000000000000000000000001",
      token0: "0x0000000000000000000000000000000000000010",
      token1: "0x0000000000000000000000000000000000000020",
      decimals0: 18,
      decimals1: 6,
    };

    const deepSellPool: PoolConfig = {
      label: "WETH/USDC Sushi (Deep)",
      dex: "sushiswap",
      poolAddress: "0x0000000000000000000000000000000000000002",
      token0: "0x0000000000000000000000000000000000000010",
      token1: "0x0000000000000000000000000000000000000020",
      decimals0: 18,
      decimals1: 6,
    };

    const deepDelta: PriceDelta = {
      pair: "0x0000000000000000000000000000000000000010/0x0000000000000000000000000000000000000020",
      buyPool: {
        pool: deepBuyPool,
        price: 2000,
        inversePrice: 1 / 2000,
        blockNumber: 19_000_000,
        timestamp: Date.now(),
        reserves: [
          BigInt("10000000000000000000000"), // 10,000 WETH
          BigInt("20000000000000"), // 20,000,000 USDC
        ],
      },
      sellPool: {
        pool: deepSellPool,
        price: 2050,
        inversePrice: 1 / 2050,
        blockNumber: 19_000_000,
        timestamp: Date.now(),
        reserves: [
          BigInt("10000000000000000000000"), // 10,000 WETH
          BigInt("20500000000000"), // 20,500,000 USDC
        ],
      },
      deltaPercent: 2.5,
      timestamp: Date.now(),
    };

    // Thin pool delta (small reserves → expect smaller input amount)
    const thinBuyPool: PoolConfig = {
      label: "WETH/USDC UniV2 (Thin)",
      dex: "uniswap_v2",
      poolAddress: "0x0000000000000000000000000000000000000003",
      token0: "0x0000000000000000000000000000000000000010",
      token1: "0x0000000000000000000000000000000000000020",
      decimals0: 18,
      decimals1: 6,
    };

    const thinSellPool: PoolConfig = {
      label: "WETH/USDC Sushi (Thin)",
      dex: "sushiswap",
      poolAddress: "0x0000000000000000000000000000000000000004",
      token0: "0x0000000000000000000000000000000000000010",
      token1: "0x0000000000000000000000000000000000000020",
      decimals0: 18,
      decimals1: 6,
    };

    const thinDelta: PriceDelta = {
      pair: "0x0000000000000000000000000000000000000010/0x0000000000000000000000000000000000000020",
      buyPool: {
        pool: thinBuyPool,
        price: 2000,
        inversePrice: 1 / 2000,
        blockNumber: 19_000_000,
        timestamp: Date.now(),
        reserves: [
          BigInt("10000000000000000000"), // 10 WETH
          BigInt("20000000000"), // 20,000 USDC
        ],
      },
      sellPool: {
        pool: thinSellPool,
        price: 2020,
        inversePrice: 1 / 2020,
        blockNumber: 19_000_000,
        timestamp: Date.now(),
        reserves: [
          BigInt("10000000000000000000"), // 10 WETH
          BigInt("20200000000"), // 20,200 USDC
        ],
      },
      deltaPercent: 1.0,
      timestamp: Date.now(),
    };

    // Analyze both deltas
    const deepOpp = detector.analyzeDelta(deepDelta);
    const thinOpp = detector.analyzeDelta(thinDelta);

    expect(deepOpp).not.toBeNull();
    expect(thinOpp).not.toBeNull();

    // Both should have optimization results
    expect(deepOpp!.optimizationResult).toBeDefined();
    expect(thinOpp!.optimizationResult).toBeDefined();

    // Deep pool should optimize to larger amount than thin pool
    expect(deepOpp!.inputAmount).toBeGreaterThan(thinOpp!.inputAmount);

    // Both should differ from default (10)
    expect(deepOpp!.inputAmount).not.toBe(10);
    expect(thinOpp!.inputAmount).not.toBe(10);

    // Both should converge within limits
    expect(deepOpp!.optimizationResult!.converged).toBe(true);
    expect(thinOpp!.optimizationResult!.converged).toBe(true);
    expect(deepOpp!.optimizationResult!.durationMs).toBeLessThan(100);
    expect(thinOpp!.optimizationResult!.durationMs).toBeLessThan(100);
  });

  it("should fall back to default when no reserve data", () => {
    detector = new OpportunityDetector({
      minProfitThreshold: 0,
      gasPriceGwei: 0,
      maxSlippage: 0,
      defaultInputAmount: 25,
    });
    detector.on("error", () => {});

    // Delta without reserve data
    const buyPool: PoolConfig = {
      label: "WETH/USDC UniV2",
      dex: "uniswap_v2",
      poolAddress: "0x0000000000000000000000000000000000000001",
      token0: "0x0000000000000000000000000000000000000010",
      token1: "0x0000000000000000000000000000000000000020",
      decimals0: 18,
      decimals1: 6,
    };

    const sellPool: PoolConfig = {
      label: "WETH/USDC Sushi",
      dex: "sushiswap",
      poolAddress: "0x0000000000000000000000000000000000000002",
      token0: "0x0000000000000000000000000000000000000010",
      token1: "0x0000000000000000000000000000000000000020",
      decimals0: 18,
      decimals1: 6,
    };

    const delta: PriceDelta = {
      pair: "0x0000000000000000000000000000000000000010/0x0000000000000000000000000000000000000020",
      buyPool: {
        pool: buyPool,
        price: 2000,
        inversePrice: 1 / 2000,
        blockNumber: 19_000_000,
        timestamp: Date.now(),
        // No reserves
      },
      sellPool: {
        pool: sellPool,
        price: 2100,
        inversePrice: 1 / 2100,
        blockNumber: 19_000_000,
        timestamp: Date.now(),
        // No reserves
      },
      deltaPercent: 5.0,
      timestamp: Date.now(),
    };

    const opp = detector.analyzeDelta(delta);

    expect(opp).not.toBeNull();
    expect(opp!.optimizationResult).toBeUndefined();
    expect(opp!.inputAmount).toBe(25); // Uses defaultInputAmount
  });

  it("should show varying amounts in real scenario with multiple opportunities", () => {
    detector = new OpportunityDetector({
      minProfitThreshold: 0,
      gasPriceGwei: 0,
      maxSlippage: 0.005,
      defaultInputAmount: 10,
    });
    detector.on("error", () => {});
    detector.on("opportunityFound", (opp) => opportunities.push(opp));

    // Create 5 deltas with varying pool depths
    const poolDepths = [
      { reserves: BigInt("100000000000000000000"), label: "Tiny" }, // 100 WETH
      { reserves: BigInt("1000000000000000000000"), label: "Small" }, // 1,000 WETH
      { reserves: BigInt("5000000000000000000000"), label: "Medium" }, // 5,000 WETH
      { reserves: BigInt("10000000000000000000000"), label: "Large" }, // 10,000 WETH
      { reserves: BigInt("50000000000000000000000"), label: "Huge" }, // 50,000 WETH
    ];

    for (let i = 0; i < poolDepths.length; i++) {
      const depth = poolDepths[i];
      const buyPool: PoolConfig = {
        label: `WETH/USDC UniV2 (${depth.label})`,
        dex: "uniswap_v2",
        poolAddress: `0x000000000000000000000000000000000000000${i + 1}`,
        token0: "0x0000000000000000000000000000000000000010",
        token1: "0x0000000000000000000000000000000000000020",
        decimals0: 18,
        decimals1: 6,
      };

      const sellPool: PoolConfig = {
        label: `WETH/USDC Sushi (${depth.label})`,
        dex: "sushiswap",
        poolAddress: `0x000000000000000000000000000000000000010${i + 1}`,
        token0: "0x0000000000000000000000000000000000000010",
        token1: "0x0000000000000000000000000000000000000020",
        decimals0: 18,
        decimals1: 6,
      };

      const delta: PriceDelta = {
        pair: "0x0000000000000000000000000000000000000010/0x0000000000000000000000000000000000000020",
        buyPool: {
          pool: buyPool,
          price: 2000,
          inversePrice: 1 / 2000,
          blockNumber: 19_000_000,
          timestamp: Date.now(),
          reserves: [
            depth.reserves,
            depth.reserves * 2000n / 1_000_000_000_000n, // USDC reserves (6 decimals)
          ],
        },
        sellPool: {
          pool: sellPool,
          price: 2020,
          inversePrice: 1 / 2020,
          blockNumber: 19_000_000,
          timestamp: Date.now(),
          reserves: [
            depth.reserves,
            depth.reserves * 2020n / 1_000_000_000_000n,
          ],
        },
        deltaPercent: 1.0,
        timestamp: Date.now(),
      };

      detector.analyzeDelta(delta);
    }

    // Should have detected 5 opportunities
    expect(opportunities).toHaveLength(5);

    // All should have optimization results
    for (const opp of opportunities) {
      expect(opp.optimizationResult).toBeDefined();
      expect(opp.optimizationResult!.converged).toBe(true);
    }

    // Amounts should be correlated with pool depth (not perfectly monotonic due to slippage)
    const amounts = opportunities.map((o) => o.inputAmount);

    // At minimum: largest pool should have larger amount than smallest pool
    expect(amounts[4]).toBeGreaterThan(amounts[0]);

    // Standard deviation of amounts should be > 0 (showing variation)
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);
    expect(stdDev).toBeGreaterThan(0);
  });
});
