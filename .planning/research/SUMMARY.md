# Project Research Summary

**Project:** Flashloaner v1.1 — Mainnet Profitability
**Domain:** DeFi Flashloan Arbitrage Bot (Arbitrum One)
**Researched:** 2026-02-19
**Confidence:** MEDIUM-HIGH

## Executive Summary

The v1.1 milestone transitions an existing dry-run arbitrage bot into a live, net-positive trading system on Arbitrum mainnet. The existing codebase is more complete than expected: TransactionBuilder, ExecutionEngine, ArbitrumGasEstimator, CircuitBreaker, and FlashloanExecutor are all implemented but not wired together. Cross-fee-tier routing — the single most important profitability unlock — requires zero code changes, only pool configuration additions. The 0.05% Uniswap V3 fee tier leads price discovery while the 0.3% tier lags, creating persistent 0.05-0.15% spreads that become profitable when the cost floor drops from 0.60% (same-tier) to 0.35% (cross-tier). The recommended approach is: fix the cost floor first via configuration, add optimal input sizing to right-size trades, then wire live execution — in that order, because accurate profit estimation must precede spending real gas.

Stack additions are minimal: `better-sqlite3` as the sole new production dependency, `pm2` installed globally for process supervision. No new SDKs needed — Trader Joe and Ramses integration uses direct ABI calls via ethers.js v6, matching the existing pattern. Zyberswap is unanimously deferred across all research files (4 active pools, 30 addresses/day, declining TVL). The key architectural insight is that every v1.1 feature integrates through existing seams: `DEXProtocol` union type for new DEXes, `defaultInputAmount` hook for optimal sizing, `wireEvents()` for live execution, and `HealthMonitor` for P&L tracking. No new architectural patterns are needed.

The dominant risks are the dry-run-to-live profitability gap (simulated profits overstate real profits by 2-3x due to price staleness, gas underestimation, and revert costs) and the Ramses ve(3,3) fee manipulation risk (documented insider zero-fee arbitrage). Mitigation: shadow-mode validation before live execution, canary trades at small size, and a 2x minimum profit threshold on all Ramses opportunities. Trader Joe's Liquidity Book variable fee model is a secondary risk — fees spike dynamically with volatility, making fixed-fee arbitrage math unreliable without a 50% fee buffer.

## Key Findings

### Recommended Stack

The existing stack (ethers.js v6, TypeScript, Foundry, Vitest) is validated and unchanged. Only two additions are needed, both well-justified.

**New production dependency:**
- `better-sqlite3` (^12.6.2): P&L persistence and trade history — synchronous API suits the bot's event-loop model; no ORM overhead for 2 tables

**Global server tool:**
- `pm2` (6.x): Process supervision — auto-restart, log rotation, `pm2 monit` dashboard; must use `ecosystem.config.cjs` (not `.js`) due to ESM project

**Explicitly rejected:**
- `@uniswap/smart-order-router` — 150+ transitive deps; overkill for a fixed 22-pool scanner
- `@cryptoalgebra/integral-sdk` — Zyberswap deferred; TVL too low
- `blessed-contrib` — abandoned 4 years; no TypeScript/ESM support
- TypeORM — unnecessary abstraction for 2-3 SQLite tables
- `@traderjoe-xyz/sdk-v2` — only install if LBQuoter ABI calls prove insufficient for bin-step math

**ESM compatibility note (HIGH confidence):** PM2 loads ecosystem config via `require()`. An `.js` extension fails in ESM projects. The config MUST be named `ecosystem.config.cjs`. The bot runs via `node --import tsx`, not `tsx` as interpreter (breaks PM2 cluster internals).

### Expected Features

**Must have (table stakes) — cannot be profitable without these:**
- **Cross-fee-tier routing** — fixes the 0.60% cost floor blocker; reduces to 0.35%; pure config change (LOW complexity)
- **Optimal input sizing** — replaces fixed 5-10 ETH default with pool-depth-aware sizing; typical optimal is 0.5-3 ETH (MEDIUM complexity)
- **Live execution wiring** — connects existing TransactionBuilder + ExecutionEngine to FlashloanBot; components exist, just need plumbing (MEDIUM complexity)
- **P&L persistence** — trade history survives restarts; three-bucket accounting (gross profit, gas costs, revert costs) (LOW-MEDIUM complexity)
- **pm2 process management** — bot must survive overnight unattended; auto-restart on crash (LOW complexity)

