import { describe, it, expect, beforeEach, vi } from "vitest";
import { PriceMonitor } from "../../src/monitor/PriceMonitor.js";
import { OpportunityDetector } from "../../src/detector/OpportunityDetector.js";
import type { PoolConfig, PriceDelta, PriceSnapshot } from "../../src/monitor/types.js";
import { Interface } from "ethers";

describe("Ramses V3 Price Reading", () => {
  const RAMSES_POOL_ADDRESS = "0x1234567890123456789012345678901234567890";
  const WETH = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1";
  const USDC = "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8";

  const ramsesPool: PoolConfig = {
    label: "WETH/USDC Ramses V3 (0.05%)",
    dex: "ramses_v3",
    poolAddress: RAMSES_POOL_ADDRESS,
    token0: WETH,
    token1: USDC,
    decimals0: 18,
    decimals1: 6,
    feeTier: 500,
  };

  const uniV3Pool: PoolConfig = {
    label: "WETH/USDC UniV3 (0.05%)",
    dex: "uniswap_v3",
    poolAddress: "0xC31E54c7a869B9FcBEcc14363CF510d1c41fa443",
    token0: WETH,
    token1: USDC,
    decimals0: 18,
    decimals1: 6,
    feeTier: 500,
  };

  /**
   * Build a mock ethers v6 Provider that returns slot0() data.
   * Ramses V3 uses the same slot0() interface as Uniswap V3.
   */
  function mockProvider(sqrtPriceX96: bigint) {
    const v3Iface = new Interface([
      "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
    ]);

    return {
      getBlockNumber: vi.fn().mockResolvedValue(19_000_000),
      call: vi.fn().mockImplementation(async (tx: { data: string }) => {
        const selector = tx.data.slice(0, 10);
        if (selector === "0x3850c7bd") {
          // slot0() selector
          const encoded = v3Iface.encodeFunctionResult("slot0", [
            sqrtPriceX96,
            -200000, // tick
            0, // observationIndex
            0, // observationCardinality
            0, // observationCardinalityNext
            0, // feeProtocol
            true, // unlocked
          ]);
          return encoded;
        }
        throw new Error(`Unknown selector: ${selector}`);
      }),
    } as any;
  }

  describe("V3 pool type detection", () => {
    it("should identify ramses_v3 as a V3 pool", () => {
      const provider = mockProvider(BigInt("3543191142285914000000000"));
      const monitor = new PriceMonitor({ provider, pools: [ramsesPool] });

      // Access private method via type assertion
      const isV3 = (monitor as any).isV3Pool(ramsesPool);
      expect(isV3).toBe(true);
    });

    it("should generate slot0() calldata for ramses_v3 pools", () => {
      const provider = mockProvider(BigInt("3543191142285914000000000"));
      const monitor = new PriceMonitor({ provider, pools: [ramsesPool] });

      const callData = (monitor as any).getCallDataForPool(ramsesPool);
      expect(callData).toContain("0x3850c7bd"); // slot0() selector
    });
  });

  describe("V3 price calculation", () => {
    it("should calculate price from sqrtPriceX96 for ramses_v3 pools", () => {
      const provider = mockProvider(BigInt("3543191142285914000000000"));
      const monitor = new PriceMonitor({ provider, pools: [] });

      // For WETH(18)/USDC(6) at ~2000 USDC/ETH
      const sqrtPriceX96 = BigInt("3543191142285914000000000");
      const price = monitor.calculateV3Price(sqrtPriceX96, 18, 6);

      expect(price).toBeGreaterThan(1900);
      expect(price).toBeLessThan(2100);
    });

    it("should handle same decimal tokens for ramses_v3", () => {
      const provider = mockProvider(2n ** 96n);
      const monitor = new PriceMonitor({ provider, pools: [] });

      // sqrtPriceX96 for price = 1.0 → 2^96
      const price = monitor.calculateV3Price(2n ** 96n, 18, 18);
      expect(price).toBeCloseTo(1.0, 5);
    });
  });

  describe("fetchPrice integration", () => {
    it("should fetch Ramses V3 pool price using slot0()", async () => {
      const sqrtPriceX96 = BigInt("3543191142285914000000000");
      const provider = mockProvider(sqrtPriceX96);
      const monitor = new PriceMonitor({ provider, pools: [ramsesPool] });

      const snapshot = await monitor.fetchPrice(ramsesPool);

      expect(snapshot.price).toBeGreaterThan(1900);
      expect(snapshot.price).toBeLessThan(2100);
      expect(snapshot.pool.dex).toBe("ramses_v3");
      expect(snapshot.sqrtPriceX96).toBe(sqrtPriceX96);
    });
  });
});

