---
name: creating-tasks-from-plans
description: Creates beads tasks from implementation plans (.plan.md). Use when a .plan.md exists and you need trackable tasks, when asked to "create tasks from plan", "break down the plan into tasks", "generate beads issues", or "convert plan to tasks". Tasks are scoped by layer (contract, bot, dex, security, deploy, infra).
allowed-tools: Read, Bash, Glob
---

# Creating Tasks from Plans

Generate beads issues from `.plan.md` implementation plans. Tasks are scoped by layer and respect on-chain vs off-chain ordering -- contracts must be deployed/testable before bot logic can interact with them.

## When to Use

- User says "create tasks from plan" or "break down the plan"
- A `.plan.md` exists and implementation is about to begin
- User asks "generate beads issues" or "convert this plan to tasks"
- Need to track implementation progress with dependencies

## Input Location

`.plan.md` files are colocated with their `.feature` file:

```
features/<domain>/
├── <domain>.feature              <- Spec (Skill 1 output)
└── <domain>.plan.md              <- INPUT: Read this
```

Created by the `planning-features` skill from a `.feature` file.

## Workflow

1. **Read the .plan.md** - Parse all phases and tasks
2. **Identify task boundaries** - Each task should be independently completable
3. **Assign task scopes** - contract, bot, dex, security, deploy, or infra
4. **Determine dependencies** - On-chain tasks typically block off-chain tasks
5. **Create beads issues** - Use `bd create` with proper metadata
6. **Link dependencies** - Use `bd dep add` to establish relationships
7. **Report created tasks** - Show IDs, scopes, and dependency tree

## Task Scopes

| Scope | Layer | Description | Test Framework |
|-------|-------|-------------|----------------|
| `contract` | on-chain | Core Solidity smart contract logic | Foundry |
| `dex` | on-chain | DEX integration, swap routing, pool interactions | Foundry (fork tests) |
| `security` | on-chain | Access control, reentrancy guards, input validation | Foundry (fuzz tests) |
| `bot` | off-chain | TypeScript bot logic, opportunity detection, execution | Vitest |
| `deploy` | on-chain | Foundry deployment scripts, contract verification | Foundry scripts |
| `infra` | both | Configuration, CI/CD, environment setup | Both |

## Task Extraction Rules

### From Implementation Plan Phases

Each checkbox item in the Implementation Plan becomes a task:

```markdown
### Phase 1: On-Chain Foundation

1. [ ] Create FlashloanExecutor contract         -> bd create task (scope: contract)
2. [ ] Add DEX swap routing                       -> bd create task (scope: dex)

### Phase 2: Off-Chain Bot

1. [ ] Implement opportunity scanner              -> bd create task (scope: bot)
2. [ ] Add profit calculation module              -> bd create task (scope: bot)
```

### Task Naming Convention

- Use imperative mood: "Create X", "Add Y", "Implement Z"
- Be specific: "Create FlashloanExecutor contract" not "Do flashloan"
- Include scope context: "[contract] Create FlashloanExecutor" or "[bot] Implement scanner"

### Task Description Template

```
Implements: {plan-name} - Phase {N}
Scope: {contract|bot|dex|security|deploy|infra}
Layer: {on-chain|off-chain}

## What
{Brief description of what this task accomplishes}

## Acceptance Criteria
Scenarios pass green: {list specific .feature scenario names}
Test framework: {Foundry|Vitest|Both}

## Technical Notes
{Any relevant specs from .plan.md Technical Specifications}
{Gas budget for on-chain tasks}

## Files to Change
{Key files to create/modify}

## Dependencies
{Reference parent epic and any blocking tasks}
{Note: off-chain tasks that call contracts depend on contract tasks}

## Testing
```bash
# For contract scope
forge test -vvv --match-test test_functionName

# For bot scope
pnpm test -- --grep "feature name"

# For dex scope (fork testing)
forge test --fork-url $MAINNET_RPC_URL --match-test test_dexSwap

# For security scope (fuzz testing)
forge test --fuzz-runs 1000 --match-test test_security
```
```

