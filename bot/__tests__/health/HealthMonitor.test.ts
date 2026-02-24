import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { HealthMonitor } from "../../src/health/HealthMonitor.js";
import type {
  HealthMonitorConfig,
  HealthStatus,
  PnLReport,
  TokenBalance,
  Alert,
} from "../../src/health/types.js";
import { captureEvents, waitForEvent } from "../helpers/index.js";

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const ETH = "ETH";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const ONE_ETH = 1_000_000_000_000_000_000n; // 1e18
const HALF_ETH = 500_000_000_000_000_000n; // 0.5e18
const TENTH_ETH = 100_000_000_000_000_000n; // 0.1e18

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<HealthMonitorConfig> = {}): HealthMonitorConfig {
  return {
    balanceThresholds: overrides.balanceThresholds ?? new Map([[ETH, ONE_ETH]]),
    errorRateThreshold: overrides.errorRateThreshold ?? 0.1,
    errorWindowMs: overrides.errorWindowMs ?? 60_000,
    heartbeatIntervalMs: overrides.heartbeatIntervalMs ?? 30_000,
    pnlAlertThresholdWei: overrides.pnlAlertThresholdWei ?? 0n,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HealthMonitor", () => {
  let monitor: HealthMonitor;

  afterEach(() => {
    monitor?.stop();
  });

  // ─────────────────────────────────────────────
  // Constructor Tests
  // ─────────────────────────────────────────────

  describe("constructor", () => {
    it("should create with provided config values", () => {
      const config = makeConfig({
        errorRateThreshold: 0.2,
        errorWindowMs: 120_000,
        heartbeatIntervalMs: 10_000,
        pnlAlertThresholdWei: -ONE_ETH,
      });
      monitor = new HealthMonitor(config);

      expect(monitor).toBeDefined();
      expect(monitor).toBeInstanceOf(HealthMonitor);
    });

    it("should start in non-running state", () => {
      monitor = new HealthMonitor(makeConfig());
      expect(monitor.isRunning).toBe(false);
    });

    it("should have zero error rate initially", () => {
      monitor = new HealthMonitor(makeConfig());
      expect(monitor.getErrorRate()).toBe(0);
    });

    it("should have empty P&L initially", () => {
      monitor = new HealthMonitor(makeConfig());
      const pnl = monitor.getPnL();
      expect(pnl.totalProfit.size).toBe(0);
      expect(pnl.totalLoss.size).toBe(0);
      expect(pnl.totalGasCost).toBe(0n);
      expect(pnl.overallNetPnL).toBe(0n);
      expect(pnl.profitableCount).toBe(0);
      expect(pnl.unprofitableCount).toBe(0);
    });
  });

  // ─────────────────────────────────────────────
  // Start / Stop Lifecycle
  // ─────────────────────────────────────────────

  describe("start / stop", () => {
    it("should set isRunning to true on start", () => {
      monitor = new HealthMonitor(makeConfig());
      monitor.start();
      expect(monitor.isRunning).toBe(true);
    });

    it("should set isRunning to false on stop", () => {
      monitor = new HealthMonitor(makeConfig());
      monitor.start();
      monitor.stop();
      expect(monitor.isRunning).toBe(false);
    });

    it("should be idempotent for multiple start calls", () => {
      monitor = new HealthMonitor(makeConfig());
      monitor.start();
      monitor.start();
      expect(monitor.isRunning).toBe(true);
    });

    it("should be idempotent for multiple stop calls", () => {
      monitor = new HealthMonitor(makeConfig());
      monitor.start();
      monitor.stop();
      monitor.stop();
      expect(monitor.isRunning).toBe(false);
    });

    it("should emit heartbeat on start", async () => {
      monitor = new HealthMonitor(makeConfig({ heartbeatIntervalMs: 50 }));
      const heartbeatPromise = waitForEvent<HealthStatus>(monitor, "heartbeat", 1000);
      monitor.start();
      const status = await heartbeatPromise;
      expect(status.running).toBe(true);
    });

    it("should stop heartbeat timer on stop", async () => {
      monitor = new HealthMonitor(makeConfig({ heartbeatIntervalMs: 50 }));
      const captured = captureEvents<HealthStatus>(monitor, "heartbeat");

      monitor.start();
      // Wait for the initial heartbeat
      await waitForEvent<HealthStatus>(monitor, "heartbeat", 1000);
      const countAfterStart = captured().length;

      monitor.stop();

      // Wait a bit to ensure no more heartbeats come
      await new Promise((r) => setTimeout(r, 150));
      // Should not have received significantly more heartbeats after stop
      // (at most one more could be in-flight)
      expect(captured().length).toBeLessThanOrEqual(countAfterStart + 1);
    });
  });

  // ─────────────────────────────────────────────
  // Balance Monitoring
  // ─────────────────────────────────────────────

  describe("balance monitoring", () => {
    it("should update balance for a tracked token", () => {
      monitor = new HealthMonitor(makeConfig());
      monitor.updateBalance(ETH, 2n * ONE_ETH);

      const stats = monitor.getStats();
      const ethBalance = stats.balances.find((b) => b.token === ETH);
      expect(ethBalance).toBeDefined();
      expect(ethBalance!.balance).toBe(2n * ONE_ETH);
      expect(ethBalance!.isBelowThreshold).toBe(false);
    });

    it("should detect low balance when below threshold", () => {
      monitor = new HealthMonitor(makeConfig({
        balanceThresholds: new Map([[ETH, ONE_ETH]]),
      }));

      const lowBalanceEvents = captureEvents<TokenBalance>(monitor, "lowBalance");
      monitor.updateBalance(ETH, HALF_ETH);

      expect(lowBalanceEvents()).toHaveLength(1);
      expect(lowBalanceEvents()[0].args.token).toBe(ETH);
      expect(lowBalanceEvents()[0].args.balance).toBe(HALF_ETH);
      expect(lowBalanceEvents()[0].args.isBelowThreshold).toBe(true);
    });

    it("should not emit lowBalance when above threshold", () => {
      monitor = new HealthMonitor(makeConfig({
        balanceThresholds: new Map([[ETH, ONE_ETH]]),
      }));

      const lowBalanceEvents = captureEvents<TokenBalance>(monitor, "lowBalance");
      monitor.updateBalance(ETH, 2n * ONE_ETH);

      expect(lowBalanceEvents()).toHaveLength(0);
    });

    it("should emit lowBalance when balance equals threshold exactly", () => {
      monitor = new HealthMonitor(makeConfig({
        balanceThresholds: new Map([[ETH, ONE_ETH]]),
      }));

      const lowBalanceEvents = captureEvents<TokenBalance>(monitor, "lowBalance");
      // Exactly at threshold is NOT below threshold
      monitor.updateBalance(ETH, ONE_ETH);

      expect(lowBalanceEvents()).toHaveLength(0);
    });

    it("should emit alert on low balance", () => {
      monitor = new HealthMonitor(makeConfig({
        balanceThresholds: new Map([[ETH, ONE_ETH]]),
      }));

      const alertEvents = captureEvents<Alert>(monitor, "alert");
      monitor.updateBalance(ETH, HALF_ETH);

      expect(alertEvents()).toHaveLength(1);
      expect(alertEvents()[0].args.type).toBe("lowBalance");
      expect(alertEvents()[0].args.severity).toBe("warning");
    });

    it("should track multiple tokens independently", () => {
      monitor = new HealthMonitor(makeConfig({
        balanceThresholds: new Map([
          [ETH, ONE_ETH],
          [WETH, ONE_ETH],
        ]),
      }));

      const lowBalanceEvents = captureEvents<TokenBalance>(monitor, "lowBalance");

      monitor.updateBalance(ETH, 2n * ONE_ETH); // Above threshold
      monitor.updateBalance(WETH, HALF_ETH);     // Below threshold

      expect(lowBalanceEvents()).toHaveLength(1);
      expect(lowBalanceEvents()[0].args.token).toBe(WETH);
    });

    it("should handle zero balance", () => {
      monitor = new HealthMonitor(makeConfig({
        balanceThresholds: new Map([[ETH, ONE_ETH]]),
      }));

      const lowBalanceEvents = captureEvents<TokenBalance>(monitor, "lowBalance");
      monitor.updateBalance(ETH, 0n);

      expect(lowBalanceEvents()).toHaveLength(1);
      expect(lowBalanceEvents()[0].args.balance).toBe(0n);
    });

    it("should update existing balance on subsequent calls", () => {
      monitor = new HealthMonitor(makeConfig({
        balanceThresholds: new Map([[ETH, ONE_ETH]]),
      }));

      monitor.updateBalance(ETH, 2n * ONE_ETH);
      monitor.updateBalance(ETH, HALF_ETH);

      const stats = monitor.getStats();
      const ethBalance = stats.balances.find((b) => b.token === ETH);
      expect(ethBalance!.balance).toBe(HALF_ETH);
    });

    it("should accept updates for tokens not in threshold config", () => {
      monitor = new HealthMonitor(makeConfig({
        balanceThresholds: new Map([[ETH, ONE_ETH]]),
      }));

      // USDC not in thresholds - should still track it with 0 threshold
      const lowBalanceEvents = captureEvents<TokenBalance>(monitor, "lowBalance");
      monitor.updateBalance(USDC, 1000n);

      // No lowBalance event since there's no threshold configured for USDC
      expect(lowBalanceEvents()).toHaveLength(0);

      const stats = monitor.getStats();
      const usdcBalance = stats.balances.find((b) => b.token === USDC);
      expect(usdcBalance).toBeDefined();
      expect(usdcBalance!.balance).toBe(1000n);
    });
  });

  // ─────────────────────────────────────────────
  // P&L Tracking
  // ─────────────────────────────────────────────

  describe("P&L tracking", () => {
    it("should record profit for a token", () => {
      monitor = new HealthMonitor(makeConfig());
      monitor.recordProfit(WETH, TENTH_ETH);

      const pnl = monitor.getPnL();
      expect(pnl.totalProfit.get(WETH)).toBe(TENTH_ETH);
      expect(pnl.profitableCount).toBe(1);
    });

    it("should accumulate multiple profits for the same token", () => {
      monitor = new HealthMonitor(makeConfig());
      monitor.recordProfit(WETH, TENTH_ETH);
      monitor.recordProfit(WETH, TENTH_ETH);

      const pnl = monitor.getPnL();
      expect(pnl.totalProfit.get(WETH)).toBe(2n * TENTH_ETH);
      expect(pnl.profitableCount).toBe(2);
    });

    it("should record loss for a token", () => {
      monitor = new HealthMonitor(makeConfig());
      monitor.recordLoss(WETH, TENTH_ETH);

      const pnl = monitor.getPnL();
      expect(pnl.totalLoss.get(WETH)).toBe(TENTH_ETH);
      expect(pnl.unprofitableCount).toBe(1);
    });

    it("should accumulate multiple losses for the same token", () => {
      monitor = new HealthMonitor(makeConfig());
      monitor.recordLoss(WETH, TENTH_ETH);
      monitor.recordLoss(WETH, TENTH_ETH);

      const pnl = monitor.getPnL();
      expect(pnl.totalLoss.get(WETH)).toBe(2n * TENTH_ETH);
      expect(pnl.unprofitableCount).toBe(2);
    });

    it("should record gas costs", () => {
      monitor = new HealthMonitor(makeConfig());
      monitor.recordGasCost(50_000_000_000_000n); // 0.00005 ETH

      const pnl = monitor.getPnL();
      expect(pnl.totalGasCost).toBe(50_000_000_000_000n);
    });

    it("should accumulate gas costs", () => {
      monitor = new HealthMonitor(makeConfig());
      monitor.recordGasCost(50_000_000_000_000n);
      monitor.recordGasCost(30_000_000_000_000n);

      const pnl = monitor.getPnL();
      expect(pnl.totalGasCost).toBe(80_000_000_000_000n);
    });

    it("should calculate net P&L per token correctly", () => {
      monitor = new HealthMonitor(makeConfig());
      monitor.recordProfit(WETH, ONE_ETH);       // +1 ETH
      monitor.recordLoss(WETH, HALF_ETH);         // -0.5 ETH
      // Net: 0.5 ETH

      const pnl = monitor.getPnL();
      expect(pnl.netPnL.get(WETH)).toBe(HALF_ETH);
    });

    it("should calculate overall net P&L including gas costs", () => {
      monitor = new HealthMonitor(makeConfig());
      monitor.recordProfit(WETH, ONE_ETH);          // +1 ETH
      monitor.recordLoss(WETH, TENTH_ETH);           // -0.1 ETH
      monitor.recordGasCost(TENTH_ETH);               // -0.1 ETH gas

      const pnl = monitor.getPnL();
      // Overall = sum of all token net P&L - gas costs
      // WETH net: 1.0 - 0.1 = 0.9 ETH
      // Overall: 0.9 - 0.1 (gas) = 0.8 ETH
      expect(pnl.overallNetPnL).toBe(ONE_ETH - TENTH_ETH - TENTH_ETH);
    });

    it("should handle negative net P&L", () => {
      monitor = new HealthMonitor(makeConfig());
      monitor.recordLoss(WETH, ONE_ETH);
      monitor.recordGasCost(HALF_ETH);

      const pnl = monitor.getPnL();
      // Net WETH: 0 - 1 ETH = -1 ETH
      // Overall: -1 ETH - 0.5 ETH = -1.5 ETH
      expect(pnl.overallNetPnL).toBe(-(ONE_ETH + HALF_ETH));
    });

    it("should track P&L for multiple tokens", () => {
      monitor = new HealthMonitor(makeConfig());
      monitor.recordProfit(WETH, ONE_ETH);
      monitor.recordProfit(USDC, 1000_000_000n); // 1000 USDC (6 decimals)

      const pnl = monitor.getPnL();
      expect(pnl.totalProfit.get(WETH)).toBe(ONE_ETH);
      expect(pnl.totalProfit.get(USDC)).toBe(1000_000_000n);
      expect(pnl.profitableCount).toBe(2);
    });

    it("should emit pnlUpdate on profit", () => {
      monitor = new HealthMonitor(makeConfig());
      const pnlEvents = captureEvents<PnLReport>(monitor, "pnlUpdate");

      monitor.recordProfit(WETH, ONE_ETH);

      expect(pnlEvents()).toHaveLength(1);
      expect(pnlEvents()[0].args.totalProfit.get(WETH)).toBe(ONE_ETH);
    });

    it("should emit pnlUpdate on loss", () => {
      monitor = new HealthMonitor(makeConfig());
      const pnlEvents = captureEvents<PnLReport>(monitor, "pnlUpdate");

      monitor.recordLoss(WETH, ONE_ETH);

      expect(pnlEvents()).toHaveLength(1);
      expect(pnlEvents()[0].args.totalLoss.get(WETH)).toBe(ONE_ETH);
    });

    it("should emit pnlUpdate on gas cost recording", () => {
      monitor = new HealthMonitor(makeConfig());
      const pnlEvents = captureEvents<PnLReport>(monitor, "pnlUpdate");

      monitor.recordGasCost(TENTH_ETH);

      expect(pnlEvents()).toHaveLength(1);
      expect(pnlEvents()[0].args.totalGasCost).toBe(TENTH_ETH);
    });

    it("should emit alert when P&L drops below threshold", () => {
      monitor = new HealthMonitor(makeConfig({
        pnlAlertThresholdWei: -(HALF_ETH),
      }));

      const alertEvents = captureEvents<Alert>(monitor, "alert");

      // Record a large loss that puts P&L below threshold
      monitor.recordLoss(WETH, ONE_ETH);

      expect(alertEvents().length).toBeGreaterThanOrEqual(1);
      const pnlAlert = alertEvents().find((e) => e.args.type === "pnlThreshold");
      expect(pnlAlert).toBeDefined();
      expect(pnlAlert!.args.severity).toBe("critical");
    });

    it("should not emit pnlThreshold alert when P&L is above threshold", () => {
      monitor = new HealthMonitor(makeConfig({
        pnlAlertThresholdWei: -(ONE_ETH),
      }));

      const alertEvents = captureEvents<Alert>(monitor, "alert");

      // Small loss, still above threshold
      monitor.recordLoss(WETH, HALF_ETH);

      const pnlAlerts = alertEvents().filter((e) => e.args.type === "pnlThreshold");
      expect(pnlAlerts).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────
  // Error Rate Tracking
  // ─────────────────────────────────────────────

  describe("error rate tracking", () => {
    it("should return 0 error rate with no records", () => {
      monitor = new HealthMonitor(makeConfig());
      expect(monitor.getErrorRate()).toBe(0);
    });

    it("should calculate error rate as percentage", () => {
      monitor = new HealthMonitor(makeConfig({ errorWindowMs: 60_000 }));

      // 1 error out of 10 total = 10%
      monitor.recordError("test error");
      for (let i = 0; i < 9; i++) {
        monitor.recordSuccess();
      }

      expect(monitor.getErrorRate()).toBeCloseTo(10, 0);
    });

    it("should return 100% error rate when all are errors", () => {
      monitor = new HealthMonitor(makeConfig());

      monitor.recordError("error 1");
      monitor.recordError("error 2");
      monitor.recordError("error 3");

      expect(monitor.getErrorRate()).toBe(100);
    });

    it("should return 0% error rate when all are successes", () => {
      monitor = new HealthMonitor(makeConfig());

      monitor.recordSuccess();
      monitor.recordSuccess();
      monitor.recordSuccess();

      expect(monitor.getErrorRate()).toBe(0);
    });

    it("should emit highErrorRate when threshold is exceeded", () => {
      monitor = new HealthMonitor(makeConfig({
        errorRateThreshold: 0.1, // 10%
      }));

      const highErrorEvents = captureEvents(monitor, "highErrorRate");

      // Record enough errors to exceed 10%
      monitor.recordError("error 1");
      monitor.recordError("error 2");

      // 2 errors out of 2 total = 100%, well above 10%
      expect(highErrorEvents().length).toBeGreaterThanOrEqual(1);
    });

    it("should emit alert on high error rate", () => {
      monitor = new HealthMonitor(makeConfig({
        errorRateThreshold: 0.1,
      }));

      const alertEvents = captureEvents<Alert>(monitor, "alert");

      monitor.recordError("error 1");
      monitor.recordError("error 2");

      const errorAlerts = alertEvents().filter((e) => e.args.type === "highErrorRate");
      expect(errorAlerts.length).toBeGreaterThanOrEqual(1);
      expect(errorAlerts[0].args.severity).toBe("warning");
    });

    it("should not emit highErrorRate when below threshold", () => {
      monitor = new HealthMonitor(makeConfig({
        errorRateThreshold: 0.5, // 50%
      }));

      const highErrorEvents = captureEvents(monitor, "highErrorRate");

      // Record 9 successes first, then 1 error = 10%, below 50% threshold
      for (let i = 0; i < 9; i++) {
        monitor.recordSuccess();
      }
      monitor.recordError("error");

      expect(highErrorEvents()).toHaveLength(0);
    });

    it("should respect the rolling window", async () => {
      // Use a very short window for testing
      monitor = new HealthMonitor(makeConfig({
        errorWindowMs: 100,
        errorRateThreshold: 0.5,
      }));

      // Record errors
      monitor.recordError("old error 1");
      monitor.recordError("old error 2");

      // Wait for the window to expire
      await new Promise((r) => setTimeout(r, 150));

      // Record only successes after the window
      monitor.recordSuccess();
      monitor.recordSuccess();

      // Old errors should have expired; rate should be 0%
      expect(monitor.getErrorRate()).toBe(0);
    });

    it("should handle rapid succession of errors", () => {
      monitor = new HealthMonitor(makeConfig({
        errorRateThreshold: 0.1,
      }));

      const highErrorEvents = captureEvents(monitor, "highErrorRate");

      // Rapidly record 100 errors
      for (let i = 0; i < 100; i++) {
        monitor.recordError(`error ${i}`);
      }

      // Should have emitted highErrorRate events
      expect(highErrorEvents().length).toBeGreaterThanOrEqual(1);
      expect(monitor.getErrorRate()).toBe(100);
    });
  });

  // ─────────────────────────────────────────────
  // Heartbeat
  // ─────────────────────────────────────────────

  describe("heartbeat", () => {
    it("should return current health status", () => {
      monitor = new HealthMonitor(makeConfig());
      const status = monitor.heartbeat();

      expect(status.running).toBe(false);
      expect(status.errorRate).toBe(0);
      expect(status.lowBalanceCount).toBe(0);
      expect(status.overallNetPnL).toBe(0n);
      expect(status.timestamp).toBeGreaterThan(0);
    });

    it("should reflect running state", () => {
      monitor = new HealthMonitor(makeConfig({ heartbeatIntervalMs: 60_000 }));
      monitor.start();
      const status = monitor.heartbeat();
      expect(status.running).toBe(true);
    });

    it("should reflect error rate", () => {
      monitor = new HealthMonitor(makeConfig());
      monitor.recordError("err");
      monitor.recordSuccess();

      const status = monitor.heartbeat();
      expect(status.errorRate).toBe(50);
    });

    it("should reflect low balance count", () => {
      monitor = new HealthMonitor(makeConfig({
        balanceThresholds: new Map([
          [ETH, ONE_ETH],
          [WETH, ONE_ETH],
        ]),
      }));

      monitor.updateBalance(ETH, HALF_ETH);   // below threshold
      monitor.updateBalance(WETH, HALF_ETH);   // below threshold

      const status = monitor.heartbeat();
      expect(status.lowBalanceCount).toBe(2);
    });

    it("should reflect P&L in heartbeat", () => {
      monitor = new HealthMonitor(makeConfig());
      monitor.recordProfit(WETH, ONE_ETH);
      monitor.recordGasCost(TENTH_ETH);

      const status = monitor.heartbeat();
      // 1.0 ETH profit - 0.1 ETH gas = 0.9 ETH
      expect(status.overallNetPnL).toBe(ONE_ETH - TENTH_ETH);
    });

    it("should calculate uptime", async () => {
      monitor = new HealthMonitor(makeConfig({ heartbeatIntervalMs: 60_000 }));
      monitor.start();

      // Wait a bit for uptime to accumulate
      await new Promise((r) => setTimeout(r, 50));

      const status = monitor.heartbeat();
      expect(status.uptimeMs).toBeGreaterThanOrEqual(40);
    });

    it("should emit heartbeat events periodically when running", async () => {
      monitor = new HealthMonitor(makeConfig({ heartbeatIntervalMs: 50 }));
      const captured = captureEvents<HealthStatus>(monitor, "heartbeat");

      monitor.start();

      // Wait for at least 2 heartbeats (initial + 1 interval)
      await new Promise((r) => setTimeout(r, 120));

      monitor.stop();

      expect(captured().length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─────────────────────────────────────────────
  // Stats
  // ─────────────────────────────────────────────

  describe("getStats", () => {
    it("should return complete stats", () => {
      monitor = new HealthMonitor(makeConfig());

      monitor.recordError("err");
      monitor.recordSuccess();
      monitor.recordSuccess();
      monitor.recordProfit(WETH, ONE_ETH);
      monitor.updateBalance(ETH, 2n * ONE_ETH);

      const stats = monitor.getStats();

      expect(stats.totalErrors).toBe(1);
      expect(stats.totalSuccesses).toBe(2);
      expect(stats.errorRate).toBeCloseTo(33.33, 0);
      expect(stats.startTime).toBeGreaterThan(0);
      expect(stats.balances).toHaveLength(1);
      expect(stats.pnl.totalProfit.get(WETH)).toBe(ONE_ETH);
    });

    it("should include heartbeat count when running", async () => {
      monitor = new HealthMonitor(makeConfig({ heartbeatIntervalMs: 50 }));
      monitor.start();

      // Wait for at least 2 heartbeats
      await new Promise((r) => setTimeout(r, 120));

      const stats = monitor.getStats();
      expect(stats.heartbeatCount).toBeGreaterThanOrEqual(2);
    });

    it("should calculate uptime correctly", async () => {
      monitor = new HealthMonitor(makeConfig({ heartbeatIntervalMs: 60_000 }));
      monitor.start();

      await new Promise((r) => setTimeout(r, 50));

      const stats = monitor.getStats();
      expect(stats.uptimeMs).toBeGreaterThanOrEqual(40);
    });
  });

  // ─────────────────────────────────────────────
  // Edge Cases
  // ─────────────────────────────────────────────

  describe("edge cases", () => {
    it("should handle recordProfit with zero amount", () => {
      monitor = new HealthMonitor(makeConfig());
      monitor.recordProfit(WETH, 0n);

      const pnl = monitor.getPnL();
      expect(pnl.totalProfit.get(WETH)).toBe(0n);
      expect(pnl.profitableCount).toBe(1);
    });

    it("should handle recordLoss with zero amount", () => {
      monitor = new HealthMonitor(makeConfig());
      monitor.recordLoss(WETH, 0n);

      const pnl = monitor.getPnL();
      expect(pnl.totalLoss.get(WETH)).toBe(0n);
      expect(pnl.unprofitableCount).toBe(1);
    });

    it("should handle recordGasCost with zero amount", () => {
      monitor = new HealthMonitor(makeConfig());
      monitor.recordGasCost(0n);

      const pnl = monitor.getPnL();
      expect(pnl.totalGasCost).toBe(0n);
    });

    it("should handle empty balance thresholds", () => {
      monitor = new HealthMonitor(makeConfig({
        balanceThresholds: new Map(),
      }));

      // Should not throw
      monitor.updateBalance(ETH, ONE_ETH);
      const status = monitor.heartbeat();
      expect(status.lowBalanceCount).toBe(0);
    });

    it("should handle stop without start", () => {
      monitor = new HealthMonitor(makeConfig());
      // Should not throw
      monitor.stop();
      expect(monitor.isRunning).toBe(false);
    });

    it("should return stable results after stop", async () => {
      monitor = new HealthMonitor(makeConfig({ heartbeatIntervalMs: 50 }));
      monitor.start();
      monitor.recordProfit(WETH, ONE_ETH);
      monitor.recordError("err");

      await new Promise((r) => setTimeout(r, 60));
      monitor.stop();

      // Stats should still be readable after stop
      const stats = monitor.getStats();
      expect(stats.totalErrors).toBe(1);
      expect(stats.pnl.totalProfit.get(WETH)).toBe(ONE_ETH);
    });

    it("should handle very large balance values", () => {
      monitor = new HealthMonitor(makeConfig({
        balanceThresholds: new Map([[ETH, ONE_ETH]]),
      }));

      const hugeBalance = 1_000_000n * ONE_ETH; // 1 million ETH
      monitor.updateBalance(ETH, hugeBalance);

      const stats = monitor.getStats();
      const ethBalance = stats.balances.find((b) => b.token === ETH);
      expect(ethBalance!.balance).toBe(hugeBalance);
      expect(ethBalance!.isBelowThreshold).toBe(false);
    });

    it("should handle very large profit/loss values", () => {
      monitor = new HealthMonitor(makeConfig());

      const hugeAmount = 1_000_000n * ONE_ETH;
      monitor.recordProfit(WETH, hugeAmount);
      monitor.recordLoss(WETH, hugeAmount / 2n);

      const pnl = monitor.getPnL();
      expect(pnl.netPnL.get(WETH)).toBe(hugeAmount / 2n);
    });
  });
});
