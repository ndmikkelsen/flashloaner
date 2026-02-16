# Technology Stack: Multi-Chain Flashloan Arbitrage

**Project:** Flashloaner Multi-Chain Expansion
**Researched:** 2026-02-16
**Focus:** Alternative EVM chains for small-capital ($500-$1,000) flashloan arbitrage

## Executive Summary

For small-capital flashloan arbitrage in 2026, **Base, Arbitrum, and Polygon** are the top three chains. Base offers the best combination of low gas costs ($0.005 average), high DEX volume (~50% of all L2 DEX activity), and Aave V3 flash loan availability. Arbitrum provides stable liquidity with lower MEV competition (7% optimistic MEV vs 51-55% on Base/Optimism). Polygon offers ultra-low gas costs ($0.0005-$0.2) but higher competition.

**Avoid:** zkSync Era, Scroll, Linea, Mantle, Blast, Mode, Metis — insufficient DEX liquidity, immature flash loan ecosystems, or excessive gas costs for ZK-proof generation.

---

## Chain Rankings for Small-Capital Arbitrage

### Tier 1: Recommended (Deploy First)

| Rank | Chain | Gas Cost | Flash Loan Providers | Top DEXs | Daily DEX Volume | MEV Competition | Why |
|------|-------|----------|---------------------|----------|------------------|----------------|-----|
| 1 | **Base** | $0.005 avg | Aave V3, Balancer V2 | Uniswap V3, Aerodrome | ~$185k revenue/day (50% of L2) | HIGH (51% cyclic arb, 6.3% success) | Highest volume, Coinbase funnel, sub-cent gas |
| 2 | **Arbitrum** | $0.01 avg | Aave V3 ($2.2B TVL), Balancer V2 | Uniswap V3, SushiSwap, Camelot | Stable (~31% L2 TVL) | MODERATE (7% optimistic MEV, 52.6% success) | Lower competition, better success rates, proven liquidity |
| 3 | **Polygon PoS** | $0.0005-$0.2 | Aave V3, Balancer V2 | Uniswap V3, SushiSwap, QuickSwap | High (mature market) | HIGH | Ultra-low gas, large ecosystem, good for micro-arbs |

### Tier 2: Deploy After Validation

| Rank | Chain | Gas Cost | Flash Loan Providers | Top DEXs | Daily DEX Volume | MEV Competition | Why |
|------|-------|----------|---------------------|----------|------------------|----------------|-----|
| 4 | **Optimism** | $0.01 avg | Aave V3, Balancer V2 | Uniswap V3, Velodrome | Lower than Base/Arb | VERY HIGH (55% cyclic arb, 12% success) | Good tech, but retail shifted to Base; high failure rates |
| 5 | **Avalanche** | $0.10-$2 | Aave V3, Balancer V2 | Trader Joe ($57M TVL), Uniswap V3 | $175M 24h (Trader Joe) | MODERATE | Higher gas but strong DEX ecosystem; 25-27 nAVAX base fee |
| 6 | **BSC** | <$0.10 | PancakeSwap flash swaps | PancakeSwap V3, Uniswap V2 | High (largest CEX-linked DEX) | VERY HIGH | 0.25% pool fee, 6.9 gwei gas; competitive but proven arb opportunities |

### Tier 3: Monitor But Don't Prioritize

| Chain | Status | Reason |
|-------|--------|--------|
| **zkSync Era** | SKIP | ZK rollup gas overhead (~1.9 Gwei for zkEVM), SyncSwap has only $64M TVL, arbitrage decay extends over minutes (different dynamics), insufficient flash loan maturity |
| **Scroll** | SKIP | $3.64M monthly data costs (Feb 2024), newer chain with less DEX liquidity, ZK overhead, no major flash loan providers verified |
| **Linea** | SKIP | $2.29M monthly data costs, newer ConsenSys chain, limited DEX ecosystem, ZK overhead |
| **Mantle** | SKIP | $1.05M monthly data costs, smallest of the chains analyzed, insufficient flash loan infrastructure |
| **Blast** | SKIP | #42 TVL ranking, immature ecosystem launched 2024, insufficient flash loan provider data |
| **Mode** | SKIP | Insufficient data on DEX volume and flash loan providers |
| **Metis** | SKIP | Insufficient data on DEX volume and flash loan providers |
| **Fantom** | MAYBE | Aave V3 deployed, Curve deployed, but lower activity than top chains; consider if expanding beyond L2s |

