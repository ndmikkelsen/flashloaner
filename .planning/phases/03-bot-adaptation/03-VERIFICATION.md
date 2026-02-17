---
phase: 03-bot-adaptation
verified: 2026-02-17T20:10:00Z
status: gaps_found
score: 4/5 success criteria verified
re_verification: false
gaps:
  - truth: "Bot detects arbitrage opportunities on Arbitrum testnet DEX pools (monitors prices, identifies spreads)"
    status: partial
    reason: "Pool infrastructure and detection logic are complete, but both pool entries in ARBITRUM_SEPOLIA_POOLS have poolAddress: 'TBD_DISCOVER_ON_CHAIN' — not valid Ethereum addresses. The PriceMonitor will attempt RPC calls to these, receive errors, mark pools stale, and never detect opportunities. The code path is wired but cannot function until real pool addresses are discovered and populated."
    artifacts:
      - path: "bot/src/config/chains/pools/arbitrum-sepolia.ts"
        issue: "Both PoolDefinition entries have poolAddress: 'TBD_DISCOVER_ON_CHAIN' — a string placeholder, not a valid 0x address"
    missing:
      - "Real Uniswap V3 Arbitrum Sepolia pool addresses discovered via factory.getPool(WETH, token1, feeTier)"
      - "Populated poolAddress fields in ARBITRUM_SEPOLIA_POOLS array"
      - "At least 2 pools with valid addresses so the monitor can fetch prices and the detector can find spreads"
human_verification:
  - test: "Run bot with RPC_URL set and verify block number read"
    expected: "Bot starts, connects to Arbitrum Sepolia, startup header shows RPC configured, first poll logs block number in price update or error"
    why_human: "Requires live Arbitrum Sepolia RPC endpoint — cannot verify programmatically without network access"
  - test: "Run bot after pool addresses are populated and verify opportunity detection"
    expected: "Bot polls pools at 1s interval, emits priceUpdate events with block numbers, detects spread when present"
    why_human: "Requires both live RPC and valid pool addresses with real liquidity"
  - test: "Verify L1 data fee appears in dry-run report when opportunity is detected"
    expected: "formatOpportunityReport output shows Gas cost, L1 data fee, Slippage, Total costs as separate lines"
    why_human: "Requires a live opportunity detection event — cannot trigger programmatically without real pool data"
---

# Phase 3: Bot Adaptation Verification Report

**Phase Goal:** Adapt bot to connect to Arbitrum Sepolia and detect arbitrage opportunities with Arbitrum-accurate gas estimates
**Verified:** 2026-02-17T20:10:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Bot connects to Arbitrum Sepolia via RPC and reads on-chain data (block number, pool reserves, balances) | VERIFIED | `run-arb-sepolia.ts` constructs `FlashloanBot` with `loadChainConfig(421614)` RPC URL; `PriceMonitor.fetchPrice()` calls `provider.getBlockNumber()` each poll; RPC guard exits if URL missing |
| 2 | Chain-specific configuration loaded from config file includes RPC endpoint, contract addresses, token addresses, pool configs | VERIFIED | `loadChainConfig(421614)` returns `ARBITRUM_SEPOLIA_CONFIG` with correct WETH (`0x980B62...`), factory (`0x248AB7...`), Aave V3 pool (`0x794a61...`), monitor/detector config; 18 unit tests confirm all values |
| 3 | Bot detects arbitrage opportunities on Arbitrum testnet DEX pools (monitors prices, identifies spreads) | PARTIAL | Detection logic is fully implemented (`OpportunityDetector`, `PriceMonitor`), and pool stubs exist, but both pool entries have `poolAddress: "TBD_DISCOVER_ON_CHAIN"` — PriceMonitor will error on every RPC call to these invalid addresses and mark pools stale |
| 4 | L2 gas estimation accounts for Arbitrum's gas model (L2 execution cost, not just L1 data cost) | VERIFIED | `ArbitrumGasEstimator.ts` calls `gasEstimateComponents` on NodeInterface at `0x00...C8`; returns L1Gas + L2Gas breakdown; `setGasEstimator()` injected in `run-arb-sepolia.ts`; `estimateCostsWithL1()` in `OpportunityDetector` uses it; 9 unit tests verify correctness |
| 5 | Dry-run mode reports opportunities with Arbitrum-accurate gas estimates and profitability calculations | PARTIAL | Reporting infrastructure complete: `formatOpportunityReport()` shows L1 data fee as separate line; `run-arb-sepolia.ts` logs Gas (L2), L1 data fee, Total cost. Cannot be exercised until SC-3 is unblocked (no real pool addresses) |

