import type { ChainConfig } from "./types.js";
import { ETHEREUM_CONFIG } from "./ethereum.js";
import { SEPOLIA_CONFIG } from "./sepolia.js";
import { ARBITRUM_CONFIG } from "./arbitrum.js";
import { ARBITRUM_SEPOLIA_CONFIG } from "./arbitrum-sepolia.js";

/**
 * Load chain-specific configuration by chain ID.
 *
 * @param chainId - Chain ID (1 = Ethereum, 42161 = Arbitrum, etc.)
 *                  If not provided, reads from CHAIN_ID environment variable
 * @returns Chain-specific configuration
 * @throws Error if chain ID is unsupported
 *
 * @example
 * ```typescript
 * const config = loadChainConfig(42161); // Arbitrum mainnet
 * console.log(config.chainName); // "Arbitrum One"
 * console.log(config.protocols.aaveV3Pool); // "0x794a61..."
 * ```
 */
export function loadChainConfig(chainId?: number): ChainConfig {
  // Read from environment if not provided
  const targetChainId = chainId ?? parseInt(process.env.CHAIN_ID || "1", 10);

  // Select config by chain ID
  switch (targetChainId) {
    case 1:
      return ETHEREUM_CONFIG;
    case 11155111:
      return SEPOLIA_CONFIG;
    case 42161:
      return ARBITRUM_CONFIG;
    case 421614:
      return ARBITRUM_SEPOLIA_CONFIG;
    default:
      throw new Error(
        `Unsupported chain ID: ${targetChainId}. Supported chains: 1 (Ethereum), 11155111 (Sepolia), 42161 (Arbitrum), 421614 (Arbitrum Sepolia)`
      );
  }
}

// Re-export types for convenience
export type { ChainConfig } from "./types.js";
