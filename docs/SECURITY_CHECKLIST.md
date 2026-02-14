# Security Checklist

Structured security verification for each phase of the deployment lifecycle.

## Pre-Development Security

- [ ] `.gitignore` excludes all `.env` files, keystores, and cache directories
- [ ] `.gitleaks.toml` configured with project-specific allowlists
- [ ] Pre-commit hooks installed: `pre-commit install`
- [ ] gitleaks pre-commit hook active and tested
- [ ] Team members briefed on secret handling procedures
- [ ] Separate wallets created for deployer, owner, and bot roles

## Per-PR Security Review

Run before every pull request:

### Code Quality

- [ ] `forge test -vvv` — all Solidity tests pass
- [ ] `pnpm test` — all TypeScript tests pass
- [ ] No new compiler warnings: `forge build 2>&1 | grep -i warning`
- [ ] No hardcoded addresses (use env vars or constructor params)
- [ ] No `TODO` or `FIXME` comments in security-critical code

### Secret Scanning

- [ ] `gitleaks detect --source . --no-git` — no secrets detected
- [ ] No private keys, API keys, or RPC URLs in changed files
- [ ] `.env.example` uses only placeholder values
- [ ] No credentials in comments or documentation

### Smart Contract Security

- [ ] Checks-Effects-Interactions pattern followed in all state-changing functions
- [ ] `nonReentrant` modifier on all functions that make external calls
- [ ] `onlyOwner` / `onlyBot` on all restricted functions
- [ ] `whenNotPaused` on all execution functions
- [ ] Custom errors used (not string reverts)
- [ ] `safeTransfer` / `safeApprove` used for all ERC20 operations
- [ ] No unchecked external call return values
- [ ] Gas limits set on low-level `.call()` operations

### TypeScript Security

- [ ] No secrets logged (even at debug level)
- [ ] No `eval()` or dynamic code execution
- [ ] All user/external inputs validated
- [ ] Error messages don't expose internal state

## Per-Merge Security Review (to dev)

Run before merging to `dev`:

### All PR Checks Above, Plus:

- [ ] Full security scan: `./scripts/security-scan.sh`
- [ ] No new Slither high or medium findings
- [ ] Code review by at least one team member
- [ ] New tests cover all changed code paths

### Static Analysis

```bash
# Run Slither
./scripts/security-scan.sh slither

# Check for specific high-risk patterns
slither . --detect reentrancy-eth,reentrancy-no-eth,unchecked-transfer,arbitrary-send-erc20
```

- [ ] No reentrancy vulnerabilities
- [ ] No unchecked token transfers
- [ ] No arbitrary send patterns
- [ ] No uninitialized state variables
- [ ] No shadowed state variables

## Per-Release Security Review (to main)

Run before merging to `main`:

### All Dev Checks Above, Plus:

### Coverage

```bash
./scripts/coverage-report.sh --check
```

- [ ] Safety contracts (CircuitBreaker, ProfitValidator): 100% line, 95% branch
- [ ] Core contracts (FlashloanExecutor, FlashloanReceiver): 95% line, 90% branch
- [ ] DEX adapters: 90% line, 80% branch
- [ ] Overall: 90% line, 80% branch

### Extended Testing

```bash
# Security profile: 10K fuzz runs
FOUNDRY_PROFILE=security forge test

# Fork tests against current mainnet
forge test --fork-url $ETH_RPC_URL -vvv
```

- [ ] Extended fuzz tests pass (10,000 runs)
- [ ] Invariant tests pass (1,000 runs, depth 50)
- [ ] Fork tests pass against current mainnet state
- [ ] Fork tests pass against each target chain

### Contract Verification

```bash
forge build --sizes
```

- [ ] All contracts under 24KB size limit
- [ ] Gas report reviewed: `forge test --gas-report`
- [ ] `executeArbitrage` gas within target (< 300K for 2-hop, excluding DEX gas)
- [ ] Safety check overhead < 10K gas

## Pre-Deployment Security Review

### Before Testnet Deployment

- [ ] All `main` branch checks above pass
- [ ] Deployment script tested on local fork: `forge script script/Deploy.s.sol --fork-url $ETH_RPC_URL -vvvv`
- [ ] Constructor arguments validated (correct WETH, Aave Pool addresses for target chain)
- [ ] Safety parameter values reviewed:
  - `maxGasPrice`: Appropriate for target chain
  - `minProfit`: Covers gas costs with margin
  - `maxTradeSize`: Within acceptable risk tolerance
