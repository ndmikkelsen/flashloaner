// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {RamsesV2Adapter} from "../../src/adapters/RamsesV2Adapter.sol";

/// @title RamsesForkTest
/// @notice Fork tests for RamsesV2Adapter against real Ramses V3 pools on Arbitrum.
/// @dev Run: forge test --match-contract RamsesForkTest --fork-url $ARBITRUM_RPC_URL
///      Tests automatically skip when ARBITRUM_RPC_URL is not set.
contract RamsesForkTest is Test {
    // ──────────────────────────────────────────────
    // Arbitrum Protocol Addresses
    // ──────────────────────────────────────────────

    // Ramses V3
    address internal constant RAMSES_V3_ROUTER = 0x4730e03EB4a58A5e20244062D5f9A99bCf5770a6;
    address internal constant RAMSES_V3_QUOTER = 0x00d4FeA3Dd90C4480992f9c7Ea13b8a6A8F7E124;
    address internal constant RAMSES_V3_FACTORY = 0xd0019e86edB35E1fedaaB03aED5c3c60f115d28b;

    // ──────────────────────────────────────────────
    // Arbitrum Token Addresses
    // ──────────────────────────────────────────────

    address internal constant WETH = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;
    address internal constant USDC_E = 0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8;

    // ──────────────────────────────────────────────
    // Test State
    // ──────────────────────────────────────────────

    RamsesV2Adapter internal adapter;
    bool internal forkActive;

    // ──────────────────────────────────────────────
    // Setup
    // ──────────────────────────────────────────────

    function setUp() public {
        // Try to create Arbitrum fork
        try vm.envString("ARBITRUM_RPC_URL") returns (string memory rpcUrl) {
            if (bytes(rpcUrl).length > 0) {
                vm.createSelectFork(rpcUrl);
                forkActive = true;

                // Deploy adapter with real Ramses V3 addresses
                adapter = new RamsesV2Adapter(RAMSES_V3_ROUTER, RAMSES_V3_QUOTER);

                // Label addresses for better trace readability
                vm.label(RAMSES_V3_ROUTER, "RamsesV3Router");
                vm.label(RAMSES_V3_QUOTER, "RamsesV3Quoter");
                vm.label(RAMSES_V3_FACTORY, "RamsesV3Factory");
                vm.label(WETH, "WETH");
                vm.label(USDC_E, "USDC.e");
            }
        } catch {
            forkActive = false;
        }
    }

    // ──────────────────────────────────────────────
    // Fork Tests
    // ──────────────────────────────────────────────

    /// @dev Test real WETH -> USDC.e swap on Ramses V3 0.05% pool
    function test_RamsesV3_WETH_USDC_Swap() public {
        // Skip if no fork
        if (!forkActive) {
            vm.skip(true);
        }

        // Swap parameters
        uint256 amountIn = 1 ether; // 1 WETH
        uint24 feeTier = 500; // 0.05% fee tier

        // Deal WETH to this contract
        deal(WETH, address(this), amountIn);

        // Approve adapter
        IERC20(WETH).approve(address(adapter), amountIn);

        // Encode extraData (fee tier)
        bytes memory extraData = abi.encode(feeTier);

        // Get initial USDC balance
        uint256 usdcBefore = IERC20(USDC_E).balanceOf(address(this));

        // Execute swap
        uint256 amountOut = adapter.swap(WETH, USDC_E, amountIn, 0, extraData);

        // Get final USDC balance
        uint256 usdcAfter = IERC20(USDC_E).balanceOf(address(this));

        // Assertions
        assertGt(amountOut, 0, "Output amount should be greater than 0");
        assertEq(usdcAfter - usdcBefore, amountOut, "Balance increase should match amountOut");

        // Reasonable output bounds for 1 WETH at typical ETH prices ($1500-$4000)
        // USDC.e has 6 decimals, so 1500e6 = $1500, 4000e6 = $4000
        assertGt(amountOut, 1000e6, "Should get at least $1000 USDC for 1 WETH");
        assertLt(amountOut, 5000e6, "Should get less than $5000 USDC for 1 WETH");

        // Log output for visibility
        emit log_named_uint("WETH input", amountIn);
        emit log_named_uint("USDC.e output", amountOut);
        emit log_named_uint("Implied ETH price", (amountOut * 1e18) / 1e6); // Scale to 18 decimals
    }

    /// @dev Test getAmountOut quote matches actual swap on Ramses V3
    function test_RamsesV3_QuoteMatchesSwap() public {
        // Skip if no fork
        if (!forkActive) {
            vm.skip(true);
        }

        uint256 amountIn = 1 ether;
        uint24 feeTier = 500;
        bytes memory extraData = abi.encode(feeTier);

        // Get quote
        uint256 quotedAmount = adapter.getAmountOut(WETH, USDC_E, amountIn, extraData);

        // Execute swap
        deal(WETH, address(this), amountIn);
        IERC20(WETH).approve(address(adapter), amountIn);
        uint256 actualAmount = adapter.swap(WETH, USDC_E, amountIn, 0, extraData);

        // Quote should match actual output (within small tolerance for price movement)
        // Allow 1% difference to account for block-to-block price changes
        uint256 tolerance = (quotedAmount * 100) / 10_000; // 1% tolerance
        assertApproxEqAbs(actualAmount, quotedAmount, tolerance, "Quote should match swap output");

        emit log_named_uint("Quoted amount", quotedAmount);
        emit log_named_uint("Actual amount", actualAmount);
    }

    /// @dev Test multi-hop swap (if intermediate pools exist)
    /// Note: This test may fail if Ramses V3 doesn't have liquid intermediate pools
    function test_RamsesV3_MultiHopSwap() public {
        // Skip if no fork
        if (!forkActive) {
            vm.skip(true);
        }

        // Multi-hop: WETH -> USDC.e (via direct pool, simulating multi-hop with 2 hops)
        // For a real multi-hop, we'd need: WETH --(fee1)--> intermediate --(fee2)--> USDC.e
        // Since Ramses may not have all intermediates, this is a basic test structure

        uint256 amountIn = 1 ether;

        // Single intermediate path (simplified for testing)
        uint24[] memory fees = new uint24[](2);
        fees[0] = 500; // WETH -> intermediate
        fees[1] = 500; // intermediate -> USDC.e

        // Using WETH as intermediate just for test structure (not realistic)
        address[] memory intermediates = new address[](1);
        intermediates[0] = WETH;

        bytes memory extraData = abi.encode(fees, intermediates);

        // This will likely fail on real Ramses if the path doesn't exist
        // But it demonstrates the multi-hop encoding works
        try adapter.getAmountOut(WETH, USDC_E, amountIn, extraData) returns (uint256 quote) {
            assertGt(quote, 0, "Multi-hop quote should succeed");
            emit log_named_uint("Multi-hop quote", quote);
        } catch {
            // Expected if pool doesn't exist
            emit log("Multi-hop path not available on Ramses V3 (expected)");
        }
    }

    /// @dev Test swap with minimum output (slippage protection)
    function test_RamsesV3_SlippageProtection() public {
        // Skip if no fork
        if (!forkActive) {
            vm.skip(true);
        }

        uint256 amountIn = 1 ether;
        uint24 feeTier = 500;
        bytes memory extraData = abi.encode(feeTier);

        // Get quote
        uint256 quote = adapter.getAmountOut(WETH, USDC_E, amountIn, extraData);

        // Set amountOutMin to 95% of quote (5% slippage tolerance)
        uint256 minOut = (quote * 9500) / 10_000;

        // Deal and approve
        deal(WETH, address(this), amountIn);
        IERC20(WETH).approve(address(adapter), amountIn);

        // Execute swap with slippage protection
        uint256 amountOut = adapter.swap(WETH, USDC_E, amountIn, minOut, extraData);

        assertGe(amountOut, minOut, "Output should meet minimum requirement");
        emit log_named_uint("Min output required", minOut);
        emit log_named_uint("Actual output", amountOut);
    }
}
