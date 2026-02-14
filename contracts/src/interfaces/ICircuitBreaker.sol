// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICircuitBreaker
/// @notice Interface for the circuit breaker safety system.
/// @dev Enforces operational limits (gas price, trade size) and provides
/// a pause mechanism to halt all trading in emergencies.
interface ICircuitBreaker {
    // ──────────────────────────────────────────────
    // Errors
    // ──────────────────────────────────────────────

    /// @notice The current gas price exceeds the configured maximum.
    /// @param current The current gas price
    /// @param maximum The configured maximum gas price
    error GasPriceTooHigh(uint256 current, uint256 maximum);

    /// @notice The trade amount exceeds the configured maximum.
    /// @param amount The requested trade amount
    /// @param maximum The configured maximum trade size
    error TradeSizeTooLarge(uint256 amount, uint256 maximum);

    /// @notice The contract is currently paused.
    error ContractPaused();

    /// @notice The contract is not paused (cannot unpause).
    error ContractNotPaused();

    // ──────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when the contract is paused.
    /// @param account The account that triggered the pause
    event Paused(address indexed account);

    /// @notice Emitted when the contract is unpaused.
    /// @param account The account that triggered the unpause
    event Unpaused(address indexed account);

    /// @notice Emitted when a trade is rejected for exceeding limits.
    /// @param reason A short description of which limit was exceeded
    /// @param value The value that exceeded the limit
    /// @param limit The configured limit
    event LimitsExceeded(string reason, uint256 value, uint256 limit);

    /// @notice Emitted when the maximum gas price is updated.
    /// @param oldMaxGasPrice The previous maximum
    /// @param newMaxGasPrice The new maximum
    event MaxGasPriceUpdated(uint256 oldMaxGasPrice, uint256 newMaxGasPrice);

    /// @notice Emitted when the maximum trade size is updated.
    /// @param oldMaxTradeSize The previous maximum
    /// @param newMaxTradeSize The new maximum
    event MaxTradeSizeUpdated(uint256 oldMaxTradeSize, uint256 newMaxTradeSize);

    // ──────────────────────────────────────────────
    // Core Functions
    // ──────────────────────────────────────────────

    /// @notice Pause all trading operations (owner only).
    function pause() external;

    /// @notice Resume trading operations (owner only).
    function unpause() external;

    /// @notice Update the maximum allowed gas price (owner only).
    /// @param newMaxGasPrice The new maximum gas price in wei
    function setMaxGasPrice(uint256 newMaxGasPrice) external;

    /// @notice Update the maximum allowed trade size (owner only).
    /// @param newMaxTradeSize The new maximum trade size in token units
    function setMaxTradeSize(uint256 newMaxTradeSize) external;

    // ──────────────────────────────────────────────
    // View Functions
    // ──────────────────────────────────────────────

    /// @notice Check whether a trade is within all configured safety limits.
    /// @param gasPrice The gas price for the transaction
    /// @param amount The trade amount
    /// @return withinLimits True if the trade passes all limit checks
    function isWithinLimits(uint256 gasPrice, uint256 amount) external view returns (bool withinLimits);

    /// @notice Returns whether the contract is currently paused.
    /// @return True if paused
    function paused() external view returns (bool);

    /// @notice Returns the maximum allowed gas price.
    /// @return The maximum gas price in wei
    function maxGasPrice() external view returns (uint256);

    /// @notice Returns the maximum allowed trade size.
    /// @return The maximum trade size in token units
    function maxTradeSize() external view returns (uint256);
}
