# Codebase Concerns

**Analysis Date:** 2026-02-16

## Security Concerns

**CircuitBreaker NOT integrated into FlashloanExecutor:**
- Issue: `CircuitBreaker` and `ProfitValidator` are deployed as standalone contracts (via `contracts/script/Deploy.s.sol`) but are never referenced or called by `FlashloanExecutor`. The executor has its own inline profit check and pause mechanism, while the deployed CircuitBreaker sits unused on-chain. Gas price limits, trade size limits, and consecutive failure tracking from CircuitBreaker are not enforced during arbitrage execution.
- Files: `contracts/src/FlashloanExecutor.sol` (no import of CircuitBreaker), `contracts/script/Deploy.s.sol:147-156` (deploys both but never wires them)
- Impact: The executor operates without on-chain gas price limits or trade size caps. The inline `paused` flag in the executor is a simpler mechanism than the CircuitBreaker's auto-pause-on-failures.
- Fix approach: Either integrate CircuitBreaker calls into FlashloanExecutor's `executeArbitrage()` (call `enforceLimits()` before requesting the flash loan), or remove the standalone CircuitBreaker deployment and rely on off-chain enforcement. The off-chain ExecutionEngine already has its own circuit breaker logic (`bot/src/engine/ExecutionEngine.ts:453-461`).

**No ownership transfer to multisig:**
- Issue: All contracts deploy with an EOA as owner. There is no timelock, multisig, or governance mechanism. The owner can instantly change `minProfit`, `botWallet`, register/remove adapters, pause/unpause, and withdraw all funds. If the owner key is compromised, all contract funds are at risk.
- Files: `contracts/src/FlashloanExecutor.sol:246-300` (all admin functions are `onlyOwner` with no timelock), `contracts/src/FlashloanReceiver.sol:77` (Ownable constructor)
- Impact: Single point of failure for mainnet deployment. The security audit (`contracts/SECURITY_AUDIT.md:266`) explicitly calls this out as a pre-deployment critical item.
- Fix approach: Transfer ownership to a Gnosis Safe after deployment. Consider adding a timelock for parameter changes as recommended in `.rules/patterns/defi-security.md:316-344`.

**amountOutMin set to 0 in swap steps:**
- Issue: In `_executeSwapStep()`, the adapter's `swap()` is called with `amountOutMin = 0` (line 229). While profit is validated atomically at the end of all swaps, individual swap steps have zero slippage protection. A compromised or buggy adapter could return fewer tokens than expected on an intermediate step.
- Files: `contracts/src/FlashloanExecutor.sol:225-231`
- Impact: Individual swap steps are unprotected against slippage. The end-to-end profit check mitigates total loss, but intermediate steps could be sandwiched if not using MEV protection.
- Fix approach: Calculate expected minimum outputs per step off-chain and pass them through the `SwapStep.extraData` field or add an `amountOutMin` field to `SwapStep`.

**Acknowledged audit findings not yet fixed:**
- Issue: The security audit (`contracts/SECURITY_AUDIT.md`) identified 10 findings. While HIGH and MEDIUM severity items (F-01 through F-05) have been fixed, the following remain acknowledged but unfixed:
  - F-06 (LOW): `receiveFlashLoan` does not validate array length consistency
  - F-07 (LOW): String revert in `_requestAaveFlashLoan` instead of custom error
  - F-08 (INFO): String require in `UniswapV3Adapter.getAmountOut`
  - F-09 (INFO): `setMinProfit(0)` allowed, which means 1 wei profit passes
  - F-10 (INFO): Aave repayment uses `safeIncreaseAllowance` instead of `forceApprove`
- Files: `contracts/src/FlashloanReceiver.sol:112-130` (F-06), `contracts/src/FlashloanExecutor.sol:167` (F-07), `contracts/src/adapters/UniswapV3Adapter.sol:163` (F-08), `contracts/src/FlashloanExecutor.sol:268` (F-09), `contracts/src/FlashloanReceiver.sol:106` (F-10)
- Impact: Minor gas inefficiency and defense-in-depth gaps. No direct security vulnerability.
- Fix approach: Address F-06 and F-07 before mainnet deployment. F-08 through F-10 are low priority.

