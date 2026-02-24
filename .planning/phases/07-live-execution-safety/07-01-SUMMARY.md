---
phase: 07-live-execution-safety
plan: 01
subsystem: safety-validation
tags: [shadow-mode, staleness-guard, validation, safety]
dependency_graph:
  requires: [06-optimal-input-sizing]
  provides: [shadow-mode-validation, staleness-protection]
  affects: [bot-orchestrator, opportunity-detector]
tech_stack:
  added: []
  patterns:
    - Shadow mode for risk-free simulation via eth_call
    - 200ms staleness guard for freshness enforcement
    - Three-mode architecture: dry-run | shadow | live
key_files:
  created:
    - bot/__tests__/integration/shadow-mode.test.ts
    - .planning/phases/07-live-execution-safety/deferred-items.md
  modified:
    - bot/src/detector/OpportunityDetector.ts
    - bot/src/index.ts
decisions:
  - "200ms staleness threshold balances freshness with execution latency on L2"
  - "Shadow mode uses SHADOW_MODE env var for explicit opt-in (DRY_RUN backward compatible)"
  - "Staleness guard enforced only in live mode (dry-run and shadow modes skip it)"
  - "Engine and builder initialization deferred to Plan 03 (shadow mode logs intent for now)"
metrics:
  duration: 197
  completed: "2026-02-20T16:25:50Z"
  tasks_completed: 3
  files_modified: 4
---

# Phase 07 Plan 01: Shadow Mode Validation and Staleness Protection Summary

**One-liner:** Three-mode execution architecture (dry-run | shadow | live) with 200ms staleness guard and shadow simulation logging.

## Objective

Implement shadow mode validation and staleness protection to ensure profitability estimates are accurate and trades are fresh before enabling live execution.

Shadow mode validates that profit estimation aligns with actual on-chain simulation results (eth_call) without spending gas, building confidence before live trading. Staleness guard prevents executing trades on stale price data when detection-to-execution latency exceeds 200ms.

## What Was Built

### Task 1: Add Detection Timestamp and Staleness Guard

**Files modified:**
- `bot/src/detector/OpportunityDetector.ts`

**Changes:**
- Added `MAX_STALENESS_MS = 200` constant
- Added `checkStaleness()` method that returns `{ fresh: boolean; latencyMs: number }`
- Uses existing `ArbitrageOpportunity.timestamp` field (already set by detector)
- Method will be called by execution engine before transaction submission

**Commit:** fd0e7c3

### Task 2: Implement Shadow Mode with DRY_RUN Backward Compatibility

**Files modified:**
- `bot/src/index.ts`

**Changes:**
- Added `mode: "dry-run" | "shadow" | "live"` field to FlashloanBot
- Added optional `engine?: ExecutionEngine` and `builder?: TransactionBuilder` fields (undefined until Plan 03)
- Mode detection in constructor: `DRY_RUN=true` → dry-run, `SHADOW_MODE=true` → shadow, both false → live
- Updated `fromEnv()` to check `DRY_RUN` env var for backward compatibility (defaults to true when unset)
- Updated startup log to show `Mode: DRY-RUN | SHADOW | LIVE` instead of boolean
- Rewrote `opportunityFound` event handler as async with three branches:
  - **DRY_RUN mode:** Just report (existing behavior)
  - **SHADOW mode:** Report + log simulation intent (eth_call wiring in Plan 03)
  - **LIVE mode:** Check staleness guard → report + log latency → log submission intent (tx wiring in Plan 03)
- Staleness guard aborts with warning if latency > 200ms

**Commit:** 79d683d

### Task 3: Add Shadow Mode Integration Tests

**Files created:**
- `bot/__tests__/integration/shadow-mode.test.ts`

**Test coverage:**
- Mode detection (3 tests): dry-run, shadow, live
- Staleness guard (3 tests): fresh (<200ms), stale (>200ms), edge case (=200ms)
- Backward compatibility (2 tests): DRY_RUN=true, DRY_RUN unset

