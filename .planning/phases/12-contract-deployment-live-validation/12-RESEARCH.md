# Phase 12: Contract Deployment & Live Validation - Research

**Researched:** 2026-02-25
**Domain:** Foundry deployment scripting, Arbitrum mainnet, shadow/live mode bot execution
**Confidence:** HIGH (primary sources: codebase inspection)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXEC-01 | Bot submits real transactions via FlashloanExecutor when profitable opportunities are detected (live mode) | Live mode is implemented in `bot/src/index.ts` (`mode === "live"` branch); TransactionBuilder, ExecutionEngine, and NonceManager all wired. Gaps: Camelot and Ramses adapters have zero-address fallbacks and no on-chain contracts deployed yet; `ADAPTER_RAMSES` env var is missing from `run-arb-mainnet.ts`. |
| EXEC-02 | Shadow mode validates profitability estimates against simulated execution results before enabling live trades | Shadow mode is implemented in `bot/src/index.ts` (`mode === "shadow"` branch) using `ExecutionEngine.simulateTransaction()` via `eth_call`. Gap: shadow mode logs estimated profit but does NOT log the simulated profit (what eth_call actually returns) — only pass/fail. The "within 10% match" criterion cannot be measured from logs alone. |
</phase_requirements>

---

## Summary

Phase 12 is the final milestone: deploy the FlashloanExecutor and DEX adapters to Arbitrum mainnet, validate the pipeline in shadow mode, then flip to live trading. The codebase is substantially complete for this phase — `Deploy.s.sol` is production-grade and handles all known adapters, `run-arb-mainnet.ts` is the correct entry point with three-mode switching (dry-run / shadow / live), and all safety systems (circuit breaker, staleness guard, nonce manager, trade store) are wired.

Three critical gaps exist that planning must address. First, Camelot V2 and Camelot V3 adapters exist in bot config and pool definitions (13 Camelot pools monitored) but no Solidity adapter contracts exist in `contracts/src/adapters/` — meaning those opportunities cannot be executed even in live mode. The bot currently zero-addresses them, which will silently fail if a Camelot opportunity is selected. Second, the `RamsesV2Adapter.sol` exists in contracts but is not in `Deploy.s.sol` and has no env var in `run-arb-mainnet.ts` (the adapter map in `index.ts` has `ramses_v3` but `run-arb-mainnet.ts` never sets it). Third, shadow mode logs do not extract the simulated return value from `eth_call` — it only reports pass/fail. The "estimated vs simulated within 10%" success criterion requires either log enhancement or manual interpretation of revert-vs-success ratio.

The deployment workflow is entirely human-action gated (no autonomous steps) because it requires a private key, real ETH, and Arbiscan API key. Arbitrum mainnet gas is cheap (deployment cost typically 0.002–0.01 ETH total), Aave V3 flashloans have 0.09% fee (no upfront capital needed for trade), and the three already-written PLAN files (12-01, 12-02, 12-03) cover the correct sequence. The plans are accurate and actionable — this research surfaces gaps the plans must address before execution proceeds.

**Primary recommendation:** Execute the three existing plans in order, but first patch the shadow mode to log simulated profit numerically so the "within 10%" criterion is measurable.

---

## Standard Stack

### Core (already in place)

| Tool | Version | Purpose | Status |
|------|---------|---------|--------|
| Foundry (forge) | Current (foundry.lock present) | Contract build, test, deploy | Fully configured |
| forge script | Built-in | `Deploy.s.sol` and `Verify.s.sol` execution | Scripts exist and are production-grade |
| cast | Built-in | Post-deploy verification calls | Used in all PLAN verification steps |
| ethers.js | v6 | Bot transaction signing and eth_call | Integrated in ExecutionEngine |
| TradeStore (JSONL) | local | Crash-safe trade persistence to `.data/trades.jsonl` | Implemented |
| NonceManager | local | Crash-safe nonce tracking in `.data/nonce.json` | Implemented |
| pm2 | via `ecosystem.config.cjs` | Unattended bot operation | Config file exists at project root |

### Protocol Addresses (Arbitrum mainnet, chain ID 42161)

Verified from `bot/src/config/chains/arbitrum.ts` (HIGH confidence — hardcoded in source):

