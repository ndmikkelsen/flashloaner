import type { ChainConfig } from "./types.js";
import { ARBITRUM_MAINNET_POOLS } from "./pools/arbitrum-mainnet.js";

/**
 * Arbitrum One (mainnet) configuration.
 *
 * Chain ID: 42161
 * Use case: Primary deployment target for v1 (optimal success rate, lower MEV competition)
 *
 * Key characteristics:
 * - 0.25s block time (requires faster polling than Ethereum)
 * - FCFS sequencer ordering (latency > gas bidding)
 * - No Flashbots (centralized sequencer, private mempool)
 * - Dual-component gas (L2 execution + L1 data posting)
 */
export const ARBITRUM_CONFIG: ChainConfig = {
  chainId: 42161,
  chainName: "Arbitrum One",

  // RPC loaded from environment at runtime
  rpcUrl: process.env.RPC_URL || "",
  fallbackRpcUrl: process.env.FALLBACK_RPC_URL,

  // Flash loan and DeFi protocol addresses
  protocols: {
    aaveV3Pool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    balancerVault: "0xBA12222222228d8Ba445958a75a0704d566BF2C8", // Balancer V2 Vault (same on all chains via CREATE2)
  },

  // DEX router and factory addresses
  dexes: {
    uniswapV3: {
      factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
      router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", // SwapRouter02
      quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e", // QuoterV2
    },
    sushiswapV2: {
      router: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
      factory: "0xc35DADB65012eC5796536bD9864eD8773aBc74C4",
    },
    sushiswapV3: {
      factory: "0x1af415a1EbA07a4986a52B6f2e7dE7003D82231e",
    },
    camelotV3: {
      factory: "0x1a3c9B1d2F0529D97f2afC5136Cc23e58f1FD35B",
    },
  },

  // Token addresses (Arbitrum mainnet)
  tokens: {
    WETH: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    USDC: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", // Native USDC (Circle-issued)
    USDT: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
    ARB: "0x912ce59144191c1204e64559fe8253a0e49e6548",
    GMX: "0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a",
    LINK: "0xf97f4df75117a78c1a5a0dbb814af92458539fb4",
    MAGIC: "0x539bde0d7dbd336b79148aa742883198bbf60342",
    PENDLE: "0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8",
    GNS: "0x18c11FD286C5EC11c3b683Caa813B77f5163A122",
    PREMIA: "0x51fC0f6660482Ea73330E414eFd7808811a57Fa2",
    JONES: "0x10393c20975cF177a3513071bC110f7962CD67da",
    DPX: "0x6C2C06790b3E3E3c38e12Ee22F8183b37a13EE55",
    SPELL: "0x3E6648C5a70A150A88bCE65F4aD4d506Fe15d2AF",
  },

  // Gas configuration (Arbitrum-specific)
  gas: {
    maxGasPriceGwei: 0.1, // Arbitrum gas is much cheaper than Ethereum
    gasPerSwap: 150_000,
  },

  // Monitor configuration (0.25s blocks = faster polling)
  monitor: {
    deltaThresholdPercent: 0.3, // Same as Ethereum
    pollIntervalMs: 1_000, // 1s polling (Arbitrum has 0.25s blocks)
    maxRetries: 3,
  },

  // Detector configuration (Arbitrum thresholds)
  detector: {
    minProfitThreshold: 0.01, // Same as Ethereum (0.01 ETH)
    maxSlippage: 0.005, // 0.5%
    defaultInputAmount: 0.5, // 0.5 ETH flash loan (conservative for dry-run)
    gasPriceGwei: 0.1, // Arbitrum typical gas price
    gasPerSwap: 150_000,
  },

  // MEV protection (none - FCFS sequencer, no Flashbots on Arbitrum)
  mev: {
    mode: "none",
  },

  // Pre-configured pools (WETH/USDC and WETH/USDT on Uniswap V3)
  pools: ARBITRUM_MAINNET_POOLS,
};
