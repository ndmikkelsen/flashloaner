# Architecture Patterns: v1.1 Mainnet Profitability

**Domain:** Flashloan arbitrage bot — Arbitrum mainnet feature additions
**Researched:** 2026-02-19
**Confidence:** HIGH (based on direct codebase inspection)

---

## Current Architecture (What Exists)

Before describing changes, here is the exact current structure — read directly from the source.

### Pipeline

```
PriceMonitor
  │  emits: PriceSnapshot (per pool, per poll cycle)
  │  emits: PriceDelta    (when deltaPercent >= threshold)
  │
  ▼
OpportunityDetector
  │  listens: PriceDelta from monitor.on("opportunity")
  │  evaluates: gross profit, gas cost, flash loan fee, slippage
  │  emits: ArbitrageOpportunity (if net profit > threshold)
  │
  ▼
[FlashloanBot.wireEvents() in index.ts]
  │  currently: logs the opportunity, stops here in dry-run mode
  │  missing:   TransactionBuilder + ExecutionEngine not yet wired in
  │
  ▼ (not yet wired)
TransactionBuilder
  │  takes: ArbitrageOpportunity
  │  encodes: executeArbitrage() calldata for FlashloanExecutor
  │
  ▼ (not yet wired)
ExecutionEngine
     submits: PreparedTransaction via signer
     tracks:  confirmation, profit, failures
```

### Key Observations from Code Inspection

1. **TransactionBuilder and ExecutionEngine already exist** but are not wired into `FlashloanBot`. The bot currently stops at `opportunityFound` with a log message.

2. **DEXProtocol type is the integration seam**: `"uniswap_v2" | "uniswap_v3" | "sushiswap" | "sushiswap_v3" | "camelot_v2" | "camelot_v3"`. New DEXes (Trader Joe, Ramses) require adding values here.

3. **AdapterMap in builder/types.ts** maps `DEXProtocol → deployed adapter address`. New DEXes need entries here.

4. **PriceMonitor routes to DEX handling via `pool.dex` string** (`getCallDataForPool`, `decodePriceFromResult`, `isV3Pool`). New DEXes must extend these switch-like conditionals.

5. **OpportunityDetector.analyzeDelta()** uses a fixed `defaultInputAmount` (currently 5 ETH). This is the hook point for optimal input sizing.

6. **The `inputAmount` field on `ArbitrageOpportunity`** flows all the way through to `TransactionBuilder.buildArbitrageTransaction()`. Changing it per-opportunity just means setting it before `analyzeDelta` fires — or computing it inside the detector.

7. **`HealthMonitor` already exists** with full P&L tracking, balance alerts, and heartbeat. It is NOT wired into `FlashloanBot` yet either. Dashboard work extends this.

8. **`bot/src/run-arb-mainnet.ts`** is the entry point for Arbitrum. This is where pm2 will point and where live execution gets wired.

---

## Feature Integration Map

### Feature 1: Cross-Fee-Tier Routing

**Problem:** Same-DEX same-token pairs (e.g., WETH/USDC on UniV3 0.05% vs UniV3 0.3%) have a minimum cost floor of 0.6% (two fees combined). Cross-fee-tier routing pairs a 0.05% pool with a 0.3% pool for a 0.35% cost floor.

**What this affects:** Nothing needs to change architecturally. The existing `PriceMonitor` already treats each pool by its address, not its fee tier. A UniV3 0.05% and a UniV3 0.3% pool on the same pair are already tracked as two separate `PoolConfig` entries with different `poolAddress` values.

**Integration point:** `bot/src/config/chains/pools/arbitrum-mainnet.ts`

**What to add:** Pool definitions pairing different fee tiers of the same token pair. The monitor will detect spread between them naturally. The detector already respects `feeTier` when computing fees in `getSwapFeeRate()`.

**New components needed:** None.

**Modified components:**
- `bot/src/config/chains/pools/arbitrum-mainnet.ts` — add cross-fee-tier pool pairs (e.g., WETH/USDC UniV3 0.05% paired with WETH/USDC UniV3 0.3%, ensure both are present)
- No code logic changes needed; this is pure configuration.

**Backward compatibility:** Fully backward compatible. Dry-run mode unchanged.

