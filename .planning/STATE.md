# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-16)

**Core value:** The bot must never lose funds beyond gas costs — the 4-layer safety system (off-chain estimate, eth_call simulation, on-chain ProfitValidator, MEV protection) ensures every transaction either profits or reverts.
**Current focus:** v1 Milestone COMPLETE

## Current Position

Phase: 4 of 4 (Testnet Validation) - COMPLETE
Plan: 2 of 2 (COMPLETE)
Status: ALL PHASES COMPLETE — v1 milestone fully validated
Last activity: 2026-02-18 — Bot ran 62m53s on Arbitrum Sepolia: 3,769 opportunities detected, 0 errors, 0 crashes. All 762 tests pass.

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 12
- Average duration: 3.5 minutes
- Total execution time: ~1.3 hours (including 63-min bot run)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 1 - Chain Research | 1 | 5 min | 5 min |
| Phase 2 - Infrastructure Setup | 4 | 14 min | 3.5 min |
| Phase 3 - Bot Adaptation | 4 | 13 min | 3.25 min |
| Phase 4 - Testnet Validation | 2 | 65 min | 32.5 min |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Move away from Ethereum mainnet (too saturated for small capital, gas too high)
- EVM-first chain selection (reuse existing Solidity contracts and ethers.js bot)
- Research + testnet only for v1 (validate before risking real funds)
- Monorepo architecture (single repo for all chain implementations)
- **Arbitrum chosen as optimal chain** (52.6% success rate vs 6.3% Base, 12% Optimism) — Phase 1, Plan 1
- **QuickNode selected as primary RPC** (Alchemy lacks trace API on Arbitrum) — Phase 1, Plan 1
- **Dual-component gas model critical** (L1 data fees = 95% of total cost) — Phase 1, Plan 1
- **FCFS sequencer ordering strategy** (latency > gas bidding, no Flashbots) — Phase 1, Plan 1
- **Chain config system uses switch statement on chainId** (extensible, type-safe) — Phase 2, Plan 1
- **Arbitrum gas params: 0.1 gwei max, 1s polling** (0.25s blocks require faster monitoring) — Phase 2, Plan 1
- **Balancer Vault uses same CREATE2 address across chains** (0xBA12...2C8) — Phase 2, Plan 2
- **SushiSwap V2 as Uniswap V2 equivalent on Arbitrum** (same interface) — Phase 2, Plan 2
- **Chain-specific env files gitignored** (.env.arbitrum-sepolia, etc.) — Phase 2, Plan 2
- **All 5 contracts deployed to Arbitrum Sepolia** (0.0001 ETH gas) — Phase 2, Plan 4
- **fs_permissions required in foundry.toml** for Deploy.s.sol artifact writes — Phase 2, Plan 4
- **Raw ethers.js v6 Contract for NodeInterface** (avoids @arbitrum/sdk ethers v5/v6 conflict) — Phase 3, Plan 2
- **l1DataFee optional on CostEstimate** (backward compatible; populated by ArbitrumGasEstimator in Plan 03-03) — Phase 3, Plan 2
- **Uniswap V3 Arbitrum Sepolia factory is 0x248AB79...88e** (not the mainnet CREATE2 address 0x1F984...) — Phase 3, Plan 1
- **run-arb-sepolia.ts uses loadChainConfig(421614) not fromEnv()** (avoids hardcoded Ethereum/Sepolia defaults) — Phase 3, Plan 1
- **setGasEstimator() public method for post-construction injection** (avoids type plumbing through DetectorConfig/BotConfig) — Phase 3, Plan 3
- **handleDelta() dispatches async path when gasEstimatorFn set** (backward compatible; sync path unchanged) — Phase 3, Plan 3
- **vi.mock hoisting requires module-scope state objects** (local let vars cause TDZ errors in factory callbacks) — Phase 3, Plan 3
- **WETH/USDC 0.3% and 1% pools selected on Arbitrum Sepolia** (0x66EEAB70...bbf and 0x3eCedaB7...868); 0.05% pool excluded (liquidity: 122) — Phase 3, Plan 4
- **Aave testnet USDC (0x75faf1...4d) is canonical USDC on Arbitrum Sepolia** (confirmed via factory.getPool() returning real pools) — Phase 3, Plan 4
- **USDT entry removed from tokens config** (no canonical testnet address found; zero-address placeholder eliminated) — Phase 3, Plan 4

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-02-18
Stopped at: v1 milestone COMPLETE — All 4 phases done. Bot validated on Arbitrum Sepolia (62m53s, 3769 opportunities, 0 errors). 19/19 requirements satisfied.
Resume file: .planning/ROADMAP.md
