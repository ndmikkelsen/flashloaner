---
triggers: ['deploy contracts', 'deploy to mainnet', 'deploy to testnet', 'run deployment', '/deploy']
---

# /deploy -- Gated Foundry Deployment Workflow

Execute ALL steps in order. Enforce: **Test -> Fork Simulate -> User Review -> Testnet -> User Review -> Mainnet**.

Check if user passed `--fork-only` flag. If so, stop after Stage 1 (do not prompt for testnet/mainnet).

## Step 0: Preflight Checks

Verify deployment prerequisites exist:

```bash
# All checks must pass
test -d src/                           # src/ directory exists (Solidity contracts)
test -d script/                        # script/ directory exists (Foundry deploy scripts)
test -f script/Deploy.s.sol            # Deploy script exists
test -f foundry.toml                   # Foundry config exists
```

**On failure:** Show what's missing with remediation steps:
- Missing `src/` -> "No src directory found. Are you in the repo root?"
- Missing `script/` -> "No script directory found. Create deployment scripts in script/"
- Missing `Deploy.s.sol` -> "Create script/Deploy.s.sol with deployment logic"
- Missing `foundry.toml` -> "Run `forge init` or create foundry.toml"

## Step 1: Quality Gates

Run ALL gates. Use parallel execution where possible. **ALL must pass to proceed.**

### 1a: Secret Detection

```bash
gitleaks detect --source . --no-git --config .gitleaks.toml
```

### 1b: Solidity Tests

```bash
forge test -vvv
```

### 1c: TypeScript Bot Tests

```bash
pnpm test
```

### 1d: Gas Report

```bash
forge test --gas-report
```

Review gas report for any unexpectedly high gas costs. Flag any function exceeding reasonable gas limits.

### 1e: Static Analysis (if available)

```bash
# Run Slither if installed
if command -v slither &> /dev/null; then
  slither src/ --config-file slither.config.json
fi
```

**On ANY failure:** STOP immediately. Show which gate(s) failed with full output. Do NOT proceed to deployment.

## Step 2: Safety Checklist

Before any deployment, verify:

```bash
# Check current gas price (mainnet)
cast gas-price --rpc-url $MAINNET_RPC_URL

# Check deployer balance
cast balance $DEPLOYER_ADDRESS --rpc-url $MAINNET_RPC_URL

# Verify environment variables are set
test -n "$MAINNET_RPC_URL"    || echo "MISSING: MAINNET_RPC_URL"
test -n "$TESTNET_RPC_URL"    || echo "MISSING: TESTNET_RPC_URL"
test -n "$DEPLOYER_ADDRESS"   || echo "MISSING: DEPLOYER_ADDRESS"
test -n "$ETHERSCAN_API_KEY"  || echo "MISSING: ETHERSCAN_API_KEY"
```

Display gas price and deployer balance to user before proceeding.

## Stage 1: Fork Simulation

Simulate full deployment on a mainnet fork:

```bash
forge script script/Deploy.s.sol \
  --fork-url $MAINNET_RPC_URL \
  -vvvv
```

### Verification on Fork

After simulation, verify:
- All contracts deployed successfully
- State changes are as expected
- No unexpected reverts
- Gas costs are within acceptable range

**If `--fork-only` was passed:** Display the simulation results and stop here. Say "/deploy fork simulation complete" and do NOT prompt for deployment.

**Otherwise:** Present results to user and display decision block:

```
## Fork Simulation Results

**Contracts Deployed:** [list contract names and addresses]
**Total Gas Used:** [gas estimate]
**Estimated Cost:** [ETH cost at current gas price]

### State Changes
[summary of state changes from simulation]

### Proceed to Testnet?
**Accept** - Deploy to testnet ($TESTNET_RPC_URL)
**Reject** - Cancel deployment (no changes made on any network)
```

Use AskUserQuestion to present Accept/Reject options. **Do NOT proceed until the user explicitly responds.**

## Stage 2: Testnet Deployment (User Approval Required)

Only proceed on explicit acceptance.

**On rejection:** Stop gracefully. Say "Deployment cancelled. No changes were made." Do NOT attempt deployment.

```bash
forge script script/Deploy.s.sol \
  --rpc-url $TESTNET_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  -vvvv
```

