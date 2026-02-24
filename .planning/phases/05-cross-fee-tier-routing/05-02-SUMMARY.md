---
phase: 05-cross-fee-tier-routing
plan: 02
subsystem: detector
tags: [cross-fee-tier, cost-floor, routing-logic, dry-run-visibility]
dependency_graph:
  requires: [ROUTE-01, ROUTE-02]
  provides: [ROUTE-05]
  affects: [bot/__tests__/detector/cross-fee-tier.test.ts, bot/src/run-arb-mainnet.ts]
tech_stack:
  added: []
  patterns: [cross-fee-tier routing validation, cost floor calculation, fee-tier visibility]
key_files:
  created:
    - bot/__tests__/detector/cross-fee-tier.test.ts
  modified:
    - bot/src/run-arb-mainnet.ts
decisions:
  - Cross-fee-tier routing produces measurably lower cost floors (~0.35% vs ~0.60%)
  - Dry-run output shows per-step fee rates and combined cost floor for operator visibility
  - Fee tier information preserved throughout swap path construction
  - Zero-cost detector configuration isolates DEX trading fees for clean cost floor validation
metrics:
  duration: 152s
  completed: 2026-02-20T15:26:44Z
  tasks: 2
  files: 2
  tests_added: 6
---

# Phase 05 Plan 02: Cross-Fee-Tier Routing Tests & Visibility Summary

**One-liner:** Validated cross-fee-tier routing produces ~0.35% cost floor (vs ~0.60% same-tier) and enhanced dry-run output with per-step fee visibility for operators.

## Objective

Verify and test that cross-fee-tier routing produces lower cost floors than same-tier pairing, and enhance dry-run output to show fee tier information for operator visibility.

## What Was Built

### Test Coverage (6 tests)

Created `bot/__tests__/detector/cross-fee-tier.test.ts` with comprehensive cross-fee-tier routing validation:

1. **Cross-tier vs same-tier profit comparison**
   - Same scenario (1% spread, identical prices)
   - Cross-tier (0.05% buy + 0.3% sell) produces higher net profit than same-tier (0.3% + 0.3%)
   - Proves buy-side fee reduction translates to profit advantage

2. **Cross-tier cost floor calculation (~0.35%)**
   - Buy on feeTier 500 (0.05%) + sell on feeTier 3000 (0.3%) = 0.35% combined
   - With 1% spread, gross profit is ~0.65% of input (1% - 0.35%)
   - Validates cost floor formula: spread - trading fees

3. **Same-tier cost floor calculation (~0.60%)**
   - Buy on feeTier 3000 (0.3%) + sell on feeTier 3000 (0.3%) = 0.6% combined
   - With 1% spread, gross profit is ~0.40% of input (1% - 0.6%)
   - Baseline for comparison

4. **PairKey grouping across fee tiers**
   - Pools with same token pair but different fee tiers produce identical pairKey
   - Enables PriceMonitor to compare cross-tier pools
   - Tested against ARBITRUM_MAINNET_POOLS (WETH/USDC 0.05% and 0.3%)

5. **SwapPath preserves fee tiers**
   - buildSwapPath includes feeTier on each SwapStep
   - Cross-tier delta (buy 500, sell 3000) produces path with correct feeTier per step

6. **Fee rate calculation per tier**
   - getSwapFeeRate applies correct rates: 500 → 0.05%, 3000 → 0.3%
   - Identical paths with different fee tiers produce different gross profits
   - Validates fee deduction logic

**Test configuration:**
```typescript
const detector = new OpportunityDetector({
  minProfitThreshold: 0,
  maxSlippage: 0,
  defaultInputAmount: 10,
  gasPriceGwei: 0,
  gasPerSwap: 0,
  flashLoanFees: { aaveV3: 0, dydx: 0, balancer: 0 },
});
```

This zero-cost configuration isolates DEX trading fees as the only variable, making cost floor calculations clean and verifiable.

### Dry-Run Output Enhancement

Enhanced `bot/src/run-arb-mainnet.ts` opportunityFound event handler:

