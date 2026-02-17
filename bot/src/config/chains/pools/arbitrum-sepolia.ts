import type { PoolDefinition } from "../../types.js";

/**
 * Arbitrum Sepolia testnet pool definitions.
 *
 * Pool addresses on Arbitrum Sepolia are sparse — Uniswap V3 testnet liquidity is minimal.
 * These entries use placeholder pool addresses ("TBD_DISCOVER_ON_CHAIN") that must be
 * replaced with real addresses discovered from the Uniswap V3 factory before the bot
 * can monitor them.
 *
 * HOW TO DISCOVER LIVE POOL ADDRESSES:
 * =====================================
 * Use the Uniswap V3 factory on Arbitrum Sepolia to query existing pools:
 *
 *   const factory = new ethers.Contract(
 *     "0x248AB79Bbb9bC29bB72f7Cd42F17e054Fc40188e", // Uniswap V3 Arbitrum Sepolia factory
 *     ["function getPool(address,address,uint24) view returns (address)"],
 *     provider
 *   );
 *
 *   // WETH address on Arbitrum Sepolia: 0x980B62Da83eFf3D4576C647993b0c1D7faf17c73
 *   // Query each fee tier (500 = 0.05%, 3000 = 0.3%, 10000 = 1%)
 *   const pool500  = await factory.getPool(weth, token1, 500);
 *   const pool3000 = await factory.getPool(weth, token1, 3000);
 *
 *   // Returns address(0) if pool doesn't exist
 *
 * Replace "TBD_DISCOVER_ON_CHAIN" with the returned address after discovery.
 * The bot entry point will warn at startup if any pool address is still a placeholder.
 */

// WETH on Arbitrum Sepolia (verified — Uniswap V3 Arbitrum Sepolia deployment docs)
const WETH_ARB_SEPOLIA = "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73";

export const ARBITRUM_SEPOLIA_POOLS: PoolDefinition[] = [
  {
    // WETH/UNI 0.05% fee pool on Uniswap V3 Arbitrum Sepolia
    // Replace poolAddress with result of: factory.getPool(WETH, UNI, 500)
    label: "WETH/UNI-0.05%-UniV3-ArbSepolia",
    dex: "uniswap_v3",
    poolAddress: "TBD_DISCOVER_ON_CHAIN", // Run factory.getPool(WETH, UNI, 500) to populate
    token0: WETH_ARB_SEPOLIA,
    token1: "0x0000000000000000000000000000000000000001", // TBD — testnet UNI or similar token
    decimals0: 18,
    decimals1: 18,
    feeTier: 500, // 0.05%
  },
  {
    // WETH/UNI 0.3% fee pool on Uniswap V3 Arbitrum Sepolia
    // Replace poolAddress with result of: factory.getPool(WETH, UNI, 3000)
    label: "WETH/UNI-0.3%-UniV3-ArbSepolia",
    dex: "uniswap_v3",
    poolAddress: "TBD_DISCOVER_ON_CHAIN", // Run factory.getPool(WETH, UNI, 3000) to populate
    token0: WETH_ARB_SEPOLIA,
    token1: "0x0000000000000000000000000000000000000001", // TBD — testnet UNI or similar token
    decimals0: 18,
    decimals1: 18,
    feeTier: 3000, // 0.3%
  },
];
