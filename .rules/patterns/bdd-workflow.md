---
description: BDD workflow for dual-language testing (Solidity + TypeScript) in the flashloan arbitrage bot
tags: [bdd, testing, solidity, typescript, foundry, vitest]
last_updated: 2026-02-13
---

# BDD Workflow

Technical reference for the Behavior-Driven Development pattern used in the flashloan arbitrage bot. This project has two test ecosystems: **Solidity** (Foundry) for on-chain contracts and **TypeScript** (Vitest) for the off-chain bot.

## Pipeline

```
beads issue -> .feature spec -> .plan.md -> tasks -> TDD implementation
   (Define)     (Specify)      (Plan)    (Break)    (Build)
```

| Stage | Skill | Input | Output |
|-------|-------|-------|--------|
| Define | `bd create` | Problem/need | Beads issue |
| Specify | `creating-features-from-tasks` | Beads issue | `.feature` file |
| Plan | `planning-features` | `.feature` file | `.plan.md` |
| Break | `creating-tasks-from-plans` | `.plan.md` | Beads tasks |
| Build | `implementing-with-tdd` | Beads task | Code + passing tests |

## Project Structure

```
init.flashloan-scaffolding/
├── features/                           # BDD feature files (project root)
│   ├── contracts/
│   │   ├── flashloan-executor.feature
│   │   ├── dex-adapters.feature
│   │   └── safety-module.feature
│   ├── bot/
│   │   ├── price-monitor.feature
│   │   ├── opportunity-detector.feature
│   │   └── execution-engine.feature
│   └── integration/
│       └── end-to-end.feature
├── test/                               # Solidity tests (Foundry convention)
│   ├── FlashloanExecutor.t.sol
│   ├── adapters/
│   │   ├── UniswapV2Adapter.t.sol
│   │   ├── UniswapV3Adapter.t.sol
│   │   └── CurveAdapter.t.sol
│   ├── safety/
│   │   ├── CircuitBreaker.t.sol
│   │   └── ProfitValidator.t.sol
│   └── fork/
│       └── FlashloanExecutor.fork.t.sol
└── src/                                # TypeScript bot (co-located tests)
    ├── monitor/
    │   ├── PriceMonitor.ts
    │   └── PriceMonitor.test.ts        # Vitest test
    ├── detector/
    │   ├── OpportunityDetector.ts
    │   └── OpportunityDetector.test.ts
    ├── builder/
    │   ├── TransactionBuilder.ts
    │   └── TransactionBuilder.test.ts
    └── engine/
        ├── ExecutionEngine.ts
        └── ExecutionEngine.test.ts
```

## Dual-Language Testing

### Solidity Tests (Foundry)

Foundry tests map directly to BDD feature scenarios using the `test_` naming convention.

| Gherkin Concept | Foundry Equivalent |
|-----------------|-------------------|
| Feature | Test contract (`contract FlashloanExecutorTest is Test`) |
| Scenario | Test function (`function test_executeArbitrage_succeeds()`) |
| Scenario Outline | Parameterized test or fuzz test (`function testFuzz_profitValidation(uint256)`) |
| Given | `setUp()` function + test setup within function |
| When | Call the function under test |
| Then | `assert*` / `vm.expectRevert` / `vm.expectEmit` |

#### Commands

```bash
# Run all Solidity tests
forge test

# Run with verbosity (show traces on failure)
forge test -vvv

# Run specific test file
forge test --match-path test/FlashloanExecutor.t.sol

# Run specific test function
forge test --match-test test_executeArbitrage

# Run fork tests against mainnet
forge test --fork-url $ETH_RPC_URL

# Run fork tests at specific block
forge test --fork-url $ETH_RPC_URL --fork-block-number 19000000

# Run fuzz tests with more iterations
forge test --fuzz-runs 1000

# Run with gas report
forge test --gas-report

# Run invariant tests
forge test --match-test invariant_
```

### TypeScript Tests (Vitest)

TypeScript tests are co-located with source files and use Vitest's BDD-style `describe`/`it` blocks.

| Gherkin Concept | Vitest Equivalent |
|-----------------|-------------------|
| Feature | `describe('PriceMonitor', () => { ... })` |
| Scenario | `it('should detect price discrepancy across DEXes', () => { ... })` |
| Background | `beforeEach(() => { ... })` |
| Given | Setup within `beforeEach` or test body |
| When | Call the function under test |
| Then | `expect(...).toBe(...)` |

