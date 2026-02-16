# Flashloaner

## What This Is

A multi-chain flashloan arbitrage system — on-chain Solidity contracts for atomic flash loan execution and DEX swaps, plus an off-chain TypeScript bot for opportunity detection and execution. The system detects price discrepancies across DEX pools, borrows via flash loans, executes multi-hop swaps, and captures the spread — all in a single atomic transaction that reverts if unprofitable. Currently built for Ethereum, expanding to lower-cost chains where small capital ($500-$1,000) can profitably arb.

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

### Active

<!-- Current scope. Building toward these. -->

- [ ] Research and select optimal chain(s) for small-capital arb ($500-$1,000)
- [ ] Deploy contracts to selected chain's testnet
- [ ] Adapt bot configuration for selected chain (RPC, pools, tokens)
- [ ] Validate arb detection on selected chain's testnet
- [ ] Multi-chain monorepo structure (chain-specific configs alongside existing Ethereum code)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Ethereum mainnet deployment — too saturated for small capital, gas costs eat profits
- Non-EVM chain contracts (this milestone) — may add alongside EVM contracts in future milestones
- Live mainnet trading with real funds (this milestone) — research + testnet validation only
- Multi-DEX adapter expansion — existing V2/V3 adapters sufficient for initial chain deployment
- Advanced strategies (sandwich, liquidation, JIT) — focus on simple DEX arb first

## Context

The system is production-ready for Ethereum but Ethereum mainnet is dominated by sophisticated searchers with massive capital and direct builder relationships. With $500-$1,000 starting capital, the strategy is to find chains where:
- Gas costs are sub-cent (making 0.1% spreads profitable)
- DEX liquidity exists but competition is lower
- Flash loan providers are available (Aave V3 is deployed on many L2s/alt-L1s)
- Uniswap V2/V3 forks are present (reuse existing adapters)

The codebase is EVM-first with Solidity contracts and ethers.js v6. EVM-compatible chains require minimal changes. Non-EVM chains would be implemented as separate bot modules in the same monorepo.

Codebase map available at `.planning/codebase/` (7 documents, 2,819 lines).

## Constraints

- **Capital**: $500-$1,000 starting capital — gas costs must be negligible relative to profits
- **EVM preferred**: Existing contracts and bot reuse with minimal changes
- **Monorepo**: All chain implementations live in this repository
- **Timeline**: 1-2 weeks to research + testnet validation
- **Safety**: 4-layer safety system must be preserved on any new chain
- **Flash loans**: Target chain must have flash loan providers (Aave V3, or equivalent)

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Move away from Ethereum mainnet | Too saturated for small capital, gas too high | — Pending |
| EVM-first chain selection | Reuse existing Solidity contracts and ethers.js bot | — Pending |
| Research + testnet only for v1 | Validate before risking real funds | — Pending |
| Monorepo architecture | Single repo for all chain implementations | — Pending |

---
*Last updated: 2026-02-16 after initialization*