---

### Feature 2: New DEX Adapters (Trader Joe LB, Ramses)

**Two-layer work:** Each new DEX requires an on-chain adapter contract AND off-chain price reading support.

#### On-Chain: New Adapter Contracts

**Integration point:** `contracts/src/adapters/`

The existing `IDEXAdapter` interface (`swap()` + `getAmountOut()`) is the contract. Each new DEX needs a new `.sol` file implementing it.

- `TraderJoeLBAdapter.sol` — Trader Joe Liquidity Book uses bin-based AMM (not constant-product). Requires `ILBRouter.swapExactTokensForTokens()` with packed `binSteps` path encoding.
- `RamsesV2Adapter.sol` — Ramses is a Uniswap V3 fork with fee tiers and `ve(3,3)` emissions. Uses the same V3 `ISwapRouter.exactInputSingle()` interface. This adapter will be nearly identical to `UniswapV3Adapter.sol`.

**New files:**
```
contracts/src/adapters/TraderJoeLBAdapter.sol
contracts/src/adapters/RamsesV2Adapter.sol
```

**Modified files:**
- `contracts/src/interfaces/IDEXAdapter.sol` — no change needed; interface already covers both
- `FlashloanExecutor.sol` — no change needed; `registerAdapter()` handles whitelist at runtime

#### Off-Chain: Price Reader Support

**Integration point:** `bot/src/monitor/PriceMonitor.ts`

Three methods must be extended for each new DEX:

1. **`getCallDataForPool(pool)`** — must return correct encoded calldata for the DEX's price-reading function
2. **`decodePriceFromResult(pool, data)`** — must decode the raw return into `price` and optionally `sqrtPriceX96`/`reserves`
3. **`isV3Pool(pool)`** — must classify the pool correctly for liquidity fetching

**Ramses V2:** Functionally identical to Uniswap V3 (same `slot0()` ABI). Add `"ramses_v2"` to the `uniswap_v3` branch in all three methods. Cost: ~5 lines.

**Trader Joe LB:** Uses a completely different pricing model (bin-based). The active bin price is readable via `ILBPair.getReservesAndId()` or `getActiveId()` + `getBin()`. Requires a new decode branch and a new ABI fragment. No `sqrtPriceX96` concept; encode price directly from bin reserves.

**Integration point:** `bot/src/monitor/types.ts`

Add to `DEXProtocol` union:
```typescript
export type DEXProtocol =
  | "uniswap_v2" | "uniswap_v3"
  | "sushiswap" | "sushiswap_v3"
  | "camelot_v2" | "camelot_v3"
  | "ramses_v2"         // new
  | "trader_joe_lb";    // new
```

**Integration point:** `bot/src/builder/TransactionBuilder.ts` — `encodeExtraData(step)`

Must handle the new DEX protocols:
- `ramses_v2`: same as `uniswap_v3` (encode `uint24 feeTier`)
- `trader_joe_lb`: encode `binStep` as `uint16` instead of fee tier

**Integration point:** `bot/src/builder/types.ts` — `AdapterMap`

```typescript
export type AdapterMap = Record<DEXProtocol, string>;
```

New DEX entries need deployed adapter addresses.

**Integration point:** `bot/src/config/chains/arbitrum.ts` — `dexes` section

Add Trader Joe and Ramses factory/router addresses.

**Integration point:** `bot/src/config/chains/pools/arbitrum-mainnet.ts`

Add pool definitions using the new `dex` values.

**New files (TypeScript):** None — changes are inline extensions to existing files.

**New files (Solidity):**
```
contracts/src/adapters/TraderJoeLBAdapter.sol
contracts/src/adapters/RamsesV2Adapter.sol
contracts/test/adapters/TraderJoeLBAdapter.t.sol
contracts/test/adapters/RamsesV2Adapter.t.sol
```

---

### Feature 3: Optimal Input Sizing

**Problem:** `defaultInputAmount = 5 ETH` is fixed regardless of pool depth. Deep pools tolerate 50 ETH with minimal slippage. Thin pools lose money at 5 ETH.

**Where the hook is:** `OpportunityDetector.analyzeDelta()` — line 124: `const inputAmount = this.config.defaultInputAmount;`

