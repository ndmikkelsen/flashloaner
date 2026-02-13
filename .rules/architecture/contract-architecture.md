---
description: Solidity smart contract design patterns, inheritance hierarchy, and DeFi best practices
tags: [architecture, solidity, contracts, defi, patterns]
last_updated: 2026-02-13
---

# Contract Architecture

## Overview

This document covers the Solidity contract design patterns, inheritance hierarchy, interface design, and testing strategies used in the flashloan arbitrage bot.

## Inheritance Hierarchy

```
                    ┌───────────────────┐
                    │     Ownable       │  (OpenZeppelin)
                    │  (access control) │
                    └────────┬──────────┘
                             │
                    ┌────────▼──────────┐
                    │  ReentrancyGuard  │  (OpenZeppelin)
                    │ (reentrancy lock) │
                    └────────┬──────────┘
                             │
                    ┌────────▼──────────┐
                    │ FlashloanReceiver │  (abstract)
                    │ provider callbacks│
                    └────────┬──────────┘
                             │
                    ┌────────▼──────────┐
                    │ FlashloanExecutor │  (main contract)
                    │ orchestrates arb  │
                    └────────┬──────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼───┐  ┌──────▼─────┐  ┌────▼──────┐
     │ IDEXAdapter│  │ IDEXAdapter│  │IDEXAdapter│
     │ (Uni V2)   │  │ (Uni V3)   │  │ (Curve)   │
     └────────────┘  └────────────┘  └───────────┘
```

### Base Contracts

**FlashloanReceiver** (abstract):
- Implements provider-specific flash loan callbacks
- `executeOperation()` for Aave V3
- `callFunction()` for dYdX
- `receiveFlashLoan()` for Balancer
- `uniswapV3FlashCallback()` for Uniswap V3

**FlashloanExecutor** (concrete):
- Inherits `FlashloanReceiver`, `Ownable`, `ReentrancyGuard`
- Entry point for all arbitrage executions
- Routes swaps to appropriate DEX adapters
- Enforces profit validation before repaying flash loan

## Interface-First Design

All external interactions are defined through interfaces. This enables:
- Mock contracts for unit testing
- Swappable implementations (upgrade DEX adapter without touching executor)
- Clear API boundaries between components

### Core Interfaces

```solidity
// IFlashloanExecutor.sol
interface IFlashloanExecutor {
    struct SwapStep {
        address adapter;      // DEX adapter contract
        address tokenIn;      // Input token
        address tokenOut;     // Output token
        uint256 amountIn;     // Input amount (0 = use full balance)
        bytes extraData;      // Adapter-specific params (pool fee, route, etc.)
    }

    function executeArbitrage(
        address flashLoanProvider,
        address flashLoanToken,
        uint256 flashLoanAmount,
        SwapStep[] calldata steps
    ) external;

    function withdrawToken(address token, uint256 amount) external;
    function withdrawETH(uint256 amount) external;
}
```

```solidity
// IDEXAdapter.sol
interface IDEXAdapter {
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        bytes calldata extraData
    ) external returns (uint256 amountOut);

    function getAmountOut(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes calldata extraData
    ) external view returns (uint256 amountOut);
}
```

### Adapter Registration

DEX adapters are registered by the owner and referenced by address in swap steps:

```solidity
mapping(address => bool) public approvedAdapters;

function registerAdapter(address adapter) external onlyOwner {
    approvedAdapters[adapter] = true;
}

function removeAdapter(address adapter) external onlyOwner {
    approvedAdapters[adapter] = false;
}
```

## Proxy Pattern Considerations

### Recommendation: Immutable Contracts

For this project, **immutable (non-upgradeable) contracts** are preferred:

| Factor | Immutable | Upgradeable (Proxy) |
|--------|-----------|---------------------|
| **Security** | No upgrade risk, no storage collision | Admin key risk, storage layout bugs |
| **Trust** | Users can verify exact bytecode | Must trust admin won't rug |
| **Complexity** | Simple deployment | Proxy + implementation + storage gaps |
| **Gas** | No delegatecall overhead | Extra gas per call (~2600 gas) |
| **Flexibility** | Redeploy for changes | Upgrade in place |

