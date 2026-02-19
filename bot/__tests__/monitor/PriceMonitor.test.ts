import { describe, it, expect, vi, afterEach } from "vitest";
import { Interface } from "ethers";
import { PriceMonitor } from "../../src/monitor/PriceMonitor.js";
import type {
  PoolConfig,
  PriceDelta,
  PriceSnapshot,
} from "../../src/monitor/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Addresses used in tests (checksummed fakes) */
const ADDR = {
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  POOL_V2: "0x0000000000000000000000000000000000000001",
  POOL_V3: "0x0000000000000000000000000000000000000002",
  POOL_SUSHI: "0x0000000000000000000000000000000000000003",
  POOL_CAMELOT_V2: "0x0000000000000000000000000000000000000004",
  POOL_CAMELOT_V3: "0x0000000000000000000000000000000000000005",
};

function makePool(overrides: Partial<PoolConfig> = {}): PoolConfig {
  return {
    label: "WETH/USDC UniV2",
    dex: "uniswap_v2",
    poolAddress: ADDR.POOL_V2,
    token0: ADDR.WETH,
    token1: ADDR.USDC,
    decimals0: 18,
    decimals1: 6,
    ...overrides,
  };
}

/**
 * Build a mock ethers v6 Provider.
 * Intercepts at the `call` level and returns ABI-encoded responses.
 */
function mockProvider(opts: {
  blockNumber?: number;
  getReservesReturn?: [bigint, bigint, number];
  slot0Return?: [bigint, number, number, number, number, number, boolean];
  globalStateReturn?: [bigint, number, number, number, number, number, number];
}) {
  const blockNum = opts.blockNumber ?? 19_000_000;

  return {
    getBlockNumber: vi.fn().mockResolvedValue(blockNum),
    call: vi.fn().mockImplementation(async (tx: { data: string }) => {
      const selector = tx.data.slice(0, 10);

      // getReserves() selector = 0x0902f1ac
      if (selector === "0x0902f1ac") {
        const [r0, r1, ts] = opts.getReservesReturn ?? [
          BigInt("1000000000000000000000"), // 1000 WETH
          BigInt("2000000000000"),           // 2,000,000 USDC
          0,
        ];
        return encodeGetReserves(r0, r1, ts);
      }

      // slot0() selector = 0x3850c7bd
      if (selector === "0x3850c7bd") {
        const [sqrtPrice, tick, obsIdx, obsCar, obsCarNext, feeProt, unlocked] =
          opts.slot0Return ?? [
            // sqrtPriceX96 for ~2000 USDC/WETH:
            // sqrt(2000 * 1e6 / 1e18) * 2^96 ≈ 3.543e24
            BigInt("3543191142285914000000000"),
            0, 0, 0, 0, 0, true,
          ];
        return encodeSlot0(sqrtPrice, tick, obsIdx, obsCar, obsCarNext, feeProt, unlocked);
      }

      // globalState() selector = 0xe76c01e4
      if (selector === "0xe76c01e4") {
        const [sqrtPrice, tick, feeZto, feeOtz, tpIdx, cf0, cf1] =
          opts.globalStateReturn ?? [
            BigInt("3543191142285914000000000"),
            0, 100, 100, 0, 0, 0,
          ];
        return encodeGlobalState(sqrtPrice, tick, feeZto, feeOtz, tpIdx, cf0, cf1);
      }

      throw new Error(`Unknown selector: ${selector}`);
    }),
  } as any;
}

/**
 * Build a mock provider that always rejects.
 * Fails at getBlockNumber level to avoid ethers v6 ABI decoding side-effects.
 */
function failingProvider(errorMsg = "RPC call failed") {
  return {
    getBlockNumber: vi.fn().mockRejectedValue(new Error(errorMsg)),
    call: vi.fn().mockRejectedValue(new Error(errorMsg)),
  } as any;
}

