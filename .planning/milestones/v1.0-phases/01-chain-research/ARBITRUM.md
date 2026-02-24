# Arbitrum Reference Documentation

**Chain:** Arbitrum One (Mainnet) / Arbitrum Sepolia (Testnet)
**Purpose:** Deployment-ready reference for Phase 2 (Infrastructure Setup) and Phase 3 (Bot Adaptation)
**Created:** 2026-02-16
**Source:** Phase 1 Research (01-RESEARCH.md)

---

## 1. Chain Validation Summary

**DECISION: Arbitrum is the optimal first-target chain for small-capital flashloan arbitrage ($500-$1,000).**

### Arbitrum vs Competitors

| Metric | Arbitrum | Base | Optimism | Winner |
|--------|----------|------|----------|--------|
| **Success Rate** | **52.6%** | 6.3% | 12% | **Arbitrum (8x better than Base)** |
| **MEV Competition** | **7% cyclic arb** | 51% cyclic arb | 55% cyclic arb | **Arbitrum (lowest)** |
| **TVL** | $3.86B | $4.32B | $2.1B | Base |
| **Daily DEX Volume** | $1.3B | ~$2.5B | $800M | Base |
| **Gas Cost (avg)** | $0.01 | $0.005 | $0.01 | Base |
| **Block Time** | **0.25s** | 2s | 2s | **Arbitrum (fastest)** |
| **Flash Loan TVL** | **$2.2B** (Aave V3) | Growing | $1.5B | **Arbitrum** |

### Key Insight

> **Arbitrum's 52.6% success rate is 8.4x better than Base's 6.3%.** With small capital ($500-$1,000), success rate matters more than volume. Base's higher volume benefits large, sophisticated bots, but 93.7% failure rate on Base wastes gas with every failed attempt.

### Justification for Arbitrum First

1. **Success rate paramount for small capital**: Cannot afford 93.7% failure rate on Base
2. **Lower MEV competition**: 7% cyclic arb ratio vs 51% (Base) and 55% (Optimism)
3. **Proven DeFi ecosystem**: $3.86B TVL, 400+ protocols, mature flash loan infrastructure
4. **Deep liquidity**: $1.3B daily DEX volume, top pairs (WETH/USDC, ARB/USDT) with $100M+ liquidity
5. **Faster blocks**: 0.25s block time = tighter arbitrage windows, faster opportunity detection
6. **Established flash loans**: Aave V3 with $2.2B TVL, plus Balancer V2 (zero-fee)

---

## 2. Mainnet Configuration

**Chain ID**: `42161` (Arbitrum One)

**Network Name**: Arbitrum One

**Block Time**: ~0.25 seconds (4x faster than Ethereum, requires faster bot polling)

**Finality**: 7 days to L1 (optimistic rollup challenge period); accept soft finality for same-chain arbitrage

**Average TPS**: 20+

**Consensus**: Centralized sequencer (single point of failure, decentralization planned late 2026)

### RPC Endpoints

| Provider | URL Template | Features | Cost | Trace API | Recommendation |
|----------|-------------|----------|------|-----------|----------------|
| **QuickNode** | Custom endpoint (signup required) | Multi-region, auto-failover, 1500 RPS | $50-100/month | **YES** (20x base + 40-80x for trace) | **PRIMARY** - Required for Arbitrum trace API |
| **Infura** | `https://arbitrum-mainnet.infura.io/v3/API_KEY` | Broad chain support | Free tier + subscription | **YES** | **FALLBACK** - Reliable secondary |
| **Alchemy** | `https://arb-mainnet.g.alchemy.com/v2/API_KEY` | 99.99% uptime, 100 req/s free tier | Free tier + pay-as-you-go | **NO** | **NOT RECOMMENDED** - Lacks trace API on Arbitrum |
| **Public RPC** | `https://arb1.arbitrum.io/rpc` | Free, no auth | Free | **NO** | **TESTING ONLY** - Rate limited, no WebSocket |

