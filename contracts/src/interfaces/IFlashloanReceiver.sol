// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IFlashloanReceiver
/// @notice Interface for contracts that receive flash loans from various providers
/// @dev The FlashloanReceiver base contract implements these callbacks.
///      Each callback corresponds to a specific flash loan provider's expected interface.
interface IFlashloanReceiver {
    /// @notice Aave V3 flash loan callback
    /// @dev Called by the Aave Pool after transferring the flash-borrowed assets
    /// @param asset The address of the flash-borrowed asset
    /// @param amount The amount of the flash-borrowed asset
    /// @param premium The fee charged by Aave for the flash loan
    /// @param initiator The address that initiated the flash loan
    /// @param params Encoded parameters passed from the initiator
    /// @return True if the operation was successful
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool);

    /// @notice Balancer flash loan callback
    /// @dev Called by the Balancer Vault after transferring the flash-borrowed tokens
    /// @param tokens Array of token addresses that were borrowed
    /// @param amounts Array of amounts that were borrowed
    /// @param feeAmounts Array of fees charged for each token
    /// @param userData Encoded parameters passed from the initiator
    function receiveFlashLoan(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata feeAmounts,
        bytes calldata userData
    ) external;

    /// @notice Uniswap V3 flash callback
    /// @dev Called by a Uniswap V3 pool after a flash loan
    /// @param fee0 The fee amount in token0 owed to the pool
    /// @param fee1 The fee amount in token1 owed to the pool
    /// @param data Encoded parameters passed from the initiator
    function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external;

    /// @notice dYdX flash loan callback
    /// @dev Called by dYdX SoloMargin after transferring the flash-borrowed assets.
    /// The borrower must repay the exact amount (dYdX charges no fee).
    /// @param sender The address that initiated the flash loan operation
    /// @param accountOwner The dYdX account owner address
    /// @param accountNumber The dYdX account number
    /// @param data Encoded parameters passed from the initiator
    function callFunction(address sender, address accountOwner, uint256 accountNumber, bytes calldata data)
        external;
}
