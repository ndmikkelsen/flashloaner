---
phase: 06-optimal-input-sizing
plan: 03
subsystem: bot-reporting
tags: [dry-run, visibility, integration-test, input-sizing]
dependency_graph:
  requires:
    - bot/src/detector/types.ts (ArbitrageOpportunity with optimizationResult)
    - bot/src/optimizer/types.ts (OptimizationResult)
  provides:
    - bot/src/reporting.ts (Enhanced opportunity report with optimization metadata)
    - bot/__tests__/integration/sizing.test.ts (E2E integration test suite)
  affects:
    - All dry-run output (now shows optimization context)
tech_stack:
  added: []
  patterns:
    - Conditional formatting based on optimizationResult presence
    - Integration testing with synthetic pool depth scenarios
    - Statistical validation (standard deviation for variance proof)
key_files:
  created:
    - bot/__tests__/integration/sizing.test.ts (311 lines)
  modified:
    - bot/src/reporting.ts
decisions:
  - "Display '(optimized)' vs '(fixed default)' label for operator clarity"
  - "Show optimization metadata (iterations, duration, converged, fallbackReason) in dry-run output"
  - "Integration test uses 5 pool depths (100 to 50,000 WETH) to prove variance"
metrics:
  duration: 171s
  tasks_completed: 2
  files_created: 1
  files_modified: 1
  test_coverage: 3 new integration tests, 501 total tests passing
  completed_at: "2026-02-20T16:14:09Z"
---

# Phase 6 Plan 03: Dry-Run Enhancement & Integration Test Summary

**One-liner:** Dry-run output now displays per-opportunity optimization metadata showing varying input amounts and convergence details, validated by comprehensive integration tests.

## What Was Built

Enhanced the dry-run reporting to provide operators with full visibility into optimal input sizing decisions. The bot now displays:

- **Input amount with context** — "(optimized)" when optimizer ran successfully, "(fixed default)" when fallback used
- **Optimization metadata** — iterations, duration (ms), convergence status
- **Fallback reason** — timeout, max_iterations, or no_profitable_size when optimization fails
- **Integration test suite** — 3 tests validating end-to-end sizing behavior across varying pool depths

## Implementation Details

### Enhanced Dry-Run Output (`bot/src/reporting.ts`)

**Before:**
```
  Input amount: 10 (base token)
```

**After (optimized):**
```
  Input amount: 43.6912 (optimized)
    Optimization: 14 iterations, 28.4ms, converged=true
```

**After (fallback):**
```
  Input amount: 10.0000 (fixed default)
```

**After (failed optimization):**
```
  Input amount: 10.0000 (optimized)
    Optimization: 20 iterations, 102.3ms, converged=false
    Fallback: timeout
```

### Key Code Changes

```typescript
// In formatOpportunityReport():
if (opp.optimizationResult) {
  lines.push(`  Input amount: ${opp.inputAmount.toFixed(4)} (optimized)`);
  lines.push(
    `    Optimization: ${opp.optimizationResult.iterations} iterations, ` +
      `${opp.optimizationResult.durationMs.toFixed(1)}ms, ` +
      `converged=${opp.optimizationResult.converged}`,
  );
  if (opp.optimizationResult.fallbackReason) {
    lines.push(`    Fallback: ${opp.optimizationResult.fallbackReason}`);
  }
} else {
  lines.push(`  Input amount: ${opp.inputAmount.toFixed(4)} (fixed default)`);
}
```

### Integration Test Coverage (`bot/__tests__/integration/sizing.test.ts`)

**Test 1: Varying amounts across deep and thin pools**
- Deep pools (10,000 WETH) → larger input amounts
- Thin pools (10 WETH) → smaller input amounts
- Both converge within 100ms
- Validates: `deepAmount > thinAmount` and both differ from default

**Test 2: Fallback when no reserve data**
- Delta without reserves array
- Optimizer not invoked
- Uses defaultInputAmount (25 in test)
- Validates: `optimizationResult === undefined`

**Test 3: Multiple opportunities show variance**
- 5 pool depths: 100, 1000, 5000, 10000, 50000 WETH
- All opportunities optimize successfully
- Largest pool produces larger amount than smallest pool
- Standard deviation > 0 proves non-uniform sizing

## Test Results

**New Integration Tests:**
- 3/3 integration tests pass
- All tests complete in <5ms
- No test flakiness observed

**Total Test Suite:**
- 501/501 tests pass (no regressions)
- Test suite duration: 2.55s
- TypeScript compilation: clean (no errors)

## Deviations from Plan

None — plan executed exactly as written.

## Operator Visibility Impact

**Before this plan:**
- Operators saw input amounts but couldn't tell if they were optimized
- No insight into optimization convergence or performance
- Debugging sizing issues required code inspection

**After this plan:**
- Clear visual distinction between optimized and fixed amounts
- Performance metrics visible (iterations, duration)
- Fallback reasons help diagnose optimization failures
- Operators can correlate pool depth with input amount variation

## Example Dry-Run Output

```
============================================================
  OPPORTUNITY DETECTED
============================================================
  Path:         WETH→USDC(UniV2)→WETH(Sushi)
  Buy pool:     WETH/USDC UniV2 (Deep) @ 2000.0000
  Sell pool:    WETH/USDC Sushi (Deep) @ 2050.0000
  Spread:       2.50%
  Block:        19000000
────────────────────────────────────────────────────────────
  Input amount: 43.6912 (optimized)
    Optimization: 14 iterations, 28.4ms, converged=true
  Gross profit: 1.093280
  Costs:
    Flash loan fee: 0.000000
    Gas cost:       0.000000
    Slippage:       0.000438
    Total costs:    0.000438
  Net profit:   1.092842 (2.502%)
────────────────────────────────────────────────────────────
  Decision:     WOULD EXECUTE (dry-run)
============================================================
```

## Self-Check: PASSED

**Created files verification:**
```
✓ FOUND: bot/__tests__/integration/sizing.test.ts
```

**Modified files verification:**
```
✓ FOUND: bot/src/reporting.ts
```

**Commits verification:**
```
✓ FOUND: f4ae99c (feat: enhance dry-run output with optimization metadata)
✓ FOUND: cfb1052 (test: add end-to-end integration test for optimal sizing)
```

**Test results:**
```
✓ 3/3 new integration tests pass
✓ 501/501 total tests pass (no regressions)
✓ TypeScript compilation passes
```

## Integration Points

**Upstream dependencies:**
- OpportunityDetector.ts populates `optimizationResult` field (Plan 02)
- InputOptimizer.ts provides OptimizationResult type (Plan 01)

**Downstream consumers:**
- Bot operators reading dry-run output
- Future dashboards/UIs consuming opportunity data

## Next Steps

**Immediate (Phase 7+):**
- Aggregate optimization metrics (hit rate, avg convergence time, avg iterations)
- Dashboard visualization of input amount distribution
- Alert on optimization timeouts or failures

**Future:**
- Export optimization data to JSONL for analysis
- Adaptive maxAmount based on historical profitability
- A/B testing: optimized vs fixed input amounts