**No external security audit:**
- Issue: The only audit is an internal AI-generated review (`contracts/SECURITY_AUDIT.md`). No independent security firm has reviewed the contracts.
- Files: `contracts/SECURITY_AUDIT.md`
- Impact: Internal audits cannot substitute for independent review before handling real funds on mainnet.
- Fix approach: Engage a professional audit firm before any mainnet deployment with real capital.

## Technical Debt

**17 skipped safety integration tests:**
- Issue: `contracts/test/safety/SafetyIntegration.t.sol` contains 17 test cases that are all `vm.skip(true)`. These tests were planned to verify the combined behavior of CircuitBreaker + ProfitValidator + FlashloanExecutor but were never implemented because the contracts were never wired together.
- Files: `contracts/test/safety/SafetyIntegration.t.sol:54-225` (every test body is skipped)
- Impact: The interaction between safety contracts and the executor is untested. The skipped tests outline critical scenarios: profitable vs unprofitable arbitrage flow, circuit breaker blocking trades, reentrancy attacks, access control integration, emergency withdrawals, and edge cases.
- Fix approach: Either implement these tests after integrating CircuitBreaker into FlashloanExecutor, or remove the file if the integration is not planned. Do not leave 17 skipped tests as permanent fixtures.

**ProfitValidator deployed but unused:**
- Issue: `ProfitValidator` is deployed in the deploy script (`contracts/script/Deploy.s.sol:155-156`) but never called by any other contract. The FlashloanExecutor has its own inline profit validation in `_executeArbitrage()` (lines 191-203) that duplicates the ProfitValidator's logic.
- Files: `contracts/src/safety/ProfitValidator.sol`, `contracts/src/FlashloanExecutor.sol:191-203`
- Impact: Dead code deployed on-chain, paying deployment gas for unused functionality. Two separate profit validation implementations that could diverge.
- Fix approach: Either integrate ProfitValidator into FlashloanExecutor (call it instead of inline checks) or remove it from the deployment script and keep the inline check.

**`any` types in MEV signer RPC responses:**
- Issue: Both `FlashbotsSigner` and `MEVBlockerSigner` use `any` for the JSON-RPC `result` field, bypassing TypeScript's type safety for critical financial data parsing.
- Files: `bot/src/mev/FlashbotsSigner.ts:416` (`result?: any`), `bot/src/mev/MEVBlockerSigner.ts:253` (`result?: any`)
- Impact: Runtime type errors possible when parsing Flashbots relay or MEV Blocker RPC responses. Silently ignored with `eslint-disable` comments.
- Fix approach: Define typed response interfaces for each RPC method (`eth_sendBundle`, `eth_callBundle`, `eth_sendRawTransaction`, `eth_getTransactionReceipt`).

**Console-based logging with no structured output:**
- Issue: The bot uses `console.log`, `console.error`, `console.warn`, and `console.debug` throughout. No structured logging framework, no log levels configurable at runtime beyond the simple level filter in `FlashloanBot.log()`, no JSON output for log aggregation.
- Files: `bot/src/index.ts:222-235` (log method), `bot/src/run-testnet.ts` (direct console calls throughout), `bot/src/reporting.ts`
- Impact: Production deployments will need log parsing and monitoring. Console output is not queryable or alertable.
- Fix approach: Introduce a structured logger (pino, winston) that outputs JSON with timestamps, levels, and context fields. Replace all direct console calls.

