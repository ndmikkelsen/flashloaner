---
phase: 03-bot-adaptation
plan: 01
subsystem: infra
tags: [arbitrum-sepolia, uniswap-v3, chain-config, bot-entry-point, ethers-v6]

# Dependency graph
requires:
  - phase: 02-infrastructure-setup
    provides: Arbitrum Sepolia contract deployments and chain config system
provides:
  - Corrected Arbitrum Sepolia chain config with real Uniswap V3 factory, router, quoter, and WETH addresses
  - Populated pool stubs with factory query documentation for on-chain discovery
  - run-arb-sepolia.ts entry point using loadChainConfig(421614)
  - bot:arb-sepolia pnpm script
affects: [03-02, 03-03, testnet-validation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "loadChainConfig(chainId) pattern for chain-specific bot instantiation"
    - "FlashloanBot constructed directly (not fromEnv()) for chain-specific configs"
    - "TBD_DISCOVER_ON_CHAIN placeholder with factory.getPool() query documentation"

key-files:
  created:
    - bot/src/run-arb-sepolia.ts
  modified:
    - bot/src/config/chains/arbitrum-sepolia.ts
    - bot/src/config/chains/pools/arbitrum-sepolia.ts
    - package.json

key-decisions:
  - "Uniswap V3 Arbitrum Sepolia factory is 0x248AB79Bbb9bC29bB72f7Cd42F17e054Fc40188e (not the mainnet CREATE2 address)"
  - "run-arb-sepolia.ts uses loadChainConfig(421614) not FlashloanBot.fromEnv() to avoid hardcoded Sepolia values"
  - "Pool addresses use TBD_DISCOVER_ON_CHAIN placeholder until on-chain discovery is run"

patterns-established:
  - "Entry points for new chains: import dotenv first, loadChainConfig(chainId), construct FlashloanBot directly"
  - "Pool stubs: populate with real token addresses and TBD pool address + factory query comment"

# Metrics
duration: 3min
completed: 2026-02-17
---

# Phase 3 Plan 01: Fix Arbitrum Sepolia Config and Add Entry Point Summary

**Corrected Uniswap V3 Arbitrum Sepolia addresses (factory/router/quoter/WETH) and created run-arb-sepolia.ts entry point using loadChainConfig(421614) with direct FlashloanBot construction**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-17T19:50:27Z
- **Completed:** 2026-02-17T19:53:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Fixed 3 wrong Uniswap V3 addresses that were pointing to Ethereum mainnet (factory, router, quoter)
- Fixed WETH token address from zero address to verified Arbitrum Sepolia address (0x980B62...)
- Added placeholder pool definitions with factory.getPool() discovery instructions
- Created dedicated Arbitrum Sepolia entry point that avoids the fromEnv() Ethereum/Sepolia defaults
- Added bot:arb-sepolia npm script matching the tsx loader pattern

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix Arbitrum Sepolia config addresses and populate pool definitions** - `73f774f` (feat)
2. **Task 2: Create run-arb-sepolia.ts entry point and package.json script** - `00ffe6a` (feat)

**Plan metadata:** (docs commit follows this summary creation)

## Files Created/Modified
- `bot/src/config/chains/arbitrum-sepolia.ts` - Fixed factory (0x248AB7...), router (0x101F...), quoter (0x2779...), WETH (0x980B62...)
- `bot/src/config/chains/pools/arbitrum-sepolia.ts` - Added 2 pool stubs with factory query documentation
- `bot/src/run-arb-sepolia.ts` - New Arbitrum Sepolia entry point using loadChainConfig(421614)
- `package.json` - Added bot:arb-sepolia script

## Decisions Made
- **Uniswap V3 testnet addresses differ from mainnet** — The mainnet factory `0x1F98431c8aD98523631AE4a59f267346ea31F984` is NOT deployed on Arbitrum Sepolia. Corrected to the testnet-specific factory `0x248AB79Bbb9bC29bB72f7Cd42F17e054Fc40188e`.
- **WETH confirmed on Arbiscan Sepolia** — `0x980B62Da83eFf3D4576C647993b0c1D7faf17c73` verified via Uniswap V3 Arbitrum Sepolia deployment docs and Arbiscan.
- **Pool stubs vs empty array** — Pool stubs with real token addresses and placeholder pool addresses are more useful than empty array; they document the discovery process and give the bot something to warn about at startup.
- **FlashloanBot.fromEnv() avoided** — fromEnv() reads CHAIN_ID env var and defaults to Ethereum; direct construction with chain config values ensures Arbitrum Sepolia parameters are always used.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `npx tsc --noEmit --project bot/tsconfig.json` failed (no bot-specific tsconfig exists). Used root `npx tsc --noEmit` instead — compiled cleanly.

## User Setup Required
None - no external service configuration required. The bot:arb-sepolia script requires RPC_URL to be set in the environment before running.

## Next Phase Readiness
- Arbitrum Sepolia chain config is correct and ready for Phase 3 plan 02 (gas estimation)
- Entry point will warn at startup if RPC_URL is missing or pools are not yet populated
- Pool addresses need on-chain discovery before bot can monitor real pools

---
*Phase: 03-bot-adaptation*
*Completed: 2026-02-17*
