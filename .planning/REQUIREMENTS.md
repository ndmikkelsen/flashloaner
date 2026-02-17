# Requirements: Flashloaner Multi-Chain Expansion

**Defined:** 2026-02-16
**Core Value:** The bot must never lose funds beyond gas costs — every transaction either profits or reverts.

## v1 Requirements

Requirements for Arbitrum testnet validation milestone.

### Chain Research

- [x] **CHAIN-01**: Research identifies optimal chain for small-capital arb with data-backed ranking
- [x] **CHAIN-02**: Selected chain has Aave V3 flash loan support confirmed with pool addresses
- [x] **CHAIN-03**: Selected chain has Uniswap V2/V3 fork DEXs with sufficient liquidity for arb

### Contract Deployment

- [x] **DEPLOY-01**: Existing FlashloanExecutor deploys successfully to Arbitrum Sepolia testnet
- [x] **DEPLOY-02**: Existing DEX adapters (UniswapV2, UniswapV3) work with Arbitrum DEX forks
- [x] **DEPLOY-03**: ProfitValidator and CircuitBreaker deploy and function correctly on Arbitrum
- [x] **DEPLOY-04**: Contract addresses and deployment artifacts are recorded for the testnet

### Bot Adaptation

- [x] **BOT-01**: Bot connects to Arbitrum Sepolia via RPC and reads on-chain data
- [x] **BOT-02**: Chain-specific configuration (RPC endpoint, contract addresses, token addresses, pool configs)
- [x] **BOT-03**: Bot detects arbitrage opportunities on Arbitrum testnet DEX pools
- [x] **BOT-04**: L2 gas estimation accounts for Arbitrum's gas model (L2 execution cost)
- [x] **BOT-05**: Dry-run mode reports opportunities with Arbitrum-accurate gas estimates

### Testnet Validation

- [ ] **TEST-01**: Bot runs on Arbitrum Sepolia for 1+ hours without errors
- [ ] **TEST-02**: Bot detects and reports at least 1 arb opportunity on testnet
- [ ] **TEST-03**: eth_call simulation works correctly on Arbitrum Sepolia
- [ ] **TEST-04**: All existing tests (Solidity + TypeScript) continue to pass after changes

### Monorepo Structure

- [x] **REPO-01**: Chain-specific config is separated from shared bot logic
- [x] **REPO-02**: Adding a new chain requires only config files, not code changes to shared modules
- [x] **REPO-03**: Ethereum config continues to work alongside Arbitrum config

## v2 Requirements

Deferred to future milestones. Not in current roadmap.

### Multi-Chain Expansion

- **MULTI-01**: Base chain deployment with Aerodrome DEX adapter
- **MULTI-02**: Polygon chain deployment with QuickSwap adapter
- **MULTI-03**: Multi-RPC failover with automatic provider switching
- **MULTI-04**: WebSocket event-driven monitoring (replace polling)

### Production Readiness

- **PROD-01**: Mainnet deployment with $50-100 canary capital
- **PROD-02**: Real P&L tracking and profitability analysis
- **PROD-03**: Chain-specific MEV protection (private mempools on L2s)
- **PROD-04**: Process management (pm2) for persistent bot operation

### Advanced Features

- **ADV-01**: Chain-specific DEX adapters (Camelot on Arbitrum, Aerodrome on Base)
- **ADV-02**: Triangle/cyclic arbitrage paths
- **ADV-03**: Cross-DEX liquidity fragmentation detection

## Out of Scope

| Feature | Reason |
|---------|--------|
| Ethereum mainnet deployment | Too saturated for small capital, gas costs eat profits |
| Cross-chain arbitrage | Bridge fees erase profit, no atomic execution, 7-day finality |
| Non-EVM chains | Requires contract rewrites, defer to future milestone |
| Custom flash loan protocol | Aave V3/Balancer cover 95%+ of use cases |
| Real mainnet trading | Research + testnet validation only for this milestone |
| Advanced MEV strategies | Focus on simple DEX arb first |
| WebSocket monitoring | Polling sufficient for testnet validation |
| Multi-RPC failover | Single RPC sufficient for testnet |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CHAIN-01 | Phase 1 | Complete |
| CHAIN-02 | Phase 1 | Complete |
| CHAIN-03 | Phase 1 | Complete |
| DEPLOY-01 | Phase 2 | Complete |
| DEPLOY-02 | Phase 2 | Complete |
| DEPLOY-03 | Phase 2 | Complete |
| DEPLOY-04 | Phase 2 | Complete |
| BOT-01 | Phase 3 | Complete |
| BOT-02 | Phase 3 | Complete |
| BOT-03 | Phase 3 | Complete |
| BOT-04 | Phase 3 | Complete |
| BOT-05 | Phase 3 | Complete |
| TEST-01 | Phase 4 | Pending |
| TEST-02 | Phase 4 | Pending |
| TEST-03 | Phase 4 | Pending |
| TEST-04 | Phase 4 | Pending |
| REPO-01 | Phase 2 | Complete |
| REPO-02 | Phase 2 | Complete |
| REPO-03 | Phase 2 | Complete |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-16*
*Last updated: 2026-02-16 after roadmap creation*
