---
phase: 09-ramses-v2-adapter
plan: 02
subsystem: bot
tags: [ramses, dex-integration, price-monitoring, profit-threshold]
dependency-graph:
  requires:
    - "09-01 (ramses_v3 type in monitor/types.ts)"
    - "Phase 05 (cross-fee-tier pool config pattern)"
    - "Phase 06 (PriceMonitor with V3 price reading)"
  provides:
    - "Ramses V3 pool monitoring via slot0()"
    - "2x profit threshold for Ramses opportunities"
    - "Cross-DEX arbitrage detection with Ramses pools"
  affects:
    - "PriceMonitor (V3 pool type detection, calldata encoding/decoding)"
    - "OpportunityDetector (profit threshold multiplier logic)"
    - "arbitrum-mainnet.ts pool config (2 new Ramses V3 pools)"
tech-stack:
  added: []
  patterns:
    - "V3 interface reuse (Ramses uses Uniswap V3 slot0() ABI)"
    - "Risk-based profit threshold multipliers"
    - "Placeholder pool addresses with TODO verification notes"
key-files:
  created:
    - bot/__tests__/monitor/ramses-price.test.ts
  modified:
    - bot/src/config/chains/pools/arbitrum-mainnet.ts
    - bot/src/monitor/PriceMonitor.ts
    - bot/src/detector/OpportunityDetector.ts
decisions:
  - title: "Placeholder pool addresses for sandbox execution"
    rationale: "RPC access unavailable in sandbox; pool addresses require on-chain verification via Ramses Factory getPool() call"
    outcome: "Added 2 pools with zero addresses and TODO comments documenting verification command"
  - title: "Auto-fix PriceMonitor calldata/decode paths for ramses_v3"
    rationale: "Tests revealed ramses_v3 was falling through to V2 path; needed explicit handling in getCallDataForPool(), decodePriceFromResult(), and fetchPrice()"
    outcome: "Applied Deviation Rule 1 (auto-fix bugs) - added ramses_v3 to 4 conditional checks for V3 pool handling"
metrics:
  duration: 288s
  tasks: 4
  files: 4
  commits: 4
  tests_added: 10
  tests_passing: 540
  completed: 2026-02-20
---

# Phase 09 Plan 02: Ramses V3 Pool Integration & Profit Threshold Summary

**One-liner:** Integrated Ramses V3 CL pools into bot monitoring with slot0() price reading and 2x profit threshold to mitigate fee manipulation risk

## What Was Built

**Bot monitors Ramses V3 pools and applies 2x profit threshold to all Ramses opportunities**

1. **Pool Configuration (Task 1):** Added 2 Ramses V3 CL pool entries to `arbitrum-mainnet.ts`:
   - WETH/USDC Ramses V3 0.05% (cross-DEX pairing with UniV3 0.05% and 0.3%)
   - WETH/USDT Ramses V3 0.05% (cross-DEX pairing with UniV3 0.05% and 0.3%)
   - Pool addresses are placeholders (zero address) requiring on-chain verification via Ramses Factory
   - Token ordering verified (WETH lower hex = token0)

2. **Price Monitoring (Task 2):** Updated `PriceMonitor.isV3Pool()` to recognize `ramses_v3` as V3 pool type:
   - Ramses V3 pools now included in liquidity fetch batch
   - Ramses V3 pools use slot0() price reading (same interface as Uniswap V3)

3. **Profit Threshold (Task 3):** Added 2x minimum profit threshold for Ramses opportunities in `OpportunityDetector`:
   - Created `involvesRamses()` helper to detect Ramses on buy or sell side
   - Applied 2x threshold multiplier (0.02 instead of 0.01) in `analyzeDelta()` and `analyzeDeltaAsync()`
   - Rejection messages clearly indicate higher Ramses threshold: `"below threshold 0.02 (2x for Ramses)"`

4. **Testing (Task 4):** Created `ramses-price.test.ts` with 10 test cases:
   - V3 pool type detection validates `ramses_v3` identified as V3
   - slot0() calldata generation validated
   - Price calculation from sqrtPriceX96 validated
   - `involvesRamses()` helper logic validated (buy side, sell side, no Ramses)
   - 2x profit threshold application validated

**Auto-fixes applied (Deviation Rule 1 - Bug Fixes):**
- Added `ramses_v3` to `getCallDataForPool()` V3 condition (was falling through to V2 getReserves)
- Added `ramses_v3` to `decodePriceFromResult()` V3 condition (was decoding as V2 reserves)
- Added `ramses_v3` to `fetchPrice()` V3 condition (was calling fetchV2Price instead of fetchV3Price)

**Total impact:** 4 files modified, 10 tests added, 540 tests passing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Ramses V3 pools fell through to V2 calldata path**
- **Found during:** Task 4 test execution
- **Issue:** Test revealed `getCallDataForPool()` returned V2 getReserves() selector instead of V3 slot0() selector for ramses_v3 pools
- **Root cause:** `ramses_v3` was only added to `isV3Pool()` but not to the explicit checks in `getCallDataForPool()`, `decodePriceFromResult()`, and `fetchPrice()`
- **Fix:** Added `ramses_v3` to 4 conditional checks in PriceMonitor.ts:
  - Line 277: `getCallDataForPool()` - encode slot0() calldata
  - Line 300: `decodePriceFromResult()` - decode slot0() return data
  - Line 320: `isV3Pool()` - identify as V3 pool type
  - Line 336: `fetchPrice()` - call fetchV3Price() instead of fetchV2Price()
