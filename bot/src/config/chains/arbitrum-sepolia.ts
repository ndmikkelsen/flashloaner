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
    balancerVault: "0x0000000000000000000000000000000000000000", // TBD - resolve during Phase 3
  },

  // DEX router and factory addresses (same as mainnet via CREATE2, plus Camelot testnet)
  dexes: {
    uniswapV3: {
      factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
      router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", // SwapRouter02
      quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e", // QuoterV2
    },
    camelot: {
      router: "0x171B925C51565F5D2a7d8C494ba3188D304EFD93",
      factory: "0x18E621B64d7808c3C47bccbbD7485d23F257D26f",
    },
  },

  // Token addresses (testnet tokens - will be discovered during deployment)
  tokens: {
    WETH: "0x0000000000000000000000000000000000000000", // TBD - discover during Phase 4
    USDC: "0x0000000000000000000000000000000000000000", // TBD
    USDT: "0x0000000000000000000000000000000000000000", // TBD
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
