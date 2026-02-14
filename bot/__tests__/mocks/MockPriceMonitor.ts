/**
 * Mock PriceMonitor for testing OpportunityDetector and downstream modules.
 *
 * Extends EventEmitter to faithfully simulate PriceMonitor's event interface
 * without actual RPC calls. Tests can call `emitOpportunity()` / `emitStale()`
 * to drive the event pipeline.
 */

import { EventEmitter } from "node:events";
import type {
  PoolConfig,
  PriceDelta,
  PriceSnapshot,
} from "../../src/monitor/types.js";

export class MockPriceMonitor extends EventEmitter {
  private _running = false;
  private readonly _snapshots = new Map<string, PriceSnapshot>();

  get isRunning(): boolean {
    return this._running;
  }

  start(): void {
    this._running = true;
  }

  stop(): void {
    this._running = false;
  }

  /** Simulate a poll cycle by setting snapshots and emitting events */
  async poll(): Promise<void> {
    for (const snap of this._snapshots.values()) {
      this.emit("priceUpdate", snap);
    }
  }

  /** Get a stored snapshot */
  getSnapshot(poolAddress: string): PriceSnapshot | undefined {
    return this._snapshots.get(poolAddress.toLowerCase());
  }

  /** Get all stored snapshots */
  getAllSnapshots(): PriceSnapshot[] {
    return [...this._snapshots.values()];
  }

  // --- Test control methods ---

  /** Inject a snapshot (simulates a price fetch) */
  setSnapshot(snapshot: PriceSnapshot): void {
    this._snapshots.set(snapshot.pool.poolAddress.toLowerCase(), snapshot);
  }

  /** Emit a price delta opportunity event (as PriceMonitor would) */
  emitOpportunity(delta: PriceDelta): void {
    this.emit("opportunity", delta);
  }

  /** Emit a stale pool event */
  emitStale(pool: PoolConfig): void {
    this.emit("stale", pool);
  }

  /** Emit an error event */
  emitError(error: Error, pool: PoolConfig): void {
    this.emit("error", error, pool);
  }

  /** Clear all snapshots */
  reset(): void {
    this._snapshots.clear();
    this._running = false;
  }
}
