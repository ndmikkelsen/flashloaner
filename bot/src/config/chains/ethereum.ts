import type { ChainConfig } from "./types.js";
import { MAINNET_POOLS } from "../pools.js";
import {
  DEFAULT_MONITOR,
  DEFAULT_DETECTOR,
  MAINNET_MEV_CONFIG,
  MAINNET_TOKENS,
} from "../defaults.js";

/**
 * Ethereum mainnet configuration.
 *
 * Chain ID: 1
 * Use case: Original deployment target (preserved for backward compatibility)
 */
export const ETHEREUM_CONFIG: ChainConfig = {
  chainId: 1,
  chainName: "Ethereum Mainnet",

  // RPC loaded from environment at runtime
  rpcUrl: process.env.RPC_URL || "",
  fallbackRpcUrl: process.env.FALLBACK_RPC_URL,

  // Flash loan and DeFi protocol addresses
  protocols: {
    aaveV3Pool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
    balancerVault: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
  },

  // DEX router and factory addresses
  dexes: {
    uniswapV3: {
      factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
      router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", // SwapRouter02
      quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e", // QuoterV2
    },
    uniswapV2: {
      router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
      factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
    },
    sushiswapV2: {
      router: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
      factory: "0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac",
    },
  },

  // Token addresses
  tokens: MAINNET_TOKENS,

  // Gas configuration (Ethereum mainnet)
  gas: {
    maxGasPriceGwei: 50, // Stop if gas exceeds 50 gwei
    gasPerSwap: 150_000, // Estimated gas per swap step
  },

  // Monitor configuration (12s blocks on Ethereum)
  monitor: DEFAULT_MONITOR,

  // Detector configuration (mainnet thresholds)
  detector: DEFAULT_DETECTOR,

  // MEV protection (Flashbots on mainnet)
  mev: MAINNET_MEV_CONFIG,

  // Pre-configured pools
  pools: MAINNET_POOLS,
};
