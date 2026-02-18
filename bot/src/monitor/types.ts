import type { Provider } from "ethers";

/** Supported DEX protocols */
export type DEXProtocol = "uniswap_v2" | "uniswap_v3" | "sushiswap" | "sushiswap_v3";

/** A token pair on a specific DEX */
export interface PoolConfig {
  /** Human-readable label (e.g. "WETH/USDC on UniV2") */
  label: string;
  /** DEX protocol identifier */
  dex: DEXProtocol;
  /** Pool/pair contract address */
  poolAddress: string;
  /** Token A address */
  token0: string;
  /** Token B address */
  token1: string;
  /** Token A decimals */
  decimals0: number;
  /** Token B decimals */
  decimals1: number;
  /** Uniswap V3 fee tier (bps) — only for uniswap_v3 */
  feeTier?: number;
}

/** A snapshot of a pool's price at a point in time */
export interface PriceSnapshot {
  pool: PoolConfig;
  /** Price of token0 in terms of token1 */
  price: number;
  /** Inverse: price of token1 in terms of token0 */
  inversePrice: number;
  /** Block number when this price was observed */
  blockNumber: number;
  /** Timestamp (ms) when this snapshot was taken */
  timestamp: number;
}

/** Emitted when a price delta exceeds the configured threshold */
export interface PriceDelta {
  /** The token pair key (e.g. "WETH/USDC") */
  pair: string;
  /** Pool with the lower price */
  buyPool: PriceSnapshot;
  /** Pool with the higher price */
  sellPool: PriceSnapshot;
  /** Percentage price difference (0-100) */
  deltaPercent: number;
  /** Timestamp (ms) */
  timestamp: number;
}

/** Configuration for the PriceMonitor */
export interface PriceMonitorConfig {
  /** Ethers.js provider for on-chain reads */
  provider: Provider;
  /** Pools to monitor */
  pools: PoolConfig[];
  /** Minimum price delta (%) to emit an event. Default: 0.5 */
  deltaThresholdPercent?: number;
  /** Polling interval in ms. Default: 12000 (one Ethereum block) */
  pollIntervalMs?: number;
  /** Maximum retries per pool fetch before marking stale. Default: 3 */
  maxRetries?: number;
}

/** Events emitted by PriceMonitor */
export interface PriceMonitorEvents {
  priceUpdate: (snapshot: PriceSnapshot) => void;
  opportunity: (delta: PriceDelta) => void;
  error: (error: Error, pool: PoolConfig) => void;
  stale: (pool: PoolConfig) => void;
}