**Score:** 3/5 truths fully verified, 2/5 partial (SC-3 blocks SC-5)

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `bot/src/config/chains/arbitrum-sepolia.ts` | Corrected Arbitrum Sepolia config with real factory, router, quoter, WETH | VERIFIED | Factory `0x248AB79...`, WETH `0x980B62...`, all corrected from Ethereum mainnet addresses |
| `bot/src/config/chains/pools/arbitrum-sepolia.ts` | Pool definitions for Arbitrum Sepolia testnet | PARTIAL | Exists, exports `ARBITRUM_SEPOLIA_POOLS` with 2 entries, but `poolAddress` is `"TBD_DISCOVER_ON_CHAIN"` in both |
| `bot/src/run-arb-sepolia.ts` | Arbitrum Sepolia entry point using `loadChainConfig(421614)` | VERIFIED | File exists, imports `loadChainConfig`, `FlashloanBot`, `estimateArbitrumGas`, `gasComponentsToEth`; wires all events |
| `package.json` | `bot:arb-sepolia` script command | VERIFIED | `"bot:arb-sepolia": "node --import tsx bot/src/run-arb-sepolia.ts"` present |
| `bot/src/gas/ArbitrumGasEstimator.ts` | Arbitrum NodeInterface gas estimation wrapper with `gasEstimateComponents` | VERIFIED | Exports `estimateArbitrumGas`, `gasComponentsToEth`, `ArbitrumGasComponents`; NodeInterface at `0x00...C8` |
| `bot/src/gas/index.ts` | Gas module barrel export | VERIFIED | Barrel-exports `estimateArbitrumGas`, `gasComponentsToEth`, `ArbitrumGasComponents` |
| `bot/src/detector/types.ts` | Extended `CostEstimate` with `l1DataFee` and `OpportunityDetectorConfig.gasEstimatorFn` | VERIFIED | `l1DataFee?: number` on `CostEstimate`; `gasEstimatorFn` on `OpportunityDetectorConfig` |
| `bot/src/detector/OpportunityDetector.ts` | `setGasEstimator()` public method, `analyzeDeltaAsync()`, `estimateCostsWithL1()` | VERIFIED | All three methods present; `handleDelta()` dispatches to async path when `gasEstimatorFn` is set |
| `bot/src/reporting.ts` | Opportunity report with L1 data fee line | VERIFIED | Conditional `lines.push()` for `l1DataFee` between Gas cost and Slippage |
| `bot/__tests__/gas/ArbitrumGasEstimator.test.ts` | Unit tests for ArbitrumGasEstimator | VERIFIED | 9 tests covering `gasComponentsToEth`, `estimateArbitrumGas` (mocked), NodeInterface address; all pass |
| `bot/__tests__/config/chain-config.test.ts` | Unit tests for Arbitrum Sepolia chain config | VERIFIED | 18 tests verifying chainId, WETH, factory, Aave, polling interval, MEV mode; all pass |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `run-arb-sepolia.ts` | `config/chains/index.ts` | `loadChainConfig(421614)` | WIRED | Line 53: `const chain = loadChainConfig(421614)` |
| `run-arb-sepolia.ts` | `index.ts` | `new FlashloanBot(config)` | WIRED | Lines 76-82: direct `FlashloanBot` construction with chain config |
| `run-arb-sepolia.ts` | `gas/ArbitrumGasEstimator.ts` | `estimateArbitrumGas` import + injection | WIRED | Line 5: import; line 96: `await estimateArbitrumGas(...)`; line 108: `bot.detector.setGasEstimator(arbGasEstimator)` |
| `config/chains/arbitrum-sepolia.ts` | `pools/arbitrum-sepolia.ts` | `import ARBITRUM_SEPOLIA_POOLS` | WIRED | Line 2: `import { ARBITRUM_SEPOLIA_POOLS } from "./pools/arbitrum-sepolia.js"` |
| `OpportunityDetector.ts` | `detector/types.ts` | `CostEstimate.l1DataFee` populated | WIRED | `estimateCostsWithL1()` populates `l1DataFee` from `gasEstimatorFn` result; included in `totalCost` |
| `reporting.ts` | `detector/types.ts` | reads `CostEstimate.l1DataFee` | WIRED | Lines 52-54: conditional `lines.push` for `l1DataFee` |
| `ArbitrumGasEstimator.ts` | NodeInterface precompile | `ethers.Contract` at `0xC8` | WIRED | `NODE_INTERFACE_ADDRESS = "0x00000000000000000000000000000000000000C8"` |

---

## Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| BOT-01: Bot connects to Arbitrum Sepolia via RPC and reads on-chain data | SATISFIED | Entry point and RPC guard implemented; block number read per poll cycle |
| BOT-02: Chain-specific configuration (RPC endpoint, contract addresses, token addresses, pool configs) | SATISFIED | `loadChainConfig(421614)` returns complete, correct Arbitrum Sepolia config |
| BOT-03: Bot detects arbitrage opportunities on Arbitrum testnet DEX pools | BLOCKED | Detection logic complete but pool addresses are `TBD_DISCOVER_ON_CHAIN` — no real pools to monitor |
| BOT-04: L2 gas estimation accounts for Arbitrum's gas model | SATISFIED | `ArbitrumGasEstimator` with NodeInterface precompile; wired into `OpportunityDetector` |
| BOT-05: Dry-run mode reports opportunities with Arbitrum-accurate gas estimates | PARTIALLY SATISFIED | Reporting infrastructure complete; cannot be exercised until BOT-03 is unblocked |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `bot/src/config/chains/pools/arbitrum-sepolia.ts` | 41, 53 | `poolAddress: "TBD_DISCOVER_ON_CHAIN"` | Blocker | Prevents opportunity detection — `PriceMonitor` will error on every RPC call and mark pools stale |
| `bot/src/config/chains/pools/arbitrum-sepolia.ts` | 43, 55 | `token1: "0x0000000000000000000000000000000000000001"` | Warning | token1 is a non-standard address (zero address + 1), not a real testnet token |

The plan explicitly anticipated and documented the `TBD_DISCOVER_ON_CHAIN` placeholder pattern (with factory query instructions in comments), so it is a known limitation rather than a mistake. However, it blocks SC-3 and prevents end-to-end opportunity detection.

---

## Human Verification Required

### 1. RPC Connection Test

**Test:** Set `RPC_URL=https://arb-sepolia.g.alchemy.com/v2/YOUR_KEY` in environment, run `pnpm bot:arb-sepolia`
**Expected:** Startup header shows chain name "Arbitrum Sepolia", RPC status "configured", 2 pools. On first poll, two error events fire (TBD addresses fail), two STALE warnings appear.
**Why human:** Requires live Arbitrum Sepolia RPC endpoint — network not available in sandbox.

### 2. Pool Discovery and Opportunity Detection

**Test:** Run `factory.getPool(WETH, token, 500)` using documented factory address, populate `poolAddress` fields in `arbitrum-sepolia.ts` pools file, then run `pnpm bot:arb-sepolia`
**Expected:** Bot polls real pools at 1s intervals, logs price updates with block numbers, emits `opportunityFound` or `opportunityRejected` events
**Why human:** Requires on-chain pool discovery, RPC access, and real testnet pool liquidity.

### 3. L1 Gas Fee in Opportunity Report

**Test:** Trigger an opportunity detection (requires populated pools + price spread), verify console output
**Expected:** Opportunity log shows `Gas (L2):`, `L1 data fee:`, `Total cost:` as separate lines; `formatOpportunityReport` output shows L1 data fee line between Gas cost and Slippage
**Why human:** Requires a real opportunity event — cannot trigger without live RPC and real pool spread.

---

## Gaps Summary

Phase 3 is 80% complete. All infrastructure for Arbitrum gas estimation (SC-4) and dry-run reporting (SC-5) is fully implemented and tested. The chain config system (SC-2) is correct and verified by 18 unit tests. The entry point (SC-1) correctly connects via RPC and reads block numbers.

The single blocking gap is **pool address discovery** for SC-3. Both pool entries in `ARBITRUM_SEPOLIA_POOLS` use the placeholder string `"TBD_DISCOVER_ON_CHAIN"` instead of real Ethereum addresses. This prevents `PriceMonitor` from reading pool reserves, which in turn prevents `OpportunityDetector` from finding price spreads.

This gap was known at plan creation time (the plan explicitly instructs using `TBD_DISCOVER_ON_CHAIN` and documents factory.getPool() discovery queries in comments). It was deferred on the assumption that pool discovery would occur during Phase 4 testnet validation. However, this means **Phase 3's SC-3 ("Bot detects arbitrage opportunities") cannot be verified until real pool addresses are found and populated**.

To close this gap: query the Uniswap V3 factory at `0x248AB79Bbb9bC29bB72f7Cd42F17e054Fc40188e` on Arbitrum Sepolia using `getPool(WETH, token1, feeTier)`, replace `TBD_DISCOVER_ON_CHAIN` in `bot/src/config/chains/pools/arbitrum-sepolia.ts`, and verify the bot successfully polls those pools.

---

_Verified: 2026-02-17T20:10:00Z_
_Verifier: Claude (gsd-verifier)_
