# Skills

Skills are reusable workflows for common development tasks. They provide structured approaches to specification, planning, task breakdown, and implementation for the flashloan arbitrage bot -- spanning both Solidity smart contracts (on-chain) and TypeScript bot logic (off-chain).

## Pipeline Overview

The 4-skill BDD pipeline transforms beads issues into working, verified code:

```
beads issue -> .feature spec -> .plan.md -> tasks -> TDD implementation
   (Define)     (Skill 1)     (Skill 2)  (Skill 3)   (Skill 4)
```

## Available Skills

### 1. creating-features-from-tasks (Skill 1 -- Specify)
**Purpose**: Convert beads tasks into executable Gherkin `.feature` specifications

**When to use**:
- Starting new contract or bot feature work
- Need behavior specification before planning
- Want executable, drift-proof documentation

**Input**: Beads task or epic ID
**Output**: `features/<domain>/<domain>.feature`

**Triggers**: "create a feature spec", "define behavior for", "write scenarios"

---

### 2. planning-features (Skill 2 -- Plan)
**Purpose**: Create implementation plans driven by `.feature` scenarios

**When to use**:
- A `.feature` file exists and needs an implementation plan
- Need detailed breakdown of on-chain vs off-chain work
- Want to coordinate Solidity contracts, TypeScript bot, and deployment

**Input**: `.feature` file
**Output**: `features/<domain>/<domain>.plan.md`

**Triggers**: "plan this feature", "create implementation plan", "how should we implement"

---

### 3. creating-tasks-from-plans (Skill 3 -- Break)
**Purpose**: Generate beads tasks from implementation plans

**When to use**:
- Have an approved `.plan.md` file
- Ready to start implementation
- Need trackable work items with dependencies

**Input**: `.plan.md` file
**Output**: Beads tasks with dependencies, acceptance criteria referencing scenarios

**Triggers**: "create tasks from plan", "break down the plan", "generate beads issues"

---

### 4. implementing-with-tdd (Skill 4 -- Build)
**Purpose**: Implement tasks using strict TDD (red-green-refactor) in both Solidity and TypeScript

**When to use**:
- Implementing Solidity smart contracts (Foundry TDD)
- Implementing TypeScript bot logic (Vitest TDD)
- Any task that produces code or configuration

**Input**: Beads task ID
**Output**: Tests (RED) -> Implementation (GREEN) -> Refactor

**Triggers**: "implement this task", "write the code for", "add this contract"

---

## Workflow Example

```bash
# 1. Have a beads issue
bd show flashloan-abc  # "Add multi-hop arbitrage support"

# 2. Create feature spec (Skill 1)
# Output: features/multi-hop-arbitrage/multi-hop-arbitrage.feature
# Tags: @solidity for contract tests, @typescript for bot tests
# Verify RED: forge test -> FAILS for @solidity, pnpm test -> FAILS for @typescript

# 3. Create implementation plan (Skill 2)
# Output: features/multi-hop-arbitrage/multi-hop-arbitrage.plan.md
# Plan identifies on-chain vs off-chain components

# 4. Break into tasks (Skill 3)
# Output: flashloan-def, flashloan-ghi (with dependencies)
# On-chain tasks before off-chain tasks that depend on them

# 5. Implement tasks (Skill 4)
bd ready  # Shows: flashloan-def (unblocked)
# Solidity TDD: forge test -vvv --match-test test_functionName
# TypeScript TDD: pnpm test
# Both cycles: RED -> GREEN -> REFACTOR

# 6. Complete and move to next
bd close flashloan-def
bd ready  # Shows: flashloan-ghi (now unblocked)
```

## Project Structure

```
features/                              # Feature specs and plans
├── flashloan-execution/
│   ├── flashloan-execution.feature    # @solidity tagged scenarios
│   └── flashloan-execution.plan.md
├── opportunity-detection/
│   ├── opportunity-detection.feature  # @typescript tagged scenarios
│   └── opportunity-detection.plan.md
└── multi-hop-arbitrage/
    ├── multi-hop-arbitrage.feature    # Mixed @solidity + @typescript
    └── multi-hop-arbitrage.plan.md

src/                                   # TypeScript bot (off-chain)
├── bot/
│   ├── scanner.ts
│   └── scanner.test.ts               # Vitest tests colocated
├── execution/
│   ├── executor.ts
│   └── executor.test.ts
└── utils/
    ├── pricing.ts
    └── pricing.test.ts

test/                                  # Foundry tests (on-chain)
├── FlashloanExecutor.t.sol
├── DexAggregator.t.sol
└── mocks/
    └── MockDex.sol

contracts/                             # Solidity contracts
├── FlashloanExecutor.sol
├── DexAggregator.sol
└── interfaces/
    └── IFlashloanReceiver.sol
```

## Dual-Language Testing

This project uses TWO test frameworks:

| Layer | Framework | Command | Test Location |
|-------|-----------|---------|---------------|
| On-chain (Solidity) | Foundry (forge test) | `forge test -vvv` | `test/*.t.sol` |
| Off-chain (TypeScript) | Vitest (pnpm test) | `pnpm test` | `src/**/*.test.ts` |

**Quality gate**: ALL Foundry tests pass AND ALL Vitest tests pass before commit.

```bash
# Run both test suites
forge test -vvv && pnpm test
```

## Team Agent Workflow

Skills integrate with Claude team agents for parallel work:

1. **Team lead** creates beads issue and assigns Skill 1 to a spec agent
2. **Spec agent** runs Skill 1 (creating-features-from-tasks) -> `.feature` file
3. **Planning agent** runs Skill 2 (planning-features) -> `.plan.md`
4. **Lead** runs Skill 3 (creating-tasks-from-plans) -> beads tasks with dependencies
5. **Implementation agents** pick up tasks via `bd ready` and run Skill 4 (implementing-with-tdd)
6. Each agent follows the full RED-GREEN-REFACTOR cycle independently (Foundry or Vitest)
7. **Quality gate agent** validates all tests pass: `forge test -vvv && pnpm test`

## Skill Development

Skills are adapted from [muninn](https://github.com/bldx/muninn) with modifications for the flashloan arbitrage bot's dual-language architecture:

- **muninn**: TypeScript, BDD/Gherkin, API development
- **compute-stack**: Python, infrastructure, Docker, monitoring, BDD/Gherkin, multi-app monorepo
- **flashloan-scaffolding**: Solidity + TypeScript, DeFi, dual-framework TDD, BDD/Gherkin

## Related Documentation

- [BDD Workflow](.rules/patterns/bdd-workflow.md) -- Technical reference
- [Beads Integration](.rules/patterns/beads-integration.md)
- [Git Workflow](.rules/patterns/git-workflow.md)
