// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Minimal Uniswap V2 Router interface.
interface IUniswapV2Router02 {
    function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline)
        external
        payable
        returns (uint256[] memory amounts);

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts);

    function factory() external pure returns (address);

    function WETH() external pure returns (address);
}

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
}

/// @notice Minimal WETH interface.
interface IWETH {
    function deposit() external payable;
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Minimal Uniswap V2 Factory interface.
interface IUniswapV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

/// @notice Minimal Uniswap V2 Pair interface.
interface IUniswapV2Pair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function token0() external view returns (address);
}

/// @title TestSkewPrice
/// @notice Script to create price discrepancies on testnet for bot testing.
/// @dev Executes a swap on ONE pool to skew its price relative to others.
///      The bot should then detect the price difference as an arbitrage opportunity.
///
/// Usage:
///   # Skew V2 price (swap WETH -> USDC on V2):
///   SKEW_DEX=v2 forge script script/TestSkewPrice.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast -vvv
///
///   # Skew V3 price (swap WETH -> USDC on V3):
///   SKEW_DEX=v3 forge script script/TestSkewPrice.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast -vvv
///
///   # Reverse direction (swap USDC -> WETH on V2):
///   SKEW_DEX=v2 SKEW_REVERSE=true forge script script/TestSkewPrice.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast -vvv
///
/// Required environment variables:
///   DEPLOYER_PRIVATE_KEY  - Private key for executing swaps
///   UNISWAP_V2_ROUTER     - Uniswap V2 Router address
///   UNISWAP_V3_ROUTER     - Uniswap V3 SwapRouter address
///
/// Optional environment variables:
///   WETH_ADDRESS           - WETH address (default: Sepolia WETH)
///   USDC_ADDRESS           - USDC address (default: Sepolia USDC)
///   SKEW_AMOUNT            - Amount of WETH to swap in wei (default: 0.01 ether)
///   SKEW_DEX               - Which DEX to swap on: "v2" or "v3" (default: "v2")
///   SKEW_REVERSE           - If "true", swap USDC -> WETH instead (default: false)
///   V3_FEE_TIER            - V3 pool fee tier (default: 3000 = 0.3%)
contract TestSkewPrice is Script {
    // ══════════════════════════════════════════════════════════════════════════════
    // Constants
    // ══════════════════════════════════════════════════════════════════════════════

    // Sepolia defaults
    address constant SEPOLIA_WETH = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;
    address constant SEPOLIA_USDC = 0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8;

    /// @notice Maximum swap amount to prevent accidentally draining a testnet wallet.
    uint256 constant MAX_SKEW_AMOUNT = 0.1 ether; // Cap at 0.1 ETH

    /// @notice Swap deadline offset from block.timestamp.
    uint256 constant DEADLINE_OFFSET = 300; // 5 minutes

    /// @notice Maximum slippage tolerance in basis points.
    uint256 constant MAX_SLIPPAGE_BPS = 5000; // 50% — testnet pools have low liquidity

    // ══════════════════════════════════════════════════════════════════════════════
    // Main Logic
    // ══════════════════════════════════════════════════════════════════════════════

    function run() external {
        // Load configuration
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        address weth = vm.envOr("WETH_ADDRESS", SEPOLIA_WETH);
        address usdc = vm.envOr("USDC_ADDRESS", SEPOLIA_USDC);
        address v2Router = vm.envAddress("UNISWAP_V2_ROUTER");
        address v3Router = vm.envAddress("UNISWAP_V3_ROUTER");

        uint256 skewAmount = vm.envOr("SKEW_AMOUNT", uint256(0.01 ether));
        string memory dex = vm.envOr("SKEW_DEX", string("v2"));
        bool reverse = vm.envOr("SKEW_REVERSE", false);
        uint24 v3Fee = uint24(vm.envOr("V3_FEE_TIER", uint256(3000)));

        // Safety check
        require(skewAmount <= MAX_SKEW_AMOUNT, "TestSkewPrice: Amount exceeds safety cap");
        require(skewAmount > 0, "TestSkewPrice: Amount must be > 0");

        printPreSwapSummary(deployer, weth, usdc, skewAmount, dex, reverse, v3Fee);

        // Print pre-swap balances
        printBalances("PRE-SWAP", deployer, weth, usdc);

        // Execute the swap
        vm.startBroadcast(deployerPrivateKey);

        bool isV2 = keccak256(bytes(dex)) == keccak256(bytes("v2"));

        if (!reverse) {
            // WETH -> USDC
            if (isV2) {
                swapWethToUsdcV2(v2Router, weth, usdc, skewAmount, deployer);
            } else {
                swapWethToUsdcV3(v3Router, weth, usdc, skewAmount, v3Fee, deployer);
            }
        } else {
            // USDC -> WETH
            if (isV2) {
                swapUsdcToWethV2(v2Router, usdc, weth, deployer);
            } else {
                swapUsdcToWethV3(v3Router, usdc, weth, v3Fee, deployer);
            }
        }

        vm.stopBroadcast();

        // Print post-swap balances
        printBalances("POST-SWAP", deployer, weth, usdc);

        printNextSteps();
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // V2 Swap Functions
    // ══════════════════════════════════════════════════════════════════════════════

    function swapWethToUsdcV2(address v2Router, address weth, address usdc, uint256 amount, address recipient)
        internal
    {
        console2.log(unicode"\n━━━ Executing: WETH -> USDC on V2 ━━━");

        IUniswapV2Router02 router = IUniswapV2Router02(v2Router);

        // Wrap ETH -> WETH if needed, or use existing WETH balance
        uint256 wethBalance = IWETH(weth).balanceOf(recipient);
        if (wethBalance < amount) {
            console2.log("  Wrapping ETH to WETH...");
            IWETH(weth).deposit{value: amount}();
        }

        // Approve router
        IWETH(weth).approve(v2Router, amount);

        // Build path
        address[] memory path = new address[](2);
        path[0] = weth;
        path[1] = usdc;

        // Get expected output for slippage calculation
        uint256[] memory expectedAmounts = router.getAmountsOut(amount, path);
        uint256 expectedOut = expectedAmounts[1];
        uint256 minOut = (expectedOut * (10_000 - MAX_SLIPPAGE_BPS)) / 10_000;

        console2.log("  Expected USDC out:", expectedOut);
        console2.log("  Min USDC out:     ", minOut);

        // Execute swap
        uint256[] memory amounts =
            router.swapExactTokensForTokens(amount, minOut, path, recipient, block.timestamp + DEADLINE_OFFSET);

        console2.log("  Actual USDC out:  ", amounts[1]);
        console2.log("  V2 swap complete");
    }

    function swapUsdcToWethV2(address v2Router, address usdc, address weth, address recipient) internal {
        console2.log(unicode"\n━━━ Executing: USDC -> WETH on V2 ━━━");

        IUniswapV2Router02 router = IUniswapV2Router02(v2Router);

        // Use all available USDC balance
        uint256 usdcBalance = IERC20(usdc).balanceOf(recipient);
        require(usdcBalance > 0, "TestSkewPrice: No USDC balance to swap");

        console2.log("  USDC balance:     ", usdcBalance);

        // Approve router
        IERC20(usdc).approve(v2Router, usdcBalance);

        // Build path
        address[] memory path = new address[](2);
        path[0] = usdc;
        path[1] = weth;

        // Get expected output
        uint256[] memory expectedAmounts = router.getAmountsOut(usdcBalance, path);
        uint256 expectedOut = expectedAmounts[1];
        uint256 minOut = (expectedOut * (10_000 - MAX_SLIPPAGE_BPS)) / 10_000;

        console2.log("  Expected WETH out:", expectedOut);
        console2.log("  Min WETH out:     ", minOut);

        // Execute swap
        uint256[] memory amounts =
            router.swapExactTokensForTokens(usdcBalance, minOut, path, recipient, block.timestamp + DEADLINE_OFFSET);

        console2.log("  Actual WETH out:  ", amounts[1]);
        console2.log("  V2 swap complete");
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // V3 Swap Functions
    // ══════════════════════════════════════════════════════════════════════════════

    function swapWethToUsdcV3(
        address v3Router,
        address weth,
        address usdc,
        uint256 amount,
        uint24 fee,
        address recipient
    ) internal {
        console2.log(unicode"\n━━━ Executing: WETH -> USDC on V3 ━━━");

        // Wrap ETH -> WETH if needed
        uint256 wethBalance = IWETH(weth).balanceOf(recipient);
        if (wethBalance < amount) {
            console2.log("  Wrapping ETH to WETH...");
            IWETH(weth).deposit{value: amount}();
        }

        // Approve router
        IWETH(weth).approve(v3Router, amount);

        // Execute swap
        uint256 amountOut = ISwapRouter(v3Router).exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: weth,
                tokenOut: usdc,
                fee: fee,
                recipient: recipient,
                deadline: block.timestamp + DEADLINE_OFFSET,
                amountIn: amount,
                amountOutMinimum: 0, // Testnet — accept any output
                sqrtPriceLimitX96: 0
            })
        );

        console2.log("  USDC received:    ", amountOut);
        console2.log("  V3 swap complete");
    }

    function swapUsdcToWethV3(address v3Router, address usdc, address weth, uint24 fee, address recipient) internal {
        console2.log(unicode"\n━━━ Executing: USDC -> WETH on V3 ━━━");

        // Use all available USDC balance
        uint256 usdcBalance = IERC20(usdc).balanceOf(recipient);
        require(usdcBalance > 0, "TestSkewPrice: No USDC balance to swap");

        console2.log("  USDC balance:     ", usdcBalance);

        // Approve router
        IERC20(usdc).approve(v3Router, usdcBalance);

        // Execute swap
        uint256 amountOut = ISwapRouter(v3Router).exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: usdc,
                tokenOut: weth,
                fee: fee,
                recipient: recipient,
                deadline: block.timestamp + DEADLINE_OFFSET,
                amountIn: usdcBalance,
                amountOutMinimum: 0, // Testnet — accept any output
                sqrtPriceLimitX96: 0
            })
        );

        console2.log("  WETH received:    ", amountOut);
        console2.log("  V3 swap complete");
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // Display Helpers
    // ══════════════════════════════════════════════════════════════════════════════

    function printPreSwapSummary(
        address deployer,
        address weth,
        address usdc,
        uint256 amount,
        string memory dex,
        bool reverse,
        uint24 v3Fee
    ) internal view {
        console2.log(unicode"\n╔══════════════════════════════════════════════════════════════════════════════╗");
        console2.log(unicode"║                        PRICE SKEW TEST                                       ║");
        console2.log(unicode"╚══════════════════════════════════════════════════════════════════════════════╝");
        console2.log("");
        console2.log("Network:       ", getChainName(block.chainid));
        console2.log("Block:         ", block.number);
        console2.log("Deployer:      ", deployer);
        console2.log("ETH Balance:   ", deployer.balance);
        console2.log("");
        console2.log("Swap Configuration:");
        console2.log("  DEX:          ", dex);
        console2.log("  Direction:    ", reverse ? "USDC -> WETH" : "WETH -> USDC");
        console2.log("  Amount:       ", amount, "wei");
        console2.log("  WETH:         ", weth);
        console2.log("  USDC:         ", usdc);

        bool isV3 = keccak256(bytes(dex)) == keccak256(bytes("v3"));
        if (isV3) {
            console2.log("  V3 Fee Tier:  ", v3Fee);
        }

        console2.log("  Safety Cap:   ", MAX_SKEW_AMOUNT, "wei");
    }

    function printBalances(string memory label, address account, address weth, address usdc) internal view {
        console2.log("");
        console2.log(unicode"━━━", label, unicode"Balances ━━━");
        console2.log("  ETH:  ", account.balance);
        console2.log("  WETH: ", IERC20(weth).balanceOf(account));
        console2.log("  USDC: ", IERC20(usdc).balanceOf(account));
    }

    function printNextSteps() internal pure {
        console2.log(unicode"\n╔══════════════════════════════════════════════════════════════════════════════╗");
        console2.log(unicode"║                        SWAP COMPLETE                                         ║");
        console2.log(unicode"╚══════════════════════════════════════════════════════════════════════════════╝");
        console2.log("");
        console2.log("Next Steps:");
        console2.log("  1. Query prices to see the discrepancy:");
        console2.log("     forge script script/QueryPrices.s.sol --rpc-url $SEPOLIA_RPC_URL -vvv");
        console2.log("");
        console2.log("  2. The bot should now detect the price difference!");
        console2.log("     Check bot logs for arbitrage opportunity detection.");
        console2.log("");
        console2.log("  3. To reverse the skew, run with SKEW_REVERSE=true");
        console2.log("");
    }

    function getChainName(uint256 chainId) internal pure returns (string memory) {
        if (chainId == 1) return "Ethereum Mainnet";
        if (chainId == 11155111) return "Sepolia Testnet";
        if (chainId == 42161) return "Arbitrum One";
        if (chainId == 8453) return "Base";
        return "Unknown Network";
    }
}
