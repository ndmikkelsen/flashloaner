# Requirements: Flashloaner v1.1

**Defined:** 2026-02-19
**Core Value:** The bot must never lose funds beyond gas costs -- the 4-layer safety system ensures every transaction either profits or reverts.

## v1.1 Requirements

Requirements for mainnet profitability milestone. Each maps to roadmap phases.

### Routing

- [ ] **ROUTE-01**: Bot compares prices across different fee tiers for the same token pair (e.g., UniV3 0.05% vs UniV3 0.3%)
- [ ] **ROUTE-02**: Bot routes buy leg through lowest-fee pool and sell leg through highest-price pool to minimize cost floor
- [ ] **ROUTE-03**: Pool config includes cross-fee-tier and cross-DEX pairs for all major Arbitrum token pairs (WETH/USDC, WETH/USDT, ARB/WETH, LINK/WETH, GMX/WETH)

### Sizing

- [ ] **SIZE-01**: Bot computes optimal input amount per opportunity based on pool liquidity depth (virtual reserves)
- [ ] **SIZE-02**: Input optimizer uses ternary search with 3-iteration cap and 100ms timeout, falling back to conservative fixed size
- [ ] **SIZE-03**: Optimal sizing works for both V2 (constant-product formula) and V3 (virtual reserve approximation) pool types

### Execution

- [ ] **EXEC-01**: Bot submits real transactions via FlashloanExecutor when profitable opportunities are detected (live mode)
- [ ] **EXEC-02**: Shadow mode validates profitability estimates against simulated execution results before enabling live trades
- [ ] **EXEC-03**: Bot aborts trade if detection-to-execution latency exceeds 200ms (staleness guard)
- [ ] **EXEC-04**: Nonce state persists to disk after every submission; on restart, bot waits for pending transactions to resolve
- [ ] **EXEC-05**: Dry-run mode remains available via DRY_RUN=true environment variable (backward compatibility)

### Tracking

- [ ] **TRACK-01**: Every trade outcome (profit, gas cost, revert cost, txHash, block) persists to disk and survives process restarts
- [ ] **TRACK-02**: Three-bucket P&L accounting: gross profit, gas costs (including L1 data fee), and revert costs tracked separately
- [ ] **TRACK-03**: Session summary displays on startup (lifetime trades, win rate, net P&L) and periodically during operation
- [ ] **TRACK-04**: CLI `--report` flag prints last N trades and exits without stopping the running bot

### Operations

- [ ] **OPS-01**: Bot runs as pm2-managed process with auto-restart on crash, log rotation, and memory-based restart limit
- [ ] **OPS-02**: pm2 ecosystem config uses `.cjs` extension for ESM compatibility with `node --import tsx` interpreter
- [ ] **OPS-03**: Bot can run unattended for 24+ hours on Arbitrum mainnet without manual intervention

### DEX Expansion

- [ ] **DEX-01**: Bot monitors Ramses V3 CL pools for price discrepancies using same slot0() interface as Uniswap V3
- [ ] **DEX-02**: On-chain RamsesV2Adapter routes swaps through Ramses V3 SwapRouter
- [ ] **DEX-03**: Ramses opportunities use 2x minimum profit threshold to account for documented fee manipulation risk
- [ ] **DEX-04**: Bot reads Trader Joe V2.1 Liquidity Book active bin prices via LBPair.getActiveId()
- [ ] **DEX-05**: On-chain TraderJoeLBAdapter routes swaps through LBRouter V2.1 with bin-step path encoding
- [ ] **DEX-06**: Trader Joe opportunities use 50% fee buffer to account for variable fee volatility accumulator

## v1.2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### DEX Coverage

- **DEX-07**: Zyberswap adapter for Algebra Protocol concentrated liquidity pools
- **DEX-08**: Camelot V3 dedicated adapter with custom fee logic

### Advanced Strategies

- **STRAT-01**: Triangle/cyclic arbitrage paths (3+ hops) with multi-leg fee optimization
- **STRAT-02**: Automated flash loan provider selection (Balancer 0% vs Aave 0.05%) based on real-time pool liquidity

### Infrastructure

- **INFRA-01**: Web/HTTP P&L dashboard with historical charts and trade replay
- **INFRA-02**: Multi-RPC failover with automatic provider switching on rate limit or downtime

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cross-chain arbitrage | Bridge fees erase profit, no atomic execution, 7-day finality |
| Ethereum mainnet deployment | Too saturated for small capital, gas costs eat profits |
| WebSocket monitoring | Polling sufficient for current iteration speed |
| Sandwich/liquidation/JIT strategies | Focus on simple DEX arb first; advanced strategies add regulatory risk |
| Zyberswap integration | 4 active pools, 30 addresses/day, declining TVL; all research files agree: skip |
| Hardware wallet signing | Hot wallet with limited balance sufficient for v1.1 |
| Database migration to PostgreSQL | SQLite/JSONL sufficient for single-server bot |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ROUTE-01 | Phase 5 | Pending |
| ROUTE-02 | Phase 5 | Pending |
| ROUTE-03 | Phase 5 | Pending |
| SIZE-01 | Phase 6 | Pending |
| SIZE-02 | Phase 6 | Pending |
| SIZE-03 | Phase 6 | Pending |
| EXEC-01 | Phase 7 | Pending |
| EXEC-02 | Phase 7 | Pending |
| EXEC-03 | Phase 7 | Pending |
| EXEC-04 | Phase 7 | Pending |
| EXEC-05 | Phase 7 | Pending |
| TRACK-01 | Phase 8 | Pending |
| TRACK-02 | Phase 8 | Pending |
| TRACK-03 | Phase 8 | Pending |
| TRACK-04 | Phase 8 | Pending |
| OPS-01 | Phase 8 | Pending |
| OPS-02 | Phase 8 | Pending |
| OPS-03 | Phase 8 | Pending |
| DEX-01 | Phase 9 | Pending |
| DEX-02 | Phase 9 | Pending |
| DEX-03 | Phase 9 | Pending |
| DEX-04 | Phase 10 | Pending |
| DEX-05 | Phase 10 | Pending |
| DEX-06 | Phase 10 | Pending |

**Coverage:**
- v1.1 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0

---
*Requirements defined: 2026-02-19*
*Last updated: 2026-02-19 after roadmap creation*
