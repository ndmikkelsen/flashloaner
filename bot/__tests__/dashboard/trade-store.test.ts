import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import { TradeStore } from "../../src/dashboard/TradeStore.js";
import type { TradeOutcome } from "../../src/dashboard/types.js";

const TEST_FILE = ".data/test-trades.jsonl";

describe("TradeStore", () => {
  beforeEach(() => {
    // Clean up test file before each test
    if (fs.existsSync(TEST_FILE)) {
      fs.unlinkSync(TEST_FILE);
    }
  });

  afterEach(() => {
    // Clean up test file after each test
    if (fs.existsSync(TEST_FILE)) {
      fs.unlinkSync(TEST_FILE);
    }
  });

  it("should create .data/ directory if it does not exist", () => {
    const testDir = ".data";
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }

    const store = new TradeStore(TEST_FILE);
    expect(fs.existsSync(testDir)).toBe(true);

    store.clear(); // Clean up
  });

  it("should append a trade outcome and persist to disk", () => {
    const store = new TradeStore(TEST_FILE);

    const trade: TradeOutcome = {
      txHash: "0xabc123",
      timestamp: Date.now(),
      blockNumber: 12345,
      path: "WETH/USDC UniV3 0.05% -> WETH/USDC UniV3 0.3%",
      inputAmount: 1.0,
      grossProfit: 0.01,
      gasCost: 0.0001,
      l1DataFee: 0.0009,
      revertCost: 0,
      netProfit: 0.009,
      status: "success",
    };

    store.append(trade);

    // Verify in-memory
    expect(store.getAll()).toHaveLength(1);
    expect(store.getAll()[0]).toEqual(trade);

    // Verify on disk
    const content = fs.readFileSync(TEST_FILE, "utf-8");
    expect(content.trim()).toBe(JSON.stringify(trade));
  });

  it("should load trades from disk on restart", () => {
    // First instance: append 2 trades
    const store1 = new TradeStore(TEST_FILE);
    const trade1: TradeOutcome = {
      txHash: "0x111",
      timestamp: Date.now(),
      blockNumber: 100,
      path: "Path A",
      inputAmount: 1.0,
      grossProfit: 0.01,
      gasCost: 0.0001,
      l1DataFee: 0.0009,
      revertCost: 0,
      netProfit: 0.009,
      status: "success",
    };
    const trade2: TradeOutcome = {
      txHash: "0x222",
      timestamp: Date.now(),
      blockNumber: 101,
      path: "Path B",
      inputAmount: 2.0,
      grossProfit: -0.005,
      gasCost: 0.0001,
      l1DataFee: 0.0009,
      revertCost: 0.001,
      netProfit: -0.0069,
      status: "revert",
    };

    store1.append(trade1);
    store1.append(trade2);

    // Second instance: should load both trades
    const store2 = new TradeStore(TEST_FILE);
    expect(store2.getAll()).toHaveLength(2);
    expect(store2.getAll()[0]).toEqual(trade1);
    expect(store2.getAll()[1]).toEqual(trade2);
  });

  it("should compute correct session stats with three-bucket accounting", () => {
    const store = new TradeStore(TEST_FILE);

    const trade1: TradeOutcome = {
      txHash: "0xaaa",
      timestamp: 1000,
      blockNumber: 100,
      path: "Path A",
      inputAmount: 1.0,
      grossProfit: 0.02,
      gasCost: 0.0001,
      l1DataFee: 0.0009,
      revertCost: 0,
      netProfit: 0.019,
      status: "success",
    };

    const trade2: TradeOutcome = {
      txHash: "0xbbb",
      timestamp: 2000,
      blockNumber: 101,
      path: "Path B",
      inputAmount: 1.5,
      grossProfit: -0.005,
      gasCost: 0.0001,
      l1DataFee: 0.0009,
      revertCost: 0.001,
      netProfit: -0.0069,
      status: "revert",
    };

    const trade3: TradeOutcome = {
      txHash: "simulation",
      timestamp: 3000,
      blockNumber: 102,
      path: "Path C",
      inputAmount: 0.5,
      grossProfit: -0.01,
      gasCost: 0,
      l1DataFee: 0,
      revertCost: 0,
      netProfit: -0.01,
      status: "simulation_revert",
    };

    store.append(trade1);
    store.append(trade2);
    store.append(trade3);

    const stats = store.getStats();

    expect(stats.totalTrades).toBe(3);
    expect(stats.successCount).toBe(1);
    expect(stats.revertCount).toBe(1);
    expect(stats.simulationRevertCount).toBe(1);

    // Three-bucket totals
    expect(stats.grossProfitEth).toBeCloseTo(0.005, 6); // 0.02 - 0.005 - 0.01
    expect(stats.gasCostEth).toBeCloseTo(0.0002, 6);    // 0.0001 + 0.0001 + 0
    expect(stats.l1DataFeeEth).toBeCloseTo(0.0018, 6);  // 0.0009 + 0.0009 + 0
    expect(stats.revertCostEth).toBeCloseTo(0.001, 6);  // 0 + 0.001 + 0

    // Net P&L
    expect(stats.netProfitEth).toBeCloseTo(0.0021, 6);  // 0.019 - 0.0069 - 0.01

    // Win rate
    expect(stats.winRate).toBeCloseTo(1 / 3, 6);

    // Timestamps
    expect(stats.firstTradeTimestamp).toBe(1000);
    expect(stats.lastTradeTimestamp).toBe(3000);
  });

  it("should return last N trades in reverse chronological order", () => {
    const store = new TradeStore(TEST_FILE);

    const trades: TradeOutcome[] = [
      { txHash: "0x1", timestamp: 1000, blockNumber: 100, path: "A", inputAmount: 1, grossProfit: 0.01, gasCost: 0.0001, l1DataFee: 0.0009, revertCost: 0, netProfit: 0.009, status: "success" },
      { txHash: "0x2", timestamp: 2000, blockNumber: 101, path: "B", inputAmount: 1, grossProfit: 0.01, gasCost: 0.0001, l1DataFee: 0.0009, revertCost: 0, netProfit: 0.009, status: "success" },
      { txHash: "0x3", timestamp: 3000, blockNumber: 102, path: "C", inputAmount: 1, grossProfit: 0.01, gasCost: 0.0001, l1DataFee: 0.0009, revertCost: 0, netProfit: 0.009, status: "success" },
    ];

    for (const trade of trades) {
      store.append(trade);
    }

    const last2 = store.getLast(2);
    expect(last2).toHaveLength(2);
    expect(last2[0].txHash).toBe("0x3"); // Most recent first
    expect(last2[1].txHash).toBe("0x2");
  });

  it("should handle empty store gracefully", () => {
    const store = new TradeStore(TEST_FILE);

    const stats = store.getStats();
    expect(stats.totalTrades).toBe(0);
    expect(stats.winRate).toBe(0);
    expect(stats.netProfitEth).toBe(0);

    const last10 = store.getLast(10);
    expect(last10).toHaveLength(0);
  });

  it("should skip corrupted JSONL lines during load", () => {
    // Write a file with one valid line and one corrupted line
    fs.writeFileSync(
      TEST_FILE,
      JSON.stringify({ txHash: "0x123", timestamp: 1000, blockNumber: 100, path: "A", inputAmount: 1, grossProfit: 0.01, gasCost: 0.0001, l1DataFee: 0.0009, revertCost: 0, netProfit: 0.009, status: "success" }) + "\n" +
      "{ CORRUPTED JSON HERE\n",
      "utf-8"
    );

    const store = new TradeStore(TEST_FILE);

    // Should load the valid line, skip the corrupted line
    expect(store.getAll()).toHaveLength(1);
    expect(store.getAll()[0].txHash).toBe("0x123");
  });
});