**Added between "Path:" and "Input:" lines:**
```typescript
// Show individual step fee breakdown for cross-tier visibility
for (let i = 0; i < opp.path.steps.length; i++) {
  const step = opp.path.steps[i];
  const feeRate = step.feeTier !== undefined
    ? `${(step.feeTier / 10000).toFixed(2)}%`
    : "0.30% (V2)";
  const direction = i === 0 ? "Buy" : "Sell";
  console.log(col(`  ${direction} fee:   ${feeRate} on ${step.dex}`));
}
const combinedFee = opp.path.steps.reduce((sum, s) => {
  const rate = s.feeTier !== undefined ? s.feeTier / 1_000_000 : 0.003;
  return sum + rate;
}, 0);
console.log(col(`  Cost floor: ~${(combinedFee * 100).toFixed(2)}% (trading fees only)`));
```

**Example output:**
```
[OPPORTUNITY] ================================
  Path:       WETH/USDC UniV3 (0.05%) → WETH/USDC UniV3 (0.3%)
  Buy fee:   0.05% on uniswap_v3
  Sell fee:  0.30% on uniswap_v3
  Cost floor: ~0.35% (trading fees only)
  Input:      5 ETH
  Gross:      0.0325 ETH
  ...
```

Operators can now see at a glance:
- Which fee tier is used for each swap step
- Combined cost floor percentage (trading fees only)
- Whether cross-tier routing is active (0.35% vs 0.60%)

## Cross-Fee-Tier Cost Floor Advantage

| Routing Strategy | Buy Fee | Sell Fee | Combined | 1% Spread → Profit |
|-----------------|---------|----------|----------|-------------------|
| **Cross-tier** | 0.05% | 0.30% | **0.35%** | **~0.65%** |
| **Same-tier** | 0.30% | 0.30% | **0.60%** | **~0.40%** |

**Advantage:** Cross-tier routing yields **62.5% more profit** (0.65% vs 0.40%) on a 1% spread by minimizing buy-side fees.

**Why it matters:**
- More opportunities become profitable (lower cost floor = lower breakeven)
- Higher net profit on marginal opportunities
- 0.25% cost reduction translates directly to profit increase

## Deviations from Plan

None - plan executed exactly as written.

## Test Results

### Cross-Fee-Tier Tests
```
✓ bot/__tests__/detector/cross-fee-tier.test.ts (6 tests) 3ms
  ✓ cross-fee-tier pair (0.05% buy + 0.3% sell) has lower cost floor
  ✓ cross-fee-tier cost floor is approximately 0.35%
  ✓ same-tier cost floor is approximately 0.60%
  ✓ PriceMonitor pairKey groups cross-fee-tier pools together
  ✓ buildSwapPath includes feeTier on each step
  ✓ getSwapFeeRate returns correct rates for different fee tiers
```

### Full Test Suite
```
Test Files  21 passed (21)
Tests       474 passed (474)
Duration    2.54s
```

**No regressions** - all existing tests pass.

### TypeScript Type-Checking
```
pnpm exec tsc --noEmit
✓ No type errors
```

## Files Changed

### Created
- `bot/__tests__/detector/cross-fee-tier.test.ts` (318 lines)

### Modified
- `bot/src/run-arb-mainnet.ts` (+14 lines)

## Commits

- `561b926` - test(05-02): add cross-fee-tier routing tests
- `1b04953` - feat(05-02): add fee-tier visibility to dry-run output

## Impact

**Before:** OpportunityDetector had cross-tier routing logic but no validation. Dry-run output showed pool labels but not fee tier details.

**After:** 6 tests prove cross-tier routing produces measurably lower cost floors. Dry-run output shows per-step fee rates and combined cost floor, making cross-tier routing visible to operators.

**Enables:** Operators can now:
1. Verify cross-tier routing is working as intended
2. Understand cost floor composition at a glance
3. Distinguish between cross-tier (0.35%) and same-tier (0.60%) opportunities
4. Validate that buy-side fee optimization is active

## Next Steps

Phase 05 complete. Cross-fee-tier routing proven and visible.

**Phase 06: Multi-DEX Coverage** will expand pool config to include SushiSwap V3, Ramses, and Trader Joe pools for cross-DEX arbitrage.

## Self-Check: PASSED

**File existence:**
```bash
FOUND: bot/__tests__/detector/cross-fee-tier.test.ts
FOUND: bot/src/run-arb-mainnet.ts
```

**Commit existence:**
```bash
FOUND: 561b926
FOUND: 1b04953
```

**Test execution:**
```bash
✓ 6/6 cross-fee-tier tests passing
✓ 474/474 total tests passing
```

**Type-checking:**
```bash
✓ pnpm exec tsc --noEmit (no errors)
```

All verification checks passed.