### Priority Mapping

| Phase               | Priority    | Rationale                                    |
| ------------------- | ----------- | -------------------------------------------- |
| Phase 1 (on-chain)  | P1 (high)   | Foundation work, contracts must exist first   |
| Phase 2 (off-chain) | P1-P2       | Core bot implementation, depends on contracts |
| Phase 3 (integration)| P2 (medium) | End-to-end verification                      |
| Security hardening   | P1 (high)   | Critical for DeFi -- never deprioritize       |
| Gas optimization     | P2-P3       | Refactor after correctness is proven          |
| Deploy scripts       | P2 (medium) | Needed before mainnet but after testing       |

### Dependency Rules

- **On-chain before off-chain**: Contract tasks must complete before bot tasks that interact with them
- **Interfaces before implementations**: Interface definitions unblock both contract and bot work
- **Security alongside contracts**: Security tasks should parallel contract implementation
- **Deploy after tests pass**: Deployment scripts depend on all contract + security tasks
- **Tasks within a phase**: Usually independent (can run in parallel)
- **Tasks across phases**: Later phases depend on earlier phases completing
- **Link to parent epic**: If implementing from an epic, add dependency

### Dependency Ordering Example

```
[contract] Create FlashloanExecutor         (P1, no deps)
[contract] Create IFlashloanReceiver interface  (P1, no deps)
[dex] Add Uniswap V3 swap adapter          (P1, depends on interface)
[dex] Add SushiSwap swap adapter            (P1, depends on interface)
[security] Add reentrancy protection        (P1, depends on FlashloanExecutor)
[security] Add access control               (P1, depends on FlashloanExecutor)
[bot] Implement opportunity scanner         (P2, depends on interfaces)
[bot] Add profit calculation module         (P2, no contract deps)
[bot] Add execution orchestrator            (P2, depends on scanner + contracts)
[deploy] Create deployment script           (P3, depends on all contract + security)
[infra] Add fork test configuration         (P1, no deps)
```

## Commands

```bash
# Create a task
bd create "[scope] Task title" --type task --priority 1 --description "..."

# Add dependency (task-b depends on task-a completing first)
bd dep add <task-b-id> <task-a-id>

# Link task to parent epic
bd dep add <task-id> <epic-id>

# View what was created
bd list --status=open
```

## Output Format

After creating tasks, report them with their dependencies and scopes visualized:

```
Created tasks for {plan-name}.plan.md:

{id}: [contract] Create FlashloanExecutor contract (P1)
{id}: [contract] Create IFlashloanReceiver interface (P1)
{id}: [dex] Add Uniswap V3 swap adapter (P1)
  +-- depends on: {interface-task-id}
{id}: [security] Add reentrancy protection (P1)
  +-- depends on: {executor-task-id}
{id}: [bot] Implement opportunity scanner (P2)
  +-- depends on: {interface-task-id}
{id}: [deploy] Create deployment script (P3)
  +-- depends on: {executor-id}, {security-id}
```

## Example

Given `features/flashloan-execution/flashloan-execution.plan.md` with:

```markdown
## Implementation Plan

### Phase 1: On-Chain Foundation

1. [ ] Create FlashloanExecutor contract with Aave V3 integration
2. [ ] Define IFlashloanReceiver interface
3. [ ] Add DEX swap routing (Uniswap V3, SushiSwap)

### Phase 2: Off-Chain Bot

1. [ ] Implement opportunity scanner for price discrepancies
2. [ ] Add profit calculation with gas estimation

### Phase 3: Integration

1. [ ] Create Foundry deployment script
2. [ ] End-to-end fork test
```

Create tasks:

