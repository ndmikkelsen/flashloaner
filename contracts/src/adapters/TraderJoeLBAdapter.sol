// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IDEXAdapter} from "../interfaces/IDEXAdapter.sol";

/// @notice Minimal Trader Joe LBRouter V2.1 interface
interface ILBRouter {
    enum Version {
        V1,
        V2,
        V2_1
    }

    struct Path {
        uint256[] pairBinSteps;
        Version[] versions;
        IERC20[] tokenPath;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        Path memory path,
        address to,
        uint256 deadline
    ) external returns (uint256 amountOut);
}

/// @notice Minimal Trader Joe LBPair interface
interface ILBPair {
    function swap(bool swapForY, address to) external returns (bytes32 amountsOut);
    function getTokenX() external view returns (IERC20);
    function getTokenY() external view returns (IERC20);
}

/// @title TraderJoeLBAdapter
/// @notice DEX adapter for Trader Joe Liquidity Book V2.1 swaps.
/// @dev Implements IDEXAdapter for single-hop and multi-hop LB swaps.
///
///      extraData encoding:
///      - Single-hop (32 bytes): abi.encode(uint24 binStep)
///        e.g., abi.encode(uint24(25)) for 0.25% bin step
///      - Multi-hop (>32 bytes): abi.encode(uint24[] binSteps)
///        e.g., for tokenA --(25)--> WETH --(15)--> tokenB:
///        abi.encode([uint24(25), uint24(15)])
///        binSteps.length must equal number of hops
///
///      CRITICAL: LB uses pre-transfer pattern — tokens must be sent to LBPair
///      before calling swap(), unlike UniV3 which approves to router.
contract TraderJoeLBAdapter is IDEXAdapter {
    using SafeERC20 for IERC20;

    /// @notice The Trader Joe LBRouter V2.1
    ILBRouter public immutable lbRouter;

    /// @notice Deadline offset added to block.timestamp for swap calls
    uint256 public constant DEADLINE_OFFSET = 300; // 5 minutes

    /// @param _lbRouter The Trader Joe LBRouter V2.1 address (Arbitrum: 0xb4315e873dbcf96ffd0acd8ea43f689d8c20fb30)
    constructor(address _lbRouter) {
        if (_lbRouter == address(0)) revert InvalidToken();
        lbRouter = ILBRouter(_lbRouter);
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

        // Approve router (LBRouter will handle transfers internally)
        IERC20(tokenIn).safeIncreaseAllowance(address(lbRouter), amountIn);

        if (extraData.length == 32) {
            // Single-hop swap
            uint24 binStep = abi.decode(extraData, (uint24));
            amountOut = _swapSingleHop(tokenIn, tokenOut, amountIn, amountOutMin, binStep);
        } else {
            // Multi-hop swap
            uint24[] memory binSteps = abi.decode(extraData, (uint24[]));
            amountOut = _swapMultiHop(tokenIn, tokenOut, amountIn, amountOutMin, binSteps);
        }

        if (amountOut == 0) revert ZeroAmountOut();
        if (amountOut < amountOutMin) revert SlippageExceeded(amountOut, amountOutMin);

        emit SwapExecuted(tokenIn, tokenOut, amountIn, amountOut);
    }

    /// @inheritdoc IDEXAdapter
    /// @dev For LB, we use the router's view function or return 0 to indicate off-chain quote needed.
    ///      LB quote logic is complex (bin math) — defer to off-chain bot calculation.
    function getAmountOut(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bytes calldata extraData
    ) external view returns (uint256 amountOut) {
        // LB quote requires iterating through bins — too gas-intensive for view function
        // Bot handles LB price reading via getActiveId() and bin-to-price conversion
        // Return 0 to signal "quote off-chain"
        return 0;
    }

    // ──────────────────────────────────────────────
    // Internal
    // ──────────────────────────────────────────────

    /// @dev Execute a single-hop LB swap through LBRouter
    function _swapSingleHop(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        uint24 binStep
    ) internal returns (uint256 amountOut) {
        // Build Path struct: single hop = 1 binStep, 1 version, 2 tokens
        uint256[] memory binSteps = new uint256[](1);
        binSteps[0] = uint256(binStep);

        ILBRouter.Version[] memory versions = new ILBRouter.Version[](1);
        versions[0] = ILBRouter.Version.V2_1;

        IERC20[] memory tokenPath = new IERC20[](2);
        tokenPath[0] = IERC20(tokenIn);
        tokenPath[1] = IERC20(tokenOut);

        ILBRouter.Path memory path = ILBRouter.Path({
            pairBinSteps: binSteps,
            versions: versions,
            tokenPath: tokenPath
        });

        amountOut = lbRouter.swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            path,
            msg.sender,
            block.timestamp + DEADLINE_OFFSET
        );
    }

    /// @dev Execute a multi-hop LB swap through LBRouter
    function _swapMultiHop(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        uint24[] memory binSteps
    ) internal returns (uint256 amountOut) {
        // Multi-hop: binSteps.length hops = binSteps.length + 1 tokens
        // This adapter does NOT support cross-hop intermediates from extraData
        // Multi-hop LB paths must be constructed by bot (future enhancement)
        revert("TraderJoeLBAdapter: multi-hop not yet supported");
    }
}