**Why immutable for flashloans**: Flash loan bots are operator-controlled (not user-facing protocols). If a contract needs changes, deploy a new version and update the bot config. The off-chain bot already handles routing, so swapping contract addresses is trivial.

### When to Consider Proxy

Only if:
- Deploying on expensive L1 where redeployment gas is prohibitive
- Contract stores significant state that must persist across upgrades
- Multiple external contracts reference the executor address

If using proxy, follow OpenZeppelin's TransparentUpgradeableProxy or UUPS pattern.

## Storage Layout Best Practices

Even with immutable contracts, follow these patterns for clean architecture:

### Pack Storage Variables

```solidity
// BAD: 3 storage slots
address public owner;        // slot 0 (20 bytes, 12 wasted)
bool public paused;          // slot 1 (1 byte, 31 wasted)
uint256 public minProfit;    // slot 2

// GOOD: 2 storage slots
address public owner;        // slot 0, bytes 0-19
bool public paused;          // slot 0, bytes 20 (packed with owner)
uint256 public minProfit;    // slot 1
```

### Use Constants and Immutables

```solidity
// Constants: stored in bytecode, zero storage cost
uint256 public constant MAX_SLIPPAGE_BPS = 500; // 5%

// Immutables: set in constructor, stored in bytecode
address public immutable WETH;
address public immutable AAVE_POOL;

constructor(address _weth, address _aavePool) {
    WETH = _weth;
    AAVE_POOL = _aavePool;
}
```

### Minimize Storage Writes

```solidity
// BAD: writes to storage every swap
uint256 public totalSwaps;
function swap(...) external {
    totalSwaps++; // 20,000 gas (SSTORE)
}

// GOOD: emit event instead (375 gas for LOG0)
event SwapExecuted(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
function swap(...) external {
    emit SwapExecuted(tokenIn, tokenOut, amountIn, amountOut);
}
```

## Access Control

### Two-Tier Model

```solidity
address public owner;        // Can change config, withdraw funds, register adapters
address public botWallet;    // Can execute arbitrage, nothing else

modifier onlyOwner() {
    require(msg.sender == owner, "Not owner");
    _;
}

modifier onlyBot() {
    require(msg.sender == botWallet || msg.sender == owner, "Not authorized");
    _;
}

function executeArbitrage(...) external onlyBot nonReentrant { ... }
function withdrawToken(...) external onlyOwner { ... }
function setBotWallet(address _bot) external onlyOwner { ... }
function setMinProfit(uint256 _minProfit) external onlyOwner { ... }
```

### Role-Based (For Larger Systems)

If scaling to multiple bots or operators, use OpenZeppelin's `AccessControl`:

```solidity
bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
```

## Emergency Patterns

### Pause Mechanism

```solidity
bool public paused;

modifier whenNotPaused() {
    require(!paused, "Paused");
    _;
}

function pause() external onlyOwner {
    paused = true;
    emit Paused(msg.sender);
}

function unpause() external onlyOwner {
    paused = false;
    emit Unpaused(msg.sender);
}

function executeArbitrage(...) external onlyBot whenNotPaused nonReentrant { ... }
```

### Circuit Breaker

```solidity
uint256 public maxGasPrice;
uint256 public maxTradeSize;
uint256 public maxSlippageBps;

modifier withinLimits(uint256 tradeSize) {
    require(tx.gasprice <= maxGasPrice, "Gas too high");
    require(tradeSize <= maxTradeSize, "Trade too large");
    _;
}
```

### Emergency Withdrawal

```solidity
// Sweep any token stuck in the contract
function emergencyWithdraw(address token) external onlyOwner {
    uint256 balance = IERC20(token).balanceOf(address(this));
    require(balance > 0, "No balance");
    IERC20(token).safeTransfer(owner, balance);
    emit EmergencyWithdraw(token, balance);
}

// Sweep ETH
function emergencyWithdrawETH() external onlyOwner {
    uint256 balance = address(this).balance;
    require(balance > 0, "No balance");
    (bool success, ) = owner.call{value: balance}("");
    require(success, "ETH transfer failed");
    emit EmergencyWithdraw(address(0), balance);
}
```

## Gas Optimization Patterns

### Use `calldata` Instead of `memory` for Read-Only Parameters