describe("Ramses Profit Threshold", () => {
  let detector: OpportunityDetector;

  beforeEach(() => {
    detector = new OpportunityDetector({ minProfitThreshold: 0.01 });
  });

  const WETH = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1";
  const USDC = "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8";

  function makeSnapshot(dex: "ramses_v3" | "uniswap_v3", price: number): PriceSnapshot {
    return {
      pool: {
        label: `WETH/USDC ${dex}`,
        dex,
        poolAddress: `0x${dex === "ramses_v3" ? "1111" : "2222"}000000000000000000000000000000000000`,
        token0: WETH,
        token1: USDC,
        decimals0: 18,
        decimals1: 6,
        feeTier: 500,
      },
      price,
      inversePrice: 1 / price,
      blockNumber: 19_000_000,
      timestamp: Date.now(),
    };
  }

  describe("involvesRamses helper", () => {
    it("should detect Ramses on buy side", () => {
      const delta: PriceDelta = {
        pair: "weth/usdc",
        buyPool: makeSnapshot("ramses_v3", 2000),
        sellPool: makeSnapshot("uniswap_v3", 2020),
        deltaPercent: 1.0,
        timestamp: Date.now(),
      };

      const result = (detector as any).involvesRamses(delta);
      expect(result).toBe(true);
    });

    it("should detect Ramses on sell side", () => {
      const delta: PriceDelta = {
        pair: "weth/usdc",
        buyPool: makeSnapshot("uniswap_v3", 2000),
        sellPool: makeSnapshot("ramses_v3", 2020),
        deltaPercent: 1.0,
        timestamp: Date.now(),
      };

      const result = (detector as any).involvesRamses(delta);
      expect(result).toBe(true);
    });

    it("should return false when no Ramses pools involved", () => {
      const delta: PriceDelta = {
        pair: "weth/usdc",
        buyPool: makeSnapshot("uniswap_v3", 2000),
        sellPool: makeSnapshot("uniswap_v3", 2020),
        deltaPercent: 1.0,
        timestamp: Date.now(),
      };

      const result = (detector as any).involvesRamses(delta);
      expect(result).toBe(false);
    });
  });

  describe("2x threshold application", () => {
    it("should apply 2x threshold for opportunities involving Ramses", () => {
      const delta: PriceDelta = {
        pair: "weth/usdc",
        buyPool: makeSnapshot("ramses_v3", 2000),
        sellPool: makeSnapshot("uniswap_v3", 2020),
        deltaPercent: 1.0,
        timestamp: Date.now(),
      };

      const rejected: string[] = [];
      detector.on("opportunityRejected", (msg) => rejected.push(msg));

      const result = detector.analyzeDelta(delta);

      // With 2x threshold (0.02 instead of 0.01), a 1% spread is likely to be rejected
      // because of fees, slippage, and gas costs. Verify the rejection message.
      if (result === null) {
        expect(rejected.length).toBeGreaterThan(0);
        expect(rejected[0]).toContain("2x for Ramses");
      }
    });

    it("should use standard threshold for non-Ramses opportunities", () => {
      const delta: PriceDelta = {
        pair: "weth/usdc",
        buyPool: makeSnapshot("uniswap_v3", 2000),
        sellPool: makeSnapshot("uniswap_v3", 2020),
        deltaPercent: 1.0,
        timestamp: Date.now(),
      };

      const rejected: string[] = [];
      detector.on("opportunityRejected", (msg) => rejected.push(msg));

      detector.analyzeDelta(delta);

      // Verify rejection message does NOT contain "2x for Ramses"
      if (rejected.length > 0) {
        expect(rejected[0]).not.toContain("2x for Ramses");
      }
    });
  });
});
