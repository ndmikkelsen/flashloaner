// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICircuitBreaker} from "../interfaces/ICircuitBreaker.sol";

/// @title CircuitBreaker
/// @notice Safety system that enforces operational limits and provides emergency shutdown.
/// @dev Implements pause mechanism, gas price limits, trade size limits, and
///      automatic circuit breaking on consecutive failures.
contract CircuitBreaker is ICircuitBreaker, Ownable {
    // ──────────────────────────────────────────────
    // Errors (implementation-specific)
    // ──────────────────────────────────────────────

    /// @notice Parameter must be greater than zero.
    error ZeroValue();

    // ──────────────────────────────────────────────
    // Events (implementation-specific)
    // ──────────────────────────────────────────────

    /// @notice Emitted when the consecutive failure threshold is updated.
    event ConsecutiveFailureThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);

    /// @notice Emitted when the circuit breaker auto-pauses due to consecutive failures.
    event AutoPaused(uint256 consecutiveFailures, uint256 threshold);

    /// @notice Emitted when a failure is recorded.
    event FailureRecorded(uint256 consecutiveFailures);

    /// @notice Emitted when the failure counter is reset after a success.
    event FailureCounterReset();

    // ──────────────────────────────────────────────
    // State
    // ──────────────────────────────────────────────

    /// @notice Whether trading is paused.
    bool private _paused;

    /// @notice Maximum allowed gas price in wei.
    uint256 private _maxGasPrice;

    /// @notice Maximum allowed trade size in token units.
    uint256 private _maxTradeSize;

    /// @notice Number of consecutive failed trades.
    uint256 public consecutiveFailures;

    /// @notice Threshold of consecutive failures that triggers auto-pause.
    uint256 public consecutiveFailureThreshold;

    // ──────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────

    /// @param initialMaxGasPrice The initial maximum gas price in wei
    /// @param initialMaxTradeSize The initial maximum trade size in token units
    /// @param initialFailureThreshold The consecutive failure count that triggers auto-pause (0 = disabled)
    /// @param _owner The initial owner address
    constructor(
        uint256 initialMaxGasPrice,
        uint256 initialMaxTradeSize,
        uint256 initialFailureThreshold,
        address _owner
    ) Ownable(_owner) {
        if (initialMaxGasPrice == 0) revert ZeroValue();
        if (initialMaxTradeSize == 0) revert ZeroValue();

        _maxGasPrice = initialMaxGasPrice;
        _maxTradeSize = initialMaxTradeSize;
        consecutiveFailureThreshold = initialFailureThreshold;
    }

    // ──────────────────────────────────────────────
    // Modifiers
    // ──────────────────────────────────────────────

    /// @notice Reverts if the contract is paused.
    modifier whenNotPaused() {
        if (_paused) revert ContractPaused();
        _;
    }

    /// @notice Reverts if the contract is not paused.
    modifier whenPaused() {
        if (!_paused) revert ContractNotPaused();
        _;
    }

    // ──────────────────────────────────────────────
    // Pause / Unpause
    // ──────────────────────────────────────────────

    /// @inheritdoc ICircuitBreaker
    function pause() external onlyOwner whenNotPaused {
        _paused = true;
        emit Paused(msg.sender);
    }

    /// @inheritdoc ICircuitBreaker
    function unpause() external onlyOwner whenPaused {
        _paused = false;
        consecutiveFailures = 0;
        emit Unpaused(msg.sender);
    }

    // ──────────────────────────────────────────────
    // Parameter Setters
    // ──────────────────────────────────────────────

    /// @inheritdoc ICircuitBreaker
    function setMaxGasPrice(uint256 newMaxGasPrice) external onlyOwner {
        if (newMaxGasPrice == 0) revert ZeroValue();
        uint256 old = _maxGasPrice;
        _maxGasPrice = newMaxGasPrice;
        emit MaxGasPriceUpdated(old, newMaxGasPrice);
    }

    /// @inheritdoc ICircuitBreaker
    function setMaxTradeSize(uint256 newMaxTradeSize) external onlyOwner {
        if (newMaxTradeSize == 0) revert ZeroValue();
        uint256 old = _maxTradeSize;
        _maxTradeSize = newMaxTradeSize;
        emit MaxTradeSizeUpdated(old, newMaxTradeSize);
    }

    /// @notice Update the consecutive failure threshold (owner only).
    /// @param newThreshold The new threshold (0 = disable auto-pause)
    function setConsecutiveFailureThreshold(uint256 newThreshold) external onlyOwner {
        uint256 old = consecutiveFailureThreshold;
        consecutiveFailureThreshold = newThreshold;
        emit ConsecutiveFailureThresholdUpdated(old, newThreshold);
    }

    // ──────────────────────────────────────────────
    // Limit Checks
    // ──────────────────────────────────────────────

    /// @inheritdoc ICircuitBreaker
    function isWithinLimits(uint256 gasPrice, uint256 amount) external view returns (bool) {
        if (_paused) return false;
        if (gasPrice > _maxGasPrice) return false;
        if (amount > _maxTradeSize) return false;
        return true;
    }

    /// @notice Enforce limits and revert with descriptive errors if violated.
    /// @dev Called by the executor before executing a trade.
    /// @param gasPrice The gas price for the transaction
    /// @param amount The trade amount
    function enforceLimits(uint256 gasPrice, uint256 amount) external view whenNotPaused {
        if (gasPrice > _maxGasPrice) {
            revert GasPriceTooHigh(gasPrice, _maxGasPrice);
        }
        if (amount > _maxTradeSize) {
            revert TradeSizeTooLarge(amount, _maxTradeSize);
        }
    }

    // ──────────────────────────────────────────────
    // Failure Tracking
    // ──────────────────────────────────────────────

    /// @notice Record a trade failure. Auto-pauses if threshold is reached.
    /// @dev Called by the executor after a failed trade.
    function recordFailure() external {
        uint256 failures = ++consecutiveFailures;
        emit FailureRecorded(failures);

        if (consecutiveFailureThreshold > 0 && failures >= consecutiveFailureThreshold) {
            _paused = true;
            emit AutoPaused(failures, consecutiveFailureThreshold);
            emit Paused(address(this));
        }
    }

    /// @notice Record a successful trade, resetting the failure counter.
    /// @dev Called by the executor after a successful trade.
    function recordSuccess() external {
        if (consecutiveFailures > 0) {
            consecutiveFailures = 0;
            emit FailureCounterReset();
        }
    }

    // ──────────────────────────────────────────────
    // View Functions
    // ──────────────────────────────────────────────

    /// @inheritdoc ICircuitBreaker
    function paused() external view returns (bool) {
        return _paused;
    }

    /// @inheritdoc ICircuitBreaker
    function maxGasPrice() external view returns (uint256) {
        return _maxGasPrice;
    }

    /// @inheritdoc ICircuitBreaker
    function maxTradeSize() external view returns (uint256) {
        return _maxTradeSize;
    }
}
