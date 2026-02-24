---
phase: 09-ramses-v2-adapter
plan: 01
subsystem: dex-integration
tags: [adapter, ramses-v3, contract, testing, type-extension]
dependency_graph:
  requires: [uniswap-v3-adapter-pattern, IDEXAdapter-interface]
  provides: [ramses-v3-adapter, ramses-v3-type]
  affects: [bot-type-system, adapter-map]
tech_stack:
  added: [RamsesV2Adapter.sol, RamsesV2AdapterTest.sol, RamsesForkTest.sol]
  patterns: [uniswap-v3-fork-pattern, mock-router-testing, fork-test-auto-skip]
key_files:
  created:
    - contracts/src/adapters/RamsesV2Adapter.sol
    - contracts/test/unit/adapters/RamsesV2Adapter.t.sol
    - contracts/test/fork/RamsesForkTest.sol
  modified:
    - bot/src/monitor/types.ts
    - bot/src/index.ts
decisions:
  - "Ramses V3 uses identical ABI to Uniswap V3, allowing direct interface reuse"
  - "Fork tests auto-skip when ARBITRUM_RPC_URL not set for CI-safety"
  - "ramses_v3 added to adapter map with zero address fallback (Phase 07 pattern)"
metrics:
  duration_seconds: 340
  tasks_completed: 4
  files_created: 3
  files_modified: 2
  tests_added: 31
  commits: 4
  completed_date: 2026-02-20
---

# Phase 09 Plan 01: Ramses V2 Adapter Summary

**One-liner:** Ramses V3 CL adapter using Uniswap V3 fork ABI with 233-line contract, 27 unit tests, 4 fork tests, and ramses_v3 type extension

## Context

Phase 09 adds Ramses V3 support to the flashloan bot. Ramses V3 is a Uniswap V3 fork deployed on Arbitrum with identical `exactInputSingle()` and `exactInput()` ABI, allowing direct reuse of the UniswapV3Adapter pattern. Plan 01 creates the on-chain adapter contract and extends the bot's type system to recognize "ramses_v3" as a valid DEX protocol.

## What Was Built

### Task 1: RamsesV2Adapter Contract (Commit: d68aa01)

Created `contracts/src/adapters/RamsesV2Adapter.sol` by copying UniswapV3Adapter structure with Ramses-specific addresses:
- SwapRouter: `0x4730e03EB4a58A5e20244062D5f9A99bCf5770a6`
- QuoterV2: `0x00d4FeA3Dd90C4480992f9c7Ea13b8a6A8F7E124`
- 233 lines implementing IDEXAdapter
- Supports single-hop and multi-hop swaps with fee tier encoding
- Identical internal logic to UniswapV3Adapter (`_swapSingle`, `_swapMultiHop`, `_encodePath`)

**Diff from UniswapV3Adapter:** <30 lines (contract name, NatSpec comments, router/quoter addresses)

### Task 2: Unit Tests for RamsesV2Adapter (Commit: dc62122)

Created `contracts/test/unit/adapters/RamsesV2Adapter.t.sol` with 27 passing tests:
- 3 constructor tests (address validation, deadline offset)
- 6 single-hop swap tests (low/medium/high fees, event emission, slippage)
- 2 multi-hop swap tests (2-hop path, path length mismatch)
- 3 getAmountOut tests (single-hop, multi-hop, quote-swap matching)
- 10 revert tests (zero token, zero amount, zero output, slippage exceeded)
- 3 fuzz tests (various amounts, all fee tiers, quote matching)

Uses mock contracts (MockSwapRouter, MockQuoterV2, MockToken) that simulate Uniswap V3 behavior with fee-dependent output rates.

### Task 3: Fork Tests for Real Ramses Pools (Commit: f5fbece)

Created `contracts/test/fork/RamsesForkTest.sol` with 4 fork tests:
- `test_RamsesV3_WETH_USDC_Swap` - Real swap through Ramses V3 0.05% pool
- `test_RamsesV3_QuoteMatchesSwap` - Verify getAmountOut matches swap execution
- `test_RamsesV3_MultiHopSwap` - Multi-hop path encoding (may skip if path unavailable)
- `test_RamsesV3_SlippageProtection` - Verify amountOutMin enforcement

Tests auto-skip when `ARBITRUM_RPC_URL` not set (CI-safe pattern from ForkTestBase).

**Note:** Fork tests compile successfully but were not run (no RPC URL in sandbox environment).

