/**
 * Integration test scaffolding for flashloan bot modules.
 *
 * Provides base utilities for tests that exercise multiple modules together
 * (PriceMonitor → OpportunityDetector → TransactionBuilder → ExecutionEngine).
 *
 * For fork-based integration tests, use `ForkTestContext` to manage
 * provider lifecycle and env setup.
 */

import { vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  ADDRESSES,
  makePool,
  makeV3Pool,
  makeSushiPool,
} from "../helpers/FixtureFactory.js";
import { createMockProvider, createRoutingProvider } from "../mocks/MockProvider.js";
import type { PoolConfig } from "../../src/monitor/types.js";

// ---------------------------------------------------------------------------
// Pipeline context — wires modules together for integration tests
// ---------------------------------------------------------------------------

export interface PipelineConfig {
  /** Pools to monitor. Defaults to a V2 + Sushi pair. */
  pools?: PoolConfig[];
  /** Provider options or a pre-built mock provider */
  provider?: ReturnType<typeof createMockProvider> | ReturnType<typeof createRoutingProvider>;
  /** Delta threshold for opportunity detection (%). Default: 0.5 */
  deltaThreshold?: number;
  /** Minimum profit in ETH. Default: 0.001 */
  minProfitEth?: number;
}

/**
 * Set up a test pipeline that wires PriceMonitor → OpportunityDetector.
 *
 * Returns all components for assertions and a cleanup function.
 *
 * @example
 * ```ts
 * const ctx = createPipelineContext({
 *   pools: [makePool(), makeSushiPool()],
 * });
 * // ... trigger events and assert ...
 * ctx.cleanup();
 * ```
 */
export function createPipelineContext(config: PipelineConfig = {}) {
  const pools = config.pools ?? [makePool(), makeSushiPool()];
  const provider = config.provider ?? createMockProvider();

  // Collect all events across the pipeline
  const events = new EventEmitter();
  const collected = {
    priceUpdates: [] as unknown[],
    opportunities: [] as unknown[],
    errors: [] as Error[],
    rejections: [] as unknown[],
  };

  events.on("priceUpdate", (e) => collected.priceUpdates.push(e));
  events.on("opportunity", (e) => collected.opportunities.push(e));
  events.on("error", (e) => collected.errors.push(e));
  events.on("rejected", (e) => collected.rejections.push(e));

  return {
    pools,
    provider,
    events,
    collected,
    config: {
      deltaThreshold: config.deltaThreshold ?? 0.5,
      minProfitEth: config.minProfitEth ?? 0.001,
    },
    cleanup: () => {
      events.removeAllListeners();
      collected.priceUpdates.length = 0;
      collected.opportunities.length = 0;
      collected.errors.length = 0;
      collected.rejections.length = 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Fork test context — for tests against real chain data
// ---------------------------------------------------------------------------

export interface ForkTestConfig {
  /** RPC URL for fork. Falls back to $MAINNET_RPC_URL env var. */
  rpcUrl?: string;
  /** Block number to fork at. If omitted, uses latest. */
  forkBlock?: number;
}

/**
 * Check if fork testing is available.
 * Fork tests require a real RPC URL, so they're skipped in CI
 * unless MAINNET_RPC_URL is provided.
 */
export function isForkAvailable(): boolean {
  return !!process.env["MAINNET_RPC_URL"];
}

/**
 * Create a context for fork-based integration tests.
 *
 * These tests connect to a real (forked) chain to verify
 * price fetching and opportunity detection with real pool data.
 *
 * @example
 * ```ts
 * describe.skipIf(!isForkAvailable())("fork tests", () => {
 *   let ctx: ForkTestContext;
 *   beforeEach(() => { ctx = createForkContext(); });
 *
 *   it("should fetch real pool prices", async () => {
 *     // Use ctx.rpcUrl with actual ethers.JsonRpcProvider
 *   });
 * });
 * ```
 */
export function createForkContext(config: ForkTestConfig = {}) {
  const rpcUrl = config.rpcUrl ?? process.env["MAINNET_RPC_URL"] ?? "";

  return {
    rpcUrl,
    forkBlock: config.forkBlock,
    /** Well-known mainnet pool addresses for testing */
    mainnetPools: {
      WETH_USDC_V2: "0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc",
      WETH_USDC_V3_500: "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640",
      WETH_USDC_SUSHI: "0x397FF1542f962076d0BFE58eA045FfA2d347ACa0",
    },
    /** Test environment setup for fork tests */
    env: {
      NODE_ENV: "test",
      DRY_RUN: "true",
    },
  };
}

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------

export {
  ADDRESSES,
  makePool,
  makeV3Pool,
  makeSushiPool,
} from "../helpers/FixtureFactory.js";

export {
  createMockProvider,
  createRoutingProvider,
} from "../mocks/MockProvider.js";
