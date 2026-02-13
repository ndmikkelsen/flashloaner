# Flashloan Arbitrage Bot Plan

> **Working memory** - Major milestones and architectural changes

**Last Updated**: 2026-02-13
**Current Branch**: init/flashloan-scaffolding

---

## Current Milestone: Workflow Scaffolding ✅ COMPLETE

**Status**: Development workflow fully scaffolded, ready for Phase 1 implementation

### Completed
- ✅ Complete workflow infrastructure (38 files across 5 waves)
- ✅ Foundation files (CONSTITUTION, VISION, PLAN, gitignore, gitleaks, pre-commit, env.example)
- ✅ Rules directory (9 docs: architecture + patterns, including DeFi security)
- ✅ BDD skills pipeline (4-skill workflow adapted for Foundry + Vitest)
- ✅ Cognee AI memory stack (separate deployment with unique ports/names)
- ✅ Claude commands (/land, /deploy, /query)
- ✅ 5 agent definitions (contract-dev, bot-dev, defi-specialist, security-lead, infra-dev)
- ✅ Top-level documentation (CLAUDE.md, AGENTS.md, README.md)
- ✅ Beads kanban board (72 issues across 5 project phases with full dependency graph)

### Next Major Milestone: Phase 1 - Research & Foundation

**Ready to start** (run `bd ready` to see entry points):
- Install Foundry toolchain
- Initialize TypeScript project (package.json, tsconfig)
- Implement core FlashLoanArbitrage.sol contract
- Set up Anvil fork testing infrastructure
- Create first DEX adapter (Uniswap V2)

---

## Architecture

- **Smart Contracts**: Solidity 0.8+ / Foundry
- **Bot**: TypeScript / Node.js
- **Testing**: Forge test (contracts), Vitest (bot)
- **Deployment**: Foundry scripts, multi-chain
- **Issue Tracking**: Beads (`.beads/issues.jsonl`)

---

## Beads Status

> Active issues tracked in `.beads/issues.jsonl` - Use `bd ready` to see unblocked work

**Total**: 72 issues across 5 phases
- 11 epics
- 32 features
- 29 tasks

**Phases**:
1. Research & Foundation (11 issues) - 8 ready to start
2. Core Implementation (25 issues) - blocked by Phase 1
3. Advanced Features (18 issues) - blocked by Phase 2
4. Production Hardening (12 issues) - blocked by Phase 3
5. Scaling & Optimization (6 issues) - blocked by Phase 4

**Entry points** (zero dependencies):
- `flashloaner-hf3`: Install Foundry toolchain
- `flashloaner-ehi`: Initialize TypeScript project
