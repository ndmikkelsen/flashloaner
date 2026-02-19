# Technology Stack — v1.1 Mainnet Profitability

**Project:** Flashloan Arbitrage Bot (Arbitrum)
**Milestone:** v1.1 — Live execution + new DEX adapters + P&L dashboard
**Researched:** 2026-02-19
**Confidence:** MEDIUM (contract addresses HIGH via on-chain verification; SDK versions MEDIUM via npm search; Zyberswap status LOW)

---

## Scope

This document covers **only the stack additions needed for v1.1** features. The existing stack (ethers.js v6, TypeScript, Foundry, Vitest, tsx, dotenv) is validated and unchanged.

### Existing Stack (Validated — Do Not Touch)

| Component | Version | Notes |
|-----------|---------|-------|
| Solidity / Foundry | Latest stable | FlashloanExecutor, adapters |
| ethers.js | v6 (`^6.x`) | All on-chain interaction |
| TypeScript | `^5.9.3` | ESM (`"type": "module"`) |
| tsx | `^4.21.0` | Runtime TS execution |
| Vitest | `^4.0.18` | TypeScript tests |
| dotenv | `^17.3.1` | Env loading |
| Node.js | LTS (v22+) | Runtime |

---

## Feature 1: Cross-Fee-Tier Routing

### What it is
Route arbitrage through different Uniswap V3 fee tiers (500 / 3000 / 10000 bps) on the same token pair. Example: buy WETH on USDC/WETH 0.05% pool, sell on USDC/WETH 0.3% pool. Lowers the effective cost floor vs. using the same fee tier on both legs.

### What's already present
The codebase already handles this structurally:
- `feeTier` field exists on `PoolDefinition` and `SwapStep`
- `getSwapFeeRate()` in `OpportunityDetector` reads `feeTier` and applies it correctly
- `ARBITRUM_CONFIG` already has QuoterV2 at `0x61fFE014bA17989E743c5F6cB21bF9697530B21e`
- `PriceMonitor` already polls individual pools independently

Cross-fee-tier routing is therefore a **pool configuration extension**, not a library addition. The architecture already supports it.

### Stack additions needed

**No new npm packages required.**

Changes:
1. **Pool config:** Add entries to `bot/src/config/chains/pools/arbitrum-mainnet.ts` for same token pairs at different fee tiers (0.05% / 0.3% / 1% pool variants on UniV3, SushiV3, CamelotV3).
2. **QuoterV2 integration:** Add a `QuoterService` class that calls QuoterV2's `quoteExactInputSingle` via ethers ABI to validate multi-leg paths before execution. Uses the existing address already in `arbitrum.ts`.
3. **Path selection logic:** Small extension to `OpportunityDetector.buildSwapPath()` or a new `PathOptimizer` that, given multiple pools for the same pair, selects the fee-tier combination with the highest net profit after fees.

**Why not `@uniswap/smart-order-router`:** The Uniswap smart-order-router is a ~150-transitive-dependency package optimized for retail swap routing across thousands of pools. For a tightly controlled 22-pool arbitrage scanner where pool candidates are known in advance, direct QuoterV2 ABI calls via ethers.js are faster, lighter, and more deterministic. (MEDIUM confidence — from search results and codebase analysis)

**Arbitrum QuoterV2 address (HIGH confidence — official Uniswap docs):**
`0x61fFE014bA17989E743c5F6cB21bF9697530B21e`

---

## Feature 2: New DEX Adapters

### 2a. Trader Joe V2.1 (Liquidity Book)

**What it is:** DLMM (Discrete Liquidity Market Maker) pool design unique to Trader Joe. Uses discrete "bins" instead of a continuous price curve. Each bin has zero slippage within it. Price = fixed exchange rate per bin. The active bin determines the current price.

Arbitrage arises when the active bin price diverges from other DEX prices. Detection pattern: read active bin price from `LBPair`, compare to UniV3/SushiV3 spot prices.

**Key contracts on Arbitrum (HIGH confidence — verified on Arbiscan):**