**CRITICAL NOTE**: Alchemy does NOT support trace API on Arbitrum. Use QuickNode (primary) or Infura (fallback) for production.

### Block Explorer

**Arbiscan**: https://arbiscan.io/

**Features**: Contract verification, transaction trace, token analytics, DEX pool explorer

### Gas Model

**Type**: Dual-component (L2 execution + L1 data posting)

**Formula**:
```
Total Gas = L2 Execution Cost + (L1 Estimated Cost / L2 Gas Price)

L1 Estimated Cost = L1 Gas Price × Compressed Calldata Size × 16
Compressed Calldata Size = brotli-zero(transaction_data).length
```

**ArbGas Calculation**:
- Non-zero byte: ~2,116 ArbGas
- Zero byte: ~460 ArbGas

**Average Transaction Cost**: $0.01 (post-Dencun upgrade)

**CRITICAL PITFALL**: L1 data fees represent **95% of total transaction cost**. Teams often calculate profitability using only L2 execution costs, ignoring L1 calldata charges priced at Ethereum mainnet gas rates. A 2% arbitrage opportunity becomes a loss if total gas is 2.5%.

**Prevention Strategy**:
1. Implement dual-component profit calculation: `profit_threshold = (L2_execution_cost + L1_data_fee) + safety_margin + min_profit`
2. Monitor **Ethereum mainnet basefee** in real-time (not just Arbitrum basefee)
3. Use conservative estimation: worst-case L1 calldata size (pre-compression)
4. Track exponential moving average of actual L1 costs vs estimates; halt if variance >20%

