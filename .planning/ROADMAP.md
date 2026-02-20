# Roadmap: Flashloaner

## Milestones

- v1.0 **Multi-Chain Expansion** -- Phases 1-4 (shipped 2026-02-19)
- v1.1 **Mainnet Profitability** -- Phases 5-10 (in progress)

## Phases

<details>
<summary>v1.0 Multi-Chain Expansion (Phases 1-4) -- SHIPPED 2026-02-19</summary>

- [x] Phase 1: Chain Research (1/1 plans) -- completed 2026-02-16
- [x] Phase 2: Infrastructure Setup (4/4 plans) -- completed 2026-02-17
- [x] Phase 3: Bot Adaptation (4/4 plans) -- completed 2026-02-17
- [x] Phase 4: Testnet Validation (2/2 plans) -- completed 2026-02-18

See: `.planning/milestones/v1.0-ROADMAP.md` for full details.

</details>

### v1.1 Mainnet Profitability

**Milestone Goal:** Achieve consistent net-positive arbitrage trading on Arbitrum mainnet with flash-loan-only execution (zero capital risk beyond gas). Success bar: 24+ hours net-positive P&L.

- [x] **Phase 5: Cross-Fee-Tier Routing** - Expand pool pair matrix with cross-fee-tier combinations to reduce cost floor from 0.60% to 0.35% (completed 2026-02-20)
- [ ] **Phase 6: Optimal Input Sizing** - Right-size trade amounts per opportunity based on pool depth instead of fixed defaults
- [ ] **Phase 7: Live Execution + Safety** - Wire existing execution components into live trading with shadow mode, staleness guard, and nonce persistence
- [ ] **Phase 8: P&L Dashboard + Operations** - Persist trade outcomes, display session stats, and run bot unattended via pm2
- [ ] **Phase 9: Ramses V2 Adapter** - Add Ramses V3 CL pool monitoring and on-chain swap routing with fee manipulation safeguards
- [ ] **Phase 10: Trader Joe V2.1 LB Adapter** - Add Trader Joe Liquidity Book price reading and on-chain swap routing with variable fee buffers

## Phase Details

### Phase 5: Cross-Fee-Tier Routing
**Goal**: Bot finds profitable arbitrage paths across different fee tiers, dropping the minimum cost floor from 0.60% to 0.35%
**Depends on**: Phase 4 (v1.0 complete -- bot monitors 22 pools in dry-run mode)
**Requirements**: ROUTE-01, ROUTE-02, ROUTE-03
**Success Criteria** (what must be TRUE):
  1. Bot compares prices between different fee tiers for the same token pair (e.g., UniV3 WETH/USDC 0.05% vs 0.3%) and detects cross-tier spreads
  2. Bot routes buy leg through lowest-fee pool and sell leg through highest-price pool when that path is more profitable than same-tier pairing
  3. Dry-run output shows opportunities with cost floors below 0.60% for cross-fee-tier pairs across all 5 major token pairs (WETH/USDC, WETH/USDT, ARB/WETH, LINK/WETH, GMX/WETH)
**Plans**: 2 plans

Plans:
- [ ] 05-01-PLAN.md -- Expand pool config with cross-fee-tier pools + coverage tests
- [ ] 05-02-PLAN.md -- Cross-fee-tier routing tests + dry-run fee visibility

### Phase 6: Optimal Input Sizing
**Goal**: Bot computes optimal trade size per opportunity based on pool liquidity depth, replacing fixed defaults with right-sized amounts
**Depends on**: Phase 5 (cross-fee-tier routing provides accurate cost floors for sizing decisions)
**Requirements**: SIZE-01, SIZE-02, SIZE-03
**Success Criteria** (what must be TRUE):
  1. Bot computes a per-opportunity input amount derived from pool liquidity depth (not a fixed default) for both V2 and V3 pool types
  2. Optimization completes within 100ms and falls back to conservative fixed size if timeout or iteration cap is hit
  3. Dry-run output shows varying input sizes across opportunities (not uniform amounts), with sizes correlated to pool depth
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD

### Phase 7: Live Execution + Safety
**Goal**: Bot executes real arbitrage transactions on Arbitrum mainnet via FlashloanExecutor, with shadow validation, staleness protection, and crash-safe nonce management
**Depends on**: Phase 6 (accurate profit estimation from sizing + routing must precede spending real gas)
**Requirements**: EXEC-01, EXEC-02, EXEC-03, EXEC-04, EXEC-05
**Success Criteria** (what must be TRUE):
  1. Bot submits real transactions via FlashloanExecutor when a profitable opportunity is detected in live mode, and transactions appear on-chain (Arbiscan)
  2. Shadow mode runs first and logs estimated vs simulated outcomes without broadcasting, validating profit estimation accuracy
  3. Bot aborts any trade where detection-to-execution latency exceeds 200ms (visible in logs as staleness abort)
  4. After a process crash and restart, bot waits for any pending transaction to resolve before submitting new ones (no nonce collision)
  5. DRY_RUN=true still works and produces the same dry-run output as before (backward compatibility)
