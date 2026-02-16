# Research Summary: Multi-Chain Flashloan Arbitrage Expansion

**Domain:** Multi-chain DeFi flashloan arbitrage bot expansion
**Researched:** 2026-02-16
**Overall confidence:** MEDIUM-HIGH

## Executive Summary

For small-capital ($500-$1,000) flashloan arbitrage in 2026, **Base, Arbitrum, and Polygon** emerge as the clear winners among EVM-compatible chains. Base leads with the highest DEX volume (~50% of all L2 activity) and ultra-low gas costs ($0.005 average), making sub-0.2% spreads profitable. Arbitrum offers the best MEV competition profile with only 7% of gas consumed by cyclic arbitrage (vs 51-55% on Base/Optimism) and a 52.6% success rate (vs 6-12% on Base/Optimism). Polygon provides ultra-low gas ($0.0005-$0.2) for micro-arbitrage opportunities.

The research reveals a critical insight: **optimistic MEV on Base and Optimism creates wasteful competition** where 51-55% of gas is consumed by bots speculatively submitting transactions, with only 6-12% succeeding. Arbitrum's 7% cyclic arb ratio and 52.6% success rate suggest a more efficient market for small-capital operators.

**Avoid deploying to zkSync Era, Scroll, Linea, Mantle, Blast, Mode, and Metis** due to ZK-proof gas overhead, immature flash loan ecosystems, insufficient DEX liquidity, or lack of current data. Monitor these chains for future maturation but prioritize the top three.

**Flash loan infrastructure is excellent:** Aave V3 is deployed on 14+ chains with the same contract address (`0x794a61358D6845594F94dc1DB02A252b5b4814aD`) via CREATE2, simplifying multi-chain development. Balancer V2 offers zero-fee flash loans on major chains, maximizing net returns.

**Gas costs are the deciding factor for small capital:** With $500-$1,000 positions, every failed transaction costs 0.01-0.1% of capital. Chains where gas exceeds $0.10 per transaction (Avalanche, potentially BSC) require 2-5% spreads to remain profitable, eliminating most opportunities.

## Key Findings

**Stack:** Deploy to Base (highest volume, $0.005 gas), Arbitrum (best success rates, 7% MEV competition), and Polygon (ultra-low gas, micro-arbs). Use Aave V3 (same address across chains) and Balancer V2 (zero fees) for flash loans. Alchemy for RPC (except Arbitrum — use QuickNode due to missing trace API).

**Architecture:** Multi-chain deployment requires minimal changes to existing contracts (chain-agnostic FlashloanExecutor) but needs chain-specific DEX adapters (Aerodrome on Base, Camelot on Arbitrum, QuickSwap on Polygon). Bot architecture should use parallel monitors for top 2-3 chains initially, not unified monitoring (complexity vs cost trade-off).

**Critical pitfall:** Base and Optimism have 51-55% of gas consumed by optimistic MEV (bots speculatively submitting arb transactions), with only 6-12% success rates. Small-capital bots will waste significant capital on failed transactions unless detection algorithms are highly accurate. Arbitrum is the exception (7% MEV, 52.6% success) and should be prioritized.

## Implications for Roadmap

Based on research, suggested phase structure:

### 1. Phase: Base Deployment & Integration (4-6 weeks)
**Rationale:** Base has the highest DEX volume and lowest gas costs, making it the best chain for initial small-capital validation.

- **Addresses:** Multi-chain contract deployment infrastructure
- **Avoids:** Deploying to all chains simultaneously (reduces risk, validates approach)
- **Key tasks:**
  - Multi-chain Foundry configuration (RPC endpoints, etherscan verification)
  - Base-specific DEX adapters (Aerodrome, Uniswap V3)
  - Aave V3 and Balancer V2 integration on Base
  - Base testnet deployment and testing
  - Mainnet deployment with $100-$500 test capital
- **Research flag:** Need deeper research into Aerodrome DEX API and Base-specific MEV protection strategies

### 2. Phase: Arbitrum Deployment & Comparison (3-4 weeks)
**Rationale:** Arbitrum offers the best MEV competition profile (52.6% success rate vs 6.3% on Base). Deploying to Arbitrum provides a comparison point to validate if Base's high volume outweighs its poor success rates.

