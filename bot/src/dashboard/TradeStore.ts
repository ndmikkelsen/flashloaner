import * as fs from "node:fs";
import * as path from "node:path";
import type { TradeOutcome, SessionStats } from "./types.js";

export class TradeStore {
  private readonly filePath: string;
  private trades: TradeOutcome[] = [];

  constructor(filePath = ".data/trades.jsonl") {
    this.filePath = path.resolve(filePath);
    this.ensureDataDir();
    this.loadFromDisk();
  }

  /**
   * Append a trade outcome to disk and in-memory cache.
   * Atomic operation: append to file, then update cache.
   */
  append(trade: TradeOutcome): void {
    // Validate trade has required fields
    if (!trade.txHash || trade.timestamp === undefined || trade.blockNumber === undefined) {
      throw new Error("TradeOutcome missing required fields: txHash, timestamp, blockNumber");
    }

    // Append to file (atomic line write)
    const line = JSON.stringify(trade) + "\n";
    fs.appendFileSync(this.filePath, line, "utf-8");

    // Update in-memory cache
    this.trades.push(trade);
  }

  /**
   * Get all trades (chronological order).
   */
  getAll(): TradeOutcome[] {
    return [...this.trades];
  }

  /**
   * Get last N trades (most recent first).
   */
  getLast(n: number): TradeOutcome[] {
    return this.trades.slice(-n).reverse();
  }

  /**
   * Compute session stats from all trades.
   */
  getStats(): SessionStats {
    if (this.trades.length === 0) {
      return {
        totalTrades: 0,
        successCount: 0,
        revertCount: 0,
        simulationRevertCount: 0,
        grossProfitEth: 0,
        gasCostEth: 0,
        l1DataFeeEth: 0,
        revertCostEth: 0,
        netProfitEth: 0,
        winRate: 0,
      };
    }

    const successCount = this.trades.filter(t => t.status === "success").length;
    const revertCount = this.trades.filter(t => t.status === "revert").length;
    const simulationRevertCount = this.trades.filter(t => t.status === "simulation_revert").length;

    const grossProfitEth = this.trades.reduce((sum, t) => sum + t.grossProfit, 0);
    const gasCostEth = this.trades.reduce((sum, t) => sum + t.gasCost, 0);
    const l1DataFeeEth = this.trades.reduce((sum, t) => sum + t.l1DataFee, 0);
    const revertCostEth = this.trades.reduce((sum, t) => sum + t.revertCost, 0);
    const netProfitEth = this.trades.reduce((sum, t) => sum + t.netProfit, 0);

    const winRate = successCount / this.trades.length;

    return {
      totalTrades: this.trades.length,
      successCount,
      revertCount,
      simulationRevertCount,
      grossProfitEth,
      gasCostEth,
      l1DataFeeEth,
      revertCostEth,
      netProfitEth,
      winRate,
      firstTradeTimestamp: this.trades[0]?.timestamp,
      lastTradeTimestamp: this.trades[this.trades.length - 1]?.timestamp,
    };
  }

  /**
   * Clear all trades (for testing only — do NOT expose in production CLI).
   */
  clear(): void {
    this.trades = [];
    if (fs.existsSync(this.filePath)) {
      fs.unlinkSync(this.filePath);
    }
  }

  // ---- Private methods ----

  private ensureDataDir(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private loadFromDisk(): void {
    if (!fs.existsSync(this.filePath)) {
      return; // No file yet — start fresh
    }

    const content = fs.readFileSync(this.filePath, "utf-8");
    const lines = content.split("\n").filter(line => line.trim().length > 0);

    for (const line of lines) {
      try {
        const trade = JSON.parse(line) as TradeOutcome;
        this.trades.push(trade);
      } catch (err) {
        // Corrupted line — log and skip (JSONL resilience)
        console.warn(`[TradeStore] Skipping corrupted line: ${line.slice(0, 50)}...`);
      }
    }
  }
}
