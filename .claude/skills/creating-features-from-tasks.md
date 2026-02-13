---
name: creating-features-from-tasks
description: Converts beads tasks into Gherkin .feature files. Use when starting new work, when asked to "create a feature spec", "write scenarios for", or "define behavior for". This is Skill 1 in the BDD pipeline. Features are tagged @solidity or @typescript to indicate test layer.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Creating Features from Tasks

Transform beads issues into executable Gherkin `.feature` specifications. Features are tagged `@solidity` or `@typescript` to indicate which test framework validates each scenario -- Foundry for on-chain contracts, Vitest for off-chain bot logic.

## When to Use

- Starting new contract or bot feature work
- User says "create a feature spec", "define behavior for", "write scenarios"
- A beads task or epic exists and needs behavior specification
- Before planning -- features come FIRST in the pipeline

## Pipeline Position

```
beads issue -> .feature spec -> .plan.md -> tasks -> TDD implementation
               ^^^ YOU ARE HERE
```

## Workflow

1. **Read the beads issue**: `bd show <task-id>`
2. **Identify the domain**: What area? (flashloan execution, DEX integration, opportunity detection, etc.)
3. **Create domain directory**: `features/<domain>/`
4. **Write the .feature file**: Using Gherkin conventions below
5. **Tag scenarios**: `@solidity` for on-chain, `@typescript` for off-chain
6. **Confirm RED**: Scenarios describe behavior not yet implemented

## Directory Naming Rules

- Use lowercase with hyphens: `features/flashloan-execution/`, `features/dex-aggregator/`
- Group related functionality: `features/opportunity-detection/` not `features/scanner/` + `features/mempool-monitor/`
- Domain directories live in the repo-root `features/` directory

## Project Structure

```
features/
├── flashloan-execution/
│   ├── flashloan-execution.feature    # Spec (THIS skill output)
│   └── flashloan-execution.plan.md   # Plan (Skill 2 output)
├── dex-aggregator/
│   ├── dex-aggregator.feature
│   └── dex-aggregator.plan.md
└── opportunity-detection/
    ├── opportunity-detection.feature
    └── opportunity-detection.plan.md
```

## Gherkin Conventions for DeFi

### Feature Header

```gherkin
@solidity
Feature: <Domain> contract behavior
  As a flashloan arbitrage operator
  I want <what>
  So that <why>
```

or

```gherkin
@typescript
Feature: <Domain> bot behavior
  As a flashloan arbitrage operator
  I want <what>
  So that <why>
```

### Flashloan Execution Template (@solidity)

```gherkin
@solidity
Feature: Flashloan Execution
  As a flashloan arbitrage operator
  I want to execute flashloan-based arbitrage trades
  So that I can profit from price discrepancies across DEXes

  Scenario: Execute profitable arbitrage via flashloan
    Given a price discrepancy of 1% between Uniswap and SushiSwap for WETH/USDC
    When the bot executes a flashloan of 100 ETH
    Then the flashloan should be repaid with fee
    And the profit should be transferred to the bot wallet

  Scenario: Revert unprofitable flashloan
    Given a price discrepancy of 0.01% between Uniswap and SushiSwap for WETH/USDC
    When the bot executes a flashloan of 100 ETH
    Then the transaction should revert with "Unprofitable"
    And no gas should be wasted beyond the simulation

  Scenario: Handle flashloan with insufficient liquidity
    Given the Uniswap pool has less than 50 ETH liquidity
    When the bot attempts a flashloan of 100 ETH
    Then the transaction should revert gracefully
```

### DEX Integration Template (@solidity)