| Protocol | Address |
|---------|---------|
| Aave V3 Pool | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` |
| Balancer V2 Vault | `0xBA12222222228d8Ba445958a75a0704d566BF2C8` |
| Uniswap V3 SwapRouter02 | `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45` |
| Uniswap V3 QuoterV2 | `0x61fFE014bA17989E743c5F6cB21bF9697530B21e` |
| SushiSwap V2 Router | `0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506` |
| Trader Joe LBRouter V2.1 | `0xb4315e873dBcf96Ffd0acd8EA43f689D8c20fB30` (from Plan 12-01) |
| SushiSwap V3 Factory | `0x1af415a1EbA07a4986a52B6f2e7dE7003D82231e` (no router in config — skip V3 for now) |
| Camelot V3 Factory | `0x1a3c9B1d2F0529D97f2afC5136Cc23e58f1FD35B` (no adapter contract exists) |

**Note:** Uniswap V2 was never deployed on Arbitrum. `Deploy.s.sol` handles this correctly — `UNISWAP_V2_ROUTER` is optional and gracefully skipped.

---

## Architecture Patterns

### Deployment Sequence (from `Deploy.s.sol`)

```
1. CircuitBreaker (safety)
2. ProfitValidator (safety)
3. FlashloanExecutor (core) — constructor takes aavePool, balancerVault, owner, botWallet, minProfit
4. UniswapV3Adapter (core for Arbitrum)
5. SushiSwapV2Adapter (reuses UniswapV2Adapter with Sushi router)
6. TraderJoeLBAdapter (Arbitrum-only)
7. registerAdapter() calls on executor for each deployed adapter
8. Verification assertions before broadcast completes
9. Export to deployments/42161.json
```

**Post-deploy initialization: NONE needed.** The constructor fully initializes all state. The `aavePool` and `balancerVault` are immutable. Bot wallet is set at construction. No separate `initialize()` call exists or is required.

### Mode Architecture (from `run-arb-mainnet.ts` + `index.ts`)

```
DRY_RUN=true (default)  → report only, no contracts needed
DRY_RUN=false + SHADOW_MODE=true  → eth_call simulate, no gas spent, EXECUTOR_ADDRESS required
DRY_RUN=false + SHADOW_MODE=false → live execute, EXECUTOR_ADDRESS + BOT_PRIVATE_KEY required
```

**Key insight:** `BOT_PRIVATE_KEY` (or `PRIVATE_KEY` as fallback) is required for shadow AND live mode. This is because `eth_call` simulation is done through an authenticated signer — the wallet signs the call context. The wallet does NOT need gas for shadow mode but the address must match `botWallet` on the contract for the simulation to be realistic.

### Bot-to-Contract Connection (from `run-arb-mainnet.ts` lines 178-194)

Addresses flow via environment variables only — there is no automatic reading of `deployments/42161.json` from the bot. After deployment, the operator must manually set:

```bash
EXECUTOR_ADDRESS=<from deployments/42161.json>
ADAPTER_UNISWAP_V3=<from deployments/42161.json>
ADAPTER_SUSHISWAP=<from deployments/42161.json>
ADAPTER_TRADERJOE_LB=<from deployments/42161.json>
```

There is a `// TODO: Set in .env` comment at line 180 of `run-arb-mainnet.ts` confirming this is the expected mechanism.

### Shadow Mode Logging Gap

Current shadow mode log output (from `index.ts` lines 334-340):
```
[SHADOW] ✓ Simulation succeeded for <id>
[SHADOW]   Estimated profit: 0.00123456 ETH
[SHADOW]   Would broadcast in live mode
```
OR
```
[SHADOW] ✗ Simulation failed: <reason>
[SHADOW]   Estimated profit was 0.00123456 ETH, but would revert on-chain
```

**Gap:** The simulation calls `eth_call` which returns calldata (or revert). The current `simulateTransaction()` in `ExecutionEngine` only returns `{ success: boolean, reason?: string }` — it does NOT decode the `ArbitrageExecuted` event to extract actual profit. The shadow mode cannot currently log "simulated profit = X" because it does not decode the return data.

