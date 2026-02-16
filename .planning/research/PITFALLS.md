# Domain Pitfalls: Multi-Chain Flashloan Arbitrage

**Domain:** Flashloan arbitrage bot deployment to EVM L2s and alternative chains
**Researched:** 2026-02-16
**Context:** Expanding existing Ethereum bot to Arbitrum, Optimism, Base, zkSync, Polygon

## Critical Pitfalls

Mistakes that cause fund loss or require major rewrites.

### Pitfall 1: L1+L2 Gas Cost Misestimation Leading to Unprofitable Trades

**What goes wrong:** Bot executes transactions that appear profitable based on DEX price differences, but L1 data posting fees consume all profits or create net losses.

**Why it happens:** L2 transactions have a two-dimensional fee structure: L2 execution cost (cheap) + L1 data posting cost (variable and often dominant). On Arbitrum and Base, L1 data fees can represent 95% of total transaction cost. Teams calculate profitability using only L2 execution costs, ignoring L1 calldata charges that are priced at Ethereum mainnet gas rates.

**Consequences:**
- A 2% arbitrage opportunity becomes a loss if total gas is 2.5%
- With $500-1000 capital, even one failed trade wipes out multiple successful ones
- Ethereum L1 gas spikes (common during high activity) cause sudden batch posting cost increases that invalidate profit estimates made seconds earlier

**Prevention:**
1. **Dual-component profit calculation:** `profit_threshold = (L2_execution_cost + L1_data_fee) + safety_margin + min_profit`
2. **Dynamic L1 fee monitoring:** Query current Ethereum mainnet basefee before each trade, not just L2 basefee
3. **Conservative estimation:** Use worst-case L1 calldata size (pre-compression) for profit calculations
4. **Real-time adjustment:** Implement exponential moving average of actual L1 posting costs vs estimates; halt trading when variance exceeds 20%

**Detection:**
- Transactions succeed on-chain but show net loss in accounting
- Profit margin variance correlates with Ethereum mainnet gas price spikes
- Estimated gas cost << actual gas cost in transaction receipts

**Severity:** CRITICAL - Direct fund loss risk
**Phase to address:** Phase 1 (Chain-specific gas estimation)
**Confidence:** HIGH (verified with official Arbitrum and Base documentation)

---

### Pitfall 2: MEV Protection Assumption Failure (No Flashbots on L2)

**What goes wrong:** Bot assumes Flashbots/MEV-Blocker protection is available, submits transactions to public RPC expecting frontrun protection, gets sandwiched by sequencer or latency-optimized bots.

**Why it happens:** Flashbots only operates on Ethereum mainnet. L2s use private centralized mempools visible only to the sequencer. Arbitrum, Optimism, and Base have NO public mempool and NO Flashbots equivalent (as of 2026). The existing bot's 4-layer safety system includes "MEV protection (Flashbots/MEV Blocker)" which is Ethereum-specific.

**Consequences:**
- Sequencer can extract MEV by reordering transactions (centralization risk)
- On Arbitrum with TimeBoost, two entities (Selini Capital and Wintermute) control 90% of express lane auctions
- Latency-optimized competitors frontrun via geographic proximity to sequencer
- With small capital ($500-1000), single sandwich attack can eliminate days of profits

**Prevention:**
1. **Accept FCFS reality:** Arbitrum/Optimism/Base use first-come-first-served ordering, so transaction latency (not gas bidding) determines priority
2. **Sequencer proximity:** Use geographically close RPC endpoints to sequencer infrastructure
3. **TimeBoost strategy (Arbitrum only):** For high-value opportunities (>$50 profit), evaluate express lane auction bidding; however, empirical data shows profitability clusters at block-end, undermining express lane value
4. **Private transaction services:** Research L2-specific private relay services (e.g., FairFlow on Arbitrum), though adoption is limited as of 2026
5. **Profit threshold adjustment:** Increase minimum profit threshold by 0.5-1% to account for MEV leakage risk

**Detection:**
- Transactions consistently included 2+ blocks after submission despite sufficient gas
- Identical arbitrage executed by different address 1 block before bot's transaction
- Profit opportunities vanish between simulation and execution at rates higher than normal market movement

**Severity:** CRITICAL - Direct fund loss risk, invalidates core safety assumption
**Phase to address:** Phase 1 (L2 MEV landscape research), Phase 2 (Transaction submission strategy)
**Confidence:** HIGH (verified with L2 documentation and research papers)

