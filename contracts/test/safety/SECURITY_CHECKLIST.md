# Security Testing Checklist

Checklist for safety contract security verification. Each item must pass before mainnet deployment.

Reference: `.rules/patterns/defi-security.md`

## Pre-Implementation

- [x] Safety requirements documented (Task #4)
- [x] Test stubs created with descriptive names
- [x] Invariant test framework set up
- [x] Mock contracts ready (MockERC20, MockFlashLoanProvider, MockDEXAdapter)
- [ ] OpenZeppelin dependencies installed (Pausable, ReentrancyGuard, SafeERC20, Ownable)

## Circuit Breaker (`CircuitBreaker.sol`)

### Unit Tests
- [ ] Pause halts all execution (`test_revertWhen_pausedAndExecute`)
- [ ] Only owner can pause/unpause (`test_revertWhen_nonOwnerPauses`)
- [ ] Cannot double-pause or unpause when not paused
- [ ] Execution resumes after unpause (`test_executionResumesAfterUnpause`)
- [ ] Gas price > maxGasPrice reverts (`test_revertWhen_gasPriceExceedsMax`)
- [ ] Gas price == maxGasPrice succeeds (`test_succeedsAtExactMaxGasPrice`)
- [ ] Trade size > maxTradeSize reverts (`test_revertWhen_tradeSizeExceedsMax`)
- [ ] Trade size == maxTradeSize succeeds (`test_succeedsAtExactMaxTradeSize`)
- [ ] Owner can update parameters with events emitted
- [ ] Non-owner cannot update parameters (`test_revertWhen_nonOwnerSetsParams`)
- [ ] View functions return correct initial values

### Fuzz Tests (10,000+ iterations)
- [ ] `testFuzz_revertWhen_gasPriceAboveMax` - always reverts above threshold
- [ ] `testFuzz_allowsGasPriceBelowMax` - always succeeds below threshold
- [ ] `testFuzz_revertWhen_tradeSizeAboveMax` - always reverts above threshold
- [ ] `testFuzz_allowsTradeSizeBelowMax` - always succeeds below threshold
- [ ] `testFuzz_parameterUpdates` - updates always take effect

### Cumulative Loss Tracking
- [ ] Auto-halt after N consecutive losses (`test_autoHaltOnConsecutiveLosses`)
- [ ] Loss counter resets on success (`test_lossCounterResetsOnSuccess`)

## Profit Validator (`ProfitValidator.sol`)

### Unit Tests
- [ ] Zero profit reverts (`test_revertWhen_zeroProfitAfterExecution`)
- [ ] Profit < minProfit reverts (`test_revertWhen_profitBelowMinimum`)
- [ ] Profit == minProfit succeeds (`test_succeedsAtExactMinimumProfit`)
- [ ] Profit > minProfit succeeds (`test_succeedsAboveMinimumProfit`)
- [ ] Net loss reverts with `ExecutionLoss` error (`test_revertWhen_netLossAfterRepayment`)
- [ ] `ProfitValidated` event emitted on success
- [ ] `InsufficientProfit` event emitted before revert

### Fuzz Tests (10,000+ iterations)
- [ ] `testFuzz_revertWhen_noProfitMade` - always reverts when balanceAfter <= balanceBefore
- [ ] `testFuzz_succeedsWhen_profitExceedsMin` - always succeeds when profit >= minProfit
- [ ] `testFuzz_revertWhen_profitBelowMin` - always reverts when 0 < profit < minProfit
- [ ] `testFuzz_profitAtExactThreshold` - boundary precision test

### Edge Cases
- [ ] Large amounts near uint128 max (`test_largeAmountProfitValidation`)
- [ ] Smallest possible amounts — 1 wei (`test_smallAmountProfitValidation`)
- [ ] Zero balanceBefore (`test_profitValidationWithZeroBalanceBefore`)

## Integration Tests

### Combined Safety Flow
- [ ] Profitable arbitrage passes all checks (`test_fullFlow_profitableArbitrageSucceeds`)
- [ ] Unprofitable arbitrage reverts atomically (`test_fullFlow_unprofitableArbitrageReverts`)
- [ ] High gas blocks profitable trade (`test_circuitBreakerBlocksProfitableTrade`)
- [ ] Pause blocks before swap attempt (`test_pauseBlocksBeforeSwapAttempt`)
- [ ] Oversize trade blocks before flash loan (`test_oversizeTradeBlocksBeforeFlashLoan`)

### Reentrancy
- [ ] Reentrancy blocked on executeArbitrage (`test_revertWhen_reentrancyOnExecuteArbitrage`)
- [ ] Reentrancy blocked on withdrawETH (`test_revertWhen_reentrancyOnWithdraw`)
- [ ] Reentrancy blocked on emergencyWithdraw (`test_revertWhen_reentrancyOnEmergencyWithdraw`)

### Access Control
- [ ] Attacker cannot execute arbitrage — `NotAuthorized` error
- [ ] Bot cannot withdraw funds
- [ ] Bot cannot register adapters

### Emergency
- [ ] Owner can sweep stuck ERC20 tokens
- [ ] Owner can sweep stuck ETH

### Edge Inputs
- [ ] Zero address provider reverts — `ZeroAddress` error
- [ ] Empty swap steps reverts — `EmptySwapSteps` error
- [ ] Unapproved adapter reverts — `AdapterNotApproved` error
- [ ] Zero flash loan amount reverts — `ZeroAmount` error

## Invariant Tests

- [ ] No residual tokens after execution (`invariant_noResidualTokens`)
- [ ] Paused means no execution (`invariant_pausedMeansNoExecution`)
- [ ] Access control always holds (`invariant_accessControlHolds`)
- [ ] Bot balance non-decreasing (`invariant_botBalanceNonDecreasing`)
- [ ] maxGasPrice always > 0 (`invariant_maxGasPricePositive`)
- [ ] maxTradeSize always > 0 (`invariant_maxTradeSizePositive`)
- [ ] minProfit always > 0 (`invariant_minProfitPositive`)
- [ ] Only approved adapters used (`invariant_onlyApprovedAdaptersUsed`)

## Static Analysis

- [ ] Slither scan with zero high/medium findings (`flashloaner-8uc`)
- [ ] Forge coverage > 90% on safety contracts
- [ ] No compiler warnings

## Fork Tests

- [ ] Mainnet fork: Aave V3 flash loan integration
- [ ] Mainnet fork: Uniswap V2/V3 swap integration
- [ ] Mainnet fork: End-to-end arbitrage with real pool state
- [ ] Multi-chain: Arbitrum fork test
- [ ] Multi-chain: Base fork test

## Formal Verification (P2)

- [ ] Profit validation correctness (`flashloaner-46p`)
- [ ] Circuit breaker state machine
- [ ] Access control model

## Pre-Deployment Final Checks

- [ ] All unit tests pass (`forge test`)
- [ ] All fuzz tests pass with 10,000+ runs (`forge test --fuzz-runs 10000`)
- [ ] All invariant tests pass (`forge test --match-path contracts/test/invariants/`)
- [ ] All fork tests pass (`forge test --fork-url $MAINNET_RPC_URL`)
- [ ] Gas report reviewed (`forge test --gas-report`)
- [ ] Contract size < 24KB (`forge build --sizes`)
- [ ] No secret leaks (`gitleaks detect --source . --no-git`)
- [ ] Manual security review complete (`flashloaner-2j0`)
