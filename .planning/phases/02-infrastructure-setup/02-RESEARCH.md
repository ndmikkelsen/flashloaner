# Phase 2: Infrastructure Setup - Research

**Researched:** 2026-02-16
**Domain:** Multi-chain deployment infrastructure (Foundry + TypeScript monorepo)
**Confidence:** HIGH

## Summary

Phase 2 focuses on deploying existing contracts to Arbitrum Sepolia testnet and establishing a monorepo structure that supports multi-chain configuration without duplicating bot logic. The **brownfield nature** of this project simplifies the task: contracts already exist and have passed 312 Foundry tests and 423 Vitest tests. The work centers on:

1. **Foundry deployment to Arbitrum Sepolia** - Minimal changes needed. Existing `Deploy.s.sol` already supports multi-chain via environment variables. Need only to add Arbitrum-specific addresses (Aave pool, DEX routers, token addresses) to a new `.env.arbitrum-sepolia` file.

2. **Monorepo configuration structure** - Separate chain-specific config (addresses, RPC URLs, gas parameters) from shared bot modules (PriceMonitor, OpportunityDetector, ExecutionEngine). Use TypeScript config objects per chain, not per-chain codebases.

3. **DEX adapter compatibility** - Existing UniswapV2Adapter and UniswapV3Adapter work on Arbitrum without modification (Uniswap V3 uses same contract addresses across chains via CREATE2, SushiSwap V2 is a Uni V2 fork). Only need to map Arbitrum DEXs (Uniswap V3, Camelot, SushiSwap) to existing adapter types.

**Primary recommendation:** Use environment-based configuration (`.env.arbitrum-sepolia`, `.env.ethereum`) for chain-specific addresses and a shared TypeScript config loader that selects the correct environment based on `CHAIN_ID`. This avoids code duplication while maintaining clear chain boundaries.

---

## Standard Stack

### Core (Already in Use)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **Foundry** | Latest (forge 0.2.0+) | Solidity deployment & testing | Industry standard for Solidity development in 2026, superior to Hardhat for testing speed |
| **ethers.js** | v6 (6.x) | Blockchain interaction from TypeScript | Most widely adopted library for ethers interaction, v6 is current stable |
| **TypeScript** | 5.x | Type-safe bot development | De facto standard for Node.js blockchain bots |
| **Vitest** | Latest | TypeScript testing | Faster alternative to Jest, better ESM support |
| **pnpm** | Latest | Package management | Faster than npm, better monorepo support |

### Supporting (New for Phase 2)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **dotenv** | 16.x | Environment variable loading | Already in use, extend for multi-chain `.env` files |
| **zod** | 3.x (optional) | Runtime config validation | Recommended for validating chain-specific addresses at startup |

**Installation** (already complete):
```bash
# Existing dependencies - no new packages needed
pnpm install
```

---

## Architecture Patterns

### Recommended Monorepo Structure

**Decision:** Keep single-repo structure (already in place), extend with chain-specific config directories.

```
flashloaner/                        # Root monorepo
├── contracts/                      # Solidity smart contracts (shared)
│   ├── src/                        # Contract source (chain-agnostic)
│   ├── test/                       # Foundry tests (shared)
│   └── script/                     # Deployment scripts (shared)
│       └── Deploy.s.sol            # Existing script (multi-chain ready)
├── bot/                            # TypeScript off-chain bot (shared logic)
│   ├── src/
│   │   ├── monitor/                # PriceMonitor (shared)
│   │   ├── detector/               # OpportunityDetector (shared)
│   │   ├── engine/                 # ExecutionEngine (shared)
│   │   └── config/                 # Chain-specific config loader
│   │       ├── chains/             # NEW: Per-chain configs
│   │       │   ├── ethereum.ts     # Ethereum mainnet config
│   │       │   ├── sepolia.ts      # Ethereum Sepolia config
│   │       │   ├── arbitrum.ts     # Arbitrum mainnet config
│   │       │   └── arbitrum-sepolia.ts  # Arbitrum Sepolia config
│   │       ├── index.ts            # Config loader (select by CHAIN_ID)
│   │       └── types.ts            # ChainConfig interface
├── deployments/                    # NEW: Deployment artifacts per chain
│   ├── 1.json                      # Ethereum mainnet
│   ├── 11155111.json               # Sepolia
│   ├── 42161.json                  # Arbitrum One
│   └── 421614.json                 # Arbitrum Sepolia
├── .env.ethereum                   # Ethereum-specific vars
├── .env.sepolia                    # Sepolia-specific vars
├── .env.arbitrum-sepolia           # NEW: Arbitrum Sepolia vars
├── foundry.toml                    # Multi-chain RPC endpoints (already configured)
└── package.json                    # Shared dependencies
```

