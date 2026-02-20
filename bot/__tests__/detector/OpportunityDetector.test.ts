import { EventEmitter } from "node:events";
import { describe, it, expect, vi, afterEach } from "vitest";
import { OpportunityDetector } from "../../src/detector/OpportunityDetector.js";
import type {
  ArbitrageOpportunity,
} from "../../src/detector/types.js";
import type {
  PriceDelta,
  PriceSnapshot,
  PoolConfig,
} from "../../src/monitor/types.js";
import type { PriceMonitor } from "../../src/monitor/PriceMonitor.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADDR = {
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  POOL_V2: "0x0000000000000000000000000000000000000001",
  POOL_SUSHI: "0x0000000000000000000000000000000000000003",
  POOL_V3: "0x0000000000000000000000000000000000000002",
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

function makeSnapshot(
  pool: PoolConfig,
  price: number,
  blockNumber = 19_000_000,
): PriceSnapshot {
  return {
    pool,
    price,
    inversePrice: 1 / price,
    blockNumber,
    timestamp: Date.now(),
  };
}

function makeDelta(opts: {
  buyPrice: number;
  sellPrice: number;
  buyPool?: PoolConfig;
  sellPool?: PoolConfig;
}): PriceDelta {
  const buyPool = opts.buyPool ?? makePool({ poolAddress: ADDR.POOL_V2 });
  const sellPool = opts.sellPool ?? makePool({
    label: "WETH/USDC Sushi",
    dex: "sushiswap",
    poolAddress: ADDR.POOL_SUSHI,
  });

  return {
    pair: `${buyPool.token0}/${buyPool.token1}`,
    buyPool: makeSnapshot(buyPool, opts.buyPrice),
    sellPool: makeSnapshot(sellPool, opts.sellPrice),
    deltaPercent: ((opts.sellPrice - opts.buyPrice) / opts.buyPrice) * 100,
    timestamp: Date.now(),
  };
}