**Approach:** Add an `InputOptimizer` module that computes the optimal input amount given pool reserve data (already present in `PriceSnapshot` as `reserves` for V2 and `liquidity + sqrtPriceX96` for V3).

**Integration point:** `OpportunityDetector.analyzeDelta()` and `analyzeDeltaAsync()`

Replace the static `this.config.defaultInputAmount` with a call to `InputOptimizer.computeOptimalInput(delta, path)`.

**New module:**
```
bot/src/optimizer/InputOptimizer.ts
bot/src/optimizer/types.ts
bot/src/optimizer/index.ts
```

**Interface:**
```typescript
// bot/src/optimizer/InputOptimizer.ts
export function computeOptimalInput(
  delta: PriceDelta,
  config: { minInput: number; maxInput: number; steps?: number }
): number;
```

**Algorithm:** Binary search on input amount. For each candidate `x`:
1. Compute gross profit using `calculateGrossProfit()` with simulated AMM price impact (already available in `estimateSlippage()` logic)
2. Compute total cost
3. Return `x` that maximizes `netProfit = grossProfit(x) - costs(x)`

The slippage math is already implemented — `computeVirtualReserveIn()` in OpportunityDetector gives the virtual reserve. The optimizer calls the same formula to find the peak net profit.

**Modified components:**
- `bot/src/detector/OpportunityDetector.ts` — inject `InputOptimizer`, replace fixed `defaultInputAmount`
- `bot/src/detector/types.ts` — add `minInput` / `maxInput` to `OpportunityDetectorConfig`

**Backward compatibility:** If no optimizer is injected (or pool has no reserve data), falls back to `defaultInputAmount`. Dry-run mode unchanged.

---

### Feature 4: Live Execution

**Problem:** `TransactionBuilder` and `ExecutionEngine` exist but are not wired into `FlashloanBot`. Opportunities are detected then dropped.

**Integration point:** `bot/src/index.ts` — `FlashloanBot` class

Currently `wireEvents()` calls `console.log(formatOpportunityReport(...))` when `opportunityFound` fires. Live execution replaces this with a call through the builder → engine pipeline.

**What to add to `FlashloanBot`:**
1. Accept optional `TransactionBuilder` and `ExecutionEngine` in the constructor (or via a `setExecutor()` method)
2. In `wireEvents()`, when `opportunityFound` fires and `!this.dryRun`, call:
   - `builder.buildArbitrageTransaction(opp)`
   - Gas estimation from `ArbitrumGasEstimator`
   - `builder.prepareTransaction(tx, gas, nonce)`
   - `engine.executeTransaction(preparedTx)`

**Pattern — keep dry-run backward compatible:**
```typescript
// In FlashloanBot constructor
private executor?: { builder: TransactionBuilder; engine: ExecutionEngine };

// In wireEvents()
detector.on("opportunityFound", async (opp) => {
  if (this.dryRun || !this.executor) {
    console.log(formatOpportunityReport(opp, true));
    return;
  }
  // Live path
  await this.executeOpportunity(opp);
});
```

**Integration point:** `bot/src/run-arb-mainnet.ts`

This entry point is where the signer (ethers `Wallet`) gets constructed from `PRIVATE_KEY` env var, and where `TransactionBuilder` + `ExecutionEngine` instances are created and passed to `FlashloanBot`.

**Modified components:**
- `bot/src/index.ts` — `FlashloanBot`: add optional executor wiring, `executeOpportunity()` method
- `bot/src/run-arb-mainnet.ts` — construct signer + executor when `DRY_RUN=false`
- `bot/src/config/types.ts` — add `executorAddress`, `adapters`, `flashLoanProviders` to `BotConfig` (needed for live execution)

**New components:** None — `TransactionBuilder` and `ExecutionEngine` are already implemented.

**Key constraint:** Live execution must remain off by default. `FlashloanBot` defaults to `dryRun = true`. Live execution only activates when `DRY_RUN=false` AND `executor` is provided AND `EXECUTOR_ADDRESS` env var is set.

---

### Feature 5: P&L Dashboard