---

## Recommended Multi-Chain Stack

### Core Infrastructure

| Technology | Version | Purpose | Configuration |
|------------|---------|---------|--------------|
| **Foundry** | Latest | Solidity development, multi-chain deployment | Multi-network `foundry.toml` with chain-specific RPC URLs |
| **ethers.js** | v6 | Blockchain interaction, multi-chain support | Provider switching for Base, Arbitrum, Polygon |
| **TypeScript** | 5.x | Bot orchestration | Chain-specific opportunity detectors |

### RPC Providers (Multi-Chain Support)

**Recommended:** Alchemy or QuickNode for unified multi-chain access

| Provider | Chains Supported | Latency | Cost Model | Notes |
|----------|-----------------|---------|------------|-------|
| **Alchemy** | Ethereum, Base, Polygon, Arbitrum, Optimism | Low (99.99% uptime) | Free tier + pay-as-you-go | **NO trace API for Arbitrum** (critical limitation) |
| **QuickNode** | All major EVM chains | Very Low (multi-region) | 20x base + 40-80x for trace/debug | Automatic failover, expensive for trace calls |
| **Infura** | Ethereum, Optimism, Arbitrum, Polygon, Avalanche, Aurora, Starknet | Medium | Free tier + subscription | Broad chain support |

**Cost Optimization Strategy:**
- Use Alchemy for Base, Polygon, Optimism (trace API available)
- Use QuickNode or public RPCs for Arbitrum (Alchemy lacks trace API)
- Use chain-native public RPCs for testing (fallback only)

**RPC Endpoints:**

```typescript
// .env.example additions
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_API_KEY
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY
OPTIMISM_RPC_URL=https://opt-mainnet.g.alchemy.com/v2/YOUR_API_KEY
AVALANCHE_RPC_URL=https://api.avax.network/ext/bc/C/rpc
BSC_RPC_URL=https://bsc-dataseed.binance.org
```

### Flash Loan Providers by Chain

#### Aave V3 (Recommended — Widest Coverage)

**Fee:** 0.09% (governance adjustable, reduced from 0.05% in some markets)
**Chains:** Ethereum, Arbitrum, Optimism, Base, Polygon, Avalanche, Fantom, and 7+ more

