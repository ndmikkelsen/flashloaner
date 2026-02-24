---
phase: 03-bot-adaptation
plan: 03
subsystem: gas
tags: [arbitrum, gas-estimation, opportunity-detector, reporting, unit-tests, ethers-v6]

# Dependency graph
requires:
  - phase: 03-bot-adaptation
    plan: 01
    provides: "run-arb-sepolia.ts entry point and corrected Arbitrum Sepolia chain config"
  - phase: 03-bot-adaptation
    plan: 02
    provides: "ArbitrumGasEstimator module and CostEstimate.l1DataFee field"
provides:
  - "OpportunityDetector with pluggable async gasEstimatorFn via setGasEstimator()"
  - "analyzeDeltaAsync() for async L1+L2 cost-aware opportunity analysis"
  - "estimateCostsWithL1() async method on OpportunityDetector"
  - "formatOpportunityReport() shows L1 data fee as separate line item"
  - "run-arb-sepolia.ts wired with Arbitrum gas estimator via setGasEstimator()"
  - "Unit tests for ArbitrumGasEstimator (9 tests, mocked Contract)"
  - "Unit tests for Arbitrum Sepolia chain config (18 tests)"
affects:
  - 03-04-bot-adaptation
  - testnet-validation

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "setGasEstimator() post-construction injection for chain-specific gas logic"
    - "handleDelta() dispatches sync or async path based on gasEstimatorFn presence"
    - "vi.mock with module-scope state object to allow hoisting with captured references"
    - "Optional L1 data fee display: push to lines array only when l1DataFee is present"

key-files:
  created:
    - bot/__tests__/gas/ArbitrumGasEstimator.test.ts
    - bot/__tests__/config/chain-config.test.ts
  modified:
    - bot/src/detector/OpportunityDetector.ts
    - bot/src/detector/types.ts
    - bot/src/reporting.ts
    - bot/src/run-arb-sepolia.ts

key-decisions:
  - "setGasEstimator() public method instead of gasEstimatorFn in BotConfig (avoids type plumbing through DetectorConfig)"
  - "handleDelta() dispatches to analyzeDeltaAsync when gasEstimatorFn set, analyzeDelta otherwise (backward compatible)"
  - "vi.mock with module-scope state object (not local variable) — factory hoisting means local vars have TDZ issues"
  - "Reporting uses lines.push() pattern (not array literal) so conditional L1 fee line can be inserted cleanly"

# Metrics
duration: 7min
completed: 2026-02-17
---

# Phase 3 Plan 03: Gas Estimator Integration and Tests Summary

**Integrated ArbitrumGasEstimator into OpportunityDetector via pluggable setGasEstimator() method, updated dry-run reporting to show L1 data fee, wired estimator into run-arb-sepolia.ts, and added 27 unit tests covering gas estimation and chain config**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-02-17T19:55:41Z
- **Completed:** 2026-02-17T20:02:32Z
- **Tasks:** 2
- **Files modified:** 4 (modified), 2 (created)

## Accomplishments

- Added `gasEstimatorFn` optional field to `OpportunityDetectorConfig` in types.ts
- Added `setGasEstimator(fn)` public method to `OpportunityDetector` for post-construction injection
- Added `estimateCostsWithL1(path, inputAmount): Promise<CostEstimate>` method that calls gasEstimatorFn when set, falls back to synchronous `estimateCosts()` otherwise
- Added `analyzeDeltaAsync(delta): Promise<ArbitrageOpportunity | null>` private method mirroring analyzeDelta with async gas estimation
- Updated `handleDelta()` to dispatch to async path when gasEstimatorFn is present
- Updated `formatOpportunityReport()` to conditionally show L1 data fee line between Gas cost and Slippage
- Updated `run-arb-sepolia.ts` to import and inject Arbitrum gas estimator via `bot.detector.setGasEstimator(arbGasEstimator)`
- Updated opportunity log in `run-arb-sepolia.ts` to display L2 gas cost, L1 data fee (conditional), and total cost as separate lines
- Created 9-test suite for `ArbitrumGasEstimator` (gasComponentsToEth pure tests + estimateArbitrumGas mocked tests + address verification)
- Created 18-test suite for chain config system verifying Arbitrum Sepolia addresses, polling interval, and MEV config

## Task Commits

Each task was committed atomically:

1. **Task 1: Add gasEstimatorFn to OpportunityDetector and update reporting** - `5d95edc` (feat)
2. **Task 2: Create unit tests for ArbitrumGasEstimator and chain config** - `be1aabe` (test)

**Plan metadata:** (docs commit follows this summary creation)

## Files Created/Modified

