/**
 * Time manipulation utilities for testing.
 *
 * Provides helpers for controlling time in tests — fake timers,
 * async delays, and timestamp generation.
 */

import { vi } from "vitest";

/**
 * Advance fake timers by a given duration.
 * Must call `vi.useFakeTimers()` before using this.
 *
 * @example
 * ```ts
 * vi.useFakeTimers();
 * monitor.start(); // sets up interval
 * await advanceTime(12_000); // trigger one poll cycle
 * vi.useRealTimers();
 * ```
 */
export async function advanceTime(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

/**
 * Run all pending timers (setInterval/setTimeout callbacks).
 * Must call `vi.useFakeTimers()` before using this.
 */
export async function runAllTimers(): Promise<void> {
  await vi.runAllTimersAsync();
}

/**
 * Create a fixed timestamp for deterministic test output.
 * Returns a timestamp in ms for a given ISO date string.
 *
 * @example
 * ```ts
 * const ts = fixedTimestamp("2026-01-15T12:00:00Z");
 * expect(ts).toBe(1768468800000);
 * ```
 */
export function fixedTimestamp(isoDate: string): number {
  return new Date(isoDate).getTime();
}

/**
 * Mock Date.now() to return a fixed timestamp.
 * Returns a cleanup function to restore the original.
 *
 * @example
 * ```ts
 * const restore = mockDateNow(1700000000000);
 * expect(Date.now()).toBe(1700000000000);
 * restore();
 * ```
 */
export function mockDateNow(timestamp: number): () => void {
  const original = Date.now;
  Date.now = () => timestamp;
  return () => {
    Date.now = original;
  };
}

/**
 * Create a promise that resolves after a real delay.
 * Use sparingly — prefer fake timers for most tests.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
