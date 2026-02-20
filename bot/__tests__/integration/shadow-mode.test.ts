import { describe, it, expect, beforeEach, vi } from "vitest";
import { FlashloanBot } from "../../src/index.js";
import { OpportunityDetector } from "../../src/detector/OpportunityDetector.js";
import type { ArbitrageOpportunity } from "../../src/detector/types.js";
import type { BotConfig } from "../../src/config/types.js";

describe("Shadow Mode & Staleness Guard", () => {
  let mockConfig: BotConfig;

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
  });

  describe("Mode Detection", () => {
    it("should default to dry-run mode when no env vars set", () => {
      const bot = new FlashloanBot(mockConfig, true);
      expect(bot.mode).toBe("dry-run");
    });

    it("should use shadow mode when SHADOW_MODE=true", () => {
      process.env.SHADOW_MODE = "true";
      const bot = new FlashloanBot(mockConfig, false);
      expect(bot.mode).toBe("shadow");
      delete process.env.SHADOW_MODE;
    });

    it("should use live mode when both DRY_RUN and SHADOW_MODE are false", () => {
      process.env.SHADOW_MODE = "false";
      const bot = new FlashloanBot(mockConfig, false);
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
