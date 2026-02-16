# Architecture Patterns: Multi-Chain Flashloan Arbitrage Bot

**Domain:** Multi-chain DeFi flashloan arbitrage
**Researched:** 2026-02-16
**Confidence:** HIGH

## Recommended Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MONOREPO ROOT                                 │
│                    flashloaner-multichain/                           │
└─────────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
┌───────▼────────┐    ┌─────────▼─────────┐    ┌──────▼──────────┐
│   packages/    │    │   packages/       │    │   chains/       │
│   contracts/   │    │   bot-core/       │    │   ethereum/     │
│                │    │                   │    │   arbitrum/     │
│   (shared)     │    │   (shared)        │    │   base/         │
│                │    │                   │    │   (per-chain)   │
└────────────────┘    └───────────────────┘    └─────────────────┘
```

**Design principle:** Share logic, isolate configuration and chain-specific adapters.

### Component Boundaries

| Component | Responsibility | Location | Reused Across Chains? |
|-----------|---------------|----------|----------------------|
| **FlashloanExecutor.sol** | Core flashloan orchestration logic | `packages/contracts/src/` | YES - identical bytecode |
| **DEX Adapters** (UniV2, UniV3, etc.) | Swap execution interfaces | `packages/contracts/src/adapters/` | YES - identical bytecode |
| **Safety Modules** | Circuit breakers, profit validation | `packages/contracts/src/safety/` | YES - identical bytecode |
| **PriceMonitor** | Multi-DEX price fetching | `packages/bot-core/src/monitor/` | YES - parameterized by config |
| **OpportunityDetector** | Arbitrage pathfinding | `packages/bot-core/src/detector/` | YES - parameterized by config |
| **TransactionBuilder** | Calldata encoding, gas estimation | `packages/bot-core/src/builder/` | YES - parameterized by config |
| **ExecutionEngine** | Transaction submission, MEV protection | `packages/bot-core/src/engine/` | YES - parameterized by config |
| **HealthMonitor** | Balance tracking, P&L, alerts | `packages/bot-core/src/health/` | YES - parameterized by config |
| **Chain-specific config** | RPC URLs, contract addresses, pool configs, gas settings | `chains/{chain}/config.ts` | NO - unique per chain |
| **Chain-specific entry point** | Bot process entry point | `chains/{chain}/index.ts` | NO - imports config + shared code |
| **Deployment scripts** | Foundry deploy scripts | `chains/{chain}/script/` | NO - chain-specific RPC/verifier |

### Shared vs Chain-Specific Boundary

**SHARED (packages/):**
- All Solidity contracts (deployed with CREATE2 for deterministic addresses)
- All TypeScript bot logic (PriceMonitor, OpportunityDetector, ExecutionEngine, etc.)
- Type definitions, interfaces, ABIs
- Testing utilities, mock contracts

**CHAIN-SPECIFIC (chains/{chain}/):**
- `config.ts` - RPC endpoints, contract addresses, pool definitions, gas price settings, MEV config
- `index.ts` - Entry point that imports shared bot-core and chain config
- `script/Deploy.s.sol` - Foundry deployment script with chain-specific RPC/verifier
- `.env.{chain}` - Environment variables for that chain
- `deployments.json` - Deployed contract addresses on this chain

### Data Flow

#### Multi-Chain Bot Operation (Recommended: One Process Per Chain)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Bot Process: Ethereum (pid 1001)                                   │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐        │
│  │ Monitor  │──▶│ Detector │──▶│ Builder  │──▶│ Engine   │        │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘        │
│       ▲                                             │               │
│       └─────────────────────────────────────────────┘               │
│                    (ethereum/config.ts)                             │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  Bot Process: Arbitrum (pid 1002)                                   │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐        │
│  │ Monitor  │──▶│ Detector │──▶│ Builder  │──▶│ Engine   │        │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘        │
│       ▲                                             │               │
│       └─────────────────────────────────────────────┘               │
│                    (arbitrum/config.ts)                             │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  Bot Process: Base (pid 1003)                                       │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐        │
│  │ Monitor  │──▶│ Detector │──▶│ Builder  │──▶│ Engine   │        │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘        │
│       ▲                                             │               │
│       └─────────────────────────────────────────────┘               │
│                    (base/config.ts)                                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Why one process per chain:**
1. **Isolation**: Chain A crash doesn't affect Chain B
2. **Resource allocation**: Different chains have different opportunity frequencies (Ethereum > Base > Arbitrum)
3. **Simplicity**: No complex orchestration logic, standard Node.js process monitoring (pm2, systemd)
4. **RPC management**: Each process maintains its own RPC connection pool and failover state
5. **Deployment**: Can deploy to different machines, scale horizontally

**Alternative (single unified bot) rejected because:**
- Complex orchestration of multi-chain event streams
- Single point of failure for all chains
- RPC rate limit conflicts (one chain's burst affects others)
- Harder to debug and monitor (logs from all chains interleaved)

## Patterns to Follow

### Pattern 1: Monorepo with Workspaces

**What:** Use pnpm workspaces (or npm/yarn workspaces) to manage shared packages.

**When:** Always - this is the foundation of multi-chain code reuse.

**Example structure:**

```
flashloaner-multichain/
├── package.json              # Root workspace config
├── pnpm-workspace.yaml       # pnpm workspace definition
├── tsconfig.base.json        # Base TypeScript config
├── turbo.json                # (Optional) Turborepo for build orchestration
├── packages/
│   ├── contracts/            # Shared Solidity contracts
│   │   ├── src/
│   │   │   ├── FlashloanExecutor.sol
│   │   │   ├── adapters/
│   │   │   └── safety/
│   │   ├── test/
│   │   ├── foundry.toml
│   │   └── package.json
│   └── bot-core/             # Shared TypeScript bot logic
│       ├── src/
│       │   ├── monitor/
│       │   ├── detector/
│       │   ├── builder/
│       │   ├── engine/
│       │   └── health/
│       ├── tsconfig.json
│       └── package.json
└── chains/
    ├── ethereum/
    │   ├── config.ts         # Ethereum-specific config
    │   ├── index.ts          # Entry point: imports bot-core + config
    │   ├── script/
    │   │   └── Deploy.s.sol  # Foundry deploy script
    │   ├── deployments.json  # Deployed addresses
    │   ├── .env.ethereum
    │   └── package.json
    ├── arbitrum/
    │   ├── config.ts
    │   ├── index.ts
    │   ├── script/Deploy.s.sol
    │   ├── deployments.json
    │   ├── .env.arbitrum
    │   └── package.json
    └── base/
        ├── config.ts
        ├── index.ts
        ├── script/Deploy.s.sol
        ├── deployments.json
        ├── .env.base
        └── package.json