```solidity
// BAD: copies array to memory (expensive)
function execute(SwapStep[] memory steps) external { ... }

// GOOD: reads directly from calldata (cheap)
function execute(SwapStep[] calldata steps) external { ... }
```

### Unchecked Math Where Safe

```solidity
// Safe when overflow is logically impossible
function calculateProfit(uint256 received, uint256 repayAmount) internal pure returns (uint256) {
    // We already checked received > repayAmount
    unchecked {
        return received - repayAmount;
    }
}

// Safe for loop counters
for (uint256 i = 0; i < steps.length;) {
    // ... process step ...
    unchecked { ++i; }
}
```

### Use Custom Errors (Not Strings)

```solidity
// BAD: stores string in bytecode, costs more gas
require(msg.sender == owner, "Only the contract owner can call this function");

// GOOD: custom errors are cheaper to deploy and revert
error NotOwner();
error InsufficientProfit(uint256 received, uint256 required);
error AdapterNotApproved(address adapter);

if (msg.sender != owner) revert NotOwner();
if (profit < minProfit) revert InsufficientProfit(profit, minProfit);
```

### Batch Token Approvals

```solidity
// Set max approval once during setup, not per-trade
function approveToken(address token, address spender) external onlyOwner {
    IERC20(token).safeApprove(spender, type(uint256).max);
}
```

## Testing Patterns

### Unit Tests (Isolated)

Test individual contract logic with mock dependencies:

```solidity
// test/unit/FlashloanExecutor.t.sol
contract FlashloanExecutorTest is Test {
    FlashloanExecutor executor;
    MockDEXAdapter mockAdapter;
    MockFlashLoanProvider mockProvider;

    function setUp() public {
        mockAdapter = new MockDEXAdapter();
        mockProvider = new MockFlashLoanProvider();
        executor = new FlashloanExecutor(address(mockProvider), WETH);
        executor.registerAdapter(address(mockAdapter));
    }

    function test_revertIfNotBot() public {
        vm.prank(address(0xdead));
        vm.expectRevert(NotOwner.selector);
        executor.executeArbitrage(...);
    }
}
```

### Fork Tests (Integration)

Test against real mainnet state:

```solidity
// test/fork/FlashloanExecutor.fork.t.sol
contract FlashloanExecutorForkTest is Test {
    function setUp() public {
        // Fork mainnet at specific block
        vm.createSelectFork(vm.envString("ETH_RPC_URL"), 19_000_000);
        // Deploy contracts against forked state
        executor = new FlashloanExecutor(AAVE_POOL, WETH);
    }

    function test_executeRealArbitrage() public {
        // Test against real Uniswap/Sushi pools
    }
}
```

### Fuzz Tests

Let Foundry discover edge cases:

```solidity
function testFuzz_profitValidation(uint256 received, uint256 repayAmount) public {
    vm.assume(received > 0);
    vm.assume(repayAmount > 0);

    if (received <= repayAmount) {
        vm.expectRevert();
    }
    executor.validateProfit(received, repayAmount);
}
```

### Invariant Tests

Ensure critical properties always hold:

```solidity
// invariant: contract should never hold tokens after execution
function invariant_noResidualBalance() public {
    assertEq(IERC20(WETH).balanceOf(address(executor)), 0);
    assertEq(IERC20(USDC).balanceOf(address(executor)), 0);
}

// invariant: paused contract should never execute
function invariant_pausedNoExecution() public {
    if (executor.paused()) {
        // Verify no swaps occurred this call
    }
}
```

## Deployment Checklist

Before deploying a contract:

1. All unit tests pass (`forge test`)
2. All fork tests pass (`forge test --fork-url $RPC`)
3. Fuzz tests run with sufficient iterations (`forge test --fuzz-runs 10000`)
4. Gas report reviewed (`forge test --gas-report`)
5. Contract size under 24KB limit (`forge build --sizes`)
6. No compiler warnings
7. Custom errors used (not string reverts)
8. All external calls use `safeTransfer` / `safeApprove`
9. Reentrancy guards on all state-changing external functions
10. Access control on all admin functions
11. Emergency withdraw functions present
12. Events emitted for all state changes

## Related Documentation

- [System Overview](.rules/architecture/system-overview.md)
- [DeFi Security Patterns](.rules/patterns/defi-security.md)
- [Deployment Patterns](.rules/patterns/deployment.md)