| Chain | Aave V3 Pool Address | TVL | Notes |
|-------|---------------------|-----|-------|
| **Arbitrum** | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` | $2.2B | #2 largest Aave deployment |
| **Optimism** | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` | Lower than Arbitrum | Same address (CREATE2) |
| **Base** | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` | Growing | Same address (CREATE2) |
| **Polygon** | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` | Mature | Same address (CREATE2) |
| **Avalanche** | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` | Active | Tutorial-tested |

**Key Advantage:** Same contract address across chains (CREATE2 deployment) simplifies multi-chain contract development.

#### Balancer V2 (Recommended — Zero Fees)

**Fee:** 0% (set at deployment, not changed by governance as of 2026)
**Chains:** Ethereum, Arbitrum, Optimism, Polygon, others
**Liquidity:** $1B+ vault liquidity (combined across all pools)

**Key Advantage:** Zero-fee flash loans maximize net returns. Vault architecture allows multi-token borrowing in single transaction.

**Trade-off:** Smaller asset selection than Aave, but zero fees offset this for supported assets.

#### Chain-Specific Flash Loan Providers

| Chain | Additional Providers | Fee | Notes |
|-------|---------------------|-----|-------|
| **Ethereum** | Uniswap V3, dYdX | Varies | Already supported in existing bot |
| **BSC** | PancakeSwap Flash Swaps | 0.25% pool fee | No dedicated flash loan — use flash swaps |
| **Arbitrum** | Uniswap V3 | 0.05% | Available but Aave/Balancer preferred |
| **Base** | Uniswap V3 | 0.05% | Available but Aave/Balancer preferred |

### DEX Ecosystem by Chain

#### Base (Top Priority)

| DEX | Type | Deployment | TVL/Volume | Notes |
|-----|------|------------|------------|-------|
| **Aerodrome** | V2 AMM | Native | High | Core Base liquidity hub |
| **Uniswap V3** | Concentrated liquidity | `0x...` (see Uniswap docs) | Dominant | Concentrated liquidity, multiple fee tiers |
| **Uniswap V2** | Classic AMM | Deployed 2024+ | Growing | Recently deployed across 6 new chains including Base |

**Liquidity Profile:** ~50% of all L2 DEX volume, $185k daily revenue, driven by Coinbase retail funnel

#### Arbitrum

| DEX | Type | Deployment | TVL/Volume | Notes |
|-----|------|------------|------------|-------|
| **Uniswap V3** | Concentrated liquidity | Official | Dominant | Best liquidity depth |
| **SushiSwap V2** | Classic AMM | `0x1b02da8cb0d097eb8d57a175b88c7d8b47997506` | Established | Router V2 |
| **SushiSwap V3** | Concentrated liquidity | `0x1af415a1eba07a4986a52b6f2e7de7003d82231e` | Growing | Factory V3 |
| **Camelot** | Native AMM | Arbitrum-native | Strong | Arbitrum-specific optimizations |

**Liquidity Profile:** $2.8-$2.9B TVL (31% of L2 DeFi TVL), stable year-over-year, 250ms block times (requires performance optimization)

#### Polygon PoS

| DEX | Type | Deployment | TVL/Volume | Notes |
|-----|------|------------|------------|-------|
| **Uniswap V3** | Concentrated liquidity | Official | Dominant | Best for large trades |
| **SushiSwap V2** | Classic AMM | `0x1b02da8cb0d097eb8d57a175b88c7d8b47997506` | Established | Same router as Arbitrum |
| **QuickSwap** | Native AMM | Polygon-native | High | Polygon-optimized, dragon lair staking |

**Liquidity Profile:** Ultra-low gas ($0.0005-$0.2), mature ecosystem, high competition

#### Optimism

| DEX | Type | Deployment | TVL/Volume | Notes |
|-----|------|------------|------------|-------|
| **Velodrome** | Full-stack AMM | Native | Core hub | Optimism Superchain liquidity hub |
| **Uniswap V3** | Concentrated liquidity | Official | Strong | Multiple fee levels, TWAP oracles |
| **Uniswap V2** | Classic AMM | Deployed 2024+ | Growing | Recently deployed |

**Liquidity Profile:** Lower than Base, retail attention shifted to Base, 55% cyclic arb with only 12% success rate (high competition)

#### Avalanche C-Chain

| DEX | Type | Deployment | TVL/Volume | Notes |
|-----|------|------------|------------|-------|
| **Trader Joe** | Native AMM | Avalanche-native | $57M TVL, $175M 24h volume | Largest Avalanche DEX, expanded to Arbitrum/Ethereum |
| **Uniswap V3** | Concentrated liquidity | Official | Growing | Cross-chain deployment |
| **Uniswap V2** | Classic AMM | Deployed 2024+ | Active | Recently deployed |

**Liquidity Profile:** $150M TVL across Trader Joe, higher gas (25-27 nAVAX base, $0.10-$2 total) but strong volume

#### BSC (Binance Smart Chain)

| DEX | Type | Deployment | TVL/Volume | Notes |
|-----|------|------------|------------|-------|
| **PancakeSwap V3** | Concentrated liquidity | Native | Dominant | Largest CEX-linked DEX |
| **Uniswap V2** | Classic AMM | Deployed 2024+ | Growing | Cross-chain expansion |

**Liquidity Profile:** 6.9 gwei average gas, <$0.10 per tx, 0.25% pool fee, flash swaps available (no dedicated flash loan)

---

## Chain-Specific Configuration

### Gas Cost Analysis (Critical for Small Capital)

| Chain | Average Gas Cost | Complex Arb Cost | Profitability Threshold | Notes |
|-------|-----------------|------------------|------------------------|-------|
| **Base** | $0.005 | ~$0.01-$0.02 | 0.2% spread | Post-Dencun, ideal for micro-arbs |
| **Arbitrum** | $0.01 | ~$0.02-$0.05 | 0.5% spread | 0.1 Gwei average, 20+ TPS |
| **Polygon PoS** | $0.0005-$0.2 | ~$0.01-$0.05 | 0.1-0.5% spread | Variable, ultra-low at best |
| **Optimism** | $0.01 | ~$0.02-$0.05 | 0.5% spread | Similar to Arbitrum |
| **Avalanche** | $0.10-$2 | ~$0.50-$5 | 2-5% spread | Higher threshold, larger opps only |
| **BSC** | <$0.10 | ~$0.10-$0.50 | 1-2% spread | Moderate, competitive |

**Key Insight:** With $500-$1,000 capital, target chains where gas is <$0.05 per transaction. A $0.50 gas cost on a $500 arb = 0.1% of capital per failed attempt.

### Profitability Model by Chain

**Assumptions:**
- Capital: $500-$1,000
- Flash loan fee: 0.09% (Aave) or 0% (Balancer)
- Target: 0.5-2% arbitrage spreads (small opportunities)
- Failed tx tolerance: 3-5 failed attempts per success

| Chain | Min Profitable Spread | Net Return (1% spread, $1k) | Failed TX Cost | Verdict |
|-------|----------------------|----------------------------|---------------|---------|
| **Base** | 0.2% | $10 - $0.01 - $0.90 = **$9.09** | $0.01 | **Excellent** |
| **Arbitrum** | 0.5% | $10 - $0.05 - $0.90 = **$9.05** | $0.05 | **Excellent** |
| **Polygon** | 0.1% | $10 - $0.01 - $0.90 = **$9.09** | $0.01 | **Excellent** |
| **Optimism** | 0.5% | $10 - $0.05 - $0.90 = **$9.05** | $0.05 | Good (but high competition) |
| **Avalanche** | 2% | $20 - $2 - $1.80 = **$16.20** | $2 | Moderate (high gas eats small spreads) |
| **BSC** | 1% | $10 - $0.50 - $2.50 = **$7.00** | $0.50 | Moderate (0.25% pool fee hurts) |

**Calculation:**
```
Net = (Capital × Spread) - Gas - (Capital × Flash Loan Fee)
```

**Recommendation:** Start with Base and Arbitrum where sub-0.5% spreads remain profitable.

---

## MEV Competition Assessment

### Competition Levels by Chain

| Chain | MEV Competition | Cyclic Arb % of Gas | Success Rate | Barriers to Entry | Recommendation |
|-------|----------------|---------------------|--------------|------------------|----------------|
| **Base** | VERY HIGH | 51% | 6.3% | 2 entities control 80%+ MEV | Deploy but expect low success rates; optimize aggressively |
| **Arbitrum** | MODERATE | 7% | 52.6% | Performance optimization required (250ms blocks) | **Best balance** — lower competition, higher success |
| **Optimism** | VERY HIGH | 55% | 12% | Saturated market | Deploy but don't expect high returns |
| **Polygon** | HIGH | Unknown | Unknown | Mature market, many bots | Deploy for volume, not margins |
| **Avalanche** | MODERATE | Unknown | Unknown | Higher gas barrier, fewer small-capital bots | Good for larger spreads (2%+) |
| **BSC** | VERY HIGH | Unknown | Unknown | Largest CEX-linked DEX attracts bots | Competitive but proven opportunities |

**Key Insight:** Base and Optimism have **optimistic MEV** where bots speculatively submit transactions on-chain, hoping to land in the next block. 51-55% of gas is consumed by cyclic arbitrage, but only 6-12% succeed. This is wasteful for small capital.

**Arbitrum's Advantage:** Only 7% of gas consumed by cyclic arb, and 52.6% success rate. This suggests either:
1. Lower competition (fewer bots probing)
2. Better bot quality (more sophisticated detection)
3. Different mempool dynamics (less speculative submission)

**Strategy:** Prioritize Arbitrum for higher success rates. Use Base for volume but expect more failed transactions.

---

## Multi-Chain Deployment Architecture

### Contract Deployment Strategy

**Approach:** Deploy same contracts to multiple chains using CREATE2 for deterministic addresses

```solidity
// FlashloanExecutor.sol — Chain-agnostic
// DEX adapters — Chain-specific (Aerodrome on Base, Camelot on Arbitrum, etc.)
// ProfitValidator — Chain-agnostic (adjust for gas costs)
// CircuitBreaker — Chain-agnostic
```

**Deployment Order:**
1. **Phase 1:** Base (highest volume, lowest gas)
2. **Phase 2:** Arbitrum (best success rates)
3. **Phase 3:** Polygon (ultra-low gas, test micro-arbs)
4. **Phase 4:** Optimism, Avalanche, BSC (if Phase 1-3 profitable)

### Bot Architecture (Multi-Chain Support)

```typescript
// Existing: Ethereum mainnet support
// New: Chain-specific opportunity detectors