**Impact on success criterion:** The "within 10% match" criterion (EXEC-02) can only be validated coarsely: if sim succeeds and estimated profit > 0, we assume match. The exact comparison requires either (a) decoding the `ArbitrageExecuted` event from the eth_call return trace, or (b) treating simulation pass rate as a proxy for estimate accuracy. Plan 12-02 uses approach (b) — this is acceptable but means the "within 10%" language is aspirational, not measurable.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Contract verification on Arbiscan | Manual API calls | `forge script --verify --etherscan-api-key` | Foundry handles constructor args encoding, multi-contract verification, rate-limit retry |
| Deployment receipt storage | Custom JSON writer | Foundry's `broadcast/` directory + `vm.writeFile()` | `Deploy.s.sol` already writes to `deployments/42161.json` automatically |
| Nonce management during live trading | Counter in memory | `NonceManager` (already built at `bot/src/nonce/`) | Crash-safe, handles pending transactions, syncs from chain |
| Trade persistence | In-memory array | `TradeStore` JSONL at `.data/trades.jsonl` | Append-only, crash-safe, already integrated |
| Gas estimation on Arbitrum | Static gwei * gas | `estimateArbitrumGas()` via NodeInterface precompile | Arbitrum L1 data fee is 90% of total cost; static estimates are badly wrong |
| Flash loan repayment | Manual token transfer logic | Aave V3 / Balancer callbacks (already in `FlashloanReceiver.sol`) | Callbacks handle approval and transfer; any custom implementation risks fund loss |

---

## Common Pitfalls

### Pitfall 1: Camelot Adapter Zero-Address Gap
**What goes wrong:** In live mode, if the bot detects a Camelot V2 or Camelot V3 opportunity, `resolveAdapter("camelot_v2")` returns `"0x0000000000000000000000000000000000000000"`. The `executeArbitrage` call on-chain will revert with `AdapterNotApproved(address(0))` immediately.
**Why it happens:** `CamelotV2Adapter` and `CamelotV3Adapter` contracts do not exist in `contracts/src/adapters/`. They are referenced in bot pool config (13 Camelot pools are monitored) but are not deployed.
**How to avoid:** Either (a) build and deploy Camelot adapters before live mode, or (b) filter Camelot opportunities at the bot level when no adapter is deployed (check if adapter address is zero before building transaction). Currently the bot does not check this.
**Warning signs:** Live mode transaction reverts with `AdapterNotApproved` event in logs.

### Pitfall 2: Ramses Adapter Deployed But Not Wired
**What goes wrong:** `RamsesV2Adapter.sol` exists in contracts and is mentioned in `FlashloanExecutor.sol` docstring, but is NOT in `Deploy.s.sol` and has no `ADAPTER_RAMSES` env var in `run-arb-mainnet.ts`.
**Why it happens:** The adapter was built in Phase 9 but deploy script was not updated. The `index.ts` adapter map has `ramses_v3` at line 142 but `run-arb-mainnet.ts` never populates it from env.
**How to avoid:** Either (a) add RamsesV2Adapter to Deploy.s.sol and add `ADAPTER_RAMSES` env var to `run-arb-mainnet.ts`, or (b) note that no Ramses pools are currently in `arbitrum-mainnet.ts` pool config (Ramses V3 WETH/USDT was removed), so this gap has no immediate impact on execution.
**Warning signs:** Zero `ramses_v3` opportunities despite Ramses pools being monitored.

### Pitfall 3: SushiSwap V3 — No Router Address Available
**What goes wrong:** Two pools use `dex: "sushiswap_v3"` (ARB/WETH, LINK/WETH) in the pool config. The Arbitrum config has a SushiSwap V3 factory address but NO router or quoter address. `Deploy.s.sol` has env vars for `SUSHISWAP_V3_ROUTER` and `SUSHISWAP_V3_QUOTER` but Plan 12-01 explicitly skips setting them.
**Why it happens:** SushiSwap V3 on Arbitrum may use a different router deployment than standard Uniswap V3 routers.
**How to avoid:** Leave `SUSHISWAP_V3_ROUTER` unset (Deploy.s.sol skips the adapter gracefully). The `sushiswap_v3` adapter address will be zero in bot, meaning those 2 pools can only be used for price detection but not execution.
**Warning signs:** Opportunities identified on SushiV3 leg, but execution fails.

### Pitfall 4: .data/ Directory Must Exist Before First Run
**What goes wrong:** `TradeStore` writes to `.data/trades.jsonl` and `NonceManager` writes to `.data/nonce.json`. If `.data/` does not exist, Node.js `fs.writeFile` throws `ENOENT`.
**Why it happens:** The `.data/` directory is gitignored and does not exist in a fresh clone.
**How to avoid:** `mkdir -p .data` before first shadow/live run. Neither TradeStore nor NonceManager creates the directory automatically.
**Warning signs:** Bot crashes immediately on first opportunity in shadow/live mode with `ENOENT: no such file or directory`.

