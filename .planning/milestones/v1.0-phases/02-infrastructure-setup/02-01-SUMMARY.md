---
phase: 02-infrastructure-setup
plan: 01
subsystem: bot-config
tags: [multi-chain, config-system, arbitrum]
completed: 2026-02-16T17:12:00Z
duration_minutes: 4

# Dependency Graph
requires:
  - phase: 01-chain-research
    plan: 01
    artifact: ARBITRUM.md
    reason: "Arbitrum addresses, gas params, and DEX configurations"

provides:
  - artifact: bot/src/config/chains/types.ts
    capability: "ChainConfig interface for chain-specific configurations"
  - artifact: bot/src/config/chains/index.ts
    capability: "loadChainConfig() function for runtime chain selection"
  - artifact: bot/src/config/chains/arbitrum.ts
    capability: "Arbitrum mainnet configuration with optimal gas params"
  - artifact: bot/src/config/chains/arbitrum-sepolia.ts
    capability: "Arbitrum Sepolia testnet configuration"

affects:
  - file: bot/src/config/index.ts
    change: "Added loadChainConfig and ChainConfig exports"
    impact: "Enables multi-chain configuration selection"

# Tech Stack
added: []
patterns:
  - "Chain-specific configuration files"
  - "Runtime chain selection via chainId switch"
  - "Environment-based RPC URL loading"

# Key Files
created:
  - bot/src/config/chains/types.ts
  - bot/src/config/chains/ethereum.ts
  - bot/src/config/chains/sepolia.ts
  - bot/src/config/chains/arbitrum.ts
  - bot/src/config/chains/arbitrum-sepolia.ts
  - bot/src/config/chains/index.ts
  - bot/src/config/chains/pools/arbitrum-mainnet.ts
  - bot/src/config/chains/pools/arbitrum-sepolia.ts

modified:
  - bot/src/config/index.ts
  - .gitleaks.toml

# Decisions
key-decisions:
  - "Use switch statement on chainId for config selection (extensible, type-safe)"
  - "Load RPC URLs from environment at runtime (not hardcoded in chain configs)"
  - "Separate pool definitions into chain-specific files (arbitrum-mainnet.ts, arbitrum-sepolia.ts)"
  - "Preserve all existing exports (MAINNET_TOKENS, SEPOLIA_TOKENS, MAINNET_POOLS) for backward compatibility"
  - "Set Arbitrum gas params: 0.1 gwei max, 1s polling (0.25s blocks require faster monitoring)"
  - "Arbitrum MEV mode: 'none' (FCFS sequencer, no Flashbots available)"

# Metrics
tasks_completed: 2
commits: 2
files_changed: 11
test_status: passed
---

# Phase 2 Plan 1: Chain Config System Summary

**Chain-specific configuration system separates chain addresses, gas params, and DEX configs from shared bot logic. Each chain gets its own config file; the loader selects by chainId at runtime.**

## What Was Built

Created a modular chain configuration system that:
1. Defines a `ChainConfig` interface with all chain-specific parameters (RPC, protocols, DEXes, tokens, gas, monitor, detector, MEV, pools)
2. Implements configs for 4 chains: Ethereum (1), Sepolia (11155111), Arbitrum (42161), Arbitrum Sepolia (421614)
3. Provides `loadChainConfig(chainId)` function for runtime chain selection
4. Uses Arbitrum addresses from Phase 1 research (ARBITRUM.md)
5. Configures Arbitrum-specific parameters: 0.1 gwei max gas, 1s polling, FCFS ordering, no MEV protection

## Deviations from Plan

None - plan executed exactly as written.

## Tasks Completed

### Task 1: Create ChainConfig type and chain-specific config files
**Status:** ✅ Complete
**Commit:** 51da27a
**Files:**
- `bot/src/config/chains/types.ts` - ChainConfig interface
- `bot/src/config/chains/ethereum.ts` - Ethereum mainnet config
- `bot/src/config/chains/sepolia.ts` - Sepolia testnet config
- `bot/src/config/chains/arbitrum.ts` - Arbitrum mainnet config (0.1 gwei, 1s polling)
- `bot/src/config/chains/arbitrum-sepolia.ts` - Arbitrum Sepolia config
- `bot/src/config/chains/index.ts` - loadChainConfig() loader
- `bot/src/config/chains/pools/arbitrum-mainnet.ts` - WETH/USDC and WETH/USDT pools
- `bot/src/config/chains/pools/arbitrum-sepolia.ts` - Empty (TBD during Phase 4)
- `.gitleaks.toml` - Added Arbitrum token/pool address allowlist

