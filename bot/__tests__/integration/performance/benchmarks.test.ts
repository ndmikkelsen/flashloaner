import { describe, it, expect, afterEach } from "vitest";
import { PriceMonitor } from "../../../src/monitor/PriceMonitor.js";
import { OpportunityDetector } from "../../../src/detector/OpportunityDetector.js";
import { pool, mockProvider, TEST_POOLS, TEST_TOKENS } from "../helpers/scenario-builder.js";

describe("Performance benchmarks", () => {
  let monitor: PriceMonitor;
  let detector: OpportunityDetector;

  afterEach(() => {
    monitor?.stop();
    detector?.detach();
  });

  it("should complete a poll cycle under 50ms with 2 pools", async () => {
    const pools = [
      pool({ address: TEST_POOLS.WETH_USDC_UNIV2 }),
      pool({ dex: "sushiswap", address: TEST_POOLS.WETH_USDC_SUSHI }),
    ];

    const provider = mockProvider({
      [TEST_POOLS.WETH_USDC_UNIV2.toLowerCase()]: [
        BigInt("1000000000000000000000"),
        BigInt("2000000000000"),
      ],
      [TEST_POOLS.WETH_USDC_SUSHI.toLowerCase()]: [
        BigInt("1000000000000000000000"),
        BigInt("2020000000000"),
      ],
    });

    monitor = new PriceMonitor({ provider, pools, deltaThresholdPercent: 0.5 });
    detector = new OpportunityDetector({
      minProfitThreshold: 0,
      gasPriceGwei: 0,
      maxSlippage: 0,
    });
    detector.attach(monitor);
    monitor.on("error", () => {});
    detector.on("error", () => {});

    const start = performance.now();
    await monitor.poll();
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
  });

  it("should complete a poll cycle under 100ms with 10 pools", async () => {
    // Generate 10 pools with unique addresses
    const pools = Array.from({ length: 10 }, (_, i) => {
      const addr = `0x${(i + 1).toString(16).padStart(40, "0")}`;
      return pool({
        label: `Pool ${i}`,
        dex: i % 2 === 0 ? "uniswap_v2" : "sushiswap",
        address: addr,
      });
    });

    const reserves: Record<string, [bigint, bigint]> = {};
    for (const p of pools) {
      const priceOffset = BigInt(Math.floor(Math.random() * 100)) * BigInt("1000000");
      reserves[p.poolAddress.toLowerCase()] = [
        BigInt("1000000000000000000000"),
        BigInt("2000000000000") + priceOffset,
      ];
    }

    const provider = mockProvider(reserves);
    monitor = new PriceMonitor({ provider, pools, deltaThresholdPercent: 0.5 });
    detector = new OpportunityDetector({
      minProfitThreshold: 0,
      gasPriceGwei: 0,
      maxSlippage: 0,
    });
    detector.attach(monitor);
    monitor.on("error", () => {});
    detector.on("error", () => {});

    const start = performance.now();
    await monitor.poll();
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
  });

  it("should handle 100 consecutive poll cycles efficiently", async () => {
    const pools = [
      pool({ address: TEST_POOLS.WETH_USDC_UNIV2 }),
      pool({ dex: "sushiswap", address: TEST_POOLS.WETH_USDC_SUSHI }),
    ];

    const provider = mockProvider({
      [TEST_POOLS.WETH_USDC_UNIV2.toLowerCase()]: [
        BigInt("1000000000000000000000"),
        BigInt("2000000000000"),
      ],
      [TEST_POOLS.WETH_USDC_SUSHI.toLowerCase()]: [
        BigInt("1000000000000000000000"),
        BigInt("2020000000000"),
      ],
    });

    monitor = new PriceMonitor({ provider, pools, deltaThresholdPercent: 0.5 });
    detector = new OpportunityDetector({
      minProfitThreshold: 0,
      gasPriceGwei: 0,
      maxSlippage: 0,
    });
    detector.attach(monitor);
    monitor.on("error", () => {});
    detector.on("error", () => {});

    let opportunityCount = 0;
    detector.on("opportunityFound", () => opportunityCount++);

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      await monitor.poll();
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(2000); // 100 cycles under 2s
    expect(opportunityCount).toBe(100); // one per cycle

    // Average latency per cycle
    const avgLatency = elapsed / 100;
    expect(avgLatency).toBeLessThan(20); // under 20ms per cycle
  });

  it("should measure opportunity detection latency", async () => {
    detector = new OpportunityDetector({
      minProfitThreshold: 0,
      gasPriceGwei: 30,
      maxSlippage: 0.005,
      defaultInputAmount: 10,
    });
    detector.on("error", () => {});

    const buyPool = pool({ address: TEST_POOLS.WETH_USDC_UNIV2 });
    const sellPool = pool({ dex: "sushiswap", address: TEST_POOLS.WETH_USDC_SUSHI });

    const testDelta = {
      pair: "test",
      buyPool: {
        pool: buyPool,
        price: 2000,
        inversePrice: 0.0005,
        blockNumber: 19_000_000,
        timestamp: Date.now(),
      },
      sellPool: {
        pool: sellPool,
        price: 2100,
        inversePrice: 1 / 2100,
        blockNumber: 19_000_000,
        timestamp: Date.now(),
      },
      deltaPercent: 5,
      timestamp: Date.now(),
    };

    // Warm up
    detector.analyzeDelta(testDelta);

    // Benchmark 1000 analysis calls
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      detector.analyzeDelta(testDelta);
    }
    const elapsed = performance.now() - start;

    // 1000 analyses under 100ms total
    expect(elapsed).toBeLessThan(100);

    // Per-analysis latency
    const avgLatency = elapsed / 1000;
    expect(avgLatency).toBeLessThan(0.1); // under 0.1ms per analysis
  });

  it("should not accumulate memory across poll cycles", async () => {
    const pools = [
      pool({ address: TEST_POOLS.WETH_USDC_UNIV2 }),
      pool({ dex: "sushiswap", address: TEST_POOLS.WETH_USDC_SUSHI }),
    ];

    const provider = mockProvider({
      [TEST_POOLS.WETH_USDC_UNIV2.toLowerCase()]: [
        BigInt("1000000000000000000000"),
        BigInt("2000000000000"),
      ],
      [TEST_POOLS.WETH_USDC_SUSHI.toLowerCase()]: [
        BigInt("1000000000000000000000"),
        BigInt("2020000000000"),
      ],
    });

    monitor = new PriceMonitor({ provider, pools, deltaThresholdPercent: 0.5 });
    detector = new OpportunityDetector({
      minProfitThreshold: 0,
      gasPriceGwei: 0,
      maxSlippage: 0,
    });
    detector.attach(monitor);
    monitor.on("error", () => {});
    detector.on("error", () => {});

    // Discard opportunity events to avoid test-side accumulation
    detector.on("opportunityFound", () => {});

    // Run 50 cycles
    for (let i = 0; i < 50; i++) {
      await monitor.poll();
    }

    // Snapshot count should stay at pool count, not grow
    expect(monitor.getAllSnapshots()).toHaveLength(2);
  });
});