### Post-Testnet Verification

```bash
# Verify contracts on block explorer
# (forge verify-contract is handled by --verify flag above)

# Run integration tests against deployed testnet contracts
# DEPLOYED_ADDRESS will be in broadcast output
pnpm run test:integration --network testnet
```

Display testnet results and present mainnet decision:

```
## Testnet Deployment Results

**Network:** [testnet name]
**Contracts Deployed:** [addresses with block explorer links]
**Verification:** [verified/pending]
**Integration Tests:** [pass/fail]

### Proceed to Mainnet?
**Accept** - Deploy to mainnet ($MAINNET_RPC_URL) -- THIS IS IRREVERSIBLE
**Reject** - Stop at testnet (contracts remain on testnet for testing)
```

Use AskUserQuestion to present Accept/Reject options. **Do NOT proceed until the user explicitly responds.**

## Stage 3: Mainnet Deployment (Explicit User Approval Required)

Only proceed on explicit acceptance ("Accept", "yes", "deploy to mainnet", "approve mainnet").

**On rejection:** Stop gracefully. Say "Mainnet deployment cancelled. Testnet contracts remain deployed for testing."

### Final Safety Check

```bash
# Re-check gas price (may have changed)
cast gas-price --rpc-url $MAINNET_RPC_URL

# Re-check deployer balance
cast balance $DEPLOYER_ADDRESS --rpc-url $MAINNET_RPC_URL

# Confirm sufficient balance for deployment + buffer
echo "Ensure deployer has enough ETH for deployment gas + safety margin"
```

### Deploy

```bash
forge script script/Deploy.s.sol \
  --rpc-url $MAINNET_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  -vvvv
```

### Post-Mainnet Verification

```bash
# Verify contract source on Etherscan
# Check deployed bytecode matches expected
cast code $DEPLOYED_ADDRESS --rpc-url $MAINNET_RPC_URL

# Verify contract state
cast call $DEPLOYED_ADDRESS "owner()" --rpc-url $MAINNET_RPC_URL

# Monitor first transactions (if applicable)
echo "Monitor contract activity on Etherscan: https://etherscan.io/address/$DEPLOYED_ADDRESS"
```

## Step 6: Post-Deployment Summary

Display deployment results:

```
## Deployment Complete

### Contracts Deployed
| Contract      | Address    | Network  | Verified |
|---------------|------------|----------|----------|
| [name]        | [address]  | [network]| [yes/no] |

### Gas Summary
| Stage    | Gas Used | Cost (ETH) |
|----------|----------|------------|
| Fork Sim | [gas]    | [estimate] |
| Testnet  | [gas]    | [actual]   |
| Mainnet  | [gas]    | [actual]   |

### Verification Links
- Etherscan: https://etherscan.io/address/[address]
- Contract source: Verified on [explorer]

### Next Steps
- Monitor first flashloan executions
- Verify bot can interact with deployed contracts
- Check gas costs of actual transactions
```

Say "/deploy complete".

## Anti-Patterns

**NEVER:**

- Skip quality gates (Step 1)
- Deploy without fork simulation first
- Deploy to mainnet without testnet verification
- Deploy without explicit user approval at each stage
- Use `--broadcast` on mainnet without user confirmation
- Skip gas price and balance checks
- Deploy with failing tests
- Auto-approve deployment on behalf of the user
- Continue past a failed gate
- Deploy with unresolved Slither findings (high/medium severity)

## Limitations

- Deployment requires funded deployer account
- Etherscan API key required for contract verification
- Gas prices fluctuate -- always check before mainnet deployment
- Fork simulation uses current mainnet state (may differ from actual deployment)
- `--broadcast` makes real transactions -- this is irreversible on mainnet

## Related Documentation

- [Deployment Patterns](.rules/patterns/deployment.md) - Full deployment guide, troubleshooting
- [Contract Architecture](.rules/architecture/contract-architecture.md) - Contract design and upgrade patterns
- [DeFi Security](.rules/patterns/defi-security.md) - Security checklist for DeFi deployments
- [Git Workflow](.rules/patterns/git-workflow.md) - Branching and PR process
- [/land command](.claude/commands/land.md) - Session landing protocol
