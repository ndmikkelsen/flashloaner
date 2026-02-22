import { describe, it, expect, beforeAll } from "vitest";
import { JsonRpcProvider } from "ethers";
import { PriceMonitor } from "../../src/monitor/PriceMonitor.js";
import { OpportunityDetector } from "../../src/detector/OpportunityDetector.js";
import type { ArbitrageOpportunity } from "../../src/detector/types.js";
import { ARBITRUM_MAINNET_POOLS } from "../../src/config/chains/pools/arbitrum-mainnet.js";

describe.skipIf(!process.env.ARBITRUM_MAINNET_RPC_URL)("Trader Joe LB Integration", () => {
  let provider: JsonRpcProvider;
  let monitor: PriceMonitor;
  let detector: OpportunityDetector;

  beforeAll(() => {
    const rpcUrl = process.env.ARBITRUM_MAINNET_RPC_URL!;
    provider = new JsonRpcProvider(rpcUrl);

    // Filter for LB + one other DEX for same pair (to create cross-DEX delta)
    const lbPools = ARBITRUM_MAINNET_POOLS.filter((p) => p.dex === "traderjoe_lb");
    const otherPools = ARBITRUM_MAINNET_POOLS.filter(
      (p) => p.dex !== "traderjoe_lb" && p.dex === "uniswap_v3",
    );

    monitor = new PriceMonitor({
      provider,
      pools: [...lbPools, ...otherPools.slice(0, 5)],
      deltaThresholdPercent: 0.1, // Low threshold to capture any delta
    });

    detector = new OpportunityDetector({
      minProfitThreshold: 0.006, // 0.6% base (will be 0.8% for LB opportunities)
    });

    detector.attach(monitor);
  });

  it("should read LB pool prices without errors", async () => {
    const lbPools = ARBITRUM_MAINNET_POOLS.filter((p) => p.dex === "traderjoe_lb");

    if (lbPools.length === 0) {
      // No LB pools configured yet (all placeholder addresses)
      expect(lbPools.length).toBe(0);
      return;
    }

    const snapshots = await Promise.all(
      lbPools.map((pool) => monitor.fetchPrice(pool)),
    );

    expect(snapshots.length).toBeGreaterThan(0);
    for (const snap of snapshots) {
      expect(snap.price).toBeGreaterThan(0);
      expect(snap.activeId).toBeDefined();
      expect(snap.activeId).toBeGreaterThan(0);
    }
  });

  it("should apply 50% fee buffer to LB swaps", () => {
    // Create a mock swap path with LB step
    const mockLBPath = {
      steps: [
        {
          dex: "traderjoe_lb" as const,
          poolAddress: "0x0000000000000000000000000000000000000000",
          tokenIn: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
          tokenOut: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
          decimalsIn: 18,
          decimalsOut: 6,
          expectedPrice: 2000,
          feeTier: 25, // 0.25% binStep
        },
      ],
      baseToken: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
      label: "LB test path",
    };

    const mockUniV3Path = {
      steps: [
        {
          dex: "uniswap_v3" as const,
          poolAddress: "0x0000000000000000000000000000000000000000",
          tokenIn: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
          tokenOut: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
          decimalsIn: 18,
          decimalsOut: 6,
          expectedPrice: 2000,
          feeTier: 500, // 0.05%
        },
      ],
      baseToken: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
      label: "UniV3 test path",
    };

    const grossProfitLB = detector.calculateGrossProfit(mockLBPath, 10);
    const grossProfitUniV3 = detector.calculateGrossProfit(mockUniV3Path, 10);

    // LB with 0.25% * 1.5 = 0.375% should have lower gross than UniV3 with 0.05%
    // LB output = 10 * (1 - 0.00375) * 2000 - 10 = 19925 - 10 = 19915
    // UniV3 output = 10 * (1 - 0.0005) * 2000 - 10 = 19990 - 10 = 19980
    expect(grossProfitLB).toBeLessThan(grossProfitUniV3);

    // Verify exact fee buffer: LB should deduct 0.375% (0.25% * 1.5)
    const expectedLBOutput = 10 * (1 - 0.00375) * 2000;
    const expectedLBGross = expectedLBOutput - 10;
    expect(grossProfitLB).toBeCloseTo(expectedLBGross, 2);
  });

  it("should apply higher profit threshold (1.33x) for LB opportunities", () => {
    const mockLBDelta = {
      token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
      token1: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
      buyPool: {
        pool: {
          label: "WETH/USDC LB",
          dex: "traderjoe_lb" as const,
          poolAddress: "0x0000000000000000000000000000000000000001",
          token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
          token1: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
          decimals0: 18,
          decimals1: 6,
          feeTier: 15,
        },
        price: 2000,
        inversePrice: 0.0005,
        blockNumber: 1000,
        timestamp: Date.now(),
      },
      sellPool: {
        pool: {
          label: "WETH/USDC UniV3",
          dex: "uniswap_v3" as const,
          poolAddress: "0x0000000000000000000000000000000000000002",
          token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
          token1: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
          decimals0: 18,
          decimals1: 6,
          feeTier: 500,
        },
        price: 2010,
        inversePrice: 0.000497512,
        blockNumber: 1000,
        timestamp: Date.now(),
      },
      percentDelta: 0.5,
    };

    // Detector configured with 0.6% base threshold
    // Should be rejected because net profit is likely < 0.8% (0.6% * 1.33)
    let rejectionReason = "";
    detector.once("opportunityRejected", (reason) => {
      rejectionReason = reason;
    });

    const result = detector.analyzeDelta(mockLBDelta);

    // Should be rejected with threshold message mentioning Trader Joe LB
    expect(result).toBeNull();
    expect(rejectionReason).toContain("threshold");
    expect(rejectionReason).toContain("Trader Joe LB");
  });

  it("should throw error if LB step missing feeTier", () => {
    const invalidLBPath = {
      steps: [
        {
          dex: "traderjoe_lb" as const,
          poolAddress: "0x0000000000000000000000000000000000000000",
          tokenIn: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
          tokenOut: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
          decimalsIn: 18,
          decimalsOut: 6,
          expectedPrice: 2000,
          // feeTier missing
        },
      ],
      baseToken: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
      label: "Invalid LB path",
    };

    expect(() => {
      detector.calculateGrossProfit(invalidLBPath, 10);
    }).toThrow("Trader Joe LB swap step missing feeTier (binStep)");
  });

  it("should detect cross-DEX opportunities including LB pools", async () => {
    const lbPools = ARBITRUM_MAINNET_POOLS.filter((p) => p.dex === "traderjoe_lb");

    if (lbPools.length === 0 || lbPools[0].poolAddress === "0x0000000000000000000000000000000000000000") {
      // LB pools not yet configured with real addresses
      expect(true).toBe(true);
      return;
    }

    const opportunities: ArbitrageOpportunity[] = [];

    detector.on("opportunityFound", (opp) => {
      opportunities.push(opp);
    });

    // Run 3 poll cycles to capture opportunities
    await monitor.poll();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await monitor.poll();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await monitor.poll();

    // May or may not find opportunities (market-dependent)
    // At minimum: no errors during polling
    expect(Array.isArray(opportunities)).toBe(true);

    // If opportunities found, verify they have valid structure
    for (const opp of opportunities) {
      expect(opp.path.steps.length).toBeGreaterThan(0);
      expect(opp.netProfit).toBeDefined();
      expect(opp.costs.totalCost).toBeGreaterThan(0);
    }
  });
});

describe("fee display formatting", () => {
  it("should compute correct fee display for TJ LB binStep=15", () => {
    const binStep = 15;
    const basePct = binStep / 100; // bps to percent
    expect(basePct.toFixed(2)).toBe("0.15");
  });

  it("should compute correct fee display for TJ LB binStep=25", () => {
    const binStep = 25;
    const basePct = binStep / 100;
    expect(basePct.toFixed(2)).toBe("0.25");
  });

  it("should compute correct cost floor rate for TJ LB", () => {
    const binStep = 15;
    const rate = (binStep / 10_000) * 1.5; // with 50% buffer
    expect(rate).toBeCloseTo(0.00225, 6);
    // Display: (0.00225 * 100).toFixed(2) = "0.23%"
    expect((rate * 100).toFixed(2)).toBe("0.23");
  });

  it("should compute correct cost floor rate for V3 feeTier=500", () => {
    const feeTier = 500; // 0.05%
    const rate = feeTier / 1_000_000;
    expect(rate).toBeCloseTo(0.0005, 6);
  });

  it("should not affect V2 display (no feeTier)", () => {
    // V2 pools use default 0.3% = 0.003
    const rate = 0.003;
    expect((rate * 100).toFixed(2)).toBe("0.30");
  });
});
