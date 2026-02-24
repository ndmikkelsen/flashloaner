---
phase: 06-optimal-input-sizing
plan: 02
subsystem: bot-detector
tags: [integration, optimization, detector, input-sizing]
dependency_graph:
  requires:
    - bot/src/optimizer/InputOptimizer.ts (InputOptimizer class)
    - bot/src/optimizer/types.ts (OptimizationResult)
  provides:
    - bot/src/detector/OpportunityDetector.ts (with InputOptimizer integration)
    - bot/src/detector/types.ts (ArbitrageOpportunity with optimizationResult)
  affects:
    - All opportunity detection (now uses optimal sizing when reserve data available)
tech_stack:
  added: []
  patterns:
    - Conditional optimization (only when reserve data available)
    - Graceful fallback (defaultInputAmount when no reserves)
    - Profit function wrapping (buildProfitFunction encapsulates cost estimation)
key_files:
  created: []
  modified:
    - bot/src/detector/types.ts
    - bot/src/detector/OpportunityDetector.ts
    - bot/__tests__/detector/OpportunityDetector.test.ts
    - bot/__tests__/integration/e2e/pipeline.test.ts
    - bot/__tests__/integration/e2e/full-pipeline.test.ts
decisions:
  - "Optimize only when reserve data available (hasReserveData check prevents optimization on missing/stale data)"
  - "maxIterations=20, convergenceThreshold=1.0 (matches Plan 01 findings for realistic convergence)"
  - "maxAmount = min(1000, defaultInputAmount * 100) caps optimization range"
  - "Store optimizationResult in opportunity for observability/debugging"
metrics:
  duration: 317s
  tasks_completed: 3
  files_modified: 5
  test_coverage: 6 new integration tests, 498 total tests passing
  completed_at: "2026-02-20T16:08:18Z"
---

# Phase 6 Plan 02: Detector Integration Summary

**One-liner:** OpportunityDetector now optimizes input amounts per-opportunity using InputOptimizer when reserve data available, falling back to defaultInputAmount otherwise.

## What Was Built

Integrated the `InputOptimizer` (from Plan 01) into `OpportunityDetector`'s `analyzeDelta` flow. The detector now:

- **Calls optimizer when reserve data available** (V2 reserves or V3 liquidity+sqrtPrice present)
- **Falls back to fixed defaultInputAmount** when no reserve data (graceful degradation)
- **Stores optimization metadata** in `ArbitrageOpportunity.optimizationResult` for observability
- **Uses same optimization logic** in both sync (`analyzeDelta`) and async (`analyzeDeltaAsync`) paths

## Implementation Details

### Type Extension (`bot/src/detector/types.ts`)

```typescript
export interface ArbitrageOpportunity {
  // ... existing fields ...
  inputAmount: number;
  optimizationResult?: OptimizationResult;  // NEW: undefined when using fallback
  grossProfit: number;
  // ...
}
```

### OpportunityDetector Integration

**1. Optimizer Initialization** (constructor):
```typescript
this.optimizer = new InputOptimizer({
  maxIterations: 20,           // Realistic convergence for [1, 1000] range
  timeoutMs: 100,              // Production safety limit
  fallbackAmount: this.config.defaultInputAmount,
  minAmount: 1,
  maxAmount: Math.min(1000, this.config.defaultInputAmount * 100),
  convergenceThreshold: 1.0,   // 1 token unit precision
});
```

**2. Profit Function Wrapper** (`buildProfitFunction`):
```typescript
private buildProfitFunction(path: SwapPath): (inputAmount: number) => number {
  return (inputAmount: number) => {
    const grossProfit = this.calculateGrossProfit(path, inputAmount);
    const costs = this.estimateCosts(path, inputAmount);
    return grossProfit - costs.totalCost;
  };
}
```

**3. Conditional Optimization** (in `analyzeDelta` and `analyzeDeltaAsync`):
```typescript
// Check if we have reserve data for optimization
const hasReserveData = path.steps.some(
  (s) => s.virtualReserveIn !== undefined && s.virtualReserveIn > 0,
);

if (hasReserveData) {
  const profitFn = this.buildProfitFunction(path);
  optimizationResult = this.optimizer.optimize(path, profitFn);
  inputAmount = optimizationResult.optimalAmount;
} else {
  // No reserve data: fall back to fixed amount
  inputAmount = this.config.defaultInputAmount;
}
```

## Test Coverage (6 new tests)

Added `optimal input sizing` test suite to `OpportunityDetector.test.ts`:

1. **Uses optimizer when V2 reserve data available** - Verifies optimizer called and converged
2. **Falls back to defaultInputAmount when no reserve data** - Verifies graceful degradation
3. **Optimizes larger amounts for deep pools** - Validates pool depth awareness
4. **Optimizes smaller amounts for thin pools** - Prevents over-trading thin pools
5. **Completes optimization within 100ms** - Performance constraint validation
6. **Stores optimization metadata in opportunity** - Observability validation

Total tests: 498 passing (36 detector tests, 18 optimizer tests, 444 others).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected optimizer configuration for realistic convergence**
- **Found during:** Task 2 (test execution)
- **Issue:** Plan specified maxIterations=3, convergenceThreshold=0.01 (copy-paste from plan template), but Plan 01 discovered these values cause iteration cap failures
- **Fix:** Updated to maxIterations=20, convergenceThreshold=1.0 (matches Plan 01 findings)
- **Files modified:** `bot/src/detector/OpportunityDetector.ts`
- **Commit:** 3c238c2 (combined with Task 3)

**2. [Rule 1 - Bug] Updated integration test expectations for optimizer behavior**
- **Found during:** Task 3 (full test suite run)
- **Issue:** Integration tests expected fixed input amounts (defaultInputAmount=10), but optimizer chooses variable amounts based on pool depth
- **Root cause:** Tests written pre-optimization assumed static sizing
- **Fix:**
  - Removed exact `grossProfit` assertion (now variable with optimal sizing)
  - Increased cost thresholds to force rejection even with larger optimal sizes
  - Added check for `optimizationResult` presence when reserve data available
- **Files modified:** `bot/__tests__/integration/e2e/pipeline.test.ts`, `bot/__tests__/integration/e2e/full-pipeline.test.ts`
- **Rationale:** Optimizer correctly increases trade size for deep pools, making previously unprofitable opportunities profitable at scale
- **Commit:** 179dd21

## Integration Points

**Optimization Trigger:**
- V2 pools with `reserves` array → optimizer runs
- V3 pools with `liquidity` and `sqrtPriceX96` → optimizer runs
- Pools without reserve data → fallback to defaultInputAmount

**Profit Function:**
- Wraps `calculateGrossProfit()` (includes DEX fees)
- Wraps `estimateCosts()` (includes flash loan fee, gas, slippage)
- Returns net profit for any input amount

**Metadata Storage:**
- `optimizationResult` includes: `optimalAmount`, `expectedProfit`, `iterations`, `durationMs`, `converged`, `fallbackReason`
- Undefined when fallback used (no reserve data)

## Behavior Changes

**Before (Plan 01):**
- All opportunities used fixed `defaultInputAmount` (typically 10)
- Profit estimation was constant per opportunity
- No pool depth awareness

**After (Plan 02):**
- Opportunities with reserve data use optimal input amount (range: [1, 1000])
- Deep pools allow larger trades (e.g., 43.69 instead of 10)
- Thin pools prevent over-trading (e.g., 3.5 instead of 10)
- Optimization completes in <100ms or falls back to defaultInputAmount

**Impact on Profitability:**
- Large spreads on deep pools: significantly more profit (10x+ increase possible)
- Small spreads on thin pools: prevents unprofitable slippage
- No reserve data: identical behavior to pre-optimization

## Self-Check: PASSED

**Created files verification:**
```
(No files created — only modifications)
```

**Modified files verification:**
```
✓ FOUND: bot/src/detector/types.ts
✓ FOUND: bot/src/detector/OpportunityDetector.ts
✓ FOUND: bot/__tests__/detector/OpportunityDetector.test.ts
✓ FOUND: bot/__tests__/integration/e2e/pipeline.test.ts
✓ FOUND: bot/__tests__/integration/e2e/full-pipeline.test.ts
```

**Commits verification:**
```
✓ FOUND: 8f70e4c (feat: extend ArbitrageOpportunity with optimization metadata)
✓ FOUND: 48f3371 (feat: integrate InputOptimizer into OpportunityDetector)
✓ FOUND: 3c238c2 (test: add integration tests for optimal input sizing)
✓ FOUND: 179dd21 (fix: update integration tests for optimizer behavior)
```

**Test results:**
```
✓ 498/498 total tests pass
✓ 36/36 OpportunityDetector tests pass (including 6 new optimal sizing tests)
✓ 18/18 InputOptimizer tests pass (no regressions)
✓ TypeScript compilation passes
```

## Next Steps

**Immediate (Plan 03):**
- Add per-opportunity optimization metrics to dry-run output
- Track optimization hit rate, convergence rate, average duration
- Compare optimal vs default input amounts for operator visibility

**Future (Phase 7+):**
- Adaptive maxAmount based on wallet balance
- Multi-objective optimization (profit vs gas cost trade-off)
- Per-pool optimization caching (avoid re-optimizing same pool state)
- V3 tick-level liquidity awareness (currently uses global L)