interface ChainConfig {
  chainId: number;
  rpcUrl: string;
  flashLoanProviders: Address[];
  dexRouters: { name: string; address: Address }[];
  gasThreshold: bigint; // Max gas to pay per tx
  minSpread: number; // Min profitable spread %
}

const chains: Record<string, ChainConfig> = {
  base: {
    chainId: 8453,
    rpcUrl: process.env.BASE_RPC_URL,
    flashLoanProviders: [
      "0x794a61358D6845594F94dc1DB02A252b5b4814aD", // Aave V3
      // Balancer V2 address TBD
    ],
    dexRouters: [
      { name: "Uniswap V3", address: "..." },
      { name: "Aerodrome", address: "..." },
    ],
    gasThreshold: parseEther("0.00002"), // $0.05 max
    minSpread: 0.002, // 0.2%
  },
  // Arbitrum, Polygon, etc.
};
```

### Multi-Chain Monitoring Strategy

**Option 1: Parallel Monitors (Resource Intensive)**
- Run separate bot instances per chain
- Each monitors its own chain independently
- Pros: Simple, isolated failures
- Cons: 3-6x infrastructure cost

**Option 2: Unified Monitor (Efficient)**
- Single bot instance, round-robin chain monitoring
- Switch providers per iteration
- Pros: Lower cost, shared infrastructure
- Cons: Complex coordination, slower per-chain monitoring

**Recommendation:** Start with **Parallel Monitors** for Base and Arbitrum (top 2 chains). Add unified monitoring if expanding to 4+ chains.

---

## Technology Recommendations

### Core Stack (No Changes)

| Category | Technology | Version | Rationale |
|----------|-----------|---------|-----------|
| Smart Contracts | Solidity | 0.8.x | Existing contracts are chain-agnostic |
| Contract Framework | Foundry | Latest | Multi-chain deployment support built-in |
| Ethereum Library | ethers.js | v6 | Multi-chain provider support |
| Bot Runtime | TypeScript + Node.js | 5.x + 20.x | Existing stack works across chains |
| Testing | Foundry + Vitest | Latest | Dual-language testing maintained |

### New: Multi-Chain Libraries

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| **viem** | 2.x | Alternative to ethers.js | Better TypeScript support, multi-chain utilities, consider for new code |
| **@chain-registry/types** | Latest | Chain metadata (RPC URLs, chain IDs, explorers) | Centralized chain configuration |
| **@layerzerolabs/scan-client** | Latest (if using LayerZero) | Cross-chain message tracking | Only if implementing cross-chain arbs |

**Decision:** Stick with **ethers.js v6** for consistency with existing codebase. Avoid introducing viem unless refactoring.

### RPC Infrastructure (Updated)

**Primary:** Alchemy (Base, Polygon, Optimism) + QuickNode or public RPC (Arbitrum)

**Backup:** Infura (all chains)

**Public RPCs (Free Tier Testing Only):**
```bash
# Base
https://mainnet.base.org

