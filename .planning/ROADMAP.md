# Roadmap: Flashloaner

## Milestones

- v1.0 **Multi-Chain Expansion** -- Phases 1-4 (shipped 2026-02-19)
- v1.1 **Mainnet Profitability** -- Phases 5-12 (in progress)
- v2.0 **Live Optimization** -- Phases 13-16 (shipped 2026-03-02)

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
- [x] **Phase 6: Optimal Input Sizing** - Right-size trade amounts per opportunity based on pool depth instead of fixed defaults (completed 2026-02-20)
- [x] **Phase 7: Live Execution + Safety** - Wire existing execution components into live trading with shadow mode, staleness guard, and nonce persistence (completed 2026-02-20)
- [x] **Phase 8: P&L Dashboard + Operations** - Persist trade outcomes, display session stats, and run bot unattended via pm2 (completed 2026-02-20)
- [ ] **Phase 9: Ramses V2 Adapter** - Add Ramses V3 CL pool monitoring and on-chain swap routing with fee manipulation safeguards
- [x] **Phase 10: Trader Joe V2.1 LB Adapter** - Add Trader Joe Liquidity Book price reading and on-chain swap routing with variable fee buffers (completed 2026-02-20)
- [x] **Phase 11: Dry-Run Signal Quality Fixes** - Fix TJ LB slippage underestimation, GMX/WETH V3 reserve cap failure, and TJ LB fee display bug found in 6.5-hour dry-run (completed 2026-02-22)
- [ ] **Phase 12: Contract Deployment & Live Validation** - Deploy FlashloanExecutor + adapters to Arbitrum mainnet, validate with shadow mode, go live with small capital (plan 01 complete — contracts deployed)

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
- [x] 05-01-PLAN.md -- Expand pool config with cross-fee-tier pools + coverage tests
- [x] 05-02-PLAN.md -- Cross-fee-tier routing tests + dry-run fee visibility

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
- [x] 06-01-PLAN.md -- Input Optimizer Core (ternary search implementation)
- [x] 06-02-PLAN.md -- Detector Integration (OpportunityDetector with InputOptimizer)
- [x] 06-03-PLAN.md -- Dry-Run Enhancement & Integration Test (visibility + E2E validation)

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
- [x] 07-01-PLAN.md -- Shadow Mode Validation and Staleness Protection
- [ ] 07-02-PLAN.md -- TBD
- [ ] 07-03-PLAN.md -- TBD

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
**Plans**: 3 plans

Plans:
- [ ] 10-01-PLAN.md -- On-chain TraderJoeLBAdapter + fork tests
- [ ] 10-02-PLAN.md -- Bot-side LB price reading + bin-to-price conversion
- [ ] 10-03-PLAN.md -- Integration: pool config, fee buffer, profit threshold

## Progress

**Execution Order:** Phases execute in numeric order: 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11 -> 12 -> 13 -> 14 -> 15 -> 16

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Chain Research | v1.0 | 1/1 | Complete | 2026-02-16 |
| 2. Infrastructure Setup | v1.0 | 4/4 | Complete | 2026-02-17 |
| 3. Bot Adaptation | v1.0 | 4/4 | Complete | 2026-02-17 |
| 4. Testnet Validation | v1.0 | 2/2 | Complete | 2026-02-18 |
| 5. Cross-Fee-Tier Routing | v1.1 | 2/2 | Complete | 2026-02-20 |
| 6. Optimal Input Sizing | v1.1 | 3/3 | Complete | 2026-02-20 |
| 7. Live Execution + Safety | v1.1 | 3/3 | Complete | 2026-02-20 |
| 8. P&L Dashboard + Operations | v1.1 | 3/3 | Complete | 2026-02-20 |
| 9. Ramses V2 Adapter | v1.1 | 2/2 | Complete | 2026-02-20 |
| 10. Trader Joe V2.1 LB Adapter | v1.1 | 3/3 | Complete | 2026-02-20 |
| 11. Dry-Run Signal Quality Fixes | v1.1 | 2/2 | Complete | 2026-02-22 |
| 12. Contract Deployment & Live Validation | v1.1 | 1/3 | In progress (plan 01 complete — contracts deployed) | - |
| 13. Ops Cleanup | v2.0 | 2/2 | Complete (via Beads) | 2026-03-02 |
| 14. Gas Estimation Fix | v2.0 | 2/2 | Complete (via Beads) | 2026-03-02 |
| 15. Profitability Pipeline | v2.0 | 3/3 | Complete (via Beads) | 2026-03-02 |
| 16. Bot Resilience | v2.0 | 4/4 | Complete (via Beads) | 2026-03-02 |

