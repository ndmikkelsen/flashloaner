// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IProfitValidator} from "../interfaces/IProfitValidator.sol";

/// @title ProfitValidator
/// @notice Validates that an arbitrage produced sufficient profit after flash loan repayment.
/// @dev Stateless validation contract — all parameters are passed per-call, enabling
///      flexible profit thresholds without requiring contract upgrades.
contract ProfitValidator is IProfitValidator {
    /// @inheritdoc IProfitValidator
    function validateProfit(
        address token,
        uint256 balanceBefore,
        uint256 balanceAfter,
        uint256 minProfit
    ) external returns (uint256 profit) {
        // Check for net loss (balanceAfter < balanceBefore)
        if (balanceAfter < balanceBefore) {
            emit InsufficientProfit(token, balanceBefore, balanceAfter, minProfit);
            revert ExecutionLoss(balanceBefore, balanceAfter);
        }

        profit = balanceAfter - balanceBefore;

        // Check profit meets minimum threshold
        if (profit < minProfit) {
            emit InsufficientProfit(token, balanceBefore, balanceAfter, minProfit);
            revert ProfitBelowMinimum(profit, minProfit);
        }

        emit ProfitValidated(token, profit);
    }
}