# Arbitrum
https://arb1.arbitrum.io/rpc

# Polygon
https://polygon-rpc.com

# Optimism
https://mainnet.optimism.io

# Avalanche
https://api.avax.network/ext/bc/C/rpc

# BSC
https://bsc-dataseed.binance.org
```

**Warning:** Public RPCs are rate-limited and unreliable for production. Use only for testing.

### Deployment Tooling

| Tool | Purpose | Configuration |
|------|---------|--------------|
| **Foundry scripts** | Multi-chain contract deployment | Chain-specific RPC URLs in `foundry.toml` |
| **Hardhat (optional)** | Verification on non-standard explorers | Only if Foundry verify fails |
| **Tenderly** | Multi-chain transaction simulation | Supports Base, Arbitrum, Polygon, Optimism |

**Multi-Chain foundry.toml:**

```toml
[profile.default]
# ... existing config

[rpc_endpoints]
base = "${BASE_RPC_URL}"
arbitrum = "${ARBITRUM_RPC_URL}"
polygon = "${POLYGON_RPC_URL}"
optimism = "${OPTIMISM_RPC_URL}"
avalanche = "${AVALANCHE_RPC_URL}"
bsc = "${BSC_RPC_URL}"

[etherscan]
base = { key = "${BASESCAN_API_KEY}", url = "https://api.basescan.org/api" }
arbitrum = { key = "${ARBISCAN_API_KEY}", url = "https://api.arbiscan.io/api" }
polygon = { key = "${POLYGONSCAN_API_KEY}", url = "https://api.polygonscan.com/api" }
optimism = { key = "${OPTIMISTIC_ETHERSCAN_API_KEY}", url = "https://api-optimistic.etherscan.io/api" }
avalanche = { key = "${SNOWTRACE_API_KEY}", url = "https://api.snowtrace.io/api" }
bsc = { key = "${BSCSCAN_API_KEY}", url = "https://api.bscscan.com/api" }
```

---

## Anti-Recommendations (What NOT to Use)

### Chains to Avoid

| Chain | Reason | Alternative |
|-------|--------|-------------|
| **zkSync Era** | ZK proof gas overhead (~1.9 Gwei for zkEVM), immature flash loan ecosystem, arbitrage decay extends over minutes (different dynamics than optimistic rollups) | Use Arbitrum or Base instead |
| **Scroll** | Newer ZK rollup, limited DEX liquidity, $3.64M monthly data costs indicate lower activity, no major flash loan providers | Use Base or Arbitrum |
| **Linea** | ConsenSys ZK rollup, $2.29M monthly data costs, limited DEX ecosystem, ZK overhead | Use Optimism (same team's optimistic rollup) |
| **Mantle** | Smallest analyzed chain ($1.05M monthly costs), insufficient flash loan infrastructure | Use larger L2s |
| **Blast, Mode, Metis** | Insufficient data on DEX volume and flash loan providers, too early-stage for production | Monitor but don't deploy yet |

### Flash Loan Providers to Avoid

| Provider | Reason | Alternative |
|----------|--------|-------------|
| **dYdX** | Ethereum-only, not deployed on L2s | Use Aave V3 or Balancer V2 |
| **Uniswap V3 Flash** | 0.05% fee when Balancer offers 0% | Use Balancer V2 |
| **PancakeSwap Flash Swaps** | 0.25% pool fee (higher than Aave's 0.09%) | Use Aave V3 on BSC if/when deployed |

### RPC Providers to Avoid

| Provider/Approach | Reason | Alternative |
|------------------|--------|-------------|
| **Alchemy for Arbitrum** | No trace API support (critical for debugging complex arbs) | Use QuickNode or Infura for Arbitrum |
| **Public RPCs for production** | Rate limits, downtime, no SLA | Use Alchemy, QuickNode, or Infura |
| **Running own nodes** | $500-$2,000/month per chain, operational overhead | Use managed RPC providers |

---

## Installation & Configuration

### Environment Variables

```bash
# Add to .env (NEVER commit)