**Should have (differentiators) — expand opportunity surface after baseline profitability:**
- **Ramses V2 adapter** — UniV3 fork, near-identical ABI; low marginal effort to add; BUT flagged for fee manipulation risk (LOW-MEDIUM complexity)
- **Trader Joe V2.1 LB adapter** — novel bin-based AMM; different price model, variable fees; highest implementation cost of all features (HIGH complexity)

**Defer (v1.2+):**
- Zyberswap adapter — 4 active pools, 30 addresses/day, declining activity; all 4 research files agree: skip
- Triangle/cyclic arbitrage — 3-hop paths pay 3x fees; prove 2-hop profitable first
- Web/HTTP dashboard — console + pm2 logs sufficient for solo operator
- Cross-chain execution — prove profitability on one chain before tripling infrastructure
- Automated flash loan provider selection — start with Aave V3 (0.05%, most reliable)

### Architecture Approach

The existing pipeline (PriceMonitor -> OpportunityDetector -> FlashloanBot) needs extension, not replacement. Every v1.1 feature plugs into a documented integration seam. The `DEXProtocol` union type is the primary seam for new DEXes. The `defaultInputAmount` in `OpportunityDetector.analyzeDelta()` is the hook for optimal sizing. `FlashloanBot.wireEvents()` is where live execution connects. All new modules (InputOptimizer, PnLDashboard) are additive — no existing interfaces change.

**Major components (new for v1.1):**
1. **InputOptimizer** (`bot/src/optimizer/`) — ternary search over input amount space using existing `virtualReserveIn` data; pure off-chain math, no RPC calls in hot path
2. **PnLDashboard** (`bot/src/dashboard/`) — JSONL append-only persistence at `.data/trades.jsonl` for v1.1; SQLite upgrade path via `better-sqlite3` when query complexity warrants it
3. **TraderJoeLBAdapter.sol** (`contracts/src/adapters/`) — new Solidity adapter for bin-based Liquidity Book swap routing via `ILBRouter.swapExactTokensForTokens()`
4. **RamsesV2Adapter.sol** (`contracts/src/adapters/`) — thin adapter reusing UniswapV3Adapter pattern with Ramses router address
5. **ecosystem.config.cjs** (root) — pm2 process config, fork mode, 500MB memory restart limit, 10s graceful shutdown

**Key architectural constraint:** Bot is a singleton process. Never cluster mode (nonce conflicts, competing circuit breakers). Fork mode only.

### Critical Pitfalls

All four research files converge on these as the highest-impact risks:

1. **Dry-run-to-live profitability gap (L1)** — Simulated profits overstate real profits by 2-3x. Price moves 100-300ms between detection and execution on Arbitrum's 250ms blocks. Prevention: shadow mode before live; lock gas price at simulation time; $5 canary trades first; abort if detection-to-execution > 200ms.

2. **Cross-fee-tier thin pool slippage (L2)** — Multi-hop paths through thin intermediate pools multiply slippage. A pool with $10M TVL but $50K in the active tick range has $50K effective liquidity. Prevention: enforce minimum liquidity per leg, not just end-to-end; per-leg slippage simulation; path complexity penalty (2x min profit for 2-hop).

3. **Trader Joe LB variable fee surprise (L3)** — Liquidity Book fees are dynamic: base fee PLUS volatility accumulator. Fees can spike 3-5x during volatile periods. Prevention: 50% fee buffer on all LFJ quotes; higher minimum profit threshold (0.8% vs 0.6%); do NOT share fee logic with UniV3 adapter.

4. **Ramses ve(3,3) fee manipulation (L4)** — Documented insider zero-fee arbitrage on Ramses pools. External bots pay full fees while a privileged bot operates at 0%. Prevention: 2x minimum profit threshold on Ramses opportunities; on-chain fee event monitoring; read fee at execution time in on-chain contract; treat as LOW_CONFIDENCE tier.

5. **Nonce desync on process restart (L7)** — Crash during pending transaction corrupts nonce state. Prevention: persist last-submitted nonce + txHash to disk after every submission; on restart, wait for `nonce_pending == nonce_latest`; cancel stuck transactions with zero-value self-transfer.

### Consensus Decisions (All Research Files Agree)