```

**pnpm-workspace.yaml:**

```yaml
packages:
  - 'packages/*'
  - 'chains/*'
```

**Root package.json:**

```json
{
  "name": "flashloaner-multichain",
  "private": true,
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "deploy:ethereum": "pnpm --filter @flashloaner/ethereum deploy",
    "deploy:arbitrum": "pnpm --filter @flashloaner/arbitrum deploy",
    "start:ethereum": "pnpm --filter @flashloaner/ethereum start",
    "start:arbitrum": "pnpm --filter @flashloaner/arbitrum start"
  }
}
```

**chains/ethereum/package.json:**

```json
{
  "name": "@flashloaner/ethereum",
  "version": "1.0.0",
  "dependencies": {
    "@flashloaner/bot-core": "workspace:*",
    "ethers": "^6.13.5"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "deploy": "forge script script/Deploy.s.sol --rpc-url $ETH_RPC_URL --broadcast"
  }
}
```

### Pattern 2: CREATE2 Deterministic Contract Deployment

**What:** Deploy contracts to the same address on all chains using CREATE2.

**When:** For contracts with no constructor arguments OR when constructor args are identical across chains.

**Why:** Simplifies config (same contract address everywhere), easier to reason about, enables cross-chain verification.

**Example:**

```solidity
// script/Deploy.s.sol (in packages/contracts/)
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import "../src/FlashloanExecutor.sol";

