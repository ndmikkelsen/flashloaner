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

  // ──── ARB/WETH ─────────────────────────────────────────────────

  {
    label: "ARB/WETH UniV3 (0.05%)",
    dex: "uniswap_v3",
    poolAddress: "0xc6f780497a95e246eb9449f5e4770916dcd6396a",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0x912ce59144191c1204e64559fe8253a0e49e6548", // ARB
    decimals0: 18,
    decimals1: 18,
    feeTier: 500,
  },

  {
    label: "ARB/WETH UniV3 (0.3%)",
    dex: "uniswap_v3",
    poolAddress: "0x92c63d0e701caae670c9415d91c474f686298f00",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0x912ce59144191c1204e64559fe8253a0e49e6548", // ARB
    decimals0: 18,
    decimals1: 18,
    feeTier: 3000,
  },

  {
    label: "ARB/WETH SushiV3 (0.3%)",
    dex: "sushiswap_v3",
    poolAddress: "0xb3942c6bbe27e857b2e4e2e3a90e052a19ebc270",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0x912ce59144191c1204e64559fe8253a0e49e6548", // ARB
    decimals0: 18,
    decimals1: 18,
    feeTier: 3000,
  },

  {
    label: "ARB/WETH SushiV2",
    dex: "sushiswap",
    poolAddress: "0x0a5601fe473deafa0ae0fa2ec283ce53571a4e7e",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0x912ce59144191c1204e64559fe8253a0e49e6548", // ARB
    decimals0: 18,
    decimals1: 18,
  },

  // ──── LINK/WETH ────────────────────────────────────────────────

  {
    label: "LINK/WETH UniV3 (0.3%)",
    dex: "uniswap_v3",
    poolAddress: "0x468b88941e7cc0b88c1869d68ab6b570bcef62ff",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0xf97f4df75117a78c1a5a0dbb814af92458539fb4", // LINK
    decimals0: 18,
    decimals1: 18,
    feeTier: 3000,
  },

  {
    label: "LINK/WETH SushiV3 (0.3%)",
    dex: "sushiswap_v3",
    poolAddress: "0x55a7e06c57ccba96ca3e4e2edbb3c0c7e8772642",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0xf97f4df75117a78c1a5a0dbb814af92458539fb4", // LINK
    decimals0: 18,
    decimals1: 18,
    feeTier: 3000,
  },

  // ──── GMX/WETH ─────────────────────────────────────────────────

  {
    label: "GMX/WETH UniV3 (0.05%)",
    dex: "uniswap_v3",
    poolAddress: "0xb435eb51a3cc4eb4e20e5283ebc5e2ad3caf7a0d",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a", // GMX
    decimals0: 18,
    decimals1: 18,
    feeTier: 500,
  },

  {
    label: "GMX/WETH UniV3 (1%)",
    dex: "uniswap_v3",
    poolAddress: "0x80A9ae39310abf666A87C743d6ebBD0E8C42158E",
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a", // GMX
    decimals0: 18,
    decimals1: 18,
    feeTier: 10000,
  },

  // ──── MAGIC/WETH ───────────────────────────────────────────────

  {
    label: "MAGIC/WETH UniV3 (0.3%)",
    dex: "uniswap_v3",
    poolAddress: "0x59d72ddb29da32847a4665d08ffc8464a7185fae",
    token0: "0x539bde0d7dbd336b79148aa742883198bbf60342", // MAGIC
    token1: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    decimals0: 18,
    decimals1: 18,
    feeTier: 3000,
  },

  {
    label: "MAGIC/WETH SushiV2",
    dex: "sushiswap",
    poolAddress: "0xb7e50106a5bd3cf21af210a755f9c8740890a8c9",
    token0: "0x539bde0d7dbd336b79148aa742883198bbf60342", // MAGIC
    token1: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    decimals0: 18,
    decimals1: 18,
  },
];
