import type { ChainConfig } from "./types.js";
import {
  SEPOLIA_TOKENS,
  SEPOLIA_MONITOR,
  SEPOLIA_DETECTOR,
  DEFAULT_MEV_CONFIG,
} from "../defaults.js";

/**
 * Sepolia testnet configuration.
 *
 * Chain ID: 11155111
 * Use case: Ethereum testnet for contract deployment and integration testing
 */
export const SEPOLIA_CONFIG: ChainConfig = {
  chainId: 11155111,
  chainName: "Sepolia Testnet",

  // RPC loaded from environment at runtime
  rpcUrl: process.env.RPC_URL || "",
  fallbackRpcUrl: process.env.FALLBACK_RPC_URL,

  // Flash loan and DeFi protocol addresses (from deployments/11155111.json)
  protocols: {
    aaveV3Pool: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",
    balancerVault: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
  },

  // DEX router and factory addresses (from deployments/11155111.json)
  dexes: {
    uniswapV3: {
      factory: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c", // Uniswap V3 Factory on Sepolia
      router: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
      quoter: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3",
    },
    uniswapV2: {
      router: "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008",
      factory: "0x7E0987E5b3a30e3f2828572Bb659A548460a3003", // Uniswap V2 Factory on Sepolia
    },
  },

  // Token addresses
  tokens: SEPOLIA_TOKENS,

  // Gas configuration (testnet)
  gas: {
    maxGasPriceGwei: 10, // Lower threshold for testnet
    gasPerSwap: 150_000,
  },

  // Monitor configuration (faster polling, lower threshold for testnet)
  monitor: SEPOLIA_MONITOR,

  // Detector configuration (testnet thresholds)
  detector: SEPOLIA_DETECTOR,

  // MEV protection (none on testnet)
  mev: DEFAULT_MEV_CONFIG,

  // Pools (empty initially - testnet pools discovered during testing)
  pools: [],
};
