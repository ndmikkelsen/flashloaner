# Flashloaner Guide for Claude Code & Claude AI

This project is a **flashloan arbitrage bot** — a two-layer system with on-chain Solidity smart contracts (Foundry) for flashloan execution and DEX swaps, plus an off-chain TypeScript bot (ethers.js v6) for opportunity detection and execution.

## Important: Read the Technical Documentation

This project has detailed technical documentation in **`.rules/`** directory. These markdown files contain architecture patterns, workflows, and best practices.

**Before working on any feature, read the relevant guides from `.rules/`**

## Available Guides

### Architecture (`.rules/architecture/`)

- `system-overview.md` - Two-layer architecture (on-chain + off-chain)
- `contract-architecture.md` - Smart contract design and interactions
- `cognee-integration.md` - AI memory and semantic search

### Patterns (`.rules/patterns/`)

- `bdd-workflow.md` - BDD pipeline and Gherkin conventions
- `beads-integration.md` - Issue tracking with Beads
- `git-workflow.md` - Git branching and PR pipeline
- `deployment.md` - Gated deployment (fork -> testnet -> mainnet)
- `env-security.md` - Environment variable patterns and secret detection
- `defi-security.md` - DeFi-specific security patterns

## Quick Reference

See `AGENTS.md` in this directory for a quick overview and links to specific guides.

## Key Commands

```bash
# Run Solidity tests
forge test

# Run Solidity tests against mainnet fork
forge test --fork-url $MAINNET_RPC_URL

# Run Solidity tests with gas report
forge test --gas-report

# Run TypeScript tests
pnpm test

# Run deployment script (dry run)
forge script script/Deploy.s.sol --fork-url $RPC_URL

# Deploy (broadcast transactions)
forge script script/Deploy.s.sol --fork-url $RPC_URL --broadcast

# Check for leaked secrets
gitleaks detect --source . --no-git

# Beads issue tracking
bd ready
```

## Testing

This project uses **dual-language testing**: Foundry for Solidity, Vitest for TypeScript. The **BDD specification layer** drives feature development.

```bash
# Run ALL Solidity tests
forge test

# Run Solidity tests with verbosity
forge test -vvv

# Run specific Solidity test file
forge test --match-path test/FlashloanExecutor.t.sol

# Run specific Solidity test function
forge test --match-test testArbitrage

# Run Solidity tests on mainnet fork
forge test --fork-url $MAINNET_RPC_URL

# Gas profiling
forge test --gas-report

# Run ALL TypeScript tests
pnpm test

# Run specific TypeScript test
pnpm test -- --run src/bot/__tests__/detector.test.ts
```

**Rule**: ALL tests (both `forge test` AND `pnpm test`) must pass before any commit.

**BDD Pipeline**: For new work, create a `.feature` spec FIRST, then plan, then implement. See `.rules/patterns/bdd-workflow.md`.

## Session Protocol

**Land**: `/land` or "land the plane" -- Execute ALL steps in order:

1. Quality gates: `forge test`, `pnpm test`, `gitleaks detect --source . --no-git`
2. File remaining work in Beads
3. Update Beads issue status and sync
4. Commit ALL uncommitted files
5. Push to remote (`git push`)
6. Update `PLAN.md` with session handoff
7. Verify: `git status` shows clean + up to date with origin
8. Only then say "/land complete"

**Resume**: Check `PLAN.md` for recent work, run `bd ready` for available issues

Work is NOT done until ALL /land steps complete. Never skip steps.

## Issue Tracking with bd (beads)

This project uses **bd (beads)** for ALL issue tracking. See `AGENTS.md` and `.rules/patterns/beads-integration.md` for full documentation.

### Quick Reference

```bash
bd ready                              # See unblocked issues
bd list --status=open                 # List all open issues
bd create "Title" -t task -p 1        # Create issue (prefix: flashloaner)
bd update <id> --status in_progress   # Claim work
bd close <id> --reason "Done"         # Complete work
```

### Managing Dependencies

```bash
# At creation time:
bd create "Task" --deps blocker-id

# Add to existing issues (NOT bd update --deps):
bd dep add <blocked-id> <blocker-id>
bd dep <blocker-id> --blocks <blocked-id>
bd dep list <id>
bd dep tree <id>
```

**Note:** `bd dep` with `--json` flag may panic. Omit `--json` for dep commands.

## NON-NEGOTIABLE SECURITY RULES

1. **NEVER commit private keys, seed phrases, or wallet mnemonics**
2. **NEVER commit real RPC API keys or endpoint URLs**
3. **NEVER commit `.env` files** -- they are gitignored for a reason
4. **NEVER put real secrets in `.env.example` files** -- use placeholders like `YOUR_API_KEY_HERE` or `CHANGE_ME`
5. **ALWAYS run `gitleaks detect --source . --no-git` before committing env-related changes**
6. **ALWAYS test on fork before testnet, testnet before mainnet**
7. **NEVER deploy contracts without explicit user approval**