| Contract | Address | Notes |
|----------|---------|-------|
| LBRouter v2.1 | `0xb4315e873dbcf96ffd0acd8ea43f689d8c20fb30` | V2.1 router — use this |
| LBRouter v2.0 | `0x7bfd7192e76d950832c77bb412aae841049d8d9b` | Earlier version, keep as fallback |
| LBFactory v2.1 | `0x8e42f2F4101563bF679975178e880FD87d3eFd4e` | Pool discovery |
| LBFactory v2.0 | `0x1886d09c9ade0c5db822d85d21678db67b6c2982` | Pool discovery (legacy) |

**LBQuoter:** Available from the `lfj-gg/joe-v2` GitHub repo (`src/LBQuoter.sol`). Key function for price reading:
```solidity
function findBestPathFromAmountIn(
    address[] calldata route,
    uint128 amountIn
) external view returns (Quote memory quote)
// Quote includes: route, pairs, binSteps, versions, fees, amounts
```

**SDK option:** `@traderjoe-xyz/sdk-v2` at version `^3.0.30` (MEDIUM confidence — npm search). Provides TypeScript types for `PairV2`, bin step calculations, and path routing. However, for a price-read-only arbitrage scanner, direct ABI calls to `LBQuoter` are sufficient and avoid the dependency.

**Recommended approach (no SDK for price reads):**
Use the `LBQuoter.findBestPathFromAmountIn()` via ethers ABI. This is the same approach already used for UniV3 QuoterV2 calls. Add the LBQuoter ABI as a constant in the TypeScript codebase.

Install SDK only if bin-step math is needed for swap calldata construction beyond what LBRouter ABI provides:
```bash
pnpm add @traderjoe-xyz/sdk-v2  # Install only if needed
```

**Solidity adapter needed:** New `TraderJoeV2Adapter.sol` in `contracts/src/adapters/`. The LBRouter V2.1 swap interface:
```solidity
function swapExactTokensForTokens(
    uint256 amountIn,
    uint256 amountOutMin,
    ILBRouter.Path calldata path,  // tokenPath[], pairBinSteps[], versions[]
    address to,
    uint256 deadline
) external returns (uint256 amountOut)
```
The `Path` struct encodes bin steps and version flags. This differs meaningfully from UniV3/V2 adapters and requires a dedicated Solidity adapter.

### 2b. Ramses V2/V3 (ve(3,3) Concentrated Liquidity)

**What it is:** A Uniswap V3 fork with ve(3,3) tokenomics layered on top. The AMM swap interface is nearly identical to Uniswap V3. V3 removes proxies and improves gas efficiency vs V2. Ramses is Arbitrum-native and has meaningful liquidity on WETH/USDC, WETH/ARB, and RAM pairs.

**Key contracts on Arbitrum (HIGH confidence — from official Ramses docs):**

| Contract | Address | Notes |
|----------|---------|-------|
| V3 SwapRouter | `0x4730e03EB4a58A5e20244062D5f9A99bCf5770a6` | Use this for swaps |
| V3 Factory | `0xd0019e86edB35E1fedaaB03aED5c3c60f115d28b` | Pool discovery |
| V3 QuoterV2 | `0x00d4FeA3Dd90C4480992f9c7Ea13b8a6A8F7E124` | Price reads |
| V3 QuoterV1 | `0x0C20C6E42242DB7AF259CC40366A07B198f2C295` | Fallback quoter |
| UniversalRouter | `0x23B6EC50Fe0197FbE436717a0676BC07c54ba562` | Not needed for arb |
| V2 Legacy Router | `0x1614a7e1fe63960B4684867a62080acd2404757f` | V2 AMM (legacy) |

**Solidity adapter:** Because Ramses V3 is a Uniswap V3 fork with the same swap interface, the existing `UniswapV3Adapter.sol` can be reused with only the router address changed. Create a thin `RamsesV3Adapter.sol` that inherits or delegates to the V3 adapter pattern, parameterized with the Ramses router address. No new swap interface patterns needed.

