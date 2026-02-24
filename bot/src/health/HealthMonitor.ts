import { EventEmitter } from "node:events";
import type {
  Alert,
  HealthMonitorConfig,
  HealthStats,
  HealthStatus,
  PnLReport,
  TokenBalance,
} from "./types.js";

/** Timestamped record of a success or error event for rolling window calculation */
interface EventRecord {
  /** Whether this was an error (true) or success (false) */
  isError: boolean;
  /** Timestamp in ms */
  timestamp: number;
}

/**
 * Monitors bot health: wallet balances, P&L, error rates, and uptime.
 *
 * Emits events for alerting on low balances, high error rates,
 * P&L threshold breaches, and periodic heartbeats.
 *
 * Follows the same EventEmitter pattern as PriceMonitor and ExecutionEngine.
 */
export class HealthMonitor extends EventEmitter {
  private readonly config: HealthMonitorConfig;

  // Lifecycle
  private running = false;
  private startTime: number;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatCount = 0;

  // Balance tracking
  private readonly balances = new Map<string, TokenBalance>();

  // P&L tracking
  private readonly profits = new Map<string, bigint>();
  private readonly losses = new Map<string, bigint>();
  private gasCost = 0n;
  private profitableCount = 0;
  private unprofitableCount = 0;

  // Error rate tracking (rolling window)
  private readonly eventLog: EventRecord[] = [];
  private totalErrors = 0;
  private totalSuccesses = 0;

  constructor(config: HealthMonitorConfig) {
    super();
    this.config = config;
    this.startTime = Date.now();
  }

  /** Whether the monitor is currently running */
  get isRunning(): boolean {
    return this.running;
  }

  /** Start the heartbeat loop */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.startTime = Date.now();

    // Emit initial heartbeat immediately
    this.emitHeartbeat();

