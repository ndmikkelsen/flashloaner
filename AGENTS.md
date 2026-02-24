# AGENTS.md

> AI Development Guide for Flashloaner

**Last Updated**: 2026-02-13

## Overview

Flashloan arbitrage bot with two layers: on-chain Solidity smart contracts (Foundry) for flashloan execution and DEX swaps, plus an off-chain TypeScript bot (ethers.js v6) for opportunity detection and execution. Uses Beads for issue tracking, Cognee for AI memory.

## Structure

```
flashloaner/
├── contracts/              # Solidity: flashloan execution, DEX swaps
│   ├── src/                # Contract source files
│   ├── test/               # Foundry tests (forge test)
│   └── script/             # Deployment scripts (forge script)
├── bot/                    # TypeScript: opportunity detection, execution
│   ├── src/                # Bot source code (ethers.js v6)
│   └── __tests__/          # Vitest tests (pnpm test)
├── .rules/                 # Technical documentation (architecture, patterns)
├── .claude/                # Claude Code config (agents, skills, commands)
├── .beads/                 # Issue tracking (bd commands, prefix: flashloaner)
├── foundry.toml            # Foundry config
├── package.json            # pnpm workspace root
└── vitest.config.ts        # Vitest config
```

## Where to Look

| Task | Location | Notes |
|------|----------|-------|
| Architecture overview | `.rules/architecture/system-overview.md` | Two-layer system design |
| Contract architecture | `.rules/architecture/contract-architecture.md` | Smart contract patterns |
| Cognee integration | `.rules/architecture/cognee-integration.md` | AI memory setup |
| Issue tracking | `.rules/patterns/beads-integration.md` | Beads workflow |
| Git workflow | `.rules/patterns/git-workflow.md` | Branching, PRs, commits |
| Deployment | `.rules/patterns/deployment.md` | Gated deployment (fork -> testnet -> mainnet) |
| Env security | `.rules/patterns/env-security.md` | .env.example patterns, secrets |
| DeFi security | `.rules/patterns/defi-security.md` | Flashloan/DEX security patterns |
| BDD skills | `.claude/skills/` | 4-skill BDD pipeline |
| Team agents | `.claude/agents/` | 5 agent definitions for team work |
| Session completion | `.claude/commands/land.md` | /land protocol |
| Deployment command | `.claude/commands/deploy.md` | /deploy gated deployment |
| Knowledge query | `.claude/commands/query.md` | /query semantic search |

## Agent Team

### 5 Agents

| Agent | Specialty | File | Primary Focus |
|-------|-----------|------|---------------|
| **contract-dev** | Solidity/Foundry | `.claude/agents/contract-dev.md` | Smart contracts, Foundry tests, gas optimization |
| **bot-dev** | TypeScript/ethers.js | `.claude/agents/bot-dev.md` | Off-chain bot, opportunity detection, execution logic |
| **defi-specialist** | DEX/Protocol | `.claude/agents/defi-specialist.md` | DEX integrations, protocol research, swap routing |
| **security-lead** | Security/Auditing | `.claude/agents/security-lead.md` | Contract audits, reentrancy checks, PR reviews |
| **infra-dev** | Infrastructure/DevOps | `.claude/agents/infra-dev.md` | CI/CD, Cognee, deployment pipelines, monitoring |

### Agent Collaboration

- **contract-dev + bot-dev**: Coordinate on contract ABIs and TypeScript interfaces. When contract interfaces change, both agents must update in sync.
- **defi-specialist + contract-dev**: DEX specialist researches protocol specifics, contract-dev implements the integration.
- **security-lead**: Reviews ALL pull requests before merge. No PR merges without security-lead approval.
- **infra-dev + all agents**: Maintains CI/CD pipelines, Cognee stack, and deployment infrastructure that all agents depend on.

### Escalation Paths

```
contract-dev ──┐
bot-dev ───────┤
               ├──> security-lead (security concerns)
defi-specialist┤
infra-dev ─────┘

contract-dev ──> defi-specialist (protocol questions)
bot-dev ───────> contract-dev (ABI/interface questions)
all agents ────> infra-dev (CI/CD, deployment issues)
```

## NON-NEGOTIABLE GIT RULES

**Mandatory PR Pipeline**: `feature -> dev -> main`

1. **NEVER commit directly to `main` or `dev`**
2. **NEVER push directly to `main` or `dev`**
3. **ALWAYS work on feature branches**
4. **ALWAYS use PR pipeline**

See [.rules/patterns/git-workflow.md](.rules/patterns/git-workflow.md) for complete workflow.

## Quick Commands

### Development

```bash
# Run Solidity tests
forge test

# Run Solidity tests with verbosity
forge test -vvv

# Run Solidity tests on mainnet fork
forge test --fork-url $MAINNET_RPC_URL

# Gas profiling
forge test --gas-report

# Run TypeScript tests
pnpm test

# Check for leaked secrets
gitleaks detect --source . --no-git
```

### Deployment (Gated)

```bash
# Step 1: Fork test (always first)
forge script script/Deploy.s.sol --fork-url $MAINNET_RPC_URL

# Step 2: Testnet deploy (requires approval)
forge script script/Deploy.s.sol --fork-url $TESTNET_RPC_URL --broadcast

# Step 3: Mainnet deploy (requires explicit approval)
forge script script/Deploy.s.sol --fork-url $MAINNET_RPC_URL --broadcast --verify
```