- Zyberswap deferred to v1.2+ (insufficient TVL)
- No new SDKs for price reading; direct ABI calls via ethers.js v6
- Cross-fee-tier routing is configuration, not code
- TransactionBuilder + ExecutionEngine exist and are complete; wiring is the work
- pm2 ecosystem config must be `.cjs` for ESM compatibility
- Bot must remain singleton process (never cluster mode)
- Dry-run backward compatibility preserved for all features

### Tensions Between Research Files

| Topic | STACK/ARCHITECTURE say | FEATURES/PITFALLS say | Resolution |
|-------|----------------------|----------------------|------------|
| P&L storage | STACK: use `better-sqlite3` with SQL schema | ARCH/FEATURES: start with JSONL append-only | **Start JSONL, upgrade to SQLite when queries demand it.** Install `better-sqlite3` now but use JSONL for v1.1 launch. SQLite available for the `--report` CLI flag and structured queries. |
| Ramses integration priority | STACK: "low marginal effort, same ABI" | PITFALLS: "structural insider advantage, deprioritize" | **Build the adapter but gate with 2x profit threshold.** Monitor for fee manipulation. Accept it may prove non-viable. |
| Input optimizer algorithm | FEATURES: "binary search, MEDIUM complexity" | ARCH: "ternary search, pure math" | PITFALLS: "over-optimization causes race conditions, cap at 3 iterations" | **Ternary search with 3-iteration cap and 100ms timeout.** Fast-path fixed sizing as fallback. |
| Trader Joe integration timing | FEATURES: "after proven profitable baseline" | ARCH: "Phase 2 alongside Ramses" | **After live execution is stable.** LB's novel fee model (Pitfall L3) demands dedicated attention. Do not rush. |

## Implications for Roadmap

Based on combined research, the milestone should be structured in 6 phases. Cross-fee-tier routing and input sizing come first because they are prerequisites for profitable execution — without them, live execution burns gas on unprofitable trades.

### Phase 1: Cross-Fee-Tier Routing
**Rationale:** Fixes the single biggest profitability blocker. The bot currently has a 0.60% cost floor (same-fee-tier pairing). Cross-tier routing drops this to 0.35%. This is a pure configuration change with zero code risk.
**Delivers:** Expanded pool pair matrix with cross-fee-tier combinations; dry-run validation data showing narrower spreads.
**Addresses:** Cross-fee-tier routing (table stakes), pool config expansion.
**Avoids:** L2 (thin pool slippage) — validate per-leg liquidity depth on new pairs during dry-run.
**Complexity:** LOW (0.5-1 day). Configuration only.

### Phase 2: Optimal Input Sizing
**Rationale:** Must precede live execution. The current fixed 5-10 ETH default is wrong for most pools (optimal is 0.5-3 ETH). Over-sizing eats into slippage; under-sizing leaves money on the table. Accurate sizing makes profit estimates trustworthy before committing gas.
**Delivers:** InputOptimizer module with ternary search; pool-depth-aware trade sizing; better dry-run profit accuracy.
**Addresses:** Optimal input sizing (table stakes).
**Avoids:** L5 (race conditions from slow optimization) — enforce 3-iteration cap and 100ms timeout; fall back to conservative fixed size.
**Complexity:** MEDIUM (1-2 days). New module, pure math.

### Phase 3: Live Execution + Safety Validation
**Rationale:** This is the highest-risk phase and depends on Phases 1-2 for accurate profit estimation. Wire existing TransactionBuilder + ExecutionEngine into FlashloanBot. Run shadow mode first (simulate submission, log what would happen, do not broadcast). Then canary mode ($5 trades). Then full live.
**Delivers:** End-to-end live arbitrage execution; confirmed on-chain transactions; calibrated profitability thresholds.
**Addresses:** Live execution wiring (table stakes).
**Avoids:** L1 (dry-run-to-live gap) — shadow mode, canary trades, 200ms staleness abort; L7 (nonce desync) — persist nonce to disk; L8 (revert-MEV) — require 1.3x gas cost margin; L11 (circuit breaker calibration) — recalibrate for live revert rates.
**Complexity:** MEDIUM (2-3 days). Components exist; wiring + safety validation is the work.

