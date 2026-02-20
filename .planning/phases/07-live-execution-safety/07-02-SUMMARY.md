---
phase: 07-live-execution-safety
plan: 02
subsystem: execution-safety
tags: [nonce-management, crash-recovery, state-persistence]
dependency_graph:
  requires: []
  provides: [nonce-state-persistence, crash-safe-nonce-tracking]
  affects: [ExecutionEngine]
tech_stack:
  added: [NonceManager]
  patterns: [disk-persistence, pending-transaction-detection, timeout-based-recovery]
key_files:
  created:
    - bot/src/nonce/types.ts
    - bot/src/nonce/index.ts
    - bot/src/nonce/NonceManager.ts
    - bot/__tests__/unit/nonce-manager.test.ts
  modified: []
decisions:
  - decision: "Persist nonce state to .data/nonce.json after every submission"
    rationale: "Survive process crashes and prevent nonce collisions on restart"
  - decision: "5-minute default timeout for dropped transaction detection"
    rationale: "Balance between fast recovery and avoiding false positives"
  - decision: "Address validation in loadState ensures state file matches current wallet"
    rationale: "Prevent nonce corruption if state file is from a different wallet"
metrics:
  duration_seconds: 133
  tasks_completed: 3
  files_created: 4
  tests_added: 10
  test_pass_rate: 100%
  completed_at: "2026-02-20"
---

# Phase 07 Plan 02: Crash-Safe Nonce Management Summary

**One-liner:** NonceManager with .data/nonce.json persistence prevents nonce collisions after crashes by tracking pending transactions and reusing dropped nonce values.

## What Was Built

**NonceManager module** provides crash-safe nonce tracking for the flashloan bot:

1. **Disk persistence** - Nonce state (nonce, txHash, submittedAt, address) saved to `.data/nonce.json` after every transaction submission
2. **Pending transaction detection** - On restart, detects pending transactions and waits for them to resolve (confirmed or dropped)
3. **Dropped transaction handling** - Timeout-based detection (default 5 minutes) allows nonce reuse when transactions never mine
4. **On-chain sync** - `syncWithOnChain()` ensures local state matches blockchain state on first use

## Implementation Details

### Types (`bot/src/nonce/types.ts`)

```typescript
interface NonceState {
  nonce: number;              // Next nonce to use
  txHash?: string;            // Pending tx hash (if any)
  submittedAt?: number;       // Pending tx timestamp
  address: string;            // Wallet address
}

interface NonceAcquisitionResult {
  nonce: number;              // Nonce to use
  hadPending: boolean;        // Whether pending tx was resolved
  pendingStatus?: "confirmed" | "dropped";
}
```

### Core Methods

- **`getNextNonce()`** - Returns next nonce, resolving pending transactions first
- **`markSubmitted(txHash)`** - Persists pending transaction state to disk
- **`markConfirmed(txHash)`** - Increments nonce and clears pending state
- **`syncWithOnChain()`** - Syncs local nonce with on-chain nonce

### Crash Recovery Flow

1. Bot submits transaction with nonce N → `markSubmitted("0xabc")` → state saved to disk
2. **[CRASH]** → process dies
3. Bot restarts → `new NonceManager(config)` → loads state from disk (nonce N, txHash "0xabc")
4. `getNextNonce()` → checks on-chain nonce:
   - **If on-chain > N** → transaction confirmed → increment to N+1 → return N+1
   - **If on-chain == N && timeout exceeded** → transaction dropped → return N (reuse)
   - **If on-chain == N && timeout not exceeded** → wait (poll until confirmed or timeout)

This prevents **nonce collision** (reusing a nonce that's already in the mempool) and **stuck nonce** (skipping a nonce that never mined).

## Test Coverage

**10 passing tests** across 4 categories:

1. **Initialization** (3 tests)
   - Fresh state when no state file exists
   - Load existing state from disk
   - Sync with on-chain nonce when on-chain is higher

2. **Transaction Submission** (3 tests)
   - Return current nonce when no pending transaction exists
   - Persist state after marking a transaction as submitted
   - Increment nonce after marking a transaction as confirmed

3. **Crash Recovery** (2 tests)
   - Detect confirmed pending transaction after restart (on-chain nonce advanced)
   - Detect dropped pending transaction after timeout (on-chain nonce unchanged)

4. **State Persistence** (2 tests)
   - Create .data directory if it doesn't exist
   - Survive multiple submit-confirm cycles

All tests use a mock provider (no blockchain required).

## Deviations from Plan

None - plan executed exactly as written.

## Integration Points

**Upstream:** None (standalone module)

**Downstream:**
- **ExecutionEngine** (Plan 07-03) will integrate NonceManager for transaction submission
- **TransactionBuilder** may use NonceManager instead of relying on ethers.js auto-nonce

## Next Steps

Plan 07-03 will integrate NonceManager into ExecutionEngine with:
- Nonce acquisition before transaction submission
- Nonce confirmation after transaction receipt
- Crash recovery on bot startup

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `0a31781` | Create nonce state types and persistence helpers |
| 2 | `d0bd4f1` | Implement NonceManager with disk persistence |
| 3 | `5cfd135` | Add NonceManager unit tests (10 tests) |

## Self-Check: PASSED

**Created files:**
- bot/src/nonce/types.ts - FOUND
- bot/src/nonce/index.ts - FOUND
- bot/src/nonce/NonceManager.ts - FOUND
- bot/__tests__/unit/nonce-manager.test.ts - FOUND

**Commits:**
- 0a31781 - FOUND
- d0bd4f1 - FOUND
- 5cfd135 - FOUND

**Tests:**
- All 10 nonce manager tests pass
- All 511 project tests pass (no regressions)
