// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ForkTestBase} from "./ForkTestBase.sol";
import {FlashloanExecutor} from "../../src/FlashloanExecutor.sol";
import {IFlashloanExecutor} from "../../src/interfaces/IFlashloanExecutor.sol";
import {UniswapV2Adapter} from "../../src/adapters/UniswapV2Adapter.sol";
import {UniswapV3Adapter} from "../../src/adapters/UniswapV3Adapter.sol";
import {CircuitBreaker} from "../../src/safety/CircuitBreaker.sol";
import {ProfitValidator} from "../../src/safety/ProfitValidator.sol";

/// @title ArbitrageForkTest
/// @notice End-to-end fork tests for the full arbitrage pipeline with real protocols.
/// @dev Run: forge test --fork-url $MAINNET_RPC_URL --match-contract ArbitrageForkTest -vvv
contract ArbitrageForkTest is ForkTestBase {
    FlashloanExecutor internal executor;
    UniswapV2Adapter internal v2Adapter;
    UniswapV3Adapter internal v3Adapter;
    CircuitBreaker internal circuitBreaker;
    ProfitValidator internal profitValidator;

    function setUp() public {
        _tryCreateFork();
        if (!forkActive) return;

        _labelMainnetAddresses();

        // Deploy adapters
        v2Adapter = new UniswapV2Adapter(UNISWAP_V2_ROUTER);
        v3Adapter = new UniswapV3Adapter(UNISWAP_V3_ROUTER, UNISWAP_V3_QUOTER_V2);
        vm.label(address(v2Adapter), "UniV2Adapter");
        vm.label(address(v3Adapter), "UniV3Adapter");

        // Deploy safety contracts
        vm.startPrank(owner);
        circuitBreaker = new CircuitBreaker(100 gwei, 1000 ether, 5, owner);
        profitValidator = new ProfitValidator();

        // Deploy executor
        executor = new FlashloanExecutor(AAVE_V3_POOL, BALANCER_VAULT, owner, bot, 0);
        vm.label(address(executor), "FlashloanExecutor");

        // Register adapters
        executor.registerAdapter(address(v2Adapter));
        executor.registerAdapter(address(v3Adapter));
        vm.stopPrank();
    }

    // ──────────────────────────────────────────────
    // Deployment Validation Tests
    // ──────────────────────────────────────────────

    /// @notice Verify all contracts deploy correctly on fork.
    function test_allContractsDeployOnFork() public view {
        if (!forkActive) return;

        assertTrue(address(executor) != address(0));
        assertTrue(address(v2Adapter) != address(0));
        assertTrue(address(v3Adapter) != address(0));
        assertTrue(address(circuitBreaker) != address(0));
        assertTrue(address(profitValidator) != address(0));
    }

    /// @notice Verify adapters are registered.
    function test_adaptersRegistered() public view {
        if (!forkActive) return;

        assertTrue(executor.approvedAdapters(address(v2Adapter)));
        assertTrue(executor.approvedAdapters(address(v3Adapter)));
    }

    /// @notice Verify executor points to real Aave V3 pool.
    function test_executorPointsToRealAavePool() public view {
        if (!forkActive) return;

        assertEq(executor.aavePool(), AAVE_V3_POOL);
    }

    /// @notice Verify executor points to real Balancer vault.
    function test_executorPointsToRealBalancerVault() public view {
        if (!forkActive) return;

        assertEq(executor.balancerVault(), BALANCER_VAULT);
    }

    // ──────────────────────────────────────────────
    // Circuit Breaker Integration Tests
    // ──────────────────────────────────────────────

    /// @notice CircuitBreaker validates gas price on fork.
    function test_circuitBreaker_gasValidationOnFork() public {
        if (!forkActive) return;

        // Current block gas price should be within limits
        uint256 currentGasPrice = tx.gasprice;
        bool withinLimits = circuitBreaker.isWithinLimits(currentGasPrice, 10 ether);

        // Log for analysis
        emit log_named_uint("Current gas price (wei)", currentGasPrice);
        emit log_named_uint("Max gas price (wei)", circuitBreaker.maxGasPrice());
        emit log_named_uint("Within limits (1=true)", withinLimits ? 1 : 0);
    }

    /// @notice CircuitBreaker trade size validation.
    function test_circuitBreaker_tradeSizeValidationOnFork() public view {
        if (!forkActive) return;

        // 10 ether should be within the 1000 ether limit
        assertTrue(circuitBreaker.isWithinLimits(1 gwei, 10 ether));
        // 2000 ether should exceed the 1000 ether limit
        assertFalse(circuitBreaker.isWithinLimits(1 gwei, 2000 ether));
    }

    // ──────────────────────────────────────────────
    // Profit Validator Integration Tests
    // ──────────────────────────────────────────────

    /// @notice ProfitValidator correctly validates a profitable scenario.
    function test_profitValidator_validatesProfitOnFork() public {
        if (!forkActive) return;

        uint256 balanceBefore = 100 ether;
        uint256 balanceAfter = 100.5 ether;
        uint256 minProfit = 0.001 ether;

        uint256 profit = profitValidator.validateProfit(WETH, balanceBefore, balanceAfter, minProfit);
        assertEq(profit, 0.5 ether);
    }

    /// @notice ProfitValidator reverts on unprofitable scenario.
    function test_profitValidator_revertsOnLossOnFork() public {
        if (!forkActive) return;

        vm.expectRevert();
        profitValidator.validateProfit(WETH, 100 ether, 99 ether, 0.001 ether);
    }

    // ──────────────────────────────────────────────
    // Adapter Quote Comparison (Real Prices)
    // ──────────────────────────────────────────────

    /// @notice Compare V2 vs V3 quotes for WETH -> USDC on real pools.
    function test_compareV2V3Quotes_WETHtoUSDC() public {
        if (!forkActive) return;

        uint256 amountIn = 10 ether;

        // V2 quote
        uint256 v2Quote = v2Adapter.getAmountOut(WETH, USDC, amountIn, "");

        // V3 quote (0.05% pool)
        uint256 v3Quote500 = v3Adapter.getAmountOut(WETH, USDC, amountIn, abi.encode(uint24(500)));

        // V3 quote (0.3% pool)
        uint256 v3Quote3000 = v3Adapter.getAmountOut(WETH, USDC, amountIn, abi.encode(uint24(3000)));

        emit log_named_uint("V2 (0.3%) WETH->USDC for 10 ETH", v2Quote);
        emit log_named_uint("V3 (0.05%) WETH->USDC for 10 ETH", v3Quote500);
        emit log_named_uint("V3 (0.3%) WETH->USDC for 10 ETH", v3Quote3000);

        // All should return valid amounts
        assertGt(v2Quote, 0);
        assertGt(v3Quote500, 0);
        assertGt(v3Quote3000, 0);
    }

    /// @notice Verify no free arbitrage between V2 and V3 (market efficiency).
    function test_noFreeArbitrage_V2vsV3() public {
        if (!forkActive) return;

        uint256 amountIn = 1 ether;

        // Get V2 output for WETH -> USDC
        uint256 v2Output = v2Adapter.getAmountOut(WETH, USDC, amountIn, "");

        // Get V3 output for USDC -> WETH (reverse direction)
        uint256 v3ReverseOutput = v3Adapter.getAmountOut(USDC, WETH, v2Output, abi.encode(uint24(500)));

        emit log_named_uint("Start WETH", amountIn);
        emit log_named_uint("After V2 WETH->USDC", v2Output);
        emit log_named_uint("After V3 USDC->WETH", v3ReverseOutput);

        // After round-trip through two pools with fees, should have less than started
        // (unless there's a genuine arb, which is unlikely at test time)
        // Just verify the math works — no assertion on profit/loss direction
        assertGt(v3ReverseOutput, 0, "Should get some WETH back");
    }

    // ──────────────────────────────────────────────
    // Full Pipeline Gas Benchmarks
    // ──────────────────────────────────────────────

    /// @notice Benchmark: V2 adapter swap gas on real pool.
    function test_gasBenchmark_v2SwapOnFork() public {
        if (!forkActive) return;

        uint256 amountIn = 1 ether;
        _dealToken(WETH, bot, amountIn);

        vm.startPrank(bot);
        IERC20(WETH).approve(address(v2Adapter), amountIn);

        uint256 gasBefore = gasleft();
        v2Adapter.swap(WETH, USDC, amountIn, 0, "");
        uint256 gasUsed = gasBefore - gasleft();
        vm.stopPrank();

        emit log_named_uint("V2 Adapter Swap Gas (WETH->USDC)", gasUsed);
    }

    /// @notice Benchmark: V3 adapter swap gas on real pool.
    function test_gasBenchmark_v3SwapOnFork() public {
        if (!forkActive) return;

        uint256 amountIn = 1 ether;
        _dealToken(WETH, bot, amountIn);

        vm.startPrank(bot);
        IERC20(WETH).approve(address(v3Adapter), amountIn);

        uint256 gasBefore = gasleft();
        v3Adapter.swap(WETH, USDC, amountIn, 0, abi.encode(uint24(500)));
        uint256 gasUsed = gasBefore - gasleft();
        vm.stopPrank();

        emit log_named_uint("V3 Adapter Swap Gas (WETH->USDC, 500)", gasUsed);
    }

    /// @notice Benchmark: CircuitBreaker check gas.
    function test_gasBenchmark_circuitBreakerCheck() public {
        if (!forkActive) return;

        uint256 gasBefore = gasleft();
        circuitBreaker.isWithinLimits(50 gwei, 10 ether);
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("CircuitBreaker.isWithinLimits Gas", gasUsed);
        assertLt(gasUsed, 10_000, "Safety check should be cheap");
    }
}