---

### Pitfall 3: Bridged Token vs Native Token Confusion (USDC/USDC.e)

**What goes wrong:** Bot treats USDC and USDC.e as fungible, attempts arbitrage between pools using different token versions, transaction reverts or creates unintended positions.

**Why it happens:** Same stablecoin exists as multiple versions on L2s:
- **Native USDC:** Directly minted by Circle on supported chains (Arbitrum, Base, Optimism)
- **USDC.e (bridged):** Locked on Ethereum, minted by bridge on L2 (legacy version)
- Different contract addresses, different liquidity, different exchange support
- Some protocols only support native USDC; others only support USDC.e

**Consequences:**
- DEX price comparison logic breaks (comparing USDC/ETH on Uniswap vs USDC.e/ETH on SushiSwap)
- Flash loan contract reverts because borrowed USDC.e cannot be used in native USDC pool
- Liquidity fragmentation: USDC.e may have higher slippage despite showing similar TVL
- Even after native USDC introduction, bridged token trading remains stable, so both versions persist

**Prevention:**
1. **Explicit token versioning:** Maintain separate price feeds and pool references for USDC vs USDC.e
2. **Address verification:** Hardcode canonical token addresses per chain; verify in deployment script
3. **Pool compatibility matrix:** Map which DEXs support which token versions before strategy deployment
4. **No automatic bridging:** Never assume token compatibility; require explicit conversion routes
5. **Symbol disambiguation:** Use full identifiers (e.g., `arbitrum-usdc-native`, `arbitrum-usdc-bridged`) in internal logic

**Detection:**
- Simulation succeeds but live transaction reverts with "insufficient balance" despite sufficient value
- Token address mismatches in transaction traces
- Unexpected slippage despite adequate pool liquidity

**Severity:** CRITICAL - Transaction reversion, capital lock risk
**Phase to address:** Phase 1 (Token address mapping per chain)
**Confidence:** HIGH (verified with official Circle documentation and DeFi research)

---

### Pitfall 4: RPC Reliability and Rate Limiting on Public Endpoints

**What goes wrong:** Bot depends on public RPC endpoints for opportunity detection and transaction submission; encounters rate limits during high-activity periods, misses opportunities or fails to execute profitable trades.

