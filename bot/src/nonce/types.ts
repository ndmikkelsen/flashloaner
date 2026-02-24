/** Persisted nonce state for crash-safe recovery */
export interface NonceState {
  /** Current nonce (next nonce to use) */
  nonce: number;
  /** Transaction hash of the pending transaction (if any) */
  txHash?: string;
  /** Timestamp when the pending transaction was submitted */
  submittedAt?: number;
  /** Account address this nonce state belongs to */
  address: string;
}

/** Nonce manager configuration */
export interface NonceManagerConfig {
  /** Ethers.js provider for querying on-chain nonce */
  provider: { getTransactionCount(address: string, blockTag?: string): Promise<number> };
  /** Account address to manage nonces for */
  address: string;
  /** Path to nonce state file. Default: .data/nonce.json */
  statePath?: string;
  /** Timeout in ms after which a pending transaction is considered dropped. Default: 300000 (5 min) */
  pendingTimeoutMs?: number;
}

/** Result of nonce acquisition */
export interface NonceAcquisitionResult {
  /** The nonce to use for the next transaction */
  nonce: number;
  /** Whether a pending transaction was detected and resolved */
  hadPending: boolean;
  /** If hadPending, whether the pending transaction was confirmed or dropped */
  pendingStatus?: "confirmed" | "dropped";
}
