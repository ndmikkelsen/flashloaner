/**
 * Circuit breaker pattern for RPC resilience.
 *
 * States:
 * - closed: Normal operation, requests pass through
 * - open: Failure threshold exceeded, requests blocked for backoff period
 * - half-open: Testing with a single request after backoff expires
 *
 * Exponential backoff: starts at initialBackoffMs, doubles up to maxBackoffMs.
 */

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerConfig {
  /** Consecutive failures to trigger open state. Default: 5 */
  failureThreshold?: number;
  /** Initial backoff in ms when circuit opens. Default: 30_000 (30s) */
  initialBackoffMs?: number;
  /** Maximum backoff in ms. Default: 300_000 (5 min) */
  maxBackoffMs?: number;
}

export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;

  private _state: CircuitState = "closed";
  private consecutiveFailures = 0;
  private openUntil = 0;
  private currentBackoffMs: number;

  constructor(config: CircuitBreakerConfig = {}) {
    this.failureThreshold = config.failureThreshold ?? 5;
    this.initialBackoffMs = config.initialBackoffMs ?? 30_000;
    this.maxBackoffMs = config.maxBackoffMs ?? 300_000;
    this.currentBackoffMs = this.initialBackoffMs;
  }

  get state(): CircuitState {
    if (this._state === "open" && Date.now() >= this.openUntil) {
      this._state = "half-open";
    }
    return this._state;
  }

  /** Whether a request should be allowed through */
  get allowRequest(): boolean {
    const s = this.state; // triggers open→half-open transition
    return s === "closed" || s === "half-open";
  }

  /** Record a successful request */
  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.currentBackoffMs = this.initialBackoffMs;
    this._state = "closed";
  }

  /** Record a failed request. Returns the new state. */
  recordFailure(): CircuitState {
    this.consecutiveFailures++;

    // Use getter to trigger time-based open→half-open transition
    const currentState = this.state;

    if (currentState === "half-open") {
      // Half-open test failed — re-open with doubled backoff
      this.currentBackoffMs = Math.min(this.currentBackoffMs * 2, this.maxBackoffMs);
      this.openUntil = Date.now() + this.currentBackoffMs;
      this._state = "open";
      return "open";
    }

    if (this.consecutiveFailures >= this.failureThreshold) {
      this.openUntil = Date.now() + this.currentBackoffMs;
      this._state = "open";
      return "open";
    }

    return this._state;
  }

  /** Current backoff duration in ms */
  get backoffMs(): number {
    return this.currentBackoffMs;
  }

  /** Time remaining until circuit transitions from open to half-open */
  get remainingOpenMs(): number {
    if (this._state !== "open") return 0;
    return Math.max(0, this.openUntil - Date.now());
  }

  /** Reset circuit to closed state */
  reset(): void {
    this._state = "closed";
    this.consecutiveFailures = 0;
    this.openUntil = 0;
    this.currentBackoffMs = this.initialBackoffMs;
  }
}