**What exists:** `HealthMonitor` (in `bot/src/health/HealthMonitor.ts`) already tracks:
- Token balances with threshold alerts
- Gross profit per token (via `recordProfit()`)
- Gas costs (via `recordGasCost()`)
- Error rates in rolling window
- Heartbeat events

**What is missing:**
1. `HealthMonitor` is not wired into `FlashloanBot`
2. No trade-level history — `ProfitRecord` in `ExecutionEngine` tracks per-tx profit, but nothing aggregates this into human-readable reporting
3. No persistent storage — everything resets on restart
4. No dashboard UI — needs a console summary or file output

**Integration point:** `bot/src/index.ts` — `FlashloanBot`

Wire `HealthMonitor` into the bot:
- On `engine.on("profit", record)` → call `health.recordProfit(record.token, profitAmount)` and `health.recordGasCost(record.gasCostWei)`
- On `engine.on("reverted", result)` → call `health.recordLoss(...)`
- On `health.on("alert", ...)` → log alerts with severity

**Persistent storage — two options:**

Option A (recommended for v1.1): **Append to JSONL file**
Each trade result appends one JSON line to `.data/trades.jsonl`. The dashboard reads this file on startup to reconstruct history.

Option B (future): SQLite via `better-sqlite3`. Adds a dependency. Defer to v1.2.

**New module:**
```
bot/src/dashboard/PnLDashboard.ts   — reads trades.jsonl, computes summary
bot/src/dashboard/types.ts          — TradeRecord interface
bot/src/dashboard/index.ts
```

**Interface:**
```typescript
// bot/src/dashboard/PnLDashboard.ts
export class PnLDashboard {
  constructor(dataDir: string);
  recordTrade(result: ExecutionResult, opportunity: ArbitrageOpportunity): void;
  getSummary(): PnLSummary;
  printSummary(): void;            // formats table to stdout
  exportCSV(path: string): void;   // for external analysis
}
```

**Data file location:** `.data/trades.jsonl` (gitignored). Directory created on startup if missing.

**Console display:** Called on graceful shutdown (existing `shutdown()` function in `run-arb-mainnet.ts`) and periodically via the existing stats interval.

**Modified components:**
- `bot/src/index.ts` — wire `HealthMonitor` and `PnLDashboard` into `FlashloanBot`
- `bot/src/run-arb-mainnet.ts` — instantiate `PnLDashboard`, call `printSummary()` on shutdown
- `.gitignore` — add `.data/`

---

### Feature 6: pm2 Process Management

**Integration point:** Repository root

pm2 needs an ecosystem config file. The bot already handles SIGINT/SIGTERM gracefully (the `shutdown()` function in `run-arb-mainnet.ts` and `FlashloanBot.registerShutdownHandlers()`).

**New file:**
```
ecosystem.config.cjs    (root)
```

Note: `ecosystem.config.js` requires `module.exports` which conflicts with ESM (`"type": "module"` in `package.json`). Use `.cjs` extension.

**Content pattern:**
```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "flashloaner-arb-mainnet",
      script: "node",
      args: "--import tsx bot/src/run-arb-mainnet.ts",
      // OR after build:
      // script: "node",
      // args: "dist/run-arb-mainnet.js",
      cwd: "/path/to/project",
      env: {
        NODE_ENV: "production",
        // Secrets come from .env loaded by dotenv/config in the script
      },
      max_restarts: 10,
      restart_delay: 5000,
      kill_timeout: 10000,    // 10s for graceful shutdown
      log_file: "logs/arb-mainnet.log",
      error_file: "logs/arb-mainnet-error.log",
      merge_logs: true,
      time: true,             // prefix logs with timestamp
    },
  ],
};
```

**Graceful shutdown:** `kill_timeout: 10000` gives the bot 10 seconds to complete the shutdown sequence (stop monitor, flush pending trades to disk, print final P&L summary) before pm2 force-kills it.

**Log management:** pm2 handles log rotation natively via `pm2 install pm2-logrotate`. The existing console output becomes the pm2 log stream.

**Modified components:** None — existing shutdown handlers are already correct.

**New files:**
```
ecosystem.config.cjs
logs/          (gitignored directory, pm2 writes here)
```

---

## Component Modification Summary

