import type { BotConfig, DetectorConfig, MonitorConfig } from "./types.js";
import type { MEVProtectionConfig } from "../mev/types.js";

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

/** Well-known Sepolia testnet token addresses (WETH9 used by Uniswap) */
export const SEPOLIA_TOKENS = {
  WETH: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  USDC: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
  USDC_CIRCLE: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
} as const;

/** Sepolia PriceMonitor settings (faster polling, lower thresholds) */
export const SEPOLIA_MONITOR: MonitorConfig = {
  deltaThresholdPercent: 0.01,
  pollIntervalMs: 5_000,
  maxRetries: 3,
};

/** Sepolia OpportunityDetector settings (lower profit bar, smaller loans) */
export const SEPOLIA_DETECTOR: DetectorConfig = {
  minProfitThreshold: 0.0001,
  maxSlippage: 0.005,
  defaultInputAmount: 1,
  gasPriceGwei: 5,
  gasPerSwap: 150_000,
};

/** Default MEV protection: disabled (transactions go to public mempool) */
export const DEFAULT_MEV_CONFIG: MEVProtectionConfig = {
  mode: "none",
};

/** Mainnet MEV protection: Flashbots relay (authKeyHex must be set from env) */
export const MAINNET_MEV_CONFIG: MEVProtectionConfig = {
  mode: "flashbots",
  flashbots: {
    relayUrl: "https://relay.flashbots.net",
    authKeyHex: "", // Must be set from FLASHBOTS_AUTH_KEY env var
    maxBlocksToWait: 5,
    simulateBeforeSend: true,
  },
};

/** Alternative mainnet MEV protection: MEV Blocker RPC (no auth key needed) */
export const MEV_BLOCKER_CONFIG: MEVProtectionConfig = {
  mode: "mev_blocker",
  mevBlocker: {
    rpcUrl: "https://rpc.mevblocker.io",
  },
};

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
