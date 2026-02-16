// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {FlashloanReceiver} from "./FlashloanReceiver.sol";
import {IFlashloanExecutor} from "./interfaces/IFlashloanExecutor.sol";
import {IDEXAdapter} from "./interfaces/IDEXAdapter.sol";

/// @title FlashloanExecutor
/// @notice Main contract that orchestrates flash loan arbitrage execution.
/// @dev Inherits FlashloanReceiver for flash loan callbacks, implements
///      IFlashloanExecutor for the full arbitrage interface. Supports multi-hop
///      swap routing through registered DEX adapters with profit validation.
contract FlashloanExecutor is FlashloanReceiver, IFlashloanExecutor {
    using SafeERC20 for IERC20;

    // ──────────────────────────────────────────────
    // State
    // ──────────────────────────────────────────────

    /// @inheritdoc IFlashloanExecutor
    address public botWallet;

    /// @inheritdoc IFlashloanExecutor
    uint256 public minProfit;

    /// @inheritdoc IFlashloanExecutor
    mapping(address => bool) public approvedAdapters;

    /// @dev Whether the contract is paused.
    bool public paused;

    /// @dev Temporary storage for swap steps during flash loan callback.
    ///      Set before requesting flash loan, consumed in _executeArbitrage.
    SwapStep[] private _pendingSteps;

    /// @dev Temporary storage for the flash loan token address.
    address private _pendingToken;

    // ──────────────────────────────────────────────
    // Additional Errors
    // ──────────────────────────────────────────────

    /// @notice The contract is paused.
    error ContractPaused();

    // ──────────────────────────────────────────────
    // Additional Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when the contract is paused.
    event Paused(address indexed account);

    /// @notice Emitted when the contract is unpaused.
    event Unpaused(address indexed account);

    // ──────────────────────────────────────────────
    // Modifiers
    // ──────────────────────────────────────────────

    /// @dev Restricts to owner or authorized bot wallet.
    modifier onlyAuthorized() {
        if (msg.sender != owner() && msg.sender != botWallet) {
            revert NotAuthorized();
        }
        _;
    }

    /// @dev Restricts to when contract is not paused.
    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    // ──────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────

    /// @param _aavePool The Aave V3 Pool address
    /// @param _balancerVault The Balancer Vault address
    /// @param _owner The initial owner address
    /// @param _botWallet The authorized bot wallet address
    /// @param _minProfit The minimum profit threshold (in token units)
    constructor(
        address _aavePool,
        address _balancerVault,
        address _owner,
        address _botWallet,
        uint256 _minProfit
    ) FlashloanReceiver(_aavePool, _balancerVault, _owner) {
        if (_botWallet == address(0)) revert ZeroAddress();
        botWallet = _botWallet;
        minProfit = _minProfit;
    }

    // ──────────────────────────────────────────────
    // Core: Execute Arbitrage
    // ──────────────────────────────────────────────

    /// @inheritdoc IFlashloanExecutor
    function executeArbitrage(
        address flashLoanProvider,
        address flashLoanToken,
        uint256 flashLoanAmount,
        SwapStep[] calldata steps
    ) external onlyAuthorized whenNotPaused {
        if (flashLoanProvider == address(0)) revert ZeroAddress();
        if (flashLoanToken == address(0)) revert ZeroAddress();
        if (flashLoanAmount == 0) revert ZeroAmount();
        if (steps.length == 0) revert EmptySwapSteps();

        // Validate all adapters before making the flash loan request
        for (uint256 i = 0; i < steps.length;) {
            if (!approvedAdapters[steps[i].adapter]) {
                revert AdapterNotApproved(steps[i].adapter);
            }
            unchecked { ++i; }
        }

        // Store steps in temporary storage for the callback
        delete _pendingSteps;
        for (uint256 i = 0; i < steps.length;) {
            _pendingSteps.push(steps[i]);
            unchecked { ++i; }
        }
        _pendingToken = flashLoanToken;

        // Set flash loan active flag (guards uniswapV3FlashCallback / callFunction)
        _setFlashLoanActive(true);

        // Request flash loan from Aave V3
        // Aave will call executeOperation() on this contract
        bytes memory params = ""; // Steps are stored in contract storage
        _requestAaveFlashLoan(flashLoanProvider, flashLoanToken, flashLoanAmount, params);

        // Clear flash loan active flag after completion
        _setFlashLoanActive(false);
    }

    /// @dev Request a flash loan from Aave V3 Pool.
    function _requestAaveFlashLoan(
        address pool,
        address asset,
        uint256 amount,
        bytes memory params
    ) internal {
        // Aave V3 Pool.flashLoanSimple(receiverAddress, asset, amount, params, referralCode)
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory returnData) = pool.call(
            abi.encodeWithSignature(
                "flashLoanSimple(address,address,uint256,bytes,uint16)",
                address(this),
                asset,
                amount,
                params,
                uint16(0) // no referral
            )
        );
        if (!success) {
            // Bubble up the revert reason
            if (returnData.length > 0) {
                assembly {
                    revert(add(returnData, 32), mload(returnData))
                }
            }
            revert("FlashLoan request failed");
        }
    }

    // ──────────────────────────────────────────────
    // Flash Loan Callback Implementation
    // ──────────────────────────────────────────────

    /// @dev Called by FlashloanReceiver callbacks. Executes the stored swap steps
    ///      and validates profit.
    function _executeArbitrage(bytes calldata) internal override {
        SwapStep[] memory steps = _pendingSteps;
        address token = _pendingToken;

        // Record balance before swaps
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));

        // Execute each swap step
        for (uint256 i = 0; i < steps.length;) {
            _executeSwapStep(steps[i]);
            unchecked { ++i; }
        }

        // Validate profit
        uint256 balanceAfter = IERC20(token).balanceOf(address(this));
        if (balanceAfter <= balanceBefore) {
            revert InsufficientProfit(balanceAfter, balanceBefore + minProfit);
        }

        uint256 profit;
        unchecked {
            profit = balanceAfter - balanceBefore;
        }

        if (profit < minProfit) {
            revert InsufficientProfit(balanceAfter, balanceBefore + minProfit);
        }

        emit ArbitrageExecuted(token, balanceBefore, profit);

        // Clean up temporary storage
        delete _pendingSteps;
        delete _pendingToken;
    }

    /// @dev Execute a single swap step through a DEX adapter.
    function _executeSwapStep(SwapStep memory step) internal {
        uint256 amountIn = step.amountIn;

        // If amountIn is 0, use the full balance of tokenIn
        if (amountIn == 0) {
            amountIn = IERC20(step.tokenIn).balanceOf(address(this));
        }

        // Approve the adapter to spend tokens
        IERC20(step.tokenIn).safeIncreaseAllowance(step.adapter, amountIn);

        // Execute the swap via the adapter
        IDEXAdapter(step.adapter).swap(
            step.tokenIn,
            step.tokenOut,
            amountIn,
            0, // amountOutMin = 0; profit is validated at the end atomically
            step.extraData
        );

        // Clear any residual allowance to prevent a compromised adapter from draining tokens.
        // Only reset if there is a remaining allowance (avoids unnecessary SSTORE).
        uint256 remaining = IERC20(step.tokenIn).allowance(address(this), step.adapter);
        if (remaining > 0) {
            IERC20(step.tokenIn).forceApprove(step.adapter, 0);
        }
    }

    // ──────────────────────────────────────────────
    // Admin Functions
    // ──────────────────────────────────────────────

    /// @inheritdoc IFlashloanExecutor
    function registerAdapter(address adapter) external onlyOwner {
        if (adapter == address(0)) revert ZeroAddress();
        approvedAdapters[adapter] = true;
        emit AdapterRegistered(adapter);
    }

    /// @inheritdoc IFlashloanExecutor
    function removeAdapter(address adapter) external onlyOwner {
        if (adapter == address(0)) revert ZeroAddress();
        approvedAdapters[adapter] = false;
        emit AdapterRemoved(adapter);
    }

    /// @inheritdoc IFlashloanExecutor
    function setBotWallet(address newBotWallet) external onlyOwner {
        if (newBotWallet == address(0)) revert ZeroAddress();
        address old = botWallet;
        botWallet = newBotWallet;
        emit BotWalletUpdated(old, newBotWallet);
    }

    /// @inheritdoc IFlashloanExecutor
    function setMinProfit(uint256 newMinProfit) external onlyOwner {
        uint256 old = minProfit;
        minProfit = newMinProfit;
        emit MinProfitUpdated(old, newMinProfit);
    }

    /// @notice Pause all arbitrage execution (owner only).
    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    /// @notice Resume arbitrage execution (owner only).
    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /// @inheritdoc IFlashloanExecutor
    function withdrawToken(address token, uint256 amount) external onlyOwner nonReentrant {
        if (token == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        IERC20(token).safeTransfer(msg.sender, amount);
        emit ProfitWithdrawn(token, msg.sender, amount);
    }

    /// @inheritdoc IFlashloanExecutor
    function withdrawETH(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();
        (bool success,) = msg.sender.call{value: amount}("");
        if (!success) revert ETHTransferFailed();
        emit ProfitWithdrawn(address(0), msg.sender, amount);
    }
}
