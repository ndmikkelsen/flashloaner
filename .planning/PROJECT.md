# Flashloaner

## What This Is

A multi-chain flashloan arbitrage system — on-chain Solidity contracts for atomic flash loan execution and DEX swaps, plus an off-chain TypeScript bot for opportunity detection and execution. The system detects price discrepancies across DEX pools, borrows via flash loans, executes multi-hop swaps, and captures the spread — all in a single atomic transaction that reverts if unprofitable. Now deployed on Arbitrum with multi-DEX monitoring across 22 pools, pool-aware dynamic slippage estimation, and L1+L2 dual-component gas modeling.

## Core Value

The bot must never lose funds beyond gas costs — the 4-layer safety system (off-chain estimate, eth_call simulation, on-chain ProfitValidator, MEV protection) ensures every transaction either profits or reverts.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Flash loan execution via Aave V3, Balancer, Uniswap V3, dYdX — existing
- ✓ DEX swap adapters for Uniswap V2 and V3 — existing
- ✓ On-chain ProfitValidator with formal verification — existing
- ✓ CircuitBreaker with access control and failure tracking — existing
- ✓ Off-chain price monitoring and opportunity detection — existing
- ✓ Transaction building with encoded calldata — existing
- ✓ ExecutionEngine with eth_call simulation pre-flight — existing
- ✓ MEV protection via Flashbots relay and MEV Blocker — existing
- ✓ HealthMonitor with balance alerts, P&L tracking, error rate — existing
- ✓ Dry-run mode with detailed reporting — existing
- ✓ Security audit (10 findings, 4 fixed, 6 acknowledged) — existing
- ✓ 735 tests (312 Solidity + 423 TypeScript), 0 failures — existing
- ✓ Sepolia testnet validation (2,227 opportunities, 0 errors) — existing
- ✓ Arbitrum validated as optimal chain for small-capital arb (52.6% success rate) — v1.0
- ✓ 5 contracts deployed to Arbitrum Sepolia (FlashloanExecutor, ProfitValidator, CircuitBreaker, UniV2/V3 adapters) — v1.0
- ✓ Multi-chain config system (loadChainConfig, chain-specific pools/tokens) — v1.0
- ✓ ArbitrumGasEstimator with L1+L2 dual-component model — v1.0
- ✓ Arbitrum Sepolia testnet validation (62m53s, 3,769 opportunities, 0 errors) — v1.0
- ✓ Multi-chain monorepo structure (adding new chain = 1 config file + 1 switch case) — v1.0

### Active

<!-- Current scope. Building toward these. -->

- [ ] Consistent mainnet profitability: 24+ hours net-positive P&L on Arbitrum mainnet
- [ ] Cross-fee-tier routing (0.05% + 0.3% pairs for 0.35% cost floor instead of 0.6%)
- [ ] Expanded DEX coverage (Trader Joe, Ramses, Zyberswap) for wider cross-DEX spreads
- [ ] Optimal input sizing per-opportunity based on pool depth and liquidity
- [ ] Live execution via FlashloanExecutor with flash-loan-only trades (zero capital risk)
- [ ] P&L dashboard with trade history, profit tracking, and summary statistics
- [ ] Process management (pm2) for persistent bot operation with auto-restart

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Ethereum mainnet deployment — too saturated for small capital, gas costs eat profits
- Non-EVM chain contracts — may add alongside EVM contracts in future milestones
- Advanced strategies (sandwich, liquidation, JIT) — focus on simple DEX arb first
- Cross-chain arbitrage — bridge fees erase profit, no atomic execution, 7-day finality
- WebSocket monitoring — polling sufficient for current iteration speed
- Multi-RPC failover — single RPC sufficient until production volume warrants it

## Context

Shipped v1.0 with 17,418 LOC TypeScript + Solidity contracts. Tech stack: Foundry, ethers.js v6, Vitest, Node.js.

**Current state:** Bot monitors 22 Arbitrum mainnet pools across Uniswap V3, SushiSwap V2/V3, and Camelot V2/V3. Dynamic pool-aware slippage estimation uses AMM simulation with V2 reserves and V3 virtual liquidity. Mainnet dry-runs show 0.01-1.68% cross-DEX spreads, but most are unprofitable after fees+slippage (same fee-tier pairs have 0.6% minimum cost floor).

**Key finding from mainnet dry-runs:** The profitable path requires cross-fee-tier routing (0.05% + 0.3% = 0.35% cost floor instead of 0.6%), more DEX coverage for wider spreads, and optimal input sizing relative to pool depth. GMX/WETH 1.68% spread was a trap — thin V3 liquidity at the 1% fee tier caused -4.7 ETH simulated loss.

772 tests passing (312 Solidity + 460 TypeScript).

## Constraints

- **Capital**: $500-$1,000 starting capital — gas costs must be negligible relative to profits
- **EVM preferred**: Existing contracts and bot reuse with minimal changes
- **Monorepo**: All chain implementations live in this repository
- **Safety**: 4-layer safety system must be preserved on any new chain
- **Flash loans**: Balancer V2 (0% fee) preferred; Aave V3 (0.05% fee) as backup
- **Arbitrum specifics**: FCFS sequencer ordering (latency > gas bidding), no Flashbots, L1 data fees = 95% of gas costs

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Move away from Ethereum mainnet | Too saturated for small capital, gas too high | ✓ Good — Arbitrum gas is $0.01 vs $5-50 on Ethereum |
| EVM-first chain selection | Reuse existing Solidity contracts and ethers.js bot | ✓ Good — zero contract changes needed |
| Research + testnet only for v1 | Validate before risking real funds | ✓ Good — caught many issues before mainnet |
| Monorepo architecture | Single repo for all chain implementations | ✓ Good — loadChainConfig(chainId) pattern works well |
| Arbitrum chosen over Base/Optimism | 52.6% success rate vs 6.3% (Base), 12% (Optimism) | ✓ Good — validated on both testnet and mainnet |
| QuickNode as primary RPC | Alchemy lacks trace API on Arbitrum | ✓ Good — trace API available when needed |
| Dual-component gas model | L1 data fees = 95% of total cost on Arbitrum | ✓ Good — ArbitrumGasEstimator with NodeInterface works |
| FCFS sequencer ordering | No Flashbots on L2, latency > gas bidding | ✓ Good — simplified MEV strategy |
| Balancer V2 for flash loans | 0% fee vs Aave's 0.05% | ✓ Good — same address on all EVM chains via CREATE2 |
| SushiSwap V2 as UniV2 equivalent | Same interface on Arbitrum | ✓ Good — existing adapter works unchanged |
| Pool-aware dynamic slippage | Static 0.1% model was inaccurate | ✓ Good — catches thin liquidity traps, accurate for deep pools |

## Current Milestone: v1.1 Mainnet Profitability

**Goal:** Achieve consistent net-positive arbitrage trading on Arbitrum mainnet with flash-loan-only execution (zero capital risk beyond gas).

**Target features:**
- Cross-fee-tier routing to reduce minimum cost floor from 0.6% to 0.35%
- Expanded DEX coverage (Trader Joe, Ramses, Zyberswap) for wider spreads
- Live transaction execution via FlashloanExecutor (flash loans only, reverts if unprofitable)
- Optimal input sizing per-opportunity based on pool depth
- P&L dashboard and trade history tracking
- pm2 process management for persistent operation

**Success bar:** Bot runs 24+ hours on Arbitrum mainnet with net-positive P&L after gas costs.

---
*Last updated: 2026-02-19 after v1.1 milestone start*