```gherkin
@solidity
Feature: DEX Aggregator
  As a flashloan arbitrage operator
  I want to swap tokens across multiple DEXes
  So that I can execute the most profitable trade route

  Scenario Outline: Swap tokens on supported DEX
    Given the DEX aggregator is configured for "<dex>"
    When I swap <amount> WETH for USDC on "<dex>"
    Then I should receive at least <min_output> USDC
    And the swap should complete in a single transaction

    Examples:
      | dex       | amount | min_output |
      | uniswap   | 10     | 18000      |
      | sushiswap | 10     | 17950      |

  Scenario: Multi-hop swap route
    Given a route WETH -> USDT -> DAI -> USDC
    When I execute the multi-hop swap with 10 WETH
    Then I should receive USDC at the end of the route
    And intermediate tokens should not remain in the contract
```

### Opportunity Detection Template (@typescript)

```gherkin
@typescript
Feature: Opportunity Detection
  As a flashloan arbitrage operator
  I want to detect profitable arbitrage opportunities
  So that the bot can execute trades before competitors

  Scenario: Detect price discrepancy across DEXes
    Given the scanner is monitoring Uniswap and SushiSwap
    And WETH/USDC is priced at 1800 on Uniswap
    And WETH/USDC is priced at 1820 on SushiSwap
    When the scanner checks for arbitrage opportunities
    Then it should detect a profitable opportunity
    And the expected profit should account for gas costs and flashloan fees

  Scenario: Ignore unprofitable discrepancy
    Given the scanner is monitoring Uniswap and SushiSwap
    And WETH/USDC is priced at 1800 on Uniswap
    And WETH/USDC is priced at 1801 on SushiSwap
    When the scanner checks for arbitrage opportunities
    Then it should report no profitable opportunity
```

### Profit Calculation Template (@typescript)

```gherkin
@typescript
Feature: Profit Calculation
  As a flashloan arbitrage operator
  I want accurate profit calculations before execution
  So that I only execute trades that are net-positive after all fees

  Scenario: Calculate net profit after fees
    Given a flashloan amount of 100 ETH
    And the flashloan fee is 0.09%
    And the swap profit is 0.5 ETH
    And estimated gas cost is 0.02 ETH
    When I calculate net profit
    Then the net profit should be approximately 0.39 ETH

  Scenario: Reject trade when fees exceed profit
    Given a flashloan amount of 100 ETH
    And the flashloan fee is 0.09%
    And the swap profit is 0.05 ETH
    And estimated gas cost is 0.02 ETH
    When I calculate net profit
    Then the trade should be flagged as unprofitable
```

### Security Template (@solidity)

```gherkin
@solidity
Feature: Contract Security
  As a flashloan arbitrage operator
  I want the contract to be protected against attacks
  So that funds cannot be drained by malicious actors

  Scenario: Only owner can withdraw profits
    Given the contract holds 1 ETH in profit
    When a non-owner address calls withdraw
    Then the transaction should revert with "Ownable: caller is not the owner"

  Scenario: Reentrancy protection on flashloan callback
    Given a malicious contract attempts reentrancy during callback
    When the flashloan callback is executed
    Then the transaction should revert
```

## Tagging Rules

| Tag | Test Framework | When to Use |
|-----|---------------|-------------|
| `@solidity` | Foundry (`forge test`) | Smart contract behavior, on-chain logic, DEX swaps, flashloan execution |
| `@typescript` | Vitest (`pnpm test`) | Bot logic, opportunity detection, profit calculation, off-chain orchestration |

Features can have BOTH tags if they span on-chain and off-chain:

```gherkin
@solidity @typescript
Feature: End-to-end Arbitrage
  ...
```

## Anti-Patterns (NEVER DO)

- Writing implementation before the `.feature` file
- Creating scenarios without `@solidity` or `@typescript` tags
- Writing vague scenarios ("contract should work properly")
- Mixing on-chain and off-chain concerns in a single scenario (split them)
- Skipping the profit/loss calculation scenarios for any trade feature
- Ignoring gas costs in acceptance criteria

## After Creating Features

1. **Confirm RED**: Contract tests fail (`forge test`), bot tests fail (`pnpm test`)
2. **Create plan**: Use `planning-features` skill
3. **Hand off to planning**: The `.feature` file drives the plan
