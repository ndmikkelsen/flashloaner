---
phase: 12-contract-deployment-live-validation
plan: 01
subsystem: contracts+bot
tags: [safety, validation, zero-address, executor, deployment, arbitrum-mainnet]

# Dependency graph
requires:
  - phase: 11-dry-run-signal-quality
    provides: patched bot code ready for live deployment
  - phase: 07-live-execution-safety
    provides: three-mode architecture (dry-run/shadow/live) and adapter map pattern
provides:
  - Zero-address adapter guard in TransactionBuilder.resolveAdapter() (prevents silent on-chain reverts)
  - EXECUTOR_ADDRESS validation at startup in run-arb-mainnet.ts (prevents shadow/live with wrong contract)
  - FlashloanExecutor deployed at 0x06409bFF450b9feFD6045f4d014DC887cF898a77 on Arbitrum mainnet (chain 42161)
  - UniswapV3Adapter at 0xeeb5c0d81a27bb92c25af1d50b4a6470500404d1
  - SushiSwapV2Adapter at 0x33F5fa68839c39af84B622D997e15B5f1F671403
  - SushiSwapV3Adapter at 0x660c8222CDdD07189F6176fFE77B1fEd45AfDac8
  - TraderJoeLBAdapter at 0x47ad3b7F3048633fE67173861a8e5c07d93B0306
  - All adapters registered via registerAdapter() — 4 confirmed on-chain transactions
affects:
  - "12-02-shadow-mode-validation"
  - "12-03-live-trading-activation"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Zero-address guard pattern: throw on zero address in resolveAdapter() instead of propagating bad address"
    - "Startup validation: exit with clear error message before entering shadow/live mode"
    - "Forge deployment script with --slow flag for sequential mainnet transactions"
    - "Arbiscan source verification via --verify --etherscan-api-key flags"

key-files:
  created:
    - deployments/42161.json
    - broadcast/Deploy.s.sol/42161/run-latest.json
  modified:
    - bot/src/builder/TransactionBuilder.ts
    - bot/src/run-arb-mainnet.ts

key-decisions:
  - "Throw on zero-address adapter in resolveAdapter() — caught by opportunityFound try/catch, opportunity silently skipped"
  - "EXECUTOR_ADDRESS guard placed after wallet balance check, before executionConfig construction — dry-run mode unaffected"
  - "Pre-existing TS error in PriceMonitor.ts (WebSocketLike type) and shadow-mode integration test failures are out-of-scope (no local node)"
  - "botWallet (0xdC9dAdb34431ee268fE4B13352E1E09B75D799BD) is separate from deployer/owner (0x8d7a596F...) — correct role separation"
  - "7 contracts deployed + 4 adapter registration calls = 11 total transactions, all status=0x1 on Arbitrum mainnet"

patterns-established:
  - "Safety guard at startup: validate critical env vars before entering live modes"
  - "Filterable errors: throw with descriptive message so bot logs the skip reason"
  - "Forge --slow flag: wait for each mainnet transaction to mine before sending the next"

requirements-completed: [EXEC-01, EXEC-02]

# Metrics
duration: ~30min (across two sessions)
completed: 2026-02-25
---

# Phase 12 Plan 01: Contract Deployment Summary

**Two bot safety patches + full FlashloanExecutor and DEX adapter deployment to Arbitrum mainnet — all 11 transactions confirmed, addresses in deployments/42161.json**

## Performance

- **Duration:** ~30 min (split across two sessions)
- **Started:** 2026-02-25T22:31:27Z
- **Completed:** 2026-02-25
- **Tasks:** 3 of 3 complete
- **Files modified:** 4 (2 bot code, 2 deployment artifacts)

## Accomplishments

### Task 1: Bot Safety Patches
- `TransactionBuilder.resolveAdapter()` now throws a descriptive error when the resolved adapter address is `0x0000000000000000000000000000000000000000`, preventing Camelot/undeployed-adapter opportunities from reaching the chain and reverting with `AdapterNotApproved(address(0))`
- `run-arb-mainnet.ts` now exits immediately with a clear error message if `EXECUTOR_ADDRESS` is unset or zero when entering shadow or live mode, preventing transactions being sent to the wrong contract

