# Flashloan Arbitrage Bot Constitution

> Our guiding principles and non-negotiables for building together

**This document defines WHO WE ARE.** For where we're going, see [VISION.md](./VISION.md).

## Core Values

### 1. Safety Above Profit
- Circuit breakers and loss limits are non-negotiable
- DRY_RUN=true is the default; mainnet execution is opt-in
- Every strategy must have a maximum loss threshold
- If in doubt, don't execute the trade
- A bot that loses nothing is better than one that sometimes wins big

### 2. No MEV Exploitation of Retail Users
- All profits come from legitimate arbitrage: price inefficiencies between DEXs
- We do NOT front-run, back-run, or sandwich retail transactions
- We do NOT extract value from users' slippage tolerance
- Arbitrage improves market efficiency; exploitation harms participants

### 3. Transparent, Auditable Code
- Smart contracts are readable and well-documented
- Every strategy is explainable in plain English
- No obfuscation, no hidden logic, no "clever" tricks
- Open-source by default; security through correctness, not obscurity

### 4. Test Before You Risk Capital
- Fork testing before testnet, testnet before mainnet
- Every contract change requires full test suite passage
- Simulate with real mainnet state via Anvil forks
- Never deploy untested code to any live network

### 5. Private Keys Never in Code or Git
- Private keys live in `.env` files, NEVER in source code
- `.env` is gitignored; `.env.example` contains only placeholders
- Pre-commit hooks (gitleaks) catch accidental secret commits
- Key management is a first-class security concern

### 6. Clarity Over Cleverness
- Write code that's easy to understand, not code that shows off
- Prefer explicit over implicit
- Name things clearly - no abbreviations unless universally understood
- Document the "why" not just the "what"

## Non-Negotiables

### Smart Contract Safety
- All external calls use checks-effects-interactions pattern
- Reentrancy guards on every state-changing external function
- Integer overflow protection (Solidity 0.8+ or SafeMath)
- Flashloan callbacks validate the caller is the expected pool
- Emergency pause functionality on all deployed contracts

### Bot Safety
- Circuit breaker: halt after cumulative loss exceeds threshold
- Gas price ceiling: never bid above MAX_GAS_PRICE_GWEI
- Position size limits: never borrow above MAX_FLASHLOAN_AMOUNT_ETH
- Slippage protection: reject trades exceeding SLIPPAGE_BPS
- DRY_RUN mode: simulate everything, execute nothing (default)

### Code Quality
- Format Solidity with forge fmt
- Lint TypeScript with ESLint + Prettier
- Run full test suite before every commit
- Minimum 90% branch coverage on smart contracts

### Architecture
- No circular dependencies between modules
- Config uses environment variables (`.env` files)
- Smart contracts are upgradeable only via transparent proxy pattern
- Bot logic is stateless; all state lives on-chain or in config

### Git Workflow
- Feature branches for all work (`feat/`, `fix/`, `docs/`, `refactor/`)
- Conventional commits for all commits
- Never force push to main or dev
- Always quote filenames in git commands
- Pre-commit hooks must pass before any commit lands

### Deployment Progression
```
Local Anvil Fork  -->  Testnet (Sepolia)  -->  Mainnet
     |                      |                      |
  Full tests            Smoke tests           Monitoring ON
  Gas estimates         Real gas costs        Circuit breakers ON
  Fork state            Testnet state         DRY_RUN first
```

### Documentation
- Keep PLAN.md concise (high-level milestones only)
- Keep .claude/ files under 400 lines (split if needed)
- Update docs when architecture changes
- Stay shallow in .claude/ (no deeply nested directories)

## Strong Preferences

### Code Style
- Prefer explicit types over implicit (Solidity: no `var`, TypeScript: no `any`)
- Prefer composition over inheritance
- Prefer small functions over large ones (max ~50 lines)
- Prefer early returns over nested conditionals

### Naming Conventions
- **Contracts**: PascalCase (`FlashLoanArbitrage`, `DEXRouter`)
- **Functions**: camelCase in Solidity, camelCase in TypeScript
- **Constants**: UPPER_SNAKE_CASE (`MIN_PROFIT_WEI`, `MAX_GAS_PRICE`)
- **Events**: PascalCase (`ArbitrageExecuted`, `CircuitBreakerTriggered`)
- **Errors**: PascalCase with prefix (`Flashloan__InsufficientProfit`)

### Error Handling
- Custom errors over require strings (gas efficient)
- Log errors with context (include token addresses, amounts, pool IDs)
- Graceful degradation when RPC nodes are unavailable
- Fail fast on configuration errors (missing keys, invalid addresses)

### Performance
- Minimize on-chain storage (use events for historical data)
- Batch RPC calls where possible (multicall)
- Use calldata over memory for read-only function params
- Gas-optimize hot paths; readability-optimize cold paths

## Collaboration Principles

### Human + Agent Partnership
- **We're a team**: Not human vs AI, but human + AI
- **Ask when uncertain**: Better to clarify than assume
- **Suggest improvements**: If you see a better way, speak up
- **Learn together**: Update .claude/ as we discover patterns
- **Safety first**: Either partner can veto a risky operation

### Communication Style
- **Be clear and concise**: No fluff, get to the point
- **Use examples**: Show, don't just tell
- **Provide context**: Explain the "why" behind decisions
- **Stay grounded**: DeFi moves fast; verify assumptions

### Decision Making
- **Safety over speed**: Never rush a deployment
- **Bias toward simplicity**: Simple strategies beat complex ones
- **Measure what matters**: Profit/loss, gas costs, execution success rate
- **Iterate carefully**: Small changes, thorough testing, gradual rollout

## Living Document

This constitution evolves as we work together. When you notice:
- **New safety concerns** emerging -> Add them here immediately
- **Patterns becoming established** -> Document in `.claude/patterns/`
- **Better ways of working** -> Update this document
- **Outdated rules** -> Remove or revise them

**Last Updated**: 2026-02-13

---

## The Hierarchy

```
CONSTITUTION (who we are)
    |
VISION (where we're going)
    |
.rules/ (what we know)
    |
PLAN (what we're doing)
```

**This document anchors everything.** Our vision grows from our values. Our knowledge reflects our principles. Our plans execute our vision.

---

> "We're not just chasing arbitrage -- we're building a system that profits ethically, fails safely, and improves continuously."
