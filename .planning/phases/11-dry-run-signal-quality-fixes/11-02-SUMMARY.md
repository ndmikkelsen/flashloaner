---
phase: 11-dry-run-signal-quality-fixes
plan: 02
type: summary
status: complete
requirements: [DEX-06]
---

# Plan 11-02 Summary: Fix TJ LB Fee Display and Cost Floor

## Objective
Fix two related display bugs in the opportunity logging block of `run-arb-mainnet.ts` that caused Trader Joe LB pool fees to display as "0.00%" instead of the correct percentage, and the cost floor calculation to underreport LB fees by 100x.

## What Changed

### Task 1: Fix TJ LB fee display and cost floor formatting
**File:** `bot/src/run-arb-mainnet.ts` (lines 293-325)

**Per-step fee display (before):**
```typescript
const feeRate = step.feeTier !== undefined
  ? `${(step.feeTier / 10000).toFixed(2)}%`
  : "0.30% (V2)";
```
- Bug: `(15 / 10000).toFixed(2)` = "0.00" (rounds to zero)

**Per-step fee display (after):**
```typescript
if (step.dex === "traderjoe_lb") {
  const basePct = (step.feeTier ?? 0) / 100; // bps to percent
  feeRate = `${basePct.toFixed(2)}% (LB, +50% buffer)`;
} else if (step.feeTier !== undefined) {
  feeRate = `${(step.feeTier / 10000).toFixed(2)}%`;
} else {
  feeRate = "0.30% (V2)";
}
```
- binStep=15 now displays "0.15% (LB, +50% buffer)"
- binStep=25 now displays "0.25% (LB, +50% buffer)"
- V3 feeTier=500 still displays "0.05%" (unchanged)
- V3 feeTier=3000 still displays "0.30%" (unchanged)

**Cost floor calculation (before):**
```typescript
const rate = s.feeTier !== undefined ? s.feeTier / 1_000_000 : 0.003;
```
- Bug: `15 / 1_000_000` = 0.000015 (100x too low for LB)

**Cost floor calculation (after):**
```typescript
if (s.dex === "traderjoe_lb") {
  rate = ((s.feeTier ?? 0) / 10_000) * 1.5;
} else if (s.feeTier !== undefined) {
  rate = s.feeTier / 1_000_000;
} else {
  rate = 0.003;
}
```
- Mirrors `OpportunityDetector.getSwapFeeRate()` logic exactly
- LB binStep=15: `(15/10000)*1.5` = 0.00225, displays "0.23%" (correct)
- V3/V2 paths unchanged

### Task 2: Add fee display format tests
**File:** `bot/__tests__/integration/traderjoe-lb-integration.test.ts`

Added `describe("fee display formatting")` block outside the RPC-dependent skipIf block with 5 tests:
1. TJ LB binStep=15 displays "0.15"
2. TJ LB binStep=25 displays "0.25"
3. TJ LB cost floor rate with 50% buffer = 0.00225, displays "0.23%"
4. V3 feeTier=500 cost floor rate = 0.0005
5. V2 default rate displays "0.30"

## Verification Results

| Check | Result |
|-------|--------|
| `pnpm exec tsc --noEmit` | PASS (0 errors) |
| `pnpm test -- --run bot/__tests__/integration/traderjoe-lb-integration.test.ts` | PASS (5 passed, 5 skipped) |
| `pnpm test -- --run` (full suite) | PASS (559 passed, 8 skipped, 30 test files) |
| Manual: binStep=15 -> "0.15% (LB, +50% buffer)" | Correct |
| Manual: binStep=25 -> "0.25% (LB, +50% buffer)" | Correct |
| Manual: V3 feeTier=500 -> "0.05%" | Correct (unchanged) |
| Manual: V3 feeTier=3000 -> "0.30%" | Correct (unchanged) |
| Manual: Cost floor LB binStep=15 -> "0.23%" | Correct |

## Success Criteria Met

- [x] TJ LB fee display shows correct percentage (0.15% for binStep=15, not 0.00%)
- [x] Cost floor calculation for TJ LB uses binStep/10000 with 1.5x buffer (not binStep/1000000)
- [x] Non-LB pool fee display is unchanged
- [x] All existing TS tests continue to pass (559 passed)
- [x] 5 new display format tests added and passing