### Pitfall 5: Arbiscan Verification Rate Limiting
**What goes wrong:** `forge script --verify` with Arbiscan often fails for 2–3 contracts during a multi-contract deployment due to API rate limits (5 requests/second for free tier).
**Why it happens:** Deploying 6+ contracts triggers many simultaneous verify requests.
**How to avoid:** After initial deploy, manually verify any unverified contracts with `forge verify-contract`. Plan 12-01 already documents this fallback. Alternative: use `--delay 5` flag (if supported) or verify contracts one at a time.
**Warning signs:** Deploy broadcast succeeds but Arbiscan shows "unverified" source for some contracts.

### Pitfall 6: DEPLOYER_PRIVATE_KEY vs BOT_PRIVATE_KEY Separation
**What goes wrong:** The deploy script uses `DEPLOYER_PRIVATE_KEY` (via `vm.envUint`). The bot uses `BOT_PRIVATE_KEY` (or `PRIVATE_KEY`). These must be the SAME wallet address if the bot wallet is set to the deployer in `BOT_WALLET_ADDRESS` at deploy time.
**Why it happens:** The deploy script sets `botWallet = vm.envAddress("BOT_WALLET_ADDRESS")`, and the bot's `executionConfig.wallet.address` must match this for `onlyAuthorized` to pass on the contract.
**How to avoid:** At deploy time, set `BOT_WALLET_ADDRESS` = the address of the key you will use as `BOT_PRIVATE_KEY` for the bot. Verify post-deploy with `cast call <executor> "botWallet()"`.
**Warning signs:** Live mode transactions revert with `NotAuthorized()`.

### Pitfall 7: MIN_PROFIT_WEI Default May Filter All Live Opportunities
**What goes wrong:** The contract's `minProfit` defaults to `0.01 ether` (1e16 wei) in Deploy.s.sol. Combined with the bot's `minProfitThreshold: 0.015` ETH in detector config, both independently filter low-profit opportunities.
**Why it happens:** Two-layer safety: detector rejects before submission, contract rejects after flash loan. Both must be satisfied.
**How to avoid:** Confirm that real dry-run opportunities from Phase 11 exceed 0.015 ETH gross profit (accounting for gas). If not, lower `MIN_PROFIT_WEI` at deploy time or via `setMinProfit()` post-deploy. The contract owner can call `setMinProfit()` anytime without redeployment.
**Warning signs:** Bot reports profitable opportunities in dry-run but all live transactions revert with `InsufficientProfit`.

