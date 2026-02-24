/**
 * FlashbotsSigner: Routes transactions through the Flashbots relay
 * to avoid the public mempool and protect against MEV attacks.
 *
 * Implements the ExecutionSigner interface so it can be used as a
 * drop-in replacement for the standard ethers.js wallet in the
 * ExecutionEngine.
 *
 * How it works:
 * 1. Signs the raw transaction using the inner wallet
 * 2. Submits the signed tx as a bundle via eth_sendBundle to the Flashbots relay
 * 3. Optionally simulates the bundle first via eth_callBundle
 * 4. Waits for bundle inclusion by polling block-by-block
 * 5. Falls back to resubmission for subsequent blocks if not included
 *
 * The auth signer is a separate key used only for the X-Flashbots-Signature
 * header. It identifies the bot to the Flashbots relay but has no on-chain role.
 */

import { SigningKey, keccak256, getBytes, toBeHex, computeAddress } from "ethers";
import type { ExecutionSigner, TransactionReceipt } from "../engine/ExecutionEngine.js";
import type { BundleSimulation, FlashbotsConfig, MinimalProvider } from "./types.js";

/** Default Flashbots relay endpoint */
const DEFAULT_RELAY_URL = "https://relay.flashbots.net";

/** Default maximum blocks to wait for bundle inclusion */
const DEFAULT_MAX_BLOCKS_TO_WAIT = 5;

/** Polling interval in ms when waiting for bundle inclusion */
const INCLUSION_POLL_INTERVAL_MS = 1_000;

/** Transaction parameters accepted by sendTransaction */
interface RawTransactionParams {
  to: string;
  data: string;
  value: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  gasLimit: bigint;
  nonce: number;
  chainId: number;
}

/**
 * Inner wallet type: must implement ExecutionSigner plus signTransaction
 * for raw transaction signing (ethers.js Wallet satisfies this).
 */
export type FlashbotsInnerWallet = ExecutionSigner & {
  signTransaction(tx: Record<string, unknown>): Promise<string>;
};

/**
 * Signs and submits transactions through the Flashbots relay.
 *
 * Usage:
 * ```ts
 * const flashbotsSigner = new FlashbotsSigner(
 *   wallet,     // ethers.js Wallet (signs txs + provides getNonce/call)
 *   provider,   // for block number queries
 *   config,     // FlashbotsConfig with authKeyHex, relayUrl, etc.
 * );
 *
 * // Use as a drop-in signer for ExecutionEngine
 * const engine = new ExecutionEngine(flashbotsSigner);
 * ```
 */
export class FlashbotsSigner implements ExecutionSigner {
  private readonly innerWallet: FlashbotsInnerWallet;
  private readonly authSigningKey: SigningKey;
  private readonly authAddress: string;
  private readonly relayUrl: string;
  private readonly maxBlocksToWait: number;
  private readonly simulateBeforeSend: boolean;
  private readonly provider: MinimalProvider;

  /**
   * Fetch implementation. Extracted as a public property for testability --
   * tests can replace this with a mock fetch after construction.
   */
  fetchFn: typeof globalThis.fetch = globalThis.fetch.bind(globalThis);

  constructor(
    innerWallet: FlashbotsInnerWallet,
    provider: MinimalProvider,
    config: FlashbotsConfig,
  ) {
    if (!config.authKeyHex) {
      throw new Error("FlashbotsSigner: authKeyHex is required");
    }

    this.innerWallet = innerWallet;
    this.provider = provider;
    this.relayUrl = config.relayUrl || DEFAULT_RELAY_URL;
    this.maxBlocksToWait = config.maxBlocksToWait ?? DEFAULT_MAX_BLOCKS_TO_WAIT;
    this.simulateBeforeSend = config.simulateBeforeSend ?? true;

    // The auth signing key is used solely for the X-Flashbots-Signature header.
    // It identifies this bot to the relay but has no on-chain significance.
    const normalizedKey = config.authKeyHex.startsWith("0x")
      ? config.authKeyHex
      : `0x${config.authKeyHex}`;
    this.authSigningKey = new SigningKey(normalizedKey);
    // computeAddress from ethers.js v6 accepts a public key hex string
    this.authAddress = computeAddress(this.authSigningKey.publicKey);
  }

