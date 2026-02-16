import type { PreparedTransaction } from "../builder/types.js";

/** Execution result status */
export type ExecutionStatus =
  | "pending"
  | "submitted"
  | "confirmed"
  | "reverted"
  | "failed"
  | "replaced"
  | "cancelled";

/** Result of a transaction execution attempt */
export interface ExecutionResult {
  /** Current status */
  status: ExecutionStatus;
  /** Transaction hash (available after submission) */
  txHash?: string;
  /** Block number of confirmation */
  blockNumber?: number;
  /** Gas used by the transaction */
  gasUsed?: bigint;
  /** Effective gas price paid */
  effectiveGasPrice?: bigint;
  /** Actual gas cost in wei */
  gasCostWei?: bigint;
  /** Parsed revert reason (if reverted) */
  revertReason?: string;
  /** Error message (if failed) */
  error?: string;
  /** Timestamp of result */
  timestamp: number;
}

/** Profit/loss record for a single execution */
export interface ProfitRecord {
  /** Transaction hash */
  txHash: string;
  /** Flash loan token address */
  token: string;
  /** Flash loan amount in wei */
  flashLoanAmount: bigint;
  /** Gas cost in wei */
  gasCostWei: bigint;
  /** Whether the execution was profitable (after gas) */
  profitable: boolean;
  /** Block number */
  blockNumber: number;
  /** Timestamp */
  timestamp: number;
}

/** Execution engine configuration */
export interface ExecutionEngineConfig {
  /** Number of block confirmations to wait for. Default: 1 */
  confirmations?: number;
  /** Transaction confirmation timeout in ms. Default: 120_000 (2 min) */
  confirmationTimeoutMs?: number;
  /** Maximum consecutive failures before pausing. Default: 5 */
  maxConsecutiveFailures?: number;
  /** Whether to run in dry-run mode (no actual submissions). Default: false */
  dryRun?: boolean;
  /** Gas price multiplier for speed-up replacements (e.g., 1.1 = +10%). Default: 1.125 */
  speedUpMultiplier?: number;
}

/** Internal state of a tracked transaction */
export interface TrackedTransaction {
  /** The prepared transaction that was submitted */
  tx: PreparedTransaction;
  /** Transaction hash */
  txHash: string;
  /** Submission timestamp */
  submittedAt: number;
  /** Current status */
  status: ExecutionStatus;
  /** Number of replacement attempts */
  replacements: number;
}

/** Events emitted by ExecutionEngine */
export interface ExecutionEngineEvents {
  submitted: (txHash: string, tx: PreparedTransaction) => void;
  confirmed: (result: ExecutionResult) => void;
  reverted: (result: ExecutionResult) => void;
  failed: (result: ExecutionResult) => void;
  replaced: (oldHash: string, newHash: string) => void;
  paused: (reason: string) => void;
  profit: (record: ProfitRecord) => void;
  error: (error: Error) => void;
  simulationFailed: (reason: string, tx: PreparedTransaction) => void;
}