### Phase 11: Dry-Run Signal Quality Fixes
**Goal**: Fix three critical signal quality issues found during 6.5-hour dry-run: (1) TJ LB slippage dangerously underestimated (500 ETH with 0.004 ETH slippage), (2) GMX/WETH V3 virtual reserves not passed to optimizer, (3) TJ LB fee display shows 0.00% instead of 0.15%
**Depends on**: Phase 10 (dry-run analysis of Phase 10 pools revealed these issues)
**Requirements**: SIZE-02, SIZE-03, DEX-06
**Success Criteria** (what must be TRUE):
  1. TJ LB opportunities show realistic slippage proportional to input size, with inputs capped to available bin liquidity depth
  2. GMX/WETH optimizer uses V3 virtual reserves for range capping, showing inputs proportional to 8.3 WETH depth (not 500+ ETH)
  3. TJ LB fee display shows correct percentage (0.15%, not 0.00%)
  4. All 554+ TS tests and 342 Solidity tests pass
**Plans**: 2 plans

Plans:
- [ ] 11-01-PLAN.md -- Fix TJ LB input cap + V3 reserve cap propagation
- [ ] 11-02-PLAN.md -- Fix TJ LB fee display + cost floor formatting

### Phase 12: Contract Deployment & Live Validation
**Goal**: Deploy FlashloanExecutor and all DEX adapters to Arbitrum mainnet, validate signal quality in shadow mode (eth_call simulation), and go live with small capital
**Depends on**: Phase 11 (signal quality must be accurate before spending real gas)
**Requirements**: EXEC-01, EXEC-02
**Success Criteria** (what must be TRUE):
  1. FlashloanExecutor and all adapters deployed to Arbitrum mainnet with verified addresses
  2. Shadow mode validates estimated vs simulated profits match within 10% for at least 100 opportunities
  3. Bot executes at least one profitable live trade on mainnet
**Plans**: 3 plans

Plans:
- [x] 12-01-PLAN.md -- Deploy FlashloanExecutor + adapters to Arbitrum mainnet (COMPLETE: all 3 tasks done, contracts live at 0x06409bFF450b9feFD6045f4d014DC887cF898a77)
- [ ] 12-02-PLAN.md -- Shadow mode validation (100+ opportunities, 10% accuracy)
- [ ] 12-03-PLAN.md -- Go live with small capital, execute first profitable trade

### v2.0 Live Optimization -- SHIPPED 2026-03-02

**Milestone Goal:** Fix 10 critical issues identified from live bot log analysis to make the Arbitrum mainnet bot consistently profitable. Address broken gas estimation, unprofitable input sizing, over-conservative thresholds, zombie processes, log explosion, and reliability gaps.

**Epic:** flashloaner-l4f (beads) -- CLOSED

- [x] **Phase 13: Ops Cleanup** - Kill zombie processes, PID management, log rotation (completed 2026-03-02)
- [x] **Phase 14: Gas Estimation Fix** - NodeInterface L1+L2 accuracy for Arbitrum (completed 2026-03-02)
- [x] **Phase 15: Profitability Pipeline** - Optimizer search range, lower threshold, profit function fixes (completed 2026-03-02)
- [x] **Phase 16: Bot Resilience** - Balance guard, pair cooldown, circuit breaker, thin pool filter (completed 2026-03-02)

### Phase 13: Ops Cleanup — Zombie Processes & Log Management
**Goal**: Kill zombie shadow processes, add process lifecycle management to run-bot.sh, implement log rotation, and clean up 1GB of stale /tmp logs
**Depends on**: None (independent, can start immediately)
**Beads Issues**: flashloaner-i9g (zombies), flashloaner-6c7 (log rotation)
**Requirements**: OPS-01, OPS-02
**Success Criteria** (what must be TRUE):
  1. No stale bot processes remain running after cleanup (verify with `ps aux | grep flashbot`)
  2. run-bot.sh writes a PID file and kills previous instance on startup
  3. run-bot.sh has a `stop` subcommand that cleanly shuts down the running bot
  4. Logs rotate at 50MB with 3 retained files, old logs >24h cleaned on startup
  5. All existing tests pass (`forge test` and `pnpm test`)
