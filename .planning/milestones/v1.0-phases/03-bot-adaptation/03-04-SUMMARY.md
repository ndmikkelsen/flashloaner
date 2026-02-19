---
phase: 03-bot-adaptation
plan: "04"
subsystem: bot-config
tags: [pool-discovery, uniswap-v3, arbitrum-sepolia, gap-closure]
dependency_graph:
  requires:
    - "03-01: Arbitrum Sepolia chain config and pool stubs"
  provides:
    - "Real pool addresses for WETH/USDC on Arbitrum Sepolia"
    - "Valid USDC token address in chain config"
  affects:
    - "bot/src/config/chains/pools/arbitrum-sepolia.ts"
    - "bot/src/config/chains/arbitrum-sepolia.ts"
tech_stack:
  added: []
  patterns:
    - "cast call for on-chain factory queries (getPool)"
    - "Aave testnet USDC as canonical USDC on Arbitrum Sepolia"
key_files:
  created: []
  modified:
    - "bot/src/config/chains/pools/arbitrum-sepolia.ts"
    - "bot/src/config/chains/arbitrum-sepolia.ts"
decisions:
  - "WETH/USDC 0.3% and 1% pools selected (highest liquidity); 0.05% pool excluded (liquidity: 122)"
  - "Aave testnet USDC (0x75faf1...4d) confirmed as canonical USDC on Arbitrum Sepolia"
  - "USDT entry removed from tokens config — no canonical testnet address found"
metrics:
  duration: "1 minute"
  completed: "2026-02-17"
  tasks_completed: 1
  files_modified: 2
---

# Phase 3 Plan 4: Pool Address Discovery Summary

**One-liner:** Replaced TBD_DISCOVER_ON_CHAIN placeholders with real WETH/USDC Uniswap V3 pool addresses discovered via cast call on Arbitrum Sepolia factory.

## What Was Done

Queried the Uniswap V3 factory at `0x248AB79Bbb9bC29bB72f7Cd42F17e054Fc40188e` on Arbitrum Sepolia using `cast call` with the factory's `getPool(address,address,uint24)` function. Found three WETH/USDC pools. Selected the two with meaningful liquidity for monitoring. Updated both the pool config file and the chain config token addresses.

## Task Summary

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Discover pool addresses and update pool config | 7e5eaa5 | bot/src/config/chains/pools/arbitrum-sepolia.ts, bot/src/config/chains/arbitrum-sepolia.ts |

## Pool Discovery Results

| Token Pair | Fee | Pool Address | Liquidity at Discovery |
|------------|-----|--------------|------------------------|
| WETH/USDC  | 0.05% | 0x6F112d524DC998381C09b4e53C7e5e2cc260f877 | 122 (excluded — negligible) |
| WETH/USDC  | 0.3% | 0x66EEAB70aC52459Dd74C6AD50D578Ef76a441bbf | 4.575e10 (included) |
| WETH/USDC  | 1%   | 0x3eCedaB7E9479E29B694d8590dc34e0Ce6059868 | 3.225e12 (included) |

Token discovery:
- USDC: `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` (Aave testnet USDC, 6 decimals — confirmed via `cast call decimals()`)
- USDT: No canonical testnet address found — entry removed from tokens config

## Changes Made

### `bot/src/config/chains/pools/arbitrum-sepolia.ts`
- Replaced both `poolAddress: "TBD_DISCOVER_ON_CHAIN"` entries with real pool addresses
- Replaced `token1: "0x0000000000000000000000000000000000000001"` with `USDC_ARB_SEPOLIA = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d"`
- Updated `decimals1` from 18 to 6 (USDC has 6 decimals)
- Updated labels from `WETH/UNI-*` to `WETH/USDC-*` (correct token pair)
- Updated `feeTier` from 3000 to 10000 for second pool (1% fee tier)
- Added discovery documentation in header comment block

### `bot/src/config/chains/arbitrum-sepolia.ts`
- Updated `USDC` token from `0x000...000` (zero-address placeholder) to `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`
- Removed `USDT` token entry (no canonical Arbitrum Sepolia testnet address; zero-address placeholder removed entirely)

## Verification Results

| Check | Result |
|-------|--------|
| Zero `TBD_DISCOVER_ON_CHAIN` strings in pool config | PASSED (grep count: 0) |
| Zero `0x...0001` fake token addresses in pool config | PASSED (grep count: 0) |
| Zero zero-address placeholders in chain config tokens | PASSED (grep count: 0) |
| Pool addresses match `/^0x[0-9a-fA-F]{40}$/` | PASSED (2 valid addresses) |
| TypeScript compilation (`npx tsc --noEmit`) | PASSED (no errors) |
| All tests (`pnpm test`) | PASSED (450/450) |

## Gap Closure Assessment

The gap from Phase 3 verification (SC-3 partial, SC-5 partial) is now addressed:

- **Before:** Both pool entries had `poolAddress: "TBD_DISCOVER_ON_CHAIN"` — PriceMonitor would error on every RPC call
- **After:** Both pool entries have real Ethereum addresses with confirmed on-chain liquidity — PriceMonitor can now fetch prices

SC-3 (opportunity detection) is now unblocked at the config level. SC-5 (dry-run reporting) is also unblocked since it depends on SC-3. Live verification still requires an RPC endpoint and is noted as a human verification step in `03-VERIFICATION.md`.

## Decisions Made

1. **Selected 0.3% and 1% fee pools** — The 0.05% pool had only 122 liquidity units (negligible), while 0.3% had 4.575e10 and 1% had 3.225e12. Including pools with negligible liquidity would cause constant stale price warnings.

2. **Aave testnet USDC as canonical USDC** — The Aave testnet USDC (`0x75faf1...4d`) is the token that Uniswap V3 on Arbitrum Sepolia uses in its WETH/USDC pools. Confirmed by querying factory directly.

3. **Removed USDT entry entirely** — Rather than keeping a zero-address placeholder (which could cause errors), removed it. If USDT pools are needed in the future, discovery can be re-run.

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written. The discovery path (Aave testnet USDC) matched the first candidate in the plan instructions.

## Self-Check: PASSED

Files verified:
- `bot/src/config/chains/pools/arbitrum-sepolia.ts`: FOUND
- `bot/src/config/chains/arbitrum-sepolia.ts`: FOUND

Commits verified:
- `7e5eaa5` (fix(03-04): replace TBD_DISCOVER_ON_CHAIN placeholders with real pool addresses): FOUND

_Completed: 2026-02-17_
