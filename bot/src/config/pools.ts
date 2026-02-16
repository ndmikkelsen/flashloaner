import type { PoolDefinition } from "./types.js";
import { MAINNET_TOKENS } from "./defaults.js";

/**
 * Well-known mainnet pool definitions for cross-DEX arbitrage monitoring.
 *
 * Each token pair has pools on multiple DEXes to enable price comparison.
 * Addresses are verified mainnet deployments.
 */
export const MAINNET_POOLS: PoolDefinition[] = [
  // ─── WETH/USDC ────────────────────────────────────────────────

  {
    label: "WETH/USDC UniV2",
    dex: "uniswap_v2",
    poolAddress: "0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc",
    token0: MAINNET_TOKENS.USDC,
    token1: MAINNET_TOKENS.WETH,
    decimals0: 6,
    decimals1: 18,
  },
  {
    label: "WETH/USDC UniV3 (0.3%)",
    dex: "uniswap_v3",
    poolAddress: "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8",
    token0: MAINNET_TOKENS.USDC,
    token1: MAINNET_TOKENS.WETH,
    decimals0: 6,
    decimals1: 18,
    feeTier: 3000,
  },
  {
    label: "WETH/USDC UniV3 (0.05%)",
    dex: "uniswap_v3",
    poolAddress: "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640",
    token0: MAINNET_TOKENS.USDC,
    token1: MAINNET_TOKENS.WETH,
    decimals0: 6,
    decimals1: 18,
    feeTier: 500,
  },
  {
    label: "WETH/USDC Sushi",
    dex: "sushiswap",
    poolAddress: "0x397FF1542f962076d0BFE58eA045FfA2d347ACa0",
    token0: MAINNET_TOKENS.USDC,
    token1: MAINNET_TOKENS.WETH,
    decimals0: 6,
    decimals1: 18,
  },

  // ─── WETH/USDT ────────────────────────────────────────────────

  {
    label: "WETH/USDT UniV2",
    dex: "uniswap_v2",
    poolAddress: "0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852",
    token0: MAINNET_TOKENS.WETH,
    token1: MAINNET_TOKENS.USDT,
    decimals0: 18,
    decimals1: 6,
  },
  {
    label: "WETH/USDT UniV3 (0.3%)",
    dex: "uniswap_v3",
    poolAddress: "0x4e68Ccd3E89f51C3074ca5072bbAC773960dFa36",
    token0: MAINNET_TOKENS.WETH,
    token1: MAINNET_TOKENS.USDT,
    decimals0: 18,
    decimals1: 6,
    feeTier: 3000,
  },
  {
    label: "WETH/USDT Sushi",
    dex: "sushiswap",
    poolAddress: "0x06da0fd433C1A5d7a4faa01111c044910A184553",
    token0: MAINNET_TOKENS.WETH,
    token1: MAINNET_TOKENS.USDT,
    decimals0: 18,
    decimals1: 6,
  },

  // ─── WETH/DAI ─────────────────────────────────────────────────

  {
    label: "WETH/DAI UniV2",
    dex: "uniswap_v2",
    poolAddress: "0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11",
    token0: MAINNET_TOKENS.DAI,
    token1: MAINNET_TOKENS.WETH,
    decimals0: 18,
    decimals1: 18,
  },
  {
    label: "WETH/DAI UniV3 (0.3%)",
    dex: "uniswap_v3",
    poolAddress: "0xC2e9F25Be6257c210d7Adf0D4Cd6E3E881ba25f8",
    token0: MAINNET_TOKENS.DAI,
    token1: MAINNET_TOKENS.WETH,
    decimals0: 18,
    decimals1: 18,
    feeTier: 3000,
  },
  {
    label: "WETH/DAI Sushi",
    dex: "sushiswap",
    poolAddress: "0xC3D03e4F041Fd4cD388c549Ee2A29a9E5075882f",
    token0: MAINNET_TOKENS.DAI,
    token1: MAINNET_TOKENS.WETH,
    decimals0: 18,
    decimals1: 18,
  },

  // ─── WETH/WBTC ────────────────────────────────────────────────

  {
    label: "WETH/WBTC UniV2",
    dex: "uniswap_v2",
    poolAddress: "0xBb2b8038a1640196FbE3e38816F3e67Cba72D940",
    token0: MAINNET_TOKENS.WBTC,
    token1: MAINNET_TOKENS.WETH,
    decimals0: 8,
    decimals1: 18,
  },
  {
    label: "WETH/WBTC UniV3 (0.3%)",
    dex: "uniswap_v3",
    poolAddress: "0xCBCdF9626bC03E24f779434178A73a0B4bad62eD",
    token0: MAINNET_TOKENS.WBTC,
    token1: MAINNET_TOKENS.WETH,
    decimals0: 8,
    decimals1: 18,
    feeTier: 3000,
  },
  {
    label: "WETH/WBTC Sushi",
    dex: "sushiswap",
    poolAddress: "0xCEfF51756c56CeFFCA006cD410B03FFC46dd3a58",
    token0: MAINNET_TOKENS.WBTC,
    token1: MAINNET_TOKENS.WETH,
    decimals0: 8,
    decimals1: 18,
  },
];
