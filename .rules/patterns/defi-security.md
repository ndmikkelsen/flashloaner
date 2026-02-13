---
description: DeFi-specific security patterns, attack vectors, and prevention strategies
tags: [security, defi, solidity, mev, reentrancy, oracle, flashloan]
last_updated: 2026-02-13
---

# DeFi Security Patterns

## Overview

This document covers security patterns specific to DeFi and flash loan arbitrage. Every vulnerability listed here has caused real fund losses in production. Treat this as a mandatory security checklist.

## Reentrancy

### Classic Reentrancy

An external call re-enters the contract before state is updated.

**Pattern: Checks-Effects-Interactions (CEI)**

```solidity
// BAD: state updated after external call
function withdraw(uint256 amount) external {
    require(balances[msg.sender] >= amount);     // Check
    (bool success, ) = msg.sender.call{value: amount}(""); // Interaction
    balances[msg.sender] -= amount;              // Effect (TOO LATE)
}

// GOOD: state updated before external call
function withdraw(uint256 amount) external {
    require(balances[msg.sender] >= amount);     // Check
    balances[msg.sender] -= amount;              // Effect
    (bool success, ) = msg.sender.call{value: amount}(""); // Interaction
    require(success, "Transfer failed");
}
```

**Pattern: Reentrancy Guard**

```solidity
// Always use OpenZeppelin's ReentrancyGuard on state-changing external functions
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract FlashloanExecutor is ReentrancyGuard {
    function executeArbitrage(...) external nonReentrant {
        // Safe from reentrancy
    }
}
```

### Read-Only Reentrancy

A contract reads stale state from another contract that is mid-execution. Common with Curve, Balancer, and other DeFi protocols.

```
Attacker -> Pool.remove_liquidity() -> Callback to attacker
    |                                      |
    |   Pool's internal state is inconsistent here
    |                                      |
    |                               Attacker calls
    |                               YourContract.getPrice()
    |                                      |
    |                               YourContract reads
    |                               Pool.get_virtual_price()
    |                               (returns STALE value)
```

**Prevention:**

```solidity
// Use Curve's reentrancy lock check
// Curve pools have a reentrancy lock that can be checked
function _checkCurveReentrancy(address pool) internal view {
    // This will revert if the pool is in a reentrrant state
    ICurvePool(pool).claim_admin_fees();
}

// Or: avoid reading pool state in callbacks
// Or: use TWAP instead of spot price
```

### Where Reentrancy Guards Are Required

| Function | Needs Guard | Reason |
|----------|-------------|--------|
| `executeArbitrage()` | Yes | Calls external contracts (DEXes, flash loan providers) |
| `emergencyWithdraw()` | Yes | Transfers tokens/ETH |
| `withdrawToken()` | Yes | Transfers tokens |
| `withdrawETH()` | Yes | Low-level ETH call |
| `registerAdapter()` | No | Only writes storage (owner-only) |
| `setMinProfit()` | No | Only writes storage (owner-only) |

## MEV Protection

### The MEV Problem

When a transaction sits in the public mempool, MEV bots can:

1. **Front-run**: Insert a transaction before yours
2. **Back-run**: Insert a transaction after yours
3. **Sandwich**: Both front-run and back-run your transaction

For a flash loan arbitrage bot, MEV attacks can:
- Steal your arbitrage opportunity (front-run)
- Sandwich your swaps for additional profit extraction
- Make your transaction revert by moving prices

### Protection Strategies

**Strategy 1: Private Transaction Submission (Flashbots)**

```typescript
// Submit via Flashbots relay (never enters public mempool)
import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";

const flashbotsProvider = await FlashbotsBundleProvider.create(
  provider,
  authSigner, // Separate from bot wallet
  "https://relay.flashbots.net"
);

const bundle = [
  {
    signer: botWallet,
    transaction: {
      to: executorAddress,
      data: calldata,
      chainId: 1,
      type: 2,
      maxFeePerGas: maxFee,
      maxPriorityFeePerGas: priorityFee,
    },
  },
];

const bundleResponse = await flashbotsProvider.sendBundle(bundle, targetBlock);
```

