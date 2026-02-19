# Phase 4: Testnet Validation - Research

**Researched:** 2026-02-17
**Domain:** Long-running process stability, live testnet opportunity detection, eth_call simulation verification, test suite regression prevention
**Confidence:** HIGH (all findings verified against project source code; standard Vitest/ethers.js patterns confirmed against Context7 official docs)

---

## Summary

Phase 4 validates the fully-assembled Arbitrum Sepolia bot against the live testnet. This is primarily an **operational validation phase**, not an implementation phase. The codebase completed Phase 3 at 5/5 success criteria: `run-arb-sepolia.ts` is wired, two real pool addresses are populated with confirmed liquidity, ArbitrumGasEstimator is injected, and all 735 tests pass.

The four requirements (TEST-01 through TEST-04) split into two categories:

1. **Live-run validation** (TEST-01, TEST-02, TEST-03): Must be executed against the live Arbitrum Sepolia RPC. These cannot be fully automated in unit tests because they require a real RPC endpoint and real on-chain state. The validation strategy is: run `pnpm bot:arb-sepolia` with a QuickNode RPC, observe logs for at least 1 hour, and capture structured evidence.

2. **Regression prevention** (TEST-04): Must ensure all 735 existing tests still pass after any changes made during Phase 4 troubleshooting. This is a standard CI gate, already satisfied by Phase 3, but must be verified again after any Phase 4 code changes.

The key unknowns entering Phase 4 are: (a) whether the testnet pools have enough price variance to trigger the 0.01% delta threshold, (b) whether NodeInterface's `gasEstimateComponents` returns non-zero values on Arbitrum Sepolia (testnet L1 data fees may be near-zero since the testnet does not post to Ethereum mainnet), and (c) whether `eth_call` simulation against the deployed `FlashloanExecutor` at `0x5c0Ecf6DBB806a636121f0a3f670E4f7aC13A667` behaves correctly on Sepolia.

**Primary recommendation:** Structure Phase 4 as two sequential plans — (1) a live bot run for TEST-01/02/03 with a structured log-capture checklist, and (2) a regression test run for TEST-04 — and define a delta-threshold lowering fallback if no organic opportunity is detected within the run window.

---

## Standard Stack

### Core (Already in Use — No New Packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **ethers.js** | v6 (`^6`) | `JsonRpcProvider`, `provider.call()` for eth_call simulation | Already in `package.json`; v6 `provider.call()` throws `CallExceptionError` on revert |
| **tsx** | `^4.21.0` | Run TypeScript entry point without compile step | Already in use; `node --import tsx bot/src/run-arb-sepolia.ts` |
| **Vitest** | `^4.0.18` | Run TypeScript test suite | Already in `package.json`; command is `pnpm test` |
| **Foundry (forge)** | latest | Run Solidity test suite | Already configured; command is `forge test` |
| **dotenv** | `^17.3.1` | Load `.env` into `process.env` before RPC URL read | Already imported first in `run-arb-sepolia.ts` |

### Supporting (For Validation Evidence Capture)

| Tool | Purpose | When to Use |
|------|---------|-------------|
| **Terminal tee or script** | Capture bot stdout/stderr to a log file for evidence | During live run; `pnpm bot:arb-sepolia 2>&1 \| tee /tmp/arb-sepolia-run.log` |
| **grep / jq** | Parse log file to count events after run | Post-run evidence extraction |
| **Arbiscan Sepolia** | Verify pool activity, check liquidity | During pool health pre-check |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual 1-hour live run | Automated test with mock RPC + time advancement | Mock cannot test real RPC stability, real price reads, or real NodeInterface behavior. Manual run is the right call. |
| Lowering `deltaThresholdPercent` to force detections | Adding a third pool with a known price offset | Third pool approach requires on-chain pool creation; threshold lowering is simpler and reversible |

**Installation:** No new packages required for Phase 4.

---

## Architecture Patterns

### Bot Start Sequence (What Must Work End-to-End)