- `bot/src/detector/OpportunityDetector.ts` - Added setGasEstimator(), estimateCostsWithL1(), analyzeDeltaAsync(), updated handleDelta() dispatch
- `bot/src/detector/types.ts` - Added gasEstimatorFn to OpportunityDetectorConfig
- `bot/src/reporting.ts` - Conditional L1 data fee line in formatOpportunityReport()
- `bot/src/run-arb-sepolia.ts` - Import gas module, create arbGasEstimator, inject via setGasEstimator(), update opportunity log
- `bot/__tests__/gas/ArbitrumGasEstimator.test.ts` - 9 unit tests (mocked ethers.js Contract)
- `bot/__tests__/config/chain-config.test.ts` - 18 unit tests (pure address verification)

## Decisions Made

- **setGasEstimator() method over gasEstimatorFn in BotConfig:** The BotConfig.detector field is DetectorConfig (from config/types.ts) which doesn't include gasEstimatorFn. Rather than threading the function through BotConfig → DetectorConfig → OpportunityDetector (requiring type changes across 3 files), a public setter on OpportunityDetector allows clean post-construction injection with no type plumbing.
- **Async dispatch in handleDelta():** When gasEstimatorFn is set, handleDelta dispatches to `analyzeDeltaAsync()` with `void ... .catch(...)` pattern. This keeps the EventEmitter contract (sync handler) while enabling async gas estimation. Errors are re-emitted as `"error"` events.
- **vi.mock module-scope state object:** `vi.mock` factories are hoisted before imports, so local `let` variables declared below the `vi.mock` call are in TDZ when the factory runs. The solution is a module-scope `const mockState = {...}` object declared before `vi.mock` — this is always in scope regardless of hoisting.
- **lines.push() reporting pattern:** Changed from a single array literal to `const lines = [...]` closed early + `lines.push(...)` calls. This allows inserting the conditional L1 data fee line cleanly between Gas cost and Slippage.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Syntax error in reporting.ts from edit**
- **Found during:** Task 1 verification (pnpm test)
- **Issue:** The Edit tool produced `];` (closing array bracket) where `);` (closing function call) was needed in the `lines.push(...)` call
- **Fix:** Changed `];` to `);` on the closing line of `lines.push()`
- **Files modified:** bot/src/reporting.ts
- **Commit:** Included in `5d95edc` (fixed before commit)

**2. [Rule 1 - Bug] vi.mock hoisting TDZ with local variable in factory**
- **Found during:** Task 2 test execution
- **Issue:** First attempt used `vi.mock("ethers", ...)` with `mockImplementation` arrow function — not valid as constructor. Second attempt used local `capturedAddress` variable inside a second `vi.mock` inside a test block — factory hoisting caused TDZ reference error.
- **Fix:** Moved shared mock state to a module-scope `const mockState = { gasEstimateComponents: vi.fn(), lastConstructedAddress: "" }` object that the `vi.mock` factory closes over safely.
- **Files modified:** bot/__tests__/gas/ArbitrumGasEstimator.test.ts
- **Commit:** Included in `be1aabe` (fixed before commit)

**3. [Rule 1 - Bug] chain.protocols?.aaveV3Pool unnecessary optional chain**
- **Found during:** Task 1 implementation
- **Issue:** The plan template used `chain.protocols?.aaveV3Pool` with optional chaining, but ChainConfig.protocols is required (not optional), so `?.` was unnecessary and would trigger TypeScript strictness warnings.
- **Fix:** Changed to `chain.protocols.aaveV3Pool` (no optional chain).
- **Files modified:** bot/src/run-arb-sepolia.ts
- **Commit:** Included in `5d95edc` (fixed before commit)

## Test Results

- **Before:** 423 TypeScript tests, 312 Solidity tests
- **After:** 450 TypeScript tests (+27), 312 Solidity tests (unchanged)
- **New tests:** 9 ArbitrumGasEstimator + 18 chain-config = 27 new tests

## Next Phase Readiness

- OpportunityDetector is fully integrated with Arbitrum gas estimation
- All 450 TypeScript tests + 312 Solidity tests pass
- run-arb-sepolia.ts is complete: loadChainConfig(421614) → FlashloanBot → setGasEstimator()
- Phase 3 plan 03 complete — all 3 plans of Phase 3 done
- Phase 4 (Testnet Validation) can begin

---
*Phase: 03-bot-adaptation*
*Completed: 2026-02-17*

## Self-Check: PASSED

- FOUND: bot/src/detector/OpportunityDetector.ts
- FOUND: bot/src/detector/types.ts
- FOUND: bot/src/reporting.ts
- FOUND: bot/src/run-arb-sepolia.ts
- FOUND: bot/__tests__/gas/ArbitrumGasEstimator.test.ts
- FOUND: bot/__tests__/config/chain-config.test.ts
- FOUND: .planning/phases/03-bot-adaptation/03-03-SUMMARY.md
- FOUND: 5d95edc (Task 1 commit - gas estimator integration)
- FOUND: be1aabe (Task 2 commit - unit tests)