- **Files modified:** `bot/src/monitor/PriceMonitor.ts`
- **Commit:** 7961a3a (combined with Task 4 test file)
- **Why auto-fixed:** This was a blocking bug preventing correct price reading for Ramses pools. Without the fix, the bot would attempt to call getReserves() on a V3 pool (which doesn't have that function), causing RPC errors. Rule 1 applies: code didn't work as intended, fix was straightforward and low-risk.

## Key Decisions

**1. Placeholder pool addresses for sandbox execution**
- **Context:** RPC access unavailable in Claude Code sandbox environment
- **Decision:** Used zero address (`0x0000...0000`) as placeholder with TODO comments
- **Rationale:** Plan anticipated this scenario and provided exact `cast` commands for verification:
  ```bash
  cast call 0xd0019e86edB35E1fedaaB03aED5c3c60f115d28b \
    "getPool(address,address,uint24)(address)" \
    0x82af49447d8a07e3bd95bd0d56f35241523fbab1 \
    0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8 \
    500 --rpc-url $ARBITRUM_RPC_URL
  ```
- **Impact:** Pool config is valid but requires on-chain verification before mainnet use
- **Next step:** User must run verification commands to replace placeholders with real addresses

**2. 2x profit threshold rationale**
- **Risk:** Ramses V3 has documented insider fee manipulation where privileged accounts can set zero fees
- **Mitigation:** 2x threshold (0.02 instead of 0.01) ensures bot only executes Ramses trades with genuinely large spreads
- **Trade-off:** May miss smaller opportunities, but prevents false positives from manipulated spreads
- **Outcome:** Conservative approach prioritizes safety over opportunity count

## Testing

**Test coverage:**
- 10 new tests in `ramses-price.test.ts`
- All existing tests pass (540 total)
- Test categories:
  - V3 pool type detection (2 tests)
  - V3 price calculation (2 tests)
  - fetchPrice integration (1 test)
  - involvesRamses helper logic (3 tests)
  - 2x threshold application (2 tests)

**Verification commands executed:**
```bash
# TypeScript compilation
pnpm exec tsc --noEmit  # ✓ PASSED

# Ramses pool count
grep -c '"ramses_v3"' bot/src/config/chains/pools/arbitrum-mainnet.ts  # ✓ 2 pools

# PriceMonitor integration
grep 'ramses_v3' bot/src/monitor/PriceMonitor.ts  # ✓ 4 occurrences

# Profit threshold messages
grep '2x for Ramses' bot/src/detector/OpportunityDetector.ts  # ✓ 2 occurrences

# Test suite
pnpm test  # ✓ 540 tests passing (3 unhandled rejections from localhost:8545 connection - expected)
```

## Commits

| Commit | Message | Files |
|--------|---------|-------|
| 7028fd3 | feat(09-02): add Ramses V3 pool entries to Arbitrum config | arbitrum-mainnet.ts |
| f948e11 | feat(09-02): update PriceMonitor to recognize ramses_v3 as V3 pool | PriceMonitor.ts |
| 9504723 | feat(09-02): add 2x profit threshold for Ramses opportunities | OpportunityDetector.ts |
| 7961a3a | test(09-02): add Ramses V3 price reading and profit threshold tests | ramses-price.test.ts, PriceMonitor.ts |

## Performance

- **Duration:** 288 seconds (4.8 minutes)
- **Tasks completed:** 4/4
- **Files modified:** 4
- **Tests added:** 10
- **Tests passing:** 540

## Next Steps

**Immediate (before mainnet use):**
1. Verify Ramses V3 pool addresses via `cast call` to Ramses Factory (see TODO comments in arbitrum-mainnet.ts)
2. Replace placeholder addresses with real on-chain pool addresses
3. Verify pools have non-zero liquidity via `cast call <POOL> "liquidity()(uint128)"`
4. Run dry-run to confirm Ramses pools are monitored and 2x threshold applies

**Phase 9 continuation:**
- Plan 09-02 COMPLETE ✓
- Phase 9 status: 2/2 plans complete
- Next: Phase 10 (Trader Joe V2.1 LB Adapter) or milestone review

## Self-Check: PASSED

**Created files:**
```bash
[ -f "bot/__tests__/monitor/ramses-price.test.ts" ] && echo "FOUND"  # ✓ FOUND
```

**Commits:**
```bash
git log --oneline --all | grep -q "7028fd3" && echo "FOUND"  # ✓ FOUND
git log --oneline --all | grep -q "f948e11" && echo "FOUND"  # ✓ FOUND
git log --oneline --all | grep -q "9504723" && echo "FOUND"  # ✓ FOUND
git log --oneline --all | grep -q "7961a3a" && echo "FOUND"  # ✓ FOUND
```

**Modified files compile:**
```bash
pnpm exec tsc --noEmit  # ✓ PASSED
```

**Tests pass:**
```bash
pnpm test -- --run bot/__tests__/monitor/ramses-price.test.ts  # ✓ 10/10 PASSED
pnpm test  # ✓ 540 tests PASSED
```

All self-checks passed. Plan execution complete.