```bash
# Phase 1 tasks (P1, on-chain)
bd create "[contract] Create FlashloanExecutor with Aave V3" --type task --priority 1 \
  --description "Implements: flashloan-execution - Phase 1
Scope: contract
Layer: on-chain

## What
Create FlashloanExecutor.sol that borrows from Aave V3, executes swaps, repays with fee.

## Acceptance Criteria
- Scenario: Execute profitable arbitrage via flashloan (passes in forge test)
- Scenario: Revert unprofitable flashloan (passes in forge test)

## Files to Change
- contracts/FlashloanExecutor.sol (create)
- test/FlashloanExecutor.t.sol (create)

## Testing
forge test -vvv --match-contract FlashloanExecutorTest"

# Phase 2 tasks (P1-P2, off-chain, depend on Phase 1)
bd create "[bot] Implement opportunity scanner" --type task --priority 2 \
  --description "Implements: flashloan-execution - Phase 2
Scope: bot
Layer: off-chain

## What
TypeScript module that monitors DEX prices and detects arbitrage opportunities.

## Acceptance Criteria
- Scenario: Detect price discrepancy across DEXes (passes in pnpm test)
- Scenario: Ignore unprofitable discrepancy (passes in pnpm test)

## Dependencies
- IFlashloanReceiver interface must exist (for ABI generation)

## Files to Change
- src/bot/scanner.ts (create)
- src/bot/scanner.test.ts (create)

## Testing
pnpm test -- --grep 'opportunity'"

# Add dependencies
bd dep add <scanner-task-id> <interface-task-id>
bd dep add <deploy-task-id> <executor-task-id>
```

Output:

```
Created tasks for flashloan-execution.plan.md:

flashloan-abc: [contract] Create FlashloanExecutor with Aave V3 (P1)
flashloan-def: [contract] Define IFlashloanReceiver interface (P1)
flashloan-ghi: [dex] Add Uniswap V3 + SushiSwap swap routing (P1)
  +-- depends on: flashloan-def
flashloan-jkl: [bot] Implement opportunity scanner (P2)
  +-- depends on: flashloan-def
flashloan-mno: [bot] Add profit calculation with gas estimation (P2)
flashloan-pqr: [deploy] Create Foundry deployment script (P2)
  +-- depends on: flashloan-abc, flashloan-ghi
flashloan-stu: [infra] End-to-end fork test (P3)
  +-- depends on: flashloan-pqr, flashloan-jkl, flashloan-mno
```

## After Task Creation

1. **Verify dependencies**: `bd dep tree <task-id>`
2. **Check ready work**: `bd ready` to see which tasks are unblocked
3. **Claim a task**: `bd update <id> --status in_progress`
4. **Implement**: Use `implementing-with-tdd` skill (Foundry or Vitest depending on scope)
5. **Close when done**: `bd close <id> --reason "Completed"`

## Team Agent Usage

When working as a team agent creating tasks:

1. **Create all tasks for a plan** in one pass
2. **Set up dependencies** respecting on-chain before off-chain ordering
3. **Report the task tree** to team lead for assignment
4. **Assign by expertise**: Contract tasks to Solidity agents, bot tasks to TypeScript agents
5. Team lead assigns tasks to agents via TaskUpdate

## Anti-Patterns (NEVER DO)

- Creating tasks without reading the full plan
- Skipping dependency links between on-chain and off-chain phases
- Making tasks too large (should be completable in one session)
- Creating tasks without clear acceptance criteria
- Forgetting to link to parent epic
- Creating off-chain tasks without dependencies on the contracts they interact with
- Deprioritizing security tasks -- they are always P1 for DeFi

## Commands Reference

```bash
# View the plan
cat features/<domain>/<domain>.plan.md

# Create task with full description
bd create "[scope] Task title" \
  --type task \
  --priority 1 \
  --description "$(cat <<EOF
Implements: plan-name - Phase N
Scope: contract|bot|dex|security|deploy|infra
Layer: on-chain|off-chain

## What
Description

## Acceptance Criteria
- Criterion 1
- Criterion 2

## Files to Change
- contracts/Contract.sol
- test/Contract.t.sol
- src/module/file.ts
- src/module/file.test.ts

## Testing
forge test -vvv --match-test test_function
pnpm test -- --grep "feature"
EOF
)"

# Add dependency
bd dep add <dependent-task-id> <blocker-task-id>

# View dependency tree
bd dep tree <task-id>

# Check ready work
bd ready
```