**npm packages needed:** None. Direct ABI calls via ethers.js using the standard Uniswap V3 QuoterV2 ABI, pointed at Ramses QuoterV2 address `0x00d4FeA3Dd90C4480992f9c7Ea13b8a6A8F7E124`.

**Audit note:** Ramses underwent a Code4rena security audit in October 2024 (MEDIUM confidence — GitHub code4rena repo). Contracts are verified on Arbiscan.

### 2c. Zyberswap (Algebra Protocol Fork) — DEFERRED

**Status: LOW PRIORITY — Defer to v1.2**

Zyberswap is an Algebra Protocol concentrated liquidity fork (not Uniswap V3). Current on-chain activity: ~30 active addresses/day, ~$0.15 gas used/day (from DefiLlama data — LOW confidence, limited dataset). TVL is stagnant.

**Decision: Do not integrate in v1.1.** The arbitrage opportunity surface is too thin to justify the integration cost. Algebra Protocol has a meaningfully different swap interface (`IAlgebraRouter`) from Uniswap V3. The npm package `@cryptoalgebra/integral-sdk` exists but should not be installed until Zyberswap TVL exceeds $5M.

Revisit in v1.2 if TVL recovers.

---

## Feature 3: pm2 Process Management

**Purpose:** Replace manual `pnpm start` with supervised persistent process — auto-restart on crash, survive server reboots, structured log files, and a live monitor dashboard.

**Package:** `pm2`
**Version:** `6.0.14` (latest as of Feb 2026, MEDIUM confidence — npm search)

**Install globally on server (not as project dependency):**
```bash
npm install -g pm2
pm2 startup   # Run as root — generates systemd unit for auto-start on reboot
pm2 save      # Persist current process list
```

