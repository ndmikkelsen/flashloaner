import type { PoolDefinition } from "../../types.js";

/**
 * Arbitrum Sepolia testnet pool definitions.
 *
 * Pool addresses discovered on 2026-02-17 via factory.getPool() queries against
 * the Uniswap V3 factory at 0x248AB79Bbb9bC29bB72f7Cd42F17e054Fc40188e.
 *
 * Discovery commands run:
 *   FACTORY=0x248AB79Bbb9bC29bB72f7Cd42F17e054Fc40188e
 *   WETH=0x980B62Da83eFf3D4576C647993b0c1D7faf17c73
 *   USDC=0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d  (Aave testnet USDC, 6 decimals)
 *
 *   cast call $FACTORY "getPool(address,address,uint24)(address)" $WETH $USDC 500  => 0x6F112d524DC998381C09b4e53C7e5e2cc260f877  (liquidity: 122)
 *   cast call $FACTORY "getPool(address,address,uint24)(address)" $WETH $USDC 3000 => 0x66EEAB70aC52459Dd74C6AD50D578Ef76a441bbf  (liquidity: 45752273629)
 *   cast call $FACTORY "getPool(address,address,uint24)(address)" $WETH $USDC 10000 => 0x3eCedaB7E9479E29B694d8590dc34e0Ce6059868 (liquidity: 3225673603183)
 *
 * The 0.3% and 1% pools have meaningful liquidity. The 0.05% pool has negligible
 * liquidity (122 units) and is excluded to avoid stale price reads.
 *
 * Token: Aave testnet USDC is the canonical USDC on Arbitrum Sepolia used by Uniswap V3.
 *        It is a mintable test token — not bridged real USDC. 6 decimals (ERC-20 standard).
 */

// WETH on Arbitrum Sepolia (verified — Uniswap V3 Arbitrum Sepolia deployment docs)
const WETH_ARB_SEPOLIA = "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73";

// Aave testnet USDC on Arbitrum Sepolia (6 decimals — confirmed via cast call decimals())
const USDC_ARB_SEPOLIA = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d";

export const ARBITRUM_SEPOLIA_POOLS: PoolDefinition[] = [
  {
    // WETH/USDC 0.3% fee pool on Uniswap V3 Arbitrum Sepolia
    // Discovered: factory.getPool(WETH, USDC, 3000) => 0x66EEAB70aC52459Dd74C6AD50D578Ef76a441bbf
    // Liquidity at discovery: 45752273629 (adequate for price monitoring)
    label: "WETH/USDC-0.3%-UniV3-ArbSepolia",
    dex: "uniswap_v3",
    poolAddress: "0x66EEAB70aC52459Dd74C6AD50D578Ef76a441bbf",
    token0: WETH_ARB_SEPOLIA,
    token1: USDC_ARB_SEPOLIA,
    decimals0: 18,
    decimals1: 6, // USDC has 6 decimals
    feeTier: 3000, // 0.3%
  },
  {
    // WETH/USDC 1% fee pool on Uniswap V3 Arbitrum Sepolia
    // Discovered: factory.getPool(WETH, USDC, 10000) => 0x3eCedaB7E9479E29B694d8590dc34e0Ce6059868
    // Liquidity at discovery: 3225673603183 (highest liquidity of the three pools)
    label: "WETH/USDC-1%-UniV3-ArbSepolia",
    dex: "uniswap_v3",
    poolAddress: "0x3eCedaB7E9479E29B694d8590dc34e0Ce6059868",
    token0: WETH_ARB_SEPOLIA,
    token1: USDC_ARB_SEPOLIA,
    decimals0: 18,
    decimals1: 6, // USDC has 6 decimals
    feeTier: 10000, // 1%
  },
];
