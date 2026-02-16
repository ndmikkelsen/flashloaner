# Roadmap: Flashloaner Multi-Chain Expansion

## Overview

Transform the production-ready Ethereum flashloan arbitrage system into a multi-chain bot by deploying to Arbitrum Sepolia testnet. Research validates Arbitrum as optimal for small capital ($500-$1,000) with 52.6% success rates and ultra-low gas costs. The journey: research the target chain, deploy existing contracts to testnet, adapt the bot configuration for Arbitrum, and validate opportunity detection and execution over 1+ hours of live testnet operation.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Chain Research** - Validate Arbitrum as optimal chain for small-capital arb
- [ ] **Phase 2: Infrastructure Setup** - Deploy contracts to Arbitrum Sepolia and configure monorepo
- [ ] **Phase 3: Bot Adaptation** - Adapt bot for Arbitrum RPC, gas model, and DEX pools
- [ ] **Phase 4: Testnet Validation** - Run bot on Arbitrum Sepolia for 1+ hours, validate detection and execution

## Phase Details

### Phase 1: Chain Research
**Goal**: Validate Arbitrum as the optimal chain for small-capital arbitrage with data-backed evidence
**Depends on**: Nothing (first phase)
**Requirements**: CHAIN-01, CHAIN-02, CHAIN-03
**Success Criteria** (what must be TRUE):
  1. Research identifies Arbitrum as optimal chain with documented ranking (gas costs, DEX volume, flash loan availability, MEV competition)
  2. Arbitrum Sepolia testnet has confirmed Aave V3 flash loan pool addresses and availability
  3. Arbitrum has Uniswap V2/V3 fork DEXs with sufficient liquidity for arb testing (pool addresses documented)
**Plans**: 1 plan in 1 wave

Plans:
- [ ] 01-01-PLAN.md — Document Arbitrum validation findings into deployment-ready reference materials

### Phase 2: Infrastructure Setup
**Goal**: Deploy contracts to Arbitrum Sepolia and establish monorepo structure for multi-chain support
**Depends on**: Phase 1
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04, REPO-01, REPO-02, REPO-03
**Success Criteria** (what must be TRUE):
  1. FlashloanExecutor deploys successfully to Arbitrum Sepolia and deployment artifact is recorded
  2. ProfitValidator and CircuitBreaker deploy to Arbitrum Sepolia and function correctly (constructor args work, access control set)
  3. Existing UniswapV2 and UniswapV3 adapters work with Arbitrum DEX forks (SushiSwap, Uniswap V3)
  4. Monorepo has chain-specific config files (Arbitrum config exists alongside Ethereum config)
  5. Adding a new chain requires only config files, not code changes to shared bot modules
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: Bot Adaptation
**Goal**: Adapt bot to connect to Arbitrum Sepolia and detect arbitrage opportunities with Arbitrum-accurate gas estimates
**Depends on**: Phase 2
**Requirements**: BOT-01, BOT-02, BOT-03, BOT-04, BOT-05
**Success Criteria** (what must be TRUE):
  1. Bot connects to Arbitrum Sepolia via RPC and reads on-chain data (block number, pool reserves, balances)
  2. Chain-specific configuration loaded from config file includes RPC endpoint, contract addresses, token addresses, pool configs
  3. Bot detects arbitrage opportunities on Arbitrum testnet DEX pools (monitors prices, identifies spreads)
  4. L2 gas estimation accounts for Arbitrum's gas model (L2 execution cost, not just L1 data cost)
  5. Dry-run mode reports opportunities with Arbitrum-accurate gas estimates and profitability calculations
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: Testnet Validation
**Goal**: Validate bot runs stably on Arbitrum Sepolia for 1+ hours and detects/simulates opportunities correctly
**Depends on**: Phase 3
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04
**Success Criteria** (what must be TRUE):
  1. Bot runs on Arbitrum Sepolia for 1+ hours without crashes, connection failures, or uncaught errors
  2. Bot detects and reports at least 1 arbitrage opportunity during the test run (logs show spread, path, estimated profit)
  3. eth_call simulation works correctly on Arbitrum Sepolia (pre-flight checks pass, reverts are caught)
  4. All existing tests (312 Solidity + 423 TypeScript = 735 total) continue to pass after Arbitrum changes
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Chain Research | 0/1 | Not started | - |
| 2. Infrastructure Setup | 0/2 | Not started | - |
| 3. Bot Adaptation | 0/2 | Not started | - |
| 4. Testnet Validation | 0/1 | Not started | - |