**References**:
- [Arbitrum Gas and Fees](https://docs.arbitrum.io/how-arbitrum-works/deep-dives/gas-and-fees)
- [Arbitrum L1 Gas Pricing](https://docs.arbitrum.io/how-arbitrum-works/l1-gas-pricing)
- [How to Estimate Gas in Arbitrum](https://docs.arbitrum.io/build-decentralized-apps/how-to-estimate-gas)

---

## 3. Testnet Configuration (Arbitrum Sepolia)

**Chain ID**: `421614`

**Network Name**: Arbitrum Sepolia

**RPC Endpoint**: `https://sepolia-rollup.arbitrum.io/rpc`

**Purpose**: Contract deployment, flash loan integration, DEX swap testing before mainnet

**Limitation**: Testnet has fake/sparse liquidity, no real MEV competition, permissioned validator set. Use for logic validation only, NOT performance testing. Use Anvil/Hardhat mainnet fork for realistic testing.

### Faucets

1. **Chainlink Faucet**: https://faucets.chain.link/arbitrum-sepolia
   - Rate: 1 drip per 12 hours
   - Requires: Ethereum Sepolia ETH (bridge to Arbitrum Sepolia)

2. **Alchemy Faucet**: https://www.alchemy.com/faucets/arbitrum-sepolia
   - Rate: Free testnet ETH
   - Requires: Alchemy account

3. **QuickNode Faucet**: https://faucet.quicknode.com/arbitrum/sepolia
   - Rate: 1 drip per 12 hours
   - Requires: QuickNode account

4. **L2 Faucet**: https://www.l2faucet.com/arbitrum
   - Rate: Device attestation-based
   - Requires: No social verification

### Block Explorer

**Arbiscan Sepolia**: https://sepolia.arbiscan.io/

**Features**: Same as mainnet Arbiscan (contract verification, transaction trace, etc.)

---

## 4. Flash Loan Providers

### Aave V3 (Primary Provider)

**Pool Address** (same on mainnet and Sepolia via CREATE2):
```
0x794a61358D6845594F94dc1DB02A252b5b4814aD
```

**TVL on Arbitrum Mainnet**: $2.2B (2nd largest Aave deployment after Ethereum)

**Fee**: 0.09% (adjustable by governance, down from 0.05%)

**Supported Assets**:
- WETH (Wrapped Ether)
- USDC (native - Circle-issued)
- USDT (Tether)
- WBTC (Wrapped Bitcoin)
- ARB (Arbitrum token)
- DAI (MakerDAO stablecoin)
- More assets available via `getReserveData()`

**Testnet Deployment** (Arbitrum Sepolia):
- Pool: `0x794a61358D6845594F94dc1DB02A252b5b4814aD` (same address as mainnet)
- Pool Data Provider: `0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654`

**Key Advantage**: Same contract address across chains simplifies multi-chain development.

**L2Pool Optimization**: On L2s, use calldata-optimized L2Pool extension for gas savings.

**References**:
- [Aave V3 Testnet Addresses](https://docs.aave.com/developers/deployed-contracts/v3-testnet-addresses)
- [Aave Addresses Dashboard](https://aave.com/docs/resources/addresses)
- [Aave L2Pool](https://aave.com/docs/aave-v3/smart-contracts/l2-pool)
- [Aave V3 Pool on Arbiscan](https://arbiscan.io/address/0x794a61358d6845594f94dc1db02a252b5b4814ad)

### Balancer V2 (Zero-Fee Alternative)

**Vault Address**: [TBD - verify via Balancer deployment docs during Phase 2]

**Fee**: 0% (set at deployment, not changed by governance)

**Liquidity**: $1B+ vault liquidity (combined across all pools on Arbitrum)

**Key Advantage**: Zero-fee flash loans maximize net returns on thin margins.

**Trade-off**: Smaller asset selection than Aave, but zero fees offset this.

**Recommendation**: Implement multi-provider failover:
1. Try Balancer (0% fee, cheapest)
2. Fall back to Aave V3 (0.09% fee, most reliable)
3. Fall back to Uniswap V3 (0.3% fee, ubiquitous)

**Action Item for Phase 2**: Query Balancer deployment docs to get Vault address.

### Uniswap V3 Flash Swaps (Tertiary Fallback)

**Fee**: 0.3% pool fee (standard Uniswap V3 fee tier)

**Availability**: Deployed on Arbitrum mainnet and Sepolia

**Factory Address**:
```
0x1F98431c8aD98523631AE4a59f267346ea31F984
```

**SwapRouter**:
```
0xE592427A0AEce92De3Edee1F18E0157C05861564
```

**SwapRouter02** (recommended):
```
0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45
```

**References**:
- [Uniswap Arbitrum Deployments](https://docs.uniswap.org/contracts/v3/reference/deployments/arbitrum-deployments)

---

## 5. DEX Ecosystem

### DEX Landscape (2026)

**Total Arbitrum DEX Volume**: $1.3B daily (6.9% of all chains)

**Top DEXs by Volume**:

| DEX | Type | Daily Volume | TVL | Contract Addresses |
|-----|------|--------------|-----|-------------------|
| **Uniswap V3** | Concentrated liquidity | Dominant | Highest | See below |
| **Trader Joe** | Native AMM | $175M (24h) | $57M | [TBD] |
| **Camelot** | Native AMM | High | Strong | See below |
| **SushiSwap V2** | Classic AMM | Established | Medium | See below |
| **SushiSwap V3** | Concentrated liquidity | Growing | Medium | See below |

### Uniswap V3 (Dominant DEX)

**Factory**: `0x1F98431c8aD98523631AE4a59f267346ea31F984`

**SwapRouter**: `0xE592427A0AEce92De3Edee1F18E0157C05861564`

**SwapRouter02** (recommended): `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45`

**Key Features**:
- Concentrated liquidity (capital efficiency)
- Multiple fee tiers (0.01%, 0.05%, 0.3%, 1%)
- Best liquidity depth on Arbitrum
- Proven reliability

**Top Pairs**:

1. **WETH/USDC** (0.05% fee)
   - Pool: `0xC31E54c7a869B9FcBEcc14363CF510d1c41fa443`
   - Volume: High
   - Liquidity: $100M+

2. **WETH/USDT** (0.05% fee)
   - Pool: `0x641c00a822e8b671738d32a431a4fb6074e5c79d`
   - Volume: High
   - Liquidity: Complementary to WETH/USDC

**References**:
- [Uniswap V3 Deployment Addresses](https://docs.uniswap.org/contracts/v3/reference/deployments/)
- [Uniswap Arbitrum Deployments](https://docs.uniswap.org/contracts/v3/reference/deployments/arbitrum-deployments)

### Camelot (Arbitrum-Native DEX)

**Mainnet**:
- Router: `0xc873fecbd354f5a56e00e710b90ef4201db2448d`
- Router v3: `0x1f721e2e82f6676fce4ea07a5958cf098d339e18`

**Sepolia Testnet**:
- Factory: `0x18E621B64d7808c3C47bccbbD7485d23F257D26f`
- Router: `0x171B925C51565F5D2a7d8C494ba3188D304EFD93`
- AlgebraFactory: `0xaA37Bea711D585478E1c04b04707cCb0f10D762a`

**Key Features**:
- Arbitrum-specific optimizations
- Strong TVL
- Active community

**References**:
- [Camelot Arbitrum Mainnet Contracts](https://docs.camelot.exchange/contracts/arbitrum/one-mainnet)
- [Camelot Sepolia Testnet Contracts](https://docs.camelot.exchange/contracts/arbitrum/sepolia-testnet)

### SushiSwap (Established DEX)

**Router V2**: `0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506`

**Factory V2**: `0xc35DADB65012eC5796536bD9864eD8773aBc74C4`

**Trident Router (V3)**: `0xD9988b4B5bBC53A794240496cfA9Bf5b1F8E0523`

**Route Processor v3.2**: `0x09bD2A33c47746fF03b86BCe4E885D03C74a8E8C`

**Key Features**:
- Classic AMM (V2) + concentrated liquidity (V3)
- Proven reliability
- Medium TVL, established

**References**: Arbiscan contract lookups

---

## 6. Token Addresses (Arbitrum Mainnet)

### CRITICAL: Native vs Bridged Tokens

**Pitfall**: Same stablecoin exists as multiple versions on L2s:
- **Native USDC**: Directly minted by Circle on Arbitrum
- **USDC.e (bridged)**: Locked on Ethereum, minted by bridge (legacy)

**Risk**: Flash loan contract reverts if borrowed USDC.e cannot be used in native USDC pool. Even after native USDC introduction, bridged token trading remains stable, so both versions persist.

**Prevention Strategy**:
1. Explicit token versioning: Maintain separate price feeds for USDC vs USDC.e
2. Address verification: Hardcode canonical token addresses per chain
3. Pool compatibility matrix: Map which DEXs support which token versions
4. Symbol disambiguation: Use `arbitrum-usdc-native` vs `arbitrum-usdc-bridged` in internal logic

### Core Token Addresses

**WETH (Wrapped Ether)**:
```
0x82af49447d8a07e3bd95bd0d56f35241523fbab1
```

**USDC (Native - Circle-issued)**:
```
0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8
```
- Reference: [Arbitrum USDC Docs](https://docs.arbitrum.io/arbitrum-bridge/usdc-arbitrum-one)

**USDC.e (Bridged - Legacy)**:
```
[TBD - verify via Arbiscan or Circle docs during Phase 2]
```

**USDT (Tether)**:
```
0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9
```

**WBTC (Wrapped Bitcoin)**:
```
[TBD - verify via Arbiscan during Phase 2]
```

**ARB (Arbitrum Token)**:
```
[TBD - verify via Arbitrum DAO docs during Phase 2]
```

**DAI (MakerDAO Stablecoin)**:
```
[TBD - verify via Arbiscan during Phase 2]
```

**Action Items for Phase 2**:
- Query Arbiscan to verify WBTC and ARB addresses
- Check Circle docs to confirm USDC.e bridged address
- Verify DAI address via Arbiscan

**References**: [Arbiscan Token Tracker](https://arbiscan.io/tokens)

---

## 7. Gas Cost Model

### Average Cost

**Per Transaction**: $0.01 average (post-Dencun upgrade)

**Cost Breakdown**:
- L2 Execution Cost: ~5% of total (cheap, ~0.1 Gwei for computation)
- L1 Data Posting Cost: **~95% of total** (dominant, priced at Ethereum mainnet gas rates)

### Dual-Component Gas Calculation

**Formula**:
```
Total Gas = L2 Gas + (L1 Estimated Cost / L2 Gas Price)

L1 Estimated Cost = L1 Gas Price × Compressed Calldata Size × 16
Compressed Calldata Size = brotli-zero(transaction_data).length
```

**ArbGas Calculation**:
- Non-zero byte: ~2,116 ArbGas
- Zero byte: ~460 ArbGas

### Critical Profitability Consideration

**Pitfall**: L1 data fees represent **95% of total transaction cost**. Teams calculate profitability using only L2 execution costs, ignoring L1 calldata charges priced at Ethereum mainnet gas rates.

**Example**:
- Detected spread: 2.0%
- L2 execution cost: 0.1% (seems profitable)
- L1 data fee: 2.4% (ignored)
- **Total cost: 2.5% → LOSS despite 2% spread**

### Prevention Strategy for Phase 3

1. **Dual-component profit calculation**:
   ```
   profit_threshold = (L2_execution_cost + L1_data_fee) + safety_margin + min_profit
   ```

2. **Monitor Ethereum mainnet basefee in real-time** (not just Arbitrum basefee)
   - Use `eth_gasPrice` on Ethereum mainnet RPC
   - Track exponential moving average

3. **Conservative estimation**: Use worst-case L1 calldata size (pre-compression)
   - Estimate transaction size before compression
   - Apply conservative compression ratio (e.g., 1.5x instead of 3x)

4. **Variance tracking**: Halt if actual L1 costs deviate from estimates by >20%
   - Track exponential moving average of (actual_L1_cost / estimated_L1_cost)
   - Halt execution if EMA >1.2 or <0.8

### References

- [Arbitrum Gas and Fees](https://docs.arbitrum.io/how-arbitrum-works/deep-dives/gas-and-fees)
- [Arbitrum L1 Gas Pricing](https://docs.arbitrum.io/how-arbitrum-works/l1-gas-pricing)
- [How to Estimate Gas in Arbitrum](https://docs.arbitrum.io/build-decentralized-apps/how-to-estimate-gas)

---

## 8. MEV Landscape

### Competition Analysis

| Metric | Arbitrum | Base | Optimism |
|--------|----------|------|----------|
| **Cyclic Arb % of Gas** | **7%** | 51% | 55% |
| **Success Rate** | **52.6%** | 6.3% | 12% |
| **Competition Level** | **MODERATE** | VERY HIGH | VERY HIGH |

**Key Insight**: Arbitrum's 7% cyclic arb ratio and 52.6% success rate suggest either:
1. Lower competition (fewer bots probing)
2. Better bot quality (more sophisticated detection)
3. Different mempool dynamics (less speculative submission)

**Result**: With 100 detected opportunities, Arbitrum yields ~53 successful executions vs ~6 on Base and ~12 on Optimism.

### MEV Protection (or Lack Thereof)

**CRITICAL FINDING**: Flashbots does NOT exist on Arbitrum. L2s use private centralized mempools visible only to the sequencer. No public mempool, no Flashbots equivalent.

**Sequencer Behavior**:
- **Centralized sequencer** (single entity, Offchain Labs)
- **First-Come-First-Served (FCFS) ordering** (no transaction priority via gas bidding)
- **Latency to sequencer determines priority** (not gas price)
- Single point of failure (sequencer downtime risk)

**Historical Incidents**:
- Arbitrum sequencer stalled during inscription craze
- No decentralized fallback until late 2026 (planned)

### TimeBoost (Arbitrum-Specific)

**What it is**: Express lane auction system (deployed 2025)

**Who controls it**: Two entities (Selini Capital, Wintermute) control 90% of express lane auctions

**Research findings**: Profitability clusters at block-end, undermining express lane value

**For small capital ($500-$1,000)**: Express lane auction fees likely exceed profit

**Recommendation**: Skip TimeBoost — not economical for small-capital bots

### Prevention Strategy for Phase 3

1. **Accept FCFS reality**: Latency optimization > gas bidding
   - Use geographically close RPC endpoints
   - Minimize network hops
   - Use WebSocket for faster block notifications (vs polling)

2. **Sequencer proximity**: Choose RPC provider with low latency to Arbitrum sequencer
   - Benchmark QuickNode vs Infura with `eth_blockNumber` calls
   - Track average response time, select fastest

3. **Profit threshold adjustment**: Increase minimum by 0.5-1% to account for MEV leakage
   - Assume 0.5-1% loss to faster bots in FCFS race
   - Only execute opportunities with >1.5-2% spread

4. **Skip TimeBoost**: Not economical for small-capital bots
   - Express lane auction fees likely exceed profit on <$1,000 trades
   - Re-evaluate if capital scales to $10,000+

### Sequencer Downtime Mitigation

1. **Multi-chain deployment**: Deploy to Base in parallel (Phase 2)
2. **Sequencer health monitoring**: Track block production rate
   - Alert if blocks stop appearing for >30 seconds
   - Pause execution if sequencer is down
3. **Emergency withdrawal plan**: Maintain flash loan provider addresses for manual intervention
4. **L1 escape hatch awareness**: 7-day forced inclusion for emergency (last resort)

### References

- Phase 1 Research: PITFALLS.md (MEV on L2s section)
- [Arbitrum Sequencer](https://docs.arbitrum.io/for-devs/concepts/sequencer)

---

## 9. Open Questions for Phase 2

### High Priority (Resolve Before Mainnet Deployment)

1. **WBTC and ARB token addresses on Arbitrum mainnet**
   - Action: Query Arbiscan token tracker or Arbitrum official docs
   - Needed for: Token address mapping in bot config
   - Timeline: Phase 2, Task 1

2. **USDC.e (bridged) address on Arbitrum**
   - Action: Check Arbiscan or Circle docs
   - Needed for: Explicit token versioning, avoid mixing native/bridged in pools
   - Timeline: Phase 2, Task 1

3. **Balancer V2 Vault address on Arbitrum**
   - Action: Check Balancer deployment docs
   - Needed for: Zero-fee flash loan integration
   - Timeline: Phase 2, Task 2

4. **Actual L1 data fee percentage of total gas cost**
   - Action: Deploy test transaction to Sepolia, measure L1 vs L2 breakdown via `eth_getTransactionReceipt`
   - Needed for: Validate 95% L1 fee claim, tune gas estimator
   - Timeline: Phase 2, Task 3

5. **QuickNode vs Infura RPC latency to Arbitrum sequencer**
   - Action: Benchmark both providers with 1000x `eth_blockNumber` calls, measure average response time
   - Needed for: Choose fastest primary RPC
   - Timeline: Phase 2, Task 4

### Medium Priority (Optimize After MVP)

6. **Real-time DEX liquidity depth on top pairs**
   - Action: Query pool reserves via Uniswap V3 subgraph or direct contract calls
   - Needed for: Validate $100M+ liquidity claim, set minimum thresholds
   - Timeline: Phase 3, post-testnet

7. **TimeBoost express lane economics**
   - Action: Research auction prices, success rates, profitability
   - Needed for: Decide if worth implementing for high-value opportunities
   - Timeline: Phase 4, post-mainnet canary

8. **Cross-DEX arbitrage vs single-DEX inefficiencies**
   - Action: Monitor Uniswap V3 vs Camelot vs SushiSwap price differences
   - Needed for: Determine which strategy has more opportunities
   - Timeline: Phase 4, post-mainnet canary

### Low Priority (Future Optimization)

9. **Arbitrum vs Base profitability head-to-head**
   - Action: Deploy to both chains, measure 30-day results
   - Needed for: Confirm Arbitrum's superiority or adjust allocation
   - Timeline: Post-v1 milestone

10. **Sequencer geographic location**
    - Action: Research Arbitrum sequencer infrastructure, data center location
    - Needed for: Optimal RPC provider data center selection
    - Timeline: Post-v1 milestone

---

## References

### Official Documentation

- [Arbitrum Gas and Fees](https://docs.arbitrum.io/how-arbitrum-works/deep-dives/gas-and-fees)
- [Arbitrum L1 Gas Pricing](https://docs.arbitrum.io/how-arbitrum-works/l1-gas-pricing)
- [How to Estimate Gas in Arbitrum](https://docs.arbitrum.io/build-decentralized-apps/how-to-estimate-gas)
- [Arbitrum RPC Endpoints](https://docs.arbitrum.io/build-decentralized-apps/reference/node-providers)
- [Arbitrum Chain Information](https://docs.arbitrum.io/for-devs/dev-tools-and-resources/chain-info)
- [Arbitrum Smart Contract Addresses](https://docs.arbitrum.io/build-decentralized-apps/reference/contract-addresses)
- [Arbitrum USDC Documentation](https://docs.arbitrum.io/arbitrum-bridge/usdc-arbitrum-one)

### Flash Loan Providers

- [Aave V3 Testnet Addresses](https://docs.aave.com/developers/deployed-contracts/v3-testnet-addresses)
- [Aave Addresses Dashboard](https://aave.com/docs/resources/addresses)
- [Aave L2Pool](https://aave.com/docs/aave-v3/smart-contracts/l2-pool)

### DEX Documentation

- [Uniswap V3 Deployment Addresses](https://docs.uniswap.org/contracts/v3/reference/deployments/)
- [Uniswap Arbitrum Deployments](https://docs.uniswap.org/contracts/v3/reference/deployments/arbitrum-deployments)
- [Camelot Arbitrum Mainnet Contracts](https://docs.camelot.exchange/contracts/arbitrum/one-mainnet)
- [Camelot Sepolia Testnet Contracts](https://docs.camelot.exchange/contracts/arbitrum/sepolia-testnet)

### Block Explorers & Analytics

- [Arbiscan - Arbitrum Mainnet Explorer](https://arbiscan.io/)
- [Arbiscan Sepolia - Testnet Explorer](https://sepolia.arbiscan.io/)
- [Aave V3 Pool on Arbitrum](https://arbiscan.io/address/0x794a61358d6845594f94dc1db02a252b5b4814ad)
- [DefiLlama Arbitrum](https://defillama.com/chain/arbitrum)
- [DefiLlama Arbitrum DEX Volume](https://defillama.com/dexs/chain/arbitrum)
- [GeckoTerminal Arbitrum Pools](https://www.geckoterminal.com/arbitrum/pools)
- [DexScreener Arbitrum](https://dexscreener.com/arbitrum)

### Testnet Faucets

- [Chainlink Arbitrum Sepolia Faucet](https://faucets.chain.link/arbitrum-sepolia)
- [Alchemy Arbitrum Sepolia Faucet](https://www.alchemy.com/faucets/arbitrum-sepolia)
- [QuickNode Arbitrum Sepolia Faucet](https://faucet.quicknode.com/arbitrum/sepolia)
- [L2 Faucet - Arbitrum](https://www.l2faucet.com/arbitrum)

### Research Sources

- Phase 1 Research: `.planning/phases/01-chain-research/01-RESEARCH.md`
- Multi-chain Pitfalls: `.planning/research/PITFALLS.md`
- Technology Stack: `.planning/research/STACK.md`

---

**Last Updated**: 2026-02-16
**Next Review**: Phase 2 (Infrastructure Setup) kickoff