### Task 2: Environment Verified
- Direnv loaded all env vars from 1Password `flashloaner-bot` item (`.env.arbitrum-mainnet` attachment)
- Deployer wallet funded with sufficient ETH on Arbitrum mainnet

### Task 3: Mainnet Deployment
7 contracts deployed, 4 adapter registrations — all 11 transactions `status=0x1`:

| Contract | Address |
|----------|---------|
| FlashloanExecutor | `0x06409bFF450b9feFD6045f4d014DC887cF898a77` |
| CircuitBreaker | `0x349F680744AD406a42F25381EFce3e8BE52f5598` |
| ProfitValidator | `0x5c0Ecf6DBB806a636121f0a3f670E4f7aC13A667` |
| UniswapV3Adapter | `0xeeb5c0d81a27bb92c25af1d50b4a6470500404d1` |
| SushiSwapV2Adapter | `0x33F5fa68839c39af84B622D997e15B5f1F671403` |
| SushiSwapV3Adapter | `0x660c8222CDdD07189F6176fFE77B1fEd45AfDac8` |
| TraderJoeLBAdapter | `0x47ad3b7F3048633fE67173861a8e5c07d93B0306` |

Deployment parameters:
- `owner`: `0x8d7a596F072e462E7b018747e62EC8eB01191a18` (deployer)
- `botWallet`: `0xdC9dAdb34431ee268fE4B13352E1E09B75D799BD` (execution wallet)
- `minProfit`: `0.01 ETH`
- `aavePool`: `0x794a61358D6845594F94dc1DB02A252b5b4814aD` (Aave V3 Arbitrum)
- `balancerVault`: `0xBA12222222228d8Ba445958a75a0704d566BF2C8`
- UniswapV2Adapter skipped (Uniswap V2 not on Arbitrum — correct)

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `dad8360` | fix(12-01): patch zero-address adapter guard and EXECUTOR_ADDRESS validation |
| 2 | — | human-action checkpoint (env vars + wallet funding via direnv/1Password) |
| 3 | `d5a99ef` | feat: v1.1 Mainnet Profitability — deployment artifacts committed |

## Files Created/Modified

- `bot/src/builder/TransactionBuilder.ts` — Added `ZERO_ADDRESS` static constant and zero-address guard in `resolveAdapter()`
- `bot/src/run-arb-mainnet.ts` — Added `EXECUTOR_ADDRESS` validation block after wallet balance check
- `deployments/42161.json` — All 7 deployed contract addresses on Arbitrum mainnet
- `broadcast/Deploy.s.sol/42161/run-latest.json` — 11 transaction hashes with confirmed receipts

## Decisions Made

1. **Throw on zero-address adapter**: error is caught by the existing `opportunityFound` try/catch in `bot/src/index.ts`, which logs and skips — no additional changes needed in index.ts
2. **Guard placement**: inside `if (shadowMode || liveMode)` block after the balance check — dry-run mode unaffected
3. **botWallet vs owner**: `0xdC9dAdb...` is the dedicated bot execution wallet (separate from deployer `0x8d7a596F...`) — correct role separation in FlashloanExecutor constructor
4. **UniswapV2 skipped**: `UNISWAP_V2_ROUTER` intentionally absent — Uniswap V2 never deployed on Arbitrum, script skips gracefully

## Deviations from Plan

None — all three tasks executed as written. Deployment artifacts were created from a prior session and are committed.

## Issues Encountered

- Pre-existing `PriceMonitor.ts` TS type error (WebSocketLike `.on` type mismatch) — out of scope, logged
- Pre-existing `shadow-mode.test.ts` 2 test failures — require local Anvil node, out of scope

## Self-Check: PASSED

- [x] `deployments/42161.json` exists with non-zero FlashloanExecutor address
- [x] `broadcast/Deploy.s.sol/42161/run-latest.json` exists with 11 transaction receipts all `status=0x1`
- [x] Commit `dad8360` exists (Task 1 code patches)
- [x] Commit `d5a99ef` exists (deployment artifacts)
- [x] Working tree clean — all artifacts committed

---
*Phase: 12-contract-deployment-live-validation | Plan: 01 | Completed: 2026-02-25*
