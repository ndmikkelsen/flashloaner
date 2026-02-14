/**
 * Tests for the test infrastructure itself.
 *
 * Validates that fixture factories, mock providers, event capture utilities,
 * and time helpers behave correctly. This prevents cascading failures from
 * broken test infrastructure.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import {
  ADDRESSES,
  makePool,
  makeV3Pool,
  makeSushiPool,
  makeSnapshot,
  makeSnapshotPair,
  makeDelta,
  makeProfitableDelta,
  makeUnprofitableDelta,
  makeSwapStep,
  makeSwapPath,
  makeCostEstimate,
  makeOpportunity,
  encodeGetReserves,
  encodeSlot0,
  RESERVES_2000,
  RESERVES_2000_SMALL,
  RESERVES_2020,
  SQRT_PRICE_2000,
} from "./FixtureFactory.js";
import {
  captureEvents,
  waitForEvent,
  waitForEvents,
  assertNoEvent,
} from "./EventCapture.js";
import {
  advanceTime,
  fixedTimestamp,
  mockDateNow,
  delay,
} from "./TimeHelpers.js";
import {
  setTestEnv,
  expectRevert,
  createDelayedSpy,
  approxEqual,
  formatEth,
  formatGwei,
} from "./TestHelpers.js";
import {
  createMockProvider,
  createRoutingProvider,
  createFailingProvider,
} from "../mocks/MockProvider.js";
import { MockPriceMonitor } from "../mocks/MockPriceMonitor.js";
import { MockOpportunityDetector } from "../mocks/MockOpportunityDetector.js";

// ===========================================================================
// Fixture Factory Tests
// ===========================================================================

describe("FixtureFactory", () => {
  describe("ADDRESSES", () => {
    it("should provide well-known token addresses", () => {
      expect(ADDRESSES.WETH).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(ADDRESSES.USDC).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(ADDRESSES.DAI).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it("should provide test infrastructure addresses", () => {
      expect(ADDRESSES.EXECUTOR).toBeDefined();
      expect(ADDRESSES.BOT_WALLET).toBeDefined();
      expect(ADDRESSES.AAVE_POOL).toBeDefined();
    });
  });

  describe("makePool", () => {
    it("should create a V2 pool with defaults", () => {
      const pool = makePool();
      expect(pool.dex).toBe("uniswap_v2");
      expect(pool.token0).toBe(ADDRESSES.WETH);
      expect(pool.token1).toBe(ADDRESSES.USDC);
      expect(pool.decimals0).toBe(18);
      expect(pool.decimals1).toBe(6);
    });

    it("should accept partial overrides", () => {
      const pool = makePool({ dex: "sushiswap", decimals0: 8 });
      expect(pool.dex).toBe("sushiswap");
      expect(pool.decimals0).toBe(8);
      // Other fields should keep defaults
      expect(pool.token0).toBe(ADDRESSES.WETH);
    });
  });

  describe("makeV3Pool", () => {
    it("should create a V3 pool with fee tier", () => {
      const pool = makeV3Pool();
      expect(pool.dex).toBe("uniswap_v3");
      expect(pool.feeTier).toBe(3000);
    });
  });

  describe("makeSushiPool", () => {
    it("should create a SushiSwap pool", () => {
      const pool = makeSushiPool();
      expect(pool.dex).toBe("sushiswap");
      expect(pool.poolAddress).toBe(ADDRESSES.POOL_SUSHI);
    });
  });

  describe("makeSnapshot", () => {
    it("should create a snapshot with default price ~2000", () => {
      const snap = makeSnapshot();
      expect(snap.price).toBe(2000);
      expect(snap.inversePrice).toBeCloseTo(0.0005, 6);
      expect(snap.blockNumber).toBe(19_000_000);
    });

    it("should compute inversePrice from price", () => {
      const snap = makeSnapshot({ price: 4000 });
      expect(snap.inversePrice).toBeCloseTo(0.00025, 6);
    });
  });

  describe("makeSnapshotPair", () => {
    it("should create buy/sell pair with price gap", () => {
      const pair = makeSnapshotPair({ buyPrice: 1000, sellPrice: 1020 });
      expect(pair.buy.price).toBe(1000);
      expect(pair.sell.price).toBe(1020);
    });

    it("should use different DEXes for buy and sell", () => {
      const pair = makeSnapshotPair();
      expect(pair.buy.pool.dex).not.toBe(pair.sell.pool.dex);
    });
  });

  describe("makeDelta", () => {
    it("should create a delta with positive percentage", () => {
      const delta = makeDelta();
      expect(delta.deltaPercent).toBeGreaterThan(0);
      expect(delta.buyPool).toBeDefined();
      expect(delta.sellPool).toBeDefined();
    });
  });

  describe("makeProfitableDelta", () => {
    it("should create a delta with specified basis points", () => {
      const delta = makeProfitableDelta(200); // 2%
      expect(delta.deltaPercent).toBeCloseTo(2.0, 1);
    });
  });

  describe("makeUnprofitableDelta", () => {
    it("should create a delta with tiny spread", () => {
      const delta = makeUnprofitableDelta();
      expect(delta.deltaPercent).toBeLessThan(0.1);
    });
  });

  describe("makeSwapStep", () => {
    it("should create a swap step with sensible defaults", () => {
      const step = makeSwapStep();
      expect(step.dex).toBe("uniswap_v2");
      expect(step.tokenIn).toBeDefined();
      expect(step.tokenOut).toBeDefined();
    });
  });

  describe("makeSwapPath", () => {
    it("should create a two-step path by default", () => {
      const path = makeSwapPath();
      expect(path.steps).toHaveLength(2);
      expect(path.baseToken).toBe(ADDRESSES.USDC);
    });
  });

  describe("makeCostEstimate", () => {
    it("should compute totalCost from components", () => {
      const costs = makeCostEstimate({
        flashLoanFee: 0.01,
        gasCost: 0.02,
        slippageCost: 0.03,
      });
      expect(costs.totalCost).toBeCloseTo(0.06, 10);
    });
  });

  describe("makeOpportunity", () => {
    it("should create a full opportunity with computed fields", () => {
      const opp = makeOpportunity({ grossProfit: 0.5 });
      expect(opp.grossProfit).toBe(0.5);
      expect(opp.netProfit).toBeLessThan(opp.grossProfit);
      expect(opp.path.steps).toHaveLength(2);
      expect(opp.id).toMatch(/^test-/);
    });
  });

  describe("ABI encoding", () => {
    it("should encode getReserves as 3x32 byte hex", () => {
      const encoded = encodeGetReserves(1000n, 2000n, 123);
      // 0x + 3 * 64 chars = 194 chars
      expect(encoded).toHaveLength(2 + 3 * 64);
      expect(encoded).toMatch(/^0x[0-9a-f]+$/);
    });

    it("should encode slot0 as 7x32 byte hex", () => {
      const encoded = encodeSlot0(SQRT_PRICE_2000);
      // 0x + 7 * 64 chars = 450 chars
      expect(encoded).toHaveLength(2 + 7 * 64);
    });
  });

  describe("reserve presets", () => {
    it("should have consistent reserve ratios", () => {
      // Both RESERVES_2000 and RESERVES_2000_SMALL should imply price ~2000
      const price1 =
        Number(RESERVES_2000.reserve1) /
        1e6 /
        (Number(RESERVES_2000.reserve0) / 1e18);
      const price2 =
        Number(RESERVES_2000_SMALL.reserve1) /
        1e6 /
        (Number(RESERVES_2000_SMALL.reserve0) / 1e18);
      expect(price1).toBeCloseTo(2000, 0);
      expect(price2).toBeCloseTo(2000, 0);
    });

    it("should have RESERVES_2020 at higher price", () => {
      const price =
        Number(RESERVES_2020.reserve1) /
        1e6 /
        (Number(RESERVES_2020.reserve0) / 1e18);
      expect(price).toBeCloseTo(2020, 0);
    });
  });
});

// ===========================================================================
// EventCapture Tests
// ===========================================================================

describe("EventCapture", () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
  });

  describe("captureEvents", () => {
    it("should collect emitted events", () => {
      const captured = captureEvents(emitter, "test");
      emitter.emit("test", "hello");
      emitter.emit("test", "world");

      const events = captured();
      expect(events).toHaveLength(2);
      expect(events[0].args).toBe("hello");
      expect(events[1].args).toBe("world");
    });

    it("should record event name and timestamp", () => {
      const captured = captureEvents(emitter, "myEvent");
      emitter.emit("myEvent", 42);

      const events = captured();
      expect(events[0].name).toBe("myEvent");
      expect(events[0].timestamp).toBeGreaterThan(0);
    });
  });

  describe("waitForEvent", () => {
    it("should resolve when event is emitted", async () => {
      const promise = waitForEvent(emitter, "done", 1000);
      emitter.emit("done", "result");

      const value = await promise;
      expect(value).toBe("result");
    });

    it("should reject on timeout", async () => {
      const promise = waitForEvent(emitter, "never", 50);
      await expect(promise).rejects.toThrow(/Timeout/);
    });
  });

  describe("waitForEvents", () => {
    it("should collect N events before resolving", async () => {
      const promise = waitForEvents(emitter, "tick", 3, 1000);
      emitter.emit("tick", 1);
      emitter.emit("tick", 2);
      emitter.emit("tick", 3);

      const values = await promise;
      expect(values).toEqual([1, 2, 3]);
    });

    it("should reject if N events are not received in time", async () => {
      const promise = waitForEvents(emitter, "tick", 5, 50);
      emitter.emit("tick", 1);

      await expect(promise).rejects.toThrow(/1\/5/);
    });
  });

  describe("assertNoEvent", () => {
    it("should pass when event is NOT emitted", async () => {
      await assertNoEvent(emitter, "bad", () => {
        emitter.emit("good", "ok");
      }, 50);
    });

    it("should fail when event IS emitted", async () => {
      await expect(
        assertNoEvent(emitter, "bad", () => {
          emitter.emit("bad", "oops");
        }, 50),
      ).rejects.toThrow(/NOT be emitted/);
    });
  });
});

// ===========================================================================
// TimeHelpers Tests
// ===========================================================================

describe("TimeHelpers", () => {
  describe("fixedTimestamp", () => {
    it("should parse ISO date to ms timestamp", () => {
      const ts = fixedTimestamp("2025-01-01T00:00:00Z");
      expect(ts).toBe(new Date("2025-01-01T00:00:00Z").getTime());
    });
  });

  describe("mockDateNow", () => {
    it("should override Date.now() and restore on cleanup", () => {
      const original = Date.now();
      const restore = mockDateNow(1_700_000_000_000);

      expect(Date.now()).toBe(1_700_000_000_000);
      restore();

      // After restore, Date.now should return current time (not frozen)
      expect(Date.now()).toBeGreaterThanOrEqual(original);
    });
  });

  describe("advanceTime", () => {
    it("should advance fake timers", async () => {
      vi.useFakeTimers();
      let fired = false;
      setTimeout(() => { fired = true; }, 1000);

      await advanceTime(1000);
      expect(fired).toBe(true);

      vi.useRealTimers();
    });
  });

  describe("delay", () => {
    it("should resolve after specified ms", async () => {
      const start = Date.now();
      await delay(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(40); // Allow small timing variance
    });
  });
});

// ===========================================================================
// TestHelpers Tests
// ===========================================================================

describe("TestHelpers", () => {
  describe("setTestEnv", () => {
    it("should set env vars and restore on cleanup", () => {
      const original = process.env["TEST_UNIQUE_VAR_123"];
      const restore = setTestEnv({ TEST_UNIQUE_VAR_123: "hello" });

      expect(process.env["TEST_UNIQUE_VAR_123"]).toBe("hello");
      restore();
      expect(process.env["TEST_UNIQUE_VAR_123"]).toBe(original);
    });

    it("should delete vars that did not exist before", () => {
      delete process.env["BRAND_NEW_VAR_XYZ"];
      const restore = setTestEnv({ BRAND_NEW_VAR_XYZ: "temp" });

      expect(process.env["BRAND_NEW_VAR_XYZ"]).toBe("temp");
      restore();
      expect(process.env["BRAND_NEW_VAR_XYZ"]).toBeUndefined();
    });
  });

  describe("expectRevert", () => {
    it("should pass when function throws matching error", async () => {
      const err = await expectRevert(
        () => Promise.reject(new Error("bad input")),
        "bad input",
      );
      expect(err.message).toBe("bad input");
    });

    it("should fail when function does not throw", async () => {
      await expect(
        expectRevert(() => Promise.resolve()),
      ).rejects.toThrow(/Expected function to throw/);
    });

    it("should support RegExp matching", async () => {
      await expectRevert(
        () => Promise.reject(new Error("Gas price 50 gwei too high")),
        /too high/,
      );
    });
  });

  describe("createDelayedSpy", () => {
    it("should resolve with value after delay", async () => {
      const spy = createDelayedSpy(10, "done");
      const result = await spy();
      expect(result).toBe("done");
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe("approxEqual", () => {
    it("should return true for values within epsilon", () => {
      expect(approxEqual(1.0, 1.0 + 1e-11)).toBe(true);
    });

    it("should return false for values outside epsilon", () => {
      expect(approxEqual(1.0, 1.1)).toBe(false);
    });
  });

  describe("formatEth", () => {
    it("should format wei to ETH string", () => {
      expect(formatEth(1_000_000_000_000_000_000n)).toBe("1.000000 ETH");
    });
  });

  describe("formatGwei", () => {
    it("should format wei to gwei string", () => {
      expect(formatGwei(30_000_000_000n)).toBe("30.00 gwei");
    });
  });
});

// ===========================================================================
// Mock Provider Tests
// ===========================================================================

describe("MockProvider", () => {
  describe("createMockProvider", () => {
    it("should return default block number", async () => {
      const provider = createMockProvider();
      expect(await provider.getBlockNumber()).toBe(19_000_000);
    });

    it("should handle getReserves calls", async () => {
      const provider = createMockProvider();
      const result = await provider.call({ data: "0x0902f1ac" });
      expect(result).toMatch(/^0x/);
      expect(result.length).toBe(2 + 3 * 64); // 3 x uint256
    });

    it("should handle slot0 calls", async () => {
      const provider = createMockProvider();
      const result = await provider.call({ data: "0x3850c7bd" });
      expect(result).toMatch(/^0x/);
      expect(result.length).toBe(2 + 7 * 64); // 7 x uint256
    });

    it("should reject unknown selectors", async () => {
      const provider = createMockProvider();
      await expect(
        provider.call({ data: "0xdeadbeef" }),
      ).rejects.toThrow(/unknown selector/);
    });

    it("should accept custom block number", async () => {
      const provider = createMockProvider({ blockNumber: 20_000_000 });
      expect(await provider.getBlockNumber()).toBe(20_000_000);
    });
  });

  describe("createRoutingProvider", () => {
    it("should route calls by address", async () => {
      const addr1 = "0x0000000000000000000000000000000000000001";
      const addr2 = "0x0000000000000000000000000000000000000002";

      const provider = createRoutingProvider({
        [addr1]: { reserves: [100n, 200n, 0] },
        [addr2]: { reserves: [300n, 600n, 0] },
      });

      const r1 = await provider.call({ to: addr1, data: "0x0902f1ac" });
      const r2 = await provider.call({ to: addr2, data: "0x0902f1ac" });

      expect(r1).not.toBe(r2);
    });
  });

  describe("createFailingProvider", () => {
    it("should reject all calls", async () => {
      const provider = createFailingProvider("network down");
      await expect(provider.getBlockNumber()).rejects.toThrow("network down");
      await expect(provider.call({})).rejects.toThrow("network down");
    });
  });
});

// ===========================================================================
// Mock Module Tests
// ===========================================================================

describe("MockPriceMonitor", () => {
  it("should track running state", () => {
    const mock = new MockPriceMonitor();
    expect(mock.isRunning).toBe(false);
    mock.start();
    expect(mock.isRunning).toBe(true);
    mock.stop();
    expect(mock.isRunning).toBe(false);
  });

  it("should store and emit snapshots", async () => {
    const mock = new MockPriceMonitor();
    const snap = makeSnapshot();
    mock.setSnapshot(snap);

    const updates: unknown[] = [];
    mock.on("priceUpdate", (s) => updates.push(s));
    await mock.poll();

    expect(updates).toHaveLength(1);
    expect(mock.getSnapshot(snap.pool.poolAddress)).toBe(snap);
  });

  it("should emit opportunity events", () => {
    const mock = new MockPriceMonitor();
    const delta = makeDelta();
    const received: unknown[] = [];
    mock.on("opportunity", (d) => received.push(d));

    mock.emitOpportunity(delta);
    expect(received).toHaveLength(1);
  });

  it("should reset state", () => {
    const mock = new MockPriceMonitor();
    mock.start();
    mock.setSnapshot(makeSnapshot());
    mock.reset();

    expect(mock.isRunning).toBe(false);
    expect(mock.getAllSnapshots()).toHaveLength(0);
  });
});

describe("MockOpportunityDetector", () => {
  it("should track attached state", () => {
    const mock = new MockOpportunityDetector();
    expect(mock.isAttached).toBe(false);
    mock.attach({} as any);
    expect(mock.isAttached).toBe(true);
    mock.detach();
    expect(mock.isAttached).toBe(false);
  });

  it("should emit opportunityFound events", () => {
    const mock = new MockOpportunityDetector();
    const opp = makeOpportunity();
    const received: unknown[] = [];
    mock.on("opportunityFound", (o) => received.push(o));

    mock.emitOpportunity(opp);
    expect(received).toHaveLength(1);
    expect(mock.emittedOpportunities).toHaveLength(1);
  });

  it("should track received deltas", () => {
    const mock = new MockOpportunityDetector();
    const delta = makeDelta();
    mock.analyzeDelta(delta);
    expect(mock.receivedDeltas).toHaveLength(1);
  });

  it("should reset state", () => {
    const mock = new MockOpportunityDetector();
    mock.attach({} as any);
    mock.analyzeDelta(makeDelta());
    mock.emitOpportunity(makeOpportunity());
    mock.reset();

    expect(mock.isAttached).toBe(false);
    expect(mock.receivedDeltas).toHaveLength(0);
    expect(mock.emittedOpportunities).toHaveLength(0);
  });
});
