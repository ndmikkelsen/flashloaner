// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

/// @notice Minimal Uniswap V2 Factory interface for pair lookup.
interface IUniswapV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

/// @notice Minimal Uniswap V2 Pair interface for reserve queries.
interface IUniswapV2Pair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function token0() external view returns (address);
    function token1() external view returns (address);
}

/// @notice Minimal Uniswap V2 Router interface for factory lookup.
interface IUniswapV2Router02 {
    function factory() external pure returns (address);
    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts);
}

/// @notice Minimal Uniswap V3 Factory interface for pool lookup.
interface IUniswapV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
}

/// @notice Minimal Uniswap V3 Pool interface for price queries.
interface IUniswapV3Pool {
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );
    function token0() external view returns (address);
    function token1() external view returns (address);
    function liquidity() external view returns (uint128);
}

/// @notice Minimal SwapRouter interface for factory lookup.
interface ISwapRouterFactory {
    function factory() external view returns (address);
}

/// @title QueryPrices
/// @notice Read-only script to query and compare prices from Uniswap V2 and V3 pools.
/// @dev No state changes — safe to run without --broadcast.
///
/// Usage:
///   forge script script/QueryPrices.s.sol --rpc-url $SEPOLIA_RPC_URL -vvv
///
/// Required environment variables:
///   UNISWAP_V2_ROUTER  - Uniswap V2 Router address
///   UNISWAP_V3_ROUTER  - Uniswap V3 SwapRouter address
///
/// Optional environment variables:
///   WETH_ADDRESS        - WETH address (default: Sepolia WETH)
///   USDC_ADDRESS        - USDC address (default: Sepolia USDC)
///   QUERY_AMOUNT        - Amount of WETH to quote (default: 0.01 ether)
contract QueryPrices is Script {
    // Sepolia defaults
    address constant SEPOLIA_WETH = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;
    address constant SEPOLIA_USDC = 0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8;

    // V3 fee tiers to check
    uint24 constant FEE_LOW = 500; // 0.05%
    uint24 constant FEE_MEDIUM = 3000; // 0.3%
    uint24 constant FEE_HIGH = 10_000; // 1%

    function run() external view {
        // Load configuration
        address weth = vm.envOr("WETH_ADDRESS", SEPOLIA_WETH);
        address usdc = vm.envOr("USDC_ADDRESS", SEPOLIA_USDC);
        address v2Router = vm.envAddress("UNISWAP_V2_ROUTER");
        address v3Router = vm.envAddress("UNISWAP_V3_ROUTER");
        uint256 queryAmount = vm.envOr("QUERY_AMOUNT", uint256(0.01 ether));

        printHeader(weth, usdc, queryAmount);

        // Query V2 price
        uint256 v2Price = queryV2Price(v2Router, weth, usdc, queryAmount);

        // Query V3 prices across fee tiers
        uint256 v3PriceLow = queryV3Price(v3Router, weth, usdc, FEE_LOW);
        uint256 v3PriceMedium = queryV3Price(v3Router, weth, usdc, FEE_MEDIUM);
        uint256 v3PriceHigh = queryV3Price(v3Router, weth, usdc, FEE_HIGH);

        // Pick the best V3 price (highest liquidity pool)
        uint256 v3BestPrice = v3PriceMedium; // 0.3% is most common
        string memory v3BestTier = "0.30%";
        if (v3PriceLow > 0 && (v3BestPrice == 0 || v3PriceLow > v3BestPrice)) {
            v3BestPrice = v3PriceLow;
            v3BestTier = "0.05%";
        }
        if (v3PriceHigh > 0 && (v3BestPrice == 0 || v3PriceHigh > v3BestPrice)) {
            v3BestPrice = v3PriceHigh;
            v3BestTier = "1.00%";
        }

        // Display comparison
        printComparison(v2Price, v3BestPrice, v3BestTier, queryAmount);
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // V2 Price Query
    // ══════════════════════════════════════════════════════════════════════════════

    function queryV2Price(address v2Router, address weth, address usdc, uint256 amountIn)
        internal
        view
        returns (uint256 amountOut)
    {
        console2.log(unicode"\n━━━ Uniswap V2 ━━━");

        IUniswapV2Router02 router = IUniswapV2Router02(v2Router);

        // Get the V2 factory and pair
        address factory = router.factory();
        address pair = IUniswapV2Factory(factory).getPair(weth, usdc);

        if (pair == address(0)) {
            console2.log("  No V2 pair found for WETH/USDC");
            return 0;
        }

        console2.log("  Pair:    ", pair);

        // Get reserves
        IUniswapV2Pair v2Pair = IUniswapV2Pair(pair);
        (uint112 reserve0, uint112 reserve1,) = v2Pair.getReserves();
        address token0 = v2Pair.token0();

        uint256 wethReserve;
        uint256 usdcReserve;
        if (token0 == weth) {
            wethReserve = uint256(reserve0);
            usdcReserve = uint256(reserve1);
        } else {
            wethReserve = uint256(reserve1);
            usdcReserve = uint256(reserve0);
        }

        console2.log("  WETH Reserve:", wethReserve);
        console2.log("  USDC Reserve:", usdcReserve);

        // Get quoted output amount
        address[] memory path = new address[](2);
        path[0] = weth;
        path[1] = usdc;

        try router.getAmountsOut(amountIn, path) returns (uint256[] memory amounts) {
            amountOut = amounts[1];
            console2.log("  Quote:   ", amountIn, "wei WETH ->", amountOut);
        } catch {
            console2.log("  Quote failed (insufficient liquidity?)");
            amountOut = 0;
        }
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // V3 Price Query
    // ══════════════════════════════════════════════════════════════════════════════

    function queryV3Price(address v3Router, address weth, address usdc, uint24 fee)
        internal
        view
        returns (uint256 price)
    {
        _logV3Header(fee);

        // Get the V3 factory from the router
        address factory;
        try ISwapRouterFactory(v3Router).factory() returns (address f) {
            factory = f;
        } catch {
            console2.log("  Could not get V3 factory from router");
            return 0;
        }

        // Look up the pool
        address pool = IUniswapV3Factory(factory).getPool(weth, usdc, fee);

        if (pool == address(0)) {
            console2.log("  No pool found for this fee tier");
            return 0;
        }

        console2.log("  Pool:    ", pool);

        price = _readV3PoolPrice(pool, weth);
    }

    function _logV3Header(uint24 fee) internal pure {
        string memory feeLabel;
        if (fee == 500) feeLabel = "0.05%";
        else if (fee == 3000) feeLabel = "0.30%";
        else if (fee == 10_000) feeLabel = "1.00%";
        else feeLabel = "unknown";

        console2.log(unicode"\n━━━ Uniswap V3 (fee:", feeLabel, unicode") ━━━");
    }

    function _readV3PoolPrice(address pool, address weth) internal view returns (uint256 price) {
        IUniswapV3Pool v3Pool = IUniswapV3Pool(pool);

        try v3Pool.slot0() returns (
            uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool
        ) {
            console2.log("  Tick:    ", tick);
            console2.log("  SqrtP:  ", sqrtPriceX96);

            uint128 liquidity = v3Pool.liquidity();
            console2.log("  Liq:    ", liquidity);

            price = _calculatePriceFromSqrtX96(sqrtPriceX96, v3Pool.token0(), weth);
        } catch {
            console2.log("  Could not query pool slot0");
            return 0;
        }
    }

    /// @dev Calculate a human-readable price (scaled by 1e6 for USDC) from sqrtPriceX96.
    ///      sqrtPriceX96 = sqrt(price) * 2^96 where price = token1/token0
    function _calculatePriceFromSqrtX96(uint160 sqrtPriceX96, address token0, address weth)
        internal
        pure
        returns (uint256)
    {
        // price = (sqrtPriceX96)^2 / 2^192
        // We need to be careful with overflow, so we do this in steps
        uint256 sqrtPrice = uint256(sqrtPriceX96);

        // price * 1e18 = sqrtPrice^2 * 1e18 / 2^192
        // But sqrtPrice^2 can overflow uint256 if sqrtPrice > 2^128
        // So: price * 1e18 = (sqrtPrice * 1e9 / 2^96)^2
        uint256 priceScaled = (sqrtPrice * 1e9) / (1 << 96);
        uint256 priceX1e18 = priceScaled * priceScaled;

        // If token0 is WETH, price = USDC per WETH (but in token1/token0 raw units)
        // If token0 is USDC, price = WETH per USDC, and we need to invert
        if (token0 == weth) {
            // price is USDC/WETH in raw units. USDC has 6 decimals, WETH has 18.
            // Actual USDC per WETH = price * 10^(18-6) = price * 1e12
            // priceX1e18 already has 1e18 scaling, so result = priceX1e18 * 1e12 / 1e18 = priceX1e18 / 1e6
            return priceX1e18 / 1e6;
        } else {
            // price is WETH/USDC in raw units, we want USDC/WETH
            // invert: 1e18 * 1e18 / priceX1e18, then adjust for decimals
            if (priceX1e18 == 0) return 0;
            return (1e18 * 1e18 * 1e6) / priceX1e18;
        }
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // Display
    // ══════════════════════════════════════════════════════════════════════════════

    function printHeader(address weth, address usdc, uint256 queryAmount) internal view {
        console2.log(unicode"\n╔══════════════════════════════════════════════════════════════════════════════╗");
        console2.log(unicode"║                        PRICE QUERY - WETH/USDC                               ║");
        console2.log(unicode"╚══════════════════════════════════════════════════════════════════════════════╝");
        console2.log("");
        console2.log("Network:      ", getChainName(block.chainid));
        console2.log("Block:        ", block.number);
        console2.log("WETH:         ", weth);
        console2.log("USDC:         ", usdc);
        console2.log("Query Amount: ", queryAmount, "wei");
    }

    function printComparison(uint256 v2Price, uint256 v3Price, string memory v3Tier, uint256 queryAmount)
        internal
        pure
    {
        console2.log(unicode"\n╔══════════════════════════════════════════════════════════════════════════════╗");
        console2.log(unicode"║                        PRICE COMPARISON                                      ║");
        console2.log(unicode"╚══════════════════════════════════════════════════════════════════════════════╝");
        console2.log("");
        console2.log("Query:         ", queryAmount, "wei WETH");
        console2.log("");

        if (v2Price > 0) {
            console2.log("V2 Output:     ", v2Price, "USDC (raw)");
        } else {
            console2.log("V2 Output:      No liquidity / no pair");
        }

        if (v3Price > 0) {
            console2.log("V3 Price:      ", v3Price);
            console2.log("  (sqrtPriceX96-derived, best tier:", v3Tier, ")");
        } else {
            console2.log("V3 Price:       No liquidity / no pool");
        }

        // Calculate delta if both prices available
        if (v2Price > 0 && v3Price > 0) {
            uint256 higher = v2Price > v3Price ? v2Price : v3Price;
            uint256 lower = v2Price > v3Price ? v3Price : v2Price;
            string memory higherDex = v2Price > v3Price ? "V2" : "V3";

            // delta as basis points: (higher - lower) * 10000 / lower
            uint256 deltaBps = ((higher - lower) * 10_000) / lower;

            console2.log("");
            console2.log("Delta:         ", deltaBps, "bps");
            console2.log("  Higher DEX:  ", higherDex);

            if (deltaBps > 50) {
                console2.log(">>> POTENTIAL ARBITRAGE OPPORTUNITY <<<");
            } else {
                console2.log("(Prices are within normal range)");
            }
        }

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
