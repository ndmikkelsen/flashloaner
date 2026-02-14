/**
 * Mock OpportunityDetector for testing TransactionBuilder and ExecutionEngine.
 *
 * Extends EventEmitter to simulate opportunity detection without actual
 * price analysis. Tests can call `emitOpportunity()` to drive downstream.
 */

import { EventEmitter } from "node:events";
import type { PriceDelta } from "../../src/monitor/types.js";
import type { ArbitrageOpportunity } from "../../src/detector/types.js";

export class MockOpportunityDetector extends EventEmitter {
  private _attached = false;
  public readonly receivedDeltas: PriceDelta[] = [];
  public readonly emittedOpportunities: ArbitrageOpportunity[] = [];

  get isAttached(): boolean {
    return this._attached;
  }

  attach(_monitor: any): void {
    this._attached = true;
  }

  detach(): void {
    this._attached = false;
  }

  analyzeDelta(delta: PriceDelta): ArbitrageOpportunity | null {
    this.receivedDeltas.push(delta);
    return null;
  }

  // --- Test control methods ---

  /** Emit an opportunity event (as OpportunityDetector would) */
  emitOpportunity(opportunity: ArbitrageOpportunity): void {
    this.emittedOpportunities.push(opportunity);
    this.emit("opportunityFound", opportunity);
  }

  /** Emit a rejection event */
  emitRejection(reason: string, delta: PriceDelta): void {
    this.emit("opportunityRejected", reason, delta);
  }

  /** Emit an error event */
  emitError(error: Error): void {
    this.emit("error", error);
  }

  /** Clear tracked state */
  reset(): void {
    this.receivedDeltas.length = 0;
    this.emittedOpportunities.length = 0;
    this._attached = false;
  }
}
