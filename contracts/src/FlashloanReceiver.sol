// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IFlashloanReceiver} from "./interfaces/IFlashloanReceiver.sol";

/// @title FlashloanReceiver
/// @notice Abstract base contract implementing flash loan callbacks for Aave V3,
///         Balancer, and Uniswap V3. Provides access control, reentrancy protection,
///         and emergency withdrawal capabilities.
/// @dev Inherit this contract and implement `_executeArbitrage` to define swap logic.
abstract contract FlashloanReceiver is IFlashloanReceiver, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ──────────────────────────────────────────────
    // Errors
    // ──────────────────────────────────────────────

    /// @notice The caller is not the expected flash loan provider.
    error UnauthorizedCaller(address caller, address expected);

    /// @notice The initiator of the flash loan is not this contract.
    error UnauthorizedInitiator(address initiator);

    /// @notice A zero address was provided where a non-zero address is required.
    error ZeroAddress();

    /// @notice A zero amount was provided where a non-zero amount is required.
    error ZeroAmount();

    /// @notice The withdrawal amount exceeds the contract balance.
    error InsufficientBalance(uint256 requested, uint256 available);

    /// @notice ETH transfer failed.
    error ETHTransferFailed();

    /// @notice A flash loan callback was invoked outside of an active flash loan.
    error NoActiveFlashLoan();

    // ──────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when a flash loan callback is executed.
    event FlashLoanReceived(address indexed provider, address indexed asset, uint256 amount, uint256 premium);

    /// @notice Emitted when tokens are withdrawn by the owner.
    event EmergencyWithdraw(address indexed token, address indexed to, uint256 amount);

    /// @notice Emitted when ETH is withdrawn by the owner.
    event EmergencyWithdrawETH(address indexed to, uint256 amount);

    // ──────────────────────────────────────────────
    // State
    // ──────────────────────────────────────────────

    /// @notice The Aave V3 Pool address authorized to call executeOperation.
    address public immutable aavePool;

    /// @notice The Balancer Vault address authorized to call receiveFlashLoan.
    address public immutable balancerVault;

    /// @dev Flag set to true only while a flash loan is actively being processed.
    ///      Used to guard callbacks that cannot validate msg.sender against a known address.
    bool private _flashLoanActive;

    // ──────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────

    /// @param _aavePool The Aave V3 Pool address
    /// @param _balancerVault The Balancer Vault address
    /// @param _owner The initial owner address
    constructor(address _aavePool, address _balancerVault, address _owner) Ownable(_owner) {
        if (_aavePool == address(0)) revert ZeroAddress();
        if (_balancerVault == address(0)) revert ZeroAddress();

        aavePool = _aavePool;
        balancerVault = _balancerVault;
    }

    // ──────────────────────────────────────────────
    // Flash Loan Callbacks
    // ──────────────────────────────────────────────

    /// @inheritdoc IFlashloanReceiver
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external nonReentrant returns (bool) {
        if (msg.sender != aavePool) revert UnauthorizedCaller(msg.sender, aavePool);
        if (initiator != address(this)) revert UnauthorizedInitiator(initiator);

        emit FlashLoanReceived(msg.sender, asset, amount, premium);

        _executeArbitrage(params);

        // Approve Aave Pool to pull back the loan + premium
        uint256 repayAmount = amount + premium;
        IERC20(asset).safeIncreaseAllowance(aavePool, repayAmount);

        return true;
    }

    /// @inheritdoc IFlashloanReceiver
    function receiveFlashLoan(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata feeAmounts,
        bytes calldata userData
    ) external nonReentrant {
        if (msg.sender != balancerVault) revert UnauthorizedCaller(msg.sender, balancerVault);

        emit FlashLoanReceived(msg.sender, tokens[0], amounts[0], feeAmounts[0]);

        _executeArbitrage(userData);

        // Repay Balancer: transfer tokens back to the vault
        for (uint256 i = 0; i < tokens.length;) {
            uint256 repayAmount = amounts[i] + feeAmounts[i];
            IERC20(tokens[i]).safeTransfer(balancerVault, repayAmount);
            unchecked { ++i; }
        }
    }

    /// @inheritdoc IFlashloanReceiver
    function uniswapV3FlashCallback(uint256, uint256, bytes calldata data) external nonReentrant {
        // Guard: only callable during an active flash loan initiated by this contract.
        if (!_flashLoanActive) revert NoActiveFlashLoan();
        _executeArbitrage(data);
    }

    /// @inheritdoc IFlashloanReceiver
    function callFunction(
        address,
        address,
        uint256,
        bytes calldata data
    ) external nonReentrant {
        // Guard: only callable during an active flash loan initiated by this contract.
        if (!_flashLoanActive) revert NoActiveFlashLoan();
        _executeArbitrage(data);
    }

    // ──────────────────────────────────────────────
    // Abstract
    // ──────────────────────────────────────────────

    /// @notice Execute the arbitrage swap logic. Implemented by the child contract.
    /// @param params Encoded swap parameters
    function _executeArbitrage(bytes calldata params) internal virtual;

    /// @dev Set the flash loan active flag. Call before initiating a flash loan
    ///      to allow callbacks that cannot validate msg.sender (Uniswap V3, dYdX).
    function _setFlashLoanActive(bool active) internal {
        _flashLoanActive = active;
    }

    // ──────────────────────────────────────────────
    // Emergency Withdrawal
    // ──────────────────────────────────────────────

    /// @notice Withdraw ERC-20 tokens stuck in the contract (owner only).
    /// @param token The token address
    /// @param to The recipient address
    /// @param amount The amount to withdraw
    function emergencyWithdrawToken(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (token == address(0)) revert ZeroAddress();
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 balance = IERC20(token).balanceOf(address(this));
        if (amount > balance) revert InsufficientBalance(amount, balance);

        IERC20(token).safeTransfer(to, amount);
        emit EmergencyWithdraw(token, to, amount);
    }

    /// @notice Withdraw ETH stuck in the contract (owner only).
    /// @param to The recipient address
    /// @param amount The amount to withdraw (in wei)
    function emergencyWithdrawETH(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (amount > address(this).balance) revert InsufficientBalance(amount, address(this).balance);

        (bool success,) = to.call{value: amount}("");
        if (!success) revert ETHTransferFailed();
        emit EmergencyWithdrawETH(to, amount);
    }

    /// @notice Allow contract to receive ETH.
    receive() external payable {}
}
