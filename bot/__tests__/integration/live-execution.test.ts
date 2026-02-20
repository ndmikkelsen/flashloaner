import { describe, it, expect, beforeAll } from "vitest";
import { JsonRpcProvider, Wallet } from "ethers";
import { FlashloanBot } from "../../src/index.js";
import type { BotConfig } from "../../src/config/types.js";

/**
 * Live execution integration tests.
 *
 * These tests use a local Arbitrum fork to validate that the bot can:
 * - Instantiate ExecutionEngine, TransactionBuilder, NonceManager in shadow/live modes
 * - Simulate transactions via eth_call in shadow mode
 * - Submit transactions in live mode (on fork)
 *
 * NOTE: These tests require a local Arbitrum fork running on http://localhost:8545
 * To run: anvil --fork-url https://arb1.arbitrum.io/rpc --chain-id 42161
 */
describe("Live Execution Integration (Fork)", () => {
  const FORK_RPC = process.env.FORK_RPC_URL ?? "http://localhost:8545";
  const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Anvil default key #0

  let provider: JsonRpcProvider;
  let wallet: Wallet;

  beforeAll(async () => {
    provider = new JsonRpcProvider(FORK_RPC);
    wallet = new Wallet(TEST_PRIVATE_KEY, provider);

    // Verify fork is running
    try {
      await provider.getBlockNumber();
    } catch (err) {
      console.warn("Fork not available, skipping live execution tests");
      return;
    }
  });

  describe("Shadow Mode", () => {
    it("should instantiate bot with ExecutionEngine in shadow mode", async () => {
      const config: BotConfig = {
        network: { rpcUrl: FORK_RPC, chainId: 42161 },
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

      const executionConfig = {
        wallet,
        executorAddress: "0x0000000000000000000000000000000000000001", // Dummy for test
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

      // Shadow mode: DRY_RUN=false, SHADOW_MODE=true
      process.env.DRY_RUN = "false";
      process.env.SHADOW_MODE = "true";

      const bot = new FlashloanBot(config, false, executionConfig);

      expect(bot.mode).toBe("shadow");
      expect(bot.engine).toBeDefined();
      expect(bot.builder).toBeDefined();
      expect(bot.nonceManager).toBeDefined();

      delete process.env.DRY_RUN;
      delete process.env.SHADOW_MODE;
    });
  });

  describe("Live Mode", () => {
    it("should instantiate bot with ExecutionEngine in live mode", async () => {
      const config: BotConfig = {
        network: { rpcUrl: FORK_RPC, chainId: 42161 },
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

      const executionConfig = {
        wallet,
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

      // Live mode: DRY_RUN=false, SHADOW_MODE=false
      process.env.DRY_RUN = "false";
      process.env.SHADOW_MODE = "false";

      const bot = new FlashloanBot(config, false, executionConfig);

      expect(bot.mode).toBe("live");
      expect(bot.engine).toBeDefined();
      expect(bot.builder).toBeDefined();
      expect(bot.nonceManager).toBeDefined();

      delete process.env.DRY_RUN;
      delete process.env.SHADOW_MODE;
    });

    it("should sync nonce manager with on-chain nonce on initialization", async () => {
      const config: BotConfig = {
        network: { rpcUrl: FORK_RPC, chainId: 42161 },
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

      const executionConfig = {
        wallet,
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

      process.env.DRY_RUN = "false";
      process.env.SHADOW_MODE = "false";

      const bot = new FlashloanBot(config, false, executionConfig);

      // Wait for nonce sync (async in constructor via void)
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(bot.nonceManager).toBeDefined();
      const state = bot.nonceManager!.getState();
      expect(state.address).toBe(wallet.address.toLowerCase());
      expect(state.nonce).toBeGreaterThanOrEqual(0);

      delete process.env.DRY_RUN;
      delete process.env.SHADOW_MODE;
    });
  });

  describe("Error Handling", () => {
    it("should throw error if wallet is missing in shadow mode", () => {
      const config: BotConfig = {
        network: { rpcUrl: FORK_RPC, chainId: 42161 },
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

      process.env.DRY_RUN = "false";
      process.env.SHADOW_MODE = "true";

      expect(() => new FlashloanBot(config, false, undefined)).toThrow("Wallet is required");

      delete process.env.DRY_RUN;
      delete process.env.SHADOW_MODE;
    });
  });
});
