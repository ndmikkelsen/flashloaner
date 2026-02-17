import type { ChainConfig } from "./types.js";
import { ARBITRUM_SEPOLIA_POOLS } from "./pools/arbitrum-sepolia.js";

/**
 * Arbitrum Sepolia testnet configuration.
 *
 * Chain ID: 421614
 * Use case: Contract deployment and integration testing before Arbitrum mainnet
 *
 * Limitation: Testnet has fake/sparse liquidity, no real MEV competition.
 * Use for logic validation only, NOT performance testing.
 * Use Anvil/Hardhat fork for realistic testing.
 */
export const ARBITRUM_SEPOLIA_CONFIG: ChainConfig = {
  chainId: 421614,
  chainName: "Arbitrum Sepolia",

  // RPC loaded from environment at runtime
  rpcUrl: process.env.RPC_URL || "",
  fallbackRpcUrl: process.env.FALLBACK_RPC_URL,

  // Flash loan and DeFi protocol addresses (same as mainnet via CREATE2)
  protocols: {
    aaveV3Pool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    balancerVault: "0xBA12222222228d8Ba445958a75a0704d566BF2C8", // Balancer V2 Vault (same on all chains via CREATE2)
  },

  // DEX router and factory addresses (Arbitrum Sepolia testnet - different from mainnet)
  dexes: {
    uniswapV3: {
      factory: "0x248AB79Bbb9bC29bB72f7Cd42F17e054Fc40188e", // Uniswap V3 Arbitrum Sepolia deployment docs
      router: "0x101F443B4d1b059569D643917553c771E1b9663E", // SwapRouter02 — Uniswap V3 Arbitrum Sepolia deployment docs
      quoter: "0x2779a0CC1c3e0E44D2542EC3e79e3864Ae93Ef0B", // QuoterV2 — Uniswap V3 Arbitrum Sepolia deployment docs
    },
    camelot: {
      router: "0x171B925C51565F5D2a7d8C494ba3188D304EFD93",
      factory: "0x18E621B64d7808c3C47bccbbD7485d23F257D26f",
    },
  },

  // Token addresses (testnet tokens)
  tokens: {
    WETH: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73", // Verified — Uniswap V3 Arbitrum Sepolia deployment docs + Arbiscan Sepolia
    USDC: "0x0000000000000000000000000000000000000000", // TBD — no canonical testnet address; discover via factory.getPool()
    USDT: "0x0000000000000000000000000000000000000000", // TBD — no canonical testnet address; discover via factory.getPool()
  },

  // Gas configuration (testnet)
  gas: {
    maxGasPriceGwei: 0.1, // Same as Arbitrum mainnet
    gasPerSwap: 150_000,
  },

  // Monitor configuration (faster polling, lower threshold for testnet)
  monitor: {
    deltaThresholdPercent: 0.01, // Lower threshold for testnet (more sensitive)
    pollIntervalMs: 1_000, // 1s polling (same as mainnet)
    maxRetries: 3,
  },

  // Detector configuration (testnet thresholds)
  detector: {
    minProfitThreshold: 0.0001, // Much lower for testnet (0.0001 ETH)
    maxSlippage: 0.005, // 0.5%
    defaultInputAmount: 1, // 1 ETH flash loan (smaller for testnet)
    gasPriceGwei: 0.1, // Same as mainnet
    gasPerSwap: 150_000,
  },

  // MEV protection (none on testnet)
  mev: {
    mode: "none",
  },

  // Pools (empty initially - discovered during Phase 4 testing)
  pools: ARBITRUM_SEPOLIA_POOLS,
};
