---
name: implementing-with-tdd
description: Implements tasks using strict TDD (red-green-refactor) workflow in both Solidity (Foundry) and TypeScript (Vitest). Use when working on implementation tasks, writing smart contracts, or building bot logic. Enforces mandatory test-first discipline across both languages.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Implementing with TDD

Strict test-driven development for all implementation work. The red-green-refactor cycle is **MANDATORY**, not recommended. This project uses TWO TDD cycles -- one for Solidity (Foundry) and one for TypeScript (Vitest).

## When to Use

- Implementing Solidity smart contracts (scope: contract, dex, security)
- Implementing TypeScript bot modules (scope: bot)
- Creating Foundry deployment scripts (scope: deploy)
- Any beads task that produces code

## Pre-Implementation Checklist

Before writing ANY production code:

- [ ] Read the beads task: `bd show <task-id>`
- [ ] Read related .plan.md (if it exists)
- [ ] Understand acceptance criteria
- [ ] Identify the task scope (contract, bot, dex, security, deploy, infra)
- [ ] Know which TDD cycle to use (Foundry or Vitest or both)
- [ ] Claim the task: `bd update <task-id> --status in_progress`

---

## Solidity TDD Cycle (Foundry)

For tasks with scope: `contract`, `dex`, `security`, `deploy`

### RED Phase -- Write Failing Test

1. **Write a failing test** in `test/{Contract}.t.sol`
2. Run `forge test -vvv --match-test test_functionName` and confirm it **FAILS**
3. Confirm the failure is correct (not a compilation error unrelated to missing logic)
4. **Do NOT proceed until you have a proper test failure**

```solidity
// test/FlashloanExecutor.t.sol
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/FlashloanExecutor.sol";

contract FlashloanExecutorTest is Test {
    FlashloanExecutor executor;

    function setUp() public {
        executor = new FlashloanExecutor();
    }

    function test_executeArbitrage_profitableSwap() public {
        // Arrange: set up price discrepancy
        // Act: execute flashloan
        // Assert: profit transferred to owner
        uint256 profit = executor.executeArbitrage(
            address(weth),
            100 ether,
            route
        );
        assertGt(profit, 0, "Should be profitable");
    }

    function test_executeArbitrage_revertsWhenUnprofitable() public {
        vm.expectRevert("Unprofitable");
        executor.executeArbitrage(
            address(weth),
            100 ether,
            unprofitableRoute
        );
    }
}
```

```bash
forge test -vvv --match-test test_executeArbitrage
# FAIL: FlashloanExecutor doesn't exist yet
```

### GREEN Phase -- Make It Pass

1. **Write the minimal Solidity code** to make the test pass
2. No extra features, abstractions, or gas optimizations yet
3. Run `forge test -vvv --match-test test_functionName` and confirm all tests **PASS**

```solidity
// contracts/FlashloanExecutor.sol
pragma solidity ^0.8.20;

contract FlashloanExecutor {
    function executeArbitrage(
        address token,
        uint256 amount,
        bytes calldata route
    ) external returns (uint256 profit) {
        // Minimal implementation to pass
        // ...
    }
}
```

```bash
forge test -vvv --match-test test_executeArbitrage
# PASS: All tests green
```

### REFACTOR Phase -- Optimize

1. **Gas optimization**: storage packing, `calldata` vs `memory`, unchecked math where safe
2. **Pattern compliance**: CEI (Checks-Effects-Interactions), ReentrancyGuard
3. Run `forge test -vvv` after each refactor change
4. Run `forge test --gas-report` to measure gas improvements
5. Stop if any test goes red -- fix before continuing

```bash
# After each refactor
forge test -vvv

# Measure gas improvements
forge test --gas-report

# Fuzz test for edge cases
forge test --fuzz-runs 1000 --match-test test_functionName
```

### Fork Testing (for DEX interactions)

DEX-related tests MUST include fork tests against real pools:

