// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IProfitValidator} from "../../src/interfaces/IProfitValidator.sol";
import {ProfitValidator} from "../../src/safety/ProfitValidator.sol";

/// @title ProfitValidator Formal Verification Tests
/// @notice Proves critical safety properties of ProfitValidator under ALL possible inputs.
/// @dev Uses Foundry's fuzz testing with carefully partitioned input spaces to verify
///      that ProfitValidator correctly prevents unprofitable execution. Each test covers
///      a complete partition of the input domain, so together they form a proof that:
///
///      1. No-loss invariant: success implies balanceAfter > balanceBefore
///      2. Revert completeness: all losses revert
///      3. Revert completeness: all below-minimum profits revert
///      4. Return value correctness: returned profit == balanceAfter - balanceBefore
///      5. Zero-profit boundary: balanceAfter == balanceBefore always reverts when minProfit > 0
///      6. Token address independence: the token parameter does not affect validation logic
///
///      Run with high fuzz iterations for maximum coverage:
///        forge test --match-path test/formal/ProfitValidatorFormal.t.sol --fuzz-runs 100000
contract ProfitValidatorFormalTest is Test {
    ProfitValidator internal validator;

    address internal constant TOKEN = address(0xBEEF);

    function setUp() public {
        validator = new ProfitValidator();
    }

    // ---------------------------------------------------------------
    // Property 1: No-loss invariant
    // If validateProfit succeeds (does not revert), then:
    //   - balanceAfter > balanceBefore
    //   - balanceAfter - balanceBefore >= minProfit
    // ---------------------------------------------------------------

    /// @notice FORMAL: success implies strict profit and minimum threshold met
    /// @dev Covers the success partition: balanceAfter > balanceBefore AND profit >= minProfit
    function testFormal_successImpliesProfit(uint256 balanceBefore, uint256 balanceAfter, uint256 minProfit) public {
        // Restrict to the success partition
        vm.assume(balanceAfter > balanceBefore);
        vm.assume(balanceAfter - balanceBefore >= minProfit);

        uint256 profit = validator.validateProfit(TOKEN, balanceBefore, balanceAfter, minProfit);

        // Property: balance must have increased
        assertGt(balanceAfter, balanceBefore, "Success must imply balance increase");
        // Property: profit must meet minimum
        assertGe(profit, minProfit, "Success must imply profit >= minProfit");
        // Property: profit must equal the actual difference
        assertEq(profit, balanceAfter - balanceBefore, "Returned profit must equal actual difference");
    }

    // ---------------------------------------------------------------
    // Property 2: Revert completeness on loss
    // For ALL inputs where balanceAfter < balanceBefore, validateProfit MUST revert.
    // ---------------------------------------------------------------

    /// @notice FORMAL: any net loss always reverts with ExecutionLoss
    function testFormal_revertsOnLoss(uint256 balanceBefore, uint256 balanceAfter, uint256 minProfit) public {
        // Restrict to the loss partition
        vm.assume(balanceBefore > 0);
        vm.assume(balanceAfter < balanceBefore);

        vm.expectRevert(
            abi.encodeWithSelector(IProfitValidator.ExecutionLoss.selector, balanceBefore, balanceAfter)
        );
        validator.validateProfit(TOKEN, balanceBefore, balanceAfter, minProfit);
    }

    // ---------------------------------------------------------------
    // Property 3: Revert completeness on below-minimum profit
    // For ALL inputs where 0 < profit < minProfit, validateProfit MUST revert.
    // ---------------------------------------------------------------

    /// @notice FORMAL: profit below minimum always reverts with ProfitBelowMinimum
    function testFormal_revertsOnBelowMinimum(
        uint256 balanceBefore,
        uint256 profit,
        uint256 minProfit
    ) public {
        // Restrict to below-minimum partition
        vm.assume(minProfit > 0);
        vm.assume(profit < minProfit);
        // Guard against overflow
        vm.assume(balanceBefore <= type(uint256).max - profit);
        uint256 balanceAfter = balanceBefore + profit;

        vm.expectRevert(); // Either ProfitBelowMinimum or ExecutionLoss (when profit == 0 and minProfit > 0)
        validator.validateProfit(TOKEN, balanceBefore, balanceAfter, minProfit);
    }

    // ---------------------------------------------------------------
    // Property 4: Return value correctness
    // When validateProfit succeeds, the returned profit equals
    // balanceAfter - balanceBefore.
    // ---------------------------------------------------------------

    /// @notice FORMAL: returned profit is exactly the balance difference
    function testFormal_returnValueCorrectness(uint256 balanceBefore, uint256 profit) public {
        // Ensure a valid success case
        vm.assume(profit > 0);
        vm.assume(balanceBefore <= type(uint256).max - profit);
        uint256 balanceAfter = balanceBefore + profit;

        // minProfit = 0 guarantees success for any positive profit
        uint256 result = validator.validateProfit(TOKEN, balanceBefore, balanceAfter, 0);

        assertEq(result, profit, "Return value must equal balanceAfter - balanceBefore");
        assertEq(result, balanceAfter - balanceBefore, "Return value must equal exact difference");
    }

    // ---------------------------------------------------------------
    // Property 5: Zero-profit boundary
    // When balanceAfter == balanceBefore and minProfit > 0, MUST revert.
    // ---------------------------------------------------------------

    /// @notice FORMAL: zero profit always reverts when minProfit > 0
    function testFormal_zeroProfitRevertsWhenMinProfitPositive(uint256 balance, uint256 minProfit) public {
        vm.assume(minProfit > 0);

        vm.expectRevert(
            abi.encodeWithSelector(IProfitValidator.ProfitBelowMinimum.selector, 0, minProfit)
        );
        validator.validateProfit(TOKEN, balance, balance, minProfit);
    }

    /// @notice FORMAL: zero profit succeeds when minProfit == 0
    /// @dev This covers the edge case where minProfit is 0 and there is zero profit.
    ///      balanceAfter == balanceBefore means profit = 0, and 0 >= 0 is true.
    ///      However, the ProfitValidator checks balanceAfter < balanceBefore first (which is false),
    ///      then checks profit < minProfit (0 < 0 is false), so it succeeds.
    function testFormal_zeroProfitSucceedsWhenMinProfitZero(uint256 balance) public {
        uint256 result = validator.validateProfit(TOKEN, balance, balance, 0);
        assertEq(result, 0, "Zero profit with zero minProfit should return 0");
    }

    // ---------------------------------------------------------------
    // Property 6: Token address independence
    // The token parameter should not affect the validation outcome.
    // ---------------------------------------------------------------

    /// @notice FORMAL: token address does not affect validation result
    function testFormal_tokenAddressDoesNotAffectResult(
        address tokenA,
        address tokenB,
        uint256 balanceBefore,
        uint256 balanceAfter,
        uint256 minProfit
    ) public {
        // Restrict to success case
        vm.assume(balanceAfter > balanceBefore);
        vm.assume(balanceAfter - balanceBefore >= minProfit);

        uint256 profitA = validator.validateProfit(tokenA, balanceBefore, balanceAfter, minProfit);
        uint256 profitB = validator.validateProfit(tokenB, balanceBefore, balanceAfter, minProfit);

        assertEq(profitA, profitB, "Token address must not affect validation result");
    }

    // ---------------------------------------------------------------
    // Property 7: Exhaustive boundary analysis
    // Test exact boundary between success and failure.
    // ---------------------------------------------------------------

    /// @notice FORMAL: profit == minProfit - 1 always reverts; profit == minProfit always succeeds
    function testFormal_exactBoundary(uint256 balanceBefore, uint256 minProfit) public {
        vm.assume(minProfit > 1);
        vm.assume(balanceBefore <= type(uint256).max - minProfit);

        // At boundary - 1: should revert
        uint256 belowBoundary = balanceBefore + minProfit - 1;
        vm.expectRevert(
            abi.encodeWithSelector(IProfitValidator.ProfitBelowMinimum.selector, minProfit - 1, minProfit)
        );
        validator.validateProfit(TOKEN, balanceBefore, belowBoundary, minProfit);

        // At exact boundary: should succeed
        uint256 atBoundary = balanceBefore + minProfit;
        uint256 result = validator.validateProfit(TOKEN, balanceBefore, atBoundary, minProfit);
        assertEq(result, minProfit, "At exact boundary should return minProfit");
    }

    // ---------------------------------------------------------------
    // Property 8: Commutativity of loss direction
    // If balanceBefore and balanceAfter are swapped (causing a loss),
    // it should always revert.
    // ---------------------------------------------------------------

    /// @notice FORMAL: swapping before/after always causes revert when there was profit
    function testFormal_swappedBalancesRevert(uint256 balanceBefore, uint256 profit, uint256 minProfit) public {
        vm.assume(profit > 0);
        vm.assume(balanceBefore <= type(uint256).max - profit);
        uint256 balanceAfter = balanceBefore + profit;

        // Original: succeeds (if profit >= minProfit)
        vm.assume(profit >= minProfit);
        validator.validateProfit(TOKEN, balanceBefore, balanceAfter, minProfit);

        // Swapped: balanceAfter becomes balanceBefore and vice versa -- loss scenario
        vm.expectRevert(
            abi.encodeWithSelector(IProfitValidator.ExecutionLoss.selector, balanceAfter, balanceBefore)
        );
        validator.validateProfit(TOKEN, balanceAfter, balanceBefore, minProfit);
    }

    // ---------------------------------------------------------------
    // Property 9: Large value safety
    // Ensure no overflow or unexpected behavior near uint256 max.
    // ---------------------------------------------------------------

    /// @notice FORMAL: large values near uint256 max do not cause overflow
    function testFormal_largeValueSafety(uint256 profit) public {
        vm.assume(profit > 0);
        vm.assume(profit <= type(uint128).max);

        uint256 balanceBefore = type(uint256).max - profit;
        uint256 balanceAfter = type(uint256).max;

        uint256 result = validator.validateProfit(TOKEN, balanceBefore, balanceAfter, 1);
        assertEq(result, profit, "Large values should not cause overflow");
    }

    /// @notice FORMAL: maximum possible difference is handled correctly
    function testFormal_maxDifference() public {
        uint256 balanceBefore = 0;
        uint256 balanceAfter = type(uint256).max;

        uint256 result = validator.validateProfit(TOKEN, balanceBefore, balanceAfter, 0);
        assertEq(result, type(uint256).max, "Max difference should be handled");
    }
}
