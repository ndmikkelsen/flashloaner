---
name: planning-features
description: Creates implementation plans (.plan.md) driven by .feature file scenarios. Use when a .feature spec exists and you need an implementation plan, when asked to "plan this feature", "create implementation plan from feature", or "how should we implement this spec". This is Skill 2 in the BDD pipeline. Plans identify on-chain vs off-chain components and include gas and fork-testing considerations.
allowed-tools: Read, Write, Bash, Grep, Glob
---

# Planning Features

Create implementation plans driven by `.feature` file scenarios. Plans are DRIVEN BY the spec -- every scenario maps to implementation work, and the Definition of Done is all scenarios passing green. Plans must identify which layer (on-chain or off-chain) each component belongs to.

## When to Use

- A `.feature` file exists and needs an implementation plan
- User says "plan this feature", "create implementation plan", "how should we implement"
- After the `creating-features-from-tasks` skill has produced a `.feature` file
- Starting significant contract or bot work

## Pipeline Position

```
beads issue -> .feature spec -> .plan.md -> tasks -> TDD implementation
                                ^^^ YOU ARE HERE
```

## Key Difference from Generic Planning

Plans are **scenario-driven** and **layer-aware**:
- Every scenario in the `.feature` file maps to at least one implementation task
- The "Feature Scenarios" section explicitly links scenarios -> phases -> tasks
- Each task is tagged with its layer: **on-chain** (Solidity/Foundry) or **off-chain** (TypeScript/Vitest)
- Definition of Done = all `.feature` scenarios pass green in BOTH test frameworks
- User Stories are extracted from the Feature description (As a / I want / So that)

## Workflow

1. **Read the `.feature` file**: Parse all scenarios, note `@solidity` and `@typescript` tags
2. **Read the beads issue**: `bd show <task-id>` for additional context
3. **Identify layers**: Which scenarios need on-chain work? Off-chain work? Both?
4. **Research codebase**: Find existing contracts, bot modules, interfaces, patterns
5. **Draft the plan**: Use template below -- scenarios drive the structure
6. **Include gas considerations**: Estimate gas costs for on-chain operations
7. **Include fork testing requirements**: Which DEX interactions need mainnet fork testing?
8. **Review with user**: Confirm design decisions before finalizing

## Plan Template

Create the plan as `features/<domain>/<domain>.plan.md` (colocated with the feature):

```markdown
# {Feature Title} - Implementation Plan

**Beads Issue**: {task-id}
**Feature Spec**: `features/<domain>/<domain>.feature`
**Created**: {DATE}
**Status**: Draft | Approved | In Progress | Complete

## User Stories

> As a {role}
> I want {capability}
> So that {benefit}

(Extracted from the Feature description)

## Feature Scenarios

Maps scenarios to implementation phases, tasks, and layers:

| Scenario | Layer | Phase | Tasks |
|----------|-------|-------|-------|
| {Scenario name} | on-chain | Phase {N} | {What to do} |
| {Scenario name} | off-chain | Phase {N} | {What to do} |

### Definition of Done
All scenarios in `features/<domain>/<domain>.feature` pass green:
```bash
# On-chain scenarios (@solidity)
forge test -vvv --match-contract {TestContract}

# Off-chain scenarios (@typescript)
pnpm test -- --grep "{feature name}"

