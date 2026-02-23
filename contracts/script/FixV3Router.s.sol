// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {FlashloanExecutor} from "../src/FlashloanExecutor.sol";
import {UniswapV3Adapter} from "../src/adapters/UniswapV3Adapter.sol";

/// @title FixV3Router
/// @notice Redeploy UniswapV3Adapter with V1 SwapRouter (has deadline in struct).
/// @dev The original deployment used SwapRouter02 (V2) which has a different
///      exactInputSingle signature. V1 SwapRouter uses selector 0x414bf389 which
///      matches our adapter's ISwapRouter interface.
///
/// Usage:
///   Dry run:   forge script script/FixV3Router.s.sol --fork-url $RPC_URL -vvv
///   Broadcast:  forge script script/FixV3Router.s.sol --rpc-url $RPC_URL --broadcast
///
/// Required env vars:
///   DEPLOYER_PRIVATE_KEY  - Deployer (must be executor owner)
///   EXECUTOR_ADDRESS      - FlashloanExecutor address
///   UNISWAP_V3_ROUTER     - V1 SwapRouter address (0xE592427A0AEce92De3Edee1F18E0157C05861564)
///   UNISWAP_V3_QUOTER     - QuoterV2 address
///   OLD_UNISWAP_V3_ADAPTER - Old adapter to unregister
contract FixV3Router is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        address executorAddr = vm.envAddress("EXECUTOR_ADDRESS");
        address v3Router = vm.envAddress("UNISWAP_V3_ROUTER");
        address v3Quoter = vm.envAddress("UNISWAP_V3_QUOTER");
        address oldAdapter = vm.envAddress("OLD_UNISWAP_V3_ADAPTER");

        FlashloanExecutor executor = FlashloanExecutor(payable(executorAddr));

        console2.log(unicode"\n━━━ Fix: Redeploy UniswapV3Adapter with V1 Router ━━━");
        console2.log("Deployer:      ", deployer);
        console2.log("Executor:      ", executorAddr);
        console2.log("V1 Router:     ", v3Router);
        console2.log("V3 Quoter:     ", v3Quoter);
        console2.log("Old Adapter:   ", oldAdapter);

        // Verify deployer is executor owner
        require(executor.owner() == deployer, "Deployer must be executor owner");
        require(executor.approvedAdapters(oldAdapter), "Old adapter not registered");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy new UniswapV3Adapter with V1 router
        UniswapV3Adapter newAdapter = new UniswapV3Adapter(v3Router, v3Quoter);
        console2.log(unicode"✓ New UniswapV3Adapter deployed:", address(newAdapter));

        // 2. Register new adapter
        executor.registerAdapter(address(newAdapter));
        console2.log(unicode"✓ Registered new adapter");

        // 3. Unregister old adapter
        executor.removeAdapter(oldAdapter);
        console2.log(unicode"✓ Unregistered old adapter");

        vm.stopBroadcast();

        // Verify
        require(executor.approvedAdapters(address(newAdapter)), "New adapter not registered");
        require(!executor.approvedAdapters(oldAdapter), "Old adapter still registered");
        console2.log(unicode"\n✓ Fix complete. Update ADAPTER_UNISWAP_V3 in .env to:", address(newAdapter));
    }
}