**Critical ESM compatibility detail (HIGH confidence — PM2 GitHub issue #5953):**

This project uses `"type": "module"` in `package.json`. PM2 loads ecosystem config via `require()` internally. An ecosystem file with `.js` extension will fail in ESM projects with "require() of ES Module not supported". The fix: name the config file `ecosystem.config.cjs`.

**Recommended `ecosystem.config.cjs`:**
```javascript
// ecosystem.config.cjs  <-- .cjs required for ESM projects
module.exports = {
  apps: [{
    name: 'flashloaner-bot',
    script: 'bot/src/run-arb-mainnet.ts',
    interpreter: 'node',
    interpreter_args: '--import tsx',   // tsx as ESM loader hook, not the interpreter
    // NOTE: Do NOT set interpreter to 'tsx' — breaks cluster mode and PM2 internals
    exec_mode: 'fork',                  // Singleton — bot maintains one RPC connection + nonce state
    instances: 1,                       // Never cluster: nonce conflicts, competing circuit breakers
    watch: false,                       // Never watch in production — causes restart loops
    max_memory_restart: '500M',         // Kill + restart if memory leaks past 500MB
    restart_delay: 5000,                // 5s delay between restarts (dampens crash loops)
    max_restarts: 10,                   // Stop trying after 10 restarts within exponential window
    log_file: 'logs/bot-combined.log',
    out_file: 'logs/bot-out.log',
    error_file: 'logs/bot-err.log',
    time: true,                         // Prefix each log line with timestamp
    env: {
      NODE_ENV: 'production',
    },
    env_dry_run: {
      NODE_ENV: 'production',
      DRY_RUN: 'true',
    },
  }]
};
```

**Key commands:**
```bash
pm2 start ecosystem.config.cjs                    # Live mode
pm2 start ecosystem.config.cjs --env dry_run      # Dry-run mode
pm2 stop flashloaner-bot
pm2 restart flashloaner-bot
pm2 logs flashloaner-bot --lines 100
pm2 monit                                          # Real-time CPU/memory/log dashboard
pm2 save                                           # Persist after config changes
```

**Why pm2 over raw systemd:** PM2 provides log aggregation, memory-based restart, and `pm2 monit` live dashboard with zero additional config. A systemd unit file provides durability but requires separate logrotate config and journald for log access. For a solo-operator bot, pm2 is the right level of complexity.

**Why `fork` not `cluster` mode:** The bot is a singleton — it maintains a single WebSocket RPC connection, a single nonce counter managed by `ExecutionEngine`, and a circuit breaker that gates all submissions. Cluster mode spawns competing instances that would conflict on nonce management and circuit breaker state.

---

## Feature 4: P&L Dashboard with Trade History

### Storage Layer

**Package:** `better-sqlite3`
**Version:** `^12.6.2` (latest, MEDIUM confidence — npm search)
**Types:** `@types/better-sqlite3`

```bash
pnpm add better-sqlite3
pnpm add -D @types/better-sqlite3
```

**Why better-sqlite3 over alternatives:**
- **vs. Postgres:** Requires a separate database process, connection management, and backup strategy. Unnecessary for a single-server bot with sequential trade execution.
- **vs. TypeORM:** Adds 500+ lines of decorator-based configuration for 2-3 tables. Direct SQL with better-sqlite3 is more transparent and performant for the query patterns here (insert on trade, read for periodic reports).
- **vs. Node.js native SQLite (v22):** Still experimental as of early 2025, requires a `--experimental-sqlite` flag. better-sqlite3 is stable, synchronous, and ships prebuilt binaries.
- **vs. async sqlite3:** better-sqlite3 is synchronous, which suits the bot's event-loop model — no async database operations blocking the critical path.

**Schema (no ORM — define as constants in TypeScript):**
```sql
CREATE TABLE IF NOT EXISTS trades (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  tx_hash           TEXT UNIQUE,
  timestamp         INTEGER NOT NULL,
  block_number      INTEGER,
  token_in          TEXT,
  token_out         TEXT,
  flash_loan_amount TEXT,       -- bigint as string
  gross_profit_wei  TEXT,
  gas_cost_wei      TEXT,
  net_profit_wei    TEXT,
  net_profit_eth    REAL,       -- float for aggregation queries
  status            TEXT,       -- 'confirmed' | 'reverted' | 'failed'
  dex_buy           TEXT,
  dex_sell          TEXT,
  fee_tier_buy      INTEGER,
  fee_tier_sell     INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at       INTEGER,
  stopped_at       INTEGER,
  opportunities    INTEGER DEFAULT 0,
  trades_executed  INTEGER DEFAULT 0,
  total_profit_eth REAL DEFAULT 0.0
);
```

### Dashboard Display

**Recommendation: Extend the existing `reporting.ts` console output pattern.** Do NOT add a TUI library (blessed/ink) for v1.1.

**Rationale for no TUI library:**
- `blessed-contrib` was last published 4 years ago. It is effectively abandoned. No TypeScript support, no ESM support.
- `ink` (React-based TUI) is actively maintained and TypeScript-first, but requires React as a dependency — significant overhead for what amounts to a 40-line formatted table.
- The existing `reporting.ts` produces clean, structured console output. pm2's `pm2 logs` and `pm2 monit` already provide real-time monitoring.
- Log files produced by pm2 are trivially parseable by any external tool.

**What to add to `reporting.ts`:**
1. `formatPnLSummary(trades: TradeRecord[]): string` — prints a trade history table with ANSI color codes (green for profit, red for loss), cumulative totals, and per-session stats.
2. A periodic interval in the main bot loop (every 5 minutes) that queries the SQLite DB and calls `formatPnLSummary`.
3. A `--report` CLI flag in `run-arb-mainnet.ts` that prints the last N trades and exits (useful for checking from a separate terminal without stopping the bot).

**If a live TUI is explicitly required in a later milestone:** Use `ink` v5 (React-based, TypeScript-first, actively maintained). Do not use `blessed`.

---

## Feature 5: Live Flash Loan Execution

**What changes:** Switch `ExecutionEngine` from `dryRun: true` to `dryRun: false`. Wire a real `ethers.Wallet` signer.

**New npm packages needed: None.**

Everything required is already in the codebase:
- `ExecutionEngine` has live execution logic (`sendTransaction`, confirmation waiting, pre-flight `eth_call` simulation, revert parsing)
- `TransactionBuilder` encodes real ABI calldata for `FlashloanExecutor.executeArbitrage()`
- `ExecutionSigner` interface accepts any ethers.js v6 `Signer`
- `CircuitBreaker`, `ProfitValidator`, consecutive failure pausing are all implemented

**What IS needed (configuration, not packages):**

1. **Wallet instantiation from env (already in ethers.js v6):**
   ```typescript
   import { Wallet, JsonRpcProvider } from "ethers";
   const provider = new JsonRpcProvider(process.env.RPC_URL);
   const wallet = new Wallet(process.env.PRIVATE_KEY!, provider);
   // Pass wallet to ExecutionEngine as the signer
   ```

2. **Environment variables to add (not new packages):**
   ```bash
   PRIVATE_KEY=<hot wallet private key>           # Never commit
   FLASHLOAN_EXECUTOR_ADDRESS=<deployed address>  # From deployment
   DRY_RUN=false                                  # Toggle
   ```

3. **One-time on-chain setup (admin transactions, not code):**
   - Call `FlashloanExecutor.approveAdapter(traderJoeAdapterAddress)` for each new adapter
   - Call `FlashloanExecutor.approveAdapter(ramsesAdapterAddress)`
   - These are admin calls from the deployer wallet, executed once after contract deployment

4. **Profit withdrawal script:** Implement as a standalone `scripts/withdraw-profit.ts` that calls `FlashloanExecutor.withdrawProfit(token, to, amount)`. Run manually, not from the bot loop.

**Safety layers already in place (do not duplicate):**
- Pre-flight `eth_call` simulation in `ExecutionEngine.simulateTransaction()` — catches reverts before spending gas
- `ProfitValidator` in `FlashloanExecutor` — on-chain profit floor enforcement
- `CircuitBreaker` — pauses contract on-chain if circuit trips
- `maxConsecutiveFailures` + engine pause in `ExecutionEngine` — off-chain circuit breaker
- Gas estimation with L1 data fee component via `ArbitrumGasEstimator`

**No hardware wallet package needed** for initial live run. A hot wallet with a limited WETH balance (5-10 ETH) and no other assets is the appropriate v1.1 setup. If hardware wallet support is added later, use `@ethersproject/hardware-wallets` (ethers.js ecosystem, no new paradigm).

---

## Complete Installation Summary

### New Production Dependencies

```bash
pnpm add better-sqlite3
```

### New Dev Dependencies

```bash
pnpm add -D @types/better-sqlite3
```

### Optional (install only if LB bin-step math is needed beyond ABI calls)

```bash
pnpm add @traderjoe-xyz/sdk-v2   # Only if LBQuoter ABI calls prove insufficient
```

### Global (server setup — not project deps)

```bash
npm install -g pm2
pm2 startup   # Run as root — enables auto-start on server reboot
```

### Not needed (explicitly rejected)

| Package | Reason Rejected |
|---------|----------------|
| `@uniswap/smart-order-router` | 150+ transitive deps; overkill for fixed 22-pool scanner |
| `@cryptoalgebra/integral-sdk` | Zyberswap integration deferred; TVL too low |
| `blessed-contrib` | Abandoned 4 years ago; no TypeScript/ESM support |
| TypeORM | Unnecessary ORM overhead for 2-3 SQLite tables |
| `@types/pm2` | pm2 v6 ships its own TypeScript definitions |

---

## Contract Addresses Reference (Arbitrum One, chainId: 42161)

### Already in codebase (`bot/src/config/chains/arbitrum.ts`)

| Protocol | Contract | Address |
|----------|----------|---------|
| Uniswap V3 | Factory | `0x1F98431c8aD98523631AE4a59f267346ea31F984` |
| Uniswap V3 | SwapRouter02 | `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45` |
| Uniswap V3 | QuoterV2 | `0x61fFE014bA17989E743c5F6cB21bF9697530B21e` |
| Aave V3 | Pool | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` |
| Balancer V2 | Vault | `0xBA12222222228d8Ba445958a75a0704d566BF2C8` |
| SushiSwap V2 | Router | `0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506` |
| SushiSwap V3 | Factory | `0x1af415a1EbA07a4986a52B6f2e7dE7003D82231e` |

### New — Add to `arbitrum.ts` dexes section

| Protocol | Contract | Address | Confidence |
|----------|----------|---------|-----------|
| Trader Joe V2.1 | LBRouter | `0xb4315e873dbcf96ffd0acd8ea43f689d8c20fb30` | HIGH — Arbiscan |
| Trader Joe V2.1 | LBFactory | `0x8e42f2F4101563bF679975178e880FD87d3eFd4e` | HIGH — Arbiscan |
| Ramses V3 | SwapRouter | `0x4730e03EB4a58A5e20244062D5f9A99bCf5770a6` | HIGH — Ramses docs |
| Ramses V3 | Factory | `0xd0019e86edB35E1fedaaB03aED5c3c60f115d28b` | HIGH — Ramses docs |
| Ramses V3 | QuoterV2 | `0x00d4FeA3Dd90C4480992f9c7Ea13b8a6A8F7E124` | HIGH — Ramses docs |

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Uniswap V3 cross-fee-tier routing (no new packages) | HIGH | Codebase analysis — feeTier already wired |
| Trader Joe LBRouter/LBFactory addresses | HIGH | Verified on Arbiscan |
| Ramses V3 contract addresses | HIGH | Official Ramses docs |
| pm2 v6 + tsx integration pattern | MEDIUM | PM2 GitHub issue #5953 + futurestud.io tutorial |
| pm2 ESM `.cjs` requirement | HIGH | GitHub issue confirmed, multiple sources agree |
| better-sqlite3 v12.6.2 | MEDIUM | npm search |
| @traderjoe-xyz/sdk-v2 v3.0.30 | MEDIUM | npm search |
| Zyberswap activity/TVL | LOW | DefiLlama limited data; hard to confirm current state |
| Live execution (no new packages needed) | HIGH | Full codebase review — ExecutionEngine already complete |

---

## Sources

- [Uniswap V3 Arbitrum Deployments — Official](https://docs.uniswap.org/contracts/v3/reference/deployments/arbitrum-deployments) — HIGH
- [Trader Joe LBRouter v2.1 — Arbiscan](https://arbiscan.io/address/0xb4315e873dbcf96ffd0acd8ea43f689d8c20fb30) — HIGH
- [Trader Joe LBFactory v2.1 — Arbiscan](https://arbiscan.io/address/0x8e42f2F4101563bF679975178e880FD87d3eFd4e) — HIGH
- [joe-v2 GitHub — LBQuoter.sol](https://github.com/traderjoe-xyz/joe-v2/blob/main/src/LBQuoter.sol) — HIGH
- [Ramses Exchange Docs — Contract Addresses](https://docs.ramses.exchange/pages/contract-addresses) — HIGH
- [Ramses Code4rena Audit Oct 2024](https://github.com/code-423n4/2024-10-ramses-exchange) — MEDIUM
- [@traderjoe-xyz/sdk-v2 npm](https://www.npmjs.com/package/@traderjoe-xyz/sdk-v2) — MEDIUM
- [PM2 with tsx — futurestud.io](https://futurestud.io/tutorials/pm2-use-tsx-to-start-your-app) — MEDIUM
- [PM2 ESM config issue — GitHub #5953](https://github.com/Unitech/pm2/issues/5953) — HIGH
- [PM2 Ecosystem File Reference](https://pm2.io/docs/runtime/reference/ecosystem-file/) — HIGH
- [better-sqlite3 npm](https://www.npmjs.com/package/better-sqlite3) — MEDIUM
- [Zyberswap — DefiLlama](https://defillama.com/protocol/zyberswap) — LOW