**What was done:**
- Created ChainConfig interface with chain addresses, gas params, DEX configs, tokens, monitor/detector overrides, MEV config, and pools
- Implemented 4 chain configs using addresses from Phase 1 research (ARBITRUM.md)
- Arbitrum mainnet uses: Aave V3 Pool (0x794a61...), UniV3 router/factory, SushiSwap V2 router/factory
- Arbitrum pools: WETH/USDC UniV3 0.05% (0xC31E54...), WETH/USDT UniV3 0.05% (0x641c00...)
- Arbitrum gas: maxGasPriceGwei=0.1, pollIntervalMs=1000 (0.25s blocks)
- Arbitrum MEV: mode="none" (FCFS sequencer, no Flashbots)
- Updated gitleaks allowlist to prevent false positives on public token/pool addresses

**Verification:**
- TypeScript compiles without errors ✅
- All tests pass (423 tests) ✅
- Chain config files exist ✅
- Arbitrum Aave pool address matches research (0x794a61...) ✅

### Task 2: Update config index exports
**Status:** ✅ Complete
**Commit:** ba5fa8f
**Files:**
- `bot/src/config/index.ts` - Added loadChainConfig and ChainConfig exports

**What was done:**
- Added `export { loadChainConfig } from "./chains/index.js";`
- Added `export type { ChainConfig } from "./chains/types.js";`
- Preserved all existing exports (MAINNET_TOKENS, SEPOLIA_TOKENS, MAINNET_POOLS, etc.) for backward compatibility

**Verification:**
- TypeScript compiles without errors ✅
- All tests pass (423 tests) ✅
- Existing exports unchanged (MAINNET_TOKENS, SEPOLIA_TOKENS, MAINNET_POOLS still exported) ✅

## Verification Results

All verification steps from the plan passed:

1. ✅ `pnpm test` - All 423 tests pass (no regressions)
2. ✅ `npx tsc --noEmit` - TypeScript compiles cleanly
3. ✅ Chain config files exist: types.ts, ethereum.ts, sepolia.ts, arbitrum.ts, arbitrum-sepolia.ts, index.ts, pools/arbitrum-mainnet.ts, pools/arbitrum-sepolia.ts
4. ✅ Backward compatibility: MAINNET_TOKENS, SEPOLIA_TOKENS, MAINNET_POOLS still exported
5. ✅ Arbitrum Aave address matches research: 0x794a61358D6845594F94dc1DB02A252b5b4814aD

## Success Criteria Met

- ✅ Chain config loader returns correct config for all 4 supported chain IDs (1, 11155111, 42161, 421614)
- ✅ Arbitrum configs use addresses from Phase 1 research (ARBITRUM.md)
- ✅ Existing bot config exports (MAINNET_TOKENS, SEPOLIA_TOKENS, MAINNET_POOLS) work unchanged
- ✅ Adding a new chain requires only: 1 new chain config file + 1 switch case entry in loadChainConfig()
- ✅ All tests pass, TypeScript compiles

## Technical Highlights

**Arbitrum Configuration:**
- **Chain ID:** 42161 (mainnet), 421614 (Sepolia)
- **Block Time:** 0.25s (requires 1s polling vs 12s on Ethereum)
- **Gas Model:** Dual-component (L2 execution + L1 data posting) - maxGasPriceGwei=0.1
- **MEV Protection:** None (FCFS sequencer, no Flashbots on Arbitrum)
- **Flash Loans:** Aave V3 (0x794a61...) - same address on mainnet and Sepolia via CREATE2
- **DEXes:** Uniswap V3 (primary), SushiSwap V2 (secondary), Camelot (testnet only)
- **Pools:** WETH/USDC and WETH/USDT UniV3 0.05% pools (highest liquidity)

**Architecture Pattern:**
- Runtime chain selection via `loadChainConfig(chainId)` switch statement
- Environment-based RPC URL loading (not hardcoded in configs)
- Separate pool definition files per chain (arbitrum-mainnet.ts, arbitrum-sepolia.ts)
- Type-safe ChainConfig interface ensures all required fields are present
- Backward-compatible exports preserve existing bot behavior

## Known Issues

None. All tasks completed successfully with no blockers.

## Next Steps

**Phase 2, Plan 2:** Bot adaptation to use chain config system
- Update bot entry points to call `loadChainConfig()`
- Replace hardcoded Ethereum assumptions with chain-specific configs
- Test bot initialization on all 4 chains (Ethereum, Sepolia, Arbitrum, Arbitrum Sepolia)

## Self-Check: PASSED

### Files Created
✅ bot/src/config/chains/types.ts
✅ bot/src/config/chains/ethereum.ts
✅ bot/src/config/chains/sepolia.ts
✅ bot/src/config/chains/arbitrum.ts
✅ bot/src/config/chains/arbitrum-sepolia.ts
✅ bot/src/config/chains/index.ts
✅ bot/src/config/chains/pools/arbitrum-mainnet.ts
✅ bot/src/config/chains/pools/arbitrum-sepolia.ts

### Files Modified
✅ bot/src/config/index.ts
✅ .gitleaks.toml

### Commits Exist
✅ 51da27a (Task 1: chain config system)
✅ ba5fa8f (Task 2: config index exports)

All files and commits verified successfully.
