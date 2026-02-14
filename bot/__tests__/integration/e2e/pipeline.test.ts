import { describe, it, expect, afterEach } from "vitest";
import { PriceMonitor } from "../../../src/monitor/PriceMonitor.js";
import { OpportunityDetector } from "../../../src/detector/OpportunityDetector.js";
import type { PriceSnapshot } from "../../../src/monitor/types.js";
import type { ArbitrageOpportunity } from "../../../src/detector/types.js";
import { EventCollector } from "../helpers/event-collector.js";
import { SCENARIOS, TEST_POOLS } from "../helpers/scenario-builder.js";

describe("E2E: PriceMonitor → OpportunityDetector pipeline", () => {
  let monitor: PriceMonitor;
  let detector: OpportunityDetector;
  let collector: EventCollector;

  afterEach(() => {
    monitor?.stop();
    detector?.detach();
    collector?.dispose();
  });

  it("should detect a profitable 5% spread end-to-end", async () => {
    const scenario = SCENARIOS.profitable_5pct();
    collector = new EventCollector();

    monitor = new PriceMonitor({
      provider: scenario.provider,
      pools: scenario.pools,
      deltaThresholdPercent: 0.5,
    });

    detector = new OpportunityDetector({
      minProfitThreshold: 0,
      gasPriceGwei: 0,
      maxSlippage: 0,
    });

    // Wire up
    detector.attach(monitor);
    monitor.on("error", () => {});
    detector.on("error", () => {});

    // Collect events
    const priceUpdates = collector.collect<PriceSnapshot>(monitor, "priceUpdate");
    const opportunities = collector.collect<ArbitrageOpportunity>(
      detector,
      "opportunityFound",
    );

    // Run one poll cycle
    await monitor.poll();

    // Should have 2 price updates (one per pool)
    expect(priceUpdates).toHaveLength(2);

    // Should detect the 5% opportunity
    expect(opportunities).toHaveLength(1);
    const opp = opportunities[0];
    expect(opp.netProfit).toBeGreaterThan(0);
    expect(opp.path.steps).toHaveLength(2);
    expect(opp.grossProfit).toBeCloseTo(0.5, 1); // 5% of 10 input
  });

  it("should NOT emit opportunity for tiny spread below threshold", async () => {
    const scenario = SCENARIOS.unprofitable_tiny_spread();
    collector = new EventCollector();

    monitor = new PriceMonitor({
      provider: scenario.provider,
      pools: scenario.pools,
      deltaThresholdPercent: 0.5, // 0.1% < 0.5% threshold
    });

    detector = new OpportunityDetector({
      minProfitThreshold: 0.1,
    });

    detector.attach(monitor);
    monitor.on("error", () => {});
    detector.on("error", () => {});

    const opportunities = collector.collect<ArbitrageOpportunity>(
      detector,
      "opportunityFound",
    );

    await monitor.poll();

    // Delta is 0.1% < 0.5% monitor threshold → no opportunity event at all
    expect(opportunities).toHaveLength(0);
  });

  it("should reject opportunity when costs exceed profit", async () => {
    const scenario = SCENARIOS.profitable_1pct();
    collector = new EventCollector();

    monitor = new PriceMonitor({
      provider: scenario.provider,
      pools: scenario.pools,
      deltaThresholdPercent: 0.5,
    });

    // Configure with realistic costs that exceed 1% profit
    detector = new OpportunityDetector({
      minProfitThreshold: 0.5,  // high threshold
      gasPriceGwei: 100,        // high gas
      maxSlippage: 0.01,        // 1% slippage
    });

    detector.attach(monitor);
    monitor.on("error", () => {});
    detector.on("error", () => {});

    const found = collector.collect<ArbitrageOpportunity>(
      detector,
      "opportunityFound",
    );
    const rejected = collector.collect<[string]>(
      detector,
      "opportunityRejected",
    );

    await monitor.poll();

    // 1% spread minus high costs → rejected
    expect(found).toHaveLength(0);
    expect(rejected).toHaveLength(1);
  });

  it("should handle stale pools across module boundary", async () => {
    const scenario = SCENARIOS.profitable_5pct();
    collector = new EventCollector();

    // Create a provider that fails for one pool after first successful poll
    let failSushi = false;
    const provider = {
      getBlockNumber: scenario.provider.getBlockNumber,
      call: async (tx: { to: string; data: string }) => {
        if (
          failSushi &&
          tx.to.toLowerCase() === TEST_POOLS.WETH_USDC_SUSHI.toLowerCase()
        ) {
          throw new Error("RPC timeout");
        }
        return scenario.provider.call(tx);
      },
    } as any;

    monitor = new PriceMonitor({
      provider,
      pools: scenario.pools,
      deltaThresholdPercent: 0.5,
      maxRetries: 2,
    });

    detector = new OpportunityDetector({
      minProfitThreshold: 0,
      gasPriceGwei: 0,
      maxSlippage: 0,
    });

    detector.attach(monitor);
    monitor.on("error", () => {});
    detector.on("error", () => {});

    // First poll: both pools succeed → opportunity
    const found = collector.collect<ArbitrageOpportunity>(
      detector,
      "opportunityFound",
    );
    await monitor.poll();
    expect(found).toHaveLength(1);

    // Start failing the sushi pool
    failSushi = true;
    found.length = 0;

    // Two more polls to trigger stale
    await monitor.poll();
    await monitor.poll();

    // Now the pool is stale — next poll should reject any opportunity
    const rejected = collector.collect<[string]>(
      detector,
      "opportunityRejected",
    );

    // Manual analyzeDelta to verify stale rejection
    const delta = {
      pair: "test",
      buyPool: monitor.getSnapshot(TEST_POOLS.WETH_USDC_UNIV2)!,
      sellPool: monitor.getSnapshot(TEST_POOLS.WETH_USDC_SUSHI)!,
      deltaPercent: 5,
      timestamp: Date.now(),
    };

    // buyPool snapshot exists (wasn't stale), but sellPool's address is stale
    const result = detector.analyzeDelta(delta);
    expect(result).toBeNull();
    expect(rejected.length).toBeGreaterThan(0);
  });

  it("should detect multiple simultaneous opportunities across pairs", async () => {
    const scenario = SCENARIOS.multi_pair();
    collector = new EventCollector();

    monitor = new PriceMonitor({
      provider: scenario.provider,
      pools: scenario.pools,
      deltaThresholdPercent: 0.5,
    });

    detector = new OpportunityDetector({
      minProfitThreshold: 0,
      gasPriceGwei: 0,
      maxSlippage: 0,
    });

    detector.attach(monitor);
    monitor.on("error", () => {});
    detector.on("error", () => {});

    const found = collector.collect<ArbitrageOpportunity>(
      detector,
      "opportunityFound",
    );

    await monitor.poll();

    // Both WETH/USDC (2%) and WETH/USDT (3%) should trigger
    expect(found).toHaveLength(2);

    // The USDT pair should have higher profit (3% vs 2%)
    const profits = found.map((o) => o.grossProfit).sort((a, b) => a - b);
    expect(profits[1]).toBeGreaterThan(profits[0]);
  });

  it("should maintain correct state across multiple poll cycles", async () => {
    const scenario = SCENARIOS.profitable_5pct();
    collector = new EventCollector();

    monitor = new PriceMonitor({
      provider: scenario.provider,
      pools: scenario.pools,
      deltaThresholdPercent: 0.5,
    });

    detector = new OpportunityDetector({
      minProfitThreshold: 0,
      gasPriceGwei: 0,
      maxSlippage: 0,
    });

    detector.attach(monitor);
    monitor.on("error", () => {});
    detector.on("error", () => {});

    const found = collector.collect<ArbitrageOpportunity>(
      detector,
      "opportunityFound",
    );

    // Run 3 consecutive poll cycles
    await monitor.poll();
    await monitor.poll();
    await monitor.poll();

    // Should detect opportunity on each cycle (prices are stable)
    expect(found).toHaveLength(3);

    // Each opportunity should have a unique ID
    const ids = new Set(found.map((o) => o.id));
    expect(ids.size).toBe(3);

    // Snapshots should be consistent
    expect(monitor.getAllSnapshots()).toHaveLength(2);
  });
});