# === RPC Endpoints ===
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_API_KEY
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY
OPTIMISM_RPC_URL=https://opt-mainnet.g.alchemy.com/v2/YOUR_API_KEY
AVALANCHE_RPC_URL=https://api.avax.network/ext/bc/C/rpc
BSC_RPC_URL=https://bsc-dataseed.binance.org

# === Etherscan API Keys (for contract verification) ===
BASESCAN_API_KEY=YOUR_API_KEY_HERE
ARBISCAN_API_KEY=YOUR_API_KEY_HERE
POLYGONSCAN_API_KEY=YOUR_API_KEY_HERE
OPTIMISTIC_ETHERSCAN_API_KEY=YOUR_API_KEY_HERE
SNOWTRACE_API_KEY=YOUR_API_KEY_HERE
BSCSCAN_API_KEY=YOUR_API_KEY_HERE

# === Deployment Configuration ===
DEPLOYER_PRIVATE_KEY=YOUR_PRIVATE_KEY_HERE

# === Chain Selection (for bot) ===
ENABLED_CHAINS=base,arbitrum,polygon
PRIMARY_CHAIN=base
```

### Package Dependencies (No New Packages Needed)

```bash
# Existing packages already support multi-chain
pnpm install ethers@6
pnpm install -D @types/node
```

### Foundry Setup

```bash
# Test deployment on Base fork
forge script script/Deploy.s.sol --fork-url $BASE_RPC_URL