### Phase 4: P&L Dashboard + Operations
**Rationale:** Cannot tune the bot without knowing if it is actually profitable. P&L persistence captures every trade outcome including revert costs. pm2 enables unattended 24-hour operation.
**Delivers:** Trade history in JSONL (upgrade path to SQLite); session summaries; `--report` CLI; pm2 ecosystem config; log rotation.
**Uses:** `better-sqlite3` (installed but JSONL primary for v1.1); `pm2` (global).
**Addresses:** P&L persistence (table stakes), pm2 process management (table stakes), session stats dashboard (differentiator).
**Avoids:** L6 (P&L attribution errors) — three-bucket accounting (gross profit, gas costs including L1 fee, revert costs); reconciliation test against wallet balance; L7 (nonce desync on pm2 restart) — disk-persisted nonce + startup health check.
**Complexity:** LOW-MEDIUM (2-3 days). Straightforward persistence + config.

### Phase 5: Ramses V2 Adapter
**Rationale:** Low-effort pool universe expansion. Ramses V3 is a Uniswap V3 fork with the same `slot0()` and `exactInputSingle()` ABI. On-chain adapter is ~20 lines reusing existing patterns. Bot-side adds ~5 lines to PriceMonitor switch branches. BUT gated with 2x profit threshold due to documented fee manipulation risk.
**Delivers:** Ramses V3 pool monitoring; RamsesV2Adapter.sol deployed; expanded opportunity surface.
**Addresses:** Ramses V2 CL adapter (differentiator).
**Avoids:** L4 (Ramses fee manipulation) — 2x minimum profit threshold; on-chain fee event monitoring; read fee at execution time; treat as LOW_CONFIDENCE tier.
**Complexity:** LOW-MEDIUM (1-2 days). Fork of existing V3 adapter.

### Phase 6: Trader Joe V2.1 LB Adapter
**Rationale:** Highest implementation cost but most novel opportunity source. Liquidity Book's bin-based AMM creates price patterns invisible to V3-only scanners. Must come last because LB's variable fee model (Pitfall L3) demands dedicated attention and the bot must be stable before adding complexity.
**Delivers:** TraderJoeLBAdapter.sol; LB price reading in PriceMonitor; bin-step path encoding in TransactionBuilder.
**Addresses:** Trader Joe V2.1 LB adapter (differentiator).
**Avoids:** L3 (variable fee surprise) — 50% fee buffer on all LFJ quotes; 0.8% minimum profit threshold (vs 0.6% standard); dedicated fee logic (do NOT reuse V3 fee logic).
**Complexity:** HIGH (3-5 days). Novel AMM model requires new price normalization (128.128 fixed-point), new ABI fragments, and thorough fork testing.
**Decision gate:** If implementation exceeds 5 days, cut from v1.1 and defer to v1.2.

### Phase Ordering Rationale

- **Phases 1-2 before Phase 3:** Accurate profit estimation must precede spending real gas. Cross-fee-tier routing and optimal sizing fix the two biggest sources of profit calculation error.
- **Phase 3 before Phase 4:** P&L tracking needs real trades to be meaningful. Dashboard without execution data is an empty shell.
- **Phase 4 before Phases 5-6:** Bot must be operationally stable (monitored, supervised, persistent) before adding new DEX complexity.
- **Phase 5 before Phase 6:** Ramses is low-effort (V3 fork) and validates the DEX adapter integration path. Trader Joe LB is high-effort with a novel fee model and should come last.
- **Parallelization:** Phase 2 (InputOptimizer) can be developed in parallel with Phase 1 (config). Phase 5 (Ramses) can overlap with Phase 4 (P&L) on the Solidity side while TypeScript P&L work proceeds.

### Research Flags

**Phases likely needing `/gsd:research-phase` during planning:**
- **Phase 3 (Live Execution):** Shadow mode implementation pattern, nonce persistence strategy, staleness abort threshold calibration. High risk phase with many interacting safety systems.
- **Phase 6 (Trader Joe LB):** LBPair bin math (128.128 fixed-point price from bin ID), `getSwapOut()` fee structure, pre-transfer token requirement. Novel AMM model with sparse documentation.

