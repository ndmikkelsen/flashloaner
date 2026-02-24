import { describe, it, expect } from "vitest";
import { OpportunityDetector } from "../../src/detector/OpportunityDetector.js";
import type { PriceDelta, PriceSnapshot, PoolConfig } from "../../src/monitor/types.js";
import { ARBITRUM_MAINNET_POOLS } from "../../src/config/chains/pools/arbitrum-mainnet.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADDR = {
  WETH: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
  USDC: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
  USDT: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
  LINK: "0xf97f4df75117a78c1a5a0dbb814af92458539fb4",
};

function makePool(overrides: Partial<PoolConfig> = {}): PoolConfig {
  return {
    label: "WETH/USDC UniV3 (0.3%)",
    dex: "uniswap_v3",
    poolAddress: "0x0000000000000000000000000000000000000001",
    token0: ADDR.WETH,
    token1: ADDR.USDC,
    decimals0: 18,
    decimals1: 6,
    feeTier: 3000,
    ...overrides,
  };
}

function makeSnapshot(
  pool: PoolConfig,
  price: number,
  blockNumber = 19_000_000,
): PriceSnapshot {
  return {
    pool,
    price,
    inversePrice: 1 / price,
    blockNumber,
    timestamp: Date.now(),
  };
}

function makeDelta(opts: {
  buyPrice: number;
  sellPrice: number;
  buyPool?: PoolConfig;
  sellPool?: PoolConfig;
}): PriceDelta {
  const buyPool = opts.buyPool ?? makePool({
    label: "WETH/USDC UniV3 (0.3%)",
    feeTier: 3000,
    poolAddress: "0x0000000000000000000000000000000000000001",
  });
  const sellPool = opts.sellPool ?? makePool({
    label: "WETH/USDC UniV3 (0.05%)",
    feeTier: 500,
    poolAddress: "0x0000000000000000000000000000000000000002",
  });

  return {
    pair: `${buyPool.token0}/${buyPool.token1}`,
    buyPool: makeSnapshot(buyPool, opts.buyPrice),
    sellPool: makeSnapshot(sellPool, opts.sellPrice),
    deltaPercent: ((opts.sellPrice - opts.buyPrice) / opts.buyPrice) * 100,
    timestamp: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Cross-Fee-Tier Routing", () => {
  // Zero-cost detector configuration to isolate DEX trading fees
  const detector = new OpportunityDetector({
    minProfitThreshold: 0,
    maxSlippage: 0,
    defaultInputAmount: 10,
    gasPriceGwei: 0,
    gasPerSwap: 0,
    flashLoanFees: { aaveV3: 0, dydx: 0, balancer: 0 },
  });

  it("cross-fee-tier pair (0.05% buy + 0.3% sell) has lower cost floor than same-tier pair (0.3% + 0.3%)", () => {
    // Same-tier scenario: buy at 3000, sell at 3030 (1% spread)
    // Both pools at feeTier 3000 (0.3%)
    const sameTierBuyPool = makePool({
      label: "WETH/USDC UniV3 (0.3%) Pool A",
      feeTier: 3000,
      poolAddress: "0x0000000000000000000000000000000000000001",
    });
    const sameTierSellPool = makePool({
      label: "WETH/USDC UniV3 (0.3%) Pool B",
      feeTier: 3000,
      poolAddress: "0x0000000000000000000000000000000000000002",
    });
    const sameTierDelta = makeDelta({
      buyPrice: 3000,
      sellPrice: 3030,
      buyPool: sameTierBuyPool,
      sellPool: sameTierSellPool,
    });

    // Cross-tier scenario: same prices and spread
    // Buy pool at feeTier 500 (0.05%), sell pool at feeTier 3000 (0.3%)
    const crossTierBuyPool = makePool({
      label: "WETH/USDC UniV3 (0.05%)",
      feeTier: 500,
      poolAddress: "0x0000000000000000000000000000000000000003",
    });
    const crossTierSellPool = makePool({
      label: "WETH/USDC UniV3 (0.3%)",
      feeTier: 3000,
      poolAddress: "0x0000000000000000000000000000000000000004",
    });
    const crossTierDelta = makeDelta({
      buyPrice: 3000,
      sellPrice: 3030,
      buyPool: crossTierBuyPool,
      sellPool: crossTierSellPool,
    });

    const sameTierProfit = detector.analyzeDelta(sameTierDelta);
    const crossTierProfit = detector.analyzeDelta(crossTierDelta);

    expect(sameTierProfit).not.toBeNull();
    expect(crossTierProfit).not.toBeNull();

    // Cross-tier path is more profitable because buy leg pays only 0.05% vs 0.3%
    expect(crossTierProfit!.netProfit).toBeGreaterThan(sameTierProfit!.netProfit);
  });

  it("cross-fee-tier cost floor is approximately 0.35% (0.05% + 0.3%)", () => {
    // Cross-tier delta: buy on feeTier 500, sell on feeTier 3000
    // Spread: exactly 1.0% (buy price 3000, sell price 3030)
    const buyPool = makePool({
      label: "WETH/USDC UniV3 (0.05%)",
      feeTier: 500,
      poolAddress: "0x0000000000000000000000000000000000000001",
    });
    const sellPool = makePool({
      label: "WETH/USDC UniV3 (0.3%)",
      feeTier: 3000,
      poolAddress: "0x0000000000000000000000000000000000000002",
    });
    const delta = makeDelta({
      buyPrice: 3000,
      sellPrice: 3030,
      buyPool,
      sellPool,
    });

    const path = detector.buildSwapPath(delta);
    const inputAmount = 10;
    const grossProfit = detector.calculateGrossProfit(path, inputAmount);

    // Combined fee: 0.05% + 0.3% = 0.35%
    // With 1% spread, gross profit should be ~0.65% of inputAmount
    // (1% spread - 0.35% fees = 0.65%)
    const expectedProfitPercent = 0.65;
    const expectedProfit = inputAmount * (expectedProfitPercent / 100);

    // Allow 0.05% tolerance for rounding
    expect(grossProfit).toBeGreaterThan(expectedProfit * 0.95);
    expect(grossProfit).toBeLessThan(expectedProfit * 1.05);

    // Verify the cost floor: profit as % of input should be ~0.65%
    const profitPercent = (grossProfit / inputAmount) * 100;
    expect(profitPercent).toBeGreaterThan(0.60);
    expect(profitPercent).toBeLessThan(0.70);
  });

  it("same-tier cost floor is approximately 0.60% (0.3% + 0.3%)", () => {
    // Same-tier delta: both pools at feeTier 3000
    // Spread: exactly 1.0% (buy price 3000, sell price 3030)
    const buyPool = makePool({
      label: "WETH/USDC UniV3 (0.3%) Pool A",
      feeTier: 3000,
      poolAddress: "0x0000000000000000000000000000000000000001",
    });
    const sellPool = makePool({
      label: "WETH/USDC UniV3 (0.3%) Pool B",
      feeTier: 3000,
      poolAddress: "0x0000000000000000000000000000000000000002",
    });
    const delta = makeDelta({
      buyPrice: 3000,
      sellPrice: 3030,
      buyPool,
      sellPool,
    });

    const path = detector.buildSwapPath(delta);
    const inputAmount = 10;
    const grossProfit = detector.calculateGrossProfit(path, inputAmount);

    // Combined fee: 0.3% + 0.3% = 0.6%
    // With 1% spread, gross profit should be ~0.4% of inputAmount
    // (1% spread - 0.6% fees = 0.4%)
    const expectedProfitPercent = 0.40;
    const expectedProfit = inputAmount * (expectedProfitPercent / 100);

    // Allow 0.05% tolerance for rounding
    expect(grossProfit).toBeGreaterThan(expectedProfit * 0.95);
    expect(grossProfit).toBeLessThan(expectedProfit * 1.05);

    // Verify the cost floor: profit as % of input should be ~0.40%
    const profitPercent = (grossProfit / inputAmount) * 100;
    expect(profitPercent).toBeGreaterThan(0.35);
    expect(profitPercent).toBeLessThan(0.45);
  });

  it("PriceMonitor pairKey groups cross-fee-tier pools together", () => {
    // Test that pools with the same token pair but different fee tiers
    // produce the same canonical pair key.
    // pairKey logic: [token0, token1].sort().join("/")

    const wethUsdcUniV3 = ARBITRUM_MAINNET_POOLS.find(
      (p) => p.label === "WETH/USDC UniV3 (0.05%)",
    );
    const wethUsdcCamelot = ARBITRUM_MAINNET_POOLS.find(
      (p) => p.label === "WETH/USDC Camelot V3",
    );

    expect(wethUsdcUniV3).toBeDefined();
    expect(wethUsdcCamelot).toBeDefined();

    // Both should have the same token0/token1 (same pair, different DEX)
    expect(wethUsdcUniV3!.token0).toBe(wethUsdcCamelot!.token0);
    expect(wethUsdcUniV3!.token1).toBe(wethUsdcCamelot!.token1);

    // pairKey function (same logic as PriceMonitor's private method)
    const pairKey = (token0: string, token1: string) => {
      return [token0.toLowerCase(), token1.toLowerCase()].sort().join("/");
    };

    const key1 = pairKey(wethUsdcUniV3!.token0, wethUsdcUniV3!.token1);
    const key2 = pairKey(wethUsdcCamelot!.token0, wethUsdcCamelot!.token1);

    expect(key1).toBe(key2);
  });

  it("buildSwapPath includes feeTier on each step", () => {
    // Create a cross-tier delta: buy pool feeTier 500, sell pool feeTier 3000
    const buyPool = makePool({
      label: "WETH/USDC UniV3 (0.05%)",
      feeTier: 500,
      poolAddress: "0x0000000000000000000000000000000000000001",
    });
    const sellPool = makePool({
      label: "WETH/USDC UniV3 (0.3%)",
      feeTier: 3000,
      poolAddress: "0x0000000000000000000000000000000000000002",
    });
    const delta = makeDelta({
      buyPrice: 3000,
      sellPrice: 3030,
      buyPool,
      sellPool,
    });

    const path = detector.buildSwapPath(delta);

    expect(path.steps).toHaveLength(2);
    expect(path.steps[0].feeTier).toBe(500);
    expect(path.steps[1].feeTier).toBe(3000);
  });

  it("getSwapFeeRate returns correct rates for different fee tiers", () => {
    // Test via calculateGrossProfit: paths with different fee tiers
    // should yield different gross profits.

    // Path A: both steps feeTier 3000 (0.3%)
    const buyPoolA = makePool({
      label: "WETH/USDC UniV3 (0.3%) Pool A",
      feeTier: 3000,
      poolAddress: "0x0000000000000000000000000000000000000001",
    });
    const sellPoolA = makePool({
      label: "WETH/USDC UniV3 (0.3%) Pool B",
      feeTier: 3000,
      poolAddress: "0x0000000000000000000000000000000000000002",
    });
    const deltaA = makeDelta({
      buyPrice: 3000,
      sellPrice: 3030,
      buyPool: buyPoolA,
      sellPool: sellPoolA,
    });
    const pathA = detector.buildSwapPath(deltaA);
    const grossProfitA = detector.calculateGrossProfit(pathA, 10);

    // Path B: buy step feeTier 500 (0.05%), sell step feeTier 3000 (0.3%)
    const buyPoolB = makePool({
      label: "WETH/USDC UniV3 (0.05%)",
      feeTier: 500,
      poolAddress: "0x0000000000000000000000000000000000000003",
    });
    const sellPoolB = makePool({
      label: "WETH/USDC UniV3 (0.3%)",
      feeTier: 3000,
      poolAddress: "0x0000000000000000000000000000000000000004",
    });
    const deltaB = makeDelta({
      buyPrice: 3000,
      sellPrice: 3030,
      buyPool: buyPoolB,
      sellPool: sellPoolB,
    });
    const pathB = detector.buildSwapPath(deltaB);
    const grossProfitB = detector.calculateGrossProfit(pathB, 10);

    // Path B (lower buy-side fee) should be more profitable
    expect(grossProfitB).toBeGreaterThan(grossProfitA);
  });
});