  /**
   * Send a transaction through the Flashbots relay as a single-tx bundle.
   *
   * Steps:
   * 1. Sign the raw transaction with the inner wallet
   * 2. Optionally simulate the bundle via eth_callBundle
   * 3. Submit via eth_sendBundle targeting the next block
   * 4. Wait for inclusion, resubmitting for subsequent blocks if needed
   */
  async sendTransaction(tx: RawTransactionParams): Promise<{
    hash: string;
    wait(confirmations?: number): Promise<TransactionReceipt | null>;
  }> {
    // Step 1: Sign the raw transaction
    const signedTx = await this.signRawTransaction(tx);

    // Compute the transaction hash from the signed bytes
    const txHash = keccak256(signedTx);

    // Step 2: Get target block
    const currentBlock = await this.provider.getBlockNumber();
    const targetBlock = currentBlock + 1;

    // Step 3: Optionally simulate
    if (this.simulateBeforeSend) {
      const simulation = await this.simulateBundle(signedTx, currentBlock);
      if (!simulation.success) {
        throw new Error(
          `Flashbots bundle simulation failed: ${simulation.error ?? "unknown error"}`,
        );
      }
    }

    // Step 4: Submit bundle for target block
    const bundleHash = await this.submitBundle(signedTx, targetBlock);

    // Step 5: Return a response compatible with ExecutionSigner interface
    return {
      hash: txHash,
      wait: (_confirmations?: number): Promise<TransactionReceipt | null> => {
        return this.waitForInclusion(signedTx, targetBlock, bundleHash);
      },
    };
  }

  /**
   * Delegate getNonce to the inner wallet.
   */
  async getNonce(blockTag?: string): Promise<number> {
    return this.innerWallet.getNonce(blockTag);
  }

  /**
   * Delegate call to the inner wallet (for eth_call simulation).
   */
  async call(tx: { to: string; data: string; value?: bigint }): Promise<string> {
    if (this.innerWallet.call) {
      return this.innerWallet.call(tx);
    }
    throw new Error("FlashbotsSigner: inner wallet does not support call()");
  }

