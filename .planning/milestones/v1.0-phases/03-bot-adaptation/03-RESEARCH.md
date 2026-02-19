# Phase 3: Bot Adaptation - Research

**Researched:** 2026-02-17
**Domain:** TypeScript bot adaptation for Arbitrum — RPC connection, chain config integration, L2 gas estimation, DEX pool discovery, dry-run reporting
**Confidence:** HIGH (all findings verified against actual source code + official Arbitrum docs)

---

## Summary

Phase 3 adapts the existing TypeScript bot to run against Arbitrum Sepolia. This is a **brownfield** project with a well-structured existing codebase. The core modules (PriceMonitor, OpportunityDetector, ExecutionEngine) are already chain-agnostic by design. The chain config system created in Phase 2 (`loadChainConfig(chainId)`) already exists and is wired up, but it is **not yet integrated into the entry-point files** (`run-testnet.ts`, `index.ts`). The primary adaptation work is:

1. **Wire `loadChainConfig()` into bot startup** — `run-testnet.ts` still hardcodes `SEPOLIA_*` constants and chainId 11155111. It needs a new `run-arb-sepolia.ts` entry point (or parameterized startup) that uses `ARBITRUM_SEPOLIA_CONFIG` from the chain config system.

2. **Fill in missing Arbitrum Sepolia token addresses** — `arbitrum-sepolia.ts` currently has `0x000...0` placeholder tokens. WETH is now confirmed as `0x980B62Da83eFf3D4576C647993b0c1D7faf17c73`. The Uniswap V3 factory on Arbitrum Sepolia is a **different address** (`0x248AB79Bbb9bC29bB72f7Cd42F17e054Fc40188e`) than the one currently hardcoded (`0x1F98431c8aD98523631AE4a59f267346ea31F984` — that's the mainnet/same-chain CREATE2 address).

3. **Arbitrum-accurate gas estimation** — `OpportunityDetector.estimateGasCost()` uses a simple formula: `(BASE_GAS + gasPerSwap * numSwaps) * gasPriceGwei / 1e9`. This is L2-only. On Arbitrum, L1 data fees represent ~95% of total cost. The gas estimator must be extended to call the Arbitrum NodeInterface precompile (`0x00000000000000000000000000000000000000C8`) to get the real dual-component estimate.

4. **Populate Arbitrum Sepolia pool definitions** — `ARBITRUM_SEPOLIA_POOLS` is currently an empty array. Real testnet pool addresses need to be discovered and configured. Testnet liquidity is sparse, so the monitoring strategy needs to account for this.

5. **Adjust polling interval** — Arbitrum has 0.25s block time. The current `pollIntervalMs: 1_000` in `ARBITRUM_SEPOLIA_CONFIG` is correctly set. No change needed. The `DEFAULT_MONITOR` uses 12,000ms (one Ethereum block) which would be too slow — confirm entry point uses chain config, not defaults.

**Primary recommendation:** Create `bot/src/run-arb-sepolia.ts` that mirrors `run-testnet.ts` but uses `loadChainConfig(421614)` and loads pools from `ARBITRUM_SEPOLIA_CONFIG.pools`. Add an `ArbitrumGasEstimator` class that wraps NodeInterface calls, and update `OpportunityDetector` to accept a pluggable gas estimator interface.

---

## Standard Stack

### Core (Already in Use — No New Packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **ethers.js** | v6 | Provider, Contract interaction, gas queries | Already in use; v6 `Contract` works directly with NodeInterface precompile |
| **TypeScript** | 5.x | Type safety for chain config and gas types | Already in use |
| **Vitest** | Latest | Unit and integration tests | Already in use |

### Supporting (New for Phase 3)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **@arbitrum/sdk** | 4.x (optional) | `NodeInterface__factory`, `NODE_INTERFACE_ADDRESS` | Provides typed access to NodeInterface; ethers.js `Contract` works without it |

**Note on `@arbitrum/sdk`:** The Arbitrum SDK provides `NodeInterface__factory` and the constant `NODE_INTERFACE_ADDRESS` (`0xc8`). However, you can call NodeInterface directly with a raw ABI and `ethers.Contract` without adding the SDK dependency. Given the project already uses ethers.js v6, the raw ABI approach is lower-risk (no new dependency, SDK still uses ethers v5 internally which could cause conflicts).

**Installation (if SDK chosen):**
```bash
pnpm add @arbitrum/sdk
```

**Raw ABI approach (preferred — no new dependency):**
```typescript
const NODE_INTERFACE_ADDRESS = "0x00000000000000000000000000000000000000C8";
const NODE_INTERFACE_ABI = [
  "function gasEstimateComponents(address to, bool contractCreation, bytes data) view returns (uint64 gasEstimate, uint64 gasEstimateForL1, uint256 baseFee, uint256 l1BaseFeeEstimate)"
];
```

---

## Architecture Patterns

### Current Bot Structure (What Already Exists)

```
bot/src/
├── run-testnet.ts          ← Entry point: hardcoded to Sepolia (chainId 11155111)
├── index.ts                ← FlashloanBot class + CLI entry (uses MAINNET_POOLS, no chain config)
├── config/
│   ├── index.ts            ← Exports loadChainConfig() + ChainConfig type
│   ├── types.ts            ← BotConfig, NetworkConfig, PoolDefinition interfaces
│   ├── defaults.ts         ← SEPOLIA_TOKENS, SEPOLIA_MONITOR, SEPOLIA_DETECTOR, MAINNET_TOKENS
│   ├── pools.ts            ← MAINNET_POOLS (Ethereum mainnet pool addresses)
│   ├── validate.ts         ← parseEnv(), buildConfig() — reads RPC_URL, CHAIN_ID from env
│   └── chains/
│       ├── index.ts        ← loadChainConfig(chainId?) switch statement
│       ├── types.ts        ← ChainConfig interface
│       ├── arbitrum-sepolia.ts ← ARBITRUM_SEPOLIA_CONFIG (tokens: all 0x000...0, pools: [])
│       ├── arbitrum.ts     ← ARBITRUM_CONFIG (mainnet, tokens populated)
│       ├── ethereum.ts     ← ETHEREUM_CONFIG
│       ├── sepolia.ts      ← SEPOLIA_CONFIG
│       └── pools/
│           ├── arbitrum-mainnet.ts ← ARBITRUM_MAINNET_POOLS (2 UniV3 pools)
│           └── arbitrum-sepolia.ts ← ARBITRUM_SEPOLIA_POOLS = [] (EMPTY)
├── monitor/
│   ├── PriceMonitor.ts     ← Polls pools, emits priceUpdate/opportunity. Chain-agnostic.
│   └── types.ts            ← PoolConfig, PriceSnapshot, PriceDelta interfaces
├── detector/
│   ├── OpportunityDetector.ts ← Analyzes deltas, estimates costs. Gas logic is L2-naive.
│   └── types.ts            ← ArbitrageOpportunity, CostEstimate, OpportunityDetectorConfig
├── engine/
│   └── ExecutionEngine.ts  ← Transaction submission. Not needed for dry-run mode.
├── health/
│   └── HealthMonitor.ts    ← Balance/P&L/error tracking. Chain-agnostic.
├── mev/                    ← Flashbots/MEV Blocker signers. Not needed on Arbitrum.
├── builder/
│   └── TransactionBuilder.ts
└── reporting.ts            ← formatOpportunityReport, formatScanHeader, etc. Chain-agnostic.
```

### What Needs to Change

#### Change 1: Create `run-arb-sepolia.ts` Entry Point

`run-testnet.ts` hardcodes:
- `import { SEPOLIA_TOKENS, SEPOLIA_MONITOR, SEPOLIA_DETECTOR } from "./config/index.js"`
- `Network: Sepolia (chainId 11155111)`
- Pool loading from `../config/sepolia-pools.json`

The new entry point should use `loadChainConfig(421614)` and read pools from `ARBITRUM_SEPOLIA_CONFIG.pools`.

**Pattern:**
```typescript
// bot/src/run-arb-sepolia.ts
import { loadChainConfig } from "./config/index.js";

const chain = loadChainConfig(421614);

const bot = new FlashloanBot({
  network: {
    rpcUrl: chain.rpcUrl,
    chainId: chain.chainId,
  },
  pools: chain.pools,
  monitor: chain.monitor,
  detector: chain.detector,
  logLevel: "debug",
});
```

#### Change 2: Update `ARBITRUM_SEPOLIA_CONFIG` Token Addresses

Current state in `bot/src/config/chains/arbitrum-sepolia.ts`:
```typescript
tokens: {
  WETH: "0x0000000000000000000000000000000000000000", // TBD
  USDC: "0x0000000000000000000000000000000000000000", // TBD
  USDT: "0x0000000000000000000000000000000000000000", // TBD
},
```

Confirmed addresses (from Uniswap V3 official deployment docs for Arbitrum Sepolia):
```typescript
tokens: {
  WETH: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73", // Confirmed: Uniswap V3 deployment docs
  USDC: "TBD",  // Multiple mock USDC on testnet - see Open Questions
  USDT: "TBD",  // No canonical USDT on Arbitrum Sepolia testnet
},
```

#### Change 3: Update Uniswap V3 Factory Address for Arbitrum Sepolia

The existing `ARBITRUM_SEPOLIA_CONFIG.dexes.uniswapV3.factory` is `0x1F98431c8aD98523631AE4a59f267346ea31F984`. This is the **Arbitrum mainnet** address (same as Ethereum mainnet via CREATE2). On Arbitrum Sepolia, the factory is at a **different address**: `0x248AB79Bbb9bC29bB72f7Cd42F17e054Fc40188e`.

Correct Arbitrum Sepolia Uniswap V3 addresses (from official Uniswap V3 deployment docs):
```typescript
uniswapV3: {
  factory: "0x248AB79Bbb9bC29bB72f7Cd42F17e054Fc40188e",  // Arbitrum Sepolia (DIFFERENT from mainnet)
  router: "0x101F443B4d1b059569D643917553c771E1b9663E",   // SwapRouter02 on Arbitrum Sepolia
  quoter: "0x2779a0CC1c3e0E44D2542EC3e79e3864Ae93Ef0B",  // QuoterV2 on Arbitrum Sepolia
}
```

#### Change 4: Populate `ARBITRUM_SEPOLIA_POOLS`

The current `ARBITRUM_SEPOLIA_POOLS = []` means the bot starts but does nothing. Pools need to be discovered from the factory. The testnet has sparse liquidity — pools may need to be created for testing.

See "Arbitrum Sepolia DEX Pools" section below.

#### Change 5: Extend Gas Estimation to Include L1 Data Fee

Current `OpportunityDetector.estimateGasCost()`:
```typescript
estimateGasCost(numSwaps: number): number {
  const BASE_GAS = 21_000;
  const totalGas = BASE_GAS + this.config.gasPerSwap * numSwaps;
  return (totalGas * this.config.gasPriceGwei) / 1e9;  // L2-only — WRONG for Arbitrum
}
```

This ignores L1 data fees (~95% of total cost). The fix: add an optional `gasEstimatorFn` to `OpportunityDetectorConfig` that can be replaced per-chain. For Ethereum, use the existing formula. For Arbitrum, use NodeInterface.

---

## Arbitrum Sepolia DEX Pools

### Reality of Testnet Pools

Arbitrum Sepolia testnet has **sparse liquidity**. There is no single authoritative set of "the pools to monitor." Options:

**Option A: Use Camelot Sepolia (recommended for integration testing)**
Camelot DEX has a native Sepolia testnet deployment:
- Factory: `0x18E621B64d7808c3C47bccbbD7485d23F257D26f`
- Router: `0x171B925C51565F5D2a7d8C494ba3188D304EFD93`

Pool discovery requires querying the factory for `getPair(WETH, token)` or deploying test pools.

**Option B: Use Uniswap V3 on Arbitrum Sepolia**
Factory: `0x248AB79Bbb9bC29bB72f7Cd42F17e054Fc40188e`

Pool discovery: `getPool(token0, token1, fee)` — returns zero address if pool doesn't exist.

**Option C: Deploy test pools**
For dry-run validation, deploy mock WETH/USDC V2-style pairs with seeded liquidity. This is the most reliable approach since testnet organic liquidity is unreliable.

**Key constraint:** For BOT-03 (detect opportunities), the bot only needs at least 2 pools with the same token pair to compare prices. On testnet, price differences are artificial. The goal is to validate the detection logic, not find real arbitrage.

**Recommended minimal pool set for Arbitrum Sepolia:**
```typescript
// bot/src/config/chains/pools/arbitrum-sepolia.ts
// Two pools with same pair, different DEXs → guaranteed price delta possible
export const ARBITRUM_SEPOLIA_POOLS: PoolDefinition[] = [
  // These must be verified against live testnet before commit
  // Use sepolia.arbiscan.io to confirm pool has reserves
];
```

The plan task for BOT-03 should include a step to query live testnet pool addresses via factory contracts before hardcoding.

---

## Arbitrum Gas Estimation (BOT-04)

### NodeInterface Precompile

**Address:** `0x00000000000000000000000000000000000000C8`
**Access:** HTTP RPC calls only (not callable from smart contracts)
**Method:** `gasEstimateComponents(address to, bool contractCreation, bytes data)`

**Returns:**
- `gasEstimate`: Total L1+L2 gas estimate
- `gasEstimateForL1`: The L1 component (the dominant ~95% portion)
- `baseFee`: Current L2 base fee (gwei)
- `l1BaseFeeEstimate`: L1 parent chain base fee estimate

**ABI for ethers.js v6:**
```typescript
const NODE_INTERFACE_ADDRESS = "0x00000000000000000000000000000000000000C8";
const ABI = [
  "function gasEstimateComponents(address to, bool contractCreation, bytes calldata data) view returns (uint64 gasEstimate, uint64 gasEstimateForL1, uint256 baseFee, uint256 l1BaseFeeEstimate)"
];
const nodeInterface = new Contract(NODE_INTERFACE_ADDRESS, ABI, provider);
```

### Gas Estimation Pattern

```typescript
// Source: Arbitrum docs (https://docs.arbitrum.io/build-decentralized-apps/how-to-estimate-gas)
async function estimateArbitrumGas(
  provider: Provider,
  to: string,
  data: string
): Promise<{ totalGas: bigint; l1Gas: bigint; l2Gas: bigint; baseFee: bigint }> {
  const nodeInterface = new Contract(NODE_INTERFACE_ADDRESS, ABI, provider);

  const result = await nodeInterface.gasEstimateComponents(to, false, data);
  const gasEstimate: bigint = result.gasEstimate;
  const gasEstimateForL1: bigint = result.gasEstimateForL1;
  const baseFee: bigint = result.baseFee;

  return {
    totalGas: gasEstimate,
    l1Gas: gasEstimateForL1,
    l2Gas: gasEstimate - gasEstimateForL1,
    baseFee,
  };
}
```

### Integration into OpportunityDetector

The `OpportunityDetectorConfig` needs a pluggable gas estimator. The simplest approach that doesn't require rewriting `OpportunityDetector`:

**Option A: Chain-specific gasPriceGwei override (SIMPLE)**
Set `gasPriceGwei` to include an L1 data fee multiplier. If L1 = 95% and L2 = 5%, set `gasPriceGwei` to 20x the L2 price. This is a rough approximation but avoids async gas estimation in the hot path.

**Option B: Inject `gasEstimatorFn` into detector config (CORRECT)**
```typescript
// In OpportunityDetectorConfig:
interface OpportunityDetectorConfig {
  // ... existing fields ...
  /** Optional async gas estimator. Overrides gasPriceGwei-based estimation. */
  gasEstimatorFn?: (numSwaps: number, path: SwapPath) => Promise<number>;
}
```

For dry-run mode (BOT-05), Option B is the right approach. The gas estimator is called when reporting an opportunity, not in the critical latency path.

**Recommended approach for Phase 3 (dry-run mode):**
- Use a pre-computed L1 fee estimate based on a recent sample transaction
- Store as `l1DataFeeEthEstimate` in chain config
- In `estimateCosts()`, add `l1DataFee` as a separate cost line item in `CostEstimate`

This avoids the async complexity while still showing Arbitrum-accurate numbers in dry-run reports.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| **L1 data fee calculation** | Custom brotli compression size estimator | NodeInterface `gasEstimateComponents` | Arbitrum RPC already computes L1 size accurately; compressing calldata manually is complex and inaccurate |
| **Pool discovery** | Custom subgraph indexer | ethers.js `Contract.getPool()` on factory | Direct RPC calls are simpler and don't require running Graph infrastructure |
| **Chain ID verification** | Manual `if (chainId !== 421614)` | ethers.js `provider.getNetwork()` | Built-in, cached, handles both numeric and BigInt chain IDs |
| **Token address validation** | Manual regex/format checks | `isAddress()` from ethers.js | Built-in EIP-55 checksum validation |
| **Multi-provider fallback** | Custom retry wrapper | ethers.js `FallbackProvider` | Built-in, handles timeouts, quorum, and failover |

---

## Common Pitfalls

### Pitfall 1: Uniswap V3 Factory Address Differs on Arbitrum Sepolia

**What goes wrong:** Bot uses `0x1F98431c8aD98523631AE4a59f267346ea31F984` (mainnet factory, which IS the same on Arbitrum mainnet via CREATE2) to discover pools on Arbitrum Sepolia. Pool discovery returns zero address for all pairs. Bot runs with zero pools.

**Why it happens:** Uniswap V3's CREATE2 factory address is the same on Ethereum mainnet AND Arbitrum mainnet. But Arbitrum **Sepolia** has a SEPARATE deployment at a different address (`0x248AB79Bbb9bC29bB72f7Cd42F17e054Fc40188e`). The current `ARBITRUM_SEPOLIA_CONFIG.dexes.uniswapV3.factory` already has the wrong address.

**How to avoid:** Use the official Uniswap V3 deployment docs address for Arbitrum Sepolia. Verify by calling `factory.feeAmountTickSpacing(500)` — returns non-zero if deployed.

**Warning signs:** `getPool()` returns `0x0000000000000000000000000000000000000000` for known token pairs.

---

### Pitfall 2: Gas Estimation Shows Profitability That Disappears on Mainnet

**What goes wrong:** On Arbitrum Sepolia, gas fees are very low (testnet gas has no real cost). Dry-run reports show many profitable opportunities. On mainnet, L1 data fees (priced at Ethereum mainnet gas rates) eliminate all profit.

**Why it happens:** `OpportunityDetector.estimateGasCost()` uses `gasPriceGwei * gasPerSwap * numSwaps / 1e9`. On testnet, `gasPriceGwei` is 0.001 gwei. The L1 data posting fee is 95% of actual cost but is not in this formula.

**How to avoid:** For BOT-04, implement the Arbitrum gas estimator with NodeInterface. For testnet dry-run, use a **simulated mainnet L1 fee** (e.g., assume 10 gwei L1 basefee) to produce realistic profitability estimates. Log both the testnet actual gas and the mainnet-simulated gas.

**Warning signs:** Dry-run shows >2% net profit on every opportunity. Real arbitrage spreads on Arbitrum are typically <0.5%.

---

### Pitfall 3: PollInterval Too Slow for Arbitrum's 0.25s Block Time

**What goes wrong:** With 12s `pollIntervalMs` (the `DEFAULT_MONITOR` setting), the bot misses 48 blocks per poll. Arbitrage opportunities on Arbitrum exist for 250ms windows.

**Why it happens:** `FlashloanBot.fromEnv()` uses `DEFAULT_CONFIG.monitor` which has `pollIntervalMs: 12_000`. If the entry point calls `fromEnv()` without the chain config override, it gets Ethereum polling speed.

**How to avoid:** Always pass `monitor: chain.monitor` when constructing `FlashloanBot`. `ARBITRUM_SEPOLIA_CONFIG.monitor.pollIntervalMs` is correctly set to `1_000` (1 second). Verify the entry point passes this through.

**Warning signs:** Log shows `[PRICE] ... block=X` with X incrementing by 48+ each poll.

---

### Pitfall 4: Empty Pool List Causes Silent No-Op

**What goes wrong:** Bot starts successfully but never emits `priceUpdate` or `opportunity` events. No error. No log indication of the problem. Stats show `prices=0, found=0` forever.

**Why it happens:** `ARBITRUM_SEPOLIA_POOLS = []`. `PriceMonitor.poll()` calls `Promise.all([])` which resolves immediately. No pools to query.

**How to avoid:** Add a startup guard in the entry point that warns (or exits) if `chain.pools.length === 0`. The existing `run-testnet.ts` already does this — copy the pattern.

**Warning signs:** Bot starts, prints header, shows `[TESTNET] No pools configured — bot is running but idle.` Never prints `[PRICE]` events.

---

### Pitfall 5: `run-testnet.ts` Still Points to Sepolia After Changes

**What goes wrong:** Developer adds Arbitrum Sepolia pools and config but runs the existing `run-testnet.ts`. The bot connects to Ethereum Sepolia RPC, can't find the Arbitrum Sepolia pool addresses, and all pool fetches fail.

**Why it happens:** `run-testnet.ts` hardcodes `SEPOLIA_TOKENS`, `SEPOLIA_MONITOR`, `SEPOLIA_DETECTOR` and uses `FlashloanBot.fromEnv()` which reads `RPC_URL` from env. If `RPC_URL` is set to an Arbitrum Sepolia endpoint but the config imports are still Sepolia-specific, the bot connects to Arbitrum but uses wrong thresholds.

**How to avoid:** Create a distinct `run-arb-sepolia.ts` entry point. Add a script in `package.json`: `"bot:arb-sepolia": "node --loader ts-node/esm src/run-arb-sepolia.ts"`.

---

### Pitfall 6: `loadChainConfig()` Reads RPC from `process.env.RPC_URL` at Module Load Time

**What goes wrong:** `ARBITRUM_SEPOLIA_CONFIG.rpcUrl = process.env.RPC_URL || ""`. This is evaluated when the module is first imported, before `dotenv/config` may have run.

**Why it happens:** `bot/src/config/chains/arbitrum-sepolia.ts` line 19:
```typescript
rpcUrl: process.env.RPC_URL || "",
```
If `import "dotenv/config"` hasn't run before this module is imported, `rpcUrl` will be `""`.

**How to avoid:** Ensure `import "dotenv/config"` is the first line in the entry point, before any other imports. Alternatively, resolve `rpcUrl` lazily in `loadChainConfig()` by reading `process.env.RPC_URL` at call time rather than at module evaluation time.

**Warning signs:** `FlashloanBot` throws `ConfigError [network.rpcUrl]: rpcUrl is required` even though `RPC_URL` is set in `.env`.

---

## Code Examples

### Example 1: `run-arb-sepolia.ts` Entry Point Pattern

```typescript
// bot/src/run-arb-sepolia.ts
import "dotenv/config"; // MUST be first

import { FlashloanBot, BOT_VERSION } from "./index.js";
import { loadChainConfig } from "./config/index.js";
import type { ArbitrageOpportunity } from "./detector/types.js";
import type { PriceSnapshot, PriceDelta } from "./monitor/types.js";

async function main(): Promise<void> {
  const chain = loadChainConfig(421614); // Arbitrum Sepolia

  console.log(`\n========================================`);
  console.log(`  Flashloan Bot v${BOT_VERSION} — ARB SEPOLIA`);
  console.log(`  Chain ID: ${chain.chainId} (${chain.chainName})`);
  console.log(`  RPC: ${chain.rpcUrl ? "configured" : "MISSING"}`);
  console.log(`  Pools: ${chain.pools.length}`);
  console.log(`========================================\n`);

  if (!chain.rpcUrl) {
    console.error("ERROR: RPC_URL not set. Set ARBITRUM_SEPOLIA_RPC_URL or RPC_URL.");
    process.exit(1);
  }

  const bot = new FlashloanBot({
    network: { rpcUrl: chain.rpcUrl, chainId: chain.chainId },
    pools: chain.pools,
    monitor: chain.monitor,
    detector: chain.detector,
    logLevel: "debug",
  });

  bot.monitor.on("priceUpdate", (snap: PriceSnapshot) => {
    console.log(`[PRICE] ${snap.pool.label} = ${snap.price.toFixed(8)} @ block ${snap.blockNumber}`);
  });

  bot.detector.on("opportunityFound", (opp: ArbitrageOpportunity) => {
    console.log(`[OPPORTUNITY] ${opp.path.label}`);
    console.log(`  Gross: ${opp.grossProfit.toFixed(8)} ETH`);
    console.log(`  Gas (L2 only): ${opp.costs.gasCost.toFixed(8)} ETH`);
    console.log(`  Net (L2 only): ${opp.netProfit.toFixed(8)} ETH`);
    console.log(`  [REPORT-ONLY] No transaction sent`);
  });

  if (chain.pools.length === 0) {
    console.warn("[WARN] No pools configured. Add pools to ARBITRUM_SEPOLIA_CONFIG.pools.");
  }

  await bot.start();
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
```

### Example 2: Arbitrum NodeInterface Gas Estimator

```typescript
// bot/src/gas/ArbitrumGasEstimator.ts
// Source: https://docs.arbitrum.io/build-decentralized-apps/how-to-estimate-gas

import { Contract } from "ethers";
import type { Provider } from "ethers";

const NODE_INTERFACE_ADDRESS = "0x00000000000000000000000000000000000000C8";
const ABI = [
  "function gasEstimateComponents(address to, bool contractCreation, bytes calldata data) view returns (uint64 gasEstimate, uint64 gasEstimateForL1, uint256 baseFee, uint256 l1BaseFeeEstimate)"
];

export interface ArbitrumGasComponents {
  totalGas: bigint;       // Total L1 + L2 gas
  l1Gas: bigint;          // L1 data component (~95% of total)
  l2Gas: bigint;          // L2 execution component (~5% of total)
  baseFee: bigint;        // Current L2 base fee (wei per gas)
  l1BaseFeeEstimate: bigint; // L1 gas price estimate
  totalCostWei: bigint;   // Total cost: totalGas * baseFee (approx)
}

export async function estimateArbitrumGas(
  provider: Provider,
  to: string,
  data: string,
): Promise<ArbitrumGasComponents> {
  const nodeInterface = new Contract(NODE_INTERFACE_ADDRESS, ABI, provider);
  const result = await nodeInterface.gasEstimateComponents(to, false, data);

  const totalGas = BigInt(result.gasEstimate);
  const l1Gas = BigInt(result.gasEstimateForL1);
  const baseFee = BigInt(result.baseFee);

  return {
    totalGas,
    l1Gas,
    l2Gas: totalGas - l1Gas,
    baseFee,
    l1BaseFeeEstimate: BigInt(result.l1BaseFeeEstimate),
    totalCostWei: totalGas * baseFee,
  };
}
```

### Example 3: L1-Aware CostEstimate for Dry-Run Reporting

To add L1 data fee to the opportunity report without restructuring `OpportunityDetector`, extend `CostEstimate` or log separately:

```typescript
// bot/src/detector/types.ts — extend CostEstimate
export interface CostEstimate {
  flashLoanFee: number;
  gasCost: number;        // L2 execution cost only (current field)
  l1DataFee?: number;     // NEW: Arbitrum L1 data posting cost (ETH)
  slippageCost: number;
  totalCost: number;      // Should include l1DataFee when present
}
```

In `formatOpportunityReport()` in `reporting.ts`, display `l1DataFee` when present:
```typescript
if (costs.l1DataFee !== undefined) {
  lines.push(`    L1 data fee:    ${costs.l1DataFee.toFixed(6)}`);
}
```

### Example 4: Populating Arbitrum Sepolia Pools via Factory Query

```typescript
// One-time pool discovery script
// bot/scripts/discover-arb-sepolia-pools.ts
import { Contract, JsonRpcProvider } from "ethers";

const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)"
];

const provider = new JsonRpcProvider(process.env.RPC_URL!);
const factory = new Contract(
  "0x248AB79Bbb9bC29bB72f7Cd42F17e054Fc40188e", // Arbitrum Sepolia UniV3 factory
  FACTORY_ABI,
  provider
);

const WETH = "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73";
// USDC address TBD — search Arbiscan Sepolia for top USDC by volume

for (const fee of [500, 3000, 10000]) {
  const poolAddr = await factory.getPool(WETH, USDC, fee);
  if (poolAddr !== "0x0000000000000000000000000000000000000000") {
    console.log(`Found WETH/USDC pool at ${poolAddr} (fee: ${fee/10000}%)`);
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-chain bot hardcoded to Ethereum | **Chain config system (`loadChainConfig(chainId)`)** | Phase 2 | Multi-chain bot without code duplication |
| L2-only gas estimation (`gasPerSwap * gasPriceGwei`) | **NodeInterface `gasEstimateComponents()` for L1+L2** | Arbitrum launch (2021), now standard | Accurate profitability on L2s; ignoring L1 = losing money |
| Polling every 12s (Ethereum block time) | **Polling every 1s (Arbitrum has 0.25s blocks)** | N/A — always needed for Arbitrum | Captures 12x more opportunities |
| Flashbots for MEV protection | **No Flashbots on Arbitrum (FCFS sequencer)** | N/A — Arbitrum-specific | Latency matters, not gas bidding; mode: "none" is correct |

---

## Open Questions

### 1. USDC Token Address on Arbitrum Sepolia

**What we know:** Multiple mock USDC tokens exist on Arbitrum Sepolia. The search found addresses like `0xf3c3351d...` and `0xbc47901f...` from different test deployments.

**What's unclear:** Which USDC token has the most liquidity on testnet DEX pools (Uniswap V3, Camelot). Testnet USDC is not from Circle.

**Recommendation:** Run the pool discovery script (Example 4 above) to find which USDC-paired pools exist. Use whichever USDC appears in the highest-TVL pool. If no USDC pool exists, use a mock token pair that can be created.

**Priority:** HIGH — needed before BOT-03 pool configuration.

---

### 2. Actual L1 Data Fee Ratio on Arbitrum Sepolia

**What we know:** Mainnet ratio is ~95% L1 / 5% L2. Testnet gas has no real cost.

**What's unclear:** On Arbitrum Sepolia, the L1 data fee posting may behave differently since testnet doesn't post to Ethereum mainnet. NodeInterface may return near-zero L1 fees on testnet.

**Recommendation:** Call `gasEstimateComponents` on a test transaction in the BOT-04 task and log the breakdown. If testnet L1 fees are near zero, use a **simulated mainnet L1 fee** in the dry-run report (e.g., 10 gwei L1 basefee × estimated calldata size). Document the simulation assumption clearly in the report output.

**Priority:** MEDIUM — important for BOT-05 accuracy.

---

### 3. Whether Camelot Pools Exist on Arbitrum Sepolia with Liquidity

**What we know:** Camelot has factory/router addresses for Arbitrum Sepolia. The DEX exists on testnet.

**What's unclear:** Whether there are any pools with real reserves. Testnet DEXs often have zero-liquidity pools.

**Recommendation:** Check `getReserves()` on any discovered Camelot pairs. If no reserves, the monitoring strategy for BOT-03 becomes: use Uniswap V3 only (one DEX with multiple fee tiers counts as price comparison), or deploy mock pools.

**Priority:** MEDIUM — needed for BOT-03 strategy decision.

---

### 4. How `FlashloanBot` Constructor Integrates with `loadChainConfig()`

**What we know:** `FlashloanBot` constructor takes `BotConfig` (network, pools, monitor, detector). `ChainConfig` has all these fields. The mapping is straightforward.

**What's unclear:** Should we modify `FlashloanBot.fromEnv()` to call `loadChainConfig()`, or just create a standalone `run-arb-sepolia.ts` that constructs `FlashloanBot` directly?

**Recommendation:** For Phase 3, create a standalone entry point. Don't modify `FlashloanBot.fromEnv()` — that keeps the existing tests passing. Refactoring `fromEnv()` to use `loadChainConfig()` is a good future improvement but is out of scope for Phase 3.

**Priority:** LOW — doesn't block implementation.

---

## Existing Code That Does NOT Need Changes

The following modules are fully chain-agnostic and require NO modifications:

| Module | Reason |
|--------|--------|
| `PriceMonitor.ts` | Uses ethers.js `Contract` with passed-in `provider`. Pool addresses come from config. V2/V3 price calculation is protocol-specific, not chain-specific. |
| `OpportunityDetector.ts` | `analyzeDelta()`, `buildSwapPath()`, `calculateGrossProfit()` — all pure math. Only `estimateGasCost()` needs extension for Arbitrum L1 fees. |
| `reporting.ts` | Formats `ArbitrageOpportunity` fields. Chain-agnostic. |
| `HealthMonitor.ts` | Tracks balances, P&L, error rates. Chain-agnostic. |
| `ExecutionEngine.ts` | Not used in dry-run mode. No changes needed for Phase 3. |
| `TransactionBuilder.ts` | Not used in dry-run mode. No changes needed for Phase 3. |
| `mev/` | Not used (Arbitrum mode is "none"). No changes needed. |

---

## Sources

### Primary (HIGH Confidence — verified against source code or official docs)

- **Project codebase** — `bot/src/` directory read directly. All module descriptions and code gaps verified against actual source.
- **[Arbitrum Gas Estimation Docs](https://docs.arbitrum.io/build-decentralized-apps/how-to-estimate-gas)** — NodeInterface `gasEstimateComponents` ABI and usage pattern.
- **[Arbitrum NodeInterface Reference](https://docs.arbitrum.io/build-decentralized-apps/nodeinterface/reference)** — Function signature, address `0xc8`.
- **[Uniswap V3 Arbitrum Deployments](https://docs.uniswap.org/contracts/v3/reference/deployments/arbitrum-deployments)** — Confirmed Arbitrum Sepolia factory `0x248AB79Bbb9bC29bB72f7Cd42F17e054Fc40188e`, SwapRouter02 `0x101F443B4d1b059569D643917553c771E1b9663E`, QuoterV2 `0x2779a0CC1c3e0E44D2542EC3e79e3864Ae93Ef0B`, WETH `0x980B62Da83eFf3D4576C647993b0c1D7faf17c73`.
- **[Arbitrum vs Ethereum Comparison](https://docs.arbitrum.io/build-decentralized-apps/arbitrum-vs-ethereum/comparison-overview)** — Block timing, gas model differences.
- **`deployments/421614.json`** — All 5 contracts deployed to Arbitrum Sepolia in Phase 2.
- **`bot/src/config/chains/arbitrum-sepolia.ts`** — Confirmed: factory address wrong, tokens are placeholders, pools empty.

### Secondary (MEDIUM Confidence)

- **[Camelot Sepolia Testnet Docs](https://docs.camelot.exchange/contracts/arbitrum/sepolia-testnet)** — Factory `0x18E621B64d7808c3C47bccbbD7485d23F257D26f`, Router `0x171B925C51565F5D2a7d8C494ba3188D304EFD93`. Matches Phase 1 research.
- **[WETH on Arbiscan Sepolia](https://sepolia.arbiscan.io/token/0x980b62da83eff3d4576c647993b0c1d7faf17c73)** — Cross-referenced with Uniswap official deployment docs. Confirmed.

### Tertiary (LOW Confidence — needs validation)

- Testnet USDC addresses from Arbiscan search results. Multiple deployments exist; no single canonical address. Needs on-chain validation.
- L1 data fee ratio on Arbitrum Sepolia (may differ from mainnet 95% ratio). Needs measurement.

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — No new libraries needed; ethers.js v6 handles everything
- Architecture patterns: **HIGH** — Verified against actual source code; gaps are precisely identified
- Gas estimation: **HIGH** — Official Arbitrum docs confirm NodeInterface approach; ABI verified
- Arbitrum Sepolia pool addresses: **MEDIUM** — WETH confirmed, USDC needs on-chain discovery
- Pitfalls: **HIGH** — All derived from reading actual code, not hypothetical

**Research date:** 2026-02-17
**Valid until:** 90 days (Arbitrum Sepolia addresses are stable; Uniswap V3 testnet deployments are permanent)

**Phase 2 outputs consumed:**
- `deployments/421614.json` — All 5 contracts deployed ✅
- `bot/src/config/chains/` — `loadChainConfig(421614)` works, returns `ARBITRUM_SEPOLIA_CONFIG` ✅
- `bot/src/config/chains/arbitrum-sepolia.ts` — Exists but has placeholder tokens and empty pools (known gap, Phase 3 fills this) ✅

**Blockers for Phase 3:**
None. The critical open questions (USDC address, pool discovery) are resolved in the first task by running a pool discovery script against the live testnet.
