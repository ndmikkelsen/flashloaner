import { describe, it, expect } from "vitest";
import {
  parseEnv,
  buildConfig,
  validateConfig,
  ConfigError,
  DEFAULT_CONFIG,
} from "../../src/config/index.js";

describe("parseEnv", () => {
  it("should parse valid environment variables", () => {
    const env = {
      RPC_URL: "https://eth-mainnet.example.com",
      CHAIN_ID: "1",
      LOG_LEVEL: "info",
    };
    const result = parseEnv(env);
    expect(result.RPC_URL).toBe("https://eth-mainnet.example.com");
    expect(result.CHAIN_ID).toBe(1);
    expect(result.LOG_LEVEL).toBe("info");
  });

  it("should accept MAINNET_RPC_URL as fallback", () => {
    const env = { MAINNET_RPC_URL: "https://mainnet.example.com" };
    const result = parseEnv(env);
    expect(result.RPC_URL).toBe("https://mainnet.example.com");
  });

  it("should throw when no RPC URL is provided", () => {
    expect(() => parseEnv({})).toThrow(ConfigError);
    expect(() => parseEnv({})).toThrow("RPC_URL");
  });

  it("should throw on invalid CHAIN_ID", () => {
    const env = { RPC_URL: "https://rpc.example.com", CHAIN_ID: "abc" };
    expect(() => parseEnv(env)).toThrow(ConfigError);
    expect(() => parseEnv(env)).toThrow("CHAIN_ID");
  });

  it("should throw on invalid LOG_LEVEL", () => {
    const env = { RPC_URL: "https://rpc.example.com", LOG_LEVEL: "verbose" };
    expect(() => parseEnv(env)).toThrow(ConfigError);
    expect(() => parseEnv(env)).toThrow("LOG_LEVEL");
  });

  it("should default CHAIN_ID to 1 and LOG_LEVEL to info", () => {
    const env = { RPC_URL: "https://rpc.example.com" };
    const result = parseEnv(env);
    expect(result.CHAIN_ID).toBe(1);
    expect(result.LOG_LEVEL).toBe("info");
  });

  it("should parse optional numeric overrides", () => {
    const env = {
      RPC_URL: "https://rpc.example.com",
      MIN_PROFIT_THRESHOLD: "0.05",
      GAS_PRICE_GWEI: "50",
      POLL_INTERVAL_MS: "6000",
    };
    const result = parseEnv(env);
    expect(result.MIN_PROFIT_THRESHOLD).toBe(0.05);
    expect(result.GAS_PRICE_GWEI).toBe(50);
    expect(result.POLL_INTERVAL_MS).toBe(6000);
  });
});

describe("buildConfig", () => {
  const baseEnv = {
    RPC_URL: "https://rpc.example.com",
    CHAIN_ID: 1,
    LOG_LEVEL: "info" as const,
  };

  it("should build config with defaults", () => {
    const config = buildConfig(baseEnv);
    expect(config.network.rpcUrl).toBe("https://rpc.example.com");
    expect(config.network.chainId).toBe(1);
    expect(config.monitor.deltaThresholdPercent).toBe(0.3);
    expect(config.detector.minProfitThreshold).toBe(0.01);
  });

  it("should apply env var overrides", () => {
    const envWithOverrides = {
      ...baseEnv,
      MIN_PROFIT_THRESHOLD: 0.05,
      GAS_PRICE_GWEI: 50,
      POLL_INTERVAL_MS: 6000,
    };
    const config = buildConfig(envWithOverrides);
    expect(config.detector.minProfitThreshold).toBe(0.05);
    expect(config.detector.gasPriceGwei).toBe(50);
    expect(config.monitor.pollIntervalMs).toBe(6000);
  });

  it("should apply explicit overrides over env vars", () => {
    const envWithOverrides = { ...baseEnv, GAS_PRICE_GWEI: 50 };
    const config = buildConfig(envWithOverrides, {
      detector: { ...DEFAULT_CONFIG.detector, gasPriceGwei: 100 },
    });
    expect(config.detector.gasPriceGwei).toBe(100);
  });

  it("should include WS_URL when provided", () => {
    const env = { ...baseEnv, WS_URL: "wss://ws.example.com" };
    const config = buildConfig(env);
    expect(config.network.wsUrl).toBe("wss://ws.example.com");
  });
});

describe("validateConfig", () => {
  const valid = buildConfig({
    RPC_URL: "https://rpc.example.com",
    CHAIN_ID: 1,
    LOG_LEVEL: "info",
  });

  it("should accept valid config", () => {
    expect(() => validateConfig(valid)).not.toThrow();
  });

  it("should reject empty rpcUrl", () => {
    const bad = { ...valid, network: { ...valid.network, rpcUrl: "" } };
    expect(() => validateConfig(bad)).toThrow("rpcUrl");
  });

  it("should reject negative chainId", () => {
    const bad = { ...valid, network: { ...valid.network, chainId: -1 } };
    expect(() => validateConfig(bad)).toThrow("chainId");
  });

  it("should reject negative deltaThresholdPercent", () => {
    const bad = {
      ...valid,
      monitor: { ...valid.monitor, deltaThresholdPercent: -1 },
    };
    expect(() => validateConfig(bad)).toThrow("deltaThresholdPercent");
  });

  it("should reject negative minProfitThreshold", () => {
    const bad = {
      ...valid,
      detector: { ...valid.detector, minProfitThreshold: -0.01 },
    };
    expect(() => validateConfig(bad)).toThrow("minProfitThreshold");
  });

  it("should reject maxSlippage > 1", () => {
    const bad = {
      ...valid,
      detector: { ...valid.detector, maxSlippage: 1.5 },
    };
    expect(() => validateConfig(bad)).toThrow("maxSlippage");
  });
});