See `.rules/patterns/env-security.md` for environment security guidelines.
See `.rules/patterns/defi-security.md` for DeFi-specific security patterns.

## NON-NEGOTIABLE GIT RULES

**Mandatory PR Pipeline**: `feature -> dev -> main`

1. **NEVER commit directly to `main` or `dev`**
2. **NEVER push directly to `main` or `dev`**
3. **ALWAYS work on feature branches**
4. **ALWAYS use PR pipeline**

See `.rules/patterns/git-workflow.md` for complete workflow.

## Deployment Protocol

**Gated Deployment**: fork -> testnet -> mainnet

```bash
# Step 1: Test on local fork
forge script script/Deploy.s.sol --fork-url $MAINNET_RPC_URL

# Step 2: Deploy to testnet (requires user approval)
forge script script/Deploy.s.sol --fork-url $TESTNET_RPC_URL --broadcast

# Step 3: Deploy to mainnet (requires explicit user approval)
forge script script/Deploy.s.sol --fork-url $MAINNET_RPC_URL --broadcast --verify
```

Use `/deploy` command for the full gated deployment protocol. See `.rules/patterns/deployment.md`.

**NEVER skip deployment gates. NEVER deploy to mainnet without explicit user approval.**

## Cognee Integration

Cognee runs on the compute server, deployed via Kamal. Provides semantic search over documentation and knowledge.

```bash
# Check health
curl -sk https://flashloaner-cognee.apps.compute.lan/health

# Sync project knowledge
./.claude/scripts/sync-to-cognee.sh

# Search for information (or use /query command)
curl -sk -X POST https://flashloaner-cognee.apps.compute.lan/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "How does the flashloan executor work?"}'

# Deploy/redeploy Cognee
kamal deploy
```

### Datasets

- `flashloaner-skills` - BDD pipeline, planning, TDD skills
- `flashloaner-rules` - Architecture, patterns, workflows
- `flashloaner-project` - Constitution, vision, project config
- `flashloaner-solidity` - Contract docs, audits, feature specs

## Agent Team

This project uses a 5-agent team. See `.claude/agents/` for definitions:

| Agent | Role | File |
|-------|------|------|
| **contract-dev** | Solidity/Foundry specialist | `.claude/agents/contract-dev.md` |
| **bot-dev** | TypeScript bot developer | `.claude/agents/bot-dev.md` |
| **defi-specialist** | DEX/protocol integration | `.claude/agents/defi-specialist.md` |
| **security-lead** | Security auditing/testing | `.claude/agents/security-lead.md` |
| **infra-dev** | Infrastructure/DevOps | `.claude/agents/infra-dev.md` |

See `AGENTS.md` for team coordination and escalation paths.

## Project Structure

```
flashloaner/
├── contracts/              # Solidity smart contracts
│   ├── src/                # Contract source files
│   ├── test/               # Foundry test files
│   └── script/             # Deployment scripts
├── bot/                    # TypeScript off-chain bot
│   ├── src/                # Bot source code
│   └── __tests__/          # Vitest test files
├── .rules/                 # Technical documentation
│   ├── architecture/       # System design
│   └── patterns/           # Workflows, best practices
├── .claude/                # Claude Code config
│   ├── commands/           # Workflow automation (/land, /deploy, /query)
│   ├── agents/             # Agent definitions (5 agents)
│   ├── skills/             # BDD pipeline skills
│   ├── scripts/            # Cognee scripts
│   └── docker/             # Cognee docker-compose
├── .beads/                 # Issue tracking
├── foundry.toml            # Foundry config
├── package.json            # pnpm/Node.js config
├── tsconfig.json           # TypeScript config
├── vitest.config.ts        # Vitest config
├── .env.example            # Environment template
├── .gitignore              # Git ignore rules
├── .gitleaks.toml          # Secret detection config
└── .pre-commit-config.yaml # Pre-commit hooks
```

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Smart Contracts | Solidity | Flashloan execution, DEX swaps |
| Contract Framework | Foundry (forge, cast, anvil) | Build, test, deploy contracts |
| Off-chain Bot | TypeScript | Opportunity detection, execution |
| Ethereum Library | ethers.js v6 | Blockchain interaction |
| TS Testing | Vitest | TypeScript unit/integration tests |
| Runtime | Node.js | Bot execution environment |
| Secret Detection | gitleaks | Pre-commit secret scanning |
| Issue Tracking | Beads (bd) | Task management |
| AI Memory | Cognee | Semantic search |

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

---

**Remember**: The `.rules/` directory is your primary reference. Read the relevant guide before implementing any feature or pattern.
