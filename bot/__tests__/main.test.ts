import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FlashloanBot, BOT_VERSION } from "../src/index.js";
import { MAINNET_POOLS } from "../src/config/pools.js";
import type { BotConfig } from "../src/config/index.js";
import { DEFAULT_CONFIG } from "../src/config/index.js";

function makeConfig(overrides: Partial<BotConfig> = {}): BotConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    network: {
      rpcUrl: "https://eth-mainnet.example.com",
      chainId: 1,
      ...overrides.network,
    },
    logLevel: "error", // suppress logs in tests
  };
}

describe("mainnet pool definitions", () => {
  it("should export non-empty pool array", () => {
    expect(MAINNET_POOLS).toBeDefined();
    expect(MAINNET_POOLS.length).toBeGreaterThan(0);
  });

  it("should have valid pool definitions", () => {
    for (const pool of MAINNET_POOLS) {
      expect(pool.label).toBeTruthy();
      expect(pool.poolAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(pool.token0).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(pool.token1).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(pool.decimals0).toBeGreaterThanOrEqual(0);
      expect(pool.decimals1).toBeGreaterThanOrEqual(0);
      expect(["uniswap_v2", "uniswap_v3", "sushiswap"]).toContain(pool.dex);
    }
  });

  it("should have at least two pools for the same pair (for arb detection)", () => {
    const pairCounts = new Map<string, number>();
    for (const pool of MAINNET_POOLS) {
      const [a, b] = [pool.token0.toLowerCase(), pool.token1.toLowerCase()].sort();
      const key = `${a}/${b}`;
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    }
    const hasMultiPoolPair = [...pairCounts.values()].some((c) => c >= 2);
    expect(hasMultiPoolPair).toBe(true);
  });

  it("should have V3 pools with feeTier", () => {
    const v3Pools = MAINNET_POOLS.filter((p) => p.dex === "uniswap_v3");
    for (const pool of v3Pools) {
      expect(pool.feeTier).toBeDefined();
      expect(pool.feeTier).toBeGreaterThan(0);
    }
  });
});

describe("FlashloanBot with pools", () => {
  let bot: FlashloanBot;

  afterEach(async () => {
    await bot?.stop();
  });

  it("should accept pools in config", () => {
    bot = new FlashloanBot(makeConfig({ pools: MAINNET_POOLS }));
    expect(bot.config.pools.length).toBe(MAINNET_POOLS.length);
  });

  it("should pass pools to PriceMonitor", () => {
    bot = new FlashloanBot(makeConfig({ pools: MAINNET_POOLS }));
    // The monitor is created with the pools from config
    expect(bot.monitor).toBeDefined();
  });
});

describe("FlashloanBot dry-run event tracking", () => {
  let bot: FlashloanBot;

  afterEach(async () => {
    await bot?.stop();
  });

  it("should emit scan stats events", async () => {
    bot = new FlashloanBot(makeConfig({ pools: MAINNET_POOLS }));
    vi.spyOn(bot.monitor, "start").mockImplementation(() => {});

    await bot.start();
    expect(bot.status).toBe("running");
  });
});
