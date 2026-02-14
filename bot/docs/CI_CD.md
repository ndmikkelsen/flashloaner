# CI/CD Pipeline

## Overview

The project uses GitHub Actions for continuous integration, security scanning, performance monitoring, and deployment automation.

## Workflows

### CI (`.github/workflows/ci.yml`)

**Triggers:** Push to any branch, PRs to main/dev, manual dispatch

| Job | Description |
|-----|-------------|
| **Solidity Tests** | `forge fmt --check`, `forge build --sizes`, `forge test` with CI profile (1000 fuzz runs) |
| **TypeScript Tests** | `pnpm typecheck`, `pnpm test` |
| **Coverage** | `forge coverage`, `vitest --coverage` (runs after tests pass) |
| **Security Scan** | Gitleaks secret detection, `pnpm audit` |

### Security (`.github/workflows/security.yml`)

**Triggers:** Push/PR to main/dev, manual dispatch

| Job | Description |
|-----|-------------|
| **Slither** | Static analysis of Solidity contracts (excludes lib/, test/) |
| **Gitleaks** | Secret detection across full git history |
| **Dependency Audit** | `pnpm audit` for known vulnerabilities |
| **Gas Report** | `forge test --gas-report` for gas consumption tracking |

### Deploy (`.github/workflows/deploy.yml`)

**Triggers:** Manual dispatch only (workflow_dispatch)

**Inputs:**
- `network`: `sepolia` or `mainnet`
- `dry_run`: Simulate only (default: true)

**Sepolia deployment:**
1. Build and test contracts
2. Deploy with `--broadcast` (or simulate with dry run)
3. Verify on Etherscan

**Mainnet deployment:**
1. Build contracts
2. Run full test suite with security profile (10000 fuzz runs)
3. Run safety-specific tests
4. Deploy (requires `production` environment approval)
5. Verify on Etherscan

### Performance (`.github/workflows/performance.yml`)

**Triggers:** PRs to main/dev, manual dispatch

| Job | Description |
|-----|-------------|
| **Bot Benchmarks** | Runs integration performance tests, comments results on PR |
| **Gas Comparison** | Generates gas report artifact for Solidity contracts |

**Benchmark thresholds:**
- 2-pool poll cycle: < 50ms
- 10-pool poll cycle: < 100ms
- 100 consecutive cycles: < 2s total (avg < 20ms/cycle)
- 1000 opportunity analyses: < 100ms (avg < 0.1ms)
- Memory accumulation: none

## Configuration

### Dependabot (`.github/dependabot.yml`)

- Weekly updates for GitHub Actions and npm dependencies
- Major ethers.js bumps ignored (v6 → v7 would be breaking)

### Required Secrets

| Secret | Used By | Description |
|--------|---------|-------------|
| `GITLEAKS_LICENSE` | CI, Security | Gitleaks action license key |
| `SEPOLIA_RPC_URL` | Deploy | Sepolia RPC endpoint |
| `MAINNET_RPC_URL` | Deploy | Mainnet RPC endpoint |
| `DEPLOYER_PRIVATE_KEY` | Deploy | Deployer wallet private key |
| `ETHERSCAN_API_KEY` | Deploy | Etherscan verification key |

### Foundry Profiles

| Profile | Fuzz Runs | Invariant Runs | Used In |
|---------|-----------|----------------|---------|
| `default` | 256 | 256 | Local development |
| `ci` | 1000 | 500 | CI workflow, gas reports |
| `security` | 10000 | 1000 | Security workflow, mainnet deploy |

## Adding New Workflows

1. Create workflow file in `.github/workflows/`
2. Follow existing patterns for checkout, Foundry/Node setup
3. Use `persist-credentials: false` on checkout for security
4. Use `pnpm install --frozen-lockfile` for reproducible installs
5. Document the workflow in this file
