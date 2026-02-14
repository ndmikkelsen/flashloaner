// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IDEXAdapter
/// @notice Interface for DEX-specific swap adapters.
/// @dev Each supported DEX (Uniswap V2, V3, Curve, etc.) has its own adapter
/// implementing this interface. The FlashloanExecutor calls adapters to execute
/// individual swap steps in an arbitrage route.
interface IDEXAdapter {
    // ──────────────────────────────────────────────
    // Errors
    // ──────────────────────────────────────────────

    /// @notice The swap returned less than the minimum required output.
    /// @param amountOut The actual output amount
    /// @param amountOutMin The minimum required output
    error SlippageExceeded(uint256 amountOut, uint256 amountOutMin);

    /// @notice The swap produced zero output tokens.
    error ZeroAmountOut();

    /// @notice An invalid token address was provided.
    error InvalidToken();

    /// @notice The input amount must be greater than zero.
    error ZeroAmountIn();

    // ──────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when a swap is executed through this adapter.
    /// @param tokenIn The input token
    /// @param tokenOut The output token
    /// @param amountIn The input amount
    /// @param amountOut The output amount
    event SwapExecuted(
        address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut
    );

    // ──────────────────────────────────────────────
    // Core Functions
    // ──────────────────────────────────────────────

    /// @notice Execute a token swap on the underlying DEX.
    /// @dev Transfers `amountIn` of `tokenIn` from the caller, executes the swap,
    /// and transfers the output tokens back to the caller.
    /// @param tokenIn The input token address
    /// @param tokenOut The output token address
    /// @param amountIn The amount of input tokens to swap
    /// @param amountOutMin The minimum acceptable output amount (slippage protection)
    /// @param extraData Adapter-specific parameters (e.g., pool fee for Uni V3, route for Curve)
    /// @return amountOut The actual amount of output tokens received
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        bytes calldata extraData
    ) external returns (uint256 amountOut);

    // ──────────────────────────────────────────────
    // View Functions
    // ──────────────────────────────────────────────

    /// @notice Get the expected output amount for a given swap (off-chain quote).
    /// @dev This is a read-only quote and may differ from actual execution due to
    /// price movement between query and execution.
    /// @param tokenIn The input token address
    /// @param tokenOut The output token address
    /// @param amountIn The input amount to quote
    /// @param extraData Adapter-specific parameters
    /// @return amountOut The estimated output amount
    function getAmountOut(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes calldata extraData
    ) external view returns (uint256 amountOut);
}
