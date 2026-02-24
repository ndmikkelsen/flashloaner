/** Configuration for the HealthMonitor */
export interface HealthMonitorConfig {
  /** Balance thresholds: token address (or "ETH") -> minimum balance in wei */
  balanceThresholds: Map<string, bigint>;

  /** Error rate threshold as a decimal (e.g., 0.1 for 10%). Default: 0.1 */
  errorRateThreshold: number;

  /** Rolling window (ms) for error rate calculation. Default: 60_000 */
  errorWindowMs: number;

  /** Heartbeat emission interval in ms. Default: 30_000 */
  heartbeatIntervalMs: number;

  /** Alert when cumulative P&L drops below this value (wei). Default: 0n */
  pnlAlertThresholdWei: bigint;
}

/** Current balance for a tracked token */
export interface TokenBalance {
  /** Token address (or "ETH" for native) */
  token: string;
  /** Current balance in wei */
  balance: bigint;
  /** Configured minimum threshold in wei */
  threshold: bigint;
  /** Whether balance is below threshold */
  isBelowThreshold: boolean;
  /** Timestamp of last update */
  lastUpdated: number;
}

/** Profit and loss report */
export interface PnLReport {
  /** Total profit earned per token (token -> wei) */
  totalProfit: Map<string, bigint>;
  /** Total losses per token (token -> wei) */
  totalLoss: Map<string, bigint>;
  /** Total gas costs in wei */
  totalGasCost: bigint;
  /** Net P&L per token (token -> wei, profit minus loss) */
  netPnL: Map<string, bigint>;
  /** Overall net P&L across all tokens minus gas (wei) */
  overallNetPnL: bigint;
  /** Number of profitable trades */
  profitableCount: number;
  /** Number of unprofitable trades */
  unprofitableCount: number;
  /** Timestamp of the report */
  timestamp: number;
}

/** Health status for heartbeat */
export interface HealthStatus {
  /** Whether the monitor is running */
  running: boolean;
  /** Uptime in ms */
  uptimeMs: number;
  /** Current error rate (0-100 percentage) */
  errorRate: number;
  /** Number of tokens with low balance */
  lowBalanceCount: number;
  /** Overall net P&L (wei) */
  overallNetPnL: bigint;
  /** Timestamp */
  timestamp: number;
}

/** Aggregated health statistics */
export interface HealthStats {
  /** Total number of errors recorded */
  totalErrors: number;
  /** Total number of successes recorded */
  totalSuccesses: number;
  /** Current error rate (percentage, 0-100) */
  errorRate: number;
  /** Start time of the monitor */
  startTime: number;
  /** Uptime in ms */
  uptimeMs: number;
  /** Number of heartbeats emitted */
  heartbeatCount: number;
  /** Token balances */
  balances: TokenBalance[];
  /** P&L report */
  pnl: PnLReport;
}

/** Alert severity levels */
export type AlertSeverity = "info" | "warning" | "critical";

/** Generic alert payload */
export interface Alert {
  /** Alert type */
  type: "lowBalance" | "highErrorRate" | "pnlThreshold" | "custom";
  /** Severity level */
  severity: AlertSeverity;
  /** Human-readable message */
  message: string;
  /** Timestamp */
  timestamp: number;
}

/** Events emitted by HealthMonitor */
export interface HealthMonitorEvents {
  lowBalance: (balance: TokenBalance) => void;
  highErrorRate: (rate: number, threshold: number) => void;
  pnlUpdate: (report: PnLReport) => void;
  heartbeat: (status: HealthStatus) => void;
  alert: (alert: Alert) => void;
}
