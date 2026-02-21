import type { DEXProtocol } from "../monitor/types.js";

/** Top-level bot configuration */
export interface BotConfig {
  /** Network / RPC configuration */
  network: NetworkConfig;
  /** Pool monitoring configuration */
  pools: PoolDefinition[];
  /** PriceMonitor settings */
  monitor: MonitorConfig;
  /** OpportunityDetector settings */
  detector: DetectorConfig;
  /** Logging level */
  logLevel: "debug" | "info" | "warn" | "error";
}

/** Network connection settings */
export interface NetworkConfig {
  /** JSON-RPC HTTP URL */
  rpcUrl: string;
  /** WebSocket URL (optional, enables real-time events) */
  wsUrl?: string;
  /** Chain ID (1 = mainnet, 42161 = Arbitrum, etc.) */
  chainId: number;
}

/** A pool to monitor — used in config files */
export interface PoolDefinition {
  label: string;
  dex: DEXProtocol;
  poolAddress: string;
  token0: string;
  token1: string;
  decimals0: number;
  decimals1: number;
  feeTier?: number;
  /** Invert raw on-chain price (for TJ LB pools where tokenX/tokenY != hex sort order) */
  invertPrice?: boolean;
}

/** PriceMonitor configuration subset */
export interface MonitorConfig {
  /** Minimum price delta (%) to trigger analysis. Default: 0.3 */
  deltaThresholdPercent: number;
  /** Polling interval in ms. Default: 12000 */
  pollIntervalMs: number;
  /** Max consecutive fetch failures before stale. Default: 3 */
  maxRetries: number;
  /** Minimum WETH reserve for V2 pools to be viable (ETH). Default: 0 (disabled) */
  minReserveWeth?: number;
  /** WETH address for liquidity checks */
  wethAddress?: string;
}

/** OpportunityDetector configuration subset */
export interface DetectorConfig {
  /** Minimum net profit (ETH) to emit opportunity. Default: 0.01 */
  minProfitThreshold: number;
  /** Max slippage as decimal (0.005 = 0.5%). Default: 0.005 */
  maxSlippage: number;
  /** Default flash loan amount (ETH). Default: 10 */
  defaultInputAmount: number;
  /** Gas price in gwei. Default: 30 */
  gasPriceGwei: number;
  /** Gas per swap step. Default: 150000 */
  gasPerSwap: number;
}

/** Validated environment variables */
export interface EnvVars {
  RPC_URL: string;
  WS_URL?: string;
  CHAIN_ID: number;
  LOG_LEVEL: BotConfig["logLevel"];
  MIN_PROFIT_THRESHOLD?: number;
  GAS_PRICE_GWEI?: number;
  POLL_INTERVAL_MS?: number;
}