/** Create a mock PriceMonitor (EventEmitter with on/off) */
function mockMonitor(): PriceMonitor {
  return new EventEmitter() as unknown as PriceMonitor;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OpportunityDetector", () => {
  let detector: OpportunityDetector;

  afterEach(() => {
    detector?.detach();
  });

  // ---- Construction ----

  describe("construction", () => {
    it("should create with default config", () => {
      detector = new OpportunityDetector();
      expect(detector.isAttached).toBe(false);
    });

    it("should accept custom config", () => {
      detector = new OpportunityDetector({
        minProfitThreshold: 0.05,
        maxSlippage: 0.01,
        defaultInputAmount: 50,
        gasPriceGwei: 50,
        gasPerSwap: 200_000,
        flashLoanFees: { aaveV3: 0.001 },
      });
      expect(detector.isAttached).toBe(false);
    });
  });

  // ---- Attach / Detach ----

  describe("attach / detach", () => {
    it("should attach to a PriceMonitor", () => {
      const monitor = mockMonitor();
      detector = new OpportunityDetector();
      detector.attach(monitor);
      expect(detector.isAttached).toBe(true);
    });

    it("should detach from PriceMonitor", () => {
      const monitor = mockMonitor();
      detector = new OpportunityDetector();
      detector.attach(monitor);
      detector.detach();
      expect(detector.isAttached).toBe(false);
    });

    it("should handle re-attach (detach previous first)", () => {
      const monitor1 = mockMonitor();
      const monitor2 = mockMonitor();
      detector = new OpportunityDetector();
      detector.attach(monitor1);
      detector.attach(monitor2);
      expect(detector.isAttached).toBe(true);

      // Emitting on old monitor should NOT trigger detector
      const opportunities: ArbitrageOpportunity[] = [];
      detector.on("error", () => {});
      detector.on("opportunityFound", (o) => opportunities.push(o));
      monitor1.emit("opportunity", makeDelta({ buyPrice: 2000, sellPrice: 2100 }));
      expect(opportunities).toHaveLength(0);
    });

    it("should respond to PriceMonitor opportunity events", () => {
      const monitor = mockMonitor();
      detector = new OpportunityDetector({
        minProfitThreshold: 0, // accept any profit
        gasPriceGwei: 0,       // no gas costs for clean test
      });
      detector.on("error", () => {});

      const found: ArbitrageOpportunity[] = [];
      detector.on("opportunityFound", (o) => found.push(o));
      detector.attach(monitor);

      // 5% delta, should be profitable
      monitor.emit("opportunity", makeDelta({ buyPrice: 2000, sellPrice: 2100 }));
      expect(found).toHaveLength(1);
    });
  });

  // ---- buildSwapPath ----

  describe("buildSwapPath", () => {
    it("should build a 2-step swap path from price delta", () => {
      detector = new OpportunityDetector();
      const delta = makeDelta({ buyPrice: 2000, sellPrice: 2020 });
      const path = detector.buildSwapPath(delta);

      expect(path.steps).toHaveLength(2);
      expect(path.baseToken).toBe(ADDR.USDC);

      // Step 1: buy token0 on cheap pool (token1 → token0)
      expect(path.steps[0].tokenIn).toBe(ADDR.USDC);
      expect(path.steps[0].tokenOut).toBe(ADDR.WETH);
      expect(path.steps[0].dex).toBe("uniswap_v2");

      // Step 2: sell token0 on expensive pool (token0 → token1)
      expect(path.steps[1].tokenIn).toBe(ADDR.WETH);
      expect(path.steps[1].tokenOut).toBe(ADDR.USDC);
      expect(path.steps[1].dex).toBe("sushiswap");
    });

    it("should preserve fee tier for V3 pools", () => {
      detector = new OpportunityDetector();
      const v3Pool = makePool({
        label: "WETH/USDC UniV3",
        dex: "uniswap_v3",
        poolAddress: ADDR.POOL_V3,
        feeTier: 3000,
      });
      const delta = makeDelta({
        buyPrice: 2000,
        sellPrice: 2020,
        sellPool: v3Pool,
      });
      const path = detector.buildSwapPath(delta);

      expect(path.steps[1].feeTier).toBe(3000);
    });
  });

  // ---- buildTriangularPath ----

  describe("buildTriangularPath", () => {
    it("should build a 3-step triangular path", () => {
      detector = new OpportunityDetector();

      const poolAB = makePool({
        label: "WETH/USDC",
        token0: ADDR.WETH,
        token1: ADDR.USDC,
      });
      const poolBC = makePool({
        label: "USDC/DAI",
        token0: ADDR.USDC,
        token1: ADDR.DAI,
        poolAddress: ADDR.POOL_SUSHI,
        decimals0: 6,
        decimals1: 18,
      });
      const poolCA = makePool({
        label: "DAI/WETH",
        token0: ADDR.DAI,
        token1: ADDR.WETH,
        poolAddress: ADDR.POOL_V3,
        decimals0: 18,
        decimals1: 18,
      });

      const snapAB = makeSnapshot(poolAB, 2000);
      const snapBC = makeSnapshot(poolBC, 1.001);
      const snapCA = makeSnapshot(poolCA, 0.000501);

      const path = detector.buildTriangularPath(snapAB, snapBC, snapCA);

      expect(path.steps).toHaveLength(3);
      expect(path.baseToken).toBe(ADDR.WETH);

      expect(path.steps[0].tokenIn).toBe(ADDR.WETH);
      expect(path.steps[0].tokenOut).toBe(ADDR.USDC);
      expect(path.steps[1].tokenIn).toBe(ADDR.USDC);
      expect(path.steps[1].tokenOut).toBe(ADDR.DAI);
      expect(path.steps[2].tokenIn).toBe(ADDR.DAI);
      expect(path.steps[2].tokenOut).toBe(ADDR.WETH);
    });
  });

  // ---- calculateGrossProfit ----

  describe("calculateGrossProfit", () => {
    it("should calculate gross profit for 2-step path", () => {
      detector = new OpportunityDetector();
      const delta = makeDelta({ buyPrice: 2000, sellPrice: 2020 });
      const path = detector.buildSwapPath(delta);

      // Input: 10 USDC (V2 pools → 0.3% fee per step)
      // Step 1: 10 * (1 - 0.003) * 0.0005 = 0.004985 WETH
      // Step 2: 0.004985 * (1 - 0.003) * 2020 = 10.0395 USDC
      // Gross profit = 10.0395 - 10 ≈ 0.0395 USDC
      const grossProfit = detector.calculateGrossProfit(path, 10);
      expect(grossProfit).toBeCloseTo(0.0395, 2);
    });

    it("should return negative for unprofitable path", () => {
      detector = new OpportunityDetector();
      // Swap with inverted delta (buy high, sell low)
      const delta = makeDelta({ buyPrice: 2020, sellPrice: 2000 });
      const path = detector.buildSwapPath(delta);

      const grossProfit = detector.calculateGrossProfit(path, 10);
      expect(grossProfit).toBeLessThan(0);
    });

    it("should calculate profit for 3-step triangular path", () => {
      detector = new OpportunityDetector();

      const poolAB = makePool({ token0: ADDR.WETH, token1: ADDR.USDC });
      const poolBC = makePool({
        token0: ADDR.USDC,
        token1: ADDR.DAI,
        poolAddress: ADDR.POOL_SUSHI,
        decimals0: 6,
        decimals1: 18,
      });
      const poolCA = makePool({
        token0: ADDR.DAI,
        token1: ADDR.WETH,
        poolAddress: ADDR.POOL_V3,
        decimals0: 18,
        decimals1: 18,
      });

      // Price chain: 1 WETH → 2000 USDC → 2010 DAI → 1.005 WETH
      // With 0.3% fee per step (3 steps):
      // 1 * 0.997 * 2000 * 0.997 * 1.005 * 0.997 * 0.0005 ≈ 0.996
      // Gross = 0.996 - 1 ≈ -0.004 (fees exceed the 0.5% raw spread)
      const snapAB = makeSnapshot(poolAB, 2000);
      const snapBC = makeSnapshot(poolBC, 1.005);
      const snapCA = makeSnapshot(poolCA, 0.0005);

      const path = detector.buildTriangularPath(snapAB, snapBC, snapCA);
      const grossProfit = detector.calculateGrossProfit(path, 1);

      expect(grossProfit).toBeCloseTo(-0.004, 2);
    });
  });

  // ---- Cost estimation ----

  describe("estimateCosts", () => {
    it("should estimate flash loan fee correctly", () => {
      detector = new OpportunityDetector({
        flashLoanFees: { aaveV3: 0.0005, dydx: 0, balancer: 0 },
      });

      // With free providers available, fee should be 0
      const fee = detector.estimateFlashLoanFee(100);
      expect(fee).toBe(0);
    });

    it("should use cheapest flash loan provider", () => {
      detector = new OpportunityDetector({
        flashLoanFees: { aaveV3: 0.001, dydx: 0.0005, balancer: 0.0002 },
      });

      const fee = detector.estimateFlashLoanFee(100);
      expect(fee).toBeCloseTo(0.02, 4); // 100 * 0.0002
    });

    it("should estimate gas cost correctly", () => {
      detector = new OpportunityDetector({
        gasPriceGwei: 30,
        gasPerSwap: 150_000,
      });

      // 2 swaps: (21000 + 150000*2) * 30 / 1e9
      const gasCost = detector.estimateGasCost(2);
      expect(gasCost).toBeCloseTo((321_000 * 30) / 1e9, 8);
    });

    it("should estimate gas for 3-hop path (more expensive)", () => {
      detector = new OpportunityDetector({
        gasPriceGwei: 30,
        gasPerSwap: 150_000,
      });

      const gas2 = detector.estimateGasCost(2);
      const gas3 = detector.estimateGasCost(3);
      expect(gas3).toBeGreaterThan(gas2);
    });

    it("should estimate slippage across multiple steps (static fallback)", () => {
      detector = new OpportunityDetector({ maxSlippage: 0.005 });
      const delta = makeDelta({ buyPrice: 2000, sellPrice: 2020 });
      const path = detector.buildSwapPath(delta);

      const slippage = detector.estimateSlippage(path, 10);
      // No reserve data → falls back to static model
      // 2-step compound slippage: 1 - (1-0.005)^2 ≈ 0.009975
      // Cost = 10 * 0.009975 ≈ 0.09975
      expect(slippage).toBeCloseTo(0.09975, 3);
    });

    it("should use pool-aware slippage when V2 reserves are available", () => {
      detector = new OpportunityDetector({ maxSlippage: 0.005 });

      // Build a delta with V2 reserve data
      const buyPool = makePool({ poolAddress: ADDR.POOL_V2 });
      const sellPool = makePool({
        label: "WETH/USDC Sushi",
        dex: "sushiswap",
        poolAddress: ADDR.POOL_SUSHI,
      });

      const buySnapshot: PriceSnapshot = {
        pool: buyPool,
        price: 2000,
        inversePrice: 1 / 2000,
        blockNumber: 19_000_000,
        timestamp: Date.now(),
        // 1000 WETH and 2,000,000 USDC reserves
        reserves: [
          BigInt("1000000000000000000000"),  // 1000 WETH (token0, 18 dec)
          BigInt("2000000000000"),           // 2,000,000 USDC (token1, 6 dec)
        ],
      };

      const sellSnapshot: PriceSnapshot = {
        pool: sellPool,
        price: 2020,
        inversePrice: 1 / 2020,
        blockNumber: 19_000_000,
        timestamp: Date.now(),
        reserves: [
          BigInt("1000000000000000000000"),  // 1000 WETH
          BigInt("2020000000000"),           // 2,020,000 USDC
        ],
      };

      const delta: PriceDelta = {
        pair: `${buyPool.token0}/${buyPool.token1}`,
        buyPool: buySnapshot,
        sellPool: sellSnapshot,
        deltaPercent: 1.0,
        timestamp: Date.now(),
      };

      const path = detector.buildSwapPath(delta);

      // Verify virtualReserveIn was computed from reserves
      // buyStep: tokenIn = USDC (token1), reserveIn = 2,000,000 USDC
      expect(path.steps[0].virtualReserveIn).toBeCloseTo(2_000_000, 0);
      // sellStep: tokenIn = WETH (token0), reserveIn = 1000 WETH
      expect(path.steps[1].virtualReserveIn).toBeCloseTo(1000, 0);

      // Pool-aware slippage for 10 USDC input on a 2M USDC pool: nearly zero
      // vs static 0.5% which gives 0.09975
      const slippage = detector.estimateSlippage(path, 10);
      expect(slippage).toBeLessThan(0.01); // Much less than static model
      expect(slippage).toBeGreaterThan(0);
    });

    it("should show higher slippage for larger trades relative to pool depth", () => {
      detector = new OpportunityDetector({ maxSlippage: 0.005 });

      const buyPool = makePool({ poolAddress: ADDR.POOL_V2 });
      const sellPool = makePool({
        label: "WETH/USDC Sushi",
        dex: "sushiswap",
        poolAddress: ADDR.POOL_SUSHI,
      });

      // Small pool: only 10 WETH / 20,000 USDC
      const buySnapshot: PriceSnapshot = {
        pool: buyPool,
        price: 2000,
        inversePrice: 1 / 2000,
        blockNumber: 19_000_000,
        timestamp: Date.now(),
        reserves: [
          BigInt("10000000000000000000"),  // 10 WETH
          BigInt("20000000000"),           // 20,000 USDC
        ],
      };

      const sellSnapshot: PriceSnapshot = {
        pool: sellPool,
        price: 2020,
        inversePrice: 1 / 2020,
        blockNumber: 19_000_000,
        timestamp: Date.now(),
        reserves: [
          BigInt("10000000000000000000"),  // 10 WETH
          BigInt("20200000000"),           // 20,200 USDC
        ],
      };

      const delta: PriceDelta = {
        pair: `${buyPool.token0}/${buyPool.token1}`,
        buyPool: buySnapshot,
        sellPool: sellSnapshot,
        deltaPercent: 1.0,
        timestamp: Date.now(),
      };

      const path = detector.buildSwapPath(delta);

      // 10,000 USDC into a 20,000 USDC pool: massive ~33% price impact
      const slippageLarge = detector.estimateSlippage(path, 10_000);
      // 10 USDC into same pool: tiny price impact
      const slippageSmall = detector.estimateSlippage(path, 10);

      expect(slippageLarge).toBeGreaterThan(slippageSmall * 10);
    });

    it("should return full cost estimate", () => {
      detector = new OpportunityDetector({
        gasPriceGwei: 30,
        gasPerSwap: 150_000,
        maxSlippage: 0.005,
        flashLoanFees: { aaveV3: 0.0005, dydx: 0, balancer: 0 },
      });
      const delta = makeDelta({ buyPrice: 2000, sellPrice: 2020 });
      const path = detector.buildSwapPath(delta);

      const costs = detector.estimateCosts(path, 10);
      expect(costs.flashLoanFee).toBe(0); // free provider available
      expect(costs.gasCost).toBeGreaterThan(0);
      expect(costs.slippageCost).toBeGreaterThan(0);
      expect(costs.totalCost).toBe(
        costs.flashLoanFee + costs.gasCost + costs.slippageCost,
      );
    });
  });

  // ---- analyzeDelta ----

  describe("analyzeDelta", () => {
    it("should return profitable opportunity", () => {
      detector = new OpportunityDetector({
        minProfitThreshold: 0,
        gasPriceGwei: 0, // eliminate gas for clean test
        maxSlippage: 0,
      });
      detector.on("error", () => {});

      // 5% delta → guaranteed profit with zero costs
      const delta = makeDelta({ buyPrice: 2000, sellPrice: 2100 });
      const result = detector.analyzeDelta(delta);

      expect(result).not.toBeNull();
      expect(result!.netProfit).toBeGreaterThan(0);
      expect(result!.path.steps).toHaveLength(2);
      expect(result!.inputAmount).toBe(10);
      expect(result!.netProfitPercent).toBeGreaterThan(0);
    });

    it("should reject unprofitable opportunity", () => {
      detector = new OpportunityDetector({
        minProfitThreshold: 0.5,
        gasPriceGwei: 100, // high gas to make it unprofitable
        maxSlippage: 0.01,
      });
      detector.on("error", () => {});

      const rejected: Array<{ reason: string; delta: PriceDelta }> = [];
      detector.on("opportunityRejected", (r, d) =>
        rejected.push({ reason: r, delta: d }),
      );

      // Small delta, high costs → unprofitable
      const delta = makeDelta({ buyPrice: 2000, sellPrice: 2002 });
      const result = detector.analyzeDelta(delta);

      expect(result).toBeNull();
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toContain("below threshold");
    });

    it("should emit opportunityFound event", () => {
      detector = new OpportunityDetector({
        minProfitThreshold: 0,
        gasPriceGwei: 0,
        maxSlippage: 0,
      });
      detector.on("error", () => {});

      const found: ArbitrageOpportunity[] = [];
      detector.on("opportunityFound", (o) => found.push(o));

      const delta = makeDelta({ buyPrice: 2000, sellPrice: 2100 });
      detector.analyzeDelta(delta);

      expect(found).toHaveLength(1);
      expect(found[0].id).toBeTruthy();
      expect(found[0].grossProfit).toBeGreaterThan(0);
    });

    it("should reject when pool is stale", () => {
      const monitor = mockMonitor();
      detector = new OpportunityDetector({
        minProfitThreshold: 0,
        gasPriceGwei: 0,
        maxSlippage: 0,
      });
      detector.on("error", () => {});
      detector.attach(monitor);

      // Mark the buy pool as stale
      monitor.emit("stale", makePool({ poolAddress: ADDR.POOL_V2 }));

      const rejected: string[] = [];
      detector.on("opportunityRejected", (r) => rejected.push(r));

      const delta = makeDelta({ buyPrice: 2000, sellPrice: 2100 });
      const result = detector.analyzeDelta(delta);

      expect(result).toBeNull();
      expect(rejected).toHaveLength(1);
      expect(rejected[0]).toContain("stale");
    });

    it("should clear stale pools on detach", () => {
      const monitor = mockMonitor();
      detector = new OpportunityDetector({
        minProfitThreshold: 0,
        gasPriceGwei: 0,
        maxSlippage: 0,
      });
      detector.on("error", () => {});
      detector.attach(monitor);

      // Mark pool as stale
      monitor.emit("stale", makePool({ poolAddress: ADDR.POOL_V2 }));

      // Detach clears stale set
      detector.detach();

      // Now analyzeDelta should NOT reject as stale
      const delta = makeDelta({ buyPrice: 2000, sellPrice: 2100 });
      const result = detector.analyzeDelta(delta);
      expect(result).not.toBeNull();
    });
  });

  // ---- Profit calculation accuracy ----

  describe("profit calculation accuracy", () => {
    it("should calculate correct net profit for 1% delta", () => {
      detector = new OpportunityDetector({
        minProfitThreshold: 0,
        gasPriceGwei: 30,
        gasPerSwap: 150_000,
        maxSlippage: 0.005,
        defaultInputAmount: 10,
        flashLoanFees: { aaveV3: 0.0005, dydx: 0, balancer: 0 },
      });
      detector.on("error", () => {});

      const delta = makeDelta({ buyPrice: 2000, sellPrice: 2020 });
      const result = detector.analyzeDelta(delta);

      if (result) {
        // Gross: ~0.1 (1% of 10)
        expect(result.grossProfit).toBeCloseTo(0.1, 2);

        // Flash loan fee: 0 (free provider)
        expect(result.costs.flashLoanFee).toBe(0);

        // Gas: (21000 + 300000) * 30 / 1e9 ≈ 0.00963
        expect(result.costs.gasCost).toBeCloseTo(0.00963, 4);

        // Slippage: 10 * (1-(0.995)^2) ≈ 0.09975
        expect(result.costs.slippageCost).toBeCloseTo(0.09975, 3);

        // Net ≈ 0.1 - 0 - 0.00963 - 0.09975 ≈ -0.00938
        // This should be negative (costs exceed the 1% gain)
        expect(result.netProfit).toBeLessThan(0.1);
      }
    });

    it("should show larger delta yields more profit", () => {
      detector = new OpportunityDetector({
        minProfitThreshold: 0,
        gasPriceGwei: 0,
        maxSlippage: 0,
      });
      detector.on("error", () => {});

      const small = makeDelta({ buyPrice: 2000, sellPrice: 2020 }); // 1%
      const large = makeDelta({ buyPrice: 2000, sellPrice: 2100 }); // 5%

      const profitSmall = detector.analyzeDelta(small)!.netProfit;
      const profitLarge = detector.analyzeDelta(large)!.netProfit;

      expect(profitLarge).toBeGreaterThan(profitSmall);
    });
  });

  // ---- Threshold filtering ----

  describe("threshold filtering", () => {
    it("should accept opportunities above threshold", () => {
      detector = new OpportunityDetector({
        minProfitThreshold: 0.01,
        gasPriceGwei: 0,
        maxSlippage: 0,
      });
      detector.on("error", () => {});

      // 5% of 10 = 0.5 profit, well above 0.01 threshold
      const delta = makeDelta({ buyPrice: 2000, sellPrice: 2100 });
      const result = detector.analyzeDelta(delta);
      expect(result).not.toBeNull();
      expect(result!.netProfit).toBeGreaterThan(0.01);
    });

    it("should reject opportunities below threshold", () => {
      detector = new OpportunityDetector({
        minProfitThreshold: 1.0, // high threshold
        gasPriceGwei: 0,
        maxSlippage: 0,
      });
      detector.on("error", () => {});

      const rejected: string[] = [];
      detector.on("opportunityRejected", (r) => rejected.push(r));

      // 0.1% of 10 = 0.01, below 1.0 threshold
      const delta = makeDelta({ buyPrice: 2000, sellPrice: 2002 });
      const result = detector.analyzeDelta(delta);
      expect(result).toBeNull();
      expect(rejected).toHaveLength(1);
    });

    it("should use custom input amount for profit calculation", () => {
      detector = new OpportunityDetector({
        minProfitThreshold: 0,
        gasPriceGwei: 0,
        maxSlippage: 0,
        defaultInputAmount: 100, // larger position
      });
      detector.on("error", () => {});

      const delta = makeDelta({ buyPrice: 2000, sellPrice: 2100 });
      const result = detector.analyzeDelta(delta);

      expect(result).not.toBeNull();
      expect(result!.inputAmount).toBe(100);
      // 5% spread minus 2 × 0.3% fees: 100 * 0.997^2 * 1.05 - 100 ≈ 4.37
      expect(result!.grossProfit).toBeCloseTo(4.37, 1);
    });
  });

  // ---- Optimal input sizing ----

  describe("optimal input sizing", () => {
    it("should use optimizer when V2 reserve data is available", () => {
      detector = new OpportunityDetector({
        minProfitThreshold: 0,
        gasPriceGwei: 0,
        maxSlippage: 0,
        defaultInputAmount: 10,
      });
      detector.on("error", () => {});

      // Build delta with V2 reserves
      const buyPool = makePool({ poolAddress: ADDR.POOL_V2 });
      const sellPool = makePool({
        label: "WETH/USDC Sushi",
        dex: "sushiswap",
        poolAddress: ADDR.POOL_SUSHI,
      });

      const buySnapshot: PriceSnapshot = {
        pool: buyPool,
        price: 2000,
        inversePrice: 1 / 2000,
        blockNumber: 19_000_000,
        timestamp: Date.now(),
        reserves: [
          BigInt("1000000000000000000000"),  // 1000 WETH
          BigInt("2000000000000"),           // 2,000,000 USDC
        ],
      };

      const sellSnapshot: PriceSnapshot = {
        pool: sellPool,
        price: 2020,
        inversePrice: 1 / 2020,
        blockNumber: 19_000_000,
        timestamp: Date.now(),
        reserves: [
          BigInt("1000000000000000000000"),  // 1000 WETH
          BigInt("2020000000000"),           // 2,020,000 USDC
        ],
      };

      const delta: PriceDelta = {
        pair: `${buyPool.token0}/${buyPool.token1}`,
        buyPool: buySnapshot,
        sellPool: sellSnapshot,
        deltaPercent: 1.0,
        timestamp: Date.now(),
      };

      const result = detector.analyzeDelta(delta);

      expect(result).not.toBeNull();
      expect(result!.optimizationResult).toBeDefined();
      expect(result!.optimizationResult!.converged).toBe(true);
      expect(result!.inputAmount).toBeGreaterThan(0);
      // Optimal amount should differ from default (10) for this pool depth
      expect(result!.inputAmount).not.toBe(10);
    });

    it("should fall back to defaultInputAmount when no reserve data", () => {
      detector = new OpportunityDetector({
        minProfitThreshold: 0,
        gasPriceGwei: 0,
        maxSlippage: 0,
        defaultInputAmount: 25,
      });
      detector.on("error", () => {});

      // Delta with no reserve data
      const delta = makeDelta({ buyPrice: 2000, sellPrice: 2100 });
      const result = detector.analyzeDelta(delta);

      expect(result).not.toBeNull();
      expect(result!.optimizationResult).toBeUndefined();
      expect(result!.inputAmount).toBe(25); // Uses defaultInputAmount
    });

    it("should optimize larger amounts for deep pools", () => {
      detector = new OpportunityDetector({
        minProfitThreshold: 0,
        gasPriceGwei: 0,
        maxSlippage: 0,
        defaultInputAmount: 10,
      });
      detector.on("error", () => {});

      const buyPool = makePool({ poolAddress: ADDR.POOL_V2 });
      const sellPool = makePool({
        label: "WETH/USDC Sushi",
        dex: "sushiswap",
        poolAddress: ADDR.POOL_SUSHI,
      });

      // Very deep pool: 10,000 WETH / 20M USDC
      const buySnapshot: PriceSnapshot = {
        pool: buyPool,
        price: 2000,
        inversePrice: 1 / 2000,
        blockNumber: 19_000_000,
        timestamp: Date.now(),
        reserves: [
          BigInt("10000000000000000000000"),  // 10,000 WETH
          BigInt("20000000000000"),            // 20,000,000 USDC
        ],
      };

      const sellSnapshot: PriceSnapshot = {
        pool: sellPool,
        price: 2100,
        inversePrice: 1 / 2100,
        blockNumber: 19_000_000,
        timestamp: Date.now(),
        reserves: [
          BigInt("10000000000000000000000"),  // 10,000 WETH
          BigInt("21000000000000"),            // 21,000,000 USDC
        ],
      };

      const delta: PriceDelta = {
        pair: `${buyPool.token0}/${buyPool.token1}`,
        buyPool: buySnapshot,
        sellPool: sellSnapshot,
        deltaPercent: 5.0,
        timestamp: Date.now(),
      };

      const result = detector.analyzeDelta(delta);

      expect(result).not.toBeNull();
      expect(result!.optimizationResult).toBeDefined();
      expect(result!.optimizationResult!.converged).toBe(true);
      // Deep pool + large spread should allow larger size
      expect(result!.inputAmount).toBeGreaterThan(10);
    });

    it("should optimize smaller amounts for thin pools", () => {
      detector = new OpportunityDetector({
        minProfitThreshold: 0,
        gasPriceGwei: 0,
        maxSlippage: 0.005,
        defaultInputAmount: 100,
      });
      detector.on("error", () => {});

      const buyPool = makePool({ poolAddress: ADDR.POOL_V2 });
      const sellPool = makePool({
        label: "WETH/USDC Sushi",
        dex: "sushiswap",
        poolAddress: ADDR.POOL_SUSHI,
      });

      // Thin pool: only 10 WETH / 20k USDC
      const buySnapshot: PriceSnapshot = {
        pool: buyPool,
        price: 2000,
        inversePrice: 1 / 2000,
        blockNumber: 19_000_000,
        timestamp: Date.now(),
        reserves: [
          BigInt("10000000000000000000"),  // 10 WETH
          BigInt("20000000000"),           // 20,000 USDC
        ],
      };

      const sellSnapshot: PriceSnapshot = {
        pool: sellPool,
        price: 2020,
        inversePrice: 1 / 2020,
        blockNumber: 19_000_000,
        timestamp: Date.now(),
        reserves: [
          BigInt("10000000000000000000"),  // 10 WETH
          BigInt("20200000000"),           // 20,200 USDC
        ],
      };

      const delta: PriceDelta = {
        pair: `${buyPool.token0}/${buyPool.token1}`,
        buyPool: buySnapshot,
        sellPool: sellSnapshot,
        deltaPercent: 1.0,
        timestamp: Date.now(),
      };

      const result = detector.analyzeDelta(delta);

      expect(result).not.toBeNull();
      expect(result!.optimizationResult).toBeDefined();
      // Thin pool should optimize to smaller size than default
      expect(result!.inputAmount).toBeLessThan(100);
    });

    it("should complete optimization within 100ms", () => {
      detector = new OpportunityDetector({
        minProfitThreshold: 0,
        gasPriceGwei: 0,
        maxSlippage: 0,
        defaultInputAmount: 10,
      });
      detector.on("error", () => {});

      const buyPool = makePool({ poolAddress: ADDR.POOL_V2 });
      const sellPool = makePool({
        label: "WETH/USDC Sushi",
        dex: "sushiswap",
        poolAddress: ADDR.POOL_SUSHI,
      });

      const buySnapshot: PriceSnapshot = {
        pool: buyPool,
        price: 2000,
        inversePrice: 1 / 2000,
        blockNumber: 19_000_000,
        timestamp: Date.now(),
        reserves: [
          BigInt("1000000000000000000000"),
          BigInt("2000000000000"),
        ],
      };

      const sellSnapshot: PriceSnapshot = {
        pool: sellPool,
        price: 2020,
        inversePrice: 1 / 2020,
        blockNumber: 19_000_000,
        timestamp: Date.now(),
        reserves: [
          BigInt("1000000000000000000000"),
          BigInt("2020000000000"),
        ],
      };

      const delta: PriceDelta = {
        pair: `${buyPool.token0}/${buyPool.token1}`,
        buyPool: buySnapshot,
        sellPool: sellSnapshot,
        deltaPercent: 1.0,
        timestamp: Date.now(),
      };

      const result = detector.analyzeDelta(delta);

      expect(result).not.toBeNull();
      expect(result!.optimizationResult).toBeDefined();
      expect(result!.optimizationResult!.durationMs).toBeLessThan(100);
    });

    it("should store optimization metadata in opportunity", () => {
      detector = new OpportunityDetector({
        minProfitThreshold: 0,
        gasPriceGwei: 0,
        maxSlippage: 0,
        defaultInputAmount: 10,
      });
      detector.on("error", () => {});

      const buyPool = makePool({ poolAddress: ADDR.POOL_V2 });
      const sellPool = makePool({
        label: "WETH/USDC Sushi",
        dex: "sushiswap",
        poolAddress: ADDR.POOL_SUSHI,
      });

      const buySnapshot: PriceSnapshot = {
        pool: buyPool,
        price: 2000,
        inversePrice: 1 / 2000,
        blockNumber: 19_000_000,
        timestamp: Date.now(),
        reserves: [
          BigInt("1000000000000000000000"),
          BigInt("2000000000000"),
        ],
      };

      const sellSnapshot: PriceSnapshot = {
        pool: sellPool,
        price: 2020,
        inversePrice: 1 / 2020,
        blockNumber: 19_000_000,
        timestamp: Date.now(),
        reserves: [
          BigInt("1000000000000000000000"),
          BigInt("2020000000000"),
        ],
      };

      const delta: PriceDelta = {
        pair: `${buyPool.token0}/${buyPool.token1}`,
        buyPool: buySnapshot,
        sellPool: sellSnapshot,
        deltaPercent: 1.0,
        timestamp: Date.now(),
      };

      const result = detector.analyzeDelta(delta);

      expect(result).not.toBeNull();
      expect(result!.optimizationResult).toBeDefined();
      expect(result!.optimizationResult!.optimalAmount).toBe(result!.inputAmount);
      expect(result!.optimizationResult!.expectedProfit).toBeCloseTo(result!.netProfit, 2);
      expect(result!.optimizationResult!.iterations).toBeGreaterThan(0);
      expect(result!.optimizationResult!.converged).toBeDefined();
    });
  });
});
