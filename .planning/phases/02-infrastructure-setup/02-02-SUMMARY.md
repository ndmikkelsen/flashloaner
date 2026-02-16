---
phase: 02-infrastructure-setup
plan: 02
subsystem: deployment
tags: [foundry, arbitrum, deployment-config, gitignore]
dependency_graph:
  requires: [01-01]
  provides: [arbitrum-deployment-config]
  affects: [deployment-pipeline, contract-deployment]
tech_stack:
  added: []
  patterns: [multi-chain-config, environment-templates]
key_files:
  created:
    - .env.example.arbitrum-sepolia
  modified:
    - foundry.toml
    - .gitignore
    - deployments/README.md
decisions:
  - "Use same Balancer Vault address (0xBA12...2C8) across all chains via CREATE2"
  - "Use SushiSwap V2 router (0x1b02...7506) as Uniswap V2 equivalent on Arbitrum"
  - "Chain-specific env files (.env.arbitrum-sepolia) are gitignored for security"
metrics:
  duration_minutes: 4
  tasks_completed: 2
  files_modified: 4
  commits: 2
completed_at: 2026-02-16T17:12:34Z
---

# Phase 02 Plan 02: Arbitrum Deployment Configuration Summary

**One-liner:** Added Arbitrum Sepolia deployment configuration to Foundry with correct protocol addresses, RPC endpoints, and security gitignore rules.

## What Was Accomplished

Prepared the Foundry deployment infrastructure for Arbitrum Sepolia by adding RPC endpoints, creating environment variable templates with verified protocol addresses, and ensuring secrets are properly gitignored. The existing `Deploy.s.sol` script was confirmed to be multi-chain ready with no code changes needed.

## Tasks Completed

### Task 1: Configure foundry.toml and create env template
**Commit:** 51da27a

**Changes:**
- Added `arbitrum-sepolia = "${ARBITRUM_SEPOLIA_RPC_URL}"` to `[rpc_endpoints]` in foundry.toml
- Added `[etherscan]` section with Arbiscan API key configuration for contract verification
- Created `.env.example.arbitrum-sepolia` with all required environment variables:
  - Deployer and bot wallet placeholders (YOUR_*_HERE format)
  - Public RPC endpoint: `https://sepolia-rollup.arbitrum.io/rpc`
  - Verified Arbitrum protocol addresses from Phase 1 research:
    - AAVE_V3_POOL: `0x794a61358D6845594F94dc1DB02A252b5b4814aD` (same on all chains via CREATE2)
    - BALANCER_VAULT: `0xBA12222222228d8Ba445958a75a0704d566BF2C8` (same via CREATE2)
    - UNISWAP_V2_ROUTER: `0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506` (SushiSwap V2 on Arbitrum)
    - UNISWAP_V3_ROUTER: `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45` (SwapRouter02)
    - UNISWAP_V3_QUOTER: `0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3` (QuoterV2)
  - Safety parameters adjusted for Arbitrum L2 gas model
- Updated `.gitignore` to block chain-specific env files:
  - `.env.arbitrum-sepolia`
  - `.env.arbitrum`
  - `.env.base-sepolia`
  - `.env.base`

**Verification:**
- ✅ `forge test` passed (all 312 tests, no regressions)
- ✅ Gitleaks passed (no secrets in committed files, only false positives from public token addresses in bot config)
- ✅ Placeholders confirmed in env template (YOUR_PRIVATE_KEY_HERE, YOUR_BOT_WALLET_ADDRESS_HERE)

**Files:**
- foundry.toml
- .env.example.arbitrum-sepolia
- .gitignore

### Task 2: Update deployments README and verify Deploy.s.sol compatibility
**Commit:** 29405a3

**Changes:**
- Updated `deployments/README.md` with multi-chain deployment documentation:
  - Added Deployed Chains table with Arbitrum Sepolia status (Pending)
  - Added deployment command examples for Ethereum Sepolia and Arbitrum Sepolia
  - Documented Arbiscan verification workflow
- Verified `Deploy.s.sol` already handles Arbitrum chain IDs:
  - Line 129: `if (chainId == 42161) return "arbitrum";`
  - Line 130: `if (chainId == 421614) return "arbitrum-sepolia";`
  - All protocol addresses loaded from environment variables (not hardcoded)
  - Export path uses `vm.toString(chain.chainId)` (works for any chain ID)