# Test deployment on Arbitrum fork
forge script script/Deploy.s.sol --fork-url $ARBITRUM_RPC_URL

# Broadcast to Base testnet (e.g., Base Sepolia)
forge script script/Deploy.s.sol --rpc-url $BASE_TESTNET_RPC_URL --broadcast --verify

# Broadcast to Base mainnet (requires explicit approval)
forge script script/Deploy.s.sol --rpc-url $BASE_RPC_URL --broadcast --verify
```

---

## Key Contract Addresses (Reference)

### Aave V3 Pool (Same Address on All Chains)

```solidity
address constant AAVE_V3_POOL = 0x794a61358D6845594F94dc1DB02A252b5b4814aD;

// Deployed on:
// - Ethereum
// - Arbitrum
// - Optimism
// - Base
// - Polygon
// - Avalanche
// - Fantom
// - Others (14+ chains)
```

### Uniswap V3 (Chain-Specific)

See official Uniswap deployment docs:
- https://docs.uniswap.org/contracts/v3/reference/deployments/
- https://docs.uniswap.org/contracts/v3/reference/deployments/arbitrum-deployments

### SushiSwap V2/V3

| Chain | Router V2 | Factory V3 |
|-------|-----------|------------|
| Arbitrum | `0x1b02da8cb0d097eb8d57a175b88c7d8b47997506` | `0x1af415a1eba07a4986a52b6f2e7de7003d82231e` |
| Polygon | `0x1b02da8cb0d097eb8d57a175b88c7d8b47997506` | TBD |
| BSC | `0x1b02da8cb0d097eb8d57a175b88c7d8b47997506` | TBD |

### Balancer V2 Vault

See Balancer docs for chain-specific addresses:
- https://docs-v2.balancer.fi/reference/contracts/deployment-addresses/

---

## Sources & Confidence Assessment

| Topic | Confidence | Sources |
|-------|-----------|---------|
| Gas costs (Base, Arbitrum, Optimism, Polygon) | HIGH | [Gas Fee Markets on Layer 2 Statistics 2026](https://coinlaw.io/gas-fee-markets-on-layer-2-statistics/), [Arbitrum Gas Docs](https://docs.arbitrum.io/how-arbitrum-works/deep-dives/gas-and-fees) |
| Aave V3 deployments | HIGH | [Aave Flash Loans Docs](https://aave.com/docs/aave-v3/guides/flash-loans), [Aave Arbitrum](https://aave.com/blog/aave-arbitrum), [Aave Addresses Dashboard](https://aave.com/docs/resources/addresses) |
| DEX volume (Base, Arbitrum) | HIGH | [Base DefiLlama](https://defillama.com/chain/base), [2026 Layer 2 Outlook](https://www.theblock.co/post/383329/2026-layer-2-outlook), [DEX Statistics 2026](https://coinlaw.io/decentralized-exchanges-dex-statistics/) |
| MEV competition analysis | HIGH | [Optimistic MEV in L2s](https://arxiv.org/html/2506.14768), [When Priority Fails](https://arxiv.org/html/2506.01462) |
| Balancer flash loans | HIGH | [Balancer Flash Loans Docs](https://docs-v2.balancer.fi/reference/contracts/flash-loans.html), [Capitalizing on Balancer's Flash Loans](https://medium.com/balancer-protocol/capitalizing-on-balancers-flash-loans-ddb17dec6958) |
| Uniswap V2/V3 deployments | HIGH | [Uniswap V2 Multi-Chain Launch](https://blog.uniswap.org/uniswap-v2-now-live-across-more-major-chains), [Uniswap Deployment Addresses](https://docs.uniswap.org/contracts/v3/reference/deployments/) |
| RPC providers | MEDIUM | [7 High-Performance RPC Providers 2026](https://www.cherryservers.com/blog/high-performance-rpc-node-providers), [Best Arbitrum RPC Providers](https://www.dwellir.com/blog/best-arbitrum-rpc-providers-2025), [Top 6 Base RPC Providers](https://www.dwellir.com/blog/top-6-base-providers-2025) |
| Small-capital profitability | MEDIUM | [Flash Loan Arbitrage Profitability](https://medium.com/@barronqasem/i-made-47-000-in-my-first-month-using-flash-loan-arbitrage-and-you-can-learn-how-62cc0586f931), [What Is Flash Loan Arbitrage](https://yellow.com/learn/what-is-flash-loan-arbitrage-a-guide-to-profiting-from-defi-exploits) |
| zkSync Era, Scroll, Linea, Mantle | MEDIUM | [ZKsync Fee Structure](https://docs.zksync.io/zksync-protocol/rollup/fee-model/fee-structure), [L2 Data Costs Tweet](https://x.com/0xKofi/status/1764684311297503644) |
| Avalanche (Trader Joe) | MEDIUM | [Trader Joe DefiLlama](https://defillama.com/protocol/joe-dex), [Avalanche DefiLlama](https://defillama.com/chain/avalanche) |
| BSC (PancakeSwap) | MEDIUM | [PancakeSwap Flash Loan Arbitrage](https://medium.com/coinmonks/flash-loan-arbitrage-on-pancakeswap-yummy-cake-or-pie-in-the-sky-part-ii-e9357ab1ff94) |
| Blast, Mode, Metis | LOW | [Blast DefiLlama](https://defillama.com/chain/Blast), [Mode DefiLlama](https://defillama.com/chain/mode), [Metis DefiLlama](https://defillama.com/chain/Metis) — insufficient 2026 data |

**Overall Confidence:** MEDIUM-HIGH

- **High confidence:** Gas costs, Aave V3 availability, Uniswap deployments, MEV competition on Base/Arbitrum/Optimism
- **Medium confidence:** RPC provider performance, small-capital profitability estimates, zkSync/Scroll/Linea/Mantle assessment
- **Low confidence:** Blast, Mode, Metis (insufficient current data)

**Gaps to Address:**
- Real-time TVL/volume data for all chains (use DefiLlama API in bot for current data)
- Chain-specific Balancer V2 Vault addresses (verify in Balancer docs during implementation)
- Exact Base contract addresses for Aerodrome and other Base-native DEXs
- Updated 2026 data for zkSync Era, Scroll, Linea (monitoring phase)

---

## Next Steps (For Roadmap)

1. **Phase 1: Base Deployment**
   - Deploy contracts to Base testnet (Base Sepolia)
   - Integrate Aave V3 and Balancer V2 on Base
   - Add Uniswap V3 and Aerodrome DEX adapters
   - Test with small capital ($100-$500) on mainnet

2. **Phase 2: Arbitrum Deployment**
   - Deploy contracts to Arbitrum (reuse Base contracts)
   - Integrate Arbitrum-specific DEXs (Camelot, SushiSwap)
   - Implement 250ms block time optimizations
   - Compare success rates vs Base

3. **Phase 3: Polygon Deployment**
   - Deploy to Polygon PoS
   - Test micro-arbitrage ($0.0005-$0.2 gas)
   - Measure competition levels

4. **Phase 4: Profitability Analysis**
   - 30-day trial on Base, Arbitrum, Polygon
   - Track: success rate, average profit per arb, gas costs, failed tx ratio
   - Decision: continue with top 2 chains, pause bottom 1

5. **Phase 5: Expansion (Optional)**
   - Deploy to Optimism, Avalanche, BSC if Phase 1-4 profitable
   - Monitor zkSync Era, Scroll, Linea for maturation

**Research Flags:**
- **Phase 1:** Likely needs deeper research into Aerodrome DEX API and Base-specific MEV dynamics
- **Phase 2:** Arbitrum 250ms block times may require bot architecture changes (research parallel vs sequential monitoring)
- **Phase 4:** Profitability analysis will determine if expansion is viable