```bash
# Fork mainnet for real DEX pool testing
forge test --fork-url $MAINNET_RPC_URL --match-test test_dexSwap -vvv

# Fork at specific block for deterministic results
forge test --fork-url $MAINNET_RPC_URL --fork-block-number 19000000 -vvv

# Fork Arbitrum
forge test --fork-url $ARBITRUM_RPC_URL --match-test test_arbSwap -vvv
```

---

## TypeScript TDD Cycle (Vitest)

For tasks with scope: `bot`, `infra` (off-chain parts)

### RED Phase -- Write Failing Test

1. **Write a failing test** in `src/**/*.test.ts`
2. Run `pnpm test` and confirm it **FAILS**
3. Confirm the failure is correct (not an import or syntax error)
4. **Do NOT proceed until you have a proper test failure**

```typescript
// src/bot/scanner.test.ts
import { describe, it, expect } from 'vitest';
import { Scanner } from './scanner';

describe('Scanner', () => {
  it('should detect profitable arbitrage opportunity', () => {
    const scanner = new Scanner({
      dexes: ['uniswap', 'sushiswap'],
      pairs: ['WETH/USDC'],
    });

    const prices = {
      uniswap: { 'WETH/USDC': 1800n },
      sushiswap: { 'WETH/USDC': 1820n },
    };

    const opportunities = scanner.findOpportunities(prices);

    expect(opportunities).toHaveLength(1);
    expect(opportunities[0].pair).toBe('WETH/USDC');
    expect(opportunities[0].profitBps).toBeGreaterThan(0);
  });

  it('should ignore unprofitable discrepancy', () => {
    const scanner = new Scanner({
      dexes: ['uniswap', 'sushiswap'],
      pairs: ['WETH/USDC'],
      minProfitBps: 10,
    });

    const prices = {
      uniswap: { 'WETH/USDC': 1800n },
      sushiswap: { 'WETH/USDC': 1801n },
    };

    const opportunities = scanner.findOpportunities(prices);

    expect(opportunities).toHaveLength(0);
  });
});
```

```bash
pnpm test
# FAIL: Cannot find module './scanner'
```

### GREEN Phase -- Make It Pass

1. **Write the minimal TypeScript code** to make the test pass
2. No extra features, abstractions, or cleanup
3. Run `pnpm test` and confirm all tests **PASS**

```typescript
// src/bot/scanner.ts
export interface ScannerConfig {
  dexes: string[];
  pairs: string[];
  minProfitBps?: number;
}

export interface Opportunity {
  pair: string;
  buyDex: string;
  sellDex: string;
  profitBps: number;
}

export class Scanner {
  constructor(private config: ScannerConfig) {}

  findOpportunities(prices: Record<string, Record<string, bigint>>): Opportunity[] {
    // Minimal implementation to pass
    // ...
  }
}
```

```bash
pnpm test
# PASS: All tests green
```

### REFACTOR Phase -- Clean Up

1. **Type safety**: Ensure all types are strict, no `any`
2. **Clean interfaces**: Extract types to shared modules
3. Run `pnpm test` after each refactor
4. Stop if any test goes red -- fix before continuing

```bash
# After each refactor
pnpm test

# Watch mode for rapid iteration
pnpm test:watch
```

---

## Anti-Patterns (NEVER DO)

- **NEVER write production code before the test**
- **NEVER add Solidity contracts without Foundry tests**
- **NEVER add TypeScript modules without Vitest tests**
- **NEVER skip the RED phase** -- you must see it fail first
- **NEVER mark a test as passing without running the test command**
- **NEVER close a task with failing tests in either framework**
- Writing "tests later" or "tests in a follow-up"
- Testing after the fact to justify existing code
- Skipping refactor because "it works"
- Skipping fork tests for DEX interactions
- Skipping fuzz tests for security-critical functions

## Quality Gates

Before closing ANY task, ALL of the following must pass:

