import type { BotConfig, EnvVars } from "./types.js";
import { DEFAULT_CONFIG } from "./defaults.js";

/** Errors thrown during config validation */
export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly field: string,
  ) {
    super(`Config error [${field}]: ${message}`);
    this.name = "ConfigError";
  }
}

/** Parse and validate environment variables into EnvVars */
export function parseEnv(env: Record<string, string | undefined>): EnvVars {
  const rpcUrl = env.RPC_URL ?? env.MAINNET_RPC_URL;
  if (!rpcUrl) {
    throw new ConfigError(
      "RPC_URL or MAINNET_RPC_URL must be set",
      "RPC_URL",
    );
  }

  const chainId = env.CHAIN_ID ? parseInt(env.CHAIN_ID, 10) : 1;
  if (isNaN(chainId) || chainId <= 0) {
    throw new ConfigError("CHAIN_ID must be a positive integer", "CHAIN_ID");
  }

  const logLevel = (env.LOG_LEVEL ?? "info") as EnvVars["LOG_LEVEL"];
  if (!["debug", "info", "warn", "error"].includes(logLevel)) {
    throw new ConfigError(
      "LOG_LEVEL must be debug|info|warn|error",
      "LOG_LEVEL",
    );
  }

  return {
    RPC_URL: rpcUrl,
    WS_URL: env.WS_URL,
    CHAIN_ID: chainId,
    LOG_LEVEL: logLevel,
    MIN_PROFIT_THRESHOLD: env.MIN_PROFIT_THRESHOLD
      ? parseFloat(env.MIN_PROFIT_THRESHOLD)
      : undefined,
    GAS_PRICE_GWEI: env.GAS_PRICE_GWEI
      ? parseFloat(env.GAS_PRICE_GWEI)
      : undefined,
    POLL_INTERVAL_MS: env.POLL_INTERVAL_MS
      ? parseInt(env.POLL_INTERVAL_MS, 10)
      : undefined,
  };
}

/** Build a full BotConfig from env vars + optional overrides */
export function buildConfig(
  envVars: EnvVars,
  overrides: Partial<BotConfig> = {},
): BotConfig {
  const config: BotConfig = {
    ...DEFAULT_CONFIG,
    ...overrides,
    network: {
      rpcUrl: envVars.RPC_URL,
      wsUrl: envVars.WS_URL,
      chainId: envVars.CHAIN_ID,
      ...overrides.network,
    },
    monitor: {
      ...DEFAULT_CONFIG.monitor,
      ...(envVars.POLL_INTERVAL_MS !== undefined && {
        pollIntervalMs: envVars.POLL_INTERVAL_MS,
      }),
      ...overrides.monitor,
    },
    detector: {
      ...DEFAULT_CONFIG.detector,
      ...(envVars.MIN_PROFIT_THRESHOLD !== undefined && {
        minProfitThreshold: envVars.MIN_PROFIT_THRESHOLD,
      }),
      ...(envVars.GAS_PRICE_GWEI !== undefined && {
        gasPriceGwei: envVars.GAS_PRICE_GWEI,
      }),
      ...overrides.detector,
    },
    logLevel: envVars.LOG_LEVEL,
  };

  validateConfig(config);
  return config;
}

/** Validate a complete BotConfig */
export function validateConfig(config: BotConfig): void {
  if (!config.network.rpcUrl) {
    throw new ConfigError("rpcUrl is required", "network.rpcUrl");
  }

  if (config.network.chainId <= 0) {
    throw new ConfigError(
      "chainId must be positive",
      "network.chainId",
    );
  }

  if (config.monitor.deltaThresholdPercent < 0) {
    throw new ConfigError(
      "deltaThresholdPercent must be >= 0",
      "monitor.deltaThresholdPercent",
    );
  }

  if (config.detector.minProfitThreshold < 0) {
    throw new ConfigError(
      "minProfitThreshold must be >= 0",
      "detector.minProfitThreshold",
    );
  }

  if (config.detector.maxSlippage < 0 || config.detector.maxSlippage > 1) {
    throw new ConfigError(
      "maxSlippage must be between 0 and 1",
      "detector.maxSlippage",
    );
  }
}