### Pitfall 8: executorAddress Zero-Address Allows TransactionBuilder to Build Invalid Txs
**What goes wrong:** If `EXECUTOR_ADDRESS` is not set (or is the zero-address default), `TransactionBuilder` uses `"0x0000000000000000000000000000000000000000"` as `tx.to`. The transaction submits to the zero address and burns gas.
**Why it happens:** `run-arb-mainnet.ts` line 180 has `process.env.EXECUTOR_ADDRESS ?? "0x0000000000000000000000000000000000000000"` with a `// TODO` comment.
**How to avoid:** Add a guard: if `EXECUTOR_ADDRESS` is not set or is zero address, refuse to enter shadow/live mode. A task should validate this before bot launch.
**Warning signs:** Bot enters shadow/live mode, builds transactions, but all simulations "succeed" (sending to zero address doesn't revert in eth_call).

---

## Code Examples

### Deployment Command (from Deploy.s.sol docstring and Plan 12-01)

```bash
# Dry-run (no broadcast)
forge script contracts/script/Deploy.s.sol:Deploy \
  --rpc-url $ARBITRUM_RPC_URL \
  -vvv

# Broadcast with verification
forge script contracts/script/Deploy.s.sol:Deploy \
  --rpc-url $ARBITRUM_RPC_URL \
  --broadcast \
  --verify \
  --slow \
  --etherscan-api-key $ARBISCAN_API_KEY \
  -vvv
```

### Post-Deploy Verification

```bash
# Confirm executor owner
cast call $EXECUTOR_ADDRESS "owner()" --rpc-url $ARBITRUM_RPC_URL

# Confirm bot wallet
cast call $EXECUTOR_ADDRESS "botWallet()" --rpc-url $ARBITRUM_RPC_URL

# Confirm not paused
cast call $EXECUTOR_ADDRESS "paused()" --rpc-url $ARBITRUM_RPC_URL

# Confirm adapter registered
cast call $EXECUTOR_ADDRESS "approvedAdapters(address)" $ADAPTER_UNISWAP_V3 --rpc-url $ARBITRUM_RPC_URL

# Run Foundry Verify script
forge script contracts/script/Verify.s.sol:Verify \
  --rpc-url $ARBITRUM_RPC_URL \
  -vvv
```

### Required Environment Variables (complete list)

```bash
# Deployment
export DEPLOYER_PRIVATE_KEY="<private key>"
export BOT_WALLET_ADDRESS="<deployer wallet address>"   # MUST match BOT_PRIVATE_KEY address
export AAVE_V3_POOL="0x794a61358D6845594F94dc1DB02A252b5b4814aD"
export BALANCER_VAULT="0xBA12222222228d8Ba445958a75a0704d566BF2C8"
export UNISWAP_V3_ROUTER="0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45"
export UNISWAP_V3_QUOTER="0x61fFE014bA17989E743c5F6cB21bF9697530B21e"
export SUSHISWAP_V2_ROUTER="0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506"
export TRADERJOE_LB_ROUTER="0xb4315e873dBcf96Ffd0acd8EA43f689D8c20fB30"
export ARBISCAN_API_KEY="<arbiscan api key>"
export MIN_PROFIT_WEI="10000000000000000"   # 0.01 ETH
export MAX_GAS_PRICE="100000000000"          # 100 gwei safety cap
export MAX_TRADE_SIZE="1000000000000000000000"  # 1000 ETH
export FAILURE_THRESHOLD="5"
# Optional (skip if not deploying these adapters)
# export SUSHISWAP_V3_ROUTER="..."   # No known router address for Arbitrum yet
# export UNISWAP_V2_ROUTER=          # Never on Arbitrum

# Bot (shadow/live mode)
export RPC_URL="<Arbitrum RPC URL>"
export ARBITRUM_RPC_URL="<same>"   # foundry.toml uses ARBITRUM_RPC_URL
export BOT_PRIVATE_KEY="<same key as deployer>"
export DRY_RUN="false"
export SHADOW_MODE="true"   # or false for live
export EXECUTOR_ADDRESS="<from deployments/42161.json>"
export ADAPTER_UNISWAP_V3="<from deployments/42161.json>"
export ADAPTER_SUSHISWAP="<from deployments/42161.json>"
export ADAPTER_TRADERJOE_LB="<from deployments/42161.json>"
```

### Launch Bot (from `run-arb-mainnet.ts` and ecosystem.config.cjs)

```bash
# Direct execution
cd /path/to/project && node --import tsx bot/src/run-arb-mainnet.ts

# Via pm2 (unattended)
pm2 start ecosystem.config.cjs
pm2 logs flashloan-bot --lines 100
```

### Create .data/ Directory

```bash
mkdir -p /path/to/project/.data
```

---

## Deployment Readiness Assessment

| Component | Status | Notes |
|-----------|--------|-------|
| `Deploy.s.sol` | READY | Deploys all available adapters, self-verifying |
| `Verify.s.sol` | READY | Post-deploy verification script |
| `FlashloanExecutor.sol` | READY | Fully initialized via constructor; no post-deploy init needed |
| `UniswapV3Adapter.sol` | READY | Deployed by script |
| `UniswapV2Adapter.sol` (as SushiSwap V2) | READY | Deployed with SushiSwap V2 router |
| `TraderJoeLBAdapter.sol` | READY | Deployed with TJ LBRouter |
| `RamsesV2Adapter.sol` | MISSING FROM DEPLOY SCRIPT | Exists in contracts but not added to `Deploy.s.sol`; no Ramses pools currently active so low urgency |
| Camelot adapters | NOT BUILT | No `.sol` files exist; 13 Camelot pools monitored cannot be executed |
| `run-arb-mainnet.ts` | READY (with caveats) | Zero-address fallback for undeployed adapters; EXECUTOR_ADDRESS TODO comment |
| Shadow mode | PARTIAL | Pass/fail simulation works; exact profit comparison not measurable |
| TradeStore | READY | JSONL append; `.data/` dir must be created manually |
| NonceManager | READY | Crash-safe; `.data/` dir must be created manually |
| `deployments/` directory | MISSING | Created by `Deploy.s.sol` on first run via `vm.writeFile`; foundry.toml grants `read-write` permission |

---

## Open Questions

1. **Camelot adapter deployment decision**
   - What we know: 13 Camelot pools are monitored (WETH/USDC, ARB/WETH, GMX/WETH, etc.). No Camelot adapter contracts exist.
   - What's unclear: Does the user want to build Camelot adapters before going live, or accept that Camelot opportunities will silently fail?
   - Recommendation: Either add a pre-flight check in the bot that skips opportunities where adapter address is zero-address, OR plan a follow-up phase for Camelot adapters. For Phase 12 success criteria, only UniV3 + SushiV2 + TJ LB are needed.

2. **SushiSwap V3 router address**
   - What we know: Two pools use `dex: "sushiswap_v3"`. The Arbitrum config has the factory but no router. The deploy script optionally deploys SushiV3 if `SUSHISWAP_V3_ROUTER` is set.
   - What's unclear: What is the SushiSwap V3 router address on Arbitrum?
   - Recommendation: Look up SushiSwap V3 (Trident) router for Arbitrum. If found, add to deployment. If not, leave unset.

3. **Shadow mode accuracy measurement**
   - What we know: `simulateTransaction()` calls `eth_call` and returns pass/fail. It does NOT decode the simulated profit.
   - What's unclear: Is the "within 10%" success criterion for EXEC-02 satisfied by pass/fail rate, or does it require actual profit comparison?
   - Recommendation: For Phase 12 success, treat simulation pass rate as the proxy. If >90% of simulations pass for profitable opportunities, the estimates are reliable. The alternative (decoding ArbitrageExecuted from eth_call trace) is complex and not required.

4. **Gas buffer for deployment**
   - What we know: Arbitrum gas is cheap. Plan 12-01 estimates 0.01–0.05 ETH total for deployment.
   - What's unclear: Exact cost depends on bytecode size and current L1 gas prices.
   - Recommendation: Fund deployer with at least 0.05 ETH before deployment. Current Arbitrum conditions make 0.02 ETH sufficient in practice.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Hardcoded addresses in deploy script | Environment variable-driven deploy with chain detection | Supports any chain without script modification |
| Manual adapter registration post-deploy | Registration done atomically in broadcast | No window where executor is live without adapters |
| Deployment addresses in code comments | `deployments/42161.json` JSON export | Machine-readable; bot can theoretically auto-load |
| Manual verification after deploy | `--verify` flag auto-verifies during broadcast | Rate limits still cause partial failures |

---

## Sources

### Primary (HIGH confidence)

- `contracts/script/Deploy.s.sol` — Full deployment workflow, env var requirements, adapter ordering
- `contracts/script/Verify.s.sol` — Post-deploy verification checks
- `contracts/src/FlashloanExecutor.sol` — Constructor parameters, authorization model, no post-init required
- `contracts/src/FlashloanReceiver.sol` — Aave/Balancer callback implementations
- `bot/src/run-arb-mainnet.ts` — Mode detection, env var names, adapter address population
- `bot/src/index.ts` — Shadow and live mode implementation, engine initialization
- `bot/src/engine/ExecutionEngine.ts` — `simulateTransaction()` implementation (eth_call)
- `bot/src/builder/TransactionBuilder.ts` — Adapter resolution, extra data encoding
- `bot/src/config/chains/arbitrum.ts` — All Arbitrum protocol addresses
- `bot/src/config/chains/pools/arbitrum-mainnet.ts` — Active pool configuration (34 pools)
- `foundry.toml` — Chain config, etherscan keys, file permissions for deployments/
- `.planning/phases/12-contract-deployment-live-validation/12-01-PLAN.md` — Existing deployment plan
- `.planning/phases/12-contract-deployment-live-validation/12-02-PLAN.md` — Existing shadow plan
- `.planning/phases/12-contract-deployment-live-validation/12-03-PLAN.md` — Existing live plan

### Secondary (MEDIUM confidence)

- Aave V3 Arbitrum pool address `0x794a61358D6845594F94dc1DB02A252b5b4814aD` — referenced across multiple files, consistent
- Balancer V2 Vault `0xBA12222222228d8Ba445958a75a0704d566BF2C8` — CREATE2 address, same on all chains, widely documented
- Trader Joe LBRouter V2.1 `0xb4315e873dBcf96Ffd0acd8EA43f689D8c20fB30` — from Phase 10 research, consistent with Plan 12-01

---

## Metadata

**Confidence breakdown:**
- Deployment readiness: HIGH — codebase is production-grade; gaps are documented
- Shadow mode: HIGH — implementation confirmed in source; accuracy measurement gap noted
- Live mode: HIGH — all wiring is in place; safety guards confirmed active
- Protocol addresses: HIGH — hardcoded in source, cross-referenced across multiple files
- Camelot/Ramses gaps: HIGH — confirmed by absence of `.sol` files in `contracts/src/adapters/`

**Research date:** 2026-02-25
**Valid until:** 2026-03-25 (stable codebase; protocol addresses change rarely)