```bash
# 1. All Foundry tests pass
forge test -vvv

# 2. All Vitest tests pass
pnpm test

# 3. Solidity compilation clean
forge build

# 4. TypeScript compilation clean
pnpm tsc --noEmit

# 5. Gas report (for contract tasks)
forge test --gas-report

# 6. Fork tests (for DEX tasks)
forge test --fork-url $MAINNET_RPC_URL -vvv

# 7. Fuzz tests (for security tasks)
forge test --fuzz-runs 1000
```

**All gates must pass before closing a task.**

## Commands Reference

```bash
# === Foundry (Solidity) ===

# Run all Foundry tests
forge test -vvv

# Run specific test function
forge test -vvv --match-test test_functionName

# Run specific test contract
forge test -vvv --match-contract ContractTest

# Fork testing (real DEX pools)
forge test --fork-url $MAINNET_RPC_URL -vvv

# Fork at specific block
forge test --fork-url $MAINNET_RPC_URL --fork-block-number 19000000 -vvv

# Fuzz testing
forge test --fuzz-runs 1000

# Gas report
forge test --gas-report

# Build contracts
forge build

# === Vitest (TypeScript) ===

# Run all Vitest tests
pnpm test

# Watch mode
pnpm test:watch

# Run specific test file
pnpm test -- src/bot/scanner.test.ts

# Run with grep pattern
pnpm test -- --grep "scanner"

# TypeScript type checking
pnpm tsc --noEmit

# === Both (Quality Gate) ===

# Full quality gate check
forge test -vvv && pnpm test && forge build && pnpm tsc --noEmit

# === Task management ===

bd show <task-id>
bd update <task-id> --status in_progress
bd close <task-id> --reason "Implemented with TDD"
```

## Example Workflow: Adding Flashloan Executor

```bash
# 1. Claim the task
bd update <task-id> --status in_progress

# 2. RED -- Write failing Foundry test
# Create test/FlashloanExecutor.t.sol with test_executeArbitrage

# 3. Run tests -- confirm RED
forge test -vvv --match-test test_executeArbitrage
# FAIL: contracts/FlashloanExecutor.sol doesn't exist

# 4. GREEN -- Write minimal contract
# Create contracts/FlashloanExecutor.sol

# 5. Run tests -- confirm GREEN
forge test -vvv --match-test test_executeArbitrage
# PASS: All tests pass

# 6. REFACTOR -- Gas optimization
# Apply storage packing, calldata optimization
# Run forge test --gas-report to measure

# 7. Quality gates
forge test -vvv
forge test --gas-report
forge build

# 8. Close
bd close <task-id> --reason "Added FlashloanExecutor with TDD"
```

## Example Workflow: Adding Opportunity Scanner

```bash
# 1. Claim the task
bd update <task-id> --status in_progress

# 2. RED -- Write failing Vitest test
# Create src/bot/scanner.test.ts

# 3. Run tests -- confirm RED
pnpm test
# FAIL: Cannot find module './scanner'

# 4. GREEN -- Write minimal module
# Create src/bot/scanner.ts

# 5. Run tests -- confirm GREEN
pnpm test
# PASS: All tests pass

# 6. REFACTOR -- Type safety, clean interfaces
# Extract types, improve naming
# Run pnpm test after each tweak

# 7. Quality gates
pnpm test
pnpm tsc --noEmit

# 8. Close
bd close <task-id> --reason "Added opportunity scanner with TDD"
```

## Team Agent Usage

When working as a team agent on TDD tasks:

1. **Claim the task** via TaskUpdate or `bd update`
2. **Identify the framework**: Foundry for on-chain, Vitest for off-chain
3. **Follow the full RED-GREEN-REFACTOR cycle** -- no shortcuts
4. **Run both test suites** to catch regressions: `forge test -vvv && pnpm test`
5. **Report results** to team lead when done
6. **Mark task complete** only when all quality gates pass

## Related Documentation

- [BDD Workflow](.rules/patterns/bdd-workflow.md)
- [Beads Integration](.rules/patterns/beads-integration.md)
- [Git Workflow](.rules/patterns/git-workflow.md)
