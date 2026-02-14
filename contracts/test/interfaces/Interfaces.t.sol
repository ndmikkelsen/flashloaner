// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IFlashloanExecutor} from "../../src/interfaces/IFlashloanExecutor.sol";
import {IFlashloanReceiver} from "../../src/interfaces/IFlashloanReceiver.sol";
import {IDEXAdapter} from "../../src/interfaces/IDEXAdapter.sol";
import {ICircuitBreaker} from "../../src/interfaces/ICircuitBreaker.sol";
import {IProfitValidator} from "../../src/interfaces/IProfitValidator.sol";

/// @title InterfacesCompilationTest
/// @notice Verifies all core interfaces compile and have expected selectors.
contract InterfacesCompilationTest is Test {
    function test_IFlashloanExecutorCompiles() public pure {
        // Verify function selectors exist (proves interface compiled correctly)
        bytes4 selector = IFlashloanExecutor.executeArbitrage.selector;
        assertTrue(selector != bytes4(0), "executeArbitrage selector should be non-zero");

        selector = IFlashloanExecutor.withdrawToken.selector;
        assertTrue(selector != bytes4(0), "withdrawToken selector should be non-zero");

        selector = IFlashloanExecutor.withdrawETH.selector;
        assertTrue(selector != bytes4(0), "withdrawETH selector should be non-zero");

        selector = IFlashloanExecutor.registerAdapter.selector;
        assertTrue(selector != bytes4(0), "registerAdapter selector should be non-zero");

        selector = IFlashloanExecutor.removeAdapter.selector;
        assertTrue(selector != bytes4(0), "removeAdapter selector should be non-zero");

        selector = IFlashloanExecutor.setBotWallet.selector;
        assertTrue(selector != bytes4(0), "setBotWallet selector should be non-zero");

        selector = IFlashloanExecutor.setMinProfit.selector;
        assertTrue(selector != bytes4(0), "setMinProfit selector should be non-zero");

        selector = IFlashloanExecutor.owner.selector;
        assertTrue(selector != bytes4(0), "owner selector should be non-zero");

        selector = IFlashloanExecutor.botWallet.selector;
        assertTrue(selector != bytes4(0), "botWallet selector should be non-zero");

        selector = IFlashloanExecutor.approvedAdapters.selector;
        assertTrue(selector != bytes4(0), "approvedAdapters selector should be non-zero");

        selector = IFlashloanExecutor.minProfit.selector;
        assertTrue(selector != bytes4(0), "minProfit selector should be non-zero");
    }

    function test_IFlashloanReceiverCompiles() public pure {
        bytes4 selector = IFlashloanReceiver.executeOperation.selector;
        assertTrue(selector != bytes4(0), "executeOperation selector should be non-zero");

        selector = IFlashloanReceiver.receiveFlashLoan.selector;
        assertTrue(selector != bytes4(0), "receiveFlashLoan selector should be non-zero");

        selector = IFlashloanReceiver.uniswapV3FlashCallback.selector;
        assertTrue(selector != bytes4(0), "uniswapV3FlashCallback selector should be non-zero");

        selector = IFlashloanReceiver.callFunction.selector;
        assertTrue(selector != bytes4(0), "callFunction selector should be non-zero");
    }

    function test_IDEXAdapterCompiles() public pure {
        bytes4 selector = IDEXAdapter.swap.selector;
        assertTrue(selector != bytes4(0), "swap selector should be non-zero");

        selector = IDEXAdapter.getAmountOut.selector;
        assertTrue(selector != bytes4(0), "getAmountOut selector should be non-zero");
    }

    function test_ICircuitBreakerCompiles() public pure {
        bytes4 selector = ICircuitBreaker.pause.selector;
        assertTrue(selector != bytes4(0), "pause selector should be non-zero");

        selector = ICircuitBreaker.unpause.selector;
        assertTrue(selector != bytes4(0), "unpause selector should be non-zero");

        selector = ICircuitBreaker.setMaxGasPrice.selector;
        assertTrue(selector != bytes4(0), "setMaxGasPrice selector should be non-zero");

        selector = ICircuitBreaker.setMaxTradeSize.selector;
        assertTrue(selector != bytes4(0), "setMaxTradeSize selector should be non-zero");

        selector = ICircuitBreaker.isWithinLimits.selector;
        assertTrue(selector != bytes4(0), "isWithinLimits selector should be non-zero");

        selector = ICircuitBreaker.paused.selector;
        assertTrue(selector != bytes4(0), "paused selector should be non-zero");

        selector = ICircuitBreaker.maxGasPrice.selector;
        assertTrue(selector != bytes4(0), "maxGasPrice selector should be non-zero");

        selector = ICircuitBreaker.maxTradeSize.selector;
        assertTrue(selector != bytes4(0), "maxTradeSize selector should be non-zero");
    }

    function test_IProfitValidatorCompiles() public pure {
        bytes4 selector = IProfitValidator.validateProfit.selector;
        assertTrue(selector != bytes4(0), "validateProfit selector should be non-zero");
    }
}
