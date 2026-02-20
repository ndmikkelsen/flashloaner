---
phase: 05-cross-fee-tier-routing
plan: 01
subsystem: pool-config
tags: [pool-discovery, cross-fee-tier, test-coverage]
dependency_graph:
  requires: [ROUTE-03, ROUTE-01]
  provides: [ROUTE-04]
  affects: [bot/src/config/chains/pools/arbitrum-mainnet.ts, bot/__tests__/config/arbitrum-pools.test.ts]
tech_stack:
  added: []
  patterns: [cross-fee-tier routing, on-chain pool discovery, pool coverage validation]
key_files:
  created:
    - bot/__tests__/config/arbitrum-pools.test.ts
  modified:
    - bot/src/config/chains/pools/arbitrum-mainnet.ts
decisions:
  - Added WETH/USDT UniV3 0.3% pool for cross-fee-tier coverage
  - Added LINK/WETH UniV3 0.05% pool for cross-fee-tier coverage
  - All pools verified on-chain for correct token ordering and non-zero liquidity
  - Test suite validates cross-fee-tier coverage for all 5 major pairs
metrics:
  duration: 149s
  completed: 2026-02-20T15:21:13Z
  tasks: 2
  files: 2
  pools_added: 2
  tests_added: 8
---

# Phase 05 Plan 01: Cross-Fee-Tier Pool Discovery Summary

**One-liner:** Added UniV3 0.3% WETH/USDT and 0.05% LINK/WETH pools, bringing all 5 major pairs to cross-fee-tier coverage (24 total pools, 8 validation tests).

## Objective

Expand the Arbitrum mainnet pool config so all 5 major token pairs have cross-fee-tier coverage, enabling sub-0.60% cost floor opportunities through fee-tier routing.

## What Was Built

### Pool Additions (2 pools)

1. **WETH/USDT UniV3 (0.3%)** - `0xc82819F72A9e77E2c0c3A69B3196478f44303cf4`
   - Verified token0: WETH (`0x82af...`), token1: USDT (`0xfd08...`)
   - Liquidity: 64.6 trillion wei (non-zero)
   - Completes cross-fee-tier coverage for WETH/USDT (0.05% + 0.3%)

2. **LINK/WETH UniV3 (0.05%)** - `0x91308bC9Ce8Ca2db82aA30C65619856cC939d907`
   - Verified token0: WETH (`0x82af...`), token1: LINK (`0xf97f...`)
   - Liquidity: 7.13 quintillion wei (non-zero)
   - Adds low-fee tier to LINK/WETH (existing 0.3% UniV3 + SushiV3)

### Test Coverage (8 tests)

Created `bot/__tests__/config/arbitrum-pools.test.ts`:

1. All 5 major pairs have 2+ pools
2. WETH/USDC cross-fee-tier coverage
3. WETH/USDT cross-fee-tier coverage
4. ARB/WETH cross-fee-tier or cross-DEX
5. LINK/WETH cross-fee-tier or cross-DEX
6. GMX/WETH cross-fee-tier coverage
7. Token ordering validation (token0 < token1)
8. Pool address hex validation

## Cross-Fee-Tier Coverage Matrix

| Pair | Fee Tiers | DEXes | Cross-Fee ✓ |
|------|-----------|-------|-------------|
| WETH/USDC | 0.05%, 0.3% | UniV3 | ✓ |
| WETH/USDT | 0.05%, 0.3% | UniV3 | ✓ |
| ARB/WETH | 0.05%, 0.3%, v2 | UniV3, SushiV3, SushiV2 | ✓ |
| LINK/WETH | 0.05%, 0.3% | UniV3, SushiV3 | ✓ |
| GMX/WETH | 0.05%, 1% | UniV3 | ✓ |

**Result:** All 5 major pairs now support cross-fee-tier routing for sub-0.60% cost floor detection.

## On-Chain Discovery Method

Used Uniswap V3 factory `getPool(token0, token1, feeTier)` via `cast`:

```bash
# WETH/USDT 0.3%
cast call 0x1F98431c8aD98523631AE4a59f267346ea31F984 \
  "getPool(address,address,uint24)(address)" \
  0x82af49447d8a07e3bd95bd0d56f35241523fbab1 \
  0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9 3000

# LINK/WETH 0.05%
cast call 0x1F98431c8aD98523631AE4a59f267346ea31F984 \
  "getPool(address,address,uint24)(address)" \
  0x82af49447d8a07e3bd95bd0d56f35241523fbab1 \
  0xf97f4df75117a78c1a5a0dbb814af92458539fb4 500
```

Each pool verified for:
- Non-zero address (`0x0000...` = pool doesn't exist)
- Correct token0/token1 ordering via `token0()` and `token1()` calls
- Non-zero liquidity via `liquidity()` call

## Deviations from Plan

None - plan executed exactly as written.

## Test Results

### Pool Coverage Tests
```
✓ bot/__tests__/config/arbitrum-pools.test.ts (8 tests) 3ms
```

### Full Test Suite
```
Test Files  20 passed (20)
Tests       468 passed (468)
Duration    2.51s
```

**No regressions** - all existing tests pass.

## Files Changed

### Created
- `bot/__tests__/config/arbitrum-pools.test.ts` (167 lines)

### Modified
- `bot/src/config/chains/pools/arbitrum-mainnet.ts` (+22 lines)

## Commits

- `2b1f468` - feat(05-01): add cross-fee-tier pools for WETH/USDT and LINK/WETH
- `1428c17` - test(05-01): add pool coverage validation tests

## Impact

**Before:** 22 pools, WETH/USDT and LINK/WETH had single fee tiers (limited routing options)

**After:** 24 pools, all 5 major pairs have cross-fee-tier coverage (enables fee-tier optimization)

**Enables:** Phase 05 Plan 02 can now implement cross-fee-tier routing logic, knowing all major pairs have the required pool infrastructure.

## Next Steps

1. Phase 05 Plan 02: Implement cross-fee-tier routing in OpportunityDetector
2. Add tests validating fee-tier selection logic
3. Measure impact on opportunity detection (expect 10-20% increase in sub-0.60% cost floor opportunities)

## Self-Check: PASSED

**File existence:**
```bash
FOUND: bot/src/config/chains/pools/arbitrum-mainnet.ts
FOUND: bot/__tests__/config/arbitrum-pools.test.ts
```

**Commit existence:**
```bash
FOUND: 2b1f468
FOUND: 1428c17
```

**Pool count verification:**
```bash
Total pools: 24 (was 22, added 2)
```

**Test execution:**
```bash
✓ 8/8 pool coverage tests passing
✓ 468/468 total tests passing
```

All verification checks passed.