**Why it happens:** Public RPC endpoints have strict rate limits:
- Optimism public endpoint (https://mainnet.optimism.io): Not reliable due to rate limits
- Base public endpoint (https://mainnet.base.org): Same limitations
- Arbitrum public RPCs: No WebSocket support, limited to 30 requests/second on many providers
- Public endpoints designed for development/testing, not production

**Consequences:**
- Opportunity detection latency increases during market volatility (when opportunities are most profitable)
- Transaction submission fails during critical execution window
- Bot appears "offline" when endpoint is rate-limited, missing entire arbitrage windows
- Competitors using premium RPCs execute trades while bot is throttled

**Prevention:**
1. **Paid RPC providers:** Budget $50-100/month for managed RPC (QuickNode, Alchemy, Infura) with guaranteed 1500 RPS
2. **Multi-provider fallback:** Implement automatic failover between 2-3 RPC providers
3. **Request prioritization:** Rate-limit opportunity scanning queries; never rate-limit transaction submissions
4. **WebSocket requirement:** Use WebSocket subscriptions for block headers and pending transactions where available
5. **Connection pooling:** Maintain persistent connections; reconnect with exponential backoff

**Detection:**
- HTTP 429 (Too Many Requests) errors in logs
- Irregular block update intervals despite consistent L2 block times
- Opportunity detection gaps correlating with high on-chain activity

**Severity:** CRITICAL - Missed opportunities, execution failures
**Phase to address:** Phase 1 (RPC provider selection and configuration)
**Confidence:** HIGH (verified with official L2 documentation)

---

### Pitfall 5: Slippage Underestimation Due to Liquidity Fragmentation

**What goes wrong:** Bot sees profitable price difference between DEXs, executes trade, but actual slippage is 2-4x higher than estimated, turning profitable opportunity into loss.

**Why it happens:** L2 liquidity is fragmented across multiple DEXs, multiple token versions (native vs bridged), and multiple liquidity pool types (V2 AMM, V3 concentrated liquidity). A pool showing $500K TVL may have:
- 80% concentrated in narrow price range (V3)
- High concentration in single LP position (can be withdrawn mid-block)
- Fake liquidity (rug pull risk on newer DEXs)
- Bridged token version with different slippage characteristics

Faster block times (0.2-2s vs Ethereum's 12s) mean pool state changes more frequently between simulation and execution.

**Consequences:**
- A market gap showing 0.5% profit yields only 0.2% (or negative) after slippage on thin order books
- With $500-1000 capital, slippage of 0.1-2% per trade compounds across multiple executions
- Failed transactions still consume gas, creating net loss
- Slippage is "the silent killer of crypto arbitrage bots" - often overlooked in profitability calculations

**Prevention:**
1. **Real-time liquidity depth analysis:** Query pool reserves and recent swap volume before each trade
2. **Slippage simulation:** Use eth_call to simulate full trade path before execution, reject if slippage >0.3%
3. **Minimum liquidity thresholds:** Only trade pools with >$100K liquidity in relevant price range (V3)
4. **Volume-to-liquidity ratio:** Avoid pools where recent 1h volume > 20% of TVL (indicates volatile state)
5. **Conservative slippage tolerance:** Set transaction slippage tolerance to 0.5% but reject opportunities if expected slippage >0.3%
6. **Pool age filtering:** Ignore pools <7 days old to avoid rug pull risk

**Detection:**
- Simulated profit consistently 2x+ higher than actual profit
- High transaction revert rate with "slippage too high" errors
- Actual token amounts received significantly lower than estimates

**Severity:** CRITICAL - Primary profitability killer
**Phase to address:** Phase 2 (Advanced opportunity validation)
**Confidence:** HIGH (verified with DeFi research and practitioner reports)

---

## Moderate Pitfalls

Mistakes that reduce profitability or increase operational complexity.

### Pitfall 6: Sequencer Downtime and Centralization Risk

**What goes wrong:** L2 sequencer goes offline, entire chain halts, bot cannot execute trades or may have transactions stuck in limbo.

**Why it happens:** Arbitrum, Optimism, and Base use centralized sequencers (single entity controls transaction ordering). Historical incidents:
- Arbitrum sequencer stalled during inscription craze (network outage)
- Centralized sequencer = single point of failure
- No decentralized fallback as of early 2026 (Arbitrum plans decentralization by late 2026)

**Prevention:**
1. **Multi-chain deployment:** Deploy to 2-3 L2s simultaneously; if one sequencer fails, others continue
2. **Sequencer health monitoring:** Track sequencer uptime via block production rate; halt trading if no new blocks for 60 seconds
3. **Emergency withdrawal plan:** Maintain flash loan provider addresses on multiple chains for capital recovery
4. **L1 escape hatch awareness:** Understand forced inclusion mechanisms (7-day delay) for emergency withdrawals

**Detection:**
- No new blocks for >60 seconds
- RPC calls timeout or return stale data
- Community reports on L2 status pages/Discord

**Severity:** MODERATE - Temporary loss of opportunity, not direct fund loss
**Phase to address:** Phase 3 (Multi-chain monitoring)
**Confidence:** MEDIUM (based on historical incidents and L2 architecture)

---

### Pitfall 7: Cross-Chain Token Address Inconsistency

**What goes wrong:** Bot uses Ethereum mainnet token addresses on L2, transactions fail; or assumes token at same address across chains has same properties.

**Why it happens:**
- Same token has different addresses on different chains (e.g., USDT: Ethereum vs Arbitrum vs Optimism)
- Some tokens have different decimals on different chains (USDT/USDC: 6 decimals on Ethereum, 18 decimals on BSC)
- Contract deployment order differs, so addresses are chain-specific
- Bridges create wrapped versions with new addresses

**Prevention:**
1. **Chain-specific address mapping:** Maintain configuration file with canonical token addresses per chain
2. **Deployment verification:** Test token transfers on testnet before mainnet deployment
3. **Address validation:** Verify token contract bytecode matches expected implementation (not just symbol check)
4. **Decimal normalization:** Always query token decimals via contract call, never assume 18
5. **No cross-chain address reuse:** Explicitly fail if code attempts to use address from wrong chain

**Detection:**
- Contract not found errors (address doesn't exist on target chain)
- Decimal mismatch causing amounts off by 10^n
- Transfers fail despite sufficient balance

**Severity:** MODERATE - Prevents deployment, easily caught in testing
**Phase to address:** Phase 1 (Chain configuration and address mapping)
**Confidence:** HIGH (verified with bridge documentation and ERC20 standards)

---

### Pitfall 8: Block Time Differences Affecting Opportunity Window

**What goes wrong:** Bot's opportunity detection logic assumes 12-second block times, but L2s produce blocks every 0.2-2 seconds. Either (a) misses opportunities that close in 2-3 blocks, or (b) generates false positives from temporary price movements.

**Why it happens:**
- Ethereum: 12-second blocks
- Arbitrum/Optimism/Base: 0.2-2 second blocks
- zkSync: Sub-second finality
- Opportunities last 10-20 blocks on average across L2s

**Consequences:**
- Opportunity detection lag: By the time bot sees profitable spread, 5-10 L2 blocks have passed (10-20 seconds), opportunity may be closed
- False opportunity signals from intra-block price movements that revert within 1-2 blocks
- Timing assumptions in mempool monitoring break (block.timestamp granularity changes)

**Prevention:**
1. **Chain-specific timing parameters:** Configure expected block time per chain; use for opportunity freshness validation
2. **Opportunity persistence threshold:** Require price differential to persist for 3+ blocks before execution
3. **Block-based timeouts:** Replace time-based timeouts with block-height-based timeouts
4. **Faster monitoring loop:** Poll for new blocks every 500ms on fast L2s (vs 10s on Ethereum)

**Detection:**
- High false positive rate (opportunities vanish before execution)
- Execution timing mismatches
- Profit calculations based on stale pricing

**Severity:** MODERATE - Reduces profitability, increases false signals
**Phase to address:** Phase 2 (Chain-specific opportunity validation)
**Confidence:** MEDIUM (based on L2 research papers)

---

### Pitfall 9: Finality Differences Impacting Capital Efficiency

**What goes wrong:** Bot waits for full finality before considering trade "complete", locking capital for 7 days on Optimistic rollups.

**Why it happens:**
- Optimistic rollups (Arbitrum, Optimism, Base): 7-day challenge period for L1 finality
- zkRollups (zkSync): Immediate finality upon L1 proof verification
- Difference affects capital cycling for cross-chain arbitrage

**Consequences:**
- Capital locked for 7 days if withdrawal to L1 is required
- Cross-chain arbitrage requiring bridge transfers takes 242 seconds average (vs 9 seconds for inventory-based)
- With $500-1000 capital, 7-day lock eliminates ability to capitalize on multiple opportunities

**Prevention:**
1. **Inventory-based strategy:** Keep capital on target L2, never bridge mid-strategy
2. **Accept L2 soft finality:** For same-chain arbitrage, accept transaction inclusion (not L1 finality) as "complete"
3. **Capital allocation:** If multi-chain, split capital across chains (66.96% of arbitrage uses pre-positioned inventory)
4. **Prefer zkRollups for multi-chain:** If cross-chain arbitrage is required, prioritize zkSync for fast finality

**Detection:**
- Capital utilization metrics show high idle time
- Withdrawal delays blocking opportunity execution

**Severity:** MODERATE - Capital efficiency impact, not fund loss
**Phase to address:** Phase 2 (Cross-chain capital management)
**Confidence:** MEDIUM (based on rollup architecture documentation)

---

### Pitfall 10: Aave V3 Pool Address Differences Across Chains

**What goes wrong:** Bot assumes Aave V3 pool address is consistent across chains, attempts flash loan on wrong address, transaction reverts.

**Why it happens:** Aave V3 is deployed with different pool addresses on each chain. Pool contract address on Ethereum mainnet ≠ Arbitrum ≠ Optimism ≠ Base. Each deployment may also have different:
- Supported assets (some chains lack certain tokens)
- Liquidity depth (Base may have less USDC than Arbitrum)
- Flash loan fees (standardized but configurable by governance)

**Consequences:**
- Flash loan transaction reverts (contract not found or incompatible interface)
- Borrowed asset not available on target chain
- Insufficient liquidity for requested loan amount

**Prevention:**
1. **Chain-specific pool addresses:** Query Aave Address Book or official docs for each chain deployment
2. **Supported asset verification:** Before deployment, verify all required tokens are available on target chain's Aave pool
3. **Liquidity pre-check:** Query available flash loan liquidity before execution (use `getReserveData`)
4. **Fallback flash loan providers:** Have backup flash loan sources (Balancer, Uniswap V3) per chain
5. **Use L2Pool optimization:** On L2s, use calldata-optimized L2Pool extension for gas savings

**Detection:**
- Contract call reverts with "function not found"
- Flash loan requests fail with "insufficient liquidity"
- Gas costs higher than expected (not using L2Pool)

**Severity:** MODERATE - Prevents execution, but easily tested
**Phase to address:** Phase 1 (Flash loan provider configuration per chain)
**Confidence:** MEDIUM (Aave V3 documentation confirmed multi-chain deployment, specific addresses need per-chain lookup)

---

## Minor Pitfalls

Operational issues that reduce efficiency but don't threaten fund loss.

### Pitfall 11: Testnet vs Production Behavior Differences

**What goes wrong:** Bot works perfectly on Sepolia testnet, fails on mainnet due to environment differences.

**Why it happens:**
- Testnet has permissioned validator set (more predictable), mainnet has centralized sequencer (different timing)
- Testnet liquidity is fake/sparse (no real MEV competition)
- Testnet doesn't have TimeBoost or other MEV auctions
- Testnet RPC endpoints may have different rate limits

**Prevention:**
1. **Testnet for logic validation only:** Use Sepolia for contract correctness, not performance/profitability testing
2. **Mainnet forked simulation:** Use Anvil/Hardhat mainnet fork with realistic liquidity/gas prices for final testing
3. **Canary deployment:** Start with minimum capital ($100) on mainnet, monitor for 48 hours before full deployment
4. **Small capital testing window:** With $500-1000 total capital, test with $50-100 to validate assumptions

**Detection:**
- Testnet success rate significantly higher than mainnet
- Unexpected timing or gas cost differences

**Severity:** MINOR - Caught in testing, no fund loss if canary deployed
**Phase to address:** Phase 3 (Deployment validation)
**Confidence:** MEDIUM (based on testnet documentation)

---

### Pitfall 12: Insufficient Capital for Fee Amortization

**What goes wrong:** With $500-1000 starting capital, per-trade fees consume disproportionate percentage of profits.

**Why it happens:**
- Minimum profitable trade: 0.1-0.5% profit margin
- Trading fees: 0.02-0.1% per swap (2 swaps per arbitrage = 0.04-0.2%)
- Gas costs: $0.10-$1.00 per transaction on L2
- Slippage: 0.1-2% on smaller pools
- Total costs: 0.24-2.7% per trade

With $500 capital: 0.5% profit = $2.50, but costs might be $2.00, leaving $0.50 net profit
With $1000 capital: 0.5% profit = $5.00, costs = $2.00, net = $3.00

**Consequences:**
- Requires 1%+ profit margins to be viable (rare opportunities)
- Many "profitable" opportunities are net-negative after all costs
- Recommended minimum capital is $1000-2000 spread across 2-3 exchanges
- Single failed transaction can wipe out 5-10 successful trades

**Prevention:**
1. **Higher profit threshold:** Set minimum opportunity threshold to 1% (not 0.3%)
2. **Batch opportunities:** Wait for multiple opportunities, execute highest-value first
3. **Focus on capital efficiency:** Prefer high-value single trades over high-frequency small trades
4. **Fee tracking:** Log all costs (gas, slippage, trading fees) to validate true profitability
5. **Consider capital growth first:** Reinvest all profits for first 30 days to reach $2000+ capital

**Detection:**
- Gross profits positive, net profits negative
- High trade count but low absolute profit
- Fee percentage > 50% of gross profit

**Severity:** MINOR - Economic viability issue, not technical failure
**Phase to address:** Phase 2 (Profitability validation and thresholds)
**Confidence:** MEDIUM (based on arbitrage bot practitioner reports)

---

### Pitfall 13: Competition Underestimation (Institutional Bots)

**What goes wrong:** Bot finds opportunities, but institutional/professional bots execute first due to superior infrastructure.

**Why it happens:**
- Five largest arbitrage addresses execute >50% of all L2 arbitrage trades
- One address captures 40% of daily volume post-Dencun
- Professional bots have:
  - Geographic proximity to sequencer (lower latency)
  - Premium RPC endpoints (1500 RPS vs 30 RPS)
  - Express lane auction budgets (TimeBoost on Arbitrum)
  - Multi-million dollar capital (can absorb temporary losses)
- Competition has increased sharply; price gaps close faster in 2026 than 2024

**Consequences:**
- Bot sees opportunity, attempts execution, but competitor executed 1-2 blocks earlier
- Remaining opportunities are smaller, riskier, or on less liquid pools
- Success rate may be 20-30%, not 70-80%

**Prevention:**
1. **Realistic expectations:** Plan for 20-40% success rate, not 80%+
2. **Niche strategy:** Focus on specific token pairs or DEXs with less competition
3. **Speed optimization:** Use fastest RPC, minimize computation between detection and execution
4. **Accept limitations:** With $500-1000 capital, cannot compete on speed; compete on strategy uniqueness

**Detection:**
- Opportunities consistently disappear between detection and execution
- Same address appears as executor in failed attempts
- Success rate declines over time as competitors adapt

**Severity:** MINOR - Reduces opportunity count, not fund loss
**Phase to address:** Phase 2 (Competitive analysis and strategy differentiation)
**Confidence:** MEDIUM (based on on-chain MEV analysis papers)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| **Phase 1: L2 Integration** | Gas cost misestimation (Pitfall 1) | Implement dual-component gas calculation with L1 data fee monitoring |
| **Phase 1: L2 Integration** | MEV protection assumption (Pitfall 2) | Research L2 MEV landscape, accept FCFS reality, optimize latency |
| **Phase 1: L2 Integration** | Token address mapping (Pitfall 3, 7) | Build chain-specific configuration with native vs bridged tokens |
| **Phase 1: L2 Integration** | RPC provider selection (Pitfall 4) | Budget for paid RPC, implement multi-provider fallback |
| **Phase 1: L2 Integration** | Flash loan addresses (Pitfall 10) | Query Aave docs for L2-specific pool addresses, verify liquidity |
| **Phase 2: Opportunity Validation** | Slippage underestimation (Pitfall 5) | Real-time liquidity depth analysis, conservative slippage tolerance |
| **Phase 2: Opportunity Validation** | Block time differences (Pitfall 8) | Chain-specific timing parameters, persistence thresholds |
| **Phase 2: Opportunity Validation** | Capital constraints (Pitfall 12) | Higher profit thresholds (1%+), capital efficiency focus |
| **Phase 2: Opportunity Validation** | Competition reality (Pitfall 13) | Realistic success rate expectations, niche strategy |
| **Phase 3: Multi-Chain Deployment** | Sequencer downtime (Pitfall 6) | Multi-chain deployment, sequencer health monitoring |
| **Phase 3: Multi-Chain Deployment** | Finality differences (Pitfall 9) | Inventory-based strategy, accept soft finality for same-chain |
| **Phase 3: Multi-Chain Deployment** | Testnet differences (Pitfall 11) | Mainnet fork testing, canary deployment with small capital |

---

## Research Quality Assessment

**Overall Confidence:** MEDIUM-HIGH

| Pitfall | Confidence | Source Quality |
|---------|------------|----------------|
| Gas cost misestimation | HIGH | Official Arbitrum/Base docs |
| MEV protection failure | HIGH | Official L2 docs + research papers |
| Bridged token confusion | HIGH | Official Circle docs + DeFi research |
| RPC reliability | HIGH | Official L2 docs + provider documentation |
| Slippage underestimation | HIGH | Multiple practitioner reports + research |
| Sequencer downtime | MEDIUM | Historical incidents + L2 architecture |
| Token address differences | HIGH | Bridge documentation + ERC20 standards |
| Block time differences | MEDIUM | L2 research papers |
| Finality differences | MEDIUM | Rollup documentation |
| Aave pool differences | MEDIUM | Aave docs (addresses need per-chain lookup) |
| Testnet differences | MEDIUM | Testnet documentation |
| Capital constraints | MEDIUM | Practitioner reports |
| Competition pressure | MEDIUM | On-chain MEV analysis |

**Sources of Uncertainty:**
- TimeBoost adoption and effectiveness (new mechanism, limited empirical data)
- Specific Aave V3 pool addresses per L2 (confirmed multi-chain deployment, addresses need per-chain verification)
- Real-world success rates with small capital (anecdotal, limited public data)

**Recommended Pre-Deployment Validation:**
1. Verify Aave V3 pool addresses on target L2s via official Address Book
2. Test with $50-100 canary deployment to measure actual costs vs estimates
3. Monitor competitor behavior on target pools for 7 days before going live
4. Validate RPC provider performance under load (stress test)

---

## Sources

### Official Documentation (HIGH confidence)
- [Gas and Fees - Arbitrum Docs](https://docs.arbitrum.io/arbos/gas)
- [Network Fees - Base Documentation](https://docs.base.org/base-chain/network-information/network-fees)
- [Aave V3 Overview](https://aave.com/docs/aave-v3/overview)
- [L2 Pool - Aave Documentation](https://aave.com/docs/aave-v3/smart-contracts/l2-pool)
- [Timeboost - Arbitrum Docs](https://docs.arbitrum.io/how-arbitrum-works/timeboost/gentle-introduction)
- [Timeboost FAQ - Arbitrum Docs](https://docs.arbitrum.io/how-arbitrum-works/timeboost/timeboost-faq)

### Research Papers (MEDIUM-HIGH confidence)
- [Cross-Rollup MEV: Non-Atomic Arbitrage Across L2 Blockchains](https://arxiv.org/html/2406.02172)
- [Layer-2 Arbitrage: An Empirical Analysis of Swap Dynamics and Price Disparities on Rollups](https://arxiv.org/html/2406.02172v1/)
- [Quantifying MEV on L2s: A Study of Polygon, Arbitrum, and Optimism](https://arxiv.org/pdf/2309.00629)
- [Rolling in the Shadows: Analyzing the Extraction of MEV Across Layer-2 Rollups](https://ben-weintraub.com/files/rolling-in-the-shadows.pdf)
- [Does Timeboost Reduce MEV-Related Spam?](https://arxiv.org/html/2512.10094)
- [The Express Lane to Spam and Centralization: Arbitrum's Timeboost](https://arxiv.org/html/2509.22143)
- [Liquidity Fragmentation or Optimization? Analyzing AMMs Across Ethereum and Rollups](https://arxiv.org/html/2410.10324v3)
- [Cross-Chain Arbitrage: The Next Frontier of MEV in DeFi](https://arxiv.org/html/2501.17335)

### Industry Analysis (MEDIUM confidence)
- [What L2's Need To Know About Accounting for L1 Gas Fees](https://www.blocknative.com/blog/what-l2s-need-to-know-about-accounting-for-l1-gas-fees)
- [USDC vs USDC.e - Eco Support](https://eco.com/support/en/articles/12022920-usdc-vs-usdc-e-understanding-the-critical-differences-between-native-and-bridged-stablecoins)
- [How to Implement a Sequencer MEV Mitigation Strategy](https://www.chainscorelabs.com/en/guides/guides-test-2026/decentralized-sequencer-design/how-to-implement-a-sequencer-mev-mitigation-strategy)
- [Layer-2 Arbitrage Guide 2025](https://coincryptorank.com/blog/l2-arbitrage)
- [Crypto Slippage Explained](https://medium.com/@swaphunt/slippage-in-crypto-swaps-why-your-arbitrage-bot-keeps-crying-and-what-i-did-about-it-e561c0603e86)

### RPC Provider Documentation (HIGH confidence)
- [Arbitrum RPC Endpoints - Chainstack](https://chainstack.com/how-to-get-arbitrum-rpc-endpoint-in-2026/)
- [Best Arbitrum RPC Providers 2025](https://www.dwellir.com/blog/best-arbitrum-rpc-providers-2025)
- [Quicknode Arbitrum RPC Overview](https://www.quicknode.com/docs/arbitrum)

### Testnet Documentation (MEDIUM confidence)
- [Goerli vs. Sepolia Testnet](https://www.quicknode.com/guides/ethereum-development/getting-started/goerli-vs-sepolia-a-head-to-head-comparison)
- [Sepolia vs Goerli Comparison](https://metana.io/blog/sepolia-vs-goerli-which-ethereum-testnet-should-i-use/)

### Practitioner Reports (MEDIUM confidence)
- [Common Mistakes Using Crypto Arbitrage Bots](https://sdlccorp.com/post/common-mistakes-to-avoid-when-using-crypto-arbitrage-bots/)
- [Crypto Arbitrage Bot Development 2026](https://pixelplex.io/blog/crypto-arbitrage-bot-development/)
- [Flash Loan Arbitrage Basics - Flashbots Docs](https://docs.flashbots.net/flashbots-mev-share/searchers/tutorials/flash-loan-arbitrage/flash-loan-basics)