### Pattern 1: Chain-Specific Config Loading

**What:** Single codebase with runtime config selection based on environment variables.

**When to use:** Multi-chain bot with shared arbitrage logic but different addresses/parameters per chain.

**Example:**
```typescript
// Source: Project codebase + monorepo best practices
// bot/src/config/chains/arbitrum-sepolia.ts
import type { ChainConfig } from "../types.js";

export const ARBITRUM_SEPOLIA_CONFIG: ChainConfig = {
  chainId: 421614,
  chainName: "arbitrum-sepolia",

  // RPC (from env)
  rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC_URL!,

  // Deployed contracts (from deployments/421614.json after deploy)
  contracts: {
    flashloanExecutor: "0x...",  // Filled post-deployment
    uniswapV2Adapter: "0x...",
    uniswapV3Adapter: "0x...",
  },

  // Protocol addresses (Arbitrum Sepolia)
  protocols: {
    aaveV3Pool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",  // Same as mainnet (CREATE2)
    balancerVault: "0x...",  // TBD: Query Balancer docs
    weth: "0x...",  // TBD: Query Arbiscan for wrapped ETH on Sepolia
  },

  // DEX routers (Arbitrum Sepolia)
  dexes: {
    uniswapV3: {
      factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",  // Same across chains
      router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",  // SwapRouter02
      quoter: "0x...",  // TBD: Verify from Uniswap docs
    },
    camelot: {
      factory: "0x18E621B64d7808c3C47bccbbD7485d23F257D26f",
      router: "0x171B925C51565F5D2a7d8C494ba3188D304EFD93",
    },
    sushiswap: {
      router: "0x...",  // TBD: SushiSwap V2 router on Arbitrum Sepolia
    },
  },

  // Token addresses (Arbitrum Sepolia)
  tokens: {
    WETH: "0x...",   // TBD: Query Arbiscan
    USDC: "0x...",   // TBD: Native USDC on Arbitrum
    USDT: "0x...",   // TBD
  },

  // Gas parameters (Arbitrum-specific)
  gas: {
    maxGasPriceGwei: 0.1,  // Arbitrum L2 gas is very cheap
    gasPerSwap: 150_000,   // Conservative estimate
    // L1 data fee multiplier: 95% of total cost on Arbitrum
    l1DataFeeMultiplier: 19.0,  // 95/5 ratio
  },

  // Profit thresholds (adjusted for Arbitrum gas costs)
  profitability: {
    minProfitThreshold: 0.01,  // ETH
    minProfitPercentage: 0.5,  // 0.5% minimum spread
  },
};

// bot/src/config/index.ts
export function loadChainConfig(chainId?: number): ChainConfig {
  const targetChainId = chainId ?? parseInt(process.env.CHAIN_ID ?? "1");

  switch (targetChainId) {
    case 1: return ETHEREUM_CONFIG;
    case 11155111: return SEPOLIA_CONFIG;
    case 42161: return ARBITRUM_CONFIG;
    case 421614: return ARBITRUM_SEPOLIA_CONFIG;
    default:
      throw new Error(`Unsupported chain ID: ${targetChainId}`);
  }
}
```

### Pattern 2: Foundry Multi-Chain Deployment with Environment Variables

**What:** Single `Deploy.s.sol` script that reads chain-specific addresses from environment variables, enabling deployment to any chain without code changes.

**When to use:** Deploying same contract suite to multiple chains with different protocol addresses.

