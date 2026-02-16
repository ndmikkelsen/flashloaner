/**
 * MEV protection types for Flashbots and MEV Blocker integration.
 *
 * These types configure how transactions are submitted to avoid
 * the public mempool and protect against sandwich/front-running attacks.
 */

/** Flashbots relay configuration */
export interface FlashbotsConfig {
  /** Flashbots relay URL. Default: https://relay.flashbots.net */
  relayUrl: string;
  /** Private key (hex) for Flashbots auth identity. NOT the bot wallet key. */
  authKeyHex: string;
  /** Maximum blocks to wait for bundle inclusion before giving up. Default: 5 */
  maxBlocksToWait: number;
  /** Whether to simulate bundles via eth_callBundle before sending. Default: true */
  simulateBeforeSend: boolean;
}

/** MEV Blocker RPC configuration */
export interface MEVBlockerConfig {
  /** MEV Blocker RPC endpoint. Default: https://rpc.mevblocker.io */
  rpcUrl: string;
}

/** Top-level MEV protection configuration */
export interface MEVProtectionConfig {
  /** Protection mode: flashbots for bundle submission, mev_blocker for private RPC, none for public mempool */
  mode: "flashbots" | "mev_blocker" | "none";
  /** Flashbots configuration (required when mode is "flashbots") */
  flashbots?: FlashbotsConfig;
  /** MEV Blocker configuration (required when mode is "mev_blocker") */
  mevBlocker?: MEVBlockerConfig;
}

/** Result of a Flashbots bundle simulation (eth_callBundle) */
export interface BundleSimulation {
  /** Whether the simulation succeeded without revert */
  success: boolean;
  /** Total gas used by the bundle */
  gasUsed: bigint;
  /** Effective gas price the bundle would pay */
  effectiveGasPrice: bigint;
  /** Error message if simulation failed */
  error?: string;
}

/** Result of a Flashbots bundle submission */
export interface BundleResult {
  /** Flashbots bundle hash */
  bundleHash: string;
  /** Target block number for inclusion */
  blockNumber: number;
  /** Whether the bundle was included on-chain */
  included: boolean;
}

/** Minimal provider interface needed by MEV signers */
export interface MinimalProvider {
  /** Get the current block number */
  getBlockNumber(): Promise<number>;
  /** Get block details by number. Returns null if block not found. */
  getBlock(blockNumber: number): Promise<{ timestamp: number } | null>;
}
