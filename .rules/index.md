# Flashloan Arbitrage Bot Rules & Patterns

> Technical documentation, architecture patterns, and development guidelines for the flashloan arbitrage bot

## Purpose

This directory contains technical documentation for AI agents and developers working on the flashloan arbitrage bot. These rules are referenced by `.claude/` workflows and indexed by Cognee for semantic search.

## Structure

### Architecture (`architecture/`)

System design, component relationships, and integration patterns:

- `system-overview.md` - Two-layer architecture (on-chain + off-chain)
- `contract-architecture.md` - Solidity design patterns and contract hierarchy
- `cognee-integration.md` - Cognee AI memory layer integration

### Patterns (`patterns/`)

Reusable solutions and workflows:

- `bdd-workflow.md` - BDD pipeline for dual-language testing (Solidity + TypeScript)
- `beads-integration.md` - Issue tracking with Beads
- `git-workflow.md` - Git branching and PR pipeline
- `deployment.md` - Foundry deployment pipeline (fork -> testnet -> mainnet)
- `env-security.md` - Environment variable patterns and secret detection
- `defi-security.md` - DeFi-specific security patterns and attack prevention

## Usage

### For AI Agents

Read relevant rules before implementing features:

```bash
# Before working on contracts or bot architecture
Read .rules/architecture/system-overview.md

# Before working on Solidity contracts
Read .rules/architecture/contract-architecture.md

# Before creating features (BDD pipeline)
Read .rules/patterns/bdd-workflow.md

# Before creating issues
Read .rules/patterns/beads-integration.md

# Before committing/pushing
Read .rules/patterns/git-workflow.md

# Before deploying contracts
Read .rules/patterns/deployment.md

# Before adding environment variables or .env.example files
Read .rules/patterns/env-security.md

# Before implementing DeFi logic or reviewing security
Read .rules/patterns/defi-security.md
```

### For Team Agents

When working as a team agent, read:

1. `.rules/patterns/bdd-workflow.md` - Understand the BDD pipeline
2. `.rules/patterns/beads-integration.md` - How to track work
3. `.claude/skills/` - The 4-skill workflow
4. `.claude/agents/flashloaner-developer.md` - Agent conventions

### For Cognee

These docs are indexed in Cognee datasets:

- `flashloaner-knowledge` - Rules, commands, skills, agents
- `flashloaner-patterns` - Architecture and pattern docs

Query Cognee for context:

```bash
curl -X POST http://localhost:8003/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "How does the flashloan executor work?"}'
```

## Maintenance

- Keep docs under 400 lines (split if needed)
- Use semantic Markdown (H1/H2/H3 hierarchy)
- Include metadata frontmatter
- Update when architecture changes
- Remove obsolete patterns

---

**Last Updated**: 2026-02-13