**Missing SushiSwap adapter contract:**
- Issue: The bot's pool configuration includes SushiSwap pools (`bot/src/config/pools.ts:44-50`, `bot/src/config/pools.ts:77-81`, etc.) and the monitor treats `sushiswap` as a valid DEX protocol, but there is no `SushiSwapAdapter.sol` contract. The only deployed adapters are `UniswapV2Adapter` and `UniswapV3Adapter`. SushiSwap is tracked in beads as `flashloaner-kut`.
- Files: `bot/src/config/pools.ts` (SushiSwap pools defined), `contracts/src/adapters/` (no SushiSwapAdapter.sol)
- Impact: The bot will monitor SushiSwap prices and may detect opportunities involving SushiSwap pools, but cannot execute trades on them. The UniswapV2Adapter could work for SushiSwap (same interface) but would need to be deployed pointing to SushiSwap's router.
- Fix approach: Either deploy a UniswapV2Adapter instance pointing to SushiSwap's Router02 address, or create a dedicated SushiSwapAdapter. Update the TransactionBuilder's adapter resolution to map `sushiswap` to the correct adapter address.

**Missing Balancer, Curve adapters:**
- Issue: Open beads issues track `flashloaner-63u` (BalancerAdapter) and `flashloaner-urp` (CurveAdapter) but no implementation exists. The FlashloanReceiver supports Balancer flash loans but there is no Balancer swap adapter.
- Files: `contracts/src/adapters/` (only UniswapV2Adapter.sol, UniswapV3Adapter.sol)
- Impact: Limited DEX coverage reduces arbitrage opportunity surface.
- Fix approach: Implement adapters per the `IDEXAdapter` interface pattern. Balancer is P2 priority per beads.

## Architecture Risks

**Off-chain and on-chain circuit breakers are disconnected:**
- Issue: The on-chain `CircuitBreaker` contract and the off-chain `ExecutionEngine` circuit breaker (`bot/src/engine/ExecutionEngine.ts:453-466`) operate independently. Failures tracked off-chain (consecutive transaction failures) do not update the on-chain CircuitBreaker. The on-chain CircuitBreaker's `recordFailure()` is never called by any contract or bot code.
- Files: `bot/src/engine/ExecutionEngine.ts:453-466` (off-chain breaker), `contracts/src/safety/CircuitBreaker.sol:191-209` (on-chain breaker)
- Impact: The two safety systems cannot reinforce each other. An off-chain failure pattern will not trigger on-chain auto-pause, and vice versa.
- Fix approach: After a failed transaction, have the bot call `CircuitBreaker.recordFailure()` on-chain. After a successful transaction, call `recordSuccess()`. This requires the bot wallet to be registered as an authorized caller.

**Polling-based price monitoring (not event-driven):**
- Issue: `PriceMonitor` uses `setInterval` polling (`bot/src/monitor/PriceMonitor.ts:57`) with a default 12-second interval. It does not use WebSocket subscriptions or event-based notifications. Each poll makes one `getBlockNumber()` call plus one contract call per pool.
- Files: `bot/src/monitor/PriceMonitor.ts:52-57` (polling loop), `bot/src/config/defaults.ts:8` (12s default)
- Impact: 12-second latency between price changes and detection. In competitive arbitrage, block-by-block latency matters. Other bots using WebSocket `newBlock` events or mempool monitoring will detect opportunities faster.
- Fix approach: Add WebSocket provider support (the config already accepts `wsUrl` in `bot/src/config/types.ts`). Subscribe to `newBlock` events and trigger polling on each new block rather than on a fixed timer.

**Single RPC provider with no fallback:**
- Issue: The bot initializes a single `JsonRpcProvider` from `config.network.rpcUrl`. No fallback RPC, no round-robin, no health checking. If the RPC endpoint goes down or rate-limits, the entire bot stops monitoring.
- Files: `bot/src/index.ts:57` (single provider creation)
- Impact: RPC downtime causes complete bot failure. Missed opportunities during outage.
- Fix approach: Implement a multi-provider strategy with automatic failover. ethers.js v6's `FallbackProvider` supports this natively.

