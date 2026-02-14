# Contributing

## Development Workflow

### Branch Strategy

All work happens on feature branches. Protected branches (`main`, `dev`) require pull requests.

```
feature branch → PR → dev → PR → main
```

### Branch Naming

- `feat/description` — New features
- `fix/description` — Bug fixes
- `docs/description` — Documentation
- `refactor/description` — Code restructuring
- `test/description` — Test additions

### Step-by-Step

```bash
# 1. Start from dev
git checkout dev && git pull origin dev

# 2. Create feature branch
git checkout -b feat/your-feature

# 3. Make changes and test
forge test && pnpm test

# 4. Commit with conventional commits
git add <files>
git commit -m "feat(scope): description"

# 5. Push and create PR
git push origin feat/your-feature
gh pr create --base dev --title "feat: Your feature"
```

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

### Types

| Type | Use For |
|------|---------|
| `feat` | New functionality |
| `fix` | Bug fixes |
| `docs` | Documentation only |
| `refactor` | Code restructuring (no behavior change) |
| `test` | Test additions or changes |
| `chore` | Maintenance, dependencies, tooling |
| `perf` | Performance improvements |

### Scopes

| Scope | Component |
|-------|-----------|
| `contract` | Solidity smart contracts |
| `bot` | TypeScript off-chain bot |
| `dex` | DEX adapter changes |
| `security` | Security improvements |
| `deploy` | Deployment scripts |
| `infra` | CI/CD, tooling |

### Examples

```bash
git commit -m "feat(contract): add BalancerAdapter with flash loan support"
git commit -m "fix(bot): handle stale price feeds in OpportunityDetector"
git commit -m "test(contract): add fuzz tests for profit validation"
git commit -m "chore(infra): add gas report to CI pipeline"
```

## Code Style

### Solidity

- Solidity 0.8.24, optimizer enabled (200 runs)
- Use custom errors (not string reverts)
- Use `calldata` for read-only parameters
- NatSpec comments on all public/external functions
- Explicit visibility on all functions and state variables
- Follow Foundry formatter config (`forge fmt`)

### TypeScript

- Strict mode enabled
- ES2022 target, NodeNext module resolution
- Type annotations on function parameters and return types
- `camelCase` for functions and variables
- `PascalCase` for classes, types, interfaces
- `UPPER_SNAKE_CASE` for constants

## Testing Requirements

All changes must pass:

```bash
forge test && pnpm test
```

### For Contract Changes

- Unit tests with mocked dependencies
- Fuzz tests for functions accepting external input
- Fork tests if interacting with external protocols
- Gas report review (`forge test --gas-report`)
- Contract size under 24KB (`forge build --sizes`)

### For Bot Changes

- Unit tests for all public methods
- Integration tests for module boundaries
- Performance benchmarks for latency-sensitive code
- Type checking passes (`pnpm typecheck`)

## PR Process

### PR Template (Contract Changes)

```markdown
## Summary
Brief description of changes.

## Testing
- [ ] forge test passes
- [ ] pnpm test passes
- [ ] Fork tests pass (if applicable)
- [ ] Gas report reviewed
- [ ] Contract size under 24KB

## Security Checklist
- [ ] No reentrancy vulnerabilities
- [ ] Access control on admin functions
- [ ] SafeERC20 for token transfers
- [ ] Custom errors used
- [ ] Events emitted for state changes
```

### PR Template (Bot Changes)

```markdown
## Summary
Brief description of changes.

## Testing
- [ ] pnpm test passes
- [ ] pnpm typecheck passes
- [ ] Integration tests pass
- [ ] Performance benchmarks pass
```

### Review Process

1. CI must pass (all tests, linting, security scans)
2. Security review required for contract changes
3. At least one approval before merge
4. Squash merge to keep history clean

## Security

### Non-Negotiable Rules

1. Never commit private keys, seed phrases, or wallet mnemonics
2. Never commit real RPC API keys or endpoint URLs
3. Never commit `.env` files
4. Never put real secrets in `.env.example` — use `YOUR_API_KEY_HERE`
5. Always run `gitleaks detect --source . --no-git` before committing env-related changes
6. Always test on fork before testnet, testnet before mainnet
7. Never deploy contracts without explicit approval

### Pre-Commit Hooks

Pre-commit hooks automatically run gitleaks to scan for secrets. If a commit is blocked, review the flagged content before proceeding.

## Deployment

Deployment follows a gated process. See [CI/CD documentation](bot/docs/CI_CD.md) for the automated pipeline.

```
fork test → testnet (Sepolia) → mainnet (requires approval)
```
