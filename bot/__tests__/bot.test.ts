import { describe, it, expect, vi, afterEach } from "vitest";
import { FlashloanBot, BOT_VERSION } from "../src/index.js";
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

describe("FlashloanBot", () => {
  let bot: FlashloanBot;

  afterEach(async () => {
    await bot?.stop();
  });

  it("should export BOT_VERSION", () => {
    expect(BOT_VERSION).toBe("0.1.0");
  });

  describe("construction", () => {
    it("should create bot with config", () => {
      bot = new FlashloanBot(makeConfig());
      expect(bot.status).toBe("idle");
      expect(bot.config.network.rpcUrl).toBe("https://eth-mainnet.example.com");
    });

    it("should initialize PriceMonitor and OpportunityDetector", () => {
      bot = new FlashloanBot(makeConfig());
      expect(bot.monitor).toBeDefined();
      expect(bot.detector).toBeDefined();
    });
  });

  describe("fromEnv", () => {
    it("should create bot from environment variables", () => {
      const originalEnv = process.env.RPC_URL;
      process.env.RPC_URL = "https://test-rpc.example.com";

      try {
        bot = FlashloanBot.fromEnv({ logLevel: "error" });
        expect(bot.config.network.rpcUrl).toBe("https://test-rpc.example.com");
      } finally {
        if (originalEnv) {
          process.env.RPC_URL = originalEnv;
        } else {
          delete process.env.RPC_URL;
        }
      }
    });
  });

  describe("lifecycle", () => {
    it("should transition to running on start", async () => {
      bot = new FlashloanBot(makeConfig());

      // Mock monitor.start to avoid real RPC calls
      vi.spyOn(bot.monitor, "start").mockImplementation(() => {});

      await bot.start();
      expect(bot.status).toBe("running");
    });

    it("should transition to stopped on stop", async () => {
      bot = new FlashloanBot(makeConfig());
      vi.spyOn(bot.monitor, "start").mockImplementation(() => {});

      await bot.start();
      await bot.stop();
      expect(bot.status).toBe("stopped");
    });

    it("should be idempotent for multiple start calls", async () => {
      bot = new FlashloanBot(makeConfig());
      const startSpy = vi.spyOn(bot.monitor, "start").mockImplementation(() => {});

      await bot.start();
      await bot.start(); // second call should be no-op
      expect(startSpy).toHaveBeenCalledTimes(1);
    });

    it("should be idempotent for multiple stop calls", async () => {
      bot = new FlashloanBot(makeConfig());
      vi.spyOn(bot.monitor, "start").mockImplementation(() => {});

      await bot.start();
      await bot.stop();
      await bot.stop(); // second call should be no-op
      expect(bot.status).toBe("stopped");
    });

    it("should attach detector to monitor on start", async () => {
      bot = new FlashloanBot(makeConfig());
      vi.spyOn(bot.monitor, "start").mockImplementation(() => {});
      const attachSpy = vi.spyOn(bot.detector, "attach");

      await bot.start();
      expect(attachSpy).toHaveBeenCalledWith(bot.monitor);
    });

    it("should detach detector from monitor on stop", async () => {
      bot = new FlashloanBot(makeConfig());
      vi.spyOn(bot.monitor, "start").mockImplementation(() => {});
      const detachSpy = vi.spyOn(bot.detector, "detach");

      await bot.start();
      await bot.stop();
      expect(detachSpy).toHaveBeenCalled();
    });
  });
});
