import type { MonitorConfig, DetectorConfig, PoolDefinition } from "../types.js";
import type { MEVProtectionConfig } from "../../mev/types.js";

/**
 * Chain-specific configuration for multi-chain bot operation.
 *
 * Each chain (Ethereum, Arbitrum, etc.) has its own config file implementing this interface.
 * This separates chain-specific addresses, gas parameters, and DEX configs from shared bot logic.
 */
export interface ChainConfig {
  /** Chain ID (1 = Ethereum mainnet, 42161 = Arbitrum, 11155111 = Sepolia, etc.) */
  chainId: number;
  /** Human-readable chain name */
  chainName: string;

  // ──── RPC Configuration ────────────────────────────────────────

  /** Primary RPC URL (loaded from env at runtime) */
  rpcUrl: string;
  /** Optional fallback RPC URL */
  fallbackRpcUrl?: string;

  // ──── Protocol Addresses ───────────────────────────────────────

  /** Flash loan and DeFi protocol addresses */
  protocols: {
    /** Aave V3 Pool address */
    aaveV3Pool: string;
    /** Balancer Vault address (for zero-fee flash loans) */
    balancerVault: string;
  };

  // ──── DEX Configuration ────────────────────────────────────────

  /** DEX router and factory addresses by protocol */
  dexes: {
    uniswapV3?: {
      factory: string;
      router: string;
      quoter: string;
    };
    uniswapV2?: {
      router: string;
      factory: string;
    };
    sushiswapV2?: {
      router: string;
      factory: string;
    };
    camelot?: {
      router: string;
      factory: string;
    };
  };

  // ──── Token Addresses ──────────────────────────────────────────

  /** Well-known token addresses on this chain */
  tokens: Record<string, string>;

  // ──── Gas Parameters ───────────────────────────────────────────

  /** Gas-related configuration for cost estimation */
  gas: {
    /** Maximum gas price in gwei (exceeding this stops execution) */
    maxGasPriceGwei: number;
    /** Estimated gas per swap step */
    gasPerSwap: number;
  };

  // ──── Monitor and Detector Overrides ───────────────────────────

  /** PriceMonitor configuration (chain-specific polling intervals, thresholds) */
  monitor: MonitorConfig;

  /** OpportunityDetector configuration (chain-specific profit thresholds, slippage) */
  detector: DetectorConfig;

  // ──── MEV Protection ───────────────────────────────────────────

  /** MEV protection strategy (Flashbots, MEV Blocker, or none) */
  mev: MEVProtectionConfig;

  // ──── Pool Definitions ─────────────────────────────────────────

  /** Pre-configured pools to monitor on this chain */
  pools: PoolDefinition[];
}