**Plans**: TBD

Plans:
- [ ] 07-01: TBD
- [ ] 07-02: TBD
- [ ] 07-03: TBD

### Phase 8: P&L Dashboard + Operations
**Goal**: Every trade outcome persists to disk with three-bucket accounting, session stats display on startup, and the bot runs unattended for 24+ hours via pm2
**Depends on**: Phase 7 (P&L tracking needs real trades to be meaningful; pm2 wraps the live bot)
**Requirements**: TRACK-01, TRACK-02, TRACK-03, TRACK-04, OPS-01, OPS-02, OPS-03
**Success Criteria** (what must be TRUE):
  1. After a profitable trade, revert, or gas-only loss, the outcome (profit, gas cost, revert cost, txHash, block) is persisted to disk and survives process restart
  2. On startup, bot displays lifetime stats (total trades, win rate, net P&L with gross/gas/revert breakdown) and periodically during operation
  3. Running `--report` flag prints last N trades and exits without disrupting the running bot process
  4. Bot runs as a pm2-managed process with auto-restart on crash, log rotation, and the ecosystem config uses `.cjs` extension for ESM compatibility
  5. Bot operates unattended for 24+ hours on Arbitrum mainnet without manual intervention or silent failure
**Plans**: TBD

Plans:
- [ ] 08-01: TBD
- [ ] 08-02: TBD
- [ ] 08-03: TBD

### Phase 9: Ramses V2 Adapter
**Goal**: Bot monitors Ramses V3 CL pools and routes swaps through a dedicated on-chain adapter, with 2x profit threshold to mitigate documented fee manipulation risk
**Depends on**: Phase 8 (bot must be operationally stable before adding DEX complexity)
**Requirements**: DEX-01, DEX-02, DEX-03
**Success Criteria** (what must be TRUE):
  1. Bot reads Ramses V3 CL pool prices via slot0() and detects cross-DEX spreads between Ramses and existing pools
  2. On-chain RamsesV2Adapter successfully routes swaps through Ramses SwapRouter in fork tests
  3. All Ramses opportunities require 2x the standard minimum profit threshold before the bot considers execution
**Plans**: TBD

Plans:
- [ ] 09-01: TBD
- [ ] 09-02: TBD

### Phase 10: Trader Joe V2.1 LB Adapter
**Goal**: Bot reads Trader Joe Liquidity Book active bin prices and routes swaps through a dedicated on-chain adapter, with 50% fee buffer to account for variable fee volatility
**Depends on**: Phase 9 (Ramses validates the DEX adapter integration path with lower risk; Trader Joe LB is highest complexity)
**Requirements**: DEX-04, DEX-05, DEX-06
**Success Criteria** (what must be TRUE):
  1. Bot reads Trader Joe V2.1 LBPair active bin prices via getActiveId() and converts bin IDs to normalized token prices
  2. On-chain TraderJoeLBAdapter routes swaps through LBRouter V2.1 with correct bin-step path encoding in fork tests
  3. All Trader Joe opportunities apply a 50% fee buffer on top of the base fee to account for the volatility accumulator
**Plans**: TBD

Plans:
- [ ] 10-01: TBD
- [ ] 10-02: TBD

## Progress

**Execution Order:** Phases execute in numeric order: 5 -> 6 -> 7 -> 8 -> 9 -> 10

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Chain Research | v1.0 | 1/1 | Complete | 2026-02-16 |
| 2. Infrastructure Setup | v1.0 | 4/4 | Complete | 2026-02-17 |
| 3. Bot Adaptation | v1.0 | 4/4 | Complete | 2026-02-17 |
| 4. Testnet Validation | v1.0 | 2/2 | Complete | 2026-02-18 |
| 5. Cross-Fee-Tier Routing | v1.1 | Complete    | 2026-02-20 | - |
| 6. Optimal Input Sizing | v1.1 | 0/? | Not started | - |
| 7. Live Execution + Safety | v1.1 | 0/? | Not started | - |
| 8. P&L Dashboard + Operations | v1.1 | 0/? | Not started | - |
| 9. Ramses V2 Adapter | v1.1 | 0/? | Not started | - |
| 10. Trader Joe V2.1 LB Adapter | v1.1 | 0/? | Not started | - |
