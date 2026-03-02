import { describe, it, expect, afterEach } from "vitest";
import { OpportunityDetector } from "../../src/detector/OpportunityDetector.js";
import type { PriceDelta, PoolConfig } from "../../src/monitor/types.js";

function makePool(overrides: Partial<PoolConfig> = {}): PoolConfig {
  return {
    label: "WETH/USDC UniV2",
    dex: "uniswap_v2",
    poolAddress: "0x0000000000000000000000000000000000000001",
    token0: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    token1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    decimals0: 18,
    decimals1: 6,
    ...overrides,
  };
}

describe("Thin Pool Liquidity Filter", () => {
  let detector: OpportunityDetector;

  afterEach(() => {
    detector?.detach();
  });

  it("should skip pools below minimum liquidity threshold", () => {
    detector = new OpportunityDetector({
      minProfitThreshold: 0,
      gasPriceGwei: 0,
      maxSlippage: 0,
      defaultInputAmount: 10,
      minPoolLiquidityEth: 10.0,
    });
    detector.on("error", () => {});

    const rejections: string[] = [];
    detector.on("opportunityRejected", (reason: string) => rejections.push(reason));

    const buyPool = makePool();
    const sellPool = makePool({
      label: "WETH/USDC Sushi",
      dex: "sushiswap",
      poolAddress: "0x0000000000000000000000000000000000000003",
    });

    const delta: PriceDelta = {
      pair: `${buyPool.token0}/${buyPool.token1}`,
      buyPool: {
        pool: buyPool,
        price: 2000,
        inversePrice: 1 / 2000,
        blockNumber: 19_000_000,
        timestamp: Date.now(),
        reserves: [
          BigInt("3000000000000000000"), // 3 WETH — below 10 threshold
          BigInt("6000000000"),          // 6,000 USDC
        ],
      },
      sellPool: {
        pool: sellPool,
        price: 2020,
        inversePrice: 1 / 2020,
        blockNumber: 19_000_000,
        timestamp: Date.now(),
        reserves: [
          BigInt("3000000000000000000"), // 3 WETH
          BigInt("6060000000"),
        ],
      },
      deltaPercent: 1.0,
      timestamp: Date.now(),
    };

    const result = detector.analyzeDelta(delta);
    expect(result).toBeNull();
    expect(rejections).toContain("Thin pool below liquidity threshold");
  });

  it("should allow pools above minimum liquidity threshold", () => {
    detector = new OpportunityDetector({
      minProfitThreshold: 0,
      gasPriceGwei: 0,
      maxSlippage: 0,
      defaultInputAmount: 10,
      minPoolLiquidityEth: 5.0,
    });
    detector.on("error", () => {});

    const buyPool = makePool();
    const sellPool = makePool({
      label: "WETH/USDC Sushi",
      dex: "sushiswap",
      poolAddress: "0x0000000000000000000000000000000000000003",
    });

    const delta: PriceDelta = {
      pair: `${buyPool.token0}/${buyPool.token1}`,
      buyPool: {
        pool: buyPool,
        price: 2000,
        inversePrice: 1 / 2000,
        blockNumber: 19_000_000,
        timestamp: Date.now(),
        reserves: [
          BigInt("50000000000000000000"), // 50 WETH — above 5 threshold
          BigInt("100000000000"),
        ],
      },
      sellPool: {
        pool: sellPool,
        price: 2100,
        inversePrice: 1 / 2100,
        blockNumber: 19_000_000,
        timestamp: Date.now(),
        reserves: [
          BigInt("50000000000000000000"), // 50 WETH
          BigInt("105000000000"),
        ],
      },
      deltaPercent: 5.0,
      timestamp: Date.now(),
    };

    const result = detector.analyzeDelta(delta);
    // Should not be rejected for thin pool (might be rejected for other reasons)
    // but should NOT have thin pool rejection
    const rejections: string[] = [];
    detector.on("opportunityRejected", (reason: string) => rejections.push(reason));
    // Already called, so this just validates the filter didn't trigger
    expect(result).not.toBeNull();
  });

  it("should allow pools without reserve data (cannot determine)", () => {
    detector = new OpportunityDetector({
      minProfitThreshold: 0,
      gasPriceGwei: 0,
      maxSlippage: 0,
      defaultInputAmount: 10,
      minPoolLiquidityEth: 100.0, // Very high threshold
    });
    detector.on("error", () => {});

    const buyPool = makePool();
    const sellPool = makePool({
      label: "WETH/USDC Sushi",
      dex: "sushiswap",
      poolAddress: "0x0000000000000000000000000000000000000003",
    });

    const delta: PriceDelta = {
      pair: `${buyPool.token0}/${buyPool.token1}`,
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

    // Should not be filtered (no reserve data to determine)
    const result = detector.analyzeDelta(delta);
    expect(result).not.toBeNull();
  });
});
