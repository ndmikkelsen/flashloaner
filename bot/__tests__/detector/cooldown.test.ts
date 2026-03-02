import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
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

function makeDelta(deltaPercent = 1.0): PriceDelta {
  const buyPool = makePool();
  const sellPool = makePool({
    label: "WETH/USDC Sushi",
    dex: "sushiswap",
    poolAddress: "0x0000000000000000000000000000000000000003",
  });
  return {
    pair: `${buyPool.token0}/${buyPool.token1}`,
    buyPool: {
      pool: buyPool,
      price: 2000,
      inversePrice: 1 / 2000,
      blockNumber: 19_000_000,
      timestamp: Date.now(),
    },
    sellPool: {
      pool: sellPool,
      price: 2000 + 2000 * deltaPercent / 100,
      inversePrice: 1 / (2000 + 2000 * deltaPercent / 100),
      blockNumber: 19_000_000,
      timestamp: Date.now(),
    },
    deltaPercent,
    timestamp: Date.now(),
  };
}

describe("Pair Cooldown Mechanism", () => {
  let detector: OpportunityDetector;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    detector?.detach();
    vi.useRealTimers();
  });

  it("should not cooldown before reaching rejection threshold", () => {
    detector = new OpportunityDetector({
      minProfitThreshold: 100, // Very high — always rejected
      gasPriceGwei: 0,
      maxSlippage: 0,
      defaultInputAmount: 10,
      cooldownAfterRejections: 5,
    });
    detector.on("error", () => {});

    const rejections: string[] = [];
    detector.on("opportunityRejected", (reason: string) => rejections.push(reason));

    // First 4 rejections should still emit events
    for (let i = 0; i < 4; i++) {
      detector.analyzeDelta(makeDelta(0.1));
    }
    expect(rejections.length).toBe(4);
    expect(rejections.every(r => r.includes("below threshold"))).toBe(true);
  });

  it("should cooldown pair after reaching rejection threshold", () => {
    detector = new OpportunityDetector({
      minProfitThreshold: 100,
      gasPriceGwei: 0,
      maxSlippage: 0,
      defaultInputAmount: 10,
      cooldownAfterRejections: 3,
      cooldownDurationMs: 60_000,
    });
    detector.on("error", () => {});

    const rejections: string[] = [];
    detector.on("opportunityRejected", (reason: string) => rejections.push(reason));

    // 3 rejections to trigger cooldown
    for (let i = 0; i < 3; i++) {
      detector.analyzeDelta(makeDelta(0.1));
    }
    expect(rejections.length).toBe(3);

    // Next call should be silently skipped (in cooldown)
    const result = detector.analyzeDelta(makeDelta(0.1));
    expect(result).toBeNull();
    // No new rejection event — silently skipped
    expect(rejections.length).toBe(3);
  });

  it("should resume analysis after cooldown expires", () => {
    detector = new OpportunityDetector({
      minProfitThreshold: 100,
      gasPriceGwei: 0,
      maxSlippage: 0,
      defaultInputAmount: 10,
      cooldownAfterRejections: 2,
      cooldownDurationMs: 5_000,
    });
    detector.on("error", () => {});

    const rejections: string[] = [];
    detector.on("opportunityRejected", (reason: string) => rejections.push(reason));

    // Trigger cooldown
    detector.analyzeDelta(makeDelta(0.1));
    detector.analyzeDelta(makeDelta(0.1));
    expect(rejections.length).toBe(2);

    // In cooldown — skipped
    detector.analyzeDelta(makeDelta(0.1));
    expect(rejections.length).toBe(2);

    // Advance past cooldown
    vi.advanceTimersByTime(5_001);

    // Should analyze again
    detector.analyzeDelta(makeDelta(0.1));
    expect(rejections.length).toBe(3); // New rejection event emitted
  });

  it("should reset cooldown when delta changes significantly", () => {
    detector = new OpportunityDetector({
      minProfitThreshold: 100,
      gasPriceGwei: 0,
      maxSlippage: 0,
      defaultInputAmount: 10,
      cooldownAfterRejections: 2,
      cooldownDurationMs: 60_000,
    });
    detector.on("error", () => {});

    const rejections: string[] = [];
    detector.on("opportunityRejected", (reason: string) => rejections.push(reason));

    // Trigger cooldown at deltaPercent=0.1
    detector.analyzeDelta(makeDelta(0.1));
    detector.analyzeDelta(makeDelta(0.1));
    expect(rejections.length).toBe(2);

    // In cooldown
    detector.analyzeDelta(makeDelta(0.1));
    expect(rejections.length).toBe(2);

    // Significant delta change (> 0.5%) should reset cooldown
    detector.analyzeDelta(makeDelta(1.0));
    expect(rejections.length).toBe(3); // Analyzed and rejected with new delta
  });
});