contract DeployFlashloanExecutor is Script {
    // Fixed salt for deterministic deployment
    bytes32 constant SALT = keccak256("flashloaner-v1");

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // CREATE2 deployment (same address on all chains)
        FlashloanExecutor executor = new FlashloanExecutor{salt: SALT}(
            msg.sender  // owner - same deployer address
        );

        console.log("FlashloanExecutor deployed to:", address(executor));

        vm.stopBroadcast();
    }
}
```

**foundry.toml (in packages/contracts/):**

```toml
[profile.default]
solc = "0.8.28"          # Pin exact version for deterministic bytecode
auto_detect_solc = false # Don't auto-detect, always use pinned version
optimizer = true
optimizer_runs = 200
```

**Deployment to multiple chains:**

```bash
# Deploy to Ethereum
forge script script/Deploy.s.sol \
  --rpc-url $ETH_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY

# Deploy to Arbitrum (same address!)
forge script script/Deploy.s.sol \
  --rpc-url $ARBITRUM_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ARBISCAN_API_KEY
```

**Note:** If constructor arguments differ per chain (e.g., chain-specific Aave pool addresses), CREATE2 won't produce the same address. In that case, accept different addresses and manage them in `deployments.json`.

### Pattern 3: Per-Chain Configuration Files

**What:** Isolate all chain-specific settings in a single config file per chain.

**When:** Always - this is the boundary between shared and chain-specific code.

**Example (chains/ethereum/config.ts):**

```typescript
import type { BotConfig } from '@flashloaner/bot-core/config/types.js';
import { DEFAULT_MONITOR, DEFAULT_DETECTOR } from '@flashloaner/bot-core/config/defaults.js';
import { MAINNET_MEV_CONFIG } from '@flashloaner/bot-core/mev/config.js';

// Load deployed contract addresses
import deployments from './deployments.json';

export const ETHEREUM_CONFIG: BotConfig = {
  network: {
    rpcUrl: process.env.ETH_RPC_URL!,
    wsUrl: process.env.ETH_WS_URL,
    chainId: 1,
  },

  contracts: {
    executor: deployments.FlashloanExecutor,
    adapters: {
      uniswapV2: deployments.UniswapV2Adapter,
      uniswapV3: deployments.UniswapV3Adapter,
      sushiswap: deployments.SushiSwapAdapter,
    },
  },

  pools: [
    {
      label: "UniV2_WETH_USDC",
      dex: "uniswap-v2",
      poolAddress: "0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc",
      token0: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
      token1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
      decimals0: 18,
      decimals1: 6,
    },
    // ... more pools
  ],

  monitor: {
    ...DEFAULT_MONITOR,
    pollIntervalMs: 12_000, // Ethereum: 12s blocks
  },

  detector: {
    ...DEFAULT_DETECTOR,
    gasPriceGwei: 30,       // Ethereum: higher gas
    minProfitThreshold: 0.05, // Ethereum: higher threshold
  },

  mev: MAINNET_MEV_CONFIG, // Flashbots protection

  logLevel: "info",
};
```

**Example (chains/arbitrum/config.ts):**

```typescript
import type { BotConfig } from '@flashloaner/bot-core/config/types.js';
import { DEFAULT_MONITOR, DEFAULT_DETECTOR } from '@flashloaner/bot-core/config/defaults.js';
import deployments from './deployments.json';

