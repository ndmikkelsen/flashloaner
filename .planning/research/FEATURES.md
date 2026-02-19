# Feature Landscape: v1.1 Mainnet Profitability

**Domain:** DeFi Flashloan Arbitrage Bot — Arbitrum Mainnet Profitability
**Milestone:** v1.1 — Adding mainnet profitability features to existing bot
**Researched:** 2026-02-19
**Confidence:** MEDIUM-HIGH (contract interfaces verified; some profitability estimates LOW confidence)

> **Note:** This replaces the Phase 1 FEATURES.md for milestone v1.1 planning. The six features below are scoped specifically to achieving 24+ hour net-positive P&L on Arbitrum mainnet. The existing bot already has price monitoring (22 pools), opportunity detection, dry-run reporting, ExecutionEngine, TransactionBuilder, and deployed FlashloanExecutor (not yet wired to bot).

---

## Current Profitability Problem

The existing bot sees spreads of 0.01–1.68% but all fail after costs. Root cause: same fee-tier pairs create a cost floor problem.

**Example:** WETH/USDC UniV3 0.05% vs 0.3%
- Spread captured: 0.25%
- Swap fees paid: 0.05% (buy) + 0.3% (sell) = 0.35%
- Net before gas: -0.10% (always a loss)

The fix requires crossing fee tiers, adding DEXs with asymmetric fees, and optimizing trade size to find sizes where gross profit exceeds total cost.

---

## Table Stakes

Features the bot *must* have to achieve net-positive P&L. Missing any = cannot profitably execute.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Cross-fee-tier routing** | Current same-tier pairing has 0.35% minimum cost floor; must route buy-low-fee, sell-high-fee | Low-Medium | Infrastructure is already built (both 0.05% and 0.3% pools monitored); only need to remove the implicit same-tier pairing constraint in OpportunityDetector |
| **Live execution wiring** | Bot exists but does not submit transactions; monitoring without executing = zero revenue | Medium | TransactionBuilder and ExecutionEngine are fully built; need to wire: opportunity → builder → engine → signer → submit |
| **Optimal input sizing** | Fixed 10-unit defaultInputAmount is arbitrary; may miss profit peak or trade into own slippage | Medium | For V2 pools: closed-form formula exists. For V3: binary search over input space. Both leverage existing virtualReserveIn data |
| **P&L persistence** | ExecutionEngine.profitHistory lives in memory, wiped on restart; no accountability for sessions | Low-Medium | Write ProfitRecord to SQLite (or NDJSON append) on each confirmed trade; session totals on startup |
| **Process management (pm2)** | Without persistent process management, bot dies on SSH disconnect, requires manual restart | Low | pm2 ecosystem.config.js: start, auto-restart on crash, log rotation, env injection; 30-minute implementation |

## Differentiators

Features that provide meaningful competitive advantage but are not strictly required for first profitable trade.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Trader Joe V2.1 (LB) adapter** | Liquidity Book uses discrete bins not continuous curve; pricing model is different enough that arb bots ignoring it miss cross-DEX opportunities | High | Requires new bot-side price reader (getActiveId + getPriceFromId) AND new on-chain Solidity adapter; not a drop-in. WETH/USDC, WETH/USDT pools active on Arbitrum |
| **Ramses V2 CL adapter** | Ramses CL is a Uniswap V3 fork with same slot0 interface; adding it is low-marginal-effort but expands pool universe; RAM incentivized pools have thin liquidity = larger spreads | Low-Medium | Bot-side: same as UniV3 (slot0, liquidity calls); on-chain: same as UniswapV3Adapter; only change is router address and fee tier encoding |
| **Zyberswap adapter** | Low — Zyberswap has only 4 active pools and ~30 addresses/day; not worth dedicated adapter. Use monitoring effort for Ramses instead | Very Low | SKIP — low TVL, declining activity, insufficient liquidity for profitable arb |
| **Session stats dashboard (terminal)** | Real-time visibility into what's happening: trades/hour, win rate, total P&L, top pools; critical for tuning minProfitThreshold during first live days | Low | Extend existing reporting.ts with a 60-second periodic console summary; no external dependencies needed |

## Anti-Features