**All 8 tests passing.**

**Commit:** 17142ad

## Deviations from Plan

### Out-of-Scope Pre-existing Issues

**1. Missing NonceManager.ts**
- **File:** bot/src/nonce/index.ts
- **Error:** Cannot find module './NonceManager.js'
- **Context:** Pre-existing type error unrelated to shadow mode implementation
- **Status:** Logged in deferred-items.md, not fixed (out of scope for this phase)
- **Discovered:** Task 1 (tsc verification)

This is a pre-existing issue not caused by this plan's changes. Per deviation rules, only issues directly caused by current task changes are in scope for auto-fix.

## Verification Results

All verification steps passed:

1. ✅ `pnpm exec tsc --noEmit` — shadow mode changes type-safe (pre-existing nonce error documented)
2. ✅ `pnpm test -- --run bot/__tests__/integration/shadow-mode.test.ts` — all 8 shadow mode tests pass
3. ✅ `pnpm test` — all 519 TypeScript tests pass (no regressions)
4. ✅ `grep -n "checkStaleness" bot/src/detector/OpportunityDetector.ts` — staleness guard method present
5. ✅ `grep -n "mode:" bot/src/index.ts` — mode field declared
6. ✅ `grep -n "SHADOW" bot/src/index.ts` — shadow mode handling in wireEvents

## Success Criteria Met

- ✅ Shadow mode flag exists and logs simulation intent without broadcasting
- ✅ Staleness guard aborts trades with >200ms latency in live mode
- ✅ DRY_RUN=true continues to work exactly as before (backward compatibility)
- ✅ All tests pass (519 TypeScript tests, including 8 new shadow mode tests)

## Technical Decisions

### 200ms Staleness Threshold

**Rationale:** Balances freshness with realistic execution latency on L2 chains like Arbitrum. Detection-to-execution pipeline includes:
- Opportunity detection (~10ms)
- Cost estimation (~5ms)
- Transaction building (~10ms)
- RPC submission (~20-50ms)
- Sequencer acceptance (~10-50ms)

Total: ~55-125ms under normal conditions. 200ms threshold provides headroom while preventing stale trades.

**Trade-off:** Too aggressive (e.g., 50ms) would reject most opportunities. Too lenient (e.g., 1000ms) allows stale price data to cause failed trades.

### Shadow Mode Opt-In

**Rationale:** Uses `SHADOW_MODE=true` env var for explicit opt-in. DRY_RUN remains default behavior (backward compatible). This avoids accidental simulation mode when users expect dry-run reporting.

### Three-Mode Architecture

**Modes:**
1. **dry-run:** Report opportunities only (no simulation, no execution)
2. **shadow:** Simulate via eth_call + log estimated vs simulated profit (no execution)
3. **live:** Staleness guard + transaction submission

**Rationale:** Clear separation of concerns. Dry-run for development/debugging. Shadow for validation before live trading. Live for production with safety guards.

## Next Steps

**Plan 02 (Transaction Simulation):** Wire `ExecutionEngine.simulateTransaction()` into shadow mode handler. Log estimated vs simulated profit for validation.

**Plan 03 (Live Execution Wiring):** Initialize ExecutionEngine and TransactionBuilder in FlashloanBot. Wire transaction submission in live mode handler.

## Self-Check

**Created files exist:**
```
✅ bot/__tests__/integration/shadow-mode.test.ts
✅ .planning/phases/07-live-execution-safety/deferred-items.md
✅ .planning/phases/07-live-execution-safety/07-01-SUMMARY.md
```

**Modified files exist:**
```
✅ bot/src/detector/OpportunityDetector.ts
✅ bot/src/index.ts
```

**Commits exist:**
```
✅ fd0e7c3: feat(07-01): add staleness guard to OpportunityDetector
✅ 79d683d: feat(07-01): implement shadow mode and staleness protection
✅ 17142ad: test(07-01): add shadow mode integration tests
```

## Self-Check: PASSED
