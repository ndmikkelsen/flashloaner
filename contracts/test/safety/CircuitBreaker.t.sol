// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ICircuitBreaker} from "../../src/interfaces/ICircuitBreaker.sol";
import {CircuitBreaker} from "../../src/safety/CircuitBreaker.sol";

/// @title CircuitBreaker Unit & Fuzz Tests
/// @notice Tests for CircuitBreaker contract safety mechanisms
///
/// Test Strategy:
///   - P0: Pause halts execution, gas limit enforcement, trade size limits
///   - P1: Parameter updates, cumulative loss tracking, emergency patterns
///   - Fuzz: Gas price boundaries, trade size boundaries, parameter updates
contract CircuitBreakerTest is Test {
    CircuitBreaker internal breaker;

    address internal owner = makeAddr("owner");
    address internal bot = makeAddr("bot");
    address internal attacker = makeAddr("attacker");

    uint256 internal constant DEFAULT_MAX_GAS_PRICE = 50 gwei;
    uint256 internal constant DEFAULT_MAX_TRADE_SIZE = 100 ether;
    uint256 internal constant DEFAULT_FAILURE_THRESHOLD = 5;

    function setUp() public {
        vm.prank(owner);
        breaker = new CircuitBreaker(
            DEFAULT_MAX_GAS_PRICE,
            DEFAULT_MAX_TRADE_SIZE,
            DEFAULT_FAILURE_THRESHOLD,
            owner
        );
    }

    // ---------------------------------------------------------------
    // Constructor Tests
    // ---------------------------------------------------------------

    function test_constructorSetsInitialValues() public view {
        assertEq(breaker.maxGasPrice(), DEFAULT_MAX_GAS_PRICE);
        assertEq(breaker.maxTradeSize(), DEFAULT_MAX_TRADE_SIZE);
        assertEq(breaker.consecutiveFailureThreshold(), DEFAULT_FAILURE_THRESHOLD);
        assertFalse(breaker.paused());
        assertEq(breaker.owner(), owner);
    }

    function test_revertWhen_constructorZeroGasPrice() public {
        vm.expectRevert(CircuitBreaker.ZeroValue.selector);
        new CircuitBreaker(0, DEFAULT_MAX_TRADE_SIZE, DEFAULT_FAILURE_THRESHOLD, owner);
    }

    function test_revertWhen_constructorZeroTradeSize() public {
        vm.expectRevert(CircuitBreaker.ZeroValue.selector);
        new CircuitBreaker(DEFAULT_MAX_GAS_PRICE, 0, DEFAULT_FAILURE_THRESHOLD, owner);
    }

    // ---------------------------------------------------------------
    // Pause Mechanism Tests (P0)
    // ---------------------------------------------------------------

    /// @notice Verify isWithinLimits returns false when paused
    function test_revertWhen_pausedAndCheckLimits() public {
        vm.prank(owner);
        breaker.pause();
        assertTrue(breaker.paused());
        assertFalse(breaker.isWithinLimits(1 gwei, 1 ether));
    }

    /// @notice Verify enforceLimits reverts when paused
    function test_revertWhen_pausedAndEnforceLimits() public {
        vm.prank(owner);
        breaker.pause();
        vm.expectRevert(ICircuitBreaker.ContractPaused.selector);
        breaker.enforceLimits(1 gwei, 1 ether);
    }

    /// @notice Verify only owner can pause
    function test_revertWhen_nonOwnerPauses() public {
        vm.prank(attacker);
        vm.expectRevert();
        breaker.pause();
    }

    /// @notice Verify only owner can unpause
    function test_revertWhen_nonOwnerUnpauses() public {
        vm.prank(owner);
        breaker.pause();
        vm.prank(attacker);
        vm.expectRevert();
        breaker.unpause();
    }

    /// @notice Verify execution resumes after unpause
    function test_executionResumesAfterUnpause() public {
        vm.startPrank(owner);
        breaker.pause();
        breaker.unpause();
        vm.stopPrank();
        assertFalse(breaker.paused());
        assertTrue(breaker.isWithinLimits(1 gwei, 1 ether));
    }

    /// @notice Verify Paused event is emitted
    function test_emitsPausedEvent() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, false);
        emit ICircuitBreaker.Paused(owner);
        breaker.pause();
    }

    /// @notice Verify Unpaused event is emitted
    function test_emitsUnpausedEvent() public {
        vm.prank(owner);
        breaker.pause();
        vm.expectEmit(true, false, false, false);
        emit ICircuitBreaker.Unpaused(owner);
        vm.prank(owner);
        breaker.unpause();
    }

    /// @notice Verify cannot pause when already paused
    function test_revertWhen_pauseWhileAlreadyPaused() public {
        vm.startPrank(owner);
        breaker.pause();
        vm.expectRevert(ICircuitBreaker.ContractPaused.selector);
        breaker.pause();
        vm.stopPrank();
    }

    /// @notice Verify cannot unpause when not paused
    function test_revertWhen_unpauseWhileNotPaused() public {
        vm.prank(owner);
        vm.expectRevert(ICircuitBreaker.ContractNotPaused.selector);
        breaker.unpause();
    }

    // ---------------------------------------------------------------
    // Gas Price Limit Tests (P0)
    // ---------------------------------------------------------------

    /// @notice Verify isWithinLimits returns false when gas price exceeds max
    function test_revertWhen_gasPriceExceedsMax() public view {
        assertFalse(breaker.isWithinLimits(DEFAULT_MAX_GAS_PRICE + 1, 1 ether));
    }

    /// @notice Verify enforceLimits reverts with GasPriceTooHigh
    function test_enforceLimitsRevertsOnHighGasPrice() public {
        uint256 highGas = DEFAULT_MAX_GAS_PRICE + 1;
        vm.expectRevert(
            abi.encodeWithSelector(ICircuitBreaker.GasPriceTooHigh.selector, highGas, DEFAULT_MAX_GAS_PRICE)
        );
        breaker.enforceLimits(highGas, 1 ether);
    }

    /// @notice Verify success at exactly maxGasPrice
    function test_succeedsAtExactMaxGasPrice() public view {
        assertTrue(breaker.isWithinLimits(DEFAULT_MAX_GAS_PRICE, 1 ether));
    }

    /// @notice Verify success below maxGasPrice
    function test_succeedsBelowMaxGasPrice() public view {
        assertTrue(breaker.isWithinLimits(DEFAULT_MAX_GAS_PRICE - 1, 1 ether));
    }

    // ---------------------------------------------------------------
    // Trade Size Limit Tests (P0)
    // ---------------------------------------------------------------

    /// @notice Verify isWithinLimits returns false when trade size exceeds max
    function test_revertWhen_tradeSizeExceedsMax() public view {
        assertFalse(breaker.isWithinLimits(1 gwei, DEFAULT_MAX_TRADE_SIZE + 1));
    }

    /// @notice Verify enforceLimits reverts with TradeSizeTooLarge
    function test_enforceLimitsRevertsOnLargeTradeSize() public {
        uint256 largeAmount = DEFAULT_MAX_TRADE_SIZE + 1;
        vm.expectRevert(
            abi.encodeWithSelector(ICircuitBreaker.TradeSizeTooLarge.selector, largeAmount, DEFAULT_MAX_TRADE_SIZE)
        );
        breaker.enforceLimits(1 gwei, largeAmount);
    }

    /// @notice Verify success at exactly maxTradeSize
    function test_succeedsAtExactMaxTradeSize() public view {
        assertTrue(breaker.isWithinLimits(1 gwei, DEFAULT_MAX_TRADE_SIZE));
    }

    // ---------------------------------------------------------------
    // View Function Tests (P0)
    // ---------------------------------------------------------------

    /// @notice Verify maxGasPrice returns initial value
    function test_maxGasPriceReturnsInitialValue() public view {
        assertEq(breaker.maxGasPrice(), DEFAULT_MAX_GAS_PRICE);
    }

    /// @notice Verify maxTradeSize returns initial value
    function test_maxTradeSizeReturnsInitialValue() public view {
        assertEq(breaker.maxTradeSize(), DEFAULT_MAX_TRADE_SIZE);
    }

    /// @notice Verify paused returns false initially
    function test_pausedReturnsFalseInitially() public view {
        assertFalse(breaker.paused());
    }

    // ---------------------------------------------------------------
    // Parameter Update Tests (P1)
    // ---------------------------------------------------------------

    /// @notice Verify owner can update maxGasPrice and event is emitted
    function test_ownerCanSetMaxGasPrice() public {
        vm.prank(owner);
        vm.expectEmit(false, false, false, true);
        emit ICircuitBreaker.MaxGasPriceUpdated(DEFAULT_MAX_GAS_PRICE, 100 gwei);
        breaker.setMaxGasPrice(100 gwei);
        assertEq(breaker.maxGasPrice(), 100 gwei);
    }

    /// @notice Verify owner can update maxTradeSize and event is emitted
    function test_ownerCanSetMaxTradeSize() public {
        vm.prank(owner);
        vm.expectEmit(false, false, false, true);
        emit ICircuitBreaker.MaxTradeSizeUpdated(DEFAULT_MAX_TRADE_SIZE, 200 ether);
        breaker.setMaxTradeSize(200 ether);
        assertEq(breaker.maxTradeSize(), 200 ether);
    }

    /// @notice Verify non-owner cannot update maxGasPrice
    function test_revertWhen_nonOwnerSetsMaxGasPrice() public {
        vm.prank(attacker);
        vm.expectRevert();
        breaker.setMaxGasPrice(100 gwei);
    }

    /// @notice Verify non-owner cannot update maxTradeSize
    function test_revertWhen_nonOwnerSetsMaxTradeSize() public {
        vm.prank(attacker);
        vm.expectRevert();
        breaker.setMaxTradeSize(200 ether);
    }

    /// @notice Verify setMaxGasPrice reverts on zero
    function test_revertWhen_setMaxGasPriceZero() public {
        vm.prank(owner);
        vm.expectRevert(CircuitBreaker.ZeroValue.selector);
        breaker.setMaxGasPrice(0);
    }

    /// @notice Verify setMaxTradeSize reverts on zero
    function test_revertWhen_setMaxTradeSizeZero() public {
        vm.prank(owner);
        vm.expectRevert(CircuitBreaker.ZeroValue.selector);
        breaker.setMaxTradeSize(0);
    }

    /// @notice Verify new limits take effect immediately
    function test_updatedLimitsEnforced() public {
        // Initially 50 gwei allowed
        assertTrue(breaker.isWithinLimits(50 gwei, 1 ether));

        // Lower to 30 gwei
        vm.prank(owner);
        breaker.setMaxGasPrice(30 gwei);

        // 50 gwei now rejected
        assertFalse(breaker.isWithinLimits(50 gwei, 1 ether));
        assertTrue(breaker.isWithinLimits(30 gwei, 1 ether));
    }

    // ---------------------------------------------------------------
    // Consecutive Failure Tracking Tests (P1)
    // ---------------------------------------------------------------

    /// @notice Verify auto-pause after consecutive failures exceed threshold
    function test_autoPauseOnConsecutiveFailures() public {
        vm.startPrank(owner);
        for (uint256 i = 0; i < DEFAULT_FAILURE_THRESHOLD; i++) {
            breaker.recordFailure();
        }
        vm.stopPrank();
        assertTrue(breaker.paused());
        assertEq(breaker.consecutiveFailures(), DEFAULT_FAILURE_THRESHOLD);
    }

    /// @notice Verify AutoPaused event is emitted
    function test_emitsAutoPausedEvent() public {
        vm.startPrank(owner);
        // Record failures up to threshold - 1
        for (uint256 i = 0; i < DEFAULT_FAILURE_THRESHOLD - 1; i++) {
            breaker.recordFailure();
        }
        assertFalse(breaker.paused());

        // The threshold-reaching failure triggers auto-pause
        vm.expectEmit(false, false, false, true);
        emit CircuitBreaker.AutoPaused(DEFAULT_FAILURE_THRESHOLD, DEFAULT_FAILURE_THRESHOLD);
        breaker.recordFailure();
        vm.stopPrank();
    }

    /// @notice Verify failure counter resets on successful trade
    function test_failureCounterResetsOnSuccess() public {
        vm.startPrank(owner);
        breaker.recordFailure();
        breaker.recordFailure();
        assertEq(breaker.consecutiveFailures(), 2);

        breaker.recordSuccess();
        assertEq(breaker.consecutiveFailures(), 0);
        vm.stopPrank();
    }

    /// @notice Verify unpause also resets failure counter
    function test_unpauseResetsFailureCounter() public {
        vm.startPrank(owner);
        // Auto-pause via failures
        for (uint256 i = 0; i < DEFAULT_FAILURE_THRESHOLD; i++) {
            breaker.recordFailure();
        }
        assertTrue(breaker.paused());
        assertEq(breaker.consecutiveFailures(), DEFAULT_FAILURE_THRESHOLD);

        // Unpause resets counter
        breaker.unpause();
        assertEq(breaker.consecutiveFailures(), 0);
        vm.stopPrank();
    }

    /// @notice Verify auto-pause disabled when threshold is 0
    function test_autoPauseDisabledWhenThresholdZero() public {
        vm.startPrank(owner);
        breaker.setConsecutiveFailureThreshold(0);

        // Record many failures - should not auto-pause
        for (uint256 i = 0; i < 100; i++) {
            breaker.recordFailure();
        }
        vm.stopPrank();
        assertFalse(breaker.paused());
        assertEq(breaker.consecutiveFailures(), 100);
    }

    /// @notice Verify owner can update failure threshold
    function test_ownerCanSetFailureThreshold() public {
        vm.prank(owner);
        breaker.setConsecutiveFailureThreshold(10);
        assertEq(breaker.consecutiveFailureThreshold(), 10);
    }

    // ---------------------------------------------------------------
    // Authorized Caller Access Control Tests (P1)
    // ---------------------------------------------------------------

    /// @notice Verify owner can set authorized callers
    function test_ownerCanSetAuthorizedCaller() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit CircuitBreaker.AuthorizedCallerUpdated(bot, true);
        breaker.setAuthorizedCaller(bot, true);
        assertTrue(breaker.authorizedCallers(bot));
    }

    /// @notice Verify owner can revoke authorized callers
    function test_ownerCanRevokeAuthorizedCaller() public {
        vm.startPrank(owner);
        breaker.setAuthorizedCaller(bot, true);
        breaker.setAuthorizedCaller(bot, false);
        vm.stopPrank();
        assertFalse(breaker.authorizedCallers(bot));
    }

    /// @notice Verify non-owner cannot set authorized callers
    function test_revertWhen_nonOwnerSetsAuthorizedCaller() public {
        vm.prank(attacker);
        vm.expectRevert();
        breaker.setAuthorizedCaller(bot, true);
    }

    /// @notice Verify authorized caller can call recordFailure
    function test_authorizedCallerCanRecordFailure() public {
        vm.prank(owner);
        breaker.setAuthorizedCaller(bot, true);

        vm.prank(bot);
        breaker.recordFailure();
        assertEq(breaker.consecutiveFailures(), 1);
    }

    /// @notice Verify authorized caller can call recordSuccess
    function test_authorizedCallerCanRecordSuccess() public {
        vm.prank(owner);
        breaker.setAuthorizedCaller(bot, true);

        vm.startPrank(bot);
        breaker.recordFailure();
        breaker.recordSuccess();
        vm.stopPrank();
        assertEq(breaker.consecutiveFailures(), 0);
    }

    /// @notice Verify unauthorized caller cannot call recordFailure
    function test_revertWhen_unauthorizedCallerRecordsFailure() public {
        vm.prank(attacker);
        vm.expectRevert(CircuitBreaker.NotAuthorizedCaller.selector);
        breaker.recordFailure();
    }

    /// @notice Verify unauthorized caller cannot call recordSuccess
    function test_revertWhen_unauthorizedCallerRecordsSuccess() public {
        vm.prank(attacker);
        vm.expectRevert(CircuitBreaker.NotAuthorizedCaller.selector);
        breaker.recordSuccess();
    }

    /// @notice Verify revoked caller can no longer call recordFailure
    function test_revertWhen_revokedCallerRecordsFailure() public {
        vm.startPrank(owner);
        breaker.setAuthorizedCaller(bot, true);
        breaker.setAuthorizedCaller(bot, false);
        vm.stopPrank();

        vm.prank(bot);
        vm.expectRevert(CircuitBreaker.NotAuthorizedCaller.selector);
        breaker.recordFailure();
    }

    // ---------------------------------------------------------------
    // Fuzz Tests
    // ---------------------------------------------------------------

    /// @notice Fuzz: isWithinLimits returns false when gas price > max
    function testFuzz_revertWhen_gasPriceAboveMax(uint256 gasPrice) public view {
        gasPrice = bound(gasPrice, DEFAULT_MAX_GAS_PRICE + 1, type(uint256).max);
        assertFalse(breaker.isWithinLimits(gasPrice, 1 ether));
    }

    /// @notice Fuzz: isWithinLimits returns true when gas price <= max
    function testFuzz_allowsGasPriceBelowMax(uint256 gasPrice) public view {
        gasPrice = bound(gasPrice, 1, DEFAULT_MAX_GAS_PRICE);
        assertTrue(breaker.isWithinLimits(gasPrice, 1 ether));
    }

    /// @notice Fuzz: isWithinLimits returns false when trade size > max
    function testFuzz_revertWhen_tradeSizeAboveMax(uint256 amount) public view {
        amount = bound(amount, DEFAULT_MAX_TRADE_SIZE + 1, type(uint256).max);
        assertFalse(breaker.isWithinLimits(1 gwei, amount));
    }

    /// @notice Fuzz: isWithinLimits returns true when trade size <= max
    function testFuzz_allowsTradeSizeBelowMax(uint256 amount) public view {
        amount = bound(amount, 1, DEFAULT_MAX_TRADE_SIZE);
        assertTrue(breaker.isWithinLimits(1 gwei, amount));
    }

    /// @notice Fuzz: parameter updates always take effect
    function testFuzz_parameterUpdates(uint256 newGasPrice, uint256 newTradeSize) public {
        newGasPrice = bound(newGasPrice, 1, type(uint128).max);
        newTradeSize = bound(newTradeSize, 1, type(uint128).max);

        vm.startPrank(owner);
        breaker.setMaxGasPrice(newGasPrice);
        breaker.setMaxTradeSize(newTradeSize);
        vm.stopPrank();

        assertEq(breaker.maxGasPrice(), newGasPrice);
        assertEq(breaker.maxTradeSize(), newTradeSize);
    }

    /// @notice Fuzz: enforceLimits reverts correctly for any gas price above max
    function testFuzz_enforceLimitsRevertsOnHighGas(uint256 gasPrice) public {
        gasPrice = bound(gasPrice, DEFAULT_MAX_GAS_PRICE + 1, type(uint256).max);
        vm.expectRevert(
            abi.encodeWithSelector(ICircuitBreaker.GasPriceTooHigh.selector, gasPrice, DEFAULT_MAX_GAS_PRICE)
        );
        breaker.enforceLimits(gasPrice, 1 ether);
    }

    /// @notice Fuzz: enforceLimits reverts correctly for any trade size above max
    function testFuzz_enforceLimitsRevertsOnLargeAmount(uint256 amount) public {
        amount = bound(amount, DEFAULT_MAX_TRADE_SIZE + 1, type(uint256).max);
        vm.expectRevert(
            abi.encodeWithSelector(ICircuitBreaker.TradeSizeTooLarge.selector, amount, DEFAULT_MAX_TRADE_SIZE)
        );
        breaker.enforceLimits(1 gwei, amount);
    }
}