#### Commands

```bash
# Run all TypeScript tests
pnpm test

# Run in watch mode
pnpm test:watch

# Run specific test file
pnpm test src/monitor/PriceMonitor.test.ts

# Run with coverage
pnpm test:coverage
```

## BDD -> Test Mapping

### Feature File (Shared Specification)

```gherkin
# features/contracts/flashloan-executor.feature
Feature: Flashloan Executor
  As a bot operator
  I want the FlashloanExecutor to atomically execute arbitrage
  So that I can profit from cross-DEX price discrepancies

  Scenario: Successful arbitrage execution
    Given a price discrepancy exists between Uniswap V2 and SushiSwap
    And the estimated profit exceeds gas costs and flash loan fees
    When the bot triggers executeArbitrage with the optimal swap path
    Then the flash loan is taken and repaid within one transaction
    And the profit is sent to the bot wallet

  Scenario: Revert on insufficient profit
    Given a marginal price discrepancy exists
    And the estimated profit is below the minimum threshold
    When the bot triggers executeArbitrage
    Then the transaction reverts with InsufficientProfit error
    And no funds are lost

  Scenario: Circuit breaker halts on high gas
    Given the network gas price exceeds the configured maximum
    When the bot attempts to execute
    Then the circuit breaker prevents execution
    And a GasLimitExceeded event is emitted
```

### Solidity Test (On-Chain Implementation)

```solidity
// test/FlashloanExecutor.t.sol
contract FlashloanExecutorTest is Test {
    FlashloanExecutor executor;
    MockDEXAdapter uniAdapter;
    MockDEXAdapter sushiAdapter;

    function setUp() public {
        // Background: deploy contracts, register adapters
        executor = new FlashloanExecutor(AAVE_POOL, WETH);
        uniAdapter = new MockDEXAdapter();
        sushiAdapter = new MockDEXAdapter();
        executor.registerAdapter(address(uniAdapter));
        executor.registerAdapter(address(sushiAdapter));
    }

    // Scenario: Successful arbitrage execution
    function test_executeArbitrage_succeeds() public {
        // Given: price discrepancy exists
        uniAdapter.setRate(1000e6);   // 1 ETH = 1000 USDC on Uni
        sushiAdapter.setRate(1010e6); // 1 ETH = 1010 USDC on Sushi

        // When: bot triggers executeArbitrage
        executor.executeArbitrage(
            AAVE_POOL, WETH, 1 ether, steps
        );

        // Then: profit sent to bot wallet
        assertGt(IERC20(WETH).balanceOf(address(executor)), 0);
    }

    // Scenario: Revert on insufficient profit
    function test_executeArbitrage_revertsOnLowProfit() public {
        uniAdapter.setRate(1000e6);
        sushiAdapter.setRate(1000e6); // No discrepancy

        vm.expectRevert(InsufficientProfit.selector);
        executor.executeArbitrage(
            AAVE_POOL, WETH, 1 ether, steps
        );
    }

    // Scenario: Circuit breaker halts on high gas
    function test_circuitBreaker_haltsOnHighGas() public {
        executor.setMaxGasPrice(50 gwei);
        vm.txGasPrice(100 gwei);

        vm.expectRevert(GasLimitExceeded.selector);
        executor.executeArbitrage(
            AAVE_POOL, WETH, 1 ether, steps
        );
    }
}
```

### TypeScript Test (Off-Chain Implementation)

```typescript
// src/detector/OpportunityDetector.test.ts
describe('OpportunityDetector', () => {
  let detector: OpportunityDetector;
  let mockPriceMonitor: MockPriceMonitor;

  beforeEach(() => {
    // Background: set up detector with mock dependencies
    mockPriceMonitor = new MockPriceMonitor();
    detector = new OpportunityDetector(mockPriceMonitor);
  });

  // Scenario: Detect profitable arbitrage path
  it('should detect profitable arbitrage when price discrepancy exists', () => {
    // Given: price discrepancy
    mockPriceMonitor.setPrices({
      'uniswap-v2': { 'WETH/USDC': 1000n },
      'sushiswap':  { 'WETH/USDC': 1010n },
    });

    // When: scan for opportunities
    const opportunities = detector.scan();

    // Then: profitable path found
    expect(opportunities).toHaveLength(1);
    expect(opportunities[0].estimatedProfit).toBeGreaterThan(0n);
  });
});
```

