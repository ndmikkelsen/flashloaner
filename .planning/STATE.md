# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-19)

**Core value:** The bot must never lose funds beyond gas costs -- the 4-layer safety system (off-chain estimate, eth_call simulation, on-chain ProfitValidator, MEV protection) ensures every transaction either profits or reverts.
**Current focus:** Phase 6 -- Optimal Input Sizing

## Current Position

Phase: 6 of 10 (Optimal Input Sizing)
Plan: 2 of 3 in current phase
Status: In progress
Last activity: 2026-02-20 -- Completed 06-02-PLAN.md (Detector Integration) -- Phase 6 in progress

Progress: [==============........] 71% (15/~21 plans -- v1.0: 11 complete, v1.1: 4/~10 complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 15 (v1.0: 11, v1.1: 4)
- Average duration: ~33 min (weighted)
- Total execution time: ~8h 17m (v1.0: 8h, v1.1: 17m)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Chain Research | 1 | ~30m | ~30m |
| 2. Infrastructure Setup | 4 | ~3h | ~45m |
| 3. Bot Adaptation | 4 | ~3h | ~45m |
| 4. Testnet Validation | 2 | ~1.5h | ~45m |
| 5. Cross-Fee-Tier Routing | 2 | ~5m | ~2.5m |

**Recent Plans:**

| Plan | Duration (s) | Tasks | Files |
|------|-------------|-------|-------|
| Phase 05-cross-fee-tier-routing P01 | 149 | 2 | 2 |
| Phase 05-cross-fee-tier-routing P02 | 152 | 2 | 2 |
| Phase 06-optimal-input-sizing P01 | 409 | 3 | 3 |
| Phase 06-optimal-input-sizing P02 | 317 | 3 | 5 |

**Recent Trend:**
- v1.0 phases: steady ~45m per plan
- v1.1 Phase 5 (complete): 2.5m per plan (pool discovery + validation, no new implementation)
- v1.1 Phase 6 (in progress): ~6m per plan (new optimizer implementation + integration)
- Trend: v1.1 faster than v1.0 due to robust codebase, but new algorithms slower than validation

## Accumulated Context

### Decisions

All v1.0 decisions documented in PROJECT.md Key Decisions table.
New for v1.1:
- Cross-fee-tier routing before live execution (accurate profit estimation first)
- Zyberswap deferred to v1.2 (4 active pools, 30 addresses/day)
- JSONL for P&L persistence, SQLite upgrade path available
- Ramses gated with 2x profit threshold (fee manipulation risk)
- Trader Joe gated with 50% fee buffer (variable fee volatility)
- [Phase 05-cross-fee-tier-routing]: Added WETH/USDT UniV3 0.3% and LINK/WETH UniV3 0.05% pools for cross-fee-tier coverage
- [Phase 05-cross-fee-tier-routing]: Cross-fee-tier routing produces ~0.35% cost floor vs ~0.60% same-tier (62.5% profit advantage)
- [Phase 05-cross-fee-tier-routing]: Dry-run output shows per-step fee rates and combined cost floor for operator visibility
- [Phase 06-optimal-input-sizing]: Ternary search with maxIterations=20 and convergenceThreshold=1.0 unit for [1, 1000] range
- [Phase 06-optimal-input-sizing]: 100ms timeout ensures production safety with fallback to conservative 10-unit input
- [Phase 06-optimal-input-sizing]: Virtual reserve computation differs for V2 (actual reserves) vs V3 (L and sqrtPriceX96)
- [Phase 06-optimal-input-sizing]: OpportunityDetector optimizes only when reserve data available (hasReserveData check)
- [Phase 06-optimal-input-sizing]: Optimizer integration uses profit function wrapper (buildProfitFunction) encapsulating cost estimation

### Pending Todos

None.

### Blockers/Concerns

- Ramses fee manipulation risk may make Phase 9 non-viable (monitor during Phase 8)
- Trader Joe LB complexity is HIGH -- decision gate at 5 days, defer to v1.2 if exceeded

## Session Continuity

Last session: 2026-02-20
Stopped at: Completed 06-02-PLAN.md (Detector Integration) -- Phase 6 in progress (2/3 plans)
Resume file: .planning/phases/06-optimal-input-sizing/06-03-PLAN.md
