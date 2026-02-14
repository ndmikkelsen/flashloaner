// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IDEXAdapter} from "../interfaces/IDEXAdapter.sol";

/// @notice Minimal Uniswap V3 SwapRouter interface.
interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);

    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
}

/// @notice Minimal Uniswap V3 QuoterV2 interface for off-chain quoting.
interface IQuoterV2 {
    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    function quoteExactInputSingle(QuoteExactInputSingleParams memory params)
        external
        returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate);

    function quoteExactInput(bytes memory path, uint256 amountIn)
        external
        returns (uint256 amountOut, uint160[] memory sqrtPriceX96AfterList, uint32[] memory initializedTicksCrossedList, uint256 gasEstimate);
}

/// @title UniswapV3Adapter
/// @notice DEX adapter for Uniswap V3 swaps with fee tier support.
/// @dev Implements IDEXAdapter for single-hop and multi-hop V3 swaps.
///
///      extraData encoding:
///      - Single-hop (32 bytes): abi.encode(uint24 fee)
///        e.g., abi.encode(uint24(3000)) for the 0.3% fee tier
///      - Multi-hop (>32 bytes): abi.encode(uint24[] fees, address[] intermediates)
///        e.g., for tokenA --(3000)--> WETH --(500)--> tokenB:
///        abi.encode([uint24(3000), uint24(500)], [WETH])
///        fees.length must equal intermediates.length + 1
contract UniswapV3Adapter is IDEXAdapter {
    using SafeERC20 for IERC20;

    /// @notice Fee tier not valid for Uniswap V3.
    error InvalidFeeTier(uint24 fee);

    /// @notice Fees and intermediates array length mismatch.
    error PathLengthMismatch();

    /// @notice The Uniswap V3 SwapRouter.
    ISwapRouter public immutable swapRouter;

    /// @notice The Uniswap V3 QuoterV2 for off-chain quotes.
    IQuoterV2 public immutable quoter;

    /// @notice Deadline offset added to block.timestamp for swap calls.
    uint256 public constant DEADLINE_OFFSET = 300; // 5 minutes

    /// @param _swapRouter The Uniswap V3 SwapRouter address
    /// @param _quoter The Uniswap V3 QuoterV2 address
    constructor(address _swapRouter, address _quoter) {
        if (_swapRouter == address(0)) revert InvalidToken();
        if (_quoter == address(0)) revert InvalidToken();
        swapRouter = ISwapRouter(_swapRouter);
        quoter = IQuoterV2(_quoter);
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

        // Approve router
        IERC20(tokenIn).safeIncreaseAllowance(address(swapRouter), amountIn);

        if (extraData.length == 32) {
            // Single-hop swap
            uint24 fee = abi.decode(extraData, (uint24));
            amountOut = _swapSingle(tokenIn, tokenOut, amountIn, amountOutMin, fee);
        } else {
            // Multi-hop swap
            (uint24[] memory fees, address[] memory intermediates) =
                abi.decode(extraData, (uint24[], address[]));
            if (fees.length != intermediates.length + 1) revert PathLengthMismatch();
            bytes memory path = _encodePath(tokenIn, tokenOut, fees, intermediates);
            amountOut = _swapMultiHop(path, amountIn, amountOutMin);
        }

        if (amountOut == 0) revert ZeroAmountOut();
        if (amountOut < amountOutMin) revert SlippageExceeded(amountOut, amountOutMin);

        emit SwapExecuted(tokenIn, tokenOut, amountIn, amountOut);
    }

    /// @inheritdoc IDEXAdapter
    /// @dev Uses QuoterV2 via low-level staticcall. Works off-chain via eth_call.
    ///      May revert on-chain since the quoter is not a true view function.
    function getAmountOut(address tokenIn, address tokenOut, uint256 amountIn, bytes calldata extraData)
        external
        view
        returns (uint256 amountOut)
    {
        if (tokenIn == address(0) || tokenOut == address(0)) revert InvalidToken();
        if (amountIn == 0) revert ZeroAmountIn();

        bytes memory callData;

        if (extraData.length == 32) {
            uint24 fee = abi.decode(extraData, (uint24));
            callData = abi.encodeCall(
                quoter.quoteExactInputSingle,
                (
                    IQuoterV2.QuoteExactInputSingleParams({
                        tokenIn: tokenIn,
                        tokenOut: tokenOut,
                        amountIn: amountIn,
                        fee: fee,
                        sqrtPriceLimitX96: 0
                    })
                )
            );
        } else {
            (uint24[] memory fees, address[] memory intermediates) =
                abi.decode(extraData, (uint24[], address[]));
            bytes memory path = _encodePath(tokenIn, tokenOut, fees, intermediates);
            callData = abi.encodeCall(quoter.quoteExactInput, (path, amountIn));
        }

        // staticcall the quoter — works off-chain, may revert on-chain
        (bool success, bytes memory result) = address(quoter).staticcall(callData);
        require(success, "UniswapV3Adapter: quote failed");

        // First return value is always amountOut
        (amountOut) = abi.decode(result, (uint256));
    }

    // ──────────────────────────────────────────────
    // Internal
    // ──────────────────────────────────────────────

    /// @dev Execute a single-hop V3 swap.
    function _swapSingle(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        uint24 fee
    ) internal returns (uint256 amountOut) {
        amountOut = swapRouter.exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: msg.sender,
                deadline: block.timestamp + DEADLINE_OFFSET,
                amountIn: amountIn,
                amountOutMinimum: amountOutMin,
                sqrtPriceLimitX96: 0
            })
        );
    }

    /// @dev Execute a multi-hop V3 swap.
    function _swapMultiHop(bytes memory path, uint256 amountIn, uint256 amountOutMin)
        internal
        returns (uint256 amountOut)
    {
        amountOut = swapRouter.exactInput(
            ISwapRouter.ExactInputParams({
                path: path,
                recipient: msg.sender,
                deadline: block.timestamp + DEADLINE_OFFSET,
                amountIn: amountIn,
                amountOutMinimum: amountOutMin
            })
        );
    }

    /// @dev Encode a V3 multi-hop path: token0 + fee0 + token1 + fee1 + ... + tokenN.
    /// @param tokenIn The first token in the path
    /// @param tokenOut The last token in the path
    /// @param fees Array of fee tiers (length = intermediates.length + 1)
    /// @param intermediates Array of intermediate token addresses
    /// @return path The packed V3 path bytes
    function _encodePath(
        address tokenIn,
        address tokenOut,
        uint24[] memory fees,
        address[] memory intermediates
    ) internal pure returns (bytes memory path) {
        path = abi.encodePacked(tokenIn, fees[0]);
        for (uint256 i = 0; i < intermediates.length;) {
            path = abi.encodePacked(path, intermediates[i], fees[i + 1]);
            unchecked {
                ++i;
            }
        }
        path = abi.encodePacked(path, tokenOut);
    }
}