**Strategy 2: MEV Blocker / MEV Share**

```typescript
// Use MEV Blocker RPC (Flashbots)
const provider = new ethers.JsonRpcProvider("https://rpc.mevblocker.io");

// Or MEV Share for rebates on back-running
const provider = new ethers.JsonRpcProvider("https://relay.flashbots.net/mev-share");
```

**Strategy 3: Private Mempools (L2-specific)**

| Chain | Private Submission | Notes |
|-------|-------------------|-------|
| Arbitrum | Sequencer is single entity | Transactions not visible until sequenced |
| Base | Same as Arbitrum | Coinbase sequencer |
| Optimism | Same as Arbitrum | OP Labs sequencer |
| Ethereum | Flashbots/MEV Blocker required | Public mempool is adversarial |

## Oracle Manipulation

### Spot Price Manipulation

Attackers can manipulate spot prices within a single transaction using flash loans.

```
1. Attacker takes flash loan of Token A
2. Dumps Token A on DEX -> crashes spot price
3. Your contract reads spot price (manipulated!)
4. Your contract makes bad trade based on wrong price
5. Attacker profits, you lose
```

**Prevention: Never Use Spot Prices for Critical Decisions**

```solidity
// BAD: spot price is manipulable within a single block
function getPrice() external view returns (uint256) {
    (uint112 reserve0, uint112 reserve1, ) = IUniswapV2Pair(pair).getReserves();
    return (uint256(reserve1) * 1e18) / uint256(reserve0);
}

// BETTER: use TWAP (time-weighted average price)
function getTWAP(address pool, uint32 period) external view returns (uint256) {
    // Uniswap V3 TWAP
    (int24 arithmeticMeanTick, ) = OracleLibrary.consult(pool, period);
    return OracleLibrary.getQuoteAtTick(arithmeticMeanTick, 1e18, token0, token1);
}

// BEST: multi-source oracle with staleness check
function getPrice() external view returns (uint256) {
    uint256 chainlinkPrice = getChainlinkPrice();
    uint256 twapPrice = getTWAP(pool, 1800); // 30-minute TWAP

    // Prices should be within 2% of each other
    uint256 deviation = abs(chainlinkPrice - twapPrice) * 10000 / chainlinkPrice;
    require(deviation < 200, "Oracle deviation too high");

    return (chainlinkPrice + twapPrice) / 2;
}
```

### Staleness Checks

```solidity
function getChainlinkPrice(address feed) internal view returns (uint256) {
    (, int256 price, , uint256 updatedAt, ) = AggregatorV3Interface(feed).latestRoundData();
    require(price > 0, "Invalid price");
    require(block.timestamp - updatedAt < 3600, "Stale price feed"); // 1 hour max
    return uint256(price);
}
```

### For Flash Loan Arbitrage Specifically

Our bot uses on-chain pool reserves to calculate swap outputs. This is acceptable because:
- We are the ones executing the swap (not relying on prices for lending/borrowing decisions)
- Profit validation happens atomically (if price moved, tx reverts)
- The circuit breaker limits maximum trade size

**However**, the off-chain price monitor should use TWAP for opportunity detection to avoid false positives from manipulated prices.

## Sandwich Attacks

### Attack Mechanism

```
1. Bot detects your pending swap in mempool
2. Bot front-runs: buys token (pushes price up)
3. Your swap executes at worse price
4. Bot back-runs: sells token (profits from price difference)
```

### Prevention

**On-chain: Slippage Protection**

```solidity
function swap(
    address tokenIn,
    address tokenOut,
    uint256 amountIn,
    uint256 amountOutMin,  // Minimum acceptable output
    uint256 deadline        // Transaction deadline
) external {
    require(block.timestamp <= deadline, "Transaction expired");

    uint256 amountOut = _executeSwap(tokenIn, tokenOut, amountIn);
    require(amountOut >= amountOutMin, "Slippage exceeded");
}
```