Explicitly do not build these in v1.1. They add complexity without fixing the profitability problem.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Web/HTTP dashboard** | Scope creep — a terminal dashboard does 80% of the job with 5% of the effort; HTTP server adds attack surface | Console stats every 60s via reporting.ts |
| **Zyberswap adapter** | 4 active pools, 30 tx/day, declining TVL; effort exceeds opportunity | Add Ramses V2 instead (same effort, better TVL) |
| **Triangle/cyclic arbitrage** | 3-hop paths mean paying 3× swap fees; on Arbitrum, fee structures rarely create profit after 3 hops; requires triangularPath already drafted but unused | Get 2-hop profitable first; add triangle only after proving consistent profit |
| **Cross-chain execution** | V1.1 is Arbitrum-only; adding Base or Optimism triples infrastructure complexity | Prove profitability on one chain first |
| **Historical data warehousing** | Dune Analytics covers this; building a local OLAP system is months of work | SQLite append-log is sufficient for v1.1 accountability |
| **Automated flashloan provider selection** | Balancer is 0% fee but sometimes has insufficient liquidity; adding runtime provider switching adds failure modes during the most critical period (first live trades) | Start with Aave V3 (0.05%, most reliable); optimize provider after profitable baseline established |

---

## Feature Details: Table Stakes

### 1. Cross-Fee-Tier Routing

**What it is:** Route the buy leg through a low-fee pool (0.05%) and the sell leg through a high-fee pool (0.3%), or vice versa. The spread between fee tiers on the same token pair is typically 0.1–0.25% on active pairs. Combined with same-DEX pools (e.g., UniV3 0.05% vs SushiV3 0.3%), the net direction of fees matters less than the price difference.

**How it works in production:** Monitor both fee tiers simultaneously (already done — WETH/USDC 0.05% and 0.3% are both in pool config). OpportunityDetector receives a PriceDelta event whenever any two pools for the same pair diverge. The fix is ensuring that cross-fee-tier pairs are not filtered out. Research indicates the 0.05% tier leads price discovery and the 0.3% tier lags — creating persistent 0.05–0.15% spreads that are profitable when routing buy→0.05%, sell→0.3%.

**Key insight from research:** Academic analysis shows the 0.05% pool tends to lead price discovery; the 0.3% pool follows with a lag. This is the most reliable spread source on Arbitrum.

**Complexity:** LOW. The bot-side monitoring already has both pools. The detector already compares any two pools sharing a token pair. The issue is likely in how the pool config groups pairs — confirm that `token0`/`token1` addresses match across fee tiers so PriceMonitor groups them together for delta computation.

**Dependency:** Existing PriceMonitor pool grouping logic.

---

### 2. Live Execution Wiring

**What it is:** Remove the dry-run gate so that when OpportunityDetector emits `opportunityFound` with netProfit > threshold, the bot builds a transaction (TransactionBuilder), estimates gas, submits via ExecutionEngine, and waits for confirmation.

**How it works in production arb bots:** The standard pattern is a single async handler:
```
opportunityFound → buildArbitrageTransaction → calculateGasSettings → prepareTransaction → executeTransaction
```
Between build and submit: check that the opportunity is still fresh (age < 2 blocks). If stale, discard. This is the "opportunity staleness" check — the most common bug in production bots that wastes gas on outdated opportunities.

**Complexity:** MEDIUM. The components exist: TransactionBuilder, ExecutionEngine, ArbitrumGasEstimator. What's missing is:
1. A signer (Wallet from private key or from env var)
2. Wiring the three components together in `run-arb-mainnet.ts`
3. A staleness check between detection and submission
4. The `executorAddress` for the deployed FlashloanExecutor contract

**Critical dependency:** FlashloanExecutor must have the UniV3Adapter and UniV2Adapter addresses approved. The contract's `approveAdapter()` or equivalent must be called by the deployer wallet before any execution will succeed.

**Risk:** First live transaction will likely revert due to slippage underestimation. Expect 3–5 reverts before thresholds are tuned. The ExecutionEngine circuit breaker (5 consecutive failures → pause) protects against runaway revert spending.

---

### 3. Optimal Input Sizing

**What it is:** Instead of using a fixed `defaultInputAmount = 10` (10 ETH, which is too large for most pools), compute the trade size that maximizes net profit given each specific pool's liquidity depth.

**How it works in production:** For two constant-product (V2) pools:

The closed-form optimal input for two pools with reserves (r0_in, r0_out) and (r1_in, r1_out) and fees f0, f1:

```
amountIn_optimal = sqrt(r0_in * r1_out * (1-f0) * (1-f1)) - r0_in
                   ─────────────────────────────────────────────────
                              ( 1 + fee adjustment )
```

This is a concave profit function — profit peaks at one input size. Under-sizing leaves money on the table; over-sizing eats into slippage until profitable.

For V3 pools, the virtual reserve approach in the existing code (computeVirtualReserveIn using L/sqrtP) enables a binary search over input sizes. The OpportunityDetector already computes virtualReserveIn for slippage estimation — the same data powers optimal sizing.