export const ARBITRUM_CONFIG: BotConfig = {
  network: {
    rpcUrl: process.env.ARBITRUM_RPC_URL!,
    wsUrl: process.env.ARBITRUM_WS_URL,
    chainId: 42161,
  },

  contracts: {
    executor: deployments.FlashloanExecutor,
    adapters: {
      uniswapV2: deployments.UniswapV2Adapter,
      uniswapV3: deployments.UniswapV3Adapter,
      sushiswap: deployments.SushiSwapAdapter,
      camelot: deployments.CamelotAdapter, // Arbitrum-specific
    },
  },

  pools: [
    {
      label: "UniV3_WETH_USDC_500",
      dex: "uniswap-v3",
      poolAddress: "0xC31E54c7a869B9FcBEcc14363CF510d1c41fa443",
      token0: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // WETH (Arbitrum)
      token1: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC (Arbitrum)
      decimals0: 18,
      decimals1: 6,
      feeTier: 500,
    },
    // ... more pools
  ],

  monitor: {
    ...DEFAULT_MONITOR,
    pollIntervalMs: 1_000,  // Arbitrum: faster blocks
  },

  detector: {
    ...DEFAULT_DETECTOR,
    gasPriceGwei: 0.1,      // Arbitrum: much lower gas
    minProfitThreshold: 0.005, // Arbitrum: lower threshold
  },

  mev: { mode: "none" },    // No Flashbots on Arbitrum

  logLevel: "info",
};
```

### Pattern 4: RPC Provider Management with Failover

**What:** Use multiple RPC providers per chain with automatic failover and rate limit handling.

**When:** Always for production. Rate limits and outages are inevitable.

**Example:**

```typescript
// packages/bot-core/src/rpc/RPCManager.ts

import { ethers } from 'ethers';

export interface RPCProviderConfig {
  url: string;
  priority: number;        // Lower = higher priority (primary = 0)
  maxRequestsPerSecond?: number;
  timeout?: number;
}

export class RPCManager {
  private providers: Map<number, ethers.JsonRpcProvider> = new Map();
  private providerConfigs: RPCProviderConfig[];
  private currentProviderIndex: number = 0;
  private rateLimiters: Map<number, RateLimiter> = new Map();

  constructor(configs: RPCProviderConfig[]) {
    // Sort by priority
    this.providerConfigs = configs.sort((a, b) => a.priority - b.priority);

    // Initialize providers
    this.providerConfigs.forEach((config, index) => {
      this.providers.set(index, new ethers.JsonRpcProvider(config.url));

      if (config.maxRequestsPerSecond) {
        this.rateLimiters.set(
          index,
          new RateLimiter(config.maxRequestsPerSecond)
        );
      }
    });
  }

  async getProvider(): Promise<ethers.JsonRpcProvider> {
    const provider = this.providers.get(this.currentProviderIndex)!;
    const limiter = this.rateLimiters.get(this.currentProviderIndex);

    // Wait for rate limit if necessary
    if (limiter) {
      await limiter.acquire();
    }

    return provider;
  }

  async executeWithFailover<T>(
    operation: (provider: ethers.JsonRpcProvider) => Promise<T>
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.providers.size; attempt++) {
      const provider = await this.getProvider();

      try {
        const result = await operation(provider);
        // Success - reset to primary provider
        this.currentProviderIndex = 0;
        return result;
      } catch (error: any) {
        lastError = error;

        // Check if error is rate limit or connection issue
        if (this.isRetryableError(error)) {
          console.warn(
            `Provider ${this.currentProviderIndex} failed: ${error.message}. Failing over...`
          );

          // Move to next provider
          this.currentProviderIndex =
            (this.currentProviderIndex + 1) % this.providers.size;

          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          // Non-retryable error, throw immediately
          throw error;
        }
      }
    }

    throw new Error(
      `All RPC providers failed. Last error: ${lastError?.message}`
    );
  }

  private isRetryableError(error: any): boolean {
    const message = error.message?.toLowerCase() || '';
    return (
      message.includes('429') ||           // Rate limit
      message.includes('rate limit') ||
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('network error')
    );
  }
}

class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private refillRate: number;

  constructor(requestsPerSecond: number) {
    this.tokens = requestsPerSecond;
    this.lastRefill = Date.now();
    this.refillRate = requestsPerSecond;
  }

  async acquire(): Promise<void> {
    // Refill tokens based on time elapsed
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      this.refillRate,
      this.tokens + elapsed * this.refillRate
    );
    this.lastRefill = now;

    // If no tokens, wait
    if (this.tokens < 1) {
      const waitMs = ((1 - this.tokens) / this.refillRate) * 1000;
      await new Promise(resolve => setTimeout(resolve, waitMs));
      this.tokens = 1;
      this.lastRefill = Date.now();
    }

    this.tokens -= 1;
  }
}
```

**Usage in chain config:**

```typescript
// chains/ethereum/config.ts

