/**
 * Global test setup for the flashloan bot test suite.
 *
 * This file can be referenced in vitest.config.ts `setupFiles` to run
 * before every test file. It provides:
 * - Deterministic environment variables
 * - Unhandled rejection handling
 * - Common test constants
 *
 * Usage in vitest.config.ts:
 * ```ts
 * export default defineConfig({
 *   test: {
 *     setupFiles: ["__tests__/setup.ts"],
 *   },
 * });
 * ```
 */

import { afterEach, beforeAll, vi } from "vitest";

// ---------------------------------------------------------------------------
// Environment defaults for testing
// ---------------------------------------------------------------------------

/** Default test environment variables. Applied in beforeAll. */
const TEST_ENV: Record<string, string> = {
  NODE_ENV: "test",
  DRY_RUN: "true",
  MAX_GAS_PRICE: "50000000000", // 50 gwei
  MIN_PROFIT_WEI: "1000000000000000", // 0.001 ETH
  FLASHLOAN_AMOUNT: "10000000000000000000", // 10 ETH
  EXECUTOR_ADDRESS: "0x0000000000000000000000000000000000000010",
};

const envOriginals: Record<string, string | undefined> = {};

beforeAll(() => {
  // Save originals and apply test defaults
  for (const [key, value] of Object.entries(TEST_ENV)) {
    envOriginals[key] = process.env[key];
    process.env[key] = value;
  }

  return () => {
    // Restore originals on cleanup
    for (const [key, original] of Object.entries(envOriginals)) {
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
  };
});

// ---------------------------------------------------------------------------
// Timer cleanup
// ---------------------------------------------------------------------------

afterEach(() => {
  // Restore real timers if any test used fake timers
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Unhandled rejections
// ---------------------------------------------------------------------------

// Fail fast on unhandled promise rejections during tests
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection in test:", reason);
  process.exitCode = 1;
});