**On-chain: Deadline Enforcement**

```solidity
modifier checkDeadline(uint256 deadline) {
    require(block.timestamp <= deadline, "Transaction expired");
    _;
}
```

**Off-chain: Private Transaction Submission**

See MEV Protection section above. Submitting via Flashbots prevents sandwich attacks entirely because the transaction never enters the public mempool.

## Flash Loan Attack Prevention

### Ensuring Profit Validation

The FlashloanExecutor must validate profit atomically:

```solidity
function executeArbitrage(
    address provider,
    address token,
    uint256 amount,
    SwapStep[] calldata steps
) external onlyBot nonReentrant whenNotPaused {
    uint256 balanceBefore = IERC20(token).balanceOf(address(this));

    // Take flash loan (triggers callback with swap execution)
    _initiateFlashLoan(provider, token, amount, abi.encode(steps));

    uint256 balanceAfter = IERC20(token).balanceOf(address(this));

    // CRITICAL: ensure we profited after repaying flash loan + fee
    require(balanceAfter > balanceBefore, "No profit");
    uint256 profit = balanceAfter - balanceBefore;
    require(profit >= minProfit, "Below minimum profit");

    emit ArbitrageExecuted(token, amount, profit);
}
```

### Atomic Execution Guarantees

Flash loans are inherently atomic -- if the loan is not repaid within the same transaction, the entire transaction reverts. This is our primary safety mechanism:

- If any swap fails -> revert (no partial execution)
- If profit is insufficient -> revert (no unprofitable trades)
- If gas is too high -> circuit breaker reverts (no gas griefing)

## Access Control

### Multi-Sig for Admin Functions

For production deployments, the owner should be a Gnosis Safe multi-sig:

```bash
# Deploy with EOA, then transfer ownership to multi-sig
cast send <EXECUTOR> "transferOwnership(address)" <GNOSIS_SAFE_ADDRESS> \
  --private-key $DEPLOYER_KEY --rpc-url $ETH_RPC_URL
```

### Timelock for Parameter Changes

For critical parameters that affect trading behavior, consider a timelock:

```solidity
uint256 public constant TIMELOCK_DELAY = 24 hours;

struct PendingChange {
    uint256 newValue;
    uint256 executeAfter;
}

mapping(bytes4 => PendingChange) public pendingChanges;

function proposeMaxTradeSize(uint256 newSize) external onlyOwner {
    pendingChanges[this.setMaxTradeSize.selector] = PendingChange({
        newValue: newSize,
        executeAfter: block.timestamp + TIMELOCK_DELAY
    });
    emit ChangeProposed("maxTradeSize", newSize, block.timestamp + TIMELOCK_DELAY);
}

function executeMaxTradeSize() external onlyOwner {
    PendingChange memory change = pendingChanges[this.setMaxTradeSize.selector];
    require(change.executeAfter != 0, "No pending change");
    require(block.timestamp >= change.executeAfter, "Timelock not expired");

    maxTradeSize = change.newValue;
    delete pendingChanges[this.setMaxTradeSize.selector];
    emit MaxTradeSizeUpdated(change.newValue);
}
```

## Upgrade Safety

Even though this project uses immutable contracts (see [Contract Architecture](../architecture/contract-architecture.md)), if proxy patterns are ever adopted:

### Storage Collision Prevention

```solidity
// Always use storage gaps in base contracts
abstract contract FlashloanReceiverV1 {
    address public owner;
    bool public paused;

    // Reserve 50 storage slots for future use
    uint256[50] private __gap;
}
```

### Initialization Protection

```solidity
// Prevent re-initialization attacks
bool private initialized;

function initialize(address _owner) external {
    require(!initialized, "Already initialized");
    initialized = true;
    owner = _owner;
}
```

## Gas Griefing

### Gas Limits on External Calls

```solidity
// BAD: unlimited gas forwarded to external call
(bool success, ) = target.call(data);

// GOOD: limit gas to prevent griefing
(bool success, ) = target.call{gas: 100_000}(data);

// For token transfers, use SafeERC20 (handles non-standard returns)
IERC20(token).safeTransfer(recipient, amount);
```