- **Addresses:** MEV competition mitigation, contract reusability across chains
- **Avoids:** Over-investing in Base if Arbitrum proves more profitable
- **Key tasks:**
  - Reuse Base contracts (verify chain-agnostic design)
  - Arbitrum-specific DEX adapters (Camelot, SushiSwap V3)
  - 250ms block time optimizations (performance tuning)
  - RPC provider switch (use QuickNode or Infura due to Alchemy's missing trace API)
  - Parallel bot monitoring (Base + Arbitrum simultaneously)
  - 2-week profitability comparison: Base vs Arbitrum success rates and net profit
- **Research flag:** Arbitrum's 250ms block times may require bot architecture changes (investigate if parallel monitoring vs sequential is feasible)

### 3. Phase: Polygon Deployment & Micro-Arb Testing (2-3 weeks)
**Rationale:** Polygon's ultra-low gas ($0.0005-$0.2) enables testing of micro-arbitrage strategies (0.1-0.3% spreads) not viable on Base or Arbitrum.

- **Addresses:** Gas optimization, micro-arbitrage feasibility
- **Avoids:** Missing opportunities that only Polygon's gas costs enable
- **Key tasks:**
  - Deploy contracts to Polygon PoS
  - Integrate Polygon-native DEXs (QuickSwap, SushiSwap)
  - Test micro-arb strategies (0.1-0.3% spreads, $50-$200 positions)
  - Measure competition levels (likely HIGH but validate)
  - Determine if micro-arbs are profitable or if volume/competition negate gas advantage
- **Research flag:** Unlikely to need deeper research (standard patterns), but profitability is uncertain

### 4. Phase: Profitability Analysis & Decision Gate (2 weeks)
**Rationale:** Before expanding to more chains (Optimism, Avalanche, BSC), validate that top 3 chains are profitable. No point deploying to 6+ chains if none are profitable.

- **Addresses:** ROI validation, capital allocation strategy
- **Avoids:** Waste of resources deploying to unprofitable chains
- **Key tasks:**
  - 30-day trial on Base, Arbitrum, Polygon with $500-$1,000 capital
  - Track metrics: success rate, average profit per arb, gas costs, failed tx ratio, daily/weekly net profit
  - Comparative analysis: Which chain is most profitable? Why?
  - Decision: Continue with top 2 chains, pause or optimize bottom 1
  - Go/no-go for Phase 5 expansion
- **Research flag:** Standard analysis, no additional research needed

### 5. Phase (Optional): Optimism/Avalanche/BSC Expansion (4-6 weeks)
**Rationale:** Only deploy to these chains if Phase 4 shows profitability on Base/Arbitrum/Polygon. Optimism has high competition (55% MEV, 12% success), Avalanche has high gas ($0.10-$2), and BSC has high pool fees (0.25%).

- **Addresses:** Market expansion, diversification
- **Avoids:** Over-extending before validating core chains
- **Key tasks:**
  - Deploy to Optimism (if Base proves profitable despite MEV competition)
  - Deploy to Avalanche (if larger spreads 2%+ are consistently found)
  - Deploy to BSC (if PancakeSwap volumes justify 0.25% pool fees)
  - Monitor zkSync Era, Scroll, Linea for ecosystem maturation
- **Research flag:** Optimism's Velodrome DEX and Superchain dynamics may need research; Avalanche's Trader Joe liquidity patterns need validation

### 6. Phase (Future): zkSync/Scroll/Linea Monitoring (Ongoing)
**Rationale:** These ZK rollups are too immature or expensive now, but may become viable in 6-12 months as ecosystems mature.

- **Addresses:** Future-proofing, emerging chain opportunities
- **Avoids:** Missing early-mover advantage when chains mature
- **Key tasks:**
  - Quarterly review of zkSync Era DEX liquidity and flash loan providers
  - Monitor Scroll, Linea, Mantle for Aave V3 deployments
  - Track gas cost trends (ZK-proof costs decreasing?)
  - Set alerts for major DEX launches or TVL milestones
- **Research flag:** No immediate research needed; revisit in Q3 2026

**Phase ordering rationale:**
- **Base first:** Highest volume + lowest gas = best validation of multi-chain approach
- **Arbitrum second:** Best success rates provide comparison to high-volume, high-competition Base
- **Polygon third:** Ultra-low gas enables micro-arb testing not possible on Base/Arbitrum
- **Decision gate before expansion:** Validate profitability before deploying to 6+ chains
- **Optional chains last:** Optimism/Avalanche/BSC only if core chains profitable
- **Future monitoring ongoing:** ZK rollups may mature in 6-12 months

**Research flags for phases:**
- **Phase 1 (Base):** Likely needs deeper research into Aerodrome DEX API, Base MEV protection, and contract address discovery
- **Phase 2 (Arbitrum):** May need research into 250ms block time optimizations and parallel bot monitoring architecture
- **Phase 3 (Polygon):** Unlikely to need research (standard patterns), but profitability validation critical
- **Phase 4 (Analysis):** No additional research needed (data analysis)
- **Phase 5 (Expansion):** Optimism's Velodrome and Avalanche's Trader Joe may need light research
- **Phase 6 (Future):** Quarterly research updates on zkSync/Scroll/Linea maturation

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Aave V3 deployments verified via official docs, gas costs confirmed across multiple sources, Uniswap V2/V3 deployments official |
| Features | MEDIUM-HIGH | DEX volume data from DefiLlama and The Block (credible), MEV competition data from academic papers (arxiv.org), profitability estimates from recent case studies but not independently verified |
| Architecture | MEDIUM | Multi-chain patterns are standard (ethers.js v6 supports this), but specific RPC provider limitations (Alchemy's missing Arbitrum trace API) noted from multiple sources; bot architecture recommendations based on general patterns not tested |
| Pitfalls | HIGH | MEV competition data from peer-reviewed research (arxiv.org), optimistic MEV dynamics (51-55% gas, 6-12% success) well-documented, Arbitrum's 7% MEV and 52.6% success validated across sources |

**Overall:** MEDIUM-HIGH confidence. High confidence on technical capabilities (Aave V3, gas costs, MEV competition), medium confidence on profitability estimates (case studies not independently verified), and medium confidence on RPC provider specifics (vendor documentation not always current).

## Gaps to Address

### Areas where research was inconclusive:

1. **Exact contract addresses for chain-native DEXs:**
   - Aerodrome (Base), Camelot (Arbitrum), QuickSwap (Polygon), Velodrome (Optimism)
   - Need to verify in official docs during implementation
   - **Impact:** LOW — addresses are discoverable, but not critical for planning

2. **Balancer V2 Vault addresses by chain:**
   - Balancer docs mention deployments but didn't provide specific addresses in search results
   - Need to check official Balancer deployment docs
   - **Impact:** LOW — Balancer is optional (Aave V3 is primary)

3. **Real-time TVL/volume data for 2026:**
   - Most data from late 2024 or early 2025
   - DefiLlama API should be used in bot for current data
   - **Impact:** MEDIUM — affects chain prioritization, but top 3 (Base/Arbitrum/Polygon) are clear winners

4. **Blast, Mode, Metis assessment:**
   - Insufficient current data to make recommendations
   - These chains are not top priorities anyway
   - **Impact:** LOW — not critical for initial deployment

5. **Small-capital profitability validation:**
   - Case studies exist ($47k in first month — Feb 2026) but not independently verified
   - Profitability models based on assumptions (0.5-2% spreads, 3-5 failed tx per success)
   - **Impact:** HIGH — Phase 4 profitability analysis is critical; conservative capital allocation ($100-$500 initially) mitigates risk

### Topics needing phase-specific research later:

1. **Phase 1 (Base):**
   - Aerodrome DEX API and contract addresses
   - Base-specific MEV protection (is Flashbots available on Base? Alternative strategies?)
   - Base block time and sequencer dynamics (centralized sequencer = different MEV landscape than Ethereum)

2. **Phase 2 (Arbitrum):**
   - Arbitrum's 250ms block times: Does this require bot architecture changes? Can parallel monitoring keep up?
   - Camelot DEX integration (Arbitrum-native, likely different API than Uniswap V2/V3)
   - RPC provider selection for Arbitrum (QuickNode costs vs public RPC rate limits)

3. **Phase 5 (Expansion):**
   - Velodrome (Optimism): Full-stack AMM, likely requires custom adapter
   - Trader Joe (Avalanche): Liquidity Book v2.1 may have different swap mechanics
   - PancakeSwap V3 (BSC): Flash swap implementation vs dedicated flash loan

4. **Phase 6 (Future):**
   - zkSync Era: When will flash loan providers deploy? Current status of SyncSwap and Mute DEXs?
   - Scroll/Linea: Aave V3 deployment timeline? DEX ecosystem maturity?

**Mitigation:** These gaps are acceptable for planning. Most are "implementation details" that can be researched during the specific phase. The strategic direction (deploy to Base, Arbitrum, Polygon first) is clear.

## Recommendations for Roadmap Creation

### Must-Have Features (Table Stakes)
1. Multi-chain contract deployment infrastructure (foundry.toml, RPC endpoints, etherscan verification)
2. Chain-specific DEX adapters (Aerodrome, Camelot, QuickSwap, etc.)
3. Multi-chain RPC provider management (Alchemy for most, QuickNode/Infura for Arbitrum)
4. Aave V3 integration on Base, Arbitrum, Polygon
5. Gas cost thresholds per chain (Base: $0.05 max, Arbitrum: $0.10 max, etc.)
6. Parallel bot monitoring (Base + Arbitrum simultaneously)

### Should-Have Features (Competitive Advantage)
1. Balancer V2 zero-fee flash loans (maximize net returns)
2. Chain-specific gas optimization (Base vs Arbitrum vs Polygon have different dynamics)
3. MEV competition analysis per chain (track success rates, adjust strategies)
4. Profitability dashboards (compare Base vs Arbitrum vs Polygon in real-time)

### Could-Have Features (Future Expansion)
1. Optimism, Avalanche, BSC deployment (only if Phase 4 validates profitability)
2. zkSync Era, Scroll, Linea monitoring (future-proofing)
3. Cross-chain arbitrage (e.g., borrow on Arbitrum, swap on Base, repay on Arbitrum — requires bridges)

### Won't-Have Features (Out of Scope)
1. Running own RPC nodes ($500-$2k/month per chain — too expensive)
2. Non-EVM chains (Solana, Cosmos, etc. — different tech stack)
3. Layer 1 chains (Ethereum is already supported; others like BNB Smart Chain are lower priority)

### Critical Dependencies
1. **RPC provider accounts:** Alchemy, QuickNode, or Infura (free tier for testing, paid for production)
2. **Etherscan API keys:** Base, Arbitrum, Polygon (for contract verification)
3. **Test capital:** $100-$500 for Phase 1 (Base), $500-$1,000 for Phase 4 (all chains)
4. **Testnet faucets:** Base Sepolia, Arbitrum Sepolia, Polygon Mumbai/Amoy (for testing)

### Risk Mitigation
1. **Start small:** $100-$500 on Base in Phase 1 (limit downside)
2. **Validate before scaling:** Phase 4 decision gate prevents over-investment in unprofitable chains
3. **Conservative gas thresholds:** $0.05 max on Base, $0.10 max on Arbitrum (prevents runaway gas costs)
4. **Parallel deployment:** Deploy to Base and Arbitrum simultaneously in Phase 2 (compare profitability early)
5. **Monitor before deploying:** Phase 6 ongoing monitoring of zkSync/Scroll/Linea (don't miss future opportunities but don't rush)

---

## Conclusion

Multi-chain flashloan arbitrage expansion is **feasible and likely profitable** for small capital ($500-$1,000) if deployed to the right chains. **Base, Arbitrum, and Polygon** are the clear winners based on gas costs, DEX volume, flash loan availability, and MEV competition.

**The key insight:** Arbitrum's 7% cyclic arb ratio and 52.6% success rate make it the **best chain for small-capital bots**, despite Base's higher volume. Base's 51% cyclic arb with only 6.3% success means 93.7% of arb attempts fail, wasting gas. With small capital, **success rate matters more than volume**.

**Recommended strategy:**
1. Deploy to Base first (highest volume, validates multi-chain approach)
2. Deploy to Arbitrum immediately after (best success rates, compare to Base)
3. Add Polygon for micro-arb testing (ultra-low gas)
4. Analyze profitability for 30 days
5. Decide: Continue with top 2, pause bottom 1, or expand to Optimism/Avalanche/BSC

**Avoid:** zkSync Era, Scroll, Linea, Mantle, Blast, Mode, Metis — immature ecosystems, insufficient data, or ZK-proof overhead.

**Next step:** Use this research to create a detailed roadmap with phases as outlined above.
