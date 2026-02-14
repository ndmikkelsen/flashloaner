import type { BotConfig, DetectorConfig, MonitorConfig } from "./types.js";

/** Default PriceMonitor settings */
export const DEFAULT_MONITOR: MonitorConfig = {
  deltaThresholdPercent: 0.3,
  pollIntervalMs: 12_000,
  maxRetries: 3,
};

/** Default OpportunityDetector settings */
export const DEFAULT_DETECTOR: DetectorConfig = {
  minProfitThreshold: 0.01,
  maxSlippage: 0.005,
  defaultInputAmount: 10,
  gasPriceGwei: 30,
  gasPerSwap: 150_000,
};

/** Well-known mainnet token addresses */
export const MAINNET_TOKENS = {
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
} as const;

/** Default full bot config (requires network.rpcUrl to be overridden) */
export const DEFAULT_CONFIG: BotConfig = {
  network: {
    rpcUrl: "", // must be provided
    chainId: 1,
  },
  pools: [],
  monitor: DEFAULT_MONITOR,
  detector: DEFAULT_DETECTOR,
  logLevel: "info",
};