### Pull vs Push Patterns

```solidity
// BAD: push pattern (contract sends funds, can be griefed)
function distributeProfit() external {
    for (uint i = 0; i < recipients.length; i++) {
        payable(recipients[i]).transfer(amounts[i]); // Can fail, blocking others
    }
}

// GOOD: pull pattern (recipients claim their funds)
mapping(address => uint256) public pendingWithdrawals;

function withdraw() external nonReentrant {
    uint256 amount = pendingWithdrawals[msg.sender];
    require(amount > 0, "Nothing to withdraw");
    pendingWithdrawals[msg.sender] = 0;
    (bool success, ) = msg.sender.call{value: amount}("");
    require(success, "Transfer failed");
}
```

## Price Impact

### Maximum Trade Size Limits

```solidity
uint256 public maxTradeSize;

modifier checkTradeSize(uint256 amount) {
    require(amount <= maxTradeSize, "Trade too large");
    _;
}
```

### Liquidity Depth Checks (Off-Chain)

```typescript
// Check pool liquidity before submitting trade
function checkLiquidity(pool: string, tradeSize: bigint): boolean {
  const reserves = await getPoolReserves(pool);
  const priceImpact = calculatePriceImpact(reserves, tradeSize);

  // Reject if price impact exceeds threshold
  if (priceImpact > MAX_PRICE_IMPACT_BPS) {
    logger.warn(`Price impact ${priceImpact}bps exceeds limit on pool ${pool}`);
    return false;
  }
  return true;
}
```

## Testing Requirements

### Fuzz Testing

Every function that handles amounts, addresses, or user input must have fuzz tests:

```bash
# Run fuzz tests with high iteration count
forge test --fuzz-runs 10000
```

```solidity
function testFuzz_profitValidation(uint256 received, uint256 repayAmount) public {
    vm.assume(received > 0 && received < type(uint128).max);
    vm.assume(repayAmount > 0 && repayAmount < type(uint128).max);

    if (received <= repayAmount) {
        vm.expectRevert();
    }
    executor.validateProfit(received, repayAmount);
}
```

### Invariant Testing

Critical invariants that must always hold:

```solidity
// The contract should never hold tokens after a complete execution
function invariant_noResidualTokens() public {
    assertEq(IERC20(WETH).balanceOf(address(executor)), 0);
}

// Only the owner or bot can call executeArbitrage
function invariant_accessControl() public {
    // Verified through access control modifiers
}

// Paused contract never executes trades
function invariant_pauseHaltsExecution() public {
    if (executor.paused()) {
        // No ArbitrageExecuted events should be emittable
    }
}
```

### Fork Testing Against Mainnet State

```bash
# Test against current mainnet state
forge test --fork-url $ETH_RPC_URL -vvv

# Test against specific historical block
forge test --fork-url $ETH_RPC_URL --fork-block-number 19000000 -vvv

# Test against multiple chains
forge test --fork-url $ARBITRUM_RPC_URL -vvv
forge test --fork-url $BASE_RPC_URL -vvv
```

### Security Testing Checklist

- [ ] Fuzz tests for all functions handling amounts (10,000+ iterations)
- [ ] Invariant tests for critical properties
- [ ] Fork tests against mainnet for all DEX adapters
- [ ] Reentrancy test: attempt re-entry on all external functions
- [ ] Access control test: call all restricted functions from unauthorized address
- [ ] Overflow test: test with `type(uint256).max` values
- [ ] Zero-address test: pass `address(0)` to all address parameters
- [ ] Empty calldata test: call with empty swap steps array
- [ ] Gas limit test: verify circuit breaker activates at configured threshold
- [ ] Pause test: verify all operations halt when paused

## Related Documentation

- [Contract Architecture](../architecture/contract-architecture.md)
- [System Overview](../architecture/system-overview.md)
- [Environment Security](env-security.md)
- [Deployment Patterns](deployment.md)