export const ETHEREUM_RPC_PROVIDERS: RPCProviderConfig[] = [
  {
    url: process.env.ETH_RPC_ALCHEMY!,
    priority: 0,  // Primary
    maxRequestsPerSecond: 100,
    timeout: 5000,
  },
  {
    url: process.env.ETH_RPC_INFURA!,
    priority: 1,  // Fallback
    maxRequestsPerSecond: 50,
    timeout: 5000,
  },
  {
    url: process.env.ETH_RPC_QUICKNODE!,
    priority: 2,  // Second fallback
    maxRequestsPerSecond: 30,
    timeout: 5000,
  },
];

// In entry point
const rpcManager = new RPCManager(ETHEREUM_RPC_PROVIDERS);
const provider = await rpcManager.getProvider();
```

### Pattern 5: Chain-Specific Entry Points

**What:** Each chain has its own entry point that imports shared bot-core and chain config.

**When:** Always - this is how you run one bot process per chain.

**Example (chains/ethereum/index.ts):**

```typescript
import { PriceMonitor } from '@flashloaner/bot-core/monitor';
import { OpportunityDetector } from '@flashloaner/bot-core/detector';
import { TransactionBuilder } from '@flashloaner/bot-core/builder';
import { ExecutionEngine } from '@flashloaner/bot-core/engine';
import { HealthMonitor } from '@flashloaner/bot-core/health';
import { RPCManager } from '@flashloaner/bot-core/rpc';

import { ETHEREUM_CONFIG, ETHEREUM_RPC_PROVIDERS } from './config';

