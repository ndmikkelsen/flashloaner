/**
 * Common test utilities for the flashloan bot test suite.
 *
 * Provides environment mocking, assertion helpers, and common patterns
 * used across multiple test files.
 */

import { vi } from "vitest";

/**
 * Set environment variables for the duration of a test.
 * Returns a cleanup function that restores originals.
 *
 * @example
 * ```ts
 * const restore = setTestEnv({
 *   MAX_GAS_PRICE: "50000000000",
 *   MIN_PROFIT_WEI: "1000000000000000",
 *   DRY_RUN: "true",
 * });
 * // ... test code ...
 * restore();
 * ```
 */
export function setTestEnv(
  vars: Record<string, string>,
): () => void {
  const originals: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(vars)) {
    originals[key] = process.env[key];
    process.env[key] = value;
  }

  return () => {
    for (const [key, original] of Object.entries(originals)) {
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
  };
}

/**
 * Assert that an async function rejects with a specific error message.
 *
 * @example
 * ```ts
 * await expectRevert(
 *   () => engine.execute(opportunity),
 *   "Gas price too high",
 * );
 * ```
 */
export async function expectRevert(
  fn: () => Promise<unknown>,
  expectedMessage?: string | RegExp,
): Promise<Error> {
  try {
    await fn();
    throw new Error("Expected function to throw, but it did not");
  } catch (err) {
    if (!(err instanceof Error)) throw err;
    if (err.message === "Expected function to throw, but it did not") throw err;

    if (expectedMessage) {
      if (typeof expectedMessage === "string") {
        if (!err.message.includes(expectedMessage)) {
          throw new Error(
            `Expected error containing "${expectedMessage}", got "${err.message}"`,
          );
        }
      } else {
        if (!expectedMessage.test(err.message)) {
          throw new Error(
            `Expected error matching ${expectedMessage}, got "${err.message}"`,
          );
        }
      }
    }

    return err;
  }
}

/**
 * Create a spy that tracks calls and optionally delays responses.
 * Useful for testing retry logic and timeout behavior.
 *
 * @example
 * ```ts
 * const spy = createDelayedSpy(100, "result");
 * const result = await spy();
 * expect(result).toBe("result");
 * expect(spy).toHaveBeenCalledTimes(1);
 * ```
 */
export function createDelayedSpy<T>(
  delayMs: number,
  returnValue: T,
) {
  return vi.fn().mockImplementation(
    () => new Promise<T>((resolve) => setTimeout(() => resolve(returnValue), delayMs)),
  );
}

/**
 * Approximate comparison for floating point values.
 * Returns true if |a - b| < epsilon.
 */
export function approxEqual(
  a: number,
  b: number,
  epsilon = 1e-10,
): boolean {
  return Math.abs(a - b) < epsilon;
}

/**
 * Format wei amount to human-readable ETH string.
 * Useful for assertion error messages.
 */
export function formatEth(wei: bigint | number): string {
  const ethValue = Number(wei) / 1e18;
  return `${ethValue.toFixed(6)} ETH`;
}

/**
 * Format gwei value to human-readable string.
 */
export function formatGwei(wei: bigint | number): string {
  const gweiValue = Number(wei) / 1e9;
  return `${gweiValue.toFixed(2)} gwei`;
}
