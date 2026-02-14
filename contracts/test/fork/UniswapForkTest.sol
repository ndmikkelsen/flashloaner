// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ForkTestBase} from "./ForkTestBase.sol";
import {UniswapV2Adapter} from "../../src/adapters/UniswapV2Adapter.sol";
import {UniswapV3Adapter} from "../../src/adapters/UniswapV3Adapter.sol";

/// @title UniswapForkTest
/// @notice Fork tests for Uniswap V2 and V3 adapter integration with real pools.
/// @dev Run: forge test --fork-url $MAINNET_RPC_URL --match-contract UniswapForkTest -vvv
contract UniswapForkTest is ForkTestBase {
    UniswapV2Adapter internal v2Adapter;
    UniswapV3Adapter internal v3Adapter;

    address internal trader = makeAddr("trader");

    function setUp() public {
        _tryCreateFork();
        if (!forkActive) return;

        _labelMainnetAddresses();

        v2Adapter = new UniswapV2Adapter(UNISWAP_V2_ROUTER);
        v3Adapter = new UniswapV3Adapter(UNISWAP_V3_ROUTER, UNISWAP_V3_QUOTER_V2);
        vm.label(address(v2Adapter), "UniV2Adapter");
        vm.label(address(v3Adapter), "UniV3Adapter");
    }

    // ──────────────────────────────────────────────
    // Uniswap V2 Fork Tests
    // ──────────────────────────────────────────────

    /// @notice Swap WETH -> USDC on real Uniswap V2 pool.
    function test_v2_swapWETHforUSDC() public {
        if (!forkActive) return;

        uint256 amountIn = 1 ether;
        _dealToken(WETH, trader, amountIn);

        vm.startPrank(trader);
        IERC20(WETH).approve(address(v2Adapter), amountIn);
        uint256 amountOut = v2Adapter.swap(WETH, USDC, amountIn, 0, "");
        vm.stopPrank();

        // WETH/USDC price should give us some USDC (sanity: > $100 per ETH)
        assertGt(amountOut, _toTokenUnits(100, USDC_DECIMALS), "Should get > 100 USDC for 1 WETH");
        assertEq(IERC20(USDC).balanceOf(trader), amountOut);
        assertEq(IERC20(WETH).balanceOf(trader), 0);
    }

    /// @notice Swap USDC -> WETH on real Uniswap V2 pool.
    function test_v2_swapUSDCforWETH() public {
        if (!forkActive) return;

        uint256 amountIn = _toTokenUnits(3000, USDC_DECIMALS); // 3000 USDC
        _dealToken(USDC, trader, amountIn);

        vm.startPrank(trader);
        IERC20(USDC).approve(address(v2Adapter), amountIn);
        uint256 amountOut = v2Adapter.swap(USDC, WETH, amountIn, 0, "");
        vm.stopPrank();

        // Should get some WETH (sanity: > 0.1 WETH for 3000 USDC)
        assertGt(amountOut, 0.1 ether, "Should get > 0.1 WETH for 3000 USDC");
    }

    /// @notice V2 multi-hop: USDC -> WETH -> DAI
    function test_v2_multiHop_USDCtoWETHtoDAI() public {
        if (!forkActive) return;

        uint256 amountIn = _toTokenUnits(1000, USDC_DECIMALS);
        _dealToken(USDC, trader, amountIn);

        // Encode WETH as intermediate
        address[] memory intermediates = new address[](1);
        intermediates[0] = WETH;
        bytes memory extraData = abi.encode(intermediates);

        vm.startPrank(trader);
        IERC20(USDC).approve(address(v2Adapter), amountIn);
        uint256 amountOut = v2Adapter.swap(USDC, DAI, amountIn, 0, extraData);
        vm.stopPrank();

        // USDC and DAI should be roughly 1:1, minus fees
        assertGt(amountOut, 900 ether, "Should get ~1000 DAI for 1000 USDC minus fees");
    }

    /// @notice V2 getAmountOut matches real pool quote.
    function test_v2_getAmountOutReturnsQuote() public view {
        if (!forkActive) return;

        uint256 amountIn = 1 ether;
        uint256 quote = v2Adapter.getAmountOut(WETH, USDC, amountIn, "");

        // Should return a valid quote (> $100 per ETH)
        assertGt(quote, _toTokenUnits(100, USDC_DECIMALS));
    }

    /// @notice V2 gas benchmark: direct swap.
    function test_v2_gasBenchmark_directSwap() public {
        if (!forkActive) return;

        uint256 amountIn = 1 ether;
        _dealToken(WETH, trader, amountIn);

        vm.startPrank(trader);
        IERC20(WETH).approve(address(v2Adapter), amountIn);

        uint256 gasBefore = gasleft();
        v2Adapter.swap(WETH, USDC, amountIn, 0, "");
        uint256 gasUsed = gasBefore - gasleft();
        vm.stopPrank();

        emit log_named_uint("UniV2 Direct Swap Gas", gasUsed);
        assertLt(gasUsed, 300_000, "V2 swap gas too high");
    }

    // ──────────────────────────────────────────────
    // Uniswap V3 Fork Tests
    // ──────────────────────────────────────────────

    /// @notice Swap WETH -> USDC on real Uniswap V3 pool (0.05% fee tier).
    function test_v3_swapWETHforUSDC_lowFee() public {
        if (!forkActive) return;

        uint256 amountIn = 1 ether;
        _dealToken(WETH, trader, amountIn);

        bytes memory extraData = abi.encode(uint24(500)); // 0.05% fee tier

        vm.startPrank(trader);
        IERC20(WETH).approve(address(v3Adapter), amountIn);
        uint256 amountOut = v3Adapter.swap(WETH, USDC, amountIn, 0, extraData);
        vm.stopPrank();

        assertGt(amountOut, _toTokenUnits(100, USDC_DECIMALS), "Should get > 100 USDC for 1 WETH");
        assertEq(IERC20(USDC).balanceOf(trader), amountOut);
    }

    /// @notice Swap WETH -> USDC on 0.3% fee tier.
    function test_v3_swapWETHforUSDC_mediumFee() public {
        if (!forkActive) return;

        uint256 amountIn = 1 ether;
        _dealToken(WETH, trader, amountIn);

        bytes memory extraData = abi.encode(uint24(3000)); // 0.3% fee tier

        vm.startPrank(trader);
        IERC20(WETH).approve(address(v3Adapter), amountIn);
        uint256 amountOut = v3Adapter.swap(WETH, USDC, amountIn, 0, extraData);
        vm.stopPrank();

        assertGt(amountOut, _toTokenUnits(100, USDC_DECIMALS));
    }

    /// @notice V3 multi-hop: USDC --(500)--> WETH --(3000)--> DAI
    function test_v3_multiHop_USDCtoWETHtoDAI() public {
        if (!forkActive) return;

        uint256 amountIn = _toTokenUnits(1000, USDC_DECIMALS);
        _dealToken(USDC, trader, amountIn);

        uint24[] memory fees = new uint24[](2);
        fees[0] = 500; // USDC -> WETH 0.05%
        fees[1] = 3000; // WETH -> DAI 0.3%
        address[] memory intermediates = new address[](1);
        intermediates[0] = WETH;

        bytes memory extraData = abi.encode(fees, intermediates);

        vm.startPrank(trader);
        IERC20(USDC).approve(address(v3Adapter), amountIn);
        uint256 amountOut = v3Adapter.swap(USDC, DAI, amountIn, 0, extraData);
        vm.stopPrank();

        // USDC/DAI roughly 1:1 minus fees
        assertGt(amountOut, 900 ether, "Should get ~1000 DAI minus fees");
    }

    /// @notice V3 getAmountOut via QuoterV2.
    function test_v3_getAmountOutReturnsQuote() public view {
        if (!forkActive) return;

        uint256 amountIn = 1 ether;
        bytes memory extraData = abi.encode(uint24(500));
        uint256 quote = v3Adapter.getAmountOut(WETH, USDC, amountIn, extraData);

        assertGt(quote, _toTokenUnits(100, USDC_DECIMALS));
    }

    /// @notice V3 gas benchmark: single-hop swap.
    function test_v3_gasBenchmark_singleHop() public {
        if (!forkActive) return;

        uint256 amountIn = 1 ether;
        _dealToken(WETH, trader, amountIn);
        bytes memory extraData = abi.encode(uint24(500));

        vm.startPrank(trader);
        IERC20(WETH).approve(address(v3Adapter), amountIn);

        uint256 gasBefore = gasleft();
        v3Adapter.swap(WETH, USDC, amountIn, 0, extraData);
        uint256 gasUsed = gasBefore - gasleft();
        vm.stopPrank();

        emit log_named_uint("UniV3 Single-hop Swap Gas", gasUsed);
        assertLt(gasUsed, 300_000, "V3 swap gas too high");
    }

    // ──────────────────────────────────────────────
    // V2 vs V3 Comparison Tests
    // ──────────────────────────────────────────────

    /// @notice Compare V2 vs V3 output for the same WETH -> USDC swap.
    function test_v2VsV3_outputComparison() public {
        if (!forkActive) return;

        uint256 amountIn = 1 ether;

        // V2 quote
        uint256 v2Quote = v2Adapter.getAmountOut(WETH, USDC, amountIn, "");

        // V3 quote (0.05% fee tier — most liquid for WETH/USDC)
        bytes memory v3ExtraData = abi.encode(uint24(500));
        uint256 v3Quote = v3Adapter.getAmountOut(WETH, USDC, amountIn, v3ExtraData);

        emit log_named_uint("V2 WETH->USDC output", v2Quote);
        emit log_named_uint("V3 WETH->USDC output (500 fee)", v3Quote);

        // Both should give valid quotes
        assertGt(v2Quote, 0);
        assertGt(v3Quote, 0);

        // V3 0.05% pool typically has better pricing than V2 0.3%
        // (but this depends on current liquidity, so just verify both work)
    }

    /// @notice Slippage protection works on real V2 pool.
    function test_v2_slippageProtection() public {
        if (!forkActive) return;

        uint256 amountIn = 1 ether;
        _dealToken(WETH, trader, amountIn);

        // Set an impossibly high minimum output
        uint256 impossibleMin = _toTokenUnits(1_000_000, USDC_DECIMALS); // 1M USDC for 1 WETH

        vm.startPrank(trader);
        IERC20(WETH).approve(address(v2Adapter), amountIn);
        vm.expectRevert(); // Router should revert due to slippage
        v2Adapter.swap(WETH, USDC, amountIn, impossibleMin, "");
        vm.stopPrank();
    }

    /// @notice Slippage protection works on real V3 pool.
    function test_v3_slippageProtection() public {
        if (!forkActive) return;

        uint256 amountIn = 1 ether;
        _dealToken(WETH, trader, amountIn);

        uint256 impossibleMin = _toTokenUnits(1_000_000, USDC_DECIMALS);
        bytes memory extraData = abi.encode(uint24(500));

        vm.startPrank(trader);
        IERC20(WETH).approve(address(v3Adapter), amountIn);
        vm.expectRevert(); // Router should revert due to slippage
        v3Adapter.swap(WETH, USDC, amountIn, impossibleMin, extraData);
        vm.stopPrank();
    }
}