- [ ] Bot wallet address confirmed correct
- [ ] Emergency functions tested on fork:
  - `pause()` / `unpause()` work correctly
  - `emergencyWithdraw(token)` recovers tokens
  - `emergencyWithdrawETH()` recovers ETH

### Before Mainnet Deployment

All testnet checks above, plus:

- [ ] **Internal security review completed** — Document findings and resolutions
- [ ] **Testnet deployment running successfully for 24+ hours**
- [ ] **No revert issues on testnet**

#### Access Control Verification

- [ ] Deployer wallet is hardware wallet (not hot wallet)
- [ ] Owner will be transferred to multi-sig post-deployment
- [ ] Bot wallet contains only minimal gas funds
- [ ] Bot wallet private key stored in encrypted keystore

#### Contract Audit Status

- [ ] Internal review: all team members reviewed contract code
- [ ] Slither: zero high/medium findings
- [ ] Fuzz testing: 10K+ runs, zero failures
- [ ] Invariant testing: 1K+ runs, all invariants hold
- [ ] Fork testing: all target chains tested

#### Testnet Validation

- [ ] All contracts verified on testnet explorer
- [ ] All adapters registered and functional
- [ ] Bot executed successful dry-run trades on testnet
- [ ] Pause mechanism tested: paused and unpaused successfully
- [ ] Emergency withdrawal tested: tokens and ETH recovered
- [ ] Parameter updates tested: gas price, profit threshold, trade size

#### Final Deployment Gates

- [ ] Team sign-off obtained (explicit approval from all reviewers)
- [ ] Deployment window agreed (avoid high gas periods)
- [ ] Rollback plan documented and rehearsed
- [ ] Emergency contacts available during deployment
- [ ] Multi-sig setup ready for ownership transfer
- [ ] Monitoring and alerting configured and tested

## Post-Deployment Security Verification

### Immediately After Deployment

- [ ] All contracts verified on mainnet explorer
- [ ] `owner()` returns expected address
- [ ] `botWallet()` returns expected address
- [ ] `paused()` returns `false`
- [ ] All adapters registered: `approvedAdapters(addr)` returns `true`
- [ ] Safety parameters match intended values
- [ ] No unexpected transactions on contract (check explorer)

### Within 24 Hours

- [ ] Ownership transferred to multi-sig
- [ ] Bot running in dry-run mode successfully
- [ ] First live trade executed successfully
- [ ] No error spikes in monitoring
- [ ] Alerting system triggered test alert successfully

### Ongoing (Weekly)

- [ ] Review bot logs for anomalies
- [ ] Check for new Slither findings after dependency updates
- [ ] Monitor protocol upgrade announcements (Aave, Uniswap, etc.)
- [ ] Rotate bot wallet if schedule requires
- [ ] Review and update safety parameters based on market conditions

## Incident Response Checklist

If a security incident is suspected:

### Immediate (Within Minutes)

1. [ ] **Pause the contract**: `cast send <EXECUTOR> "pause()" --private-key $OWNER_KEY --rpc-url $RPC`
2. [ ] **Stop the bot process**
3. [ ] **Verify pause**: `cast call <EXECUTOR> "paused()(bool)" --rpc-url $RPC` returns `true`
4. [ ] **Check for fund loss**: Review recent transactions on explorer

### Short-Term (Within Hours)

5. [ ] **Withdraw remaining funds**: `cast send <EXECUTOR> "emergencyWithdraw(address)" $TOKEN --private-key $OWNER_KEY --rpc-url $RPC`
6. [ ] **Rotate bot wallet** if key compromise suspected
7. [ ] **Rotate RPC keys** if endpoint compromise suspected
8. [ ] **Investigate root cause**: Review logs, on-chain transactions
9. [ ] **Document findings**

### Recovery

10. [ ] **Fix vulnerability** (if contract bug: deploy new version)
11. [ ] **Run full security review** before resuming
12. [ ] **Resume in dry-run mode** first
13. [ ] **Monitor closely** for first 24 hours after recovery

## Related Documentation

- [Security Policy](SECURITY.md) — Threat model and defense layers
- [Deployment Guide](DEPLOYMENT.md) — Deployment procedures
- [Disaster Recovery](DISASTER_RECOVERY.md) — Emergency procedures
- [Operations Runbook](OPERATIONS.md) — Day-to-day operations
