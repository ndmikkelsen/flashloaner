/**
 * MEV protection module.
 *
 * Provides two strategies for protecting transactions from MEV attacks:
 *
 * 1. **Flashbots** (flashloaner-79t): Submits transactions as bundles via the
 *    Flashbots relay. Bundles are sent directly to block builders, never entering
 *    the public mempool. Supports bundle simulation before submission.
 *
 * 2. **MEV Blocker** (flashloaner-x87): Routes standard transactions through the
 *    MEV Blocker RPC endpoint, which forwards them to builders privately.
 *    Simpler setup -- no auth key or bundle management required.
 *
 * Usage:
 * ```ts
 * import { createMEVProtectedSigner } from "./mev/index.js";
 *
 * const signer = createMEVProtectedSigner(wallet, provider, {
 *   mode: "flashbots",
 *   flashbots: {
 *     relayUrl: "https://relay.flashbots.net",
 *     authKeyHex: process.env.FLASHBOTS_AUTH_KEY!,
 *     maxBlocksToWait: 5,
 *     simulateBeforeSend: true,
 *   },
 * });
 *
 * const engine = new ExecutionEngine(signer);
 * ```
 */

import type { ExecutionSigner } from "../engine/ExecutionEngine.js";
import { FlashbotsSigner, type FlashbotsInnerWallet } from "./FlashbotsSigner.js";
import { MEVBlockerSigner, type MEVBlockerInnerWallet } from "./MEVBlockerSigner.js";
import type { MEVProtectionConfig, MinimalProvider } from "./types.js";

/**
 * Create an MEV-protected signer by wrapping a base signer according to
 * the configured protection mode.
 *
 * @param baseSigner - The underlying wallet/signer that can sign transactions.
 *   Must support `signTransaction()` for flashbots and mev_blocker modes.
 *   An ethers.js v6 `Wallet` satisfies this requirement.
 * @param provider - Minimal provider for block number queries (needed by Flashbots).
 * @param config - MEV protection configuration specifying the mode and options.
 * @returns An ExecutionSigner that routes transactions through the configured
 *   MEV protection channel, or the original signer if mode is "none".
 */
export function createMEVProtectedSigner(
  baseSigner: ExecutionSigner & { signTransaction(tx: Record<string, unknown>): Promise<string> },
  provider: MinimalProvider,
  config: MEVProtectionConfig,
): ExecutionSigner {
  switch (config.mode) {
    case "flashbots": {
      if (!config.flashbots) {
        throw new Error(
          "MEV protection mode is 'flashbots' but no flashbots config provided",
        );
      }
      return new FlashbotsSigner(
        baseSigner as FlashbotsInnerWallet,
        provider,
        config.flashbots,
      );
    }

    case "mev_blocker": {
      return new MEVBlockerSigner(
        baseSigner as MEVBlockerInnerWallet,
        config.mevBlocker,
      );
    }

    case "none":
      return baseSigner;

    default: {
      // Exhaustiveness check
      const _exhaustive: never = config.mode;
      throw new Error(`Unknown MEV protection mode: ${_exhaustive}`);
    }
  }
}

// Re-export all types and classes
export { FlashbotsSigner } from "./FlashbotsSigner.js";
export type { FlashbotsInnerWallet } from "./FlashbotsSigner.js";
export { MEVBlockerSigner } from "./MEVBlockerSigner.js";
export type { MEVBlockerInnerWallet } from "./MEVBlockerSigner.js";
export type {
  FlashbotsConfig,
  MEVBlockerConfig,
  MEVProtectionConfig,
  BundleSimulation,
  BundleResult,
  MinimalProvider,
} from "./types.js";
