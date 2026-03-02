import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CircuitBreaker } from "../../src/resilience/CircuitBreaker.js";

describe("CircuitBreaker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should start in closed state", () => {
    const cb = new CircuitBreaker();
    expect(cb.state).toBe("closed");
    expect(cb.allowRequest).toBe(true);
  });

  it("should stay closed below failure threshold", () => {
    const cb = new CircuitBreaker({ failureThreshold: 5 });
    for (let i = 0; i < 4; i++) {
      cb.recordFailure();
    }
    expect(cb.state).toBe("closed");
    expect(cb.allowRequest).toBe(true);
  });

  it("should open after reaching failure threshold", () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, initialBackoffMs: 1000 });
    cb.recordFailure();
    cb.recordFailure();
    const state = cb.recordFailure();
    expect(state).toBe("open");
    expect(cb.state).toBe("open");
    expect(cb.allowRequest).toBe(false);
  });

  it("should transition to half-open after backoff expires", () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, initialBackoffMs: 1000 });
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.state).toBe("open");

    vi.advanceTimersByTime(1000);
    expect(cb.state).toBe("half-open");
    expect(cb.allowRequest).toBe(true);
  });

  it("should close on success in half-open state", () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, initialBackoffMs: 1000 });
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();

    vi.advanceTimersByTime(1000);
    expect(cb.state).toBe("half-open");

    cb.recordSuccess();
    expect(cb.state).toBe("closed");
    expect(cb.allowRequest).toBe(true);
  });

  it("should re-open with doubled backoff on half-open failure", () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, initialBackoffMs: 1000, maxBackoffMs: 10000 });
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();

    vi.advanceTimersByTime(1000);
    expect(cb.state).toBe("half-open");

    cb.recordFailure();
    expect(cb.state).toBe("open");
    expect(cb.backoffMs).toBe(2000); // Doubled

    // Wait for doubled backoff
    vi.advanceTimersByTime(2000);
    expect(cb.state).toBe("half-open");

    cb.recordFailure();
    expect(cb.backoffMs).toBe(4000); // Doubled again
  });

  it("should cap backoff at maxBackoffMs", () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, initialBackoffMs: 1000, maxBackoffMs: 3000 });
    cb.recordFailure(); // Opens at 1000ms

    vi.advanceTimersByTime(1000);
    cb.recordFailure(); // Re-opens at 2000ms

    vi.advanceTimersByTime(2000);
    cb.recordFailure(); // Re-opens at 3000ms (cap)

    vi.advanceTimersByTime(3000);
    cb.recordFailure(); // Should still be 3000ms (capped)
    expect(cb.backoffMs).toBe(3000);
  });

  it("should reset backoff on success", () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, initialBackoffMs: 1000 });
    cb.recordFailure();

    vi.advanceTimersByTime(1000);
    cb.recordFailure(); // backoff now 2000ms

    vi.advanceTimersByTime(2000);
    cb.recordSuccess(); // Reset
    expect(cb.backoffMs).toBe(1000); // Back to initial
  });

  it("should report remainingOpenMs correctly", () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, initialBackoffMs: 5000 });
    cb.recordFailure();

    vi.advanceTimersByTime(2000);
    expect(cb.remainingOpenMs).toBe(3000);
  });

  it("should reset to initial state", () => {
    const cb = new CircuitBreaker({ failureThreshold: 1 });
    cb.recordFailure();
    expect(cb.state).toBe("open");

    cb.reset();
    expect(cb.state).toBe("closed");
    expect(cb.allowRequest).toBe(true);
  });
});