**Practical range:** On Arbitrum, active WETH/USDC pools have virtual reserves of 50–500 WETH equivalent. Optimal input for 0.3% spread is typically 0.5–5 ETH (not 10). This significantly changes profitability calculations.

**Complexity:** MEDIUM. Three implementation paths:
- V2 pools: closed-form formula (LOW complexity, straightforward math)
- V3 pools: binary search over [0.01, maxReserve/10] (MEDIUM complexity)
- Fallback: if no reserve data, use 1 ETH as default (LOW)

**Dependency:** Existing virtualReserveIn computation in OpportunityDetector. No new contracts needed — this is pure off-chain math.

---

### 4. P&L Persistence

**What it is:** Persist every trade outcome (profit, gas, txHash, timestamp) to disk so that session restarts don't lose accounting. Display cumulative P&L at startup and on shutdown.

**How it works in production bots:** Two common approaches:
- **NDJSON append log** (`trades.ndjson`): One JSON object per line, append-only. Zero dependencies, grep-able, backupable. Readable by any tool.
- **SQLite**: Query-able, handles volume, requires `better-sqlite3` dependency.

For v1.1, NDJSON is simpler and sufficient. The ExecutionEngine already emits `profit` events with ProfitRecord objects. A listener writes each record to disk.

**Data per trade:**
```json
{"ts":1708000000,"txHash":"0x...","token":"0xWETH","flashLoanAmount":"5000000000000000000","gasCostWei":"1234567","profitable":true,"blockNumber":12345678,"path":"UniV3 0.05% -> SushiV3 0.3%","netProfit":"0.003"}
```

**Session summary on startup:** Read the last N records, sum profits, compute win rate, display.

**Complexity:** LOW. ~100 lines of code. No new dependencies if using NDJSON. The `profit` event already fires from ExecutionEngine; just write to file.

---

### 5. Process Management (pm2)

**What it is:** Use pm2 to run the bot as a persistent background process that:
- Auto-restarts on crash
- Rotates logs (prevents disk fill)
- Injects environment variables from `.env`
- Provides `pm2 logs flashloaner` and `pm2 monit` for monitoring

**How it works in production:** Standard `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [{
    name: 'flashloaner',
    script: 'bot/src/run-arb-mainnet.ts',
    interpreter: 'tsx',
    env_production: { NODE_ENV: 'production' },
    max_restarts: 10,
    min_uptime: '30s',
    log_file: 'logs/combined.log',
    error_file: 'logs/error.log',
    time: true,
  }]
}
```

**Complexity:** LOW. ~1 hour including testing. The main gotcha is that pm2 doesn't source `.env` files by default — use `env_production` block or `dotenv` in the startup script.

**Dependency:** `pnpm add -D pm2`. No other changes required.

---

## Feature Details: Differentiators

### Trader Joe V2.1 (Liquidity Book) Adapter

**How Liquidity Book works:** Unlike Uniswap V3's continuous price curve, LB organizes liquidity into discrete bins. Each bin covers a price range of `binStep` basis points. The active bin is the one currently trading. Price is derived from the bin ID: `price = (1 + binStep/10000)^(activeId - 2^23)`.

**Interface for monitoring (bot-side):**
```solidity
// LBPair interface (key functions only)
function getActiveId() external view returns (uint24 activeId);
function getPriceFromId(uint24 id) external pure returns (uint256 price); // 128.128 fixed point
function getReserves() external view returns (uint128 reserveX, uint128 reserveY);
```

**Contract addresses on Arbitrum One (MEDIUM confidence — verified from Arbiscan):**
- LBFactory V2.1: `0x8e42f2F4101563bF679975178e880FD87d3eFd4e`
- LBRouter V2.1: `0xb4315e873dbcf96ffd0acd8ea43f689d8c20fb30`

**Price conversion:** The LB price is a 128.128 fixed-point number (multiply by 1e18, divide by 2^128 to get decimal). This requires different price normalization than the sqrtPriceX96 used by V3.

**On-chain adapter requirement:** A new `LiquidityBookAdapter.sol` implementing IDEXAdapter is needed. The LBRouter's swap function signature differs from Uniswap — it uses `swapExactTokensForTokens` with a `path` param that encodes bin steps.

**Complexity:** HIGH (two-part):
- Bot-side PriceMonitor extension: MEDIUM (new `lbpair` pool type with custom price normalization)
- On-chain Solidity adapter: MEDIUM-HIGH (different interface, needs careful testing against mainnet fork)

