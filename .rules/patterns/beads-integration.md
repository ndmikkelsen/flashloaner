---
description: Issue tracking with Beads (bd) for the flashloan arbitrage bot
tags: [beads, issue-tracking, workflow]
last_updated: 2026-02-13
---

# Beads Issue Tracking

This project uses [Beads (bd)](https://github.com/steveyegge/beads) for ALL issue tracking.

## Core Rules

- **Track ALL work in bd** - Never use markdown TODOs or comment-based task lists
- **Use `bd ready`** to find available work
- **Use `bd create`** to track new issues/tasks/bugs
- **Git hooks auto-sync** on commit/merge — no manual sync needed
- **Remote Dolt backend** — issues stored in `beads_flashloaner` DB on compute server
- **Password via direnv** — `BEADS_DOLT_PASSWORD` auto-exported from `.envrc` (1Password source)

## Connection Setup

`bd` requires `BEADS_DOLT_PASSWORD` to authenticate as the `beads` user on the Dolt server.

### direnv (interactive terminal — automatic)

The `.envrc` already exports it from 1Password:

```bash
export BEADS_DOLT_PASSWORD=$(op read "op://Personal/flashloaner-knowledge/DOLT_PASSWORD" 2>/dev/null)
```

If `bd` commands fail with "Access denied", direnv probably hasn't been allowed yet:

```bash
direnv allow            # run once in the repo root — persists until .envrc changes
direnv status           # confirm: "Found RC path" with "Loaded" state
```

After `direnv allow`, all `bd` commands work automatically in any interactive terminal session in this directory.

### Bash tool / non-interactive shells

direnv does not auto-load in non-interactive contexts (e.g., Claude Code's Bash tool, CI, cron). Use `direnv exec` to inject the environment:

```bash
direnv exec . bd ready
direnv exec . bd list --status=open
direnv exec . bd close flashloaner-abc --reason "Done"
```

Or for multiple commands, use a subshell:
```bash
direnv exec . bash -c 'BEADS_NO_DAEMON=1 bd ready'
```

### Verify connection

```bash
direnv exec . bd dolt test   # should print: ✓ Connection successful
```

## Quick Reference

```bash
bd ready                              # Show issues ready to work (no blockers)
bd list --status=open                 # List all open issues
bd create "Title" -t task -p 1        # Create new issue
bd update <id> --status=in_progress   # Claim work
bd close <id> --reason "Done"         # Mark complete
bd dep add <issue> <depends-on>       # Add dependency
# Note: bd sync is deprecated — Dolt backend auto-syncs via git hooks
```

## Workflow

1. **Check for ready work**: `bd ready`
2. **Claim an issue**: `bd update <id> --status=in_progress`
3. **Do the work**: Implement, test, document
4. **Mark complete**: `bd close <id> --reason "Completed"`
5. **Commit**: `git add .beads/issues.jsonl && git commit` (git hooks handle the rest)

## Issue Types

| Type | Purpose | Example |
|------|---------|---------|
| `bug` | Something broken | "UniswapV3Adapter reverts on fee tier 10000" |
| `feature` | New functionality | "Add Balancer V2 flash loan provider" |
| `task` | Work item | "Write fork tests for CurveAdapter" |
| `epic` | Large feature with subtasks | "Multi-Chain Support" |
| `chore` | Maintenance | "Update ethers.js to v6.14" |
| `security-audit` | Security review | "Audit reentrancy guards on all adapters" |

## Priorities

| Priority | Meaning | When to Use |
|----------|---------|-------------|
| `0` | Critical - Funds at Risk | Vulnerability found, contract bug that could lose funds, active exploit |
| `1` | High - Bot Stopped | Bot crashes, RPC failures, flash loan provider down, broken adapter |
| `2` | Medium | Default priority, new adapters, new features, optimization |
| `3` | Low | Polish, logging improvements, documentation, minor gas optimizations |
| `4` | Backlog | Future ideas, deferred chains, research items |

### DeFi Priority Context

- **P0 (Funds at Risk)**: Reentrancy vulnerability, unchecked return values, approval bugs, missing access control on withdraw functions. **Drop everything and fix immediately.**
- **P1 (Bot Stopped)**: Transaction builder encoding errors, RPC endpoint failures, gas estimation broken, circuit breaker false positives blocking all trades.
- **P2 (Default)**: Add new DEX adapter, optimize gas usage, add new flash loan provider, improve profit estimation accuracy.
- **P3 (Polish)**: Better logging format, dashboard improvements, documentation updates, test coverage gaps.
- **P4 (Backlog)**: Support new L2 chain, research new arbitrage strategies, explore MEV-Share integration.

## Managing Dependencies

Dependencies can be added at creation time or to existing issues.

### At Creation Time

```bash
# Child depends on parent
bd create "Write CurveAdapter fork tests" \
  --description="Fork test against mainnet 3pool" \
  -p 1 \
  --deps flashloaner-curve-adapter

# Task blocked by multiple issues
bd create "Deploy to Arbitrum mainnet" \
  --description="Deploy all contracts to Arbitrum" \
  --deps flashloaner-arb-fork-tests,flashloaner-arb-gas-optimization
```

### Add to Existing Issues

Use `bd dep`, NOT `bd update --deps`:

```bash
# Make flashloaner-abc depend on flashloaner-xyz
bd dep add flashloaner-abc flashloaner-xyz

# Same thing using --blocks syntax
bd dep flashloaner-xyz --blocks flashloaner-abc

# Check dependencies
bd dep list flashloaner-abc

# Show full dependency tree
bd dep tree flashloaner-abc
```

**Known issue**: `bd dep` with `--json` flag may cause a panic. Omit `--json` for dep commands.

## Auto-Sync

Beads automatically syncs with git:

- **Exports** to `.beads/issues.jsonl` after changes (5s debounce)
- **Imports** from JSONL when newer (e.g., after `git pull`)
- **No manual export/import needed!**

### Sync Workflow

```bash
# After closing issues or making changes
bd close flashloaner-abc --reason "Done"
# (Auto-exports to .beads/issues.jsonl after 5s)

# Commit the JSONL file
git add .beads/issues.jsonl
git commit -m "chore(beads): close flashloaner-abc"

# Push to share with team/other sessions
git push origin feature/your-branch

# On another machine or after git pull
git pull origin feature/your-branch
# (Auto-imports from .beads/issues.jsonl)

bd list
# Shows updated issues!
```

## Integration with Cognee

Document important issues in Cognee for searchability:

```bash
# 1. Create issue in Beads
bd create "Add Balancer V2 flash loan provider" \
  --description="Implement Balancer flash loan callback for zero-fee loans" \
  -t feature -p 1

# 2. Document the issue context in Cognee
cat > cognee-balancer-flash.txt << 'EOF'
Issue: flashloaner-balancer-flash
Title: Add Balancer V2 flash loan provider
Priority: High
Type: Feature

Goal: Implement Balancer V2 flash loan provider for zero-fee flash loans.

Implementation Plan:
- Implement receiveFlashLoan callback in FlashloanReceiver
- Add Balancer vault address as constructor parameter
- Write fork tests against mainnet Balancer vault
- Compare gas costs with Aave flash loans
EOF

curl -sk -X POST https://flashloaner-cognee.apps.compute.lan/api/v1/add \
  -F "data=@cognee-balancer-flash.txt" \
  -F "datasetName=flashloaner-knowledge"

curl -sk -X POST https://flashloaner-cognee.apps.compute.lan/api/v1/cognify \
  -H "Content-Type: application/json" \
  -d '{"datasets": ["flashloaner-knowledge"]}'
```

## Integration with Team Agents

When working with Claude team agents:

1. **Team lead** uses `bd ready` to find available work
2. **Lead assigns tasks** to agents based on expertise
3. **Agents claim work**: `bd update <id> --status in_progress`
4. **Agents complete work**: `bd close <id> --reason "Completed"`
5. **Lead verifies**: Run quality gates and review changes
6. **Commit JSONL**: `git add .beads/issues.jsonl && git commit` (no manual sync needed)

## Common Patterns

### Epic with Subtasks

```bash
# Create parent epic
bd create "Multi-Chain Deployment" \
  --description="Deploy contracts and bot to Arbitrum, Base, Optimism" \
  -t epic -p 1

# Create subtasks
bd create "Deploy contracts to Arbitrum" \
  --description="Deploy FlashloanExecutor + adapters to Arbitrum One" \
  -t task -p 1 \
  --deps flashloaner-multichain

bd create "Configure bot for Arbitrum RPC" \
  --description="Add Arbitrum RPC endpoints and chain config" \
  -t task -p 2 \
  --deps flashloaner-multichain
```

### Security Issue Discovered During Development

```bash
# Working on flashloaner-curve-adapter
bd update flashloaner-curve-adapter --status in_progress

# Discover a vulnerability
bd create "Read-only reentrancy in Curve adapter getAmountOut" \
  --description="Found during curve adapter testing. getAmountOut reads pool state that can be manipulated during reentrancy." \
  -t security-audit -p 0

# P0 = funds at risk, drop everything
```

### Blocked Work

```bash
# Can't deploy to mainnet until audit is complete
bd create "Deploy FlashloanExecutor to mainnet" \
  --description="Mainnet deployment after security audit" \
  -t task -p 1 \
  --deps flashloaner-security-audit

# Check what's ready (deploy won't show up)
bd ready
# (flashloaner-mainnet-deploy is blocked)

# Once audit is done
bd close flashloaner-security-audit --reason "Audit clean, no findings"

# Now deploy is ready!
bd ready
# Shows: flashloaner-mainnet-deploy
```

## Important Rules

- **Use Beads for ALL task tracking** - No markdown TODOs or external trackers
- **Link discovered work** with `discovered-from` dependencies
- **Check `bd ready`** before asking "what should I work on?"
- **Commit `.beads/issues.jsonl`** - Share issues with team/sessions
- **Do NOT create markdown TODO lists** - Use Beads instead
- **Do NOT use external issue trackers** - Beads is the single source of truth
- **Do NOT use `bd update --deps`** - Use `bd dep add` instead
- **Security issues are always P0** - If funds could be at risk, it is P0

## Related Documentation

- [BDD Workflow](.rules/patterns/bdd-workflow.md)
- [Git Workflow](.rules/patterns/git-workflow.md)
- [DeFi Security](.rules/patterns/defi-security.md)