**Phases with standard patterns (skip research):**
- **Phase 1 (Cross-Fee-Tier Routing):** Pure pool configuration. No research needed.
- **Phase 2 (Input Optimizer):** Well-documented AMM optimal sizing math (arXiv 2024 paper cited in FEATURES.md).
- **Phase 4 (P&L + pm2):** Standard JSONL persistence pattern; pm2 ESM config already documented in STACK.md.
- **Phase 5 (Ramses):** V3 fork; same patterns as existing UniswapV3Adapter. Only research needed: verify Ramses router swap function signature matches UniV3 exactly.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing stack validated by codebase inspection; new deps (better-sqlite3, pm2) are well-established; contract addresses verified on Arbiscan |
| Features | MEDIUM-HIGH | Table stakes clearly identified; profitability estimates are LOW confidence (depend on live data); complexity estimates are reliable |
| Architecture | HIGH | All findings based on direct codebase inspection of specific files and line numbers; integration seams are documented and verified |
| Pitfalls | MEDIUM-HIGH | Critical pitfalls (L1-L4) backed by official docs, research papers, and community investigations; L4 (Ramses) based on forum thread, not official admission |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Profitability estimates:** The FEATURES.md conservative/base/optimistic daily profit estimates ($0.50-$30) are LOW confidence. The first 24-hour live session is the real calibration point. Do not plan economics around these numbers.
- **Ramses fee manipulation scope:** The Arbitrum Forum thread documents the allegation and Ramses' partial acknowledgment, but the current state of their dynamic fee system post-HyperEVM migration is unclear. Validate by monitoring on-chain fee events for 48 hours before enabling Ramses live execution.
- **Trader Joe LB on-chain swap path encoding:** The `ILBRouter.Path` struct encodes `binSteps[]` and `versions[]` — exact encoding format needs verification against deployed router ABI during Phase 6 planning.
- **Optimal input sizing accuracy in live conditions:** The ternary search uses snapshot reserve data (up to 3 seconds old). Whether this staleness is acceptable at Arbitrum's 250ms block time is unknown until live testing. May need to fall back to lookup-table approach described in PITFALLS.md.
- **Flash loan provider liquidity adequacy:** Aave V3 Arbitrum USDC pool size for flash loans vs. concurrent borrower demand is not quantified. Add pre-execution liquidity check (Pitfall L9) in Phase 3.

## Sources

### Primary (HIGH confidence)
- [Uniswap V3 Arbitrum Deployments — Official Docs](https://docs.uniswap.org/contracts/v3/reference/deployments/arbitrum-deployments)
- [Trader Joe LBRouter V2.1 — Arbiscan](https://arbiscan.io/address/0xb4315e873dbcf96ffd0acd8ea43f689d8c20fb30)
- [Ramses Exchange Docs — Contract Addresses](https://docs.ramses.exchange/pages/contract-addresses)
- [LBPair Developer Docs — LFJ](https://developers.lfj.gg/contracts/lbpair)
- [PM2 ESM config issue — GitHub #5953](https://github.com/Unitech/pm2/issues/5953)
- [Arbitrum Gas and Fees — Official Docs](https://docs.arbitrum.io/arbos/gas)
- [Aave V3 Flash Loan Docs](https://aave.com/docs/aave-v3/overview)
- Direct codebase inspection: PriceMonitor.ts, OpportunityDetector.ts, ExecutionEngine.ts, TransactionBuilder.ts, FlashloanBot, HealthMonitor.ts, run-arb-mainnet.ts, FlashloanExecutor.sol, UniswapV3Adapter.sol, IDEXAdapter.sol

### Secondary (MEDIUM confidence)
- [When Priority Fails: Revert-Based MEV on Fast-Finality Rollups (2025)](https://arxiv.org/html/2506.01462)
- [Profit Maximization In Arbitrage Loops — arXiv 2024](https://arxiv.org/html/2406.16600v1)
- [Ramses Fee Adjustment Controversy — Arbitrum Foundation Forum](https://forum.arbitrum.foundation/t/ramses-request-for-transparency-regarding-alleged-fee-adjustments-and-arbitrage-practices/26495)
- [Ramses Code4rena Audit Oct 2024](https://github.com/code-423n4/2024-10-ramses-exchange)
- [@traderjoe-xyz/sdk-v2 npm](https://www.npmjs.com/package/@traderjoe-xyz/sdk-v2)
- [better-sqlite3 npm](https://www.npmjs.com/package/better-sqlite3)

### Tertiary (LOW confidence)
- [Zyberswap — DefiLlama](https://defillama.com/protocol/zyberswap) — TVL data sparse; activity metrics approximate
- Profitability estimates in FEATURES.md — dependent on live market conditions

---
*Research completed: 2026-02-19*
*Ready for roadmap: yes*