async function main() {
  console.log('Starting Ethereum flashloan arbitrage bot...');

  // Initialize RPC manager with failover
  const rpcManager = new RPCManager(ETHEREUM_RPC_PROVIDERS);
  const provider = await rpcManager.getProvider();

  // Initialize components (shared code, chain-specific config)
  const monitor = new PriceMonitor(provider, ETHEREUM_CONFIG);
  const detector = new OpportunityDetector(ETHEREUM_CONFIG);
  const builder = new TransactionBuilder(provider, ETHEREUM_CONFIG);
  const engine = new ExecutionEngine(provider, ETHEREUM_CONFIG);
  const health = new HealthMonitor(provider, ETHEREUM_CONFIG);

  // Wire up event handlers
  monitor.on('priceUpdate', (update) => {
    const opportunity = detector.analyze(update);
    if (opportunity) {
      const tx = builder.build(opportunity);
      engine.execute(tx);
    }
  });

  // Start monitoring
  await monitor.start();
  await health.start();

  console.log('Ethereum bot running on chain', ETHEREUM_CONFIG.network.chainId);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

**Running multiple chains:**

```bash
# Terminal 1: Ethereum
pnpm --filter @flashloaner/ethereum start

# Terminal 2: Arbitrum
pnpm --filter @flashloaner/arbitrum start

# Terminal 3: Base
pnpm --filter @flashloaner/base start
```

**Or with pm2 (process manager):**

```bash
pm2 start ecosystem.config.js
```

**ecosystem.config.js:**

```javascript
module.exports = {
  apps: [
    {
      name: 'flashloaner-ethereum',
      cwd: './chains/ethereum',
      script: 'pnpm start',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'flashloaner-arbitrum',
      cwd: './chains/arbitrum',
      script: 'pnpm start',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'flashloaner-base',
      cwd: './chains/base',
      script: 'pnpm start',
      env: { NODE_ENV: 'production' },
    },
  ],
};
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Cross-Chain Arbitrage (At This Scale)

**What:** Attempting to execute arbitrage across two different chains in a single transaction.

**Why bad:**
- Requires bridge (slow, expensive, introduces trust assumptions)
- No atomic execution guarantee across chains
- Bridge fees erase profit
- Timing risk (price moves while assets are in transit)
- Exponentially more complex than single-chain arb

**Instead:** Run single-chain arbitrage on multiple chains independently. Opportunities exist within each chain's DEX ecosystem (Uniswap vs Sushi on Ethereum, Uniswap vs Camelot on Arbitrum, etc.).

**When cross-chain arb MIGHT be viable:**
- Very large price discrepancies (>5%)
- Low bridge fees (e.g., native L2 bridges)
- Slow-moving opportunities (hours, not seconds)
- This is an advanced feature for Phase 3+, not initial multi-chain support.

### Anti-Pattern 2: Shared Contract Instances Across Chains

**What:** Deploying a single contract on Chain A that tries to interact with Chain B.

**Why bad:**
- Contracts are chain-isolated by design
- Would require cross-chain messaging (LayerZero, Axelar) - complex, expensive, slow
- Defeats the purpose of multi-chain: you want independent operations

**Instead:** Deploy the same contract code to each chain independently. Each chain has its own instance that operates atomically within that chain.

### Anti-Pattern 3: Single Bot Process Managing All Chains

**What:** One Node.js process managing Ethereum, Arbitrum, Base, etc. simultaneously.

**Why bad:**
- Crash on one chain affects all chains
- Complex orchestration of multiple event streams
- RPC rate limit conflicts
- Hard to scale (can't distribute to multiple machines)
- Debugging nightmare (interleaved logs from all chains)

**Instead:** One process per chain. Use process managers (pm2, systemd) for monitoring and auto-restart.

**Exception:** For a proof-of-concept or testnet, a unified bot might be acceptable. Move to per-chain processes before production.

### Anti-Pattern 4: Hardcoding Chain-Specific Values in Shared Code

**What:** Putting Ethereum contract addresses, gas prices, or RPC URLs in `packages/bot-core/`.

**Why bad:**
- Makes the "shared" code not actually reusable
- Forces code changes when adding a new chain
- Error-prone (easy to forget to update for new chain)

**Instead:**
- All chain-specific values live in `chains/{chain}/config.ts`
- Shared code is 100% parameterized by config
- Adding a new chain requires zero changes to shared code

**Test:** If adding a new chain requires changing anything in `packages/`, your boundaries are wrong.

### Anti-Pattern 5: Different Contract Versions Per Chain

**What:** Deploying FlashloanExecutor v1.0 on Ethereum, v1.1 on Arbitrum, v1.2 on Base.

**Why bad:**
- Behavior divergence (bugs on one chain might not exist on another)
- Harder to test (need different test suites)
- Maintenance burden (bug fix needs to be ported to all versions)
- CREATE2 deterministic addresses are impossible

**Instead:**
- Deploy the exact same contract code to all chains
- Use feature flags or adapter registration for chain-specific features
- If a contract needs chain-specific behavior, inject it via constructor or config, not different code

**Workflow:** Test on one chain (Ethereum), then deploy identical bytecode to all other chains.

## Scalability Considerations

| Concern | Initial (1-2 chains) | Growth (3-5 chains) | Scale (5+ chains) |
|---------|---------------------|---------------------|------------------|
| **Bot processes** | Run manually in terminals | pm2 on single server | Kubernetes pods, one per chain |
| **RPC providers** | Single provider per chain | 2 providers with failover | 3+ providers with intelligent routing |
| **Configuration** | `.env` files | `.env.{chain}` files | Config server (e.g., Consul, etcd) |
| **Monitoring** | Console logs | File logs + pm2 status | Centralized logging (Datadog, Grafana) |
| **Deployment** | Manual forge script | Bash script loop | CI/CD pipeline with multi-chain verification |
| **Secret management** | Local .env files | Environment variables | Secrets manager (AWS Secrets Manager, Vault) |
| **Opportunity aggregation** | Per-chain logs | Aggregated dashboard | Real-time analytics pipeline |

## Build Order and Migration Path

### Phase 1: Monorepo Structure (Week 1)

**Goal:** Reorganize existing code into monorepo without breaking functionality.

**Tasks:**
1. Create `packages/contracts/` and move all Solidity code
2. Create `packages/bot-core/` and move all TypeScript bot code
3. Create `chains/ethereum/` with current Ethereum config
4. Set up pnpm workspace
5. Update imports to use workspace references
6. Verify all tests still pass

**Deliverable:** Existing bot runs on Ethereum with new directory structure.

**Dependencies:** None (pure refactor)

**Risk:** Low - no new functionality, just reorganization

### Phase 2: Configuration Abstraction (Week 2)

**Goal:** Extract all Ethereum-specific config into `chains/ethereum/config.ts`.

**Tasks:**
1. Audit `packages/bot-core/` for hardcoded values
2. Create `BotConfig` interface that includes all configurable parameters
3. Refactor all components to accept config in constructor
4. Move Ethereum values to `chains/ethereum/config.ts`
5. Update entry point to pass config to components

**Deliverable:** Shared bot code is 100% parameterized, no hardcoded chain-specific values.

**Dependencies:** Phase 1 complete

**Risk:** Medium - requires careful refactoring to avoid breaking changes

### Phase 3: RPC Management Layer (Week 3)

**Goal:** Add multi-provider failover and rate limiting.

**Tasks:**
1. Implement `RPCManager` class
2. Add `RPCProviderConfig[]` to `BotConfig`
3. Update all components to use `RPCManager` instead of direct provider
4. Add retry logic and failover
5. Add rate limiter with token bucket algorithm
6. Test with simulated RPC failures

**Deliverable:** Ethereum bot uses multi-RPC failover.

**Dependencies:** Phase 2 complete

**Risk:** Medium - need to test failover thoroughly

### Phase 4: Second Chain (Arbitrum) (Week 4)

**Goal:** Deploy contracts and bot to Arbitrum using shared code.

**Tasks:**
1. Create `chains/arbitrum/` directory
2. Copy deployment script, update RPC/verifier URLs
3. Deploy contracts to Arbitrum
4. Create `arbitrum/config.ts` with Arbitrum pools, gas settings, etc.
5. Create `arbitrum/index.ts` entry point
6. Run Arbitrum bot in parallel with Ethereum bot
7. Monitor for 24 hours

**Deliverable:** Two bot processes running independently on Ethereum and Arbitrum.

**Dependencies:** Phase 3 complete

**Risk:** Low - just applying proven pattern to new chain

**Success criteria:** Zero changes to `packages/bot-core/` required.

### Phase 5: Third Chain (Base) (Week 5)

**Goal:** Validate that adding a new chain is now trivial.

**Tasks:**
1. Create `chains/base/` directory
2. Deploy contracts (should be copy-paste of Arbitrum deployment)
3. Create `base/config.ts`
4. Create `base/index.ts`
5. Run Base bot

**Deliverable:** Three chains running.

**Dependencies:** Phase 4 complete

**Risk:** Very low - this should be nearly mechanical

**Success criteria:** Adding Base takes <1 day (vs 1 week for Arbitrum in Phase 4).

### Phase 6: Process Management and Monitoring (Week 6)

**Goal:** Production-grade process management and observability.

**Tasks:**
1. Create `ecosystem.config.js` for pm2
2. Add structured logging with chain context
3. Set up centralized log aggregation (optional: Datadog, Grafana)
4. Add health check endpoints
5. Create monitoring dashboard
6. Document runbook for common issues

**Deliverable:** Production-ready multi-chain bot with monitoring.

**Dependencies:** Phase 5 complete

**Risk:** Low - operational improvements, doesn't affect core functionality

### Phase 7: Chain-Specific Adapters (Week 7+)

**Goal:** Support chain-specific DEXes (e.g., Camelot on Arbitrum, Aerodrome on Base).

**Tasks:**
1. Create Camelot adapter in `packages/contracts/src/adapters/`
2. Deploy Camelot adapter to Arbitrum
3. Add Camelot pools to `arbitrum/config.ts`
4. Create Aerodrome adapter
5. Deploy Aerodrome adapter to Base
6. Add Aerodrome pools to `base/config.ts`

**Deliverable:** Chain-specific DEX support.

**Dependencies:** Phase 6 complete

**Risk:** Medium - new adapter contracts need thorough testing

**Note:** Adapters are shared code, but only deployed where needed.

## Component Dependencies

```
Phase 1 (Monorepo)
    ↓
Phase 2 (Config Abstraction)
    ↓
Phase 3 (RPC Management)
    ↓
Phase 4 (Arbitrum) ──→ Phase 5 (Base)
    ↓                       ↓
    └───────────────────────┘
                ↓
    Phase 6 (Process Management)
                ↓
    Phase 7 (Chain-Specific Adapters)
```

**Critical path:** Phases 1-4 must be sequential.

**Parallelization opportunity:** After Phase 4, adding new chains (Phase 5) can happen in parallel with process management work (Phase 6).

## Suggested Initial Chains

| Chain | Priority | Rationale |
|-------|----------|-----------|
| **Ethereum** | P0 | Already supported, largest liquidity, most established |
| **Arbitrum** | P0 | High liquidity, low gas, active DEX ecosystem (Uniswap, Sushi, Camelot) |
| **Base** | P1 | Growing liquidity, very low gas, Coinbase backing |
| **Optimism** | P2 | Similar to Arbitrum but less liquidity |
| **Polygon** | P2 | Large user base but higher gas than L2s |

**Recommendation:** Start with Ethereum + Arbitrum (Phase 4), add Base (Phase 5), then evaluate others based on opportunity frequency.

## Sources

**Multi-Chain DeFi Architecture:**
- [How to Build a Solana AI Agent in 2026](https://www.alchemy.com/blog/how-to-build-solana-ai-agents-in-2026)
- [Multi-Agent AI Architecture for Personalized DeFi Investment Strategies](https://medium.com/@gwrx2005/multi-agent-ai-architecture-for-personalized-defi-investment-strategies-c81c1b9de20c)
- [Why Multi-Chain DeFi Is Hard — And How AI Agents Can Help](https://medium.com/coinmonks/why-multi-chain-defi-is-hard-and-how-ai-agents-can-help-f07a3d54c082)

**RPC Provider Management:**
- [Base RPC Nodes Guide 2026](https://rpcfast.com/blog/base-rpc-nodes)
- [Top 9 Solana RPC Node Providers in 2026 - Comprehensive Comparison](https://dysnix.com/blog/solana-node-providers)
- [Best Ethereum RPC providers for production workloads in 2026](https://chainstack.com/best-ethereum-rpc-providers-in-2026/)

**TypeScript Monorepo Patterns:**
- [Monorepos in JavaScript & TypeScript](https://www.robinwieruch.de/javascript-monorepos/)
- [Managing TypeScript Packages in Monorepos](https://nx.dev/blog/managing-ts-packages-in-monorepos)
- [Configuration Management for TypeScript Node.js Apps](https://medium.com/@andrei-trukhin/configuration-management-for-typescript-node-js-apps-60b6c99d6331)

**Foundry Multi-Chain Deployment:**
- [Deterministic Deployments with CREATE2 – foundry](https://www.getfoundry.sh/guides/deterministic-deployments-using-create2)
- [Scripting – foundry - Ethereum Development Framework](https://getfoundry.sh/forge/deploying/)
- [GitHub - timurguvenkaya/foundry-multichain](https://github.com/timurguvenkaya/foundry-multichain)

**Flash Loan Multi-Chain:**
- [Flash Loans | Aave Protocol Documentation](https://aave.com/docs/aave-v3/guides/flash-loans)
- [Aave Review: Is It the Best DeFi Lending Platform in 2026?](https://coinbureau.com/review/aave-lend/)
- [Flash Loan Arbitrage Bot Development Services: Boost DeFi Profits 2026](https://www.kirhyip.com/blog/crypto-flash-loan-arbitrage-bot-development-company/)