  /**
   * Simulate a bundle via eth_callBundle before submission.
   * This is a free check that reveals if the bundle would revert.
   */
  async simulateBundle(signedTx: string, blockNumber: number): Promise<BundleSimulation> {
    const params = {
      txs: [signedTx],
      blockNumber: toBeHex(blockNumber),
      stateBlockNumber: "latest",
    };

    try {
      const result = await this.relayRequest("eth_callBundle", [params]);

      if (result.error) {
        return {
          success: false,
          gasUsed: 0n,
          effectiveGasPrice: 0n,
          error: typeof result.error === "object" ? result.error.message : String(result.error),
        };
      }

      const bundleResult = result.result;

      // Check if any transaction in the bundle reverted
      if (bundleResult.results) {
        for (const txResult of bundleResult.results) {
          if (txResult.error) {
            return {
              success: false,
              gasUsed: BigInt(txResult.gasUsed ?? "0"),
              effectiveGasPrice: 0n,
              error: txResult.error,
            };
          }
          if (txResult.revert) {
            return {
              success: false,
              gasUsed: BigInt(txResult.gasUsed ?? "0"),
              effectiveGasPrice: 0n,
              error: `Revert: ${txResult.revert}`,
            };
          }
        }
      }

      return {
        success: true,
        gasUsed: BigInt(bundleResult.totalGasUsed ?? "0"),
        effectiveGasPrice: BigInt(bundleResult.gasFees?.effectiveGasPrice ?? "0"),
      };
    } catch (err) {
      return {
        success: false,
        gasUsed: 0n,
        effectiveGasPrice: 0n,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Private: Transaction Signing
  // ---------------------------------------------------------------------------

  /**
   * Sign the transaction using the inner wallet and return the serialized
   * signed transaction hex string.
   *
   * The inner wallet must support signTransaction() (ethers.js Wallet does).
   */
  private async signRawTransaction(tx: RawTransactionParams): Promise<string> {
    const txForSigning: Record<string, unknown> = {
      to: tx.to,
      data: tx.data,
      value: tx.value,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
      gasLimit: tx.gasLimit,
      nonce: tx.nonce,
      chainId: tx.chainId,
      type: 2, // EIP-1559
    };

    return this.innerWallet.signTransaction(txForSigning);
  }

  // ---------------------------------------------------------------------------
  // Private: Flashbots Relay Communication
  // ---------------------------------------------------------------------------

  /**
   * Submit a signed transaction as a bundle via eth_sendBundle.
   * Returns the bundle hash.
   */
  private async submitBundle(signedTx: string, blockNumber: number): Promise<string> {
    const params = {
      txs: [signedTx],
      blockNumber: toBeHex(blockNumber),
    };

    const result = await this.relayRequest("eth_sendBundle", [params]);

    if (result.error) {
      const errMsg = typeof result.error === "object" ? result.error.message : String(result.error);
      throw new Error(`Flashbots eth_sendBundle failed: ${errMsg}`);
    }

    return result.result?.bundleHash ?? "";
  }

  /**
   * Wait for bundle inclusion by polling the chain.
   *
   * Strategy: After submitting for a target block, wait for that block to be
   * mined. If the bundle is not yet included, resubmit for the next block.
   * Repeat up to maxBlocksToWait times.
   *
   * Because MinimalProvider does not have getTransactionReceipt, we cannot
   * directly verify inclusion here. The ExecutionEngine handles receipt
   * verification through the returned wait() promise. This method returns
   * null if we exhaust all block attempts without advancing, signaling
   * that inclusion was not confirmed at this layer.
   */
  private async waitForInclusion(
    signedTx: string,
    initialTargetBlock: number,
    _bundleHash: string,
  ): Promise<TransactionReceipt | null> {
    let targetBlock = initialTargetBlock;
    const maxBlock = initialTargetBlock + this.maxBlocksToWait - 1;

    while (targetBlock <= maxBlock) {
      // Wait for the target block to be mined
      const reached = await this.pollUntilBlock(targetBlock);
      if (!reached) {
        // Timed out waiting for blocks entirely
        return null;
      }

      // The target block has been mined. Resubmit for the next block
      // if we still have attempts remaining. The Flashbots relay requires
      // bundles to be resubmitted for each new target block.
      if (targetBlock < maxBlock) {
        targetBlock++;
        try {
          await this.submitBundle(signedTx, targetBlock);
        } catch {
          // Resubmission failure is non-fatal; continue waiting
        }
        continue;
      }

      // Exhausted all block attempts
      break;
    }

    // Return null -- the ExecutionEngine's confirmation timeout will
    // determine ultimate success or failure.
    return null;
  }

  /**
   * Poll until the given block number is reached.
   * Returns true if reached, false if timed out.
   */
  private async pollUntilBlock(targetBlock: number): Promise<boolean> {
    // Allow ~15 seconds per block on mainnet, scaled by maxBlocksToWait
    const maxWaitMs = this.maxBlocksToWait * 15_000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const currentBlock = await this.provider.getBlockNumber();
      if (currentBlock >= targetBlock) {
        return true;
      }
      await this.sleep(INCLUSION_POLL_INTERVAL_MS);
    }

    return false;
  }

  /**
   * Send a JSON-RPC request to the Flashbots relay with the
   * X-Flashbots-Signature authentication header.
   */
  private async relayRequest(
    method: string,
    params: unknown[],
  ): Promise<RelayResponse> {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    });

    const signature = this.signPayload(body);

    const response = await this.fetchFn(this.relayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Flashbots-Signature": `${this.authAddress}:${signature}`,
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Flashbots relay HTTP ${response.status}: ${text}`,
      );
    }

    return (await response.json()) as RelayResponse;
  }

  /**
   * Sign a JSON-RPC request body for the X-Flashbots-Signature header.
   *
   * The signature is: sign(keccak256(body)) using the auth private key.
   * This produces a 65-byte secp256k1 signature (r + s + v).
   */
  private signPayload(body: string): string {
    const bodyHash = keccak256(new TextEncoder().encode(body));
    const sig = this.authSigningKey.sign(getBytes(bodyHash));
    return sig.serialized;
  }

  /** Promise-based sleep helper */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

/** Shape of a JSON-RPC response from the Flashbots relay */
interface RelayResponse {
  jsonrpc: string;
  id: number;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  result?: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  error?: { code: number; message: string } | string;
}