**`_pendingSteps` storage pattern is gas-expensive:**
- Issue: `FlashloanExecutor.executeArbitrage()` copies all swap steps from calldata to storage (`_pendingSteps`) before requesting the flash loan, then reads them back from storage in the callback. This storage write/read pattern costs significant gas (20,000 gas per SSTORE for each step's 5 fields).
- Files: `contracts/src/FlashloanExecutor.sol:122-127` (storage write loop), `contracts/src/FlashloanExecutor.sol:178` (storage read)
- Impact: Multi-step arbitrage routes incur high gas overhead from storage operations. A 3-step route writes 15 storage slots.
- Fix approach: Encode steps in the flash loan `params` bytes instead of using contract storage. The Aave callback passes `params` back to `executeOperation()`, avoiding storage entirely. This is a significant gas optimization tracked as `flashloaner-bk5` (calldata optimization) and `flashloaner-425` (assembly optimization).

**Floating-point arithmetic in profit calculation:**
- Issue: The `OpportunityDetector` uses JavaScript `number` (IEEE 754 double-precision float) for all price and profit calculations. Prices are computed as `Number(reserve0) / 10 ** decimals0` and profits are calculated via floating-point multiplication and subtraction.
- Files: `bot/src/monitor/PriceMonitor.ts:172-176` (V2 price as float), `bot/src/monitor/PriceMonitor.ts:190-192` (V3 price as float), `bot/src/detector/OpportunityDetector.ts:231-239` (profit via float multiplication)
- Impact: Floating-point precision loss can cause false positives (detecting opportunities that don't actually exist) or false negatives (missing real opportunities). For tokens with large reserves, `Number()` loses precision beyond 2^53.
- Fix approach: Use `bigint` arithmetic for reserve-based calculations. Convert to floating-point only for display/logging. Alternatively, use a decimal arithmetic library.

## Operational Risks

**No chain reorganization handling:**
- Issue: The bot detects opportunities based on current block prices but does not account for chain reorganizations. A reorg can invalidate prices that were used for opportunity detection, causing transaction reverts.
- Files: `bot/src/monitor/PriceMonitor.ts:110-128` (fetches block number and price, no reorg detection)
- Impact: On Ethereum mainnet, reorgs of 1-2 blocks are rare but possible. On L2s, sequencer reorgs have different characteristics. Failed transactions waste gas.
- Fix approach: Track the last N block hashes and detect when the chain reorganizes. Discard cached prices when a reorg is detected. The on-chain profit check provides ultimate protection (reverts if prices have moved).

**No monitoring or alerting system:**
- Issue: The `HealthMonitor` exists (`bot/src/health/HealthMonitor.ts`) and tracks balances, P&L, error rates, and heartbeats, but it is not wired into the main `FlashloanBot` class. The bot runs with console logging only. No external alerting (PagerDuty, Telegram, Discord, email).
- Files: `bot/src/health/HealthMonitor.ts` (implemented but unused), `bot/src/index.ts` (no HealthMonitor import)
- Impact: Production deployment without monitoring means failures, low balances, and P&L deterioration go unnoticed. Tracked as beads issues `flashloaner-uwu` (alerting system) and `flashloaner-2qo` (monitoring dashboard).
- Fix approach: Integrate `HealthMonitor` into the `FlashloanBot` class. Wire `ExecutionEngine` events to the health monitor. Add alerting integrations.

**Bot version 0.1.0 with hardcoded "dry-run" default:**
- Issue: The bot defaults to `dryRun = true` in both `FlashloanBot.fromEnv()` and the CLI entry point. The `DRY_RUN` env var must be explicitly set to `"false"` to enable real transactions. While this is safe, there is no production-ready configuration path that clearly guides operators through the transition from dry-run to live execution.
- Files: `bot/src/index.ts:249` (`const dryRun = process.env.DRY_RUN !== "false"`), `bot/src/index.ts:81` (default `dryRun = true`)
- Impact: Accidental production deployment in dry-run mode means missed opportunities. Accidental live mode means real gas costs without full operational readiness.
- Fix approach: Add a production startup checklist that validates all required configuration (contract addresses, wallet balance, MEV protection, monitoring) before allowing `dryRun = false`.

**No nonce management:**
- Issue: The `ExecutionEngine` relies on the signer to provide nonces via `getNonce()`, but there is no nonce tracking or management for concurrent transactions. If two opportunities are detected in quick succession, both could use the same nonce.
- Files: `bot/src/engine/ExecutionEngine.ts:149-215` (no nonce tracking), `bot/src/builder/TransactionBuilder.ts:168-175` (nonce passed externally)
- Impact: Concurrent transaction submissions could fail with nonce conflicts.
- Fix approach: Implement a local nonce manager that tracks pending transactions and increments nonces accordingly.

## Dependency Risks

**Loose version pinning for ethers.js:**
- Issue: `package.json` specifies `"ethers": "^6"` which allows any 6.x version. Breaking changes within major versions (e.g., 6.15 to 6.16) are unlikely but possible for behavioral changes.
- Files: `package.json:23`
- Impact: Reproducibility risk across different installations. A `pnpm-lock.yaml` mitigates this for exact installs.
- Fix approach: Pin to a specific minor version (e.g., `"ethers": "~6.16.0"`) for better reproducibility.

**Aave V3, Uniswap V2/V3 protocol upgrade risk:**
- Issue: The contracts interact with Aave V3 Pool (flash loans), Uniswap V2 Router02 (swaps), and Uniswap V3 SwapRouter (swaps) via hardcoded function signatures and interfaces. Protocol upgrades or governance changes to these contracts could break compatibility.
- Files: `contracts/src/FlashloanExecutor.sol:148-168` (Aave interface via low-level call), `contracts/src/adapters/UniswapV2Adapter.sol:9-24` (V2 Router interface), `contracts/src/adapters/UniswapV3Adapter.sol:9-31` (V3 SwapRouter interface)
- Impact: If Aave or Uniswap upgrade their router contracts, the adapters would need redeployment. The FlashloanExecutor uses `pool.call()` with hardcoded function signatures rather than interface imports.
- Fix approach: Monitor protocol governance proposals. The adapter pattern allows deploying new adapters without redeploying the executor. For Aave, consider using the interface import rather than low-level call for better compile-time safety.

**OpenZeppelin contracts imported via git submodule:**
- Issue: OpenZeppelin contracts are imported as a Foundry lib (`lib/openzeppelin-contracts`). The specific version is locked by the submodule commit, but there is no explicit version tag reference in documentation.
- Files: `lib/openzeppelin-contracts/` (git submodule), `remappings.txt`
- Impact: Unclear which OpenZeppelin version is in use. Security patches to OpenZeppelin may not be automatically detected.
- Fix approach: Document the OpenZeppelin version. Set up Dependabot for git submodules or pin to a specific release tag.

## Performance Concerns

**Sequential pool price fetching:**
- Issue: While `PriceMonitor.poll()` uses `Promise.all` to fetch all pool prices concurrently, it makes one `getBlockNumber()` call per pool (`bot/src/monitor/PriceMonitor.ts:111`). With 13 pools configured, this means 14 RPC calls per poll cycle (13 price + 13 block number = 26, but Promise.all overlaps them).
- Files: `bot/src/monitor/PriceMonitor.ts:85-107` (poll method), `bot/src/monitor/PriceMonitor.ts:111` (getBlockNumber per pool)
- Impact: Unnecessary RPC calls waste quota and add latency. Block number should be fetched once per cycle.
- Fix approach: Fetch `getBlockNumber()` once before the pool loop and pass it to `fetchPrice()`. This cuts RPC calls nearly in half.

**Gas optimization opportunities in contracts:**
- Issue: Multiple gas optimizations are identified but not yet implemented:
  1. Storage-based `_pendingSteps` pattern (see Architecture Risks above)
  2. String reverts instead of custom errors in two locations
  3. No assembly optimization for swap routing (tracked as `flashloaner-425`)
  4. No storage packing optimization (tracked as `flashloaner-aql`)
- Files: `contracts/src/FlashloanExecutor.sol:122-127, 167`, `contracts/src/adapters/UniswapV3Adapter.sol:163`
- Impact: Higher gas costs per arbitrage execution reduce profitability threshold.
- Fix approach: Prioritize calldata-based step encoding (biggest win). String reverts are quick fixes. Assembly optimization and storage packing are longer-term.

**No price impact estimation:**
- Issue: The `OpportunityDetector` calculates gross profit using `expectedPrice` from pool snapshots but does not account for price impact from the trade itself. A large trade will move the pool's price, reducing actual output.
- Files: `bot/src/detector/OpportunityDetector.ts:231-239` (gross profit from expected prices), `bot/src/detector/OpportunityDetector.ts:283-288` (slippage estimate is a flat percentage, not pool-depth-aware)
- Impact: Overestimated profits for large trades. The bot may submit transactions that revert due to insufficient profit after price impact.
- Fix approach: Query `getAmountOut()` from the adapter contracts (via `eth_call`) for the actual trade size before submitting. This gives the real output accounting for pool depth and price impact.

## Missing Features

**No transaction execution loop connecting detector to executor:**
- Issue: The bot's pipeline has all components implemented (PriceMonitor -> OpportunityDetector -> TransactionBuilder -> ExecutionEngine) but there is no code that connects `OpportunityDetector.opportunityFound` to `TransactionBuilder.buildArbitrageTransaction` to `ExecutionEngine.executeTransaction`. The main `FlashloanBot` class in `bot/src/index.ts` only logs opportunities; it never builds or submits transactions.
- Files: `bot/src/index.ts:184-187` (only logs opportunities, no execution)
- Impact: The bot cannot execute trades. It is report-only. This is the gap between "monitoring" and "trading."
- Fix approach: Add an execution mode that: (1) builds the transaction via TransactionBuilder, (2) estimates gas, (3) simulates via eth_call, (4) submits via ExecutionEngine. Wire this to the `opportunityFound` event when `dryRun = false`.

**No Balancer flash loan support in executor:**
- Issue: `FlashloanReceiver` implements the `receiveFlashLoan` callback for Balancer, but `FlashloanExecutor.executeArbitrage()` hardcodes Aave's `flashLoanSimple` via `_requestAaveFlashLoan()`. There is no `_requestBalancerFlashLoan()` method. The `flashLoanProvider` parameter is passed but always treated as an Aave pool.
- Files: `contracts/src/FlashloanExecutor.sol:132-135` (always calls Aave), `contracts/src/FlashloanReceiver.sol:112-130` (Balancer callback implemented but unreachable)
- Impact: Cannot use Balancer's zero-fee flash loans. Stuck paying Aave's 0.05% fee on every flash loan.
- Fix approach: Add provider detection logic to `executeArbitrage()` that routes to the appropriate flash loan request method based on the provider address. Alternatively, add a `FlashLoanProvider` enum parameter.

**No multi-chain support:**
- Issue: Multiple beads issues track multi-chain support (`flashloaner-dqc` epic, `flashloaner-8so` Arbitrum deployment, `flashloaner-d72` Base deployment, `flashloaner-o1e` multi-chain orchestration) but no implementation exists. The bot hardcodes mainnet pool addresses and chain ID 1.
- Files: `bot/src/config/pools.ts` (mainnet pools only), `bot/src/config/defaults.ts:21-27` (mainnet token addresses)
- Impact: Limited to Ethereum mainnet. L2s (Arbitrum, Base, Optimism) typically have different arbitrage dynamics and lower gas costs.
- Fix approach: Follow the beads epic `flashloaner-dqc` for multi-chain support implementation.

**No dynamic gas pricing:**
- Issue: The `OpportunityDetector` uses a static `gasPriceGwei` configuration value (default 30 gwei) for cost estimation. It does not query current gas prices from the network.
- Files: `bot/src/config/defaults.ts:16` (`gasPriceGwei: 30`), `bot/src/detector/OpportunityDetector.ts:273-276` (static gas cost calculation)
- Impact: Gas cost estimates can be wildly inaccurate during gas spikes (common during high-activity periods when arbitrage opportunities are most frequent). The bot may submit unprofitable transactions or miss profitable ones.
- Fix approach: Query `provider.getFeeData()` for current base fee and priority fee. Use these in opportunity cost estimation.

## Test Coverage Gaps

**Safety integration tests entirely skipped:**
- What's not tested: Combined behavior of CircuitBreaker + ProfitValidator + FlashloanExecutor. All 17 integration scenarios are `vm.skip(true)`.
- Files: `contracts/test/safety/SafetyIntegration.t.sol`
- Risk: The interaction between safety contracts is unverified. A bug in how they compose could allow unsafe operations.
- Priority: High (if CircuitBreaker integration is planned)

**No end-to-end test from bot to contract:**
- What's not tested: The full pipeline from bot opportunity detection through transaction building, submission, and on-chain execution. TypeScript and Solidity tests run in isolation.
- Files: `bot/__tests__/integration/e2e/full-pipeline.test.ts`, `bot/__tests__/integration/e2e/pipeline.test.ts` (exist but test off-chain pipeline only)
- Risk: Integration bugs between the TypeScript ABI encoding and the Solidity decoder could cause silent failures.
- Priority: Medium

**Flashbots/MEV Blocker signers tested with mocks only:**
- What's not tested: Real Flashbots relay communication. Tests mock `fetchFn` to simulate relay responses.
- Files: `bot/__tests__/` (all MEV tests use mock fetch)
- Risk: Real relay behavior differences (rate limiting, response format changes) are not caught.
- Priority: Low (acceptable for unit tests; integration test against Goerli relay would be ideal)

**No fork test for UniswapV3Adapter multi-hop swaps:**
- What's not tested: Multi-hop V3 swaps with real pool state. Fork tests exist for single-hop swaps.
- Files: `contracts/test/fork/UniswapForkTest.sol`
- Risk: Path encoding bugs in `_encodePath()` could cause reverts with real V3 pools.
- Priority: Medium

**CI coverage reports are `continue-on-error: true`:**
- What's not tested: Coverage thresholds are not enforced. Both Solidity and TypeScript coverage steps can fail without blocking the CI pipeline.
- Files: `.github/workflows/ci.yml:96-100` (both coverage steps have `continue-on-error: true`)
- Risk: Coverage can silently regress without anyone noticing.
- Priority: Low

## Prioritized Action Items

1. **CRITICAL**: Wire the execution loop (detector -> builder -> engine) for non-dry-run mode. Without this, the bot cannot trade.
2. **CRITICAL**: Add Balancer flash loan request support (zero-fee flash loans) to reduce operating costs.
3. **HIGH**: Integrate on-chain CircuitBreaker into FlashloanExecutor OR remove unused deployment. Resolve the safety architecture gap.
4. **HIGH**: Integrate HealthMonitor into FlashloanBot for operational visibility.
5. **HIGH**: Replace polling-based price monitoring with WebSocket event-driven updates.
6. **HIGH**: Add dynamic gas price estimation (query network, not hardcoded 30 gwei).
7. **HIGH**: Implement the skipped safety integration tests or delete the file.
8. **MEDIUM**: Add price impact estimation using on-chain `getAmountOut()` queries.
9. **MEDIUM**: Add multi-provider RPC fallback for reliability.
10. **MEDIUM**: Optimize gas: encode swap steps in flash loan params instead of storage.
11. **MEDIUM**: Add nonce management for concurrent transaction handling.
12. **MEDIUM**: Deploy SushiSwap adapter (UniswapV2Adapter pointed at SushiSwap router).
13. **LOW**: Replace `any` types in MEV signer RPC responses with typed interfaces.
14. **LOW**: Add structured logging (pino/winston) to replace console.log.
15. **LOW**: Fix remaining acknowledged audit findings (F-06, F-07, F-08).
16. **LOW**: Transfer contract ownership to multisig before mainnet deployment.

---

*Concerns audit: 2026-02-16*
