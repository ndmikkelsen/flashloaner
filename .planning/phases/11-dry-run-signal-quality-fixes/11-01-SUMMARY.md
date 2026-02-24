---
phase: 11-dry-run-signal-quality-fixes
plan: 01
status: complete
started: 2026-02-21
completed: 2026-02-21
---

# 11-01 Summary: Per-DEX Input Cap and Reserve Cap Fix

## Objective

Fix two critical signal quality issues from the 6.5-hour dry-run:
1. TJ LB pools with no reserve data allowing absurd 500 ETH inputs
2. `computeReserveCap()` ignoring unknown steps, returning huge caps

## What Changed

### `bot/src/detector/types.ts`
- Added `maxInputByDex?: Partial<Record<DEXProtocol, number>>` to `OpportunityDetectorConfig`

### `bot/src/detector/OpportunityDetector.ts`
- Added `maxInputByDex` class field with default `traderjoe_lb: 5` (conservative cap for bin-based pools)
- Added `getDexInputCap(path)` private method: returns minimum per-DEX cap across all steps in a path
- Modified `computeReserveCap(path)`: now tracks `hasUnknownStep` flag; when any step lacks reserve data, uses per-DEX cap as conservative bound instead of ignoring the unknown step
- Applied per-DEX cap in both `analyzeDelta()` and `analyzeDeltaAsync()` after the optimization/fallback block

### `bot/__tests__/detector/OpportunityDetector.test.ts`
Added 5 new tests in two describe blocks:

**signal quality: per-DEX input cap**
1. TJ LB opportunities capped at default 5 ETH (not 100 ETH defaultInputAmount)
2. Non-LB pools with reserve data NOT capped (optimizer finds size > 5)
3. Custom `maxInputByDex: { traderjoe_lb: 2 }` override respected

**signal quality: computeReserveCap with unknown steps**
4. Mixed path (V3 with reserves + TJ LB without) returns conservative 5 ETH cap instead of 30% of deep V3 reserve
5. Both steps with reserves preserves original 30% reserve cap behavior

## Verification

| Check | Result |
|-------|--------|
| `pnpm exec tsc --noEmit` | Pass (no type errors) |
| Detector tests (42) | 42 passed |
| Full TS suite (564) | 564 passed, 8 skipped |
| Solidity tests (342) | 342 passed, 29 skipped |

## Key Behaviors

- **Before fix**: TJ LB path with `defaultInputAmount=100` would use 100 ETH input into a pool with 2-20 ETH depth
- **After fix**: TJ LB path capped at 5 ETH (configurable via `maxInputByDex`)
- **Before fix**: Path with one deep V3 pool (10,000 WETH) and one TJ LB pool (no data) would use `reserveCap = 10000 * 0.3 = 3000 ETH`
- **After fix**: Same path returns `reserveCap = 5` (per-DEX TJ LB cap) because the unknown TJ LB step triggers conservative bounding
