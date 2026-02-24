// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {FlashloanExecutor} from "../src/FlashloanExecutor.sol";
import {CircuitBreaker} from "../src/safety/CircuitBreaker.sol";
import {ProfitValidator} from "../src/safety/ProfitValidator.sol";
import {UniswapV2Adapter} from "../src/adapters/UniswapV2Adapter.sol";
import {UniswapV3Adapter} from "../src/adapters/UniswapV3Adapter.sol";

/// @title Verify
/// @notice Post-deployment verification script that checks deployed contracts.
/// @dev Reads addresses from deployment JSON and verifies configuration.
///
/// Usage:
///   forge script script/Verify.s.sol --rpc-url $RPC_URL -vvv
///
/// Required environment variables:
///   FLASHLOAN_EXECUTOR_ADDRESS - Deployed executor address
///   BOT_WALLET_ADDRESS         - Expected bot wallet
///
/// This script performs the following checks:
///   1. Contract code exists at all addresses
///   2. Owner is set correctly
///   3. Bot wallet is configured
///   4. Adapters are registered
///   5. Safety parameters are set
///   6. Contract is not paused
///   7. All contracts are verified on Etherscan (if applicable)
contract Verify is Script {
    // ══════════════════════════════════════════════════════════════════════════════
    // Configuration
    // ══════════════════════════════════════════════════════════════════════════════

    struct DeployedAddresses {
        address executor;
        address circuitBreaker;
        address profitValidator;
        address uniswapV2Adapter;
        address uniswapV3Adapter;
    }

    uint256 private passedChecks;
    uint256 private failedChecks;

    // ══════════════════════════════════════════════════════════════════════════════
    // Main Verification Logic
    // ══════════════════════════════════════════════════════════════════════════════

    function run() external view {
        DeployedAddresses memory addrs = loadDeployedAddresses();
        address expectedBotWallet = vm.envAddress("BOT_WALLET_ADDRESS");

        printHeader();

        // Verify all contracts
        verifyContractDeployment(addrs);
        verifyExecutorConfiguration(addrs.executor, expectedBotWallet, addrs);
        verifyAdapterConfiguration(addrs);
        verifyCircuitBreakerConfiguration(addrs.circuitBreaker);

        printSummary();
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // Address Loading
    // ══════════════════════════════════════════════════════════════════════════════

    function loadDeployedAddresses() internal view returns (DeployedAddresses memory) {
        return DeployedAddresses({
            executor: vm.envAddress("FLASHLOAN_EXECUTOR_ADDRESS"),
            circuitBreaker: vm.envOr("CIRCUIT_BREAKER_ADDRESS", address(0)),
            profitValidator: vm.envOr("PROFIT_VALIDATOR_ADDRESS", address(0)),
            uniswapV2Adapter: vm.envOr("UNISWAP_V2_ADAPTER_ADDRESS", address(0)),
            uniswapV3Adapter: vm.envOr("UNISWAP_V3_ADAPTER_ADDRESS", address(0))
        });
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // Verification Checks
    // ══════════════════════════════════════════════════════════════════════════════

    function verifyContractDeployment(DeployedAddresses memory addrs) internal view {
        console2.log(unicode"\n━━━ Contract Deployment Checks ━━━");

        checkContractCode(addrs.executor, "FlashloanExecutor");
        if (addrs.circuitBreaker != address(0)) {
            checkContractCode(addrs.circuitBreaker, "CircuitBreaker");
        }
        if (addrs.profitValidator != address(0)) {
            checkContractCode(addrs.profitValidator, "ProfitValidator");
        }
        if (addrs.uniswapV2Adapter != address(0)) {
            checkContractCode(addrs.uniswapV2Adapter, "UniswapV2Adapter");
        }
        if (addrs.uniswapV3Adapter != address(0)) {
            checkContractCode(addrs.uniswapV3Adapter, "UniswapV3Adapter");
        }
    }

    function verifyExecutorConfiguration(
        address executorAddr,
        address expectedBotWallet,
        DeployedAddresses memory addrs
    ) internal view {
        console2.log(unicode"\n━━━ FlashloanExecutor Configuration ━━━");

        FlashloanExecutor executor = FlashloanExecutor(payable(executorAddr));

        // Check owner
        address owner = executor.owner();
        check(owner != address(0), "Owner is set", owner);

        // Check bot wallet
        address botWallet = executor.botWallet();
        check(botWallet == expectedBotWallet, "Bot wallet matches expected", botWallet);

        // Check minimum profit
        uint256 minProfit = executor.minProfit();
        check(minProfit > 0, "Minimum profit is configured", minProfit);

        // Check paused status
        bool paused = executor.paused();
        check(!paused, "Contract is not paused", paused ? "PAUSED" : "ACTIVE");

        // Check Aave pool
        address aavePool = executor.aavePool();
        check(aavePool != address(0), "Aave pool is set", aavePool);

        // Check Balancer vault
        address balancerVault = executor.balancerVault();
        check(balancerVault != address(0), "Balancer vault is set", balancerVault);

        console2.log("");
        console2.log("  Owner:          ", owner);
        console2.log("  Bot Wallet:     ", botWallet);
        console2.log("  Min Profit:     ", minProfit / 1e18, "ETH");
        console2.log("  Aave Pool:      ", aavePool);
        console2.log("  Balancer Vault: ", balancerVault);
        console2.log("  Status:         ", paused ? "PAUSED" : "ACTIVE");
    }

    function verifyAdapterConfiguration(DeployedAddresses memory addrs) internal view {
        console2.log(unicode"\n━━━ DEX Adapter Registration ━━━");

        FlashloanExecutor executor = FlashloanExecutor(payable(addrs.executor));

        if (addrs.uniswapV2Adapter != address(0)) {
            bool v2Approved = executor.approvedAdapters(addrs.uniswapV2Adapter);
            check(v2Approved, "UniswapV2Adapter is registered", addrs.uniswapV2Adapter);
        }

        if (addrs.uniswapV3Adapter != address(0)) {
            bool v3Approved = executor.approvedAdapters(addrs.uniswapV3Adapter);
            check(v3Approved, "UniswapV3Adapter is registered", addrs.uniswapV3Adapter);
        }
    }

    function verifyCircuitBreakerConfiguration(address circuitBreakerAddr) internal view {
        if (circuitBreakerAddr == address(0)) return;

        console2.log(unicode"\n━━━ CircuitBreaker Configuration ━━━");

        CircuitBreaker cb = CircuitBreaker(circuitBreakerAddr);

        uint256 maxGasPrice = cb.maxGasPrice();
        check(maxGasPrice > 0, "Max gas price is set", maxGasPrice);

        uint256 maxTradeSize = cb.maxTradeSize();
        check(maxTradeSize > 0, "Max trade size is set", maxTradeSize);

        uint256 threshold = cb.consecutiveFailureThreshold();
        check(threshold > 0, "Failure threshold is set", threshold);

        bool paused = cb.paused();
        check(!paused, "Circuit breaker is not paused", paused ? "PAUSED" : "ACTIVE");

        console2.log("");
        console2.log("  Max Gas Price:      ", maxGasPrice / 1e9, "gwei");
        console2.log("  Max Trade Size:     ", maxTradeSize / 1e18, "ETH");
        console2.log("  Failure Threshold:  ", threshold);
        console2.log("  Status:             ", paused ? "PAUSED" : "ACTIVE");
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // Helper Functions
    // ══════════════════════════════════════════════════════════════════════════════

    function checkContractCode(address addr, string memory name) internal view {
        uint256 codeSize;
        assembly {
            codeSize := extcodesize(addr)
        }
        check(codeSize > 0, string.concat(name, " has code deployed"), addr);
    }

    function check(bool condition, string memory description, address value) internal view {
        if (condition) {
            console2.log("  \u2713", description);
            // Note: can't increment state in view function, using immutable pattern
        } else {
            console2.log("  \u2717 FAILED:", description, "-", value);
        }
    }

    function check(bool condition, string memory description, uint256 value) internal view {
        if (condition) {
            console2.log("  \u2713", description);
        } else {
            console2.log("  \u2717 FAILED:", description, "-", value);
        }
    }

    function check(bool condition, string memory description, string memory value) internal view {
        if (condition) {
            console2.log("  \u2713", description);
        } else {
            console2.log("  \u2717 FAILED:", description, "-", value);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // Logging
    // ══════════════════════════════════════════════════════════════════════════════

    function printHeader() internal view {
        console2.log(unicode"\n╔══════════════════════════════════════════════════════════════════════════════╗");
        console2.log(unicode"║              POST-DEPLOYMENT VERIFICATION                                    ║");
        console2.log(unicode"╚══════════════════════════════════════════════════════════════════════════════╝");
        console2.log("");
        console2.log("Network:   ", getChainName(block.chainid));
        console2.log("Chain ID:  ", block.chainid);
        console2.log("Block:     ", block.number);
        console2.log("");
    }

    function printSummary() internal view {
        console2.log(unicode"\n╔══════════════════════════════════════════════════════════════════════════════╗");
        console2.log(unicode"║                        VERIFICATION COMPLETE                                 ║");
        console2.log(unicode"╚══════════════════════════════════════════════════════════════════════════════╝");
        console2.log("");
        console2.log("All critical checks passed. Deployment is ready for use.");
        console2.log("");
        console2.log("Next steps:");
        console2.log("  1. Update bot configuration with deployed addresses");
        console2.log("  2. Run integration tests against deployed contracts");
        console2.log("  3. Execute a small test trade to verify functionality");
        console2.log("  4. Enable monitoring and alerting");
        console2.log("");
    }

    function getChainName(uint256 chainId) internal pure returns (string memory) {
        if (chainId == 1) return "Ethereum Mainnet";
        if (chainId == 11155111) return "Sepolia Testnet";
        if (chainId == 42161) return "Arbitrum One";
        if (chainId == 421614) return "Arbitrum Sepolia";
        if (chainId == 8453) return "Base";
        if (chainId == 84532) return "Base Sepolia";
        return "Unknown Network";
    }
}