```
Environment:
  .env or shell: RPC_URL=<QuickNode Arbitrum Sepolia endpoint>

Command:
  set -a && source .env && set +a  # Required pattern from memory
  pnpm bot:arb-sepolia

Startup Flow:
  run-arb-sepolia.ts
    └── import "dotenv/config"         (loads .env)
    └── loadChainConfig(421614)        (reads ARBITRUM_SEPOLIA_CONFIG)
    └── new FlashloanBot({...chain})   (constructs PriceMonitor + OpportunityDetector)
    └── bot.detector.setGasEstimator() (injects ArbitrumGasEstimator)
    └── bot.start()                    (starts setInterval at 1000ms)
         └── PriceMonitor.poll()       (every 1s)
              └── fetchV3Price(0.3%-pool)   (slot0() RPC call)
              └── fetchV3Price(1%-pool)     (slot0() RPC call)
              └── detectOpportunities()     (compare prices, emit if delta >= 0.01%)
                   └── OpportunityDetector.analyzeDeltaAsync()
                        └── estimateArbitrumGas() via NodeInterface 0xC8
                        └── emit "opportunityFound" or "opportunityRejected"
```

### eth_call Simulation Pattern (TEST-03)

The `ExecutionEngine.simulateTransaction()` method already implements `eth_call` simulation via `this.signer.call()`. In ethers.js v6, `provider.call(tx)` is the standard way to simulate:

```typescript
// Source: https://docs.ethers.org/v6/single-page
// provider.call() throws CallExceptionError when the call reverts
// The error has: error.revert (with name, args, signature) and error.data (raw revert bytes)

try {
  const result = await provider.call({
    to: "0x5c0Ecf6DBB806a636121f0a3f670E4f7aC13A667", // FlashloanExecutor on Arb Sepolia
    data: "0x...", // encoded flashloan calldata
  });
  // result is "0x" or return data — simulation succeeded
} catch (err) {
  // err is CallExceptionError
  // err.revert = { name: "InsufficientProfit", args: [...], signature: "..." }
  // err.data = "0x..." (raw revert bytes for manual parsing)
  // err.reason = human-readable string (when available)
}
```

For Phase 4 validation of TEST-03, the goal is to confirm that `provider.call()` correctly:
1. Returns without throwing when called against a valid target with valid (but no-op) calldata
2. Throws `CallExceptionError` with a decodable revert reason when called with calldata that would revert

The existing `ExecutionEngine.simulateTransaction()` already uses this pattern. TEST-03 validation requires a manual test calling the deployed `FlashloanExecutor` with deliberate bad calldata to confirm the error propagation works.

### Long-Run Stability Pattern (TEST-01)

The bot's error handling architecture for stability:

```typescript
// PriceMonitor: maxRetries=3 before marking pool stale
// If a pool fails 3 consecutive times → emit "stale" → OpportunityDetector ignores it

// run-arb-sepolia.ts wires error handlers:
bot.monitor.on("error", (err: Error, pool) => {
  stats.errors++;
  console.error(`[${ts()}] [ERROR] Pool ${pool.label}: ${err.message}`);
  // Does NOT rethrow — bot continues running
});

bot.detector.on("error", (err: unknown) => {
  stats.errors++;
  console.error(`[${ts()}] [ERROR] Detector: ...`);
  // Does NOT rethrow — bot continues running
});

// main() wraps everything in .catch() → exits only on fatal startup error
main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
```

**What "1+ hours without crashes" means:**
- No unhandled promise rejections
- No uncaught exceptions
- `process.exit()` not called (except SIGINT/SIGTERM)
- Stats counter `errors` may be non-zero (recoverable errors are logged, not fatal)
- The setInterval keeps firing; the bot keeps polling