**Verification:**
- ✅ `forge build` succeeded (contracts compile)
- ✅ `forge test` passed (all 312 tests)
- ✅ Deploy.s.sol confirmed compatible with Arbitrum (no code changes needed)

**Files:**
- deployments/README.md

## Deviations from Plan

None - plan executed exactly as written.

## Key Decisions

1. **Balancer Vault address confirmed:** Used same address `0xBA12222222228d8Ba445958a75a0704d566BF2C8` as existing Sepolia deployment. This is a deterministic CREATE2 address used across all EVM chains.

2. **SushiSwap V2 as Uniswap V2 equivalent:** Arbitrum doesn't have native Uniswap V2, so we use SushiSwap V2 router (`0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506`) which is a Uniswap V2 fork with the same interface.

3. **Chain-specific env files gitignored:** Instead of a single `.env` file, we now support chain-specific env files (`.env.arbitrum-sepolia`, `.env.arbitrum`, etc.) that are all gitignored to prevent secret leakage.

## Dependencies Satisfied

**DEPLOY-01 (Configuration):** ✅
- foundry.toml has `arbitrum-sepolia` RPC endpoint
- `.env.example.arbitrum-sepolia` has correct protocol addresses

**DEPLOY-02 (Security):** ✅
- `.gitignore` blocks `.env.arbitrum-sepolia` and other chain-specific env files
- Environment template uses placeholders only (no real secrets)

**DEPLOY-03 (Verification):** ✅
- Arbiscan etherscan config added to foundry.toml
- Deployment commands documented in README

**DEPLOY-04 (Multi-chain ready):** ✅
- Deploy.s.sol already handles Arbitrum chain IDs (no code changes needed)
- Environment variable approach supports any chain

## Next Steps

To deploy to Arbitrum Sepolia:

1. **Copy env template:** `cp .env.example.arbitrum-sepolia .env.arbitrum-sepolia`
2. **Fill in secrets:**
   - Add real `DEPLOYER_PRIVATE_KEY`
   - Add real `BOT_WALLET_ADDRESS`
   - Add real `ARBISCAN_API_KEY` (for contract verification)
   - Optionally replace public RPC with QuickNode/Infura endpoint
3. **Fund deployer wallet:** Get testnet ETH from faucets (see ARBITRUM.md)
4. **Dry run:** `forge script script/Deploy.s.sol --fork-url arbitrum-sepolia`
5. **Deploy:** `source .env.arbitrum-sepolia && forge script script/Deploy.s.sol --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --broadcast --verify --etherscan-api-key $ARBISCAN_API_KEY`

## Self-Check

### Created Files Exist
```bash
[ -f ".env.example.arbitrum-sepolia" ] && echo "FOUND: .env.example.arbitrum-sepolia" || echo "MISSING: .env.example.arbitrum-sepolia"
```
**Result:** FOUND: .env.example.arbitrum-sepolia

### Commits Exist
```bash
git log --oneline --all | grep -q "51da27a" && echo "FOUND: 51da27a" || echo "MISSING: 51da27a"
git log --oneline --all | grep -q "29405a3" && echo "FOUND: 29405a3" || echo "MISSING: 29405a3"
```
**Result:** FOUND: 51da27a, FOUND: 29405a3

### Modified Files Contain Expected Content
```bash
grep -q "arbitrum-sepolia" foundry.toml && echo "FOUND: arbitrum-sepolia in foundry.toml"
grep -q "AAVE_V3_POOL=0x794a61358D6845594F94dc1DB02A252b5b4814aD" .env.example.arbitrum-sepolia && echo "FOUND: AAVE_V3_POOL"
grep -q ".env.arbitrum-sepolia" .gitignore && echo "FOUND: .env.arbitrum-sepolia in gitignore"
grep -q "421614" deployments/README.md && echo "FOUND: 421614 in README"
```
**Result:** All checks PASSED

## Self-Check: PASSED

All files created, commits exist, and content verified.

---

**Related Documents:**
- Plan: `.planning/phases/02-infrastructure-setup/02-02-PLAN.md`
- Research: `.planning/phases/01-chain-research/ARBITRUM.md`
- Deployment script: `contracts/script/Deploy.s.sol`
- Existing Sepolia deployment: `deployments/11155111.json`