See [.rules/patterns/deployment.md](.rules/patterns/deployment.md) for complete deployment guide.

## Beads (Issue Tracking)

**IMPORTANT**: Use Beads for ALL task tracking. No markdown TODOs. Prefix: `flashloaner`.

```bash
bd ready                              # Show unblocked issues
bd create "Title" -t task -p 1        # Create issue
bd update <id> --status in_progress   # Claim work
bd close <id> --reason "Done"         # Complete work
bd dep add <blocked> <blocker>        # Add dependency
# Note: bd sync is deprecated — Dolt backend auto-syncs via git hooks
```

### Issue Types

- `bug` - Something broken (failed transactions, wrong calculations)
- `feature` - New functionality (new DEX integration, new strategy)
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security vulnerability, fund loss risk, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, gas optimization)
- `4` - Backlog (future ideas)

See [.rules/patterns/beads-integration.md](.rules/patterns/beads-integration.md) for complete guide.

## BDD Pipeline & Skills

All feature work follows the 4-skill pipeline:

```
beads issue -> .feature spec -> .plan.md -> tasks -> TDD implementation
   (Define)     (Skill 1)     (Skill 2)  (Skill 3)   (Skill 4)
```

| Skill | File | Purpose |
|-------|------|---------|
| Skill 1 | `.claude/skills/creating-features-from-tasks.md` | Beads issue -> Gherkin `.feature` |
| Skill 2 | `.claude/skills/planning-features.md` | `.feature` -> `.plan.md` |
| Skill 3 | `.claude/skills/creating-tasks-from-plans.md` | `.plan.md` -> Beads tasks |
| Skill 4 | `.claude/skills/implementing-with-tdd.md` | RED-GREEN-REFACTOR |

### Team Agent Workflow

1. **Lead** creates beads issues and assigns spec work
2. **Spec agent** runs Skill 1 -> `.feature` file
3. **Planning agent** runs Skill 2 -> `.plan.md`
4. **Lead** runs Skill 3 -> creates beads tasks with dependencies
5. **Implementation agents** (contract-dev, bot-dev) claim tasks via `bd ready`, run Skill 4
6. **Security-lead** reviews all PRs before merge
7. **Quality gate**: `forge test` AND `pnpm test` must pass before closing tasks

## Cognee (AI Memory)

Semantic search over project knowledge, architecture docs, and protocol research.

### Quick Start

```bash
# Check health
curl -sk https://flashloaner-cognee.apps.compute.lan/health

# Sync project knowledge
./.claude/scripts/sync-to-cognee.sh

# Deploy/redeploy
kamal deploy
```

### Search Knowledge

```bash
# Use /query command or:
curl -sk -X POST https://flashloaner-cognee.apps.compute.lan/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "How does the flashloan executor handle multi-hop swaps?"}'
```

### Datasets

| Dataset | Content |
|---------|---------|
| `flashloaner-architecture` | System design, contract architecture |
| `flashloaner-troubleshooting` | Problem solutions, failed tx analysis |
| `flashloaner-references` | How-to guides, protocol docs |
| `flashloaner-constitution` | Constitution framework docs |

## Conventions

### Commit Messages

Use conventional commits:

```bash
feat(contract): add Uniswap V3 flash loan support
fix(bot): handle reverted swap transactions
docs(rules): add DEX security patterns
test(contract): add fork tests for arbitrage path
chore(beads): close completed issues
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `style`, `perf`

Scopes: `contract`, `bot`, `dex`, `security`, `deploy`, `infra`

### Code Style

- **Solidity**: Follow Foundry conventions, NatSpec comments, explicit visibility
- **TypeScript**: Strict mode, type annotations, camelCase functions, PascalCase classes
- **Constants**: UPPER_SNAKE_CASE (`MAX_SLIPPAGE`, `FLASH_LOAN_FEE`)

## Session Completion (Mandatory)

Work is **NOT complete** until `git push` succeeds:

```bash
/land  # Execute complete landing protocol
```

**NEVER** leave work unpushed. **NEVER** say "ready to push when you are."

See [.claude/commands/land.md](.claude/commands/land.md) for complete protocol.

## Anti-Patterns (NEVER)

| Rule | Why |
|------|-----|
| Commit to main/dev | Use PR pipeline |
| Push to main/dev | Use PR pipeline |
| Markdown TODOs | Use Beads |
| Skip /land protocol | Work not complete |
| Force push | Dangerous |
| Real secrets in .env.example | Use placeholders (YOUR_API_KEY_HERE) |
| Commit .env files | Gitignored for security |
| Commit private keys or mnemonics | Funds at risk |
| Deploy without user approval | Gated deployment required |
| Skip fork testing | Always test on fork first |

## Resources

- **Technical Docs**: `.rules/` (architecture, patterns)
- **Constitution**: `CONSTITUTION.md` (core values)
- **Vision**: `VISION.md` (where we're going)
- **Plan**: `PLAN.md` (working memory)
- **Sticky Note**: `STICKYNOTE.md` (session handoff, gitignored)

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

**This document is your quick reference.** For deep technical details, see `.rules/` and `CLAUDE.md`.

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