### Task 4: DEXProtocol Type Extension (Commit: 1469ea0)

Extended bot type system to support Ramses V3:
1. `bot/src/monitor/types.ts`: Added `"ramses_v3"` to `DEXProtocol` union type
2. `bot/src/index.ts`: Added `ramses_v3` to `fullAdapterMap` with zero address fallback

TypeScript compilation succeeds. All 530 existing bot tests pass.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

All verification checks passed:
1. `forge build` - Compiles without errors
2. `forge test --match-contract RamsesV2AdapterTest` - 27/27 tests passing
3. `pnpm exec tsc --noEmit` - No TypeScript errors
4. `pnpm test` - 530/530 bot tests passing
5. File existence: RamsesV2Adapter.sol (233 lines), fork test created
6. Type extension: "ramses_v3" present in types.ts

## Key Decisions

1. **Reuse Uniswap V3 interfaces:** Ramses V3 is a fork with identical ABI, so ISwapRouter and IQuoterV2 interfaces work without modification.

2. **Fork test auto-skip pattern:** Tests check for ARBITRUM_RPC_URL in setUp() and skip if unavailable, following the ForkTestBase pattern.

3. **Zero address fallback for adapter map:** Added ramses_v3 to fullAdapterMap with `?? "0x0000..."` fallback, following Phase 07 decision to fill missing DEX protocols with zero address.

## Testing Coverage

**Unit tests (27):**
- Constructor validation (3)
- Single-hop swaps (6)
- Multi-hop swaps (2)
- Quotes (3)
- Reverts (10)
- Fuzz tests (3)

**Fork tests (4):**
- Real WETH/USDC swap
- Quote matching
- Multi-hop encoding
- Slippage protection

**Bot tests:** All 530 existing tests pass with ramses_v3 type extension.

## Technical Notes

**Ramses V3 vs Uniswap V3:**
- Same factory, pool, router, quoter ABI
- Same fee tiers (100, 500, 3000, 10000)
- Same sqrtPriceX96 tick math
- Different deployment addresses on Arbitrum

**Mock router behavior:**
- Fee 500 → 99.95% output (0.05% fee)
- Fee 3000 → 99.7% output (0.3% fee)
- Fee 10000 → 99.0% output (1% fee)

**Next steps (Plan 02):**
- Add Ramses V3 pool configs to bot
- Update PriceMonitor to handle ramses_v3 protocol
- Implement 2x profit threshold gate for fee manipulation protection

## Files Changed

**Created (3):**
- `contracts/src/adapters/RamsesV2Adapter.sol` (233 lines)
- `contracts/test/unit/adapters/RamsesV2Adapter.t.sol` (523 lines)
- `contracts/test/fork/RamsesForkTest.sol` (202 lines)

**Modified (2):**
- `bot/src/monitor/types.ts` (+1 line: added "ramses_v3" to type)
- `bot/src/index.ts` (+1 line: added ramses_v3 to adapter map)

## Commits

1. `d68aa01` - feat(09-01): add RamsesV2Adapter for Ramses V3 CL swaps
2. `dc62122` - test(09-01): add unit tests for RamsesV2Adapter
3. `f5fbece` - test(09-01): add Ramses V3 fork tests for Arbitrum mainnet
4. `1469ea0` - feat(09-01): extend DEXProtocol type to include ramses_v3

## Duration

**Total:** 340 seconds (~5.7 minutes)

**Breakdown:**
- Task 1 (Contract): ~90s
- Task 2 (Unit tests): ~90s
- Task 3 (Fork tests): ~90s
- Task 4 (Type extension): ~70s

## Self-Check: PASSED

**Files exist:**
- ✓ contracts/src/adapters/RamsesV2Adapter.sol (233 lines)
- ✓ contracts/test/unit/adapters/RamsesV2Adapter.t.sol (523 lines)
- ✓ contracts/test/fork/RamsesForkTest.sol (202 lines)
- ✓ bot/src/monitor/types.ts (contains "ramses_v3")
- ✓ bot/src/index.ts (contains ramses_v3 adapter map entry)

**Commits exist:**
- ✓ d68aa01 (RamsesV2Adapter contract)
- ✓ dc62122 (Unit tests)
- ✓ f5fbece (Fork tests)
- ✓ 1469ea0 (Type extension)

**Compilation/Tests:**
- ✓ forge build succeeds
- ✓ 27/27 unit tests pass
- ✓ TypeScript compiles without errors
- ✓ 530/530 bot tests pass

All artifacts verified.
