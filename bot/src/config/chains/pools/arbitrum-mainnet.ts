import type { PoolDefinition } from "../../types.js";

/**
 * Arbitrum mainnet pool definitions.
 *
 * These are pre-configured high-liquidity pools for cross-DEX arbitrage monitoring.
 * Addresses verified from Phase 1 research (ARBITRUM.md).
 */
export const ARBITRUM_MAINNET_POOLS: PoolDefinition[] = [
  // ──── WETH/USDC ────────────────────────────────────────────────

  {
    label: "WETH/USDC UniV3 (0.05%)",
    dex: "uniswap_v3",
    poolAddress: "0xC31E54c7a869B9FcBEcc14363CF510d1c41fa443",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH (lower address = token0)
    token1: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", // USDC.e
    decimals0: 18,
    decimals1: 6,
    feeTier: 500,
  },

  {
    label: "WETH/USDC UniV3 (0.3%)",
    dex: "uniswap_v3",
    poolAddress: "0xC6962004f452bE9203591991D15f6b388e09E8D0",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH (lower address = token0)
    token1: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", // USDC.e
    decimals0: 18,
    decimals1: 6,
    feeTier: 3000,
  },

  // ──── WETH/USDT ────────────────────────────────────────────────

  {
    label: "WETH/USDT UniV3 (0.05%)",
    dex: "uniswap_v3",
    poolAddress: "0x641c00a822e8b671738d32a431a4fb6074e5c79d",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", // USDT
    decimals0: 18,
    decimals1: 6,
    feeTier: 500,
  },
];