**When to build:** After cross-fee-tier routing and live execution are proven profitable. LB adds pool universe but the implementation cost is significant.

---

### Ramses V2 CL Adapter

**How Ramses CL works:** Ramses V2 is a ve(3,3) DEX with concentrated liquidity. The CL pools use a `slot0()` function returning `(sqrtPriceX96, tick, ...)` — identical to Uniswap V3. The difference is the router address and pool factory.

**Interface for monitoring (bot-side):** Identical to existing Uniswap V3 code. The PriceMonitor already reads `slot0()` and `liquidity()` from V3 pools. Adding a new `ramses_v3` pool type requires only passing a different pool address — the ABI is the same.

**Pool discovery:** GeckoTerminal Ramses pools page lists active pools with addresses. Top WETH pairs have moderate liquidity.

**On-chain adapter requirement:** A `RamsesV2Adapter.sol` that routes through Ramses's router. The swap interface may differ from UniswapV3's `exactInputSingle` — needs verification against the Ramses router ABI on Arbiscan.

**Complexity:** LOW-MEDIUM. Bot-side is trivially adding new pool definitions with `dex: "ramses_v3"`. On-chain adapter needs the Ramses router address and its swap function signature.

**Confidence:** MEDIUM. Documentation doesn't expose technical details; contract compatibility with UniV3 router confirmed by community sources but not official docs.

---

### Zyberswap — EXPLICITLY SKIPPED

**Decision: Do not build.** Research shows: 4 active pools, 30 addresses/day, 38 tx/day, declining activity. The effort to build a Zyberswap adapter (new bot-side pool type + on-chain adapter) exceeds the opportunity. Ramses V2 has significantly better TVL and pool diversity for the same implementation effort.

---

## Feature Dependencies

```
Live Execution Wiring
  └── requires: deployed FlashloanExecutor address
  └── requires: adapters approved via approveAdapter()
  └── requires: wallet signer with ETH for gas
  └── enables: P&L Persistence (profit events fire on real trades)

Cross-Fee-Tier Routing
  └── requires: same token pair must be grouped by PriceMonitor
  └── enables: profitable 2-hop paths (current blocker)
  └── unlocks: optimal input sizing to be meaningful

Optimal Input Sizing
  └── requires: virtualReserveIn data (already computed in OpportunityDetector)
  └── enhances: all existing pool pairs
  └── improves: net profit per trade

P&L Persistence
  └── requires: live execution wiring (profit events need real trades)
  └── enables: session stats dashboard

Process Management (pm2)
  └── requires: bot runs without crashing (live execution must be stable)
  └── enables: 24-hour unattended operation

Trader Joe V2.1 Adapter
  └── requires: stable live execution
  └── requires: new Solidity adapter (LiquidityBookAdapter.sol)
  └── requires: bot-side lbpair pool type in PriceMonitor

Ramses V2 Adapter
  └── requires: stable live execution
  └── requires: new Solidity adapter (RamsesV2Adapter.sol)
  └── bot-side: minimal changes (same ABI as UniV3)
```

---

## Complexity Summary

| Feature | Category | Complexity | Bot-Side | On-Chain | Timeline |
|---------|----------|------------|----------|----------|----------|
| Cross-fee-tier routing | Table Stakes | LOW | Pool grouping check | None | 0.5–1 day |
| Live execution wiring | Table Stakes | MEDIUM | Signer + wiring + staleness check | None | 1–2 days |
| Optimal input sizing | Table Stakes | MEDIUM | Binary search / formula | None | 1–2 days |
| P&L persistence | Table Stakes | LOW | NDJSON writer + reader | None | 0.5 day |
| pm2 process management | Table Stakes | LOW | ecosystem.config.js | None | 0.5 day |
| Ramses V2 adapter | Differentiator | LOW-MEDIUM | New pool type (same ABI) | New adapter | 1–2 days |
| Trader Joe V2.1 (LB) | Differentiator | HIGH | Custom price normalization | New adapter | 3–5 days |

---

## Priority Ordering

Build in this sequence. Each step is a prerequisite for the next:

**Phase A: Enable Profitability (must do first)**
1. Cross-fee-tier routing — fixes the cost-floor blocker; zero revenue possible without this
2. Optimal input sizing — ensures trades are sized for the pool, not arbitrary 10-unit default
3. Live execution wiring — submits real transactions; until here, bot makes zero money

**Phase B: Operations (run reliably for 24 hours)**
4. P&L persistence — know if you're profitable after first 24 hours
5. pm2 process management — bot must survive overnight unattended