## Worked Example: Adding Curve Adapter

### 1. Create beads issue

```bash
bd create "Add Curve Finance DEX adapter" --type feature --priority 1
```

### 2. Specify behavior (Skill 1)

Create `features/contracts/curve-adapter.feature`:

```gherkin
Feature: Curve Finance DEX Adapter
  As a bot operator
  I want to swap tokens through Curve pools
  So that I can arbitrage stablecoin price discrepancies

  Scenario: Swap USDC for USDT via Curve 3pool
    Given the CurveAdapter is registered with FlashloanExecutor
    And the Curve 3pool has sufficient liquidity
    When a swap of 10000 USDC for USDT is executed
    Then the output amount is within 0.1% of expected
    And the adapter emits a SwapExecuted event

  Scenario: Revert on unsupported pool
    Given the CurveAdapter is called with an invalid pool address
    When the swap is attempted
    Then the transaction reverts with PoolNotFound error

  Scenario: Gas usage within acceptable range
    Given a standard Curve swap is executed
    Then the gas used is less than 200000
```

Verify RED:

```bash
forge test --match-path test/adapters/CurveAdapter.t.sol -v
# FAILS: CurveAdapter contract does not exist
```

### 3. Plan implementation (Skill 2)

Create `features/contracts/curve-adapter.plan.md` driven by the 3 scenarios above.

### 4. Create tasks (Skill 3)

```bash
bd create "Create IDEXAdapter-compliant CurveAdapter contract" --type task --priority 1
bd create "Write unit tests for CurveAdapter" --type task --priority 1
bd create "Write fork test for CurveAdapter against mainnet 3pool" --type task --priority 1
bd create "Register CurveAdapter in FlashloanExecutor" --type task --priority 2
```

### 5. Implement with TDD (Skill 4)

RED -> write failing tests -> GREEN -> implement contract -> REFACTOR.

Verify GREEN:

```bash
# Unit tests
forge test --match-path test/adapters/CurveAdapter.t.sol -v
# PASSES

# Fork tests
forge test --match-path test/fork/ --fork-url $ETH_RPC_URL -v
# PASSES

# Gas report
forge test --match-path test/adapters/CurveAdapter.t.sol --gas-report
# Gas within budget

# All tests
forge test && pnpm test
# PASSES: All green
```

## Relationship: Solidity Tests vs TypeScript Tests

| Aspect | Solidity (Foundry `test/`) | TypeScript (Vitest `src/**/*.test.ts`) |
|--------|---------------------------|----------------------------------------|
| Scope | On-chain contract logic | Off-chain bot logic |
| Runtime | EVM (Foundry's anvil) | Node.js |
| Mock strategy | Mock contracts, `vm.prank`, `vm.deal` | Mock classes, dependency injection |
| Fork testing | `--fork-url` (real chain state) | Mock RPC responses or use anvil |
| Fuzz testing | `testFuzz_*` (built-in) | Property-based with fast-check |
| Gas testing | `--gas-report` (built-in) | N/A (off-chain) |

Both run together in CI:

```bash
# Full test suite
forge test && pnpm test
```

## Commands Summary

```bash
# === Solidity (Foundry) ===
forge test                                    # All contract tests
forge test -vvv                               # Verbose with traces
forge test --match-path test/adapters/        # Specific directory
forge test --match-test test_execute          # Specific test name
forge test --fork-url $ETH_RPC_URL            # Fork tests
forge test --fuzz-runs 1000                   # Extended fuzzing
forge test --gas-report                       # Gas usage report

# === TypeScript (Vitest) ===
pnpm test                                    # All bot tests
pnpm test:watch                              # Watch mode
pnpm test src/monitor/                       # Specific directory
pnpm test:coverage                           # Coverage report

# === Both ===
forge test && pnpm test                      # Full suite
```

## Related Documentation

- [Contract Architecture](.rules/architecture/contract-architecture.md)
- [Beads Integration](.rules/patterns/beads-integration.md)
- [Git Workflow](.rules/patterns/git-workflow.md)
