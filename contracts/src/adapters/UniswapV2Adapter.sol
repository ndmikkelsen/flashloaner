// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IDEXAdapter} from "../interfaces/IDEXAdapter.sol";

/// @notice Minimal Uniswap V2 Router interface for swap and quote functions.
interface IUniswapV2Router02 {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts);

    function factory() external pure returns (address);
}

/// @title UniswapV2Adapter
/// @notice DEX adapter for Uniswap V2 (and compatible forks like SushiSwap).
/// @dev Implements IDEXAdapter to execute swaps via a Uniswap V2 Router.
///      The `extraData` parameter encodes an optional intermediate path for multi-hop swaps.
///      - Empty extraData: direct swap (tokenIn -> tokenOut)
///      - Non-empty extraData: abi.encode(address[]) of intermediate tokens
///        e.g., for tokenA -> WETH -> tokenB, pass abi.encode([WETH])
contract UniswapV2Adapter is IDEXAdapter {
    using SafeERC20 for IERC20;

    /// @notice The Uniswap V2 Router used for swaps.
    IUniswapV2Router02 public immutable router;

    /// @notice Deadline offset added to block.timestamp for swap calls.
    uint256 public constant DEADLINE_OFFSET = 300; // 5 minutes

    /// @param _router The Uniswap V2 Router02 address
    constructor(address _router) {
        if (_router == address(0)) revert InvalidToken(); // reuse error for zero address
        router = IUniswapV2Router02(_router);
    }

    /// @inheritdoc IDEXAdapter
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        bytes calldata extraData
    ) external returns (uint256 amountOut) {
        if (tokenIn == address(0) || tokenOut == address(0)) revert InvalidToken();
        if (amountIn == 0) revert ZeroAmountIn();

        // Pull tokens from caller
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // Build swap path
        address[] memory path = _buildPath(tokenIn, tokenOut, extraData);

        // Approve router
        IERC20(tokenIn).safeIncreaseAllowance(address(router), amountIn);

        // Execute swap — output sent directly to caller
        uint256[] memory amounts =
            router.swapExactTokensForTokens(amountIn, amountOutMin, path, msg.sender, block.timestamp + DEADLINE_OFFSET);

        amountOut = amounts[amounts.length - 1];

        if (amountOut == 0) revert ZeroAmountOut();
        if (amountOut < amountOutMin) revert SlippageExceeded(amountOut, amountOutMin);

        emit SwapExecuted(tokenIn, tokenOut, amountIn, amountOut);
    }

    /// @inheritdoc IDEXAdapter
    function getAmountOut(address tokenIn, address tokenOut, uint256 amountIn, bytes calldata extraData)
        external
        view
        returns (uint256 amountOut)
    {
        if (tokenIn == address(0) || tokenOut == address(0)) revert InvalidToken();
        if (amountIn == 0) revert ZeroAmountIn();

        address[] memory path = _buildPath(tokenIn, tokenOut, extraData);
        uint256[] memory amounts = router.getAmountsOut(amountIn, path);
        amountOut = amounts[amounts.length - 1];
    }

    /// @dev Build the swap path from tokenIn -> [intermediates] -> tokenOut.
    /// @param tokenIn The input token
    /// @param tokenOut The output token
    /// @param extraData If non-empty, abi-encoded address[] of intermediate tokens
    /// @return path The full swap path
    function _buildPath(address tokenIn, address tokenOut, bytes calldata extraData)
        internal
        pure
        returns (address[] memory path)
    {
        if (extraData.length == 0) {
            // Direct swap: tokenIn -> tokenOut
            path = new address[](2);
            path[0] = tokenIn;
            path[1] = tokenOut;
        } else {
            // Multi-hop: tokenIn -> [intermediates] -> tokenOut
            address[] memory intermediates = abi.decode(extraData, (address[]));
            path = new address[](intermediates.length + 2);
            path[0] = tokenIn;
            for (uint256 i = 0; i < intermediates.length;) {
                path[i + 1] = intermediates[i];
                unchecked {
                    ++i;
                }
            }
            path[path.length - 1] = tokenOut;
        }
    }
}
