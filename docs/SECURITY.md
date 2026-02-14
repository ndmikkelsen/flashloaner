# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability in this project, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Contact: Open a private security advisory via GitHub's Security tab, or email the maintainers directly.

## Security Architecture

### Threat Model

This is a **flash loan arbitrage bot** — an operator-controlled system (not a user-facing protocol). The primary threats are:

| Threat | Vector | Mitigation |
|--------|--------|------------|
| **Fund loss from contract exploit** | Reentrancy, logic bugs | ReentrancyGuard, profit validation, fuzz testing |
| **MEV extraction** | Sandwich attacks, front-running | Flashbots private submission, slippage limits |
| **Private key compromise** | Leaked secrets in git | gitleaks pre-commit, wallet separation, minimal hot wallet funding |
| **Oracle manipulation** | Spot price manipulation | TWAP for detection, atomic profit validation for execution |
| **Gas griefing** | Excessive gas consumption | Circuit breaker (maxGasPrice), gas limits on external calls |
| **Unprofitable trades** | Network conditions, stale data | Minimum profit threshold, dry-run mode |

### Defense Layers

```
Layer 1: Pre-commit (gitleaks) ─── Blocks secret commits
Layer 2: Static Analysis (Slither) ─── Catches common vulnerabilities
Layer 3: Unit Tests (forge test) ─── Verifies expected behavior
Layer 4: Fuzz Tests (forge test --fuzz-runs 10000) ─── Discovers edge cases
Layer 5: Invariant Tests ─── Verifies properties across random call sequences
Layer 6: Fork Tests ─── Validates against real mainnet state
Layer 7: On-chain Safety Module ─── Runtime circuit breakers and profit validation
```

### On-Chain Safety Controls

| Control | Contract | Description |
|---------|----------|-------------|
| **Pause mechanism** | CircuitBreaker | Owner can halt all execution instantly |
| **Max gas price** | CircuitBreaker | Revert if `tx.gasprice > maxGasPrice` |
| **Max trade size** | CircuitBreaker | Revert if flash loan amount > limit |
| **Profit validation** | ProfitValidator | Revert if `balanceAfter - balanceBefore < minProfit` |
| **Access control** | FlashloanExecutor | Two-tier: owner (admin) + bot (execution only) |
| **Reentrancy guard** | FlashloanExecutor | OpenZeppelin `nonReentrant` on all external calls |
| **Emergency withdraw** | FlashloanExecutor | Owner can sweep stuck tokens/ETH |

### Off-Chain Safety Controls

| Control | Component | Description |
|---------|-----------|-------------|
| **Gas price filter** | ExecutionEngine | Skip opportunities when gas exceeds threshold |
| **Slippage filter** | OpportunityDetector | Reject if price impact > `MAX_SLIPPAGE_BPS` |
| **Dry-run mode** | ExecutionEngine | `DRY_RUN=true` (default) — log but don't execute |
| **Profit threshold** | OpportunityDetector | Skip if estimated profit < `MIN_PROFIT_WEI` |
| **Balance monitoring** | HealthMonitor | Alert when bot wallet balance drops below minimum |

## Security Review Process

### Before Every PR

1. `forge test -vvv` — all tests pass
2. `gitleaks detect --source . --no-git` — no leaked secrets
3. `forge build --sizes` — contract size < 24KB

### Before Merging to `dev`

1. All PR checks above
2. `./scripts/security-scan.sh` — full security scan
3. Code review by at least one other team member
4. No new Slither high/medium findings

### Before Merging to `main`

1. All `dev` checks above
2. `./scripts/coverage-report.sh --check` — coverage thresholds met
3. Extended fuzz testing: `forge test --fuzz-runs 10000`
4. Fork tests pass against current mainnet state

### Before Mainnet Deployment

1. All `main` checks above
2. Manual security review (beads: `flashloaner-2j0`)
3. Slither zero high/medium findings (beads: `flashloaner-8uc`)
4. Formal verification of profit validation (beads: `flashloaner-46p`, P2)
5. Deploy to fork first, then testnet, then mainnet
6. Multi-sig ownership transfer after deployment

## Known Risks and Mitigations

### Accepted Risks

| Risk | Severity | Mitigation | Status |
|------|----------|------------|--------|
| Bot wallet is a hot wallet | Medium | Minimal funding (~0.1 ETH for gas), regular rotation | Accepted |
| Spot prices used for on-chain swaps | Low | Atomic profit validation catches manipulation | Accepted |
| Single-operator system | Low | Not a user-facing protocol; operator bears all risk | Accepted |

### Risks Requiring Ongoing Monitoring

| Risk | Monitor | Action |
|------|---------|--------|
| Flash loan provider fee changes | Protocol announcements | Update fee calculations |
| DEX router contract upgrades | Protocol governance | Test against new versions |
| Gas market volatility | Real-time gas oracle | Adjust `maxGasPrice` dynamically |
| New MEV attack vectors | Security research, audits | Update protection strategies |

## Security Tools

### Slither (Static Analysis)

```bash
# Full scan
slither . --config-file slither.config.json

# Quick scan (high/medium only)
slither . --config-file slither.config.json --exclude-low --exclude-informational

# Specific detectors
slither . --detect reentrancy-eth,reentrancy-no-eth,unchecked-transfer
```

### Gitleaks (Secret Detection)

```bash
# Scan working directory
gitleaks detect --source . --no-git

# Scan git history
gitleaks detect --source .

# Verbose output
gitleaks detect --source . --no-git -v
```

### Forge (Testing & Coverage)

```bash
# Standard tests
forge test -vvv

# Extended fuzz
forge test --fuzz-runs 10000

# Gas report
forge test --gas-report

# Coverage
forge coverage

# Fork tests
forge test --fork-url $MAINNET_RPC_URL -vvv
```

### Automated Security Scan

```bash
# Run all security checks
./scripts/security-scan.sh

# Individual checks
./scripts/security-scan.sh slither
./scripts/security-scan.sh secrets
./scripts/security-scan.sh tests
./scripts/security-scan.sh gas
./scripts/security-scan.sh fuzz
```

### Coverage Report

```bash
# Summary
./scripts/coverage-report.sh

# LCOV report for CI
./scripts/coverage-report.sh --lcov

# Check against thresholds
./scripts/coverage-report.sh --check
```

## Coverage Thresholds

| Contract Category | Line Coverage | Branch Coverage |
|-------------------|---------------|-----------------|
| **Safety contracts** (CircuitBreaker, ProfitValidator) | 100% | 95% |
| **Core contracts** (FlashloanExecutor, FlashloanReceiver) | 95% | 90% |
| **DEX adapters** | 90% | 80% |
| **Overall** | 90% | 80% |

## Gas Optimization Targets

| Operation | Target Gas | Notes |
|-----------|-----------|-------|
| `executeArbitrage` (2-hop) | < 300,000 | Excluding DEX swap gas |
| `executeArbitrage` (3-hop) | < 450,000 | Excluding DEX swap gas |
| Safety checks overhead | < 10,000 | Circuit breaker + profit validation |
| Storage reads (params) | < 5,000 | Use immutables where possible |
| Custom error revert | < 100 | vs ~200 for string revert |

## Related Documentation

- [DeFi Security Patterns](../.rules/patterns/defi-security.md)
- [Environment Security](../.rules/patterns/env-security.md)
- [Contract Architecture](../.rules/architecture/contract-architecture.md)
- [Security Testing Checklist](../contracts/test/safety/SECURITY_CHECKLIST.md)
- [Deployment Protocol](../.rules/patterns/deployment.md)