**Phase C: Expand Pool Universe (after profitable baseline)**
6. Ramses V2 adapter — low effort, adds pool universe
7. Trader Joe V2.1 adapter — highest effort, most novel opportunity

---

## Expected Behavior by Feature

### Cross-Fee-Tier (post-fix behavior)
- Bot monitors 22 pools across all fee tiers for the same pairs
- When 0.05% WETH/USDC lags behind 0.3% by > 0.15%, `opportunity` event fires
- OpportunityDetector confirms gross profit > (Aave 0.05% fee + gas + slippage)
- Net positive opportunities expected: 2–10 per hour on active pairs

### Live Execution (first-day behavior)
- Expect 50–70% success rate initially (slippage underestimation, stale prices)
- Circuit breaker will fire after 5 consecutive reverts — this is correct behavior
- First successful trade confirms the pipeline end-to-end
- Tune `minProfitThreshold` upward after first day to reduce revert rate

### Optimal Input Sizing (expected impact)
- Current: fixed 10 ETH input; most pools have 50–200 ETH virtual reserve
- After fix: optimal input ~0.5–3 ETH for typical pool depth
- Expected outcome: more opportunities pass profitability threshold (smaller trades have lower price impact)
- May increase trade frequency 2–3x

### P&L Persistence (first session)
- Trade log written to `logs/trades.ndjson`
- On startup: "Session 1: 0 trades | Lifetime: 0.0 ETH profit"
- After 24 hours: "Session 1: 47 trades | Win rate: 72% | Net: +0.0082 ETH"

### pm2 (operational behavior)
- `pm2 start ecosystem.config.js --env production`
- `pm2 logs flashloaner` — tail logs from any terminal
- Auto-restart on crash within 30 seconds
- Log files in `logs/` directory with timestamp prefix

---

## Realistic Profitability Assessment

Based on existing bot data (spreads 0.01–1.68%, current cost floor 0.35%):

| Scenario | Input | Expected Spread After Fix | Net Margin | Trade Frequency | Daily Estimate |
|----------|-------|--------------------------|------------|-----------------|----------------|
| Conservative | 1 ETH optimal | 0.15–0.25% | 0.05–0.10% | 10–20/day | $0.50–$2.00 |
| Base case | 2 ETH optimal | 0.20–0.40% | 0.10–0.20% | 20–40/day | $4–$16 |
| Optimistic | 3 ETH optimal | 0.30–0.50% | 0.15–0.25% | 30–60/day | $9–$30 |

**Note:** These are LOW confidence estimates. Actual profitability depends on:
- Whether cross-fee-tier spreads exist consistently (vs. being arbitraged away by other bots)
- Gas costs on execution day
- Revert rate (affects net P&L significantly)

The critical validation is the first 24-hour live session. Use that data to calibrate all future estimates.

---

## Sources

- [Uniswap V3 Fee Tiers and Price Discovery — Wiley Journal of Futures Markets](https://onlinelibrary.wiley.com/doi/10.1002/fut.22593?af=R)
- [GitHub: UniswapV3 Flash Swap Arbitrage between 0.05% and 0.3% fee pools](https://github.com/Aboudoc/UniswapV3-FlashSwap-Arbitrage)
- [Trader Joe LBPair.sol source — lfj-gg/joe-v2](https://github.com/traderjoe-xyz/joe-v2/blob/main/src/LBPair.sol)
- [Trader Joe LBRouter V2.1 on Arbitrum — Arbiscan](https://arbiscan.io/address/0xb4315e873dbcf96ffd0acd8ea43f689d8c20fb30)
- [Trader Joe LB Factory on Arbitrum — Arbiscan](https://arbiscan.io/address/0x8e42f2F4101563bF679975178e880FD87d3eFd4e)
- [Ramses Exchange Concentrated Liquidity — Medium](https://medium.com/@RAMSES_Exchange/ramses-concentrated-liquidity-the-future-of-liquidity-provisioning-73c08a3e7f25)
- [Ramses CL Documentation](https://docs.ramses.exchange/pages/concentrated-liquidity)
- [Ramses Top Pools — GeckoTerminal](https://www.geckoterminal.com/arbitrum/ramses/pools)
- [Zyberswap — DefiLlama](https://defillama.com/protocol/zyberswap)
- [Profit Maximization In Arbitrage Loops — arXiv 2024](https://arxiv.org/html/2406.16600v1)
- [PM2 Ecosystem File Documentation](https://pm2.keymetrics.io/docs/usage/application-declaration/)
- [AMM Arbitrage Strategy — Hummingbot](https://hummingbot.org/strategies/amm-arbitrage/)