| Component | Status | Change Type | What Changes |
|-----------|--------|-------------|--------------|
| `bot/src/monitor/types.ts` | Exists | Modified | Add `"ramses_v2" \| "trader_joe_lb"` to `DEXProtocol` |
| `bot/src/monitor/PriceMonitor.ts` | Exists | Modified | Extend `getCallDataForPool`, `decodePriceFromResult`, `isV3Pool` for new DEXes |
| `bot/src/detector/OpportunityDetector.ts` | Exists | Modified | Replace fixed `defaultInputAmount` with `InputOptimizer` call |
| `bot/src/detector/types.ts` | Exists | Modified | Add `minInput`, `maxInput`, `maxInput` to config; add `inputOptimizer` optional field |
| `bot/src/builder/TransactionBuilder.ts` | Exists | Modified | Extend `encodeExtraData` for `ramses_v2`, `trader_joe_lb` |
| `bot/src/builder/types.ts` | Exists | Modified | `AdapterMap` automatically expands with `DEXProtocol` |
| `bot/src/index.ts` (FlashloanBot) | Exists | Modified | Wire `ExecutionEngine`, `TransactionBuilder`, `HealthMonitor`, `PnLDashboard`; add `executeOpportunity()` |
| `bot/src/run-arb-mainnet.ts` | Exists | Modified | Construct signer + executor for live mode; instantiate dashboard; call summary on shutdown |
| `bot/src/config/chains/arbitrum.ts` | Exists | Modified | Add Trader Joe + Ramses DEX addresses |
| `bot/src/config/chains/pools/arbitrum-mainnet.ts` | Exists | Modified | Add cross-fee-tier pairs + new DEX pools |
| `bot/src/config/types.ts` | Exists | Modified | Add `executorAddress`, `adapters`, `flashLoanProviders` fields |
| `contracts/src/adapters/TraderJoeLBAdapter.sol` | New | New file | Trader Joe LB swap adapter |
| `contracts/src/adapters/RamsesV2Adapter.sol` | New | New file | Ramses V2 swap adapter (V3 fork) |
| `bot/src/optimizer/InputOptimizer.ts` | New | New file | Binary-search optimal input amount |
| `bot/src/optimizer/types.ts` | New | New file | `InputOptimizerConfig` interface |
| `bot/src/optimizer/index.ts` | New | New file | Re-export |
| `bot/src/dashboard/PnLDashboard.ts` | New | New file | Trade history, P&L summary, CSV export |
| `bot/src/dashboard/types.ts` | New | New file | `TradeRecord`, `PnLSummary` interfaces |
| `bot/src/dashboard/index.ts` | New | New file | Re-export |
| `ecosystem.config.cjs` | New | New file | pm2 ecosystem config |

---

## New Component Specifications

### InputOptimizer

```
bot/src/optimizer/InputOptimizer.ts
```

**Inputs:**
- `delta: PriceDelta` — contains `buyPool.reserves`, `buyPool.liquidity`, `buyPool.sqrtPriceX96` from the monitor
- `config: { minInput: number; maxInput: number; steps?: number }`

**Algorithm:** Ternary search on `[minInput, maxInput]` for peak net profit. Ternary search converges in O(log n) iterations without derivatives.

**Dependencies:** Pure math — no external deps. Uses types from existing `detector/types.ts` and `monitor/types.ts`.

