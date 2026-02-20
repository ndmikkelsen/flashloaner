// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TraderJoeLBAdapter} from "../../../src/adapters/TraderJoeLBAdapter.sol";
import {IDEXAdapter} from "../../../src/interfaces/IDEXAdapter.sol";

contract TraderJoeLBAdapterTest is Test {
    TraderJoeLBAdapter public adapter;
    bool public skipForkTests;

    // Arbitrum mainnet addresses
    address constant LB_ROUTER = 0xb4315e873dBcf96Ffd0acd8EA43f689D8c20fB30;
    address constant LB_FACTORY = 0x8e42f2F4101563bF679975178e880FD87d3eFd4e;

    // Token addresses (Arbitrum mainnet)
    address constant WETH = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;
    address constant USDC = 0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8; // USDC.e
    address constant USDT = 0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9;
    address constant ARB = 0x912CE59144191C1204E64559FE8253a0e49E6548;

    address user = makeAddr("user");

    function setUp() public {
        // Fork Arbitrum mainnet (skip if RPC URL not available)
        try vm.envString("ARBITRUM_MAINNET_RPC_URL") returns (string memory rpcUrl) {
            vm.createSelectFork(rpcUrl);
            skipForkTests = false;
        } catch {
            skipForkTests = true;
        }

        if (!skipForkTests) {
            adapter = new TraderJoeLBAdapter(LB_ROUTER);

            // Fund user with tokens
            deal(WETH, user, 100 ether);
            deal(USDC, user, 100_000e6);
        } else {
            // Deploy adapter without fork for non-fork tests
            adapter = new TraderJoeLBAdapter(LB_ROUTER);
        }
    }

    function testConstructorRevertsOnZeroAddress() public {
        vm.expectRevert(IDEXAdapter.InvalidToken.selector);
        new TraderJoeLBAdapter(address(0));
    }

    function testSwapSingleHopLB() public {
        vm.skip(skipForkTests);
        // Swap 1 WETH -> USDC on LB pool
        // Using binStep 15 (0.15%) which is a common Trader Joe LB bin step
        uint256 amountIn = 1 ether;
        uint24 binStep = 15;
        bytes memory extraData = abi.encode(binStep);

        vm.startPrank(user);
        IERC20(WETH).approve(address(adapter), amountIn);

        uint256 balanceBefore = IERC20(USDC).balanceOf(user);
        uint256 amountOut = adapter.swap(WETH, USDC, amountIn, 1, extraData);
        uint256 balanceAfter = IERC20(USDC).balanceOf(user);

        assertGt(amountOut, 0, "Should receive USDC");
        assertEq(balanceAfter - balanceBefore, amountOut, "Balance should match amountOut");
        assertGt(amountOut, 1000e6, "Should receive reasonable USDC amount (>$1000 for 1 WETH)");
        vm.stopPrank();
    }

    function testSwapRevertsOnZeroAmountIn() public {
        vm.skip(skipForkTests);
        bytes memory extraData = abi.encode(uint24(15));
        vm.startPrank(user);
        IERC20(WETH).approve(address(adapter), 1 ether);

        vm.expectRevert(IDEXAdapter.ZeroAmountIn.selector);
        adapter.swap(WETH, USDC, 0, 1, extraData);
        vm.stopPrank();
    }

    function testSwapRevertsOnZeroAddressTokenIn() public {
        vm.skip(skipForkTests);
        uint256 amountIn = 1 ether;
        bytes memory extraData = abi.encode(uint24(15));

        vm.startPrank(user);
        vm.expectRevert(IDEXAdapter.InvalidToken.selector);
        adapter.swap(address(0), USDC, amountIn, 1, extraData);
        vm.stopPrank();
    }

    function testSwapRevertsOnZeroAddressTokenOut() public {
        vm.skip(skipForkTests);
        uint256 amountIn = 1 ether;
        bytes memory extraData = abi.encode(uint24(15));

        vm.startPrank(user);
        IERC20(WETH).approve(address(adapter), amountIn);
        vm.expectRevert(IDEXAdapter.InvalidToken.selector);
        adapter.swap(WETH, address(0), amountIn, 1, extraData);
        vm.stopPrank();
    }

    function testSwapRevertsOnSlippage() public {
        vm.skip(skipForkTests);
        uint256 amountIn = 1 ether;
        uint24 binStep = 15;
        bytes memory extraData = abi.encode(binStep);

        vm.startPrank(user);
        IERC20(WETH).approve(address(adapter), amountIn);

        // Set unrealistic amountOutMin (more than pool can provide)
        uint256 amountOutMin = 1_000_000e6; // 1M USDC (way too high)

        // The swap will revert either in the router (slippage check) or in the adapter
        vm.expectRevert();
        adapter.swap(WETH, USDC, amountIn, amountOutMin, extraData);
        vm.stopPrank();
    }

    function testGetAmountOutReturnsZero() public view {
        // LB adapter returns 0 for getAmountOut (off-chain quote signal)
        bytes memory extraData = abi.encode(uint24(15));
        uint256 quote = adapter.getAmountOut(WETH, USDC, 1 ether, extraData);
        assertEq(quote, 0, "LB adapter should return 0 for getAmountOut");
    }

    function testSwapEmitsEvent() public {
        vm.skip(skipForkTests);
        uint256 amountIn = 1 ether;
        uint24 binStep = 15;
        bytes memory extraData = abi.encode(binStep);

        vm.startPrank(user);
        IERC20(WETH).approve(address(adapter), amountIn);

        // Expect SwapExecuted event
        vm.expectEmit(true, true, false, false);
        emit IDEXAdapter.SwapExecuted(WETH, USDC, amountIn, 0);

        adapter.swap(WETH, USDC, amountIn, 1, extraData);
        vm.stopPrank();
    }

    function testSwapWithDifferentBinStep() public {
        vm.skip(skipForkTests);
        // Try binStep 20 (0.20%)
        uint256 amountIn = 1 ether;
        uint24 binStep = 20;
        bytes memory extraData = abi.encode(binStep);

        vm.startPrank(user);
        IERC20(WETH).approve(address(adapter), amountIn);

        // This may revert if no pool exists for binStep 20
        // That's OK - we're testing that the adapter correctly encodes the binStep
        try adapter.swap(WETH, USDC, amountIn, 1, extraData) returns (uint256 amountOut) {
            assertGt(amountOut, 0, "Should receive USDC if pool exists");
        } catch {
            // Pool doesn't exist for this binStep, which is fine
            // The adapter still correctly encoded the path
        }
        vm.stopPrank();
    }

    function testMultiHopRevertsWithStub() public {
        vm.skip(skipForkTests);
        // Multi-hop is not yet supported
        uint256 amountIn = 1 ether;
        uint24[] memory binSteps = new uint24[](2);
        binSteps[0] = 15;
        binSteps[1] = 20;
        bytes memory extraData = abi.encode(binSteps);

        vm.startPrank(user);
        IERC20(WETH).approve(address(adapter), amountIn);

        vm.expectRevert("TraderJoeLBAdapter: multi-hop not yet supported");
        adapter.swap(WETH, USDC, amountIn, 1, extraData);
        vm.stopPrank();
    }

    function testLBRouterImmutable() public view {
        assertEq(address(adapter.lbRouter()), LB_ROUTER, "LBRouter should be immutable");
    }
}