/** ABI-encode getReserves return value */
function encodeGetReserves(r0: bigint, r1: bigint, ts: number): string {
  const pad = (v: bigint | number) =>
    BigInt(v).toString(16).padStart(64, "0");
  return "0x" + pad(r0) + pad(r1) + pad(ts);
}

/** ABI-encode slot0 return value */
function encodeSlot0(
  sqrtPriceX96: bigint,
  tick: number,
  obsIdx: number,
  obsCar: number,
  obsCarNext: number,
  feeProt: number,
  unlocked: boolean,
): string {
  const pad = (v: bigint | number) =>
    BigInt(v).toString(16).padStart(64, "0");
  const tickBig = tick >= 0 ? BigInt(tick) : (1n << 256n) + BigInt(tick);
  return (
    "0x" +
    pad(sqrtPriceX96) +
    tickBig.toString(16).padStart(64, "0") +
    pad(obsIdx) +
    pad(obsCar) +
    pad(obsCarNext) +
    pad(feeProt) +
    pad(unlocked ? 1 : 0)
  );
}

/** ABI-encode globalState return value (Algebra V3 / Camelot V3) */
function encodeGlobalState(
  sqrtPriceX96: bigint,
  tick: number,
  feeZto: number,
  feeOtz: number,
  timepointIndex: number,
  communityFeeToken0: number,
  communityFeeToken1: number,
): string {
  const pad = (v: bigint | number) =>
    BigInt(v).toString(16).padStart(64, "0");
  const tickBig = tick >= 0 ? BigInt(tick) : (1n << 256n) + BigInt(tick);
  return (
    "0x" +
    pad(sqrtPriceX96) +
    tickBig.toString(16).padStart(64, "0") +
    pad(feeZto) +
    pad(feeOtz) +
    pad(timepointIndex) +
    pad(communityFeeToken0) +
    pad(communityFeeToken1)
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PriceMonitor", () => {
  let monitor: PriceMonitor;

  afterEach(() => {
    monitor?.stop();
  });

  // ---- Construction & lifecycle ----

  describe("construction", () => {
    it("should create with default config values", () => {
      const provider = mockProvider({});
      monitor = new PriceMonitor({
        provider,
        pools: [makePool()],
      });
      expect(monitor.isRunning).toBe(false);
    });

    it("should apply custom config values", () => {
      const provider = mockProvider({});
      monitor = new PriceMonitor({
        provider,
        pools: [makePool()],
        deltaThresholdPercent: 1.0,
        pollIntervalMs: 5000,
        maxRetries: 5,
      });
      expect(monitor.isRunning).toBe(false);
    });
  });

  describe("start / stop", () => {
    it("should set isRunning to true on start", () => {
      const provider = mockProvider({});
      monitor = new PriceMonitor({
        provider,
        pools: [makePool()],
        pollIntervalMs: 60_000,
      });
      monitor.start();
      expect(monitor.isRunning).toBe(true);
    });

    it("should set isRunning to false on stop", () => {
      const provider = mockProvider({});
      monitor = new PriceMonitor({
        provider,
        pools: [makePool()],
        pollIntervalMs: 60_000,
      });
      monitor.start();
      monitor.stop();
      expect(monitor.isRunning).toBe(false);
    });

    it("should be idempotent for multiple start calls", () => {
      const provider = mockProvider({});
      monitor = new PriceMonitor({
        provider,
        pools: [makePool()],
        pollIntervalMs: 60_000,
      });
      monitor.start();
      monitor.start();
      expect(monitor.isRunning).toBe(true);
    });
  });

  // ---- V2 Price Calculation ----

  describe("calculateV2Price", () => {
    it("should calculate correct price from reserves", () => {
      const provider = mockProvider({});
      monitor = new PriceMonitor({ provider, pools: [] });

      // 1000 WETH (18 dec), 2,000,000 USDC (6 dec) → price = 2000
      const price = monitor.calculateV2Price(
        BigInt("1000000000000000000000"),  // 1000 * 10^18
        BigInt("2000000000000"),            // 2,000,000 * 10^6
        18,
        6,
      );
      expect(price).toBeCloseTo(2000, 2);
    });

    it("should return 0 when reserve0 is zero", () => {
      const provider = mockProvider({});
      monitor = new PriceMonitor({ provider, pools: [] });

      const price = monitor.calculateV2Price(0n, 1000n, 18, 6);
      expect(price).toBe(0);
    });

    it("should handle equal decimals", () => {
      const provider = mockProvider({});
      monitor = new PriceMonitor({ provider, pools: [] });

      const price = monitor.calculateV2Price(
        BigInt("1000000000000000000000"), // 1000 DAI
        BigInt("1001000000000000000000"), // 1001 USDC
        18,
        18,
      );
      expect(price).toBeCloseTo(1.001, 3);
    });
  });

  // ---- V3 Price Calculation ----

  describe("calculateV3Price", () => {
    it("should calculate price from sqrtPriceX96", () => {
      const provider = mockProvider({});
      monitor = new PriceMonitor({ provider, pools: [] });

      // For WETH(18)/USDC(6) at ~2000 USDC/ETH:
      // rawPrice = 2000 / 10^(18-6) = 2e-9
      // sqrtPriceX96 = sqrt(2e-9) * 2^96 ≈ 3.543e24
      const sqrtPriceX96 = BigInt("3543191142285914000000000");
      const price = monitor.calculateV3Price(sqrtPriceX96, 18, 6);

      expect(price).toBeCloseTo(2000, 0);
    });

    it("should handle same-decimal tokens", () => {
      const provider = mockProvider({});
      monitor = new PriceMonitor({ provider, pools: [] });

      // sqrtPriceX96 for price = 1.0 → sqrtPriceX96 = 2^96
      const sqrtPriceX96 = 2n ** 96n;
      const price = monitor.calculateV3Price(sqrtPriceX96, 18, 18);
      expect(price).toBeCloseTo(1.0, 5);
    });
  });

  // ---- fetchPrice (via mocked provider.call) ----

  describe("fetchPrice", () => {
    it("should fetch V2 pool price", async () => {
      const provider = mockProvider({
        blockNumber: 19_500_000,
        getReservesReturn: [
          BigInt("500000000000000000000"),  // 500 WETH
          BigInt("1000000000000"),           // 1,000,000 USDC
          0,
        ],
      });
      monitor = new PriceMonitor({ provider, pools: [makePool()] });

      const snapshot = await monitor.fetchPrice(makePool());
      expect(snapshot.price).toBeCloseTo(2000, 0);
      expect(snapshot.blockNumber).toBe(19_500_000);
      expect(snapshot.inversePrice).toBeCloseTo(0.0005, 5);
      expect(snapshot.pool.dex).toBe("uniswap_v2");
    });

    it("should fetch V3 pool price", async () => {
      const sqrtPriceX96 = BigInt("3543191142285914000000000");
      const provider = mockProvider({
        slot0Return: [sqrtPriceX96, -200000, 0, 0, 0, 0, true],
      });

      const v3Pool = makePool({
        label: "WETH/USDC UniV3",
        dex: "uniswap_v3",
        poolAddress: ADDR.POOL_V3,
        feeTier: 3000,
      });

      monitor = new PriceMonitor({ provider, pools: [v3Pool] });
      const snapshot = await monitor.fetchPrice(v3Pool);

      expect(snapshot.price).toBeCloseTo(2000, 0);
      expect(snapshot.pool.dex).toBe("uniswap_v3");
    });

    it("should fetch SushiSwap price using V2 interface", async () => {
      const provider = mockProvider({
        getReservesReturn: [
          BigInt("500000000000000000000"),
          BigInt("1005000000000"),
          0,
        ],
      });
      const sushiPool = makePool({
        label: "WETH/USDC Sushi",
        dex: "sushiswap",
        poolAddress: ADDR.POOL_SUSHI,
      });

      monitor = new PriceMonitor({ provider, pools: [sushiPool] });
      const snapshot = await monitor.fetchPrice(sushiPool);

      expect(snapshot.price).toBeCloseTo(2010, 0);
    });

    it("should fetch Camelot V2 price using V2 interface", async () => {
      const provider = mockProvider({
        getReservesReturn: [
          BigInt("500000000000000000000"),
          BigInt("1005000000000"),
          0,
        ],
      });
      const camelotV2Pool = makePool({
        label: "WETH/USDC CamelotV2",
        dex: "camelot_v2",
        poolAddress: ADDR.POOL_CAMELOT_V2,
      });

      monitor = new PriceMonitor({ provider, pools: [camelotV2Pool] });
      const snapshot = await monitor.fetchPrice(camelotV2Pool);

      expect(snapshot.price).toBeCloseTo(2010, 0);
      expect(snapshot.pool.dex).toBe("camelot_v2");
    });

    it("should fetch Camelot V3 price using Algebra globalState()", async () => {
      const sqrtPriceX96 = BigInt("3543191142285914000000000");
      const provider = mockProvider({
        globalStateReturn: [sqrtPriceX96, -200000, 100, 100, 0, 0, 0],
      });

      const camelotV3Pool = makePool({
        label: "WETH/USDC CamelotV3",
        dex: "camelot_v3",
        poolAddress: ADDR.POOL_CAMELOT_V3,
      });

      monitor = new PriceMonitor({ provider, pools: [camelotV3Pool] });
      const snapshot = await monitor.fetchPrice(camelotV3Pool);

      expect(snapshot.price).toBeCloseTo(2000, 0);
      expect(snapshot.pool.dex).toBe("camelot_v3");
    });
  });

  // ---- poll() ----

  describe("poll", () => {
    it("should update snapshots for all pools", async () => {
      const provider = mockProvider({});
      const pool1 = makePool();
      const pool2 = makePool({
        label: "WETH/USDC Sushi",
        dex: "sushiswap",
        poolAddress: ADDR.POOL_SUSHI,
      });

      monitor = new PriceMonitor({ provider, pools: [pool1, pool2] });
      await monitor.poll();

      expect(monitor.getSnapshot(ADDR.POOL_V2)).toBeDefined();
      expect(monitor.getSnapshot(ADDR.POOL_SUSHI)).toBeDefined();
      expect(monitor.getAllSnapshots()).toHaveLength(2);
    });

    it("should emit priceUpdate for each successful fetch", async () => {
      const provider = mockProvider({});
      monitor = new PriceMonitor({ provider, pools: [makePool()] });

      const updates: PriceSnapshot[] = [];
      monitor.on("priceUpdate", (snap) => updates.push(snap));

      await monitor.poll();
      expect(updates).toHaveLength(1);
      expect(updates[0].price).toBeCloseTo(2000, 0);
    });

    it("should emit opportunity when delta exceeds threshold", async () => {
      const cheapPool = makePool({
        label: "WETH/USDC UniV2 (cheap)",
        poolAddress: ADDR.POOL_V2,
      });
      const expensivePool = makePool({
        label: "WETH/USDC Sushi (expensive)",
        dex: "sushiswap",
        poolAddress: ADDR.POOL_SUSHI,
      });

      const provider = {
        getBlockNumber: vi.fn().mockResolvedValue(19_000_000),
        call: vi.fn().mockImplementation(async (tx: { to: string; data: string }) => {
          const to = tx.to.toLowerCase();
          if (to === ADDR.POOL_V2.toLowerCase()) {
            return encodeGetReserves(
              BigInt("1000000000000000000000"),
              BigInt("2000000000000"),  // price = 2000
              0,
            );
          }
          if (to === ADDR.POOL_SUSHI.toLowerCase()) {
            return encodeGetReserves(
              BigInt("1000000000000000000000"),
              BigInt("2020000000000"),  // price = 2020
              0,
            );
          }
          throw new Error(`Unexpected address: ${tx.to}`);
        }),
      } as any;

      monitor = new PriceMonitor({
        provider,
        pools: [cheapPool, expensivePool],
        deltaThresholdPercent: 0.5,
      });

      const opportunities: PriceDelta[] = [];
      monitor.on("opportunity", (d) => opportunities.push(d));

      await monitor.poll();

      // 1% delta (2020 vs 2000) exceeds 0.5% threshold
      expect(opportunities).toHaveLength(1);
      expect(opportunities[0].deltaPercent).toBeCloseTo(1.0, 1);
      expect(opportunities[0].buyPool.price).toBeCloseTo(2000, 0);
      expect(opportunities[0].sellPool.price).toBeCloseTo(2020, 0);
    });

    it("should NOT emit opportunity when delta is below threshold", async () => {
      const pool1 = makePool({ poolAddress: ADDR.POOL_V2 });
      const pool2 = makePool({
        dex: "sushiswap",
        poolAddress: ADDR.POOL_SUSHI,
      });

      const provider = {
        getBlockNumber: vi.fn().mockResolvedValue(19_000_000),
        call: vi.fn().mockImplementation(async (tx: { to: string }) => {
          const to = tx.to.toLowerCase();
          if (to === ADDR.POOL_V2.toLowerCase()) {
            return encodeGetReserves(
              BigInt("1000000000000000000000"),
              BigInt("2000000000000"),  // price = 2000
              0,
            );
          }
          if (to === ADDR.POOL_SUSHI.toLowerCase()) {
            return encodeGetReserves(
              BigInt("1000000000000000000000"),
              BigInt("2002000000000"),  // price = 2002 → 0.1% delta
              0,
            );
          }
          throw new Error(`Unexpected address: ${tx.to}`);
        }),
      } as any;

      monitor = new PriceMonitor({
        provider,
        pools: [pool1, pool2],
        deltaThresholdPercent: 0.5,
      });

      const opportunities: PriceDelta[] = [];
      monitor.on("opportunity", (d) => opportunities.push(d));

      await monitor.poll();
      expect(opportunities).toHaveLength(0);
    });
  });

  // ---- Error handling ----
  // These tests spy on fetchPrice directly to avoid ethers v6 internal
  // error-wrapping side-effects that interfere with Promise.allSettled.

  describe("error handling", () => {
    it("should emit error event on pool fetch failure", async () => {
      const provider = mockProvider({});
      monitor = new PriceMonitor({ provider, pools: [makePool()] });

      vi.spyOn(monitor, "fetchPrice").mockRejectedValue(
        new Error("RPC call failed"),
      );

      const errors: Array<{ error: Error; pool: PoolConfig }> = [];
      monitor.on("error", (err, pool) => errors.push({ error: err, pool }));

      await monitor.poll();
      expect(errors).toHaveLength(1);
      expect(errors[0].error.message).toBe("RPC call failed");
    });

    it("should emit stale event after maxRetries consecutive failures", async () => {
      const provider = mockProvider({});
      monitor = new PriceMonitor({
        provider,
        pools: [makePool()],
        maxRetries: 2,
      });

      vi.spyOn(monitor, "fetchPrice").mockImplementation(async () => {
        throw new Error("RPC down");
      });

      const staleEvents: PoolConfig[] = [];
      monitor.on("error", () => {}); // prevent EventEmitter throw on unhandled "error"
      monitor.on("stale", (pool) => staleEvents.push(pool));

      // First poll: 1 error, not stale yet
      await monitor.poll();
      expect(staleEvents).toHaveLength(0);

      // Second poll: 2 errors, now stale
      await monitor.poll();
      expect(staleEvents).toHaveLength(1);
    });

    it("should reset error count on successful fetch", async () => {
      const provider = mockProvider({});
      monitor = new PriceMonitor({
        provider,
        pools: [makePool()],
        maxRetries: 3,
      });

      let shouldFail = true;
      const originalFetch = monitor.fetchPrice.bind(monitor);
      vi.spyOn(monitor, "fetchPrice").mockImplementation(async (pool) => {
        if (shouldFail) throw new Error("RPC fail");
        return originalFetch(pool);
      });

      const staleEvents: PoolConfig[] = [];
      monitor.on("error", () => {}); // prevent EventEmitter throw on unhandled "error"
      monitor.on("stale", (pool) => staleEvents.push(pool));

      // Fail twice
      await monitor.poll();
      await monitor.poll();

      // Now succeed — should reset counter
      shouldFail = false;
      await monitor.poll();

      // Fail again — counter restarted, so no stale event yet
      shouldFail = true;
      await monitor.poll();
      await monitor.poll();
      expect(staleEvents).toHaveLength(0);

      // Third failure — now stale
      await monitor.poll();
      expect(staleEvents).toHaveLength(1);
    });

    it("should continue monitoring other pools when one fails", async () => {
      const goodPool = makePool({ poolAddress: ADDR.POOL_V2 });
      const badPool = makePool({
        label: "BAD POOL",
        poolAddress: ADDR.POOL_SUSHI,
      });

      const provider = mockProvider({});
      monitor = new PriceMonitor({ provider, pools: [goodPool, badPool] });

      const originalFetch = monitor.fetchPrice.bind(monitor);
      vi.spyOn(monitor, "fetchPrice").mockImplementation(async (pool) => {
        if (pool.poolAddress === ADDR.POOL_SUSHI) {
          throw new Error("Pool gone");
        }
        return originalFetch(pool);
      });

      const updates: PriceSnapshot[] = [];
      const errors: Error[] = [];
      monitor.on("priceUpdate", (s) => updates.push(s));
      monitor.on("error", (e) => errors.push(e));

      await monitor.poll();

      expect(updates).toHaveLength(1);
      expect(updates[0].pool.poolAddress).toBe(ADDR.POOL_V2);
      expect(errors).toHaveLength(1);
    });
  });

  // ---- Snapshot access ----

  describe("snapshot access", () => {
    it("should return undefined for unknown pool", () => {
      const provider = mockProvider({});
      monitor = new PriceMonitor({ provider, pools: [] });
      expect(monitor.getSnapshot("0xdeadbeef")).toBeUndefined();
    });

    it("should be case-insensitive for pool address lookup", async () => {
      const provider = mockProvider({});
      monitor = new PriceMonitor({ provider, pools: [makePool()] });
      await monitor.poll();

      const lower = monitor.getSnapshot(ADDR.POOL_V2.toLowerCase());
      const upper = monitor.getSnapshot(ADDR.POOL_V2.toUpperCase());
      expect(lower).toBeDefined();
      expect(upper).toBeDefined();
      expect(lower?.price).toBe(upper?.price);
    });
  });

  // ---- Multicall batching ----

  describe("multicall batching", () => {
    const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";
    const mcABI = [
      "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) returns (tuple(bool success, bytes returnData)[])",
    ];
    const mcIface = new Interface(mcABI);

    /** Process a single sub-call by its 4-byte selector, returning ABI-encoded result */
    function processSingleCall(
      selector: string,
      opts: {
        getReservesReturn?: [bigint, bigint, number];
        slot0Return?: [bigint, number, number, number, number, number, boolean];
        globalStateReturn?: [bigint, number, number, number, number, number, number];
      },
    ): string {
      if (selector === "0x0902f1ac") {
        const [r0, r1, ts] = opts.getReservesReturn ?? [
          BigInt("1000000000000000000000"),
          BigInt("2000000000000"),
          0,
        ];
        return encodeGetReserves(r0, r1, ts);
      }
      if (selector === "0x3850c7bd") {
        const [sqrtPrice, tick, obsIdx, obsCar, obsCarNext, feeProt, unlocked] =
          opts.slot0Return ?? [
            BigInt("3543191142285914000000000"),
            0, 0, 0, 0, 0, true,
          ];
        return encodeSlot0(sqrtPrice, tick, obsIdx, obsCar, obsCarNext, feeProt, unlocked);
      }
      if (selector === "0xe76c01e4") {
        const [sqrtPrice, tick, feeZto, feeOtz, tpIdx, cf0, cf1] =
          opts.globalStateReturn ?? [
            BigInt("3543191142285914000000000"),
            0, 100, 100, 0, 0, 0,
          ];
        return encodeGlobalState(sqrtPrice, tick, feeZto, feeOtz, tpIdx, cf0, cf1);
      }
      throw new Error(`Unknown selector: ${selector}`);
    }

    /** Build a mock provider that handles Multicall3 aggregate3 calls */
    function multicallMockProvider(opts: {
      blockNumber?: number;
      getReservesReturn?: [bigint, bigint, number];
      slot0Return?: [bigint, number, number, number, number, number, boolean];
      globalStateReturn?: [bigint, number, number, number, number, number, number];
      failedPools?: Set<string>;
    }) {
      const blockNum = opts.blockNumber ?? 19_000_000;

      return {
        getBlockNumber: vi.fn().mockResolvedValue(blockNum),
        call: vi.fn().mockImplementation(async (tx: { to?: string; data: string }) => {
          // Handle Multicall3 aggregate3 calls
          if (tx.to?.toLowerCase() === MULTICALL3_ADDRESS.toLowerCase()) {
            const decoded = mcIface.decodeFunctionData("aggregate3", tx.data);
            const calls = decoded[0];

            const results: Array<[boolean, string]> = [];
            for (const call of calls) {
              const target = (call.target as string).toLowerCase();
              if (opts.failedPools?.has(target)) {
                results.push([false, "0x"]);
              } else {
                const selector = (call.callData as string).slice(0, 10);
                try {
                  const returnData = processSingleCall(selector, opts);
                  results.push([true, returnData]);
                } catch {
                  results.push([false, "0x"]);
                }
              }
            }

            return mcIface.encodeFunctionResult("aggregate3", [results]);
          }

          // Handle individual calls (fallback path)
          const selector = tx.data.slice(0, 10);
          return processSingleCall(selector, opts);
        }),
      } as any;
    }

    it("should batch all pool reads into a single multicall", async () => {
      const v2Pool = makePool({ poolAddress: ADDR.POOL_V2 });
      const v3Pool = makePool({
        label: "WETH/USDC UniV3",
        dex: "uniswap_v3",
        poolAddress: ADDR.POOL_V3,
        feeTier: 3000,
      });
      const camelotPool = makePool({
        label: "WETH/USDC CamelotV3",
        dex: "camelot_v3",
        poolAddress: ADDR.POOL_CAMELOT_V3,
      });

      const provider = multicallMockProvider({});
      monitor = new PriceMonitor({
        provider,
        pools: [v2Pool, v3Pool, camelotPool],
        useMulticall: true,
      });

      await monitor.poll();

      // Should have exactly 2 provider.call invocations:
      // 1 getBlockNumber + 1 multicall (NOT 1 per pool)
      expect(provider.getBlockNumber).toHaveBeenCalledTimes(1);
      expect(provider.call).toHaveBeenCalledTimes(1);

      // All 3 snapshots should be populated
      expect(monitor.getAllSnapshots()).toHaveLength(3);
      expect(monitor.getSnapshot(ADDR.POOL_V2)?.price).toBeCloseTo(2000, 0);
      expect(monitor.getSnapshot(ADDR.POOL_V3)?.price).toBeCloseTo(2000, 0);
      expect(monitor.getSnapshot(ADDR.POOL_CAMELOT_V3)?.price).toBeCloseTo(2000, 0);
    });

    it("should send the multicall to the correct Multicall3 address", async () => {
      const provider = multicallMockProvider({});
      monitor = new PriceMonitor({
        provider,
        pools: [makePool()],
        useMulticall: true,
      });

      await monitor.poll();

      const callArg = provider.call.mock.calls[0][0];
      expect(callArg.to).toBe(MULTICALL3_ADDRESS);
    });

    it("should handle individual pool failure gracefully in multicall batch", async () => {
      const goodPool = makePool({ poolAddress: ADDR.POOL_V2 });
      const badPool = makePool({
        label: "BAD POOL",
        dex: "sushiswap",
        poolAddress: ADDR.POOL_SUSHI,
      });

      const provider = multicallMockProvider({
        failedPools: new Set([ADDR.POOL_SUSHI.toLowerCase()]),
      });

      monitor = new PriceMonitor({
        provider,
        pools: [goodPool, badPool],
        useMulticall: true,
      });

      const updates: PriceSnapshot[] = [];
      const errors: Array<{ error: Error; pool: PoolConfig }> = [];
      monitor.on("priceUpdate", (s) => updates.push(s));
      monitor.on("error", (err, pool) => errors.push({ error: err, pool }));

      await monitor.poll();

      // Good pool should succeed
      expect(updates).toHaveLength(1);
      expect(updates[0].pool.poolAddress).toBe(ADDR.POOL_V2);

      // Bad pool should emit error
      expect(errors).toHaveLength(1);
      expect(errors[0].error.message).toContain("Multicall failed for BAD POOL");
    });

    it("should fall back to individual calls when multicall fails entirely", async () => {
      // Provider that rejects multicall but handles individual calls
      const provider = {
        getBlockNumber: vi.fn().mockResolvedValue(19_000_000),
        call: vi.fn().mockImplementation(async (tx: { to?: string; data: string }) => {
          if (tx.to?.toLowerCase() === MULTICALL3_ADDRESS.toLowerCase()) {
            throw new Error("Multicall3 not available");
          }
          // Handle individual call
          const selector = tx.data.slice(0, 10);
          if (selector === "0x0902f1ac") {
            return encodeGetReserves(
              BigInt("1000000000000000000000"),
              BigInt("2000000000000"),
              0,
            );
          }
          throw new Error(`Unknown selector: ${selector}`);
        }),
      } as any;

      monitor = new PriceMonitor({
        provider,
        pools: [makePool()],
        useMulticall: true,
      });

      await monitor.poll();

      // Should still get the snapshot via fallback individual calls
      expect(monitor.getSnapshot(ADDR.POOL_V2)).toBeDefined();
      expect(monitor.getSnapshot(ADDR.POOL_V2)?.price).toBeCloseTo(2000, 0);

      // provider.call called twice: 1 failed multicall + 1 individual call
      // getBlockNumber called twice: 1 for multicall attempt + 1 for individual fetch
      expect(provider.call).toHaveBeenCalledTimes(2);
    });

    it("should skip multicall when useMulticall is false", async () => {
      const provider = multicallMockProvider({});
      monitor = new PriceMonitor({
        provider,
        pools: [makePool()],
        useMulticall: false,
      });

      await monitor.poll();

      // Should use individual calls (getBlockNumber + getReserves for 1 pool)
      expect(provider.getBlockNumber).toHaveBeenCalled();
      expect(monitor.getSnapshot(ADDR.POOL_V2)).toBeDefined();

      // The call to provider should NOT go to Multicall3
      for (const callArgs of provider.call.mock.calls) {
        expect(callArgs[0].to?.toLowerCase()).not.toBe(MULTICALL3_ADDRESS.toLowerCase());
      }
    });

    it("should emit stale event for pool that fails repeatedly in multicall", async () => {
      const pool = makePool({ poolAddress: ADDR.POOL_V2 });
      const provider = multicallMockProvider({
        failedPools: new Set([ADDR.POOL_V2.toLowerCase()]),
      });

      monitor = new PriceMonitor({
        provider,
        pools: [pool],
        useMulticall: true,
        maxRetries: 2,
      });

      const staleEvents: PoolConfig[] = [];
      monitor.on("error", () => {});
      monitor.on("stale", (p) => staleEvents.push(p));

      // First poll: 1 error, not stale yet
      await monitor.poll();
      expect(staleEvents).toHaveLength(0);

      // Second poll: 2 errors, now stale
      await monitor.poll();
      expect(staleEvents).toHaveLength(1);
    });
  });
});
