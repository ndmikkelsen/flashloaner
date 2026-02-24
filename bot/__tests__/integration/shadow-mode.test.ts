import { describe, it, expect, beforeEach, vi } from "vitest";
import { FlashloanBot } from "../../src/index.js";
import { OpportunityDetector } from "../../src/detector/OpportunityDetector.js";
import { Wallet } from "ethers";
import type { ArbitrageOpportunity } from "../../src/detector/types.js";
import type { BotConfig } from "../../src/config/types.js";

describe("Shadow Mode & Staleness Guard", () => {
  let mockConfig: BotConfig;
  let mockExecutionConfig: {
    wallet: Wallet;
    executorAddress: string;
    adapters: Record<string, string>;
    flashLoanProviders: { aave_v3: string; balancer: string };
  };

  beforeEach(() => {
    mockConfig = {
      network: { rpcUrl: "http://localhost:8545", chainId: 42161 },
      pools: [],
      monitor: {
        deltaThresholdPercent: 0.5,
        pollIntervalMs: 5000,
        maxRetries: 3,
        minReserveWeth: 10,
        wethAddress: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
      },
      detector: {
        minProfitThreshold: 0.01,
        maxSlippage: 0.005,
        defaultInputAmount: 10,
        gasPriceGwei: 0.1,
        gasPerSwap: 150000,
      },
      logLevel: "info",
    };

    // Mock execution config for shadow/live mode tests
    const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Anvil default key #0
    mockExecutionConfig = {
      wallet: new Wallet(TEST_PRIVATE_KEY),
      executorAddress: "0x0000000000000000000000000000000000000001",
      adapters: {
        uniswap_v2: "0x0000000000000000000000000000000000000002",
        uniswap_v3: "0x0000000000000000000000000000000000000003",
        sushiswap: "0x0000000000000000000000000000000000000004",
      },
      flashLoanProviders: {
        aave_v3: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
        balancer: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
      },
    };
  });

  describe("Mode Detection", () => {
    it("should default to dry-run mode when no env vars set", () => {
      const bot = new FlashloanBot(mockConfig, true);
      expect(bot.mode).toBe("dry-run");
    });

    it("should use shadow mode when SHADOW_MODE=true", () => {
      process.env.SHADOW_MODE = "true";
      const bot = new FlashloanBot(mockConfig, false, mockExecutionConfig);
      expect(bot.mode).toBe("shadow");
      delete process.env.SHADOW_MODE;
    });

    it("should use live mode when both DRY_RUN and SHADOW_MODE are false", () => {
      process.env.SHADOW_MODE = "false";
      const bot = new FlashloanBot(mockConfig, false, mockExecutionConfig);
      expect(bot.mode).toBe("live");
      delete process.env.SHADOW_MODE;
    });
  });

  describe("Staleness Guard", () => {
    it("should detect fresh opportunities (latency < 200ms)", () => {
      const detector = new OpportunityDetector({
        minProfitThreshold: 0.01,
        defaultInputAmount: 10,
      });

      const freshOpp: ArbitrageOpportunity = {
        id: "test-fresh",
        path: {
          steps: [],
          baseToken: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
          label: "Test path",
        },
        inputAmount: 10,
        grossProfit: 0.05,
        costs: {
          flashLoanFee: 0.005,
          gasCost: 0.01,
          slippageCost: 0.001,
          totalCost: 0.016,
        },
        netProfit: 0.034,
        netProfitPercent: 0.34,
        priceDelta: {
          pair: "WETH/USDC",
          poolA: {} as any,
          poolB: {} as any,
          deltaPercent: 1.2,
          blockNumber: 12345,
        },
        blockNumber: 12345,
        timestamp: Date.now(), // Fresh timestamp
      };

      const result = detector.checkStaleness(freshOpp);
      expect(result.fresh).toBe(true);
      expect(result.latencyMs).toBeLessThan(200);
    });

    it("should detect stale opportunities (latency > 200ms)", () => {
      const detector = new OpportunityDetector({
        minProfitThreshold: 0.01,
        defaultInputAmount: 10,
      });

      const staleOpp: ArbitrageOpportunity = {
        id: "test-stale",
        path: {
          steps: [],
          baseToken: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
          label: "Test path",
        },
        inputAmount: 10,
        grossProfit: 0.05,
        costs: {
          flashLoanFee: 0.005,
          gasCost: 0.01,
          slippageCost: 0.001,
          totalCost: 0.016,
        },
        netProfit: 0.034,
        netProfitPercent: 0.34,
        priceDelta: {
          pair: "WETH/USDC",
          poolA: {} as any,
          poolB: {} as any,
          deltaPercent: 1.2,
          blockNumber: 12345,
        },
        blockNumber: 12345,
        timestamp: Date.now() - 500, // 500ms ago (stale)
      };

      const result = detector.checkStaleness(staleOpp);
      expect(result.fresh).toBe(false);
      expect(result.latencyMs).toBeGreaterThanOrEqual(500);
    });

    it("should use 200ms threshold exactly", () => {
      const detector = new OpportunityDetector({
        minProfitThreshold: 0.01,
        defaultInputAmount: 10,
      });

      const edgeOpp: ArbitrageOpportunity = {
        id: "test-edge",
        path: {
          steps: [],
          baseToken: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
          label: "Test path",
        },
        inputAmount: 10,
        grossProfit: 0.05,
        costs: {
          flashLoanFee: 0.005,
          gasCost: 0.01,
          slippageCost: 0.001,
          totalCost: 0.016,
        },
        netProfit: 0.034,
        netProfitPercent: 0.34,
        priceDelta: {
          pair: "WETH/USDC",
          poolA: {} as any,
          poolB: {} as any,
          deltaPercent: 1.2,
          blockNumber: 12345,
        },
        blockNumber: 12345,
        timestamp: Date.now() - 200, // Exactly 200ms ago
      };

      const result = detector.checkStaleness(edgeOpp);
      // At exactly 200ms, it should still be fresh (<=)
      expect(result.fresh).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(200);
    });
  });

  describe("Backward Compatibility", () => {
    it("should preserve DRY_RUN=true behavior", () => {
      process.env.DRY_RUN = "true";
      const bot = FlashloanBot.fromEnv();
      expect(bot.mode).toBe("dry-run");
      expect(bot.dryRun).toBe(true);
      delete process.env.DRY_RUN;
    });

    it("should default to dry-run when DRY_RUN is unset", () => {
      delete process.env.DRY_RUN;
      const bot = FlashloanBot.fromEnv();
      expect(bot.mode).toBe("dry-run");
      expect(bot.dryRun).toBe(true);
    });
  });
});
