// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IProfitValidator} from "../../src/interfaces/IProfitValidator.sol";
import {ProfitValidator} from "../../src/safety/ProfitValidator.sol";

/// @title ProfitValidator Unit & Fuzz Tests
/// @notice Tests for ProfitValidator contract profit enforcement
///
/// Test Strategy:
///   - P0: Minimum profit enforcement, zero-profit revert, balance comparison
///   - P1: Edge cases with large/small amounts, zero balanceBefore
///   - Fuzz: Profit boundaries with random balanceBefore/balanceAfter values
contract ProfitValidatorTest is Test {
    ProfitValidator internal validator;

    address internal token = makeAddr("token");

    uint256 internal constant DEFAULT_MIN_PROFIT = 0.001 ether;

    function setUp() public {
        validator = new ProfitValidator();
    }

    // ---------------------------------------------------------------
    // Profit Enforcement Tests (P0)
    // ---------------------------------------------------------------

    /// @notice Verify revert when balance did not increase (zero profit)
    function test_revertWhen_zeroProfitAfterExecution() public {
        uint256 balance = 10 ether;
        vm.expectRevert(
            abi.encodeWithSelector(IProfitValidator.ProfitBelowMinimum.selector, 0, DEFAULT_MIN_PROFIT)
        );
        validator.validateProfit(token, balance, balance, DEFAULT_MIN_PROFIT);
    }

    /// @notice Verify revert when profit is below minimum threshold
    function test_revertWhen_profitBelowMinimum() public {
        uint256 balanceBefore = 10 ether;
        uint256 balanceAfter = balanceBefore + DEFAULT_MIN_PROFIT - 1;
        vm.expectRevert(
            abi.encodeWithSelector(
                IProfitValidator.ProfitBelowMinimum.selector, DEFAULT_MIN_PROFIT - 1, DEFAULT_MIN_PROFIT
            )
        );
        validator.validateProfit(token, balanceBefore, balanceAfter, DEFAULT_MIN_PROFIT);
    }

    /// @notice Verify success when profit equals minimum threshold exactly
    function test_succeedsAtExactMinimumProfit() public {
        uint256 balanceBefore = 10 ether;
        uint256 balanceAfter = balanceBefore + DEFAULT_MIN_PROFIT;
        uint256 profit = validator.validateProfit(token, balanceBefore, balanceAfter, DEFAULT_MIN_PROFIT);
        assertEq(profit, DEFAULT_MIN_PROFIT);
    }

    /// @notice Verify success when profit exceeds minimum threshold
    function test_succeedsAboveMinimumProfit() public {
        uint256 balanceBefore = 10 ether;
        uint256 balanceAfter = balanceBefore + 1 ether;
        uint256 profit = validator.validateProfit(token, balanceBefore, balanceAfter, DEFAULT_MIN_PROFIT);
        assertEq(profit, 1 ether);
    }

    /// @notice Verify revert when balance decreased (net loss)
    function test_revertWhen_netLossAfterRepayment() public {
        uint256 balanceBefore = 10 ether;
        uint256 balanceAfter = 9 ether;
        vm.expectRevert(
            abi.encodeWithSelector(IProfitValidator.ExecutionLoss.selector, balanceBefore, balanceAfter)
        );
        validator.validateProfit(token, balanceBefore, balanceAfter, DEFAULT_MIN_PROFIT);
    }

    // ---------------------------------------------------------------
    // Event Tests (P0)
    // ---------------------------------------------------------------

    /// @notice Verify ProfitValidated event emitted on success
    function test_emitsProfitValidatedEvent() public {
        uint256 balanceBefore = 10 ether;
        uint256 balanceAfter = balanceBefore + 1 ether;
        vm.expectEmit(true, false, false, true);
        emit IProfitValidator.ProfitValidated(token, 1 ether);
        validator.validateProfit(token, balanceBefore, balanceAfter, DEFAULT_MIN_PROFIT);
    }

    /// @notice Verify InsufficientProfit event emitted before revert on zero profit
    function test_emitsInsufficientProfitEvent() public {
        uint256 balanceBefore = 10 ether;
        uint256 balanceAfter = balanceBefore; // zero profit
        // Event is emitted before the revert
        vm.expectEmit(true, false, false, true);
        emit IProfitValidator.InsufficientProfit(token, balanceBefore, balanceAfter, DEFAULT_MIN_PROFIT);
        vm.expectRevert();
        validator.validateProfit(token, balanceBefore, balanceAfter, DEFAULT_MIN_PROFIT);
    }

    /// @notice Verify InsufficientProfit event emitted before revert on net loss
    function test_emitsInsufficientProfitEventOnLoss() public {
        uint256 balanceBefore = 10 ether;
        uint256 balanceAfter = 9 ether;
        vm.expectEmit(true, false, false, true);
        emit IProfitValidator.InsufficientProfit(token, balanceBefore, balanceAfter, DEFAULT_MIN_PROFIT);
        vm.expectRevert();
        validator.validateProfit(token, balanceBefore, balanceAfter, DEFAULT_MIN_PROFIT);
    }

    // ---------------------------------------------------------------
    // Edge Cases (P1)
    // ---------------------------------------------------------------

    /// @notice Verify profit validation with very large amounts (near uint128 max)
    function test_largeAmountProfitValidation() public {
        uint256 balanceBefore = type(uint128).max - 1 ether;
        uint256 balanceAfter = type(uint128).max;
        uint256 profit = validator.validateProfit(token, balanceBefore, balanceAfter, DEFAULT_MIN_PROFIT);
        assertEq(profit, 1 ether);
    }

    /// @notice Verify profit validation with very small amounts (1 wei profit)
    function test_smallAmountProfitValidation() public {
        uint256 balanceBefore = 1 ether;
        uint256 balanceAfter = balanceBefore + 1;
        // With minProfit = 1 wei, this should succeed
        uint256 profit = validator.validateProfit(token, balanceBefore, balanceAfter, 1);
        assertEq(profit, 1);
    }

    /// @notice Verify profit validation when balanceBefore is 0
    function test_profitValidationWithZeroBalanceBefore() public {
        uint256 profit = validator.validateProfit(token, 0, 1 ether, DEFAULT_MIN_PROFIT);
        assertEq(profit, 1 ether);
    }

    /// @notice Verify revert when both balances are 0 (zero profit)
    function test_revertWhen_bothBalancesZero() public {
        vm.expectRevert(
            abi.encodeWithSelector(IProfitValidator.ProfitBelowMinimum.selector, 0, DEFAULT_MIN_PROFIT)
        );
        validator.validateProfit(token, 0, 0, DEFAULT_MIN_PROFIT);
    }

    /// @notice Verify success with minProfit of 0 and any positive profit
    function test_succeedsWithZeroMinProfit() public {
        uint256 profit = validator.validateProfit(token, 10 ether, 10 ether + 1, 0);
        assertEq(profit, 1);
    }

    /// @notice Verify revert when minProfit is 0 but there's a net loss
    function test_revertWhen_zeroMinProfitButNetLoss() public {
        vm.expectRevert(
            abi.encodeWithSelector(IProfitValidator.ExecutionLoss.selector, 10 ether, 9 ether)
        );
        validator.validateProfit(token, 10 ether, 9 ether, 0);
    }

    // ---------------------------------------------------------------
    // Fuzz Tests
    // ---------------------------------------------------------------

    /// @notice Fuzz: always reverts when balanceAfter < balanceBefore (net loss)
    function testFuzz_revertWhen_netLoss(uint256 balanceBefore, uint256 balanceAfter) public {
        balanceBefore = bound(balanceBefore, 1, type(uint128).max);
        balanceAfter = bound(balanceAfter, 0, balanceBefore - 1);
        vm.expectRevert(
            abi.encodeWithSelector(IProfitValidator.ExecutionLoss.selector, balanceBefore, balanceAfter)
        );
        validator.validateProfit(token, balanceBefore, balanceAfter, DEFAULT_MIN_PROFIT);
    }

    /// @notice Fuzz: always reverts when 0 < profit < minProfit
    function testFuzz_revertWhen_profitBelowMin(uint256 profit) public {
        profit = bound(profit, 1, DEFAULT_MIN_PROFIT - 1);
        uint256 balanceBefore = 1 ether;
        uint256 balanceAfter = balanceBefore + profit;
        vm.expectRevert(
            abi.encodeWithSelector(IProfitValidator.ProfitBelowMinimum.selector, profit, DEFAULT_MIN_PROFIT)
        );
        validator.validateProfit(token, balanceBefore, balanceAfter, DEFAULT_MIN_PROFIT);
    }

    /// @notice Fuzz: always succeeds when profit >= minProfit
    function testFuzz_succeedsWhen_profitExceedsMin(uint256 balanceBefore, uint256 profit) public {
        balanceBefore = bound(balanceBefore, 0, type(uint128).max);
        profit = bound(profit, DEFAULT_MIN_PROFIT, type(uint128).max);
        uint256 balanceAfter = balanceBefore + profit;

        uint256 result = validator.validateProfit(token, balanceBefore, balanceAfter, DEFAULT_MIN_PROFIT);
        assertEq(result, profit);
    }

    /// @notice Fuzz: profit at exact threshold always succeeds
    function testFuzz_profitAtExactThreshold(uint256 minProfit) public {
        minProfit = bound(minProfit, 1, type(uint128).max);
        uint256 balanceBefore = 1 ether;
        uint256 balanceAfter = balanceBefore + minProfit;

        uint256 result = validator.validateProfit(token, balanceBefore, balanceAfter, minProfit);
        assertEq(result, minProfit);
    }

    /// @notice Fuzz: zero profit always reverts when minProfit > 0
    function testFuzz_revertWhen_noProfitMade(uint256 balanceBefore, uint256 minProfit) public {
        balanceBefore = bound(balanceBefore, 0, type(uint128).max);
        minProfit = bound(minProfit, 1, type(uint128).max);
        vm.expectRevert(
            abi.encodeWithSelector(IProfitValidator.ProfitBelowMinimum.selector, 0, minProfit)
        );
        validator.validateProfit(token, balanceBefore, balanceBefore, minProfit);
    }
}