**Potential stability risks to watch for:**
- Memory leak from `snapshots` Map growing unboundedly (LOW risk — only 2 pools, Map stays small)
- Provider connection reset after idle period (MEDIUM risk — JsonRpcProvider doesn't auto-reconnect; network hiccups will show as `[ERROR]` events but should not crash)
- NodeInterface call failing consistently (LOW risk — fallback returns `{ gasCost: 0 }` and logs warning, does not throw)

### Opportunity Detection Pattern (TEST-02)

The two configured pools are WETH/USDC on the same DEX (Uniswap V3) at different fee tiers (0.3% and 1%). On Arbitrum Sepolia:

- These pools have real but sparse liquidity
- Price differences between fee tiers occur due to different swap costs and liquidity distributions
- The `deltaThresholdPercent` is `0.01` (very low — 0.01% spread triggers detection)
- `minProfitThreshold` is `0.0001 ETH`

**If no organic opportunity is detected in 1 hour:**
The fallback strategy is to temporarily lower `deltaThresholdPercent` to `0.001` (0.001% = essentially any price difference between the two pools). This is configurable in `arbitrum-sepolia.ts`. Any measurable price difference between the 0.3% and 1% pools should trigger detection.

**What a successful detection looks like in the logs:**
```
[TIMESTAMP] [OPPORTUNITY] ================================
  Path:       WETH/USDC-0.3%-UniV3-ArbSepolia → WETH/USDC-1%-UniV3-ArbSepolia
  Input:      1 ETH
  Gross:      0.00XXXXXX ETH
  Gas (L2):   0.0000XXXX ETH
  L1 data fee:0.0000XXXX ETH   (or absent if NodeInterface returns 0 on testnet)
  Flash fee:  0.00000050 ETH
  Slippage:   0.00000500 ETH
  Total cost: 0.0000XXXX ETH
  Net profit: 0.000XXXXX ETH (X.XXXX%)
  Block:      XXXXXXX
  [REPORT-ONLY] No transaction sent
================================================
```

### Test Suite Regression Prevention (TEST-04)

Current test counts from Phase 3 final state:
- Solidity: 312 tests (12 test files; `forge test` passes clean)
- TypeScript: 423 tests (19 test files; `pnpm test` passes clean)
- Total: 735 tests

**Commands:**
```bash
# Run ALL Solidity tests (from project root)
forge test

# Run ALL TypeScript tests
pnpm test

# Run with verbose output for diagnosis
forge test -vvv
pnpm test -- --reporter=verbose
```

**Key risk for TEST-04:** If Phase 4 troubleshooting requires changing `arbitrum-sepolia.ts`, `OpportunityDetector.ts`, or pool configs, those 18 chain-config tests and 9 gas estimator tests must still pass.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| **Long-run stability testing** | Custom health check daemon | The bot's existing error handlers + `stats.errors` counter | Bot already handles errors non-fatally; stability is validated by observing it |
| **eth_call simulation** | Custom HTTP RPC wrapper for eth_call | `provider.call(tx)` from ethers.js v6 | Already implements the JSON-RPC `eth_call` method; throws `CallExceptionError` with structured revert data |
| **Opportunity forcing** | Deploy mock price manipulator contract | Lower `deltaThresholdPercent` to near-zero | Simpler, reversible, no new contract deployment needed |
| **Log persistence** | Custom logging library | `tee` command or shell redirect | Standard Unix tools; no new dependencies |
| **Duration measurement** | Custom timer | The bot's `stats.startTime` + `logStats()` every 60s | Already built in; uptime logged as `uptime=Xm Ys` |

**Key insight:** Phase 4 is validation, not construction. The bot and test infrastructure are already in place. The planner should avoid inventing new implementation tasks.

---

## Common Pitfalls

### Pitfall 1: RPC URL Not Visible to forge (Env Loading)

**What goes wrong:** `forge test --fork-url $MAINNET_RPC_URL` fails with "could not connect" or `$MAINNET_RPC_URL` evaluates to empty string.

**Why it happens:** The memory note explicitly documents this: `source .env` alone does not export variables to child processes. Must use `set -a && source .env && set +a`.

**How to avoid:** Always use `set -a && source .env && set +a` before any forge or pnpm command that needs env vars. The `pnpm bot:arb-sepolia` script uses `dotenv/config` inside the process, so it reads `.env` automatically. Only `forge` commands need the shell export.

**Warning signs:** `forge test` completes with "skipped" fork tests, or `RPC_URL` is empty in `run-arb-sepolia.ts` startup header.

---

### Pitfall 2: NodeInterface Returns Near-Zero L1 Gas on Arbitrum Sepolia

**What goes wrong:** `ArbitrumGasEstimator.ts` calls `gasEstimateComponents` on NodeInterface. The result shows `l1Gas: 0n` and `l1BaseFeeEstimate: 0n`. The `L1 data fee:` line does not appear in opportunity reports (it's conditional on `l1DataFee > 0`).

**Why it happens:** Arbitrum Sepolia does not post calldata to Ethereum Sepolia L1 (or does so with near-zero L1 fees due to the test environment). The NodeInterface may return `gasEstimateForL1: 0` on testnet.

**How to avoid:** This is expected behavior, not a bug. The bot's fallback in `run-arb-sepolia.ts` catches NodeInterface failures and falls back to `{ gasCost: 0 }`. If `l1Gas` is 0, the `gasComponentsToEth()` calculation returns `l1CostEth: 0`, and `estimateCostsWithL1()` uses `l1DataFee: 0` (which is `> 0` false, so the line is hidden).

**For TEST-03 validation:** The eth_call simulation test does NOT depend on L1 gas values. TEST-03 is about whether `provider.call()` correctly simulates FlashloanExecutor calls and returns/reverts correctly — independent of gas estimation.

**Warning signs:** Opportunity report shows no `L1 data fee:` line. This is acceptable if `gasEstimateForL1` is 0 on testnet.

---

### Pitfall 3: Testnet Pool Liquidity May Drain or Change

**What goes wrong:** The WETH/USDC 0.3% pool had liquidity `45752273629` and the 1% pool had `3225673603183` at discovery time (2026-02-17). On a testnet, these values can change dramatically. If liquidity drops to 0, `slot0()` still works but price may be stale/invalid.

**Why it happens:** Testnet pools are managed by test deployers who can add/remove liquidity at any time. There is no economic incentive to maintain liquidity.

**How to avoid:** At the start of the 1-hour run, verify pool liquidity with:
```bash
cast call 0x66EEAB70aC52459Dd74C6AD50D578Ef76a441bbf "liquidity()(uint128)" --rpc-url $RPC_URL
cast call 0x3eCedaB7E9479E29B694d8590dc34e0Ce6059868 "liquidity()(uint128)" --rpc-url $RPC_URL
```
If either returns `0`, the pool has no liquidity. Consider using the 0.05% pool (`0x6F112d524DC998381C09b4e53C7e5e2cc260f877`) as a fallback — even its low liquidity (122 at discovery) is sufficient for price comparison.

**Warning signs:** `[ERROR] Pool WETH/USDC-0.3%-UniV3-ArbSepolia: ...` errors on every poll, OR bot shows `priceUpdates=0` after several minutes.

---

### Pitfall 4: Unhandled Promise Rejection Crashes the Bot

**What goes wrong:** A promise rejection from an unexpected path (not caught by the error handlers) surfaces as `UnhandledPromiseRejection`, which crashes the Node.js process by default since Node.js 15+.

**Why it happens:** The `analyzeDeltaAsync()` path wraps in `.catch()` correctly:
```typescript
void this.analyzeDeltaAsync(delta).catch((err) => {
  this.emit("error", toError(err));
});
```
But if an error occurs outside this path (e.g., in the `setInterval` callback itself), it may escape. The `bot.stop()` in `run-arb-sepolia.ts` is also called via `process.on("SIGINT")` with `() => void shutdown()` — correctly handling the async rejection.

**How to avoid:** Node.js has a global `uncaughtException` and `unhandledRejection` handler. If the bot crashes with `UnhandledPromiseRejection` during the test run, add:
```typescript
process.on("unhandledRejection", (reason, promise) => {
  console.error("[FATAL] Unhandled rejection:", reason);
  // Log but don't exit — or exit(1) to fail fast
});
```
This is a diagnostic tool, not a fix.

**Warning signs:** Process exits with non-zero code without SIGINT/SIGTERM. Log shows `UnhandledPromiseRejectionWarning`.

---

### Pitfall 5: Arbitrum Sepolia RPC Rate Limits

**What goes wrong:** QuickNode free tier may rate-limit requests. The bot polls every 1 second, making 2 `slot0()` calls and 1 `getBlockNumber()` call per pool per cycle = ~5 RPC calls/second. At 1 hour = 3600 seconds, that's ~18,000 calls.

**Why it happens:** 5 calls/second × 3600s = 18,000 calls/hour. QuickNode free tier allows ~50 requests/second but has daily caps.

**How to avoid:** QuickNode was selected (per memory) specifically because it supports the trace API on Arbitrum. The free tier should be sufficient for 18,000 calls. Monitor for `429 Too Many Requests` errors in the log. If rate limiting occurs, increase `pollIntervalMs` to `2_000` (2s) which halves the call rate.

**Warning signs:** Log shows `[ERROR] Pool ...: 429` or `rate limit exceeded`. Stats show `errors` incrementing rapidly.

---

### Pitfall 6: The "1 Hour" Requirement Interpretation

**What goes wrong:** The test is considered failed if ANY error appears in the log. But the bot is designed to tolerate transient errors — a `[ERROR]` line from a single failed RPC call does not constitute a crash.

**Correct interpretation:**
- TEST-01 PASSES if: bot process stays alive for 1+ hours, no `process.exit()` except clean shutdown, no `UnhandledPromiseRejection`
- TEST-01 FAILS if: process crashes, exits unexpectedly, or shows a pattern of cascading errors that indicates systemic failure

**Warning signs vs failures:**
- `[ERROR] Pool X: timeout` — WARNING (transient, bot recovers)
- `[STALE] Pool marked stale: X` — WARNING (pool is excluded from detection, bot continues)
- `Fatal error: ...` followed by process exit — FAILURE
- `errors=500` in stats with `priceUpdates=0` — FAILURE (bot is running but all polls failing)

---

## Code Examples

### Pre-Run Checklist Commands

Before starting the 1-hour test run:

```bash
# 1. Verify pools have liquidity
cast call 0x66EEAB70aC52459Dd74C6AD50D578Ef76a441bbf \
  "liquidity()(uint128)" --rpc-url $RPC_URL

cast call 0x3eCedaB7E9479E29B694d8590dc34e0Ce6059868 \
  "liquidity()(uint128)" --rpc-url $RPC_URL

# 2. Verify FlashloanExecutor is deployed and responds
cast call 0x5c0Ecf6DBB806a636121f0a3f670E4f7aC13A667 \
  "owner()(address)" --rpc-url $RPC_URL

# 3. Verify NodeInterface responds on Arbitrum Sepolia
cast call 0x00000000000000000000000000000000000000C8 \
  "gasEstimateComponents(address,bool,bytes)(uint64,uint64,uint256,uint256)" \
  0x5c0Ecf6DBB806a636121f0a3f670E4f7aC13A667 false 0x \
  --rpc-url $RPC_URL

# 4. Check current slot0 on each pool (confirms price reading works)
cast call 0x66EEAB70aC52459Dd74C6AD50D578Ef76a441bbf \
  "slot0()(uint160,int24,uint16,uint16,uint16,uint8,bool)" --rpc-url $RPC_URL
```

### Start the Bot with Log Capture

```bash
# Load env vars in a way forge and subprocesses can see them
set -a && source .env && set +a

# Run with log capture (1+ hour)
pnpm bot:arb-sepolia 2>&1 | tee /tmp/arb-sepolia-$(date +%Y%m%d-%H%M%S).log
```

### Post-Run Evidence Extraction

```bash
LOG=/tmp/arb-sepolia-<timestamp>.log

# Count price update events
grep -c "\[PRICE\]" $LOG

# Count opportunity detections
grep -c "\[OPPORTUNITY\]" $LOG

# Count rejections
grep -c "\[REJECTED\]" $LOG

# Count errors
grep -c "\[ERROR\]" $LOG

# Show final stats line
grep "\[STATS\]" $LOG | tail -5

# Check for crashes
grep -E "(Fatal error|UnhandledPromise|process exited)" $LOG
```

### eth_call Simulation Test (TEST-03 Manual Verification)

```typescript
// Verify eth_call works on Arbitrum Sepolia against the deployed FlashloanExecutor
// Run this as a one-off script or add to the pre-run checklist

import { JsonRpcProvider } from "ethers";

const provider = new JsonRpcProvider(process.env.RPC_URL);
const EXECUTOR = "0x5c0Ecf6DBB806a636121f0a3f670E4f7aC13A667";

// Test 1: Call with no data (should revert with function selector error)
try {
  await provider.call({ to: EXECUTOR, data: "0x" });
  console.log("Unexpected success on empty calldata");
} catch (err: any) {
  // Expected: CallExceptionError
  console.log("Expected revert caught:", err.code, err.reason ?? "no reason");
  // SUCCESS: eth_call simulation is working
}

// Test 2: Call owner() — should succeed (view function)
const ownerData = "0x8da5cb5b"; // keccak256("owner()")[:4]
const result = await provider.call({ to: EXECUTOR, data: ownerData });
console.log("owner() result:", result);
// SUCCESS if result is a 32-byte padded address
```

### Test Suite Regression Check

```bash
# Run all Solidity tests
forge test

# Run all TypeScript tests
pnpm test

# Run TypeScript tests with verbose reporter
pnpm test -- --reporter=verbose

# Run specific test files relevant to Phase 3 changes
pnpm test -- --run bot/__tests__/gas/ArbitrumGasEstimator.test.ts
pnpm test -- --run bot/__tests__/config/chain-config.test.ts
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-chain bots with hardcoded Ethereum config | **Chain config system + loadChainConfig(chainId)** | Phase 2 | Multi-chain without code duplication; current |
| L2-only gas estimation | **NodeInterface gasEstimateComponents (L1+L2 dual breakdown)** | Phase 3 | Accurate Arbitrum cost model; without this, profitability calcs are wrong by 20x |
| Manual transaction simulation | **eth_call via provider.call() with CallExceptionError handling** | ethers.js v6 standard | Structured error with `revert.name`, `revert.args`, `revert.signature` |
| Flashbots MEV protection | **FCFS sequencer (mode: "none" on Arbitrum)** | Arbitrum-specific | Correct; Flashbots does not operate on Arbitrum L2 |
| 12s polling (Ethereum block time) | **1s polling (Arbitrum has 0.25s blocks)** | Phase 3 | 12x more price reads; bot config uses 1s |

**Deprecated/outdated for this context:**
- `@arbitrum/sdk` for NodeInterface access: Raw ethers.js `Contract` is preferred (no ethers v5/v6 version conflict; already implemented in `ArbitrumGasEstimator.ts`)
- `FlashloanBot.fromEnv()` for Arbitrum Sepolia: `run-arb-sepolia.ts` uses direct constructor with `loadChainConfig(421614)`; `fromEnv()` is kept for mainnet-style deployment only

---

## Open Questions

### 1. Does NodeInterface Return Non-Zero L1 Gas on Arbitrum Sepolia?

**What we know:** On mainnet, L1 data fees are ~95% of total cost. The NodeInterface at `0xC8` is available on all Arbitrum chains including Sepolia.

**What's unclear:** Whether Arbitrum Sepolia charges real L1 fees for the test run. Testnet sequencers may batch calldata to the Sepolia L1 with near-zero cost (since Sepolia ETH is free).

**Recommendation:** Run the pre-check cast command above to query `gasEstimateComponents` directly. If `gasEstimateForL1` is 0, document this as expected testnet behavior. The TEST-03 requirement is about `eth_call` simulation correctness, not about L1 gas amounts — so this does not block TEST-03.

**Priority:** LOW — informational; does not block any requirement.

---

### 2. Will Organic Price Differences Exist Between the Two Pools?

**What we know:** The 0.3% pool had liquidity 45B units and the 1% pool had 3.2T units at discovery. Different fee tiers create slightly different prices because fee impact changes the effective exchange rate.

**What's unclear:** Whether these testnet pools have active trading that keeps prices aligned or diverged. On testnets, price differences between fee tiers can be large (nobody arbitrages them) or zero (nobody trades them).

**Recommendation:** The `deltaThresholdPercent: 0.01` (0.01%) is already very low. If no opportunity is detected after 15 minutes, the plan should include a step to lower it to `0.001` and observe the next 15 minutes. This is a configuration change in `arbitrum-sepolia.ts` monitor config, not a code change.

**Priority:** MEDIUM — affects TEST-02 strategy; plan should include fallback threshold adjustment step.

---

### 3. Does `provider.call()` Support eth_call State Overrides on Arbitrum Sepolia?

**What we know:** ethers.js v6 `provider.call()` supports optional state override parameter (EIP-1193 extension) for simulating with modified on-chain state. This is an advanced simulation technique.

**What's unclear:** Whether QuickNode Arbitrum Sepolia nodes support state overrides (`eth_call` with a state override object).

**Recommendation:** TEST-03 does not require state overrides — it only requires that basic eth_call succeeds and reverts are caught. Skip state overrides for Phase 4.

**Priority:** LOW — out of scope for Phase 4.

---

### 4. What is the Current Block Range of Arbitrum Sepolia?

**What we know:** Contracts were deployed at block `10280917` on 2026-02-17. Arbitrum Sepolia has 0.25s block time.

**What's unclear:** The current block number at time of Phase 4 execution, and whether the RPC endpoint has been reset or re-initialized.

**Recommendation:** The `cast block --rpc-url $RPC_URL` command or the bot's first startup log (`block=XXXXXXX` in price updates) will show the current block. No action needed.

**Priority:** LOW — informational only.

---

## Phase 4 Task Structure Recommendation

Based on the requirements and research, the planner should structure Phase 4 into two plans:

**Plan 04-01: Live Bot Run (TEST-01, TEST-02, TEST-03)**

Steps:
1. Pre-run environment check (RPC_URL set, test commands pass)
2. Pre-run pool liquidity verification (cast call)
3. Pre-run eth_call simulation smoke test (TEST-03 manual verification)
4. Start 1-hour bot run with log capture
5. Monitor for opportunity detection; if none after 15min, lower delta threshold
6. After 1 hour: extract evidence from log (grep counts)
7. Document results in a structured verification note

**Plan 04-02: Regression Test Gate (TEST-04)**

Steps:
1. Run `forge test` — must show 312 passing, 0 failing
2. Run `pnpm test` — must show 423 passing, 0 failing
3. If any Phase 4 code changes were made (e.g., threshold adjustment): verify changes don't break existing tests
4. Document results

---

## Sources

### Primary (HIGH confidence)

- **Project source code** — `bot/src/run-arb-sepolia.ts`, `bot/src/config/chains/arbitrum-sepolia.ts`, `bot/src/config/chains/pools/arbitrum-sepolia.ts`, `bot/src/gas/ArbitrumGasEstimator.ts`, `bot/src/detector/OpportunityDetector.ts`, `bot/src/monitor/PriceMonitor.ts`, `bot/src/engine/ExecutionEngine.ts` — all read directly
- **Phase 3 Verification Report** — `.planning/phases/03-bot-adaptation/03-VERIFICATION.md` — confirmed 5/5 criteria, 735 passing tests, 3 human verification items pending
- **Context7: ethers.js v6 docs** (`/websites/ethers_v6`) — confirmed `provider.call()` throws `CallExceptionError` with structured `revert.name/args/signature`; `interface.parseError()` decodes custom errors
- **`deployments/421614.json`** — confirms FlashloanExecutor at `0x5c0Ecf6DBB806a636121f0a3f670E4f7aC13A667`, block 10280917
- **Project memory** — `set -a && source .env && set +a` required for forge env vars; QuickNode selected as primary RPC; 735 total tests (312 Solidity + 423 TypeScript)

### Secondary (MEDIUM confidence)

- **Phase 3 Research** — `.planning/phases/03-bot-adaptation/03-RESEARCH.md` — Pitfall 2 (gas estimation on testnet) and pool discovery details carry forward
- **Arbitrum docs** (https://docs.arbitrum.io/build-decentralized-apps/how-to-estimate-gas) — NodeInterface at 0xC8 available on all Arbitrum chains including Sepolia

### Tertiary (LOW confidence)

- **NodeInterface L1 gas behavior on Arbitrum Sepolia** — Cannot be verified without live RPC; assumed near-zero based on testnet economics, but unconfirmed until the pre-run cast command is executed
- **Testnet pool liquidity stability** — Pools had real liquidity at Phase 3 discovery, but testnet liquidity is inherently ephemeral; LOW confidence it's unchanged at Phase 4 execution time

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — Same stack as Phase 3, no new packages
- Architecture: **HIGH** — All modules read directly; error handling paths traced explicitly
- eth_call simulation: **HIGH** — ethers.js v6 docs confirmed via Context7
- Live-run stability risks: **HIGH** — Derived from reading actual error handlers and event emitter wiring
- Opportunity detection likelihood: **MEDIUM** — Depends on testnet pool behavior; fallback threshold strategy documented
- NodeInterface testnet L1 fees: **LOW** — Unverifiable without live RPC; marked as expected unknown

**Research date:** 2026-02-17
**Valid until:** 60 days (ethers.js v6 API is stable; Arbitrum Sepolia addresses are permanent; testnet pool liquidity may change)

**Phase 3 inputs consumed:**
- `run-arb-sepolia.ts` — complete, wired ✅
- `ArbitrumGasEstimator.ts` — complete, injected ✅
- `pools/arbitrum-sepolia.ts` — 2 real pool addresses ✅
- `arbitrum-sepolia.ts` (chain config) — real WETH + USDC, no placeholders ✅
- All 735 tests passing ✅
- 5 contracts deployed to Arbitrum Sepolia ✅

**What Phase 4 does NOT need to implement:**
- No new contracts
- No new TypeScript modules
- No new test files (unless Phase 4 adds a smoke-test script, which is optional)
- No changes to OpportunityDetector, PriceMonitor, or gas estimation logic
- The bot is ready to run; Phase 4 is validation only
