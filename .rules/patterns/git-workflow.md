---
description: Git branching strategy and PR pipeline for the flashloan arbitrage bot
tags: [git, workflow, branching]
last_updated: 2026-02-13
---

# Git Workflow

## NON-NEGOTIABLE RULES

1. **NEVER commit directly to `main` or `dev`**
2. **NEVER push directly to `main` or `dev`**
3. **ALWAYS work on feature branches**
4. **ALWAYS use PR pipeline**: `feature -> dev -> main`

## Mandatory Workflow

```
Local: feature-branch (commit, test)
    |
Remote: origin/feature-branch (push)
    |
PR: feature-branch -> dev (review, merge)
    |
PR: dev -> main (review, merge)
```

## Branch Strategy

### Protected Branches

- **`main`** - Production-ready code, deployed contracts, stable bot
- **`dev`** - Integration branch, tested features

**Protection**: No direct commits or pushes allowed.

### Feature Branches

- **Naming**: `feat/description`, `fix/description`, `docs/description`
- **Lifecycle**: Create -> Work -> Push -> PR -> Merge -> Delete
- **Scope**: One feature/fix per branch

## Step-by-Step Workflow

### 1. Create Feature Branch

```bash
# From dev branch
git checkout dev
git pull origin dev

# Create feature branch
git checkout -b feat/add-curve-adapter
```

### 2. Work on Feature

```bash
# Make changes
# Test locally (both Solidity and TypeScript)
forge test && pnpm test

# Commit with conventional commits (pre-commit hooks will run gitleaks automatically)
git add <files>
git commit -m "feat(contract): add CurveAdapter with 3pool support"
```

**Note**: Pre-commit hooks automatically scan for secrets using gitleaks. See [Environment Security](.rules/patterns/env-security.md) for details.

### 3. Push to Remote

```bash
# Push feature branch
git push origin feat/add-curve-adapter
```

### 4. Create PR to dev

```bash
# Create PR from feature branch to dev
gh pr create --base dev --title "feat: Add Curve Finance adapter" --body "..."
```

### 5. Merge to dev

```bash
# After review and approval
gh pr merge <pr-number> --squash
```

### 6. Create PR to main

```bash
# Create PR from dev to main
gh pr create --base main --title "feat: Add Curve Finance adapter" --body "..."
```

### 7. Merge to main

```bash
# After review and approval
gh pr merge <pr-number> --squash
```

### 8. Clean Up

```bash
# Delete local feature branch
git branch -D feat/add-curve-adapter

# Delete remote feature branch (if not auto-deleted)
git push origin --delete feat/add-curve-adapter
```

## Conventional Commits

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type | Purpose | Example |
|------|---------|---------|
| `feat` | New feature | `feat(contract): add BalancerAdapter` |
| `fix` | Bug fix | `fix(bot): handle RPC timeout gracefully` |
| `docs` | Documentation | `docs(rules): add DeFi security patterns` |
| `refactor` | Code restructuring | `refactor(contract): extract swap routing logic` |
| `test` | Test changes | `test(contract): add CurveAdapter fork tests` |
| `chore` | Maintenance | `chore(deps): update ethers.js to v6.14` |
| `style` | Code style | `style(bot): format with prettier` |
| `perf` | Performance | `perf(contract): optimize gas in swap routing` |

### Scopes

| Scope | Component |
|-------|-----------|
| `contract` | Solidity smart contracts |
| `bot` | TypeScript off-chain bot |
| `dex` | DEX adapter specific changes |
| `security` | Security improvements, audit fixes |
| `deploy` | Deployment scripts, forge scripts |
| `infra` | CI/CD, Docker, tooling |
| `beads` | Issue tracking |

### Examples

```bash
# Contract feature
git commit -m "feat(contract): add Balancer V2 flash loan provider"

# Bot bug fix
git commit -m "fix(bot): handle stale price feeds in OpportunityDetector"

# Security fix
git commit -m "fix(security): add reentrancy guard to emergencyWithdraw"

# DEX adapter
git commit -m "feat(dex): add UniswapV3Adapter with multi-hop support"

# Deployment
git commit -m "feat(deploy): add Arbitrum deployment script"

# Infrastructure
git commit -m "chore(infra): add gas report to CI pipeline"
```

## PR Template for Contract Changes

When submitting PRs that modify Solidity contracts, include:

```markdown
## Summary
Brief description of the contract changes.

## Contract Changes
- [ ] New contract(s): list them
- [ ] Modified contract(s): list them
- [ ] New interface(s): list them

## Testing
- [ ] Unit tests pass: `forge test`
- [ ] Fork tests pass: `forge test --fork-url $RPC`
- [ ] Fuzz tests pass: `forge test --fuzz-runs 1000`
- [ ] Gas report reviewed: `forge test --gas-report`
- [ ] Contract size under 24KB: `forge build --sizes`

## Gas Report
Paste relevant gas report output here.

## Security Checklist
- [ ] No reentrancy vulnerabilities
- [ ] Access control on all admin functions
- [ ] SafeERC20 used for all token transfers
- [ ] Custom errors used (not string reverts)
- [ ] Events emitted for state changes
- [ ] No unchecked external call return values
```

## Merge Conflicts

### Prevention

- Pull `dev` frequently
- Keep feature branches short-lived
- Communicate with team about overlapping work

### Resolution

```bash
# Update feature branch with latest dev
git checkout feat/your-feature
git fetch origin
git merge origin/dev

# Resolve conflicts
# Edit conflicted files
git add <resolved-files>
git commit -m "chore: resolve merge conflicts with dev"

# Push updated branch
git push origin feat/your-feature
```

## Emergency Fixes

If you accidentally commit to `main` or `dev`:

1. **STOP** - Do not push
2. **Notify user** - Explain the mistake
3. **User creates feature branch** and cherry-picks the commit
4. **Reset protected branch** to previous state
5. **Follow normal PR pipeline**

## AI Agent Boundaries

### What AI Can Do

- Commit to current feature branch
- Push to remote feature branch
- Create PRs
- Merge PRs (with user approval)
- Delete feature branches after merge

### What AI Cannot Do

- Create branches (user manages branches)
- Commit directly to `main` or `dev`
- Push directly to `main` or `dev`
- Force push to any branch
- Bypass PR pipeline

## Git Commands Reference

### Branch Management

```bash
# List branches
git branch -a

# Create branch
git checkout -b feat/new-feature

# Switch branch
git checkout dev

# Delete local branch
git branch -D feat/old-feature

# Delete remote branch
git push origin --delete feat/old-feature
```

### Commit Management

```bash
# Stage changes
git add <files>

# Commit with message
git commit -m "feat(scope): description"

# Amend last commit
git commit --amend

# View commit history
git log --oneline --graph
```

### Remote Management

```bash
# Push to remote
git push origin feat/your-feature

# Pull from remote
git pull origin dev

# Fetch all branches
git fetch --all --prune

# View remote branches
git branch -r
```

## Related Documentation

- [Beads Integration](.rules/patterns/beads-integration.md)
- [Deployment Patterns](.rules/patterns/deployment.md)
- [Environment Security](.rules/patterns/env-security.md)
