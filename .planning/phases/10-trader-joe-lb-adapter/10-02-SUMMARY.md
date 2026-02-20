# Plan 10-02 Summary: Bot-Side LB Price Reading

**Status:** ✅ COMPLETE
**Phase:** 10-trader-joe-lb-adapter
**Plan:** 02
**Completed:** 2026-02-20

## Objective

Add Trader Joe Liquidity Book price reading to PriceMonitor by fetching active bin IDs from LBPair contracts and converting them to normalized token prices using bin-step-based fixed-point math.

## What Was Done

### Task 1: DEXProtocol Type Extension
- Added `"traderjoe_lb"` to DEXProtocol union type in `bot/src/monitor/types.ts`
- Added optional `activeId?: number` field to PriceSnapshot interface
- Added traderjoe_lb to fullAdapterMap in `bot/src/index.ts` (zero address placeholder until phase 10-01 completes)
- ✅ TypeScript compiles without errors

### Task 2: PriceMonitor LB Price Reading
- Added TRADER_JOE_LB_PAIR_ABI with `getActiveId() view returns (uint24 activeId)`
- Extended `getCallDataForPool()` to encode `getActiveId()` for traderjoe_lb pools
- Extended `decodePriceFromResult()` to decode activeId and convert to price
- Added `fetchLBPrice()` helper for direct contract calls
- Added `calculateLBPrice()` method with bin-to-price conversion:
  - Formula: `price = (1 + binStep/10000)^(activeId - 2^23) * 10^(decimals0 - decimals1)`
  - Uses `Math.exp()` and `Math.log()` to avoid BigInt overflow
  - Validates `feeTier` (binStep) presence and throws descriptive error if missing
- Extended `fetchPrice()` to route LB pools to `fetchLBPrice()`
- Updated `pollMulticall()` to include activeId in snapshots
- ✅ All existing PriceMonitor tests still pass (540 tests)

### Task 3: Test Coverage
- Created `bot/__tests__/monitor/traderjoe-lb-prices.test.ts`
- **4 passing unit tests:**
  1. Bin-to-price conversion at anchor point (activeId = 2^23 → price = 1.0)
  2. Decimal adjustment for different token pairs (18/6, 6/18)
  3. BinStep variations (15, 25, 100 basis points)
  4. FeeTier validation (throws if undefined)
- **3 skipped integration tests** (pending pool address discovery):
  1. Read active bin ID from real LB pool
  2. Calculate price from active bin ID (range check for WETH/USDC)
  3. Emit priceUpdate event with activeId
- ✅ All LB tests pass: `pnpm test -- --run bot/__tests__/monitor/traderjoe-lb-prices.test.ts`

## Files Modified

| File | Changes | Lines |
|------|---------|-------|
| `bot/src/monitor/types.ts` | Added "traderjoe_lb" to DEXProtocol, added activeId field to PriceSnapshot | +2 |
| `bot/src/index.ts` | Added traderjoe_lb to fullAdapterMap (zero address placeholder) | +1 |
| `bot/src/monitor/PriceMonitor.ts` | Added LB price reading (ABI, helpers, calculateLBPrice) | +83 |
| `bot/__tests__/monitor/traderjoe-lb-prices.test.ts` | New test file with 4 passing unit tests, 3 skipped integration tests | +142 |

**Total:** 4 files, +228 lines

## Commits

1. `02bbfed` - feat(10-02): add traderjoe_lb to DEXProtocol type union
2. `867a12d` - feat(10-02): implement Trader Joe LB price reading in PriceMonitor
3. `5b40c1e` - test(10-02): add Trader Joe LB price reading tests

## Verification

- ✅ `pnpm exec tsc --noEmit` — no type errors
- ✅ `pnpm test -- --run` — 540 tests passing (existing tests unaffected)
- ✅ `pnpm test -- --run bot/__tests__/monitor/traderjoe-lb-prices.test.ts` — 4/4 unit tests passing
- ✅ DEXProtocol type includes "traderjoe_lb"
- ✅ PriceMonitor.calculateLBPrice() exists and uses correct bin math
- ✅ PriceSnapshot type includes optional activeId field

## Success Criteria Met

✅ Bot reads Trader Joe LBPair active bin prices via getActiveId() and converts bin IDs to normalized prices
✅ PriceMonitor handles 'traderjoe_lb' DEX protocol type distinct from 'uniswap_v3'
✅ Bin-to-price conversion uses correct fixed-point math: price = (1 + binStep/10000)^(activeId - 2^23)
✅ All tests pass including bin-to-price conversion validation

## Integration Notes

- **Depends on Phase 10-01** (on-chain adapter) for:
  - Real LBPair pool addresses on Arbitrum
  - Deployed TraderJoeLBAdapter contract address
  - Integration test activation (currently 3 tests skipped pending pool discovery)
- **No file conflicts** with phase 10-01 (separate bot/contracts directories)
- **Next steps:**
  1. Discover real LB pool addresses via `cast call` on LBFactory
  2. Unskip integration tests and verify against live pools
  3. Add LB pools to `bot/src/config/chains/pools/arbitrum-mainnet.ts`
  4. Wire up TraderJoeLBAdapter address in fullAdapterMap (replace zero address)

## Technical Highlights

**Bin-to-price conversion formula:**
```typescript
price = (1 + binStep/10000)^(activeId - 2^23) * 10^(decimals0 - decimals1)
```

**Implementation uses logarithms to avoid overflow:**
```typescript
const priceRatio = Math.exp(exponent * Math.log(1 + binStepDecimal));
```

**Key constants:**
- PRICE_ANCHOR = 2^23 = 8388608 (center point where price = 1:1)
- activeId > 8388608 → price shifted toward token1 (more token0 per token1)
- activeId < 8388608 → price shifted toward token0 (less token0 per token1)

**Error handling:**
- Validates feeTier (binStep) presence for traderjoe_lb pools
- Throws descriptive error: `"Trader Joe LB pool ${label} missing feeTier (binStep)"`
- Follows existing PriceMonitor error patterns (emit "error" event, mark stale after retries)

## Known Limitations

1. **Pool address discovery blocked:** Need authenticated Arbitrum mainnet RPC URL to call LBFactory.getLBPairInformation()
2. **Integration tests skipped:** 3 tests require real LB pool (marked with `.skip()`)
3. **Zero address adapter:** fullAdapterMap has zero address for traderjoe_lb until phase 10-01 deploys adapter

## Next Plan

Phase 10-01 (on-chain adapter) is running in parallel. After both complete:
- Merge both branches
- Discover real LB pool addresses
- Unskip integration tests
- Add LB pools to Arbitrum config
- Update fullAdapterMap with deployed adapter address

---

**Plan 10-02 execution complete. All must-haves validated. Ready for integration with phase 10-01.**