**Contract:** Returns `number` (ETH units). If reserve data is missing (pool hasn't populated snapshot yet), returns `config.minInput` as safe fallback.

### PnLDashboard

```
bot/src/dashboard/PnLDashboard.ts
```

**Inputs on `recordTrade()`:**
- `ExecutionResult` (from `engine/types.ts`) — `status`, `txHash`, `gasUsed`, `effectiveGasPrice`
- `ArbitrageOpportunity` (from `detector/types.ts`) — `netProfit`, `costs`, `path`, `inputAmount`

**Persistence:** Append-only JSONL. One `TradeRecord` JSON line per confirmed or reverted trade. File at `.data/trades.jsonl`.

**`getSummary()` output:**
```typescript
interface PnLSummary {
  totalTrades: number;
  profitable: number;
  reverted: number;
  totalGrossProfit: number;      // ETH
  totalGasCost: number;          // ETH
  totalFlashFee: number;         // ETH
  totalSlippage: number;         // ETH
  netPnL: number;                // ETH
  winRate: number;               // 0-1
  avgNetProfitPerTrade: number;  // ETH
  runtime: number;               // ms
}
```

**`printSummary()`:** Formats a table to stdout using only `console.log` (no external deps).

---

## Data Flow with New Features

```
PriceMonitor
  │  polls pools via Multicall3 (unchanged)
  │  emits PriceDelta when delta >= threshold
  │
  ▼
OpportunityDetector
  │  receives PriceDelta
  │  calls InputOptimizer.computeOptimalInput(delta, config)   [NEW]
  │  uses optimal input in analyzeDeltaAsync()
  │  emits ArbitrageOpportunity
  │
  ▼
FlashloanBot.wireEvents()
  │
  ├─ [DRY_RUN=true]  ──▶ log opportunity report (existing behavior, unchanged)
  │
  └─ [DRY_RUN=false] ──▶ executeOpportunity(opp)           [NEW]
       │
       ├── TransactionBuilder.buildArbitrageTransaction(opp)
       │    encodes executeArbitrage() calldata
       │    resolves adapter addresses (now includes trader_joe_lb, ramses_v2)
       │
       ├── ArbitrumGasEstimator.estimateArbitrumGas(provider, to, data)
       │    returns L1+L2 gas breakdown
       │
       ├── TransactionBuilder.prepareTransaction(tx, gas, nonce)
       │
       └── ExecutionEngine.executeTransaction(preparedTx)
            │  eth_call simulation pre-flight (existing)
            │  signer.sendTransaction()
            │  wait for confirmation
            │  parse ArbitrageExecuted event
            │  emit "profit" | "reverted" | "failed"
            │
            ▼
       PnLDashboard.recordTrade(result, opp)                  [NEW]
            │  appends to .data/trades.jsonl
            │
       HealthMonitor.recordProfit() / recordGasCost()         [NEW wiring]
            │  updates in-memory P&L
            │  emits alerts on thresholds
```

---

## Build Order

Dependencies between features determine the order. Features with no inter-dependencies can be developed in parallel.

### Phase 1: Pool Configuration + Cross-Fee-Tier Routing

**Dependency:** None — pure config change.

**Why first:** Validates the monitoring pipeline with new pool pairs. No code changes. Fast feedback: run dry-run for 30 minutes and observe whether cross-fee-tier pairs show narrower spreads. This also expands the dataset for optimal input sizing calibration.

**Files:**
- `bot/src/config/chains/pools/arbitrum-mainnet.ts` — add cross-fee-tier pairs

---

### Phase 2: New DEX Adapters (Ramses V2 first, then Trader Joe LB)

**Dependency:** Phase 1 (need correct pool definitions to test new adapters).

**Why Ramses first:** It is a Uniswap V3 fork — the on-chain adapter is ~20 lines of code reusing `UniswapV3Adapter.sol` patterns. Off-chain support in `PriceMonitor` adds 3 lines to existing branches. Very low risk.

**Why Trader Joe second:** Novel AMM model (bin-based). Requires understanding `ILBPair.getActiveId()` + `getBin()` price computation. More code, more testing.

**Subtasks (Ramses):**
1. `RamsesV2Adapter.sol` — implement, test with Foundry fork test
2. Add `"ramses_v2"` to `DEXProtocol`
3. Extend `PriceMonitor` for `ramses_v2`
4. Extend `TransactionBuilder.encodeExtraData` for `ramses_v2`
5. Add Ramses pool addresses to `arbitrum.ts` config
6. Add Ramses pools to pool definitions
7. Deploy `RamsesV2Adapter` to Arbitrum Sepolia → run dry-run to validate

**Subtasks (Trader Joe LB):**
1. Research `ILBPair` interface for price reading (MEDIUM confidence — LB uses non-standard bin math)
2. `TraderJoeLBAdapter.sol` — implement bin-aware swap routing
3. Add `"trader_joe_lb"` to `DEXProtocol`
4. Extend `PriceMonitor` for `trader_joe_lb` price decoding
5. Extend `TransactionBuilder.encodeExtraData` for `trader_joe_lb` (binStep encoding)
6. Add pools, deploy adapter, validate on Sepolia

---

### Phase 3: Optimal Input Sizing

**Dependency:** Phase 1 (needs pool data), Phase 2 desirable but not blocking.

**Why third:** The optimizer uses `reserves`/`liquidity` data already present in `PriceSnapshot`. This data comes from Phase 1 pools. More pool types (Phase 2) give it more context but aren't required.

**Subtasks:**
1. `InputOptimizer.ts` — implement ternary search
2. Unit tests with synthetic reserve data
3. Inject into `OpportunityDetector` — replace `defaultInputAmount`
4. Verify: dry-run for 1 hour, compare `inputAmount` values against pool depth; confirm no inputs exceed 20% of pool reserve

---

### Phase 4: Live Execution

**Dependency:** Phases 1-3 (need accurate profit estimates before spending gas).

**Why fourth:** Live execution is the highest-risk feature. All profit estimation must be calibrated first. The eth_call simulation in `ExecutionEngine` will reject losing trades, but miscalibrated inputs still waste gas on simulation calls.

**Subtasks:**
1. Wire `TransactionBuilder` + `ExecutionEngine` into `FlashloanBot.wireEvents()`
2. Add `executeOpportunity()` private method to `FlashloanBot`
3. Update `run-arb-mainnet.ts` to construct signer and executor from env vars
4. Add `EXECUTOR_ADDRESS`, `PRIVATE_KEY` to env config loading
5. Gate live execution behind `DRY_RUN !== "false"` check (existing) AND presence of `executor`
6. Run on Arbitrum Sepolia with live execution enabled (real transactions, no real profit)
7. Confirm: transactions confirm, `ArbitrageExecuted` events parse correctly, `ProfitRecord` populates

---

### Phase 5: P&L Dashboard

**Dependency:** Phase 4 (needs `ExecutionResult` data from live trades).

**Subtasks:**
1. `PnLDashboard.ts` — implement with JSONL persistence
2. Wire into `FlashloanBot` via `engine.on("profit")` / `engine.on("reverted")`
3. Wire `HealthMonitor` into `FlashloanBot` (it already exists, just needs wiring)
4. Call `dashboard.printSummary()` in `run-arb-mainnet.ts` shutdown handler
5. Test: run with mock execution results, verify JSONL writes and summary math

---

### Phase 6: pm2

**Dependency:** Phase 4 (needs stable live execution before putting under process management).

**Subtasks:**
1. `ecosystem.config.cjs` — write config
2. Test: `pm2 start ecosystem.config.cjs`, verify bot starts, logs appear
3. Test graceful restart: `pm2 reload flashloaner-arb-mainnet` — verify shutdown completes within `kill_timeout`
4. Test crash recovery: `pm2 kill` — verify pm2 restarts bot
5. Install `pm2-logrotate` for log rotation

---

### Build Order Summary

```
Phase 1: Pool Config (cross-fee-tier)
   │  no dependencies
   ▼
Phase 2: New DEX Adapters
   │  depends on: Phase 1
   ▼
Phase 3: Input Optimizer
   │  depends on: Phase 1
   │  (Phase 2 helpful but not blocking)
   ▼
Phase 4: Live Execution
   │  depends on: Phase 1, 2, 3
   ▼
Phase 5: P&L Dashboard
   │  depends on: Phase 4
   ▼
Phase 6: pm2
      depends on: Phase 4
```

**Parallelization opportunity:** Phase 3 (Input Optimizer) can be developed alongside Phase 2 (DEX Adapters) since both depend only on Phase 1 and are independent of each other. The developer can build the optimizer with existing pool data while adapter contracts are being tested.

---

## Backward Compatibility Guarantees

Every feature is gated so existing dry-run behavior is preserved:

| Feature | Guard |
|---------|-------|
| New pool config | Additive — existing pools unchanged |
| New DEX adapters | Only active when pool has new `dex` value |
| Input optimizer | Falls back to `defaultInputAmount` when no reserve data |
| Live execution | Requires `DRY_RUN=false` AND `executor` injected — both must be explicitly set |
| P&L dashboard | Only wired when `dashboard` is provided to `FlashloanBot`; JSONL writes don't affect runtime |
| pm2 | External — no code changes required in bot itself |

Running `pnpm test` and `forge test` must continue to pass after every phase. No breaking changes to existing interfaces.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Routing Logic in OpportunityDetector

**What:** Adding multi-hop path selection (e.g., WETH → USDC via pool A then B) inside `OpportunityDetector`.

**Why bad:** The detector's job is profit evaluation, not path discovery. Adding path search makes it a dual-responsibility class, exponentially increasing complexity and test surface.

**Instead:** Keep path building in `buildSwapPath()` (already in OpportunityDetector as a simple 2-step path builder). Cross-fee-tier routing is just two pools with the same tokens — `buildSwapPath()` already handles this correctly via the `PriceDelta.buyPool` / `sellPool` structure.

### Anti-Pattern 2: Trader Joe LB Using V3 Price Formula

**What:** Approximating Trader Joe LB price with `sqrtPriceX96` math (since LB is bin-based, not constant-product).

**Why bad:** LB bins have discrete prices. The active bin price is `(1 + binStep/10000)^(activeId - 8388608)`. Using V3 math will produce wrong prices and incorrect slippage estimates.

**Instead:** Implement `decodeLBPrice()` using the bin math formula, or read `getReservesOfBin(activeId)` directly and compute price from bin reserves.

### Anti-Pattern 3: Input Optimizer Making RPC Calls

**What:** Calling the chain to get fresh reserve data inside `computeOptimalInput()`.

**Why bad:** The opportunity window on Arbitrum (0.25s blocks) closes faster than an RPC round-trip. Adding an RPC call inside the hot path adds 20-100ms latency, causing the opportunity to be stale by execution time.

**Instead:** Use reserve data already in the `PriceSnapshot` that was fetched in the same Multicall3 batch. The data is at most one poll cycle old (3 seconds), which is acceptable.

### Anti-Pattern 4: Writing P&L to SQLite in the Hot Path

**What:** Inserting a SQLite row synchronously after every trade.

**Why bad:** File I/O in the hot path can block the Node.js event loop during periods of high opportunity frequency. Even with async SQLite, connection setup adds latency.

**Instead:** Append to JSONL asynchronously (fire-and-forget write). If the process crashes mid-write, the last partial line is ignored on next read. Acceptable data integrity for an in-process analytics store.

---

## Key Risk: Trader Joe LB Bin Math

**Risk level:** MEDIUM

**What:** Trader Joe LB (Liquidity Book) uses a novel bin-based AMM. Price computation, slippage estimation, and swap routing are different from both constant-product (V2) and concentrated liquidity (V3). The on-chain swap router (`ILBRouter`) takes a packed path with `binStep` values, not fee tiers.

**Mitigation:**
1. Research LB whitepaper and official SDK before implementing
2. Test adapter on Arbitrum Sepolia fork against real LB pool before mainnet
3. If LB implementation proves too complex for v1.1 scope, defer and focus on Ramses V2 (which is a V3 fork and straightforward)

**Decision point:** If LB research shows > 2 days of implementation time, cut Trader Joe from v1.1 and add it to v1.2.

---

## Sources

All findings based on direct codebase inspection of:
- `bot/src/monitor/PriceMonitor.ts` (537 lines)
- `bot/src/detector/OpportunityDetector.ts` (489 lines)
- `bot/src/engine/ExecutionEngine.ts` (495 lines)
- `bot/src/builder/TransactionBuilder.ts` (241 lines)
- `bot/src/index.ts` (285 lines — FlashloanBot)
- `bot/src/health/HealthMonitor.ts` (299 lines)
- `bot/src/run-arb-mainnet.ts` (228 lines)
- `contracts/src/FlashloanExecutor.sol` (302 lines)
- `contracts/src/adapters/UniswapV3Adapter.sol` (232 lines)
- `contracts/src/interfaces/IDEXAdapter.sol` (81 lines)
- `bot/src/config/chains/arbitrum.ts`, `pools/arbitrum-mainnet.ts`
- `bot/src/config/chains/types.ts`, `bot/src/detector/types.ts`, `bot/src/monitor/types.ts`

**Confidence:** HIGH — all architectural claims traced to specific lines of source code.