**Plans**: 2 plans (executed directly via Beads)

Plans:
- [x] 13-01-PLAN.md -- Kill zombies + PID file management + stop subcommand
- [x] 13-02-PLAN.md -- Log rotation + cleanup + production log level

### Phase 14: Gas Estimation Fix — NodeInterface L1+L2 Accuracy
**Goal**: Fix the broken NodeInterface gas estimation so the bot has accurate L1 data fee + L2 execution cost for Arbitrum, replacing the static fallback that makes all profit calculations unreliable
**Depends on**: None (independent, can start immediately)
**Beads Issues**: flashloaner-qef (gas estimation)
**Requirements**: GAS-01
**Success Criteria** (what must be TRUE):
  1. NodeInterface call succeeds on bot startup (no "using static estimates" warning in logs)
  2. Gas estimates include both L2 execution cost and L1 data posting fee as separate components
  3. Estimated gas costs are within 20% of actual transaction costs (validated against historical txns)
  4. All existing tests pass, new tests cover NodeInterface integration
**Plans**: 2 plans (executed directly via Beads)

Plans:
- [x] 14-01-PLAN.md -- Debug NodeInterface failure + fix call parameters
- [x] 14-02-PLAN.md -- Validate gas estimates against on-chain reality

### Phase 15: Profitability Pipeline — Optimizer, Threshold & Profit Function
**Goal**: Fix the three interconnected profitability issues: input optimizer finding no profitable sizes, profit threshold 7.5x above reality, and profit function returning zero for some paths
**Depends on**: Phase 14 (accurate gas estimation needed for optimizer validation)
**Beads Issues**: flashloaner-eh6 (optimizer), flashloaner-dej (threshold), flashloaner-4wo (zero profit)
**Requirements**: PROFIT-01, PROFIT-02, PROFIT-03
**Success Criteria** (what must be TRUE):
  1. Optimizer finds profitable input sizes for at least 30% of opportunities with delta > 0.3%
  2. Profit threshold lowered to ~0.003 ETH with env var override (MIN_PROFIT_THRESHOLD)
  3. Zero "Gross: 0.000000" entries in a 1-hour shadow run (profit function always computes a value)
  4. At least one opportunity passes threshold gate in a 1-hour live session
  5. All existing tests pass, new tests cover optimizer edge cases
**Plans**: 3 plans (executed directly via Beads)

Plans:
- [x] 15-01-PLAN.md -- Fix zero-profit bug + optimizer profit function debugging
- [x] 15-02-PLAN.md -- Lower threshold + env var override + dynamic threshold consideration
- [x] 15-03-PLAN.md -- End-to-end shadow validation (1-hour run with improved pipeline)

### Phase 16: Bot Resilience — Balance Guard, Cooldown, RPC Circuit Breaker, Thin Pool Filter
**Goal**: Improve bot reliability with wallet balance safety guard, pair cooldown for persistently unprofitable pairs, RPC circuit breaker with exponential backoff, and thin-liquidity pool filtering
**Depends on**: None (independent, can start immediately)
**Beads Issues**: flashloaner-aca (balance), flashloaner-31u (cooldown), flashloaner-k4g (circuit breaker), flashloaner-pvr (thin pools)
**Requirements**: RESIL-01, RESIL-02, RESIL-03, RESIL-04
**Success Criteria** (what must be TRUE):
  1. Bot refuses to enter LIVE mode when balance < 0.005 ETH (hard stop with clear error message)
  2. After 10 consecutive rejections for a pair, that pair is skipped for 60 seconds (visible in logs)
  3. After 3 consecutive RPC failures, bot pauses polling with exponential backoff (2s, 4s, 8s, max 30s)
  4. Pools with WETH reserve < 10 ETH (V2) or virtual reserve < 10 ETH (V3) are skipped with periodic recheck
  5. All existing tests pass, new tests cover each resilience feature
**Plans**: 4 plans (executed directly via Beads)

Plans:
- [x] 16-01-PLAN.md -- Balance safety guard + periodic balance monitoring
- [x] 16-02-PLAN.md -- Pair cooldown mechanism for persistent rejections
- [x] 16-03-PLAN.md -- RPC circuit breaker with exponential backoff
- [x] 16-04-PLAN.md -- Thin pool liquidity filter with periodic recheck

