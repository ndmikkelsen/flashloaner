// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IProfitValidator
/// @notice Interface for validating arbitrage profit after flash loan repayment.
/// @dev Ensures that the contract has strictly profited from an arbitrage execution
/// before completing the transaction. This is the final safety check in the
/// atomic execution flow.
interface IProfitValidator {
    // ──────────────────────────────────────────────
    // Errors
    // ──────────────────────────────────────────────

    /// @notice The arbitrage did not produce enough profit.
    /// @param profit The actual profit (or 0 if a loss occurred)
    /// @param minProfit The minimum required profit
    error ProfitBelowMinimum(uint256 profit, uint256 minProfit);

    /// @notice The balance after execution is less than before (a loss occurred).
    /// @param balanceBefore The balance before execution
    /// @param balanceAfter The balance after execution
    error ExecutionLoss(uint256 balanceBefore, uint256 balanceAfter);

    // ──────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when profit validation succeeds.
    /// @param token The token that was validated
    /// @param profit The net profit amount
    event ProfitValidated(address indexed token, uint256 profit);

    /// @notice Emitted when profit validation fails (before revert).
    /// @param token The token that failed validation
    /// @param balanceBefore The balance before execution
    /// @param balanceAfter The balance after execution
    /// @param minProfit The minimum required profit
    event InsufficientProfit(
        address indexed token, uint256 balanceBefore, uint256 balanceAfter, uint256 minProfit
    );

    // ──────────────────────────────────────────────
    // Core Functions
    // ──────────────────────────────────────────────

    /// @notice Validate that an arbitrage produced sufficient profit.
    /// @dev Compares token balance before and after execution against the minimum
    /// profit threshold. Reverts if profit is insufficient.
    /// @param token The token to validate profit for
    /// @param balanceBefore The token balance before the arbitrage
    /// @param balanceAfter The token balance after the arbitrage
    /// @param minProfit The minimum acceptable profit
    /// @return profit The net profit amount
    function validateProfit(address token, uint256 balanceBefore, uint256 balanceAfter, uint256 minProfit)
        external
        returns (uint256 profit);
}