    // Schedule periodic heartbeats
    this.heartbeatTimer = setInterval(
      () => this.emitHeartbeat(),
      this.config.heartbeatIntervalMs,
    );
  }

  /** Stop the heartbeat loop and clean up timers */
  stop(): void {
    this.running = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ─────────────────────────────────────────────
  // Balance Monitoring
  // ─────────────────────────────────────────────

  /**
   * Update the balance for a tracked token.
   * Emits `lowBalance` and `alert` if the balance is below the configured threshold.
   */
  updateBalance(token: string, balance: bigint): void {
    const threshold = this.config.balanceThresholds.get(token) ?? 0n;
    const isBelowThreshold = threshold > 0n && balance < threshold;

    const tokenBalance: TokenBalance = {
      token,
      balance,
      threshold,
      isBelowThreshold,
      lastUpdated: Date.now(),
    };

    this.balances.set(token, tokenBalance);

    if (isBelowThreshold) {
      this.emit("lowBalance", tokenBalance);
      this.emitAlert({
        type: "lowBalance",
        severity: "warning",
        message: `Low balance for ${token}: ${balance} wei (threshold: ${threshold} wei)`,
        timestamp: Date.now(),
      });
    }
  }

  // ─────────────────────────────────────────────
  // P&L Tracking
  // ─────────────────────────────────────────────

  /** Record a profit for a token */
  recordProfit(token: string, amount: bigint): void {
    const current = this.profits.get(token) ?? 0n;
    this.profits.set(token, current + amount);
    this.profitableCount++;

    const pnl = this.getPnL();
    this.emit("pnlUpdate", pnl);
    this.checkPnLThreshold(pnl);
  }

  /** Record a loss for a token */
  recordLoss(token: string, amount: bigint): void {
    const current = this.losses.get(token) ?? 0n;
    this.losses.set(token, current + amount);
    this.unprofitableCount++;

    const pnl = this.getPnL();
    this.emit("pnlUpdate", pnl);
    this.checkPnLThreshold(pnl);
  }

  /** Record a gas cost (in wei) */
  recordGasCost(amount: bigint): void {
    this.gasCost += amount;

    const pnl = this.getPnL();
    this.emit("pnlUpdate", pnl);
    this.checkPnLThreshold(pnl);
  }

  /** Get the current P&L report */
  getPnL(): PnLReport {
    // Build net P&L per token
    const allTokens = new Set([...this.profits.keys(), ...this.losses.keys()]);
    const netPnL = new Map<string, bigint>();
    let overallNet = 0n;

    for (const token of allTokens) {
      const profit = this.profits.get(token) ?? 0n;
      const loss = this.losses.get(token) ?? 0n;
      const net = profit - loss;
      netPnL.set(token, net);
      overallNet += net;
    }

    // Subtract gas costs from overall
    overallNet -= this.gasCost;

    return {
      totalProfit: new Map(this.profits),
      totalLoss: new Map(this.losses),
      totalGasCost: this.gasCost,
      netPnL,
      overallNetPnL: overallNet,
      profitableCount: this.profitableCount,
      unprofitableCount: this.unprofitableCount,
      timestamp: Date.now(),
    };
  }

  // ─────────────────────────────────────────────
  // Error Rate Tracking
  // ─────────────────────────────────────────────

  /** Record an error event */
  recordError(error: string): void {
    this.eventLog.push({ isError: true, timestamp: Date.now() });
    this.totalErrors++;

    const rate = this.getErrorRate();
    if (rate / 100 >= this.config.errorRateThreshold) {
      this.emit("highErrorRate", rate, this.config.errorRateThreshold * 100);
      this.emitAlert({
        type: "highErrorRate",
        severity: "warning",
        message: `Error rate ${rate.toFixed(1)}% exceeds threshold ${(this.config.errorRateThreshold * 100).toFixed(1)}%: ${error}`,
        timestamp: Date.now(),
      });
    }
  }

  /** Record a success event */
  recordSuccess(): void {
    this.eventLog.push({ isError: false, timestamp: Date.now() });
    this.totalSuccesses++;
  }

  /**
   * Get the current error rate as a percentage (0-100).
   * Calculated over the configured rolling window.
   */
  getErrorRate(): number {
    const now = Date.now();
    const windowStart = now - this.config.errorWindowMs;

    // Filter events within the rolling window
    const windowEvents = this.eventLog.filter((e) => e.timestamp >= windowStart);

    if (windowEvents.length === 0) return 0;

    const errorCount = windowEvents.filter((e) => e.isError).length;
    return (errorCount / windowEvents.length) * 100;
  }

  // ─────────────────────────────────────────────
  // Heartbeat
  // ─────────────────────────────────────────────

  /** Get the current health status (also used by heartbeat emission) */
  heartbeat(): HealthStatus {
    const pnl = this.getPnL();

    // Count tokens with low balance
    let lowBalanceCount = 0;
    for (const balance of this.balances.values()) {
      if (balance.isBelowThreshold) lowBalanceCount++;
    }

    return {
      running: this.running,
      uptimeMs: Date.now() - this.startTime,
      errorRate: this.getErrorRate(),
      lowBalanceCount,
      overallNetPnL: pnl.overallNetPnL,
      timestamp: Date.now(),
    };
  }

  // ─────────────────────────────────────────────
  // Stats
  // ─────────────────────────────────────────────

  /** Get aggregated health statistics */
  getStats(): HealthStats {
    return {
      totalErrors: this.totalErrors,
      totalSuccesses: this.totalSuccesses,
      errorRate: this.getErrorRate(),
      startTime: this.startTime,
      uptimeMs: Date.now() - this.startTime,
      heartbeatCount: this.heartbeatCount,
      balances: [...this.balances.values()],
      pnl: this.getPnL(),
    };
  }

  // ─────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────

  /** Emit a heartbeat event with current health status */
  private emitHeartbeat(): void {
    this.heartbeatCount++;
    const status = this.heartbeat();
    this.emit("heartbeat", status);
  }

  /** Emit a generic alert event */
  private emitAlert(alert: Alert): void {
    this.emit("alert", alert);
  }

  /** Check if P&L has crossed the alert threshold */
  private checkPnLThreshold(pnl: PnLReport): void {
    if (pnl.overallNetPnL < this.config.pnlAlertThresholdWei) {
      this.emitAlert({
        type: "pnlThreshold",
        severity: "critical",
        message: `P&L (${pnl.overallNetPnL} wei) dropped below threshold (${this.config.pnlAlertThresholdWei} wei)`,
        timestamp: Date.now(),
      });
    }
  }
}
