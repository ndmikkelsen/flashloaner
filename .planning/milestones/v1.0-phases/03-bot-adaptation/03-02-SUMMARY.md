---
phase: 03-bot-adaptation
plan: 02
subsystem: gas
tags: [arbitrum, gas-estimation, ethers-v6, nodejs, typescript]

# Dependency graph
requires:
  - phase: 01-chain-research
    provides: "Dual-component gas model decision (L1 data fees = 95% of total cost)"
  - phase: 02-infrastructure-setup
    provides: "Arbitrum chain config and contract deployment context"
provides:
  - "ArbitrumGasEstimator module calling NodeInterface precompile at 0xC8"
  - "ArbitrumGasComponents interface with L1/L2 gas breakdown"
  - "gasComponentsToEth convenience function"
  - "gas/index.ts barrel export"
  - "CostEstimate.l1DataFee optional field (backward compatible)"
affects:
  - 03-03-bot-adaptation
  - 03-04-bot-adaptation

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "NodeInterface precompile accessed via raw ethers.js v6 Contract (no @arbitrum/sdk dependency)"
    - "Optional l1DataFee on CostEstimate preserves backward compatibility"
    - "gasComponentsToEth converts bigint wei values to floating-point ETH for profit comparison"

key-files:
  created:
    - bot/src/gas/ArbitrumGasEstimator.ts
    - bot/src/gas/index.ts
  modified:
    - bot/src/detector/types.ts

key-decisions:
  - "Raw ethers.js v6 Contract for NodeInterface (avoids ethers v5/v6 conflicts from @arbitrum/sdk)"
  - "l1DataFee is optional on CostEstimate to preserve backward compatibility with existing tests and OpportunityDetector"
  - "totalCostWei computed as totalGas * baseFee (NodeInterface's combined L1+L2 estimate)"

patterns-established:
  - "Arbitrum gas estimation: call gasEstimateComponents on NodeInterface at 0x00000000000000000000000000000000000000C8"
  - "L1 data fee isolation: l1Gas = gasEstimateForL1, l2Gas = totalGas - l1Gas"

# Metrics
duration: 2min
completed: 2026-02-17
---

# Phase 3 Plan 02: Arbitrum Gas Estimator Summary

**ArbitrumGasEstimator module using NodeInterface precompile at 0xC8 for dual-component L1/L2 gas breakdown, with CostEstimate extended to carry L1 data fee field**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-17T19:50:21Z
- **Completed:** 2026-02-17T19:51:59Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created ArbitrumGasEstimator.ts calling `gasEstimateComponents` on NodeInterface precompile at `0x00000000000000000000000000000000000000C8` via ethers.js v6 Contract
- Defined ArbitrumGasComponents interface with totalGas, l1Gas, l2Gas, baseFee, l1BaseFeeEstimate, totalCostWei — all as bigint
- Added gasComponentsToEth convenience function converting bigint gas values to floating-point ETH for profitability comparison
- Extended CostEstimate with optional `l1DataFee?: number` field (backward compatible — all 423 existing tests pass unchanged)
- Created gas/index.ts barrel export for clean module import by Plan 03-03

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ArbitrumGasEstimator module with NodeInterface wrapper** - `dd88e76` (feat)
2. **Task 2: Extend CostEstimate type with l1DataFee field** - `0bc057b` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified

- `bot/src/gas/ArbitrumGasEstimator.ts` - NodeInterface precompile wrapper with estimateArbitrumGas and gasComponentsToEth exports
- `bot/src/gas/index.ts` - Barrel export for gas module
- `bot/src/detector/types.ts` - Added l1DataFee?: number to CostEstimate, updated gasCost and totalCost JSDoc

## Decisions Made

- **Raw ethers.js v6 Contract for NodeInterface:** Using `new Contract(NODE_INTERFACE_ADDRESS, ABI, provider)` directly avoids the `@arbitrum/sdk` dependency which pulls in ethers v5 and creates version conflicts with our ethers v6 codebase.
- **l1DataFee optional on CostEstimate:** Making the field optional (`l1DataFee?: number`) preserves backward compatibility. All 423 existing tests and OpportunityDetector continue working without modification. Plan 03-03 will populate this field when integrating the gas estimator.
- **totalCostWei = totalGas * baseFee:** NodeInterface's `gasEstimate` is the combined L1+L2 value multiplied by the L2 baseFee — this gives the correct wei approximation for on-chain cost.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `estimateArbitrumGas` and `ArbitrumGasComponents` are ready for integration in Plan 03-03 (OpportunityDetector integration)
- `CostEstimate.l1DataFee` field ready for population in Plan 03-03
- No blockers

---
*Phase: 03-bot-adaptation*
*Completed: 2026-02-17*

## Self-Check: PASSED

- FOUND: bot/src/gas/ArbitrumGasEstimator.ts
- FOUND: bot/src/gas/index.ts
- FOUND: bot/src/detector/types.ts
- FOUND: .planning/phases/03-bot-adaptation/03-02-SUMMARY.md
- FOUND: dd88e76 (Task 1 commit - ArbitrumGasEstimator)
- FOUND: 0bc057b (Task 2 commit - CostEstimate l1DataFee)
