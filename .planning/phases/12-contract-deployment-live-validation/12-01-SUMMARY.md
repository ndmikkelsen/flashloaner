---
phase: 12-contract-deployment-live-validation
plan: 01
subsystem: bot
tags: [safety, validation, zero-address, executor, deployment-prep]

# Dependency graph
requires:
  - phase: 11-dry-run-signal-quality
    provides: patched bot code ready for live deployment
  - phase: 07-live-execution-safety
    provides: three-mode architecture (dry-run/shadow/live) and adapter map pattern
provides:
  - Zero-address adapter guard in TransactionBuilder.resolveAdapter() (prevents silent on-chain reverts)
  - EXECUTOR_ADDRESS validation at startup in run-arb-mainnet.ts (prevents shadow/live with wrong contract)
  - Deployed FlashloanExecutor and DEX adapters on Arbitrum mainnet (pending Tasks 2-3)
affects:
  - "12-02-shadow-mode-validation"
  - "12-03-live-trading-activation"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Zero-address guard pattern: throw on zero address in resolveAdapter() instead of propagating bad address"
    - "Startup validation: exit with clear error message before entering shadow/live mode"

key-files:
  created: []
  modified:
    - bot/src/builder/TransactionBuilder.ts
    - bot/src/run-arb-mainnet.ts

key-decisions:
  - "Throw on zero-address adapter in resolveAdapter() — caught by opportunityFound try/catch, opportunity silently skipped"
  - "EXECUTOR_ADDRESS guard placed after wallet balance check, before executionConfig construction"
  - "Pre-existing TS error in PriceMonitor.ts (WebSocketLike type) and shadow-mode integration test failures are out-of-scope (no local node)"

patterns-established:
  - "Safety guard at startup: validate critical env vars before entering live modes"
  - "Filterable errors: throw with descriptive message so bot logs the skip reason"

requirements-completed: [EXEC-01, EXEC-02]

# Metrics
duration: 8min
completed: 2026-02-25
---

# Phase 12 Plan 01: Contract Deployment Prep Summary

**Zero-address adapter guard in TransactionBuilder and EXECUTOR_ADDRESS startup validation in run-arb-mainnet.ts — prevents silent on-chain reverts and wrong-contract execution in shadow/live mode**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-25T22:31:27Z
- **Completed:** 2026-02-25T22:34:00Z (Task 1 only — paused at Task 2 checkpoint)
- **Tasks:** 1 of 3 executed (paused at checkpoint:human-action)
- **Files modified:** 2

## Accomplishments
- `TransactionBuilder.resolveAdapter()` now throws a descriptive error when the resolved adapter address is `0x0000000000000000000000000000000000000000`, preventing Camelot/undeployed-adapter opportunities from reaching the chain and reverting with `AdapterNotApproved(address(0))`
- `run-arb-mainnet.ts` now exits immediately with a clear error message if `EXECUTOR_ADDRESS` is unset or zero when entering shadow or live mode, preventing transactions being sent to the wrong contract
- All 60 TransactionBuilder unit tests pass with the new guard (existing test suite unchanged)

## Task Commits

Each task was committed atomically:

1. **Task 1: Patch zero-address adapter guard and EXECUTOR_ADDRESS validation** - `dad8360` (fix)

Tasks 2 and 3 are `checkpoint:human-action` — require human intervention (fund wallet, set env vars, run deploy script).

## Files Created/Modified
- `bot/src/builder/TransactionBuilder.ts` - Added `ZERO_ADDRESS` static constant and zero-address guard in `resolveAdapter()`
- `bot/src/run-arb-mainnet.ts` - Added `EXECUTOR_ADDRESS` validation block after wallet balance check; updated TODO comment

## Decisions Made
- Throw on zero-address adapter: error is caught by the existing `opportunityFound` try/catch in `bot/src/index.ts`, which logs and skips — no additional changes needed in index.ts
- Guard placed inside the `if (shadowMode || liveMode)` block after the balance check — this ensures dry-run mode is unaffected
- Pre-existing TS error in `PriceMonitor.ts` (WebSocketLike `.on` type mismatch) is out of scope per deviation rules — logged to deferred items

## Deviations from Plan

None - Task 1 executed exactly as written. Pre-existing issues noted:
- `PriceMonitor.ts` TS type error (pre-existing, out of scope)
- `shadow-mode.test.ts` 2 test failures (pre-existing, require local Anvil node not running)

## Issues Encountered
- `npx tsc --noEmit` fails outside `node_modules` context — used `pnpm run typecheck` instead (same underlying command)
- `pnpm install` was needed to populate `node_modules` before type checking

## User Setup Required
Tasks 2 and 3 require manual steps before this plan can be fully completed:
1. Fund deployer wallet with 0.01-0.05 ETH on Arbitrum mainnet
2. Export `DEPLOYER_PRIVATE_KEY`, `ARBISCAN_API_KEY`, and all 12 other env vars in terminal
3. Run forge deploy dry-run, then broadcast to Arbitrum mainnet

## Next Phase Readiness
- Task 1 code patches are complete and committed
- Tasks 2 and 3 require human action (wallet funding + env var setup + deployment)
- After deployment: `deployments/42161.json` will contain executor address needed for Plans 12-02 and 12-03

---
*Phase: 12-contract-deployment-live-validation*
*Completed: 2026-02-25 (partial — paused at Task 2 checkpoint)*