# Both must pass
forge test -vvv && pnpm test
```

## Design Decisions

### Decision 1: {Title}

**Context**: {Why this decision is needed}

**Options Considered**:
1. {Option A}: {pros/cons}
2. {Option B}: {pros/cons}

**Decision**: {What we chose}

**Rationale**: {Why we chose it}

## Implementation Plan

### Phase 1: {Foundation -- On-Chain}

1. [ ] {Task -- linked to scenario(s)}
   - **Layer**: on-chain
   - **Scenarios**: {Which .feature scenarios this satisfies}
   - **Files**: {Key files to create/modify}
   - **Gas Budget**: {Estimated gas for this operation}

### Phase 2: {Core Implementation -- Off-Chain}

1. [ ] {Task -- linked to scenario(s)}
   - **Layer**: off-chain
   - **Scenarios**: {Which .feature scenarios this satisfies}
   - **Files**: {Key files to create/modify}

### Phase 3: {Integration/Verification}

1. [ ] {Task -- verify all scenarios pass in both frameworks}

## Technical Specifications

### On-Chain (Solidity)
- **Contracts**: {Contracts to create/modify}
- **Interfaces**: {Interface definitions needed}
- **Libraries**: {Shared library contracts}
- **Inheritance**: {Contract inheritance chain}
- **Gas Optimization**: {Storage packing, calldata vs memory, etc.}

### Off-Chain (TypeScript)
- **Modules**: {TypeScript modules to create/modify}
- **Dependencies**: {ethers.js interactions, external APIs}
- **Configuration**: {Environment variables, RPC endpoints}

### Fork Testing Requirements

DEX interactions require mainnet fork testing to validate real pool behavior:

```bash
# Fork mainnet at specific block for deterministic tests
forge test --fork-url $MAINNET_RPC_URL --fork-block-number {block}

# Fork with specific chain
forge test --fork-url $ARBITRUM_RPC_URL
```

**Pools to test against**:
- {DEX name}: {Pool address} ({Token pair})

### Gas Estimation

| Operation | Estimated Gas | Max Acceptable |
|-----------|--------------|----------------|
| Flashloan initiation | ~{N} | {max} |
| DEX swap (single hop) | ~{N} | {max} |
| Multi-hop route | ~{N} | {max} |
| Full arbitrage execution | ~{N} | {max} |

## Testing Strategy

### Solidity Tests (Foundry) -- @solidity scenarios
- Test files: `test/{TestContract}.t.sol`
- Run: `forge test -vvv --match-contract {TestContract}`
- Fork testing: `forge test --fork-url $MAINNET_RPC_URL`
- Fuzz testing: `forge test --fuzz-runs 1000`
- Gas report: `forge test --gas-report`

### TypeScript Tests (Vitest) -- @typescript scenarios
- Test files: `src/**/*.test.ts`
- Run: `pnpm test`
- Watch mode: `pnpm test:watch`

### Integration Tests
- Both test suites pass: `forge test -vvv && pnpm test`

## Security Considerations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Reentrancy in callback | Fund loss | ReentrancyGuard, CEI pattern |
| Sandwich attack | Profit loss | Slippage protection, private mempool |
| Oracle manipulation | Bad pricing | Multi-source pricing, TWAP |
| Flash loan fee changes | Reduced profit | Dynamic fee calculation |
| {Additional risks} | {Impact} | {Mitigation} |

## Deployment Considerations

- **Foundry scripts**: `script/{DeployContract}.s.sol`
- **Network**: {Target network(s)}
- **Verification**: `forge verify-contract`
- **Dependencies**: {Which contracts must be deployed first}
```

## Output Location

Plans are colocated with their feature:

```
features/<domain>/
├── <domain>.feature       <- Spec (Skill 1 output)
└── <domain>.plan.md       <- Plan (THIS skill output)
```

## After Planning

Once the `.plan.md` is approved:

1. **Create beads tasks**: Use `creating-tasks-from-plans` skill
2. **Begin implementation**: Use `implementing-with-tdd` skill
3. **Verify**: All `.feature` scenarios pass green in both frameworks

## Anti-Patterns (NEVER DO)

- Creating a plan without reading the `.feature` file first
- Plans that don't reference specific scenarios
- Definition of Done that doesn't include "all scenarios pass green" in BOTH frameworks
- Skipping the Feature Scenarios mapping table
- Planning work not covered by any scenario
- Ignoring gas estimation for on-chain operations
- Skipping fork testing requirements for DEX interactions
- Not specifying which layer (on-chain/off-chain) each task belongs to