**Example:**
```solidity
// Source: https://getfoundry.sh/forge/deploying + project Deploy.s.sol
// contracts/script/Deploy.s.sol (already exists, no changes needed)

contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address botWallet = vm.envAddress("BOT_WALLET_ADDRESS");

        // Chain-agnostic config loading (reads from .env)
        address aavePool = vm.envAddress("AAVE_V3_POOL");
        address balancerVault = vm.envAddress("BALANCER_VAULT");
        address uniswapV2Router = vm.envAddress("UNISWAP_V2_ROUTER");
        address uniswapV3Router = vm.envAddress("UNISWAP_V3_ROUTER");
        address uniswapV3Quoter = vm.envAddress("UNISWAP_V3_QUOTER");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy contracts (same code, different addresses)
        FlashloanExecutor executor = new FlashloanExecutor(
            aavePool,
            balancerVault,
            msg.sender,  // owner
            botWallet,
            vm.envUint("MIN_PROFIT_WEI")
        );

        UniswapV2Adapter uniV2 = new UniswapV2Adapter(uniswapV2Router);
        UniswapV3Adapter uniV3 = new UniswapV3Adapter(uniswapV3Router, uniswapV3Quoter);

        executor.registerAdapter(address(uniV2));
        executor.registerAdapter(address(uniV3));

        vm.stopBroadcast();
    }
}
```

**Usage:**
```bash
# Deploy to Arbitrum Sepolia (reads .env.arbitrum-sepolia)
source .env.arbitrum-sepolia && forge script script/Deploy.s.sol \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ARBISCAN_API_KEY
```

### Pattern 3: Deployment Artifact Recording

**What:** Foundry automatically creates deployment artifacts in `broadcast/`, manually export to `deployments/{chainId}.json` for bot consumption.

**When to use:** Bot needs deployed contract addresses to interact with on-chain contracts.

**Example:**
```typescript
// Source: Deploy.s.sol (already implements this)
// After deployment, Deploy.s.sol writes deployments/{chainId}.json:
{
  "chainId": 421614,
  "network": "arbitrum-sepolia",
  "deployedAt": "1708300000",
  "blockNumber": 12345678,
  "contracts": {
    "FlashloanExecutor": "0xabc...",
    "CircuitBreaker": "0xdef...",
    "ProfitValidator": "0x123...",
    "UniswapV2Adapter": "0x456...",
    "UniswapV3Adapter": "0x789..."
  },
  "configuration": {
    "aavePool": "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    "balancerVault": "0x...",
    "uniswapV2Router": "0x...",
    "uniswapV3Router": "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    "uniswapV3Quoter": "0x..."
  }
}
```

Bot loads this at runtime:
```typescript
import { readFileSync } from "node:fs";
const chainId = parseInt(process.env.CHAIN_ID!);
const deployment = JSON.parse(readFileSync(`./deployments/${chainId}.json`, "utf-8"));
const executorAddress = deployment.contracts.FlashloanExecutor;
```

### Anti-Patterns to Avoid

- **Per-chain codebases**: Don't duplicate `bot/` directory for each chain (e.g., `bot-ethereum/`, `bot-arbitrum/`). Use config-based selection.
- **Hardcoded addresses in code**: Don't embed contract addresses in TypeScript modules. Load from config/env.
- **Chain-specific deployment scripts**: Don't create `DeployEthereum.s.sol`, `DeployArbitrum.s.sol`. Use single script with env vars.
- **TypeScript project references**: Overkill for this monorepo size (only 2 logical packages: contracts + bot). Use simple shared tsconfig.json.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| **Multi-chain RPC management** | Custom RPC failover logic | ethers.js `FallbackProvider` | Handles provider failures, retries, and quorum |
| **Environment variable validation** | Manual `if (!process.env.X) throw` | `zod` schema validation (optional) | Runtime type checking, clear error messages |
| **Gas price estimation on Arbitrum** | Custom L1 data fee calculator | Arbitrum RPC `eth_estimateGas` (includes L1 data fee) | Arbitrum sequencer calculates L1+L2 fees automatically |
| **Chain ID detection** | Manual `await provider.getNetwork()` | ethers.js `provider.network.chainId` | Built-in, cached after first call |

**Key insight:** Foundry and ethers.js v6 already have multi-chain support built-in. The challenge is **organization and configuration**, not implementation. Focus on clean config structure, not building infrastructure.

