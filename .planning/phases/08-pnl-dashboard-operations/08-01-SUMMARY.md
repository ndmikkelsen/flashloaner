---
phase: 08-pnl-dashboard-operations
plan: 01
subsystem: dashboard
tags:
  - persistence
  - p&l-tracking
  - jsonl
  - three-bucket-accounting
dependency_graph:
  requires: []
  provides:
    - trade-persistence
    - session-stats
    - three-bucket-accounting
  affects:
    - bot/src/dashboard/
tech_stack:
  added:
    - jsonl-persistence
  patterns:
    - append-only-log
    - three-bucket-p&l
key_files:
  created:
    - bot/src/dashboard/types.ts
    - bot/src/dashboard/TradeStore.ts
    - bot/__tests__/dashboard/trade-store.test.ts
  modified: []
decisions:
  - title: "JSONL append-only format over SQLite"
    rationale: "Simpler, crash-safe, no corruption risk. SQLite upgrade path available for v1.2."
    alternatives: ["SQLite with WAL mode", "In-memory only"]
  - title: "Three-bucket P&L accounting"
    rationale: "Separate grossProfit, gasCost+l1DataFee, and revertCost for clear attribution. Critical on Arbitrum where L1 data fees dominate."
    alternatives: ["Single netProfit field", "Two-bucket (profit/cost)"]
  - title: "In-memory cache with disk persistence"
    rationale: "Fast queries without DB overhead. Restart recovery loads entire history into memory."
    alternatives: ["Query from disk on each request", "SQLite for queries"]
metrics:
  duration: 145
  completed_date: 2026-02-20
  tasks_completed: 3
  files_created: 3
  commits: 3
---

# Phase 8 Plan 01: Trade Persistence with JSONL Storage Summary

**One-liner:** JSONL append-only trade persistence with three-bucket P&L accounting (grossProfit, gasCost+l1DataFee, revertCost) and restart recovery.

## What Was Built

Created a TradeStore module for persisting trade outcomes to `.data/trades.jsonl` using JSONL append-only format with three-bucket P&L accounting. Every trade outcome (success, revert, simulation_revert) is persisted atomically to disk, separating gross profit from DEX swaps, gas costs including L1 data fees, and revert costs. The store loads all prior trades on initialization, enabling restart recovery and session stats computation.

**Three-bucket accounting provides clear attribution:**
- **grossProfit**: What the trade logic produced (DEX swap math)
- **gasCost + l1DataFee**: What we paid to execute (L1 data fees ~95% on Arbitrum)
- **revertCost**: Gas burned on failed transactions

This separation is critical for Arbitrum mainnet where L1 data fees dominate execution costs.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Define TradeOutcome type with three-bucket P&L accounting | 35e06b5 | bot/src/dashboard/types.ts |
| 2 | Implement TradeStore with JSONL persistence and query methods | 82e885c | bot/src/dashboard/TradeStore.ts |
| 3 | Add tests for TradeStore persistence and restart recovery | f6166ed | bot/__tests__/dashboard/trade-store.test.ts |

## Deviations from Plan

None - plan executed exactly as written.

## Technical Details

**JSONL Format:**
- Each trade = one JSON line appended to `.data/trades.jsonl`
- Atomic `fs.appendFileSync` operations (crash-safe)
- Corrupted line resilience: skip malformed JSON with warning
- Auto-creates `.data/` directory if missing

**TradeStore Class:**
```typescript
class TradeStore {
  append(trade: TradeOutcome): void        // Append trade to disk + memory
  getAll(): TradeOutcome[]                 // All trades chronologically
  getLast(n: number): TradeOutcome[]       // Last N trades (reverse chron)
  getStats(): SessionStats                 // Aggregated P&L stats
  clear(): void                            // Test-only method
}
```

**Restart Recovery:**
- `loadFromDisk()` runs on construction
- Every new `TradeStore` instance gets all prior trades
- Enables session stats across process restarts

**Three-Bucket Accounting:**
```typescript
interface TradeOutcome {
  grossProfit: number;    // DEX profit before costs
  gasCost: number;        // L2 gas cost
  l1DataFee: number;      // L1 data fee (Arbitrum-specific)
  revertCost: number;     // Gas burned on reverted tx
  netProfit: number;      // grossProfit - gasCost - l1DataFee - revertCost
  status: "success" | "revert" | "simulation_revert";
}
```

**SessionStats Aggregation:**
- Trade counts by status (success/revert/simulation_revert)
- Three-bucket totals: grossProfitEth, gasCostEth, l1DataFeeEth, revertCostEth
- netProfitEth = sum of all netProfit values
- winRate = successCount / totalTrades
- firstTradeTimestamp, lastTradeTimestamp

## Test Coverage

7 test cases covering:

1. Directory creation (auto-creates `.data/` if missing)
2. Append and disk persistence (verify file contents)
3. Restart recovery (append in one instance, load in another)
4. Three-bucket stats computation (grossProfit, gasCost, l1DataFee, revertCost)
5. getLast() reverse chronological ordering
6. Empty store handling (zero trades)
7. Corrupted line resilience (skip malformed JSON)

All tests pass:
```
✓ bot/__tests__/dashboard/trade-store.test.ts (7 tests) 6ms
  Test Files  1 passed (1)
  Tests       7 passed (7)
```

## Verification

- [x] TypeScript compiles with no errors
- [x] All dashboard tests pass (7/7)
- [x] JSONL format used (no better-sqlite3)
- [x] Three-bucket accounting: grossProfit, gasCost, l1DataFee, revertCost are separate fields
- [x] appendFileSync for atomic writes
- [x] Restart recovery tested (loadFromDisk on construction)
- [x] Corrupted line resilience tested

## Integration Points

**Plan 02** (Log Rotation):
- Will use same `.data/` directory for PM2 logs
- TradeStore independent of log rotation

**Plan 03** (P&L Dashboard):
- Will import TradeStore to display session stats
- Will use SessionStats for dashboard rendering
- Three-bucket breakdowns in dashboard output

**Future Plans** (v1.2):
- SQLite upgrade path available if query performance becomes an issue
- JSONL format provides clean migration path (bulk insert from file)

## Self-Check: PASSED

**Files created:**
```bash
✓ bot/src/dashboard/types.ts (42 lines)
✓ bot/src/dashboard/TradeStore.ts (131 lines)
✓ bot/__tests__/dashboard/trade-store.test.ts (222 lines)
```

**Commits verified:**
```bash
✓ 35e06b5 - feat(08-01): add TradeOutcome and SessionStats types
✓ 82e885c - feat(08-01): implement TradeStore with JSONL persistence
✓ f6166ed - test(08-01): add TradeStore tests for persistence and restart recovery
```

**Exports verified:**
```bash
✓ TradeOutcome exported from types.ts
✓ SessionStats exported from types.ts
✓ TradeStore exported from TradeStore.ts
```

All artifacts present and commits exist.
