// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IFlashloanExecutor
/// @notice Interface for the main flashloan arbitrage executor contract.
/// @dev The executor orchestrates flash loan borrowing and multi-step DEX swaps
/// to capture arbitrage opportunities atomically.
interface IFlashloanExecutor {
    /// @notice Describes a single swap step in a multi-hop arbitrage route.
    /// @param adapter The DEX adapter contract to execute this swap
    /// @param tokenIn The input token address
    /// @param tokenOut The output token address
    /// @param amountIn The input amount (0 = use full balance of tokenIn)
    /// @param extraData Adapter-specific parameters (e.g., pool fee tier, route path)
    struct SwapStep {
        address adapter;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        bytes extraData;
    }

    // ──────────────────────────────────────────────
    // Errors
    // ──────────────────────────────────────────────

    /// @notice Caller is not authorized to execute arbitrage.
    error NotAuthorized();

    /// @notice The arbitrage yielded insufficient profit.
    /// @param received The token balance after execution
    /// @param required The minimum required balance (before + minProfit)
    error InsufficientProfit(uint256 received, uint256 required);

    /// @notice A referenced DEX adapter is not registered/approved.
    /// @param adapter The unapproved adapter address
    error AdapterNotApproved(address adapter);

    /// @notice No swap steps were provided.
    error EmptySwapSteps();

    /// @notice Flash loan amount must be greater than zero.
    error ZeroAmount();

    /// @notice Invalid address (zero address provided).
    error ZeroAddress();

    // ──────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when an arbitrage is successfully executed.
    /// @param token The flash-loaned token
    /// @param amount The flash loan amount
    /// @param profit The net profit after repaying the flash loan
    event ArbitrageExecuted(address indexed token, uint256 amount, uint256 profit);

    /// @notice Emitted when profits are withdrawn by the owner.
    /// @param token The withdrawn token (address(0) for ETH)
    /// @param to The recipient address
    /// @param amount The withdrawn amount
    event ProfitWithdrawn(address indexed token, address indexed to, uint256 amount);

    /// @notice Emitted when a DEX adapter is registered.
    /// @param adapter The adapter address
    event AdapterRegistered(address indexed adapter);

    /// @notice Emitted when a DEX adapter is removed.
    /// @param adapter The adapter address
    event AdapterRemoved(address indexed adapter);

    /// @notice Emitted when the bot wallet address is updated.
    /// @param oldBotWallet The previous bot wallet address
    /// @param newBotWallet The new bot wallet address
    event BotWalletUpdated(address indexed oldBotWallet, address indexed newBotWallet);

    /// @notice Emitted when the minimum profit threshold is updated.
    /// @param oldMinProfit The previous minimum profit
    /// @param newMinProfit The new minimum profit
    event MinProfitUpdated(uint256 oldMinProfit, uint256 newMinProfit);

    // ──────────────────────────────────────────────
    // Core Functions
    // ──────────────────────────────────────────────

    /// @notice Execute a flash-loan-funded arbitrage across one or more DEX swaps.
    /// @dev Borrows `flashLoanAmount` of `flashLoanToken` from `flashLoanProvider`,
    /// executes the swap steps, repays the loan, and validates profit.
    /// Reverts if the arbitrage is not profitable.
    /// @param flashLoanProvider The flash loan provider address (e.g., Aave Pool)
    /// @param flashLoanToken The token to borrow
    /// @param flashLoanAmount The amount to borrow
    /// @param steps The ordered swap steps to execute
    function executeArbitrage(
        address flashLoanProvider,
        address flashLoanToken,
        uint256 flashLoanAmount,
        SwapStep[] calldata steps
    ) external;

    // ──────────────────────────────────────────────
    // Admin Functions
    // ──────────────────────────────────────────────

    /// @notice Withdraw ERC-20 tokens from the contract (owner only).
    /// @param token The token address to withdraw
    /// @param amount The amount to withdraw
    function withdrawToken(address token, uint256 amount) external;

    /// @notice Withdraw ETH from the contract (owner only).
    /// @param amount The amount of ETH to withdraw (in wei)
    function withdrawETH(uint256 amount) external;

    /// @notice Register a DEX adapter for use in swap steps (owner only).
    /// @param adapter The adapter contract address
    function registerAdapter(address adapter) external;

    /// @notice Remove a registered DEX adapter (owner only).
    /// @param adapter The adapter contract address
    function removeAdapter(address adapter) external;

    /// @notice Update the authorized bot wallet address (owner only).
    /// @param newBotWallet The new bot wallet address
    function setBotWallet(address newBotWallet) external;

    /// @notice Update the minimum profit threshold (owner only).
    /// @param newMinProfit The new minimum profit in token units
    function setMinProfit(uint256 newMinProfit) external;

    // ──────────────────────────────────────────────
    // View Functions
    // ──────────────────────────────────────────────

    /// @notice Returns the contract owner.
    /// @return The owner address
    function owner() external view returns (address);

    /// @notice Returns the authorized bot wallet address.
    /// @return The bot wallet address
    function botWallet() external view returns (address);

    /// @notice Returns whether a DEX adapter is approved.
    /// @param adapter The adapter address to check
    /// @return True if the adapter is approved
    function approvedAdapters(address adapter) external view returns (bool);

    /// @notice Returns the minimum profit threshold.
    /// @return The minimum profit in token units
    function minProfit() external view returns (uint256);
}