---

## Common Pitfalls

### Pitfall 1: Native vs Bridged Token Confusion on L2s

**What goes wrong:** Deployed contracts revert because bot tries to use bridged USDC (USDC.e) in a pool that requires native USDC, or vice versa.

**Why it happens:** On Arbitrum (and other L2s), the same stablecoin exists in two versions:
- **Native USDC**: Minted directly by Circle on Arbitrum (`0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8` on Arbitrum mainnet)
- **Bridged USDC.e**: Locked on Ethereum, minted by Arbitrum bridge (legacy, still traded)

Flash loan contract can borrow USDC.e but DEX pool only accepts native USDC → swap reverts → arbitrage fails.

**How to avoid:**
1. **Explicit token versioning in config**: Use separate addresses for `USDC_NATIVE` and `USDC_BRIDGED`.
2. **Pool compatibility matrix**: Document which DEXs/pools use which token version.
3. **Symbol disambiguation in logs**: Log `arbitrum-usdc-native` vs `arbitrum-usdc-bridged`, not just `USDC`.

**Warning signs:**
- Reverts with "Insufficient allowance" or "Transfer failed" despite sufficient balance.
- Pool reserves show zero for one token in the pair.
- DEX UI shows different prices for "USDC" on different DEXs (likely different versions).

**Reference:** [Phase 1 ARBITRUM.md](/.planning/phases/01-chain-research/ARBITRUM.md#6-token-addresses-arbitrum-mainnet) - Native vs Bridged Tokens section.

---

### Pitfall 2: L1 Data Fees Dominate Total Gas Cost on Arbitrum

**What goes wrong:** Bot detects 1.5% arbitrage opportunity, executes transaction, but loses money because total gas cost is 2% (L2 execution: 0.1%, L1 data: 1.9%).

**Why it happens:** Arbitrum uses a **two-dimensional fee model**:
- **L2 execution cost**: ~5% of total (cheap, ~0.1 Gwei for computation)
- **L1 data posting cost**: **~95% of total** (expensive, priced at Ethereum mainnet gas rates)

Teams calculate profitability using only L2 execution costs from `estimateGas()`, ignoring that Arbitrum must post compressed transaction calldata to Ethereum L1.

**Formula** (from [Arbitrum Gas Docs](https://docs.arbitrum.io/how-arbitrum-works/deep-dives/gas-and-fees)):
```
Total Gas = L2 Execution Cost + (L1 Estimated Cost / L2 Gas Price)
L1 Estimated Cost = L1 Gas Price × Compressed Calldata Size × 16
```

**How to avoid:**
1. **Use Arbitrum RPC `eth_estimateGas`**: Arbitrum's RPC already includes L1 data fees in gas estimates. Don't calculate separately.
2. **Monitor Ethereum mainnet basefee**: L1 data fees fluctuate with Ethereum mainnet gas prices, not Arbitrum gas prices.
3. **Increase profit threshold on L2s**: Add 0.5-1% safety margin to account for gas fee variability between detection and execution.
4. **Log L1 vs L2 breakdown**: Use `eth_getTransactionReceipt` after execution to see actual L1/L2 split, validate assumptions.

**Warning signs:**
- Profitable opportunities on testnet become unprofitable on mainnet (mainnet L1 fees higher).
- Gas estimates vary wildly with Ethereum mainnet congestion (L1 data fee dominates).
- Arbitrage succeeds but net profit < expected (L1 fees underestimated).

**Reference:** [Arbitrum Gas Pricing Docs](https://docs.arbitrum.io/how-arbitrum-works/l1-gas-pricing), [Phase 1 ARBITRUM.md](/.planning/phases/01-chain-research/ARBITRUM.md#7-gas-cost-model).

---

### Pitfall 3: Same Contract Address ≠ Same Functionality Across Chains

**What goes wrong:** Deployed contracts fail on Arbitrum Sepolia because constructor args reference Ethereum mainnet addresses (e.g., Aave pool from Ethereum instead of Arbitrum).

**Why it happens:** Uniswap V3 and Aave use CREATE2 deployment, resulting in **same contract addresses** across chains (e.g., Uniswap V3 Factory is `0x1F98431c8aD98523631AE4a59f267346ea31F984` on every EVM chain). Developers assume "same address = same config" and forget to change constructor arguments for protocol dependencies.

**How to avoid:**
1. **Environment-specific `.env` files**: `.env.arbitrum-sepolia` with Arbitrum-specific addresses, never copy-paste from `.env.ethereum`.
2. **Pre-deployment checklist**: Verify every address in `.env` file resolves on the target chain (use block explorer).
3. **Deployment script validation**: Add `require(aavePool.code.length > 0, "Aave pool has no code on this chain")` before deployment.

**Warning signs:**
- Deployment succeeds but contract calls revert with "Call to non-contract".
- Explorer shows deployed contract but state variables point to address(0) or EOAs.
- Testnet deployment works but identical script fails on mainnet (forgot to update `.env`).

**Reference:** [Foundry deployment patterns](https://getfoundry.sh/forge/deploying), [Multi-Chain Deployment Issue](https://github.com/foundry-rs/foundry/issues/2519).

---

### Pitfall 4: DEX Adapter Assumes Ethereum-Specific Behavior

**What goes wrong:** UniswapV3Adapter works on Ethereum but fails on Arbitrum with "Transaction reverted silently" due to Arbitrum's different block number behavior.

**Why it happens:** Solidity contracts sometimes use `block.timestamp` or `block.number` for logic (e.g., deadline checks, TWAP oracles). Arbitrum's block time is **0.25 seconds** (vs 12 seconds on Ethereum), and `block.number` advances at L2 rate, not L1 rate. Code that assumes "block.number increases by 1 every 12 seconds" breaks.

**EVM Compatibility Status** (from [Arbitrum Solidity Support Docs](https://docs.arbitrum.io/build-decentralized-apps/arbitrum-vs-ethereum/solidity-support)):
- **Solidity compatibility**: 100% - All Solidity compiles and runs on Arbitrum.
- **Opcode compatibility**: 99.9% - All standard opcodes work (minor differences in `block.number`, `blockhash`).
- **Gas metering**: Different - L2 execution + L1 data posting (two-dimensional fees).

**How to avoid:**
1. **Use `block.timestamp` not `block.number`**: Timestamps are consistent across chains, block numbers are not.
2. **Test on Arbitrum Sepolia**: Verify all DEX adapters work on testnet before mainnet.
3. **Review Arbitrum EVM differences**: Check [Arbitrum vs Ethereum Comparison](https://docs.arbitrum.io/build-decentralized-apps/arbitrum-vs-ethereum/comparison-overview) for edge cases.

**Warning signs:**
- Adapter works in Foundry mainnet fork but fails on Arbitrum mainnet fork.
- Reverts with "Deadline exceeded" despite setting deadline to `block.timestamp + 300`.
- Oracle price queries return stale data on Arbitrum.

---

## Code Examples

Verified patterns from official sources and project codebase:

### Example 1: Load Chain-Specific Config in TypeScript Bot

```typescript
// Source: Project bot/src/index.ts + ethers.js v6 docs
import { JsonRpcProvider, FallbackProvider } from "ethers";
import { loadChainConfig } from "./config/index.js";

async function main() {
  // Load config for target chain (from CHAIN_ID env var)
  const config = loadChainConfig();

  console.log(`Starting bot for ${config.chainName} (chain ID ${config.chainId})`);

  // Multi-provider setup for resilience
  const providers = [
    new JsonRpcProvider(config.rpcUrl),  // Primary RPC
    new JsonRpcProvider(config.fallbackRpcUrl),  // Fallback RPC
  ];

  const provider = new FallbackProvider(providers);

  // Verify chain ID matches config
  const network = await provider.getNetwork();
  if (network.chainId !== BigInt(config.chainId)) {
    throw new Error(`RPC returned chain ID ${network.chainId}, expected ${config.chainId}`);
  }

  // Load deployed contract addresses from deployment artifact
  const deployment = await import(`../deployments/${config.chainId}.json`);
  const executorAddress = deployment.contracts.FlashloanExecutor;

  console.log(`FlashloanExecutor at ${executorAddress}`);

  // Bot logic continues...
}
```

### Example 2: Multi-Chain RPC Configuration in foundry.toml

```toml
# Source: https://getfoundry.sh/reference/cheatcodes/rpc + project foundry.toml
[rpc_endpoints]
mainnet = "${MAINNET_RPC_URL}"
sepolia = "${SEPOLIA_RPC_URL}"
arbitrum = "${ARBITRUM_RPC_URL}"
arbitrum-sepolia = "https://sepolia-rollup.arbitrum.io/rpc"  # Public RPC for testing
base = "${BASE_RPC_URL}"
base-sepolia = "${BASE_SEPOLIA_RPC_URL}"

[etherscan]
mainnet = { key = "${ETHERSCAN_API_KEY}" }
sepolia = { key = "${ETHERSCAN_API_KEY}" }
arbitrum = { key = "${ARBISCAN_API_KEY}" }
arbitrum-sepolia = { key = "${ARBISCAN_API_KEY}" }
base = { key = "${BASESCAN_API_KEY}" }
base-sepolia = { key = "${BASESCAN_API_KEY}" }
```

### Example 3: Deploy to Arbitrum Sepolia

```bash
# Source: https://getfoundry.sh/forge/deploying + project deployment patterns
# Step 1: Create .env.arbitrum-sepolia with Arbitrum-specific addresses
cat > .env.arbitrum-sepolia <<EOF
DEPLOYER_PRIVATE_KEY=0x...
BOT_WALLET_ADDRESS=0x...

# Arbitrum Sepolia RPC
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

# Protocol addresses (Arbitrum Sepolia)
AAVE_V3_POOL=0x794a61358D6845594F94dc1DB02A252b5b4814aD
BALANCER_VAULT=0x...  # TBD
WETH_ADDRESS=0x...    # TBD

# DEX routers (Arbitrum Sepolia)
UNISWAP_V2_ROUTER=0x...  # SushiSwap or Camelot V2 router
UNISWAP_V3_ROUTER=0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45
UNISWAP_V3_QUOTER=0x...  # TBD

# Safety parameters
MIN_PROFIT_WEI=10000000000000000  # 0.01 ETH
MAX_GAS_PRICE=100000000  # 0.1 Gwei (Arbitrum is very cheap)
MAX_TRADE_SIZE=1000000000000000000000  # 1000 ETH
FAILURE_THRESHOLD=5

# Verification
ARBISCAN_API_KEY=YOUR_KEY_HERE
EOF

# Step 2: Deploy to Arbitrum Sepolia
source .env.arbitrum-sepolia && forge script script/Deploy.s.sol \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ARBISCAN_API_KEY \
  -vvv

# Step 3: Verify deployment artifact created
cat deployments/421614.json
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardhat for Solidity deployment | **Foundry forge script** | 2023-2024 | 10x faster tests, native multi-chain, better UX |
| Per-chain monorepo workspaces | **Shared codebase + config-based selection** | 2024-2025 | Less duplication, easier maintenance |
| Manual gas estimation for L2s | **RPC `eth_estimateGas` (includes L1 data fees)** | 2024 (post-Dencun) | Accurate L2 gas costs, no manual calculation |
| ethers.js v5 | **ethers.js v6** | 2023 | Simpler API, better TypeScript support, single package |
| Manual environment variable loading | **dotenv + zod validation** | 2025 | Runtime type safety, clear errors on misconfiguration |

**Deprecated/outdated:**
- **TypeScript project references for small monorepos**: Turborepo recommends against it for <100 packages (adds complexity, minimal benefit). Use simple shared tsconfig.json instead.
  - Reference: [Turborepo TypeScript Guide](https://turbo.build/repo/docs/guides/tools/typescript)

- **Hardhat deployment scripts**: Foundry's `forge script` is now the standard for production deployments (faster, better verification, native multi-chain).
  - Reference: [Foundry Deployment Docs](https://getfoundry.sh/forge/deploying)

- **Custom L1 data fee calculators for Arbitrum**: Arbitrum RPC `eth_estimateGas` already includes L1+L2 fees post-Dencun upgrade.
  - Reference: [Arbitrum Gas Estimation](https://docs.arbitrum.io/build-decentralized-apps/how-to-estimate-gas)

---

## Open Questions

### High Priority (Resolve During Phase 2 Implementation)

1. **Balancer V2 Vault address on Arbitrum Sepolia**
   - What we know: Balancer V2 is deployed on Arbitrum mainnet
   - What's unclear: Vault address on Arbitrum Sepolia testnet (may not exist)
   - Recommendation: Check [Balancer deployment docs](https://docs.balancer.fi/reference/contracts/deployment-addresses.html) or deploy mock vault for testing

2. **WETH, USDC, USDT token addresses on Arbitrum Sepolia**
   - What we know: Mainnet addresses documented in Phase 1 research
   - What's unclear: Testnet token addresses differ from mainnet
   - Recommendation: Query [Arbiscan Sepolia](https://sepolia.arbiscan.io/) for "WETH", "USDC" token contracts

3. **Uniswap V3 Quoter address on Arbitrum Sepolia**
   - What we know: Router address is `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45`
   - What's unclear: QuoterV2 address for price simulation
   - Recommendation: Check [Uniswap V3 Arbitrum deployments](https://docs.uniswap.org/contracts/v3/reference/deployments/arbitrum-deployments)

4. **Camelot and SushiSwap V2 router addresses on Arbitrum Sepolia**
   - What we know: Camelot Sepolia factory is `0x18E621B64d7808c3C47bccbbD7485d23F257D26f`
   - What's unclear: Complete router addresses for both DEXs
   - Recommendation: Use Camelot Sepolia router `0x171B925C51565F5D2a7d8C494ba3188D304EFD93` from Phase 1 research, query for SushiSwap

### Medium Priority (Validate After Testnet Deployment)

5. **Actual L1 data fee percentage on Arbitrum Sepolia**
   - What we know: Arbitrum docs claim 95% L1 / 5% L2 split
   - What's unclear: Real-world ratio on Sepolia (testnet may differ)
   - Recommendation: Deploy test transaction, parse `eth_getTransactionReceipt`, measure actual split

6. **DEX liquidity depth on Arbitrum Sepolia**
   - What we know: Mainnet has $100M+ liquidity on WETH/USDC
   - What's unclear: Testnet liquidity is fake/sparse (not representative)
   - Recommendation: Use Anvil mainnet fork for realistic testing, not Sepolia

### Low Priority (Optimize After MVP)

7. **Optimal RPC provider for Arbitrum (QuickNode vs Infura)**
   - What we know: QuickNode has trace API, Alchemy does not (for Arbitrum)
   - What's unclear: Latency difference between QuickNode and Infura
   - Recommendation: Benchmark both with `eth_blockNumber` latency test, choose fastest

8. **TypeScript config validation with zod**
   - What we know: Manual `if (!x) throw` works but verbose
   - What's unclear: Whether zod validation adds meaningful value for this project
   - Recommendation: Defer until config errors become frequent (premature optimization)

---

## Sources

### Primary (HIGH Confidence)

**Foundry Documentation:**
- [Foundry Deploying Guide](https://getfoundry.sh/forge/deploying) - Multi-chain deployment with RPC endpoints and verification
- [Foundry RPC Cheatcodes](https://getfoundry.sh/reference/cheatcodes/rpc) - RPC endpoint configuration in foundry.toml
- [Foundry Script Guide](https://getfoundry.sh/guides/scripting-with-solidity) - Deployment script patterns

**Arbitrum Official Documentation:**
- [Arbitrum vs Ethereum Comparison](https://docs.arbitrum.io/build-decentralized-apps/arbitrum-vs-ethereum/comparison-overview) - EVM compatibility and differences
- [Arbitrum Solidity Support](https://docs.arbitrum.io/build-decentralized-apps/arbitrum-vs-ethereum/solidity-support) - Solidity compatibility details
- [Arbitrum Gas and Fees](https://docs.arbitrum.io/how-arbitrum-works/deep-dives/gas-and-fees) - Two-dimensional fee model
- [Arbitrum L1 Gas Pricing](https://docs.arbitrum.io/how-arbitrum-works/l1-gas-pricing) - L1 data fee calculation
- [How to Estimate Gas in Arbitrum](https://docs.arbitrum.io/build-decentralized-apps/how-to-estimate-gas) - Gas estimation best practices
- [Build a dApp with Solidity (Quickstart)](https://docs.arbitrum.io/build-decentralized-apps/quickstart-solidity-remix) - Arbitrum deployment workflow

**ethers.js v6 Documentation:**
- [ethers.js v6 Providers](https://docs.ethers.org/v6/api/providers) - Network configuration and FallbackProvider
- [ethers.js v6 FallbackProvider](https://docs.ethers.org/v6/api/providers/fallback-provider) - Multi-provider resilience

**Uniswap Documentation:**
- [Uniswap V3 Arbitrum Deployments](https://docs.uniswap.org/contracts/v3/reference/deployments/arbitrum-deployments) - Contract addresses on Arbitrum

**Camelot Documentation:**
- [Camelot Arbitrum Mainnet Contracts](https://docs.camelot.exchange/contracts/arbitrum/one-mainnet) - Mainnet addresses
- [Camelot Sepolia Testnet Contracts](https://docs.camelot.exchange/contracts/arbitrum/sepolia-testnet) - Testnet addresses

### Secondary (MEDIUM Confidence)

**Foundry Multi-Chain Deployment:**
- [Foundry Multi-Chain GitHub Issue](https://github.com/foundry-rs/foundry/issues/2519) - Community discussion on multi-chain patterns
- [Foundry Multi-Chain Deployment Example](https://github.com/timurguvenkaya/foundry-multichain) - Example monorepo structure

**TypeScript Monorepo Best Practices:**
- [Best Practices for TypeScript Monorepo](https://blog.flycode.com/best-practices-for-typescript-monorepo) - Config organization patterns
- [Turborepo TypeScript Guide](https://turbo.build/repo/docs/guides/tools/typescript) - Recommendation against project references for small monorepos
- [Turborepo TypeScript Handbook](https://turbo.build/repo/docs/handbook/linting/typescript) - Package-level tsconfig patterns

**Arbitrum Deployment Guides:**
- [How to Deploy to Arbitrum Sepolia](https://www.alchemy.com/docs/how-to-deploy-a-smart-contract-to-the-sepolia-testnet) - Alchemy deployment tutorial (Ethereum Sepolia, but patterns apply)
- [Deploying Smart Contract on Arbitrum](https://www.quillaudits.com/blog/smart-contract/deploy-smart-contract-on-arbitrum) - Arbitrum-specific deployment guide

### Tertiary (LOW Confidence - Project Knowledge)

**Phase 1 Research Outputs:**
- `.planning/phases/01-chain-research/ARBITRUM.md` - Arbitrum chain research (addresses, gas model, MEV landscape)
- `.planning/phases/01-chain-research/01-RESEARCH.md` - Multi-chain comparison and Arbitrum validation

**Project Codebase:**
- `contracts/script/Deploy.s.sol` - Existing deployment script (multi-chain ready)
- `bot/src/run-testnet.ts` - Existing testnet bot runner (Sepolia config example)
- `bot/src/config/defaults.ts` - Existing chain-specific defaults (Ethereum vs Sepolia)
- `.rules/patterns/deployment.md` - Project deployment patterns guide
- `.rules/architecture/system-overview.md` - Two-layer architecture documentation

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** - All libraries already in use, proven in production
- Architecture patterns: **HIGH** - Foundry multi-chain and ethers.js v6 config are industry standard
- Pitfalls: **HIGH** - Native/bridged tokens, L1 data fees, and CREATE2 address pitfalls well-documented in official sources
- Open questions: **MEDIUM** - Most unknowns are address lookups (low-risk, easily resolved)

**Research date:** 2026-02-16
**Valid until:** 90 days (stable technology stack, Arbitrum protocol changes are infrequent)

**Dependencies on Phase 1:**
- Arbitrum validation complete ✅
- Aave V3 pool address confirmed ✅
- DEX landscape documented ✅
- Gas model understood ✅

**Blockers for Phase 2:**
None. All critical information available. Open questions (token addresses, quoter addresses) can be resolved during implementation via block explorers and official docs.
