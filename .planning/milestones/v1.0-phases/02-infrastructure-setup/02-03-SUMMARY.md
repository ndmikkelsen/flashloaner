---
phase: 02-infrastructure-setup
plan: 03
subsystem: deployment-config
tags: [config, balancer, arbitrum, gap-closure]
dependency-graph:
  requires: [02-02]
  provides: [balancer-vault-addresses]
  affects: [deployment-scripts, chain-configs]
tech-stack:
  added: []
  patterns: [deterministic-deployment, create2-addresses]
key-files:
  created: []
  modified:
    - bot/src/config/chains/arbitrum.ts
    - bot/src/config/chains/arbitrum-sepolia.ts
decisions:
  - "Used Balancer V2 Vault address 0xBA12222222228d8Ba445958a75a0704d566BF2C8 (same on all chains via CREATE2)"
  - "Confirmed address consistency with existing Sepolia deployment and env template"
metrics:
  duration: 63s
  completed: 2026-02-16T17:33:46Z
---

# Phase 02 Plan 03: Fix Balancer Vault Placeholder Summary

**One-liner:** Replaced zero-address placeholders with real Balancer V2 Vault address (0xBA12222222228d8Ba445958a75a0704d566BF2C8) in both Arbitrum chain configs, fixing Deploy.s.sol validation check.

## Objective

Fix Balancer Vault placeholder addresses in Arbitrum chain configs. The verification report found that both `arbitrum.ts` and `arbitrum-sepolia.ts` used `0x0000000000000000000000000000000000000000` as the Balancer Vault address, which would cause Deploy.s.sol to revert on the `require(chain.balancerVault != address(0))` validation check.

## Work Completed

### Task 1: Fix Balancer Vault placeholder in Arbitrum chain configs
**Status:** ✅ Complete
**Commit:** 77deb5e
**Files Modified:**
- `bot/src/config/chains/arbitrum.ts`
- `bot/src/config/chains/arbitrum-sepolia.ts`

**Changes:**
- Updated `arbitrum.ts`: Replaced `balancerVault: "0x0000000000000000000000000000000000000000"` with `balancerVault: "0xBA12222222228d8Ba445958a75a0704d566BF2C8"`
- Updated `arbitrum-sepolia.ts`: Replaced `balancerVault: "0x0000000000000000000000000000000000000000"` with `balancerVault: "0xBA12222222228d8Ba445958a75a0704d566BF2C8"`
- Updated comments to reflect CREATE2 deterministic deployment across all chains

**Verification:**
1. ✅ `grep` confirms real address present in both files
2. ✅ `grep` confirms no zero-address placeholders for balancerVault
3. ✅ All TypeScript tests pass (423 tests in 17 test suites)
4. ✅ All Solidity tests pass (312 tests, 0 failed, 17 skipped)

## Deviations from Plan

None - plan executed exactly as written.

## Key Technical Decisions

**Decision 1: Use same Balancer Vault address for both mainnet and testnet**
- **Context:** Balancer V2 Vault uses CREATE2 deployment, resulting in same address on all EVM chains
- **Chosen approach:** Use `0xBA12222222228d8Ba445958a75a0704d566BF2C8` for both Arbitrum mainnet and Arbitrum Sepolia
- **Rationale:** Address already confirmed by existing Sepolia deployment (deployments/11155111.json) and env template (.env.example.arbitrum-sepolia)
- **Impact:** Simplifies deployment scripts and chain configs, ensures consistency across networks

**Decision 2: Update comments to reflect CREATE2 deployment**
- **Context:** Previous comments said "TBD - resolve during Phase 3"
- **Chosen approach:** Replace with "Balancer V2 Vault (same on all chains via CREATE2)"
- **Rationale:** Documents the architectural reason why this address works everywhere
- **Impact:** Improves code documentation and future maintainability

## Outcomes

### Success Criteria Met
- ✅ Balancer Vault address is `0xBA12222222228d8Ba445958a75a0704d566BF2C8` in both config files
- ✅ No regressions in test suite (all tests pass)
- ✅ Deploy.s.sol validation check will no longer revert on zero-address

### Files Modified
| File | Changes | Purpose |
|------|---------|---------|
| `bot/src/config/chains/arbitrum.ts` | Updated balancerVault address and comment | Arbitrum mainnet config with real Balancer Vault |
| `bot/src/config/chains/arbitrum-sepolia.ts` | Updated balancerVault address and comment | Arbitrum Sepolia config with real Balancer Vault |

### Next Steps
- Deploy contracts to Arbitrum Sepolia with validated chain config
- Verify Balancer flashloan integration works with real Vault address
- Continue Phase 2 infrastructure setup

## Self-Check: PASSED

**Files created/modified verification:**
```bash
✅ FOUND: bot/src/config/chains/arbitrum.ts
✅ FOUND: bot/src/config/chains/arbitrum-sepolia.ts
```

**Commit verification:**
```bash
✅ FOUND: 77deb5e (fix(02-03): replace Balancer Vault placeholder with real address)
```

**Content verification:**
```bash
✅ FOUND: 0xBA12222222228d8Ba445958a75a0704d566BF2C8 in arbitrum.ts
✅ FOUND: 0xBA12222222228d8Ba445958a75a0704d566BF2C8 in arbitrum-sepolia.ts
✅ NOT FOUND: Zero-address placeholder for balancerVault in either file
```

All verification checks passed. Plan 02-03 executed successfully.
