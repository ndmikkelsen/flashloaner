// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {FlashloanExecutor} from "../src/FlashloanExecutor.sol";
import {CircuitBreaker} from "../src/safety/CircuitBreaker.sol";
import {ProfitValidator} from "../src/safety/ProfitValidator.sol";
import {UniswapV2Adapter} from "../src/adapters/UniswapV2Adapter.sol";
import {UniswapV3Adapter} from "../src/adapters/UniswapV3Adapter.sol";
import {TraderJoeLBAdapter} from "../src/adapters/TraderJoeLBAdapter.sol";

/// @title Deploy
/// @notice Production deployment script for the flashloan arbitrage system.
/// @dev Deploys all contracts, configures permissions, and exports addresses to JSON.
///
/// Usage:
///   Dry run (fork):   forge script script/Deploy.s.sol --fork-url $RPC_URL -vvv
///   Deploy testnet:   forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast --verify
///   Deploy mainnet:   forge script script/Deploy.s.sol --rpc-url $ETH_RPC_URL --broadcast --verify --slow
///
/// Required environment variables:
///   DEPLOYER_PRIVATE_KEY  - Private key for deploying contracts
///   BOT_WALLET_ADDRESS    - Address authorized to execute arbitrage
///   AAVE_V3_POOL          - Aave V3 Pool address for this chain
///   BALANCER_VAULT        - Balancer Vault address for this chain
///   UNISWAP_V2_ROUTER     - Uniswap V2 Router address
///   UNISWAP_V3_ROUTER     - Uniswap V3 SwapRouter address
///   UNISWAP_V3_QUOTER     - Uniswap V3 QuoterV2 address
///
/// Optional environment variables (for additional DEX adapters):
///   SUSHISWAP_V2_ROUTER   - SushiSwap V2 Router address (deploys UniswapV2Adapter with Sushi router)
///   SUSHISWAP_V3_ROUTER   - SushiSwap V3 SwapRouter address (deploys UniswapV3Adapter with Sushi V3 router)
///   SUSHISWAP_V3_QUOTER   - SushiSwap V3 QuoterV2 address
///   TRADERJOE_LB_ROUTER   - Trader Joe LBRouter V2.1 address
///
/// Optional environment variables (with defaults):
///   MIN_PROFIT_WEI        - Minimum profit threshold (default: 0.01 ether)
///   MAX_GAS_PRICE         - Maximum gas price (default: 100 gwei)
///   MAX_TRADE_SIZE        - Maximum trade size (default: 1000 ether)
///   FAILURE_THRESHOLD     - Consecutive failures before auto-pause (default: 5)
contract Deploy is Script {
    // ══════════════════════════════════════════════════════════════════════════════
    // Configuration
    // ══════════════════════════════════════════════════════════════════════════════

    struct ChainConfig {
        uint256 chainId;
        string name;
        address aavePool;
        address balancerVault;
        address uniswapV2Router;
        address uniswapV3Router;
        address uniswapV3Quoter;
        // Optional additional DEX routers (zero address = skip deployment)
        address sushiswapV2Router;
        address sushiswapV3Router;
        address sushiswapV3Quoter;
        address traderjoeLBRouter;
    }

    struct DeploymentConfig {
        address botWallet;
        uint256 minProfit;
        uint256 maxGasPrice;
        uint256 maxTradeSize;
        uint256 failureThreshold;
    }

    struct DeployedContracts {
        FlashloanExecutor executor;
        CircuitBreaker circuitBreaker;
        ProfitValidator profitValidator;
        UniswapV2Adapter uniswapV2Adapter;
        UniswapV3Adapter uniswapV3Adapter;
        // Optional additional adapters (address(0) if not deployed)
        UniswapV2Adapter sushiswapV2Adapter;
        UniswapV3Adapter sushiswapV3Adapter;
        TraderJoeLBAdapter traderjoeLBAdapter;
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // Main Deployment Logic
    // ══════════════════════════════════════════════════════════════════════════════

    function run() external {
        // Load configuration
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        ChainConfig memory chain = loadChainConfig();
        DeploymentConfig memory config = loadDeploymentConfig();

        // Validation
        validateConfiguration(deployer, chain, config);

        // Print pre-deployment summary
        printPreDeploymentSummary(deployer, chain, config);

        // Deploy all contracts
        vm.startBroadcast(deployerPrivateKey);
        DeployedContracts memory contracts = deployAllContracts(deployer, chain, config);
        vm.stopBroadcast();

        // Print post-deployment summary
        printPostDeploymentSummary(chain, contracts);

        // Export addresses to JSON
        exportDeploymentAddresses(chain, contracts);
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // Configuration Loading
    // ══════════════════════════════════════════════════════════════════════════════

    function loadChainConfig() internal view returns (ChainConfig memory) {
        uint256 chainId = block.chainid;

        // Load from environment variables (supports any chain)
        ChainConfig memory config = ChainConfig({
            chainId: chainId,
            name: getChainName(chainId),
            aavePool: vm.envAddress("AAVE_V3_POOL"),
            balancerVault: vm.envAddress("BALANCER_VAULT"),
            uniswapV2Router: vm.envAddress("UNISWAP_V2_ROUTER"),
            uniswapV3Router: vm.envAddress("UNISWAP_V3_ROUTER"),
            uniswapV3Quoter: vm.envAddress("UNISWAP_V3_QUOTER"),
            sushiswapV2Router: vm.envOr("SUSHISWAP_V2_ROUTER", address(0)),
            sushiswapV3Router: vm.envOr("SUSHISWAP_V3_ROUTER", address(0)),
            sushiswapV3Quoter: vm.envOr("SUSHISWAP_V3_QUOTER", address(0)),
            traderjoeLBRouter: vm.envOr("TRADERJOE_LB_ROUTER", address(0))
        });

        return config;
    }

    function loadDeploymentConfig() internal view returns (DeploymentConfig memory) {
        return DeploymentConfig({
            botWallet: vm.envAddress("BOT_WALLET_ADDRESS"),
            minProfit: vm.envOr("MIN_PROFIT_WEI", uint256(0.01 ether)),
            maxGasPrice: vm.envOr("MAX_GAS_PRICE", uint256(100 gwei)),
            maxTradeSize: vm.envOr("MAX_TRADE_SIZE", uint256(1000 ether)),
            failureThreshold: vm.envOr("FAILURE_THRESHOLD", uint256(5))
        });
    }

    function getChainName(uint256 chainId) internal pure returns (string memory) {
        if (chainId == 1) return "mainnet";
        if (chainId == 11155111) return "sepolia";
        if (chainId == 42161) return "arbitrum";
        if (chainId == 421614) return "arbitrum-sepolia";
        if (chainId == 8453) return "base";
        if (chainId == 84532) return "base-sepolia";
        return "unknown";
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // Deployment Functions
    // ══════════════════════════════════════════════════════════════════════════════

    function deployAllContracts(
        address deployer,
        ChainConfig memory chain,
        DeploymentConfig memory config
    ) internal returns (DeployedContracts memory) {
        console2.log(unicode"\n━━━ Step 1: Deploy Safety Contracts ━━━");

        CircuitBreaker circuitBreaker = new CircuitBreaker(
            config.maxGasPrice,
            config.maxTradeSize,
            config.failureThreshold,
            deployer
        );
        console2.log(unicode"✓ CircuitBreaker deployed:", address(circuitBreaker));

        ProfitValidator profitValidator = new ProfitValidator();
        console2.log(unicode"✓ ProfitValidator deployed:", address(profitValidator));

        console2.log(unicode"\n━━━ Step 2: Deploy FlashloanExecutor ━━━");

        FlashloanExecutor executor = new FlashloanExecutor(
            chain.aavePool,
            chain.balancerVault,
            deployer,
            config.botWallet,
            config.minProfit
        );
        console2.log(unicode"✓ FlashloanExecutor deployed:", address(executor));

        console2.log(unicode"\n━━━ Step 3: Deploy Core DEX Adapters ━━━");

        UniswapV2Adapter uniswapV2Adapter = new UniswapV2Adapter(chain.uniswapV2Router);
        console2.log(unicode"✓ UniswapV2Adapter deployed:", address(uniswapV2Adapter));

        UniswapV3Adapter uniswapV3Adapter = new UniswapV3Adapter(
            chain.uniswapV3Router,
            chain.uniswapV3Quoter
        );
        console2.log(unicode"✓ UniswapV3Adapter deployed:", address(uniswapV3Adapter));

        console2.log(unicode"\n━━━ Step 3b: Deploy Optional DEX Adapters ━━━");

        // SushiSwap V2: reuses UniswapV2Adapter with SushiSwap router
        UniswapV2Adapter sushiswapV2Adapter;
        if (chain.sushiswapV2Router != address(0)) {
            sushiswapV2Adapter = new UniswapV2Adapter(chain.sushiswapV2Router);
            console2.log(unicode"✓ SushiSwapV2Adapter deployed:", address(sushiswapV2Adapter));
        } else {
            console2.log(unicode"⊘ SushiSwapV2Adapter skipped (SUSHISWAP_V2_ROUTER not set)");
        }

        // SushiSwap V3: reuses UniswapV3Adapter with SushiSwap V3 router
        UniswapV3Adapter sushiswapV3Adapter;
        if (chain.sushiswapV3Router != address(0)) {
            sushiswapV3Adapter = new UniswapV3Adapter(chain.sushiswapV3Router, chain.sushiswapV3Quoter);
            console2.log(unicode"✓ SushiSwapV3Adapter deployed:", address(sushiswapV3Adapter));
        } else {
            console2.log(unicode"⊘ SushiSwapV3Adapter skipped (SUSHISWAP_V3_ROUTER not set)");
        }

        // Trader Joe LB: dedicated adapter for Liquidity Book pools
        TraderJoeLBAdapter traderjoeLBAdapter;
        if (chain.traderjoeLBRouter != address(0)) {
            traderjoeLBAdapter = new TraderJoeLBAdapter(chain.traderjoeLBRouter);
            console2.log(unicode"✓ TraderJoeLBAdapter deployed:", address(traderjoeLBAdapter));
        } else {
            console2.log(unicode"⊘ TraderJoeLBAdapter skipped (TRADERJOE_LB_ROUTER not set)");
        }

        console2.log(unicode"\n━━━ Step 4: Register Adapters ━━━");

        executor.registerAdapter(address(uniswapV2Adapter));
        console2.log(unicode"✓ Registered UniswapV2Adapter");

        executor.registerAdapter(address(uniswapV3Adapter));
        console2.log(unicode"✓ Registered UniswapV3Adapter");

        if (address(sushiswapV2Adapter) != address(0)) {
            executor.registerAdapter(address(sushiswapV2Adapter));
            console2.log(unicode"✓ Registered SushiSwapV2Adapter");
        }

        if (address(sushiswapV3Adapter) != address(0)) {
            executor.registerAdapter(address(sushiswapV3Adapter));
            console2.log(unicode"✓ Registered SushiSwapV3Adapter");
        }

        if (address(traderjoeLBAdapter) != address(0)) {
            executor.registerAdapter(address(traderjoeLBAdapter));
            console2.log(unicode"✓ Registered TraderJoeLBAdapter");
        }

        console2.log(unicode"\n━━━ Step 5: Verify Configuration ━━━");

        require(executor.owner() == deployer, "Deploy: Executor owner mismatch");
        require(executor.botWallet() == config.botWallet, "Deploy: Bot wallet mismatch");
        require(executor.minProfit() == config.minProfit, "Deploy: Min profit mismatch");
        require(executor.approvedAdapters(address(uniswapV2Adapter)), "Deploy: V2 adapter not approved");
        require(executor.approvedAdapters(address(uniswapV3Adapter)), "Deploy: V3 adapter not approved");
        require(!executor.paused(), "Deploy: Executor should not be paused");
        console2.log(unicode"✓ All configuration checks passed");

        return DeployedContracts({
            executor: executor,
            circuitBreaker: circuitBreaker,
            profitValidator: profitValidator,
            uniswapV2Adapter: uniswapV2Adapter,
            uniswapV3Adapter: uniswapV3Adapter,
            sushiswapV2Adapter: sushiswapV2Adapter,
            sushiswapV3Adapter: sushiswapV3Adapter,
            traderjoeLBAdapter: traderjoeLBAdapter
        });
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // Validation
    // ══════════════════════════════════════════════════════════════════════════════

    function validateConfiguration(
        address deployer,
        ChainConfig memory chain,
        DeploymentConfig memory config
    ) internal pure {
        require(deployer != address(0), "Deploy: Invalid deployer address");
        require(config.botWallet != address(0), "Deploy: BOT_WALLET_ADDRESS not set");
        require(chain.aavePool != address(0), "Deploy: AAVE_V3_POOL not set");
        require(chain.balancerVault != address(0), "Deploy: BALANCER_VAULT not set");
        require(chain.uniswapV2Router != address(0), "Deploy: UNISWAP_V2_ROUTER not set");
        require(chain.uniswapV3Router != address(0), "Deploy: UNISWAP_V3_ROUTER not set");
        require(chain.uniswapV3Quoter != address(0), "Deploy: UNISWAP_V3_QUOTER not set");
        require(config.minProfit > 0, "Deploy: MIN_PROFIT_WEI must be > 0");
        require(config.maxGasPrice > 0, "Deploy: MAX_GAS_PRICE must be > 0");
        require(config.maxTradeSize > 0, "Deploy: MAX_TRADE_SIZE must be > 0");
        require(config.failureThreshold > 0, "Deploy: FAILURE_THRESHOLD must be > 0");
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // Logging
    // ══════════════════════════════════════════════════════════════════════════════

    function printPreDeploymentSummary(
        address deployer,
        ChainConfig memory chain,
        DeploymentConfig memory config
    ) internal view {
        console2.log(unicode"\n╔══════════════════════════════════════════════════════════════════════════════╗");
        console2.log(unicode"║           FLASHLOAN ARBITRAGE BOT - DEPLOYMENT CONFIGURATION                ║");
        console2.log(unicode"╚══════════════════════════════════════════════════════════════════════════════╝");
        console2.log("");
        console2.log("Network Information:");
        console2.log("  Chain ID:      ", chain.chainId);
        console2.log("  Network:       ", chain.name);
        console2.log("  Block:         ", block.number);
        console2.log("");
        console2.log("Deployer Configuration:");
        console2.log("  Deployer:      ", deployer);
        console2.log("  Bot Wallet:    ", config.botWallet);
        console2.log("  Balance:       ", deployer.balance / 1e18, "ETH");
        console2.log("");
        console2.log("Protocol Addresses:");
        console2.log("  Aave Pool:     ", chain.aavePool);
        console2.log("  Balancer Vault:", chain.balancerVault);
        console2.log("  Uniswap V2:    ", chain.uniswapV2Router);
        console2.log("  Uniswap V3:    ", chain.uniswapV3Router);
        console2.log("  V3 Quoter:     ", chain.uniswapV3Quoter);
        console2.log("");
        console2.log("Safety Parameters:");
        console2.log("  Min Profit:    ", config.minProfit / 1e18, "ETH");
        console2.log("  Max Gas Price: ", config.maxGasPrice / 1e9, "gwei");
        console2.log("  Max Trade Size:", config.maxTradeSize / 1e18, "ETH");
        console2.log("  Failure Thresh:", config.failureThreshold);
        console2.log("");
    }

    function printPostDeploymentSummary(ChainConfig memory chain, DeployedContracts memory contracts)
        internal
        view
    {
        console2.log(unicode"\n╔══════════════════════════════════════════════════════════════════════════════╗");
        console2.log(unicode"║                        DEPLOYMENT SUCCESSFUL ✓                               ║");
        console2.log(unicode"╚══════════════════════════════════════════════════════════════════════════════╝");
        console2.log("");
        console2.log("Deployed Addresses:");
        console2.log("  FlashloanExecutor:  ", address(contracts.executor));
        console2.log("  CircuitBreaker:     ", address(contracts.circuitBreaker));
        console2.log("  ProfitValidator:    ", address(contracts.profitValidator));
        console2.log("  UniswapV2Adapter:   ", address(contracts.uniswapV2Adapter));
        console2.log("  UniswapV3Adapter:   ", address(contracts.uniswapV3Adapter));
        if (address(contracts.sushiswapV2Adapter) != address(0)) {
            console2.log("  SushiSwapV2Adapter: ", address(contracts.sushiswapV2Adapter));
        }
        if (address(contracts.sushiswapV3Adapter) != address(0)) {
            console2.log("  SushiSwapV3Adapter: ", address(contracts.sushiswapV3Adapter));
        }
        if (address(contracts.traderjoeLBAdapter) != address(0)) {
            console2.log("  TraderJoeLBAdapter: ", address(contracts.traderjoeLBAdapter));
        }
        console2.log("");
        console2.log("Next Steps:");
        console2.log("  1. Verify contracts on explorer (if --verify failed):");
        console2.log("     forge verify-contract <ADDRESS> <CONTRACT> --chain", chain.name);
        console2.log("");
        console2.log("  2. Update bot .env with deployed addresses:");
        console2.log("     FLASHLOAN_EXECUTOR_ADDRESS=", address(contracts.executor));
        console2.log("");
        console2.log("  3. Run post-deployment verification:");
        console2.log("     forge script script/Verify.s.sol --rpc-url $RPC_URL");
        console2.log("");
        console2.log("  4. Commit deployment artifacts:");
        console2.log("     git add broadcast/ deployments/");
        console2.log("     git commit -m \"deploy: contracts to", chain.name, "\"");
        console2.log("");
        console2.log("Deployment artifacts saved to:");
        console2.log("  broadcast/Deploy.s.sol/", vm.toString(chain.chainId), "/run-latest.json");
        console2.log("  deployments/", vm.toString(chain.chainId), ".json");
        console2.log("");
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // JSON Export
    // ══════════════════════════════════════════════════════════════════════════════

    function exportDeploymentAddresses(ChainConfig memory chain, DeployedContracts memory contracts) internal {
        string memory header = string.concat(
            '{\n',
            '  "chainId": ', vm.toString(chain.chainId), ',\n',
            '  "network": "', chain.name, '",\n',
            '  "deployedAt": "', vm.toString(block.timestamp), '",\n',
            '  "blockNumber": ', vm.toString(block.number), ',\n'
        );

        string memory contractAddrs = string.concat(
            '  "contracts": {\n',
            '    "FlashloanExecutor": "', vm.toString(address(contracts.executor)), '",\n',
            '    "CircuitBreaker": "', vm.toString(address(contracts.circuitBreaker)), '",\n',
            '    "ProfitValidator": "', vm.toString(address(contracts.profitValidator)), '",\n',
            '    "UniswapV2Adapter": "', vm.toString(address(contracts.uniswapV2Adapter)), '",\n',
            '    "UniswapV3Adapter": "', vm.toString(address(contracts.uniswapV3Adapter)), '",\n',
            '    "SushiSwapV2Adapter": "', vm.toString(address(contracts.sushiswapV2Adapter)), '",\n',
            '    "SushiSwapV3Adapter": "', vm.toString(address(contracts.sushiswapV3Adapter)), '",\n',
            '    "TraderJoeLBAdapter": "', vm.toString(address(contracts.traderjoeLBAdapter)), '"\n',
            '  },\n'
        );

        string memory config = string.concat(
            '  "configuration": {\n',
            '    "aavePool": "', vm.toString(chain.aavePool), '",\n',
            '    "balancerVault": "', vm.toString(chain.balancerVault), '",\n',
            '    "uniswapV2Router": "', vm.toString(chain.uniswapV2Router), '",\n',
            '    "uniswapV3Router": "', vm.toString(chain.uniswapV3Router), '",\n',
            '    "uniswapV3Quoter": "', vm.toString(chain.uniswapV3Quoter), '"\n',
            '  }\n'
        );

        string memory json = string.concat(header, contractAddrs, config, '}\n');

        string memory filename = string.concat("deployments/", vm.toString(chain.chainId), ".json");
        vm.writeFile(filename, json);
    }
}
