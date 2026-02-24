/**
 * MEVBlockerSigner: Routes transactions through the MEV Blocker RPC endpoint
 * to protect against sandwich attacks and front-running.
 *
 * This is the simplest form of MEV protection -- instead of submitting
 * transactions to the public mempool via a standard RPC, it sends them
 * to MEV Blocker (https://rpc.mevblocker.io) which routes transactions
 * directly to block builders, bypassing the public mempool entirely.
 *
 * Implements the ExecutionSigner interface so it can be used as a drop-in
 * replacement in the ExecutionEngine.
 *
 * Unlike FlashbotsSigner, this does not use bundles or require an auth key.
 * It works by sending standard eth_sendRawTransaction calls to a private
 * RPC endpoint.
 */

import type { ExecutionSigner, TransactionReceipt } from "../engine/ExecutionEngine.js";
import type { MEVBlockerConfig } from "./types.js";

/** Default MEV Blocker RPC endpoint */
const DEFAULT_MEV_BLOCKER_RPC = "https://rpc.mevblocker.io";

/** Transaction parameters accepted by sendTransaction */
interface TransactionParams {
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
export type MEVBlockerInnerWallet = ExecutionSigner & {
  signTransaction(tx: Record<string, unknown>): Promise<string>;
};

/**
 * Routes transactions through MEV Blocker for private submission.
 *
 * Usage:
 * ```ts
 * const mevBlockerSigner = new MEVBlockerSigner(
 *   wallet,  // ethers.js Wallet for signing transactions
 *   { rpcUrl: "https://rpc.mevblocker.io" }
 * );
 *
 * // Use as a drop-in signer for ExecutionEngine
 * const engine = new ExecutionEngine(mevBlockerSigner);
 * ```
 */
export class MEVBlockerSigner implements ExecutionSigner {
  private readonly innerWallet: MEVBlockerInnerWallet;
  private readonly rpcUrl: string;

  /**
   * Fetch implementation. Extracted as a public property for testability --
   * tests can replace this with a mock fetch after construction.
   */
  fetchFn: typeof globalThis.fetch = globalThis.fetch.bind(globalThis);

  constructor(
    innerWallet: MEVBlockerInnerWallet,
    config?: MEVBlockerConfig,
  ) {
    this.innerWallet = innerWallet;
    this.rpcUrl = config?.rpcUrl || DEFAULT_MEV_BLOCKER_RPC;
  }

  /**
   * Send a transaction through the MEV Blocker RPC.
   *
   * Steps:
   * 1. Sign the raw transaction with the inner wallet
   * 2. Submit via eth_sendRawTransaction to MEV Blocker RPC
   * 3. Return a response that polls for the receipt via eth_getTransactionReceipt
   */
  async sendTransaction(tx: TransactionParams): Promise<{
    hash: string;
    wait(confirmations?: number): Promise<TransactionReceipt | null>;
  }> {
    // Step 1: Sign the raw transaction
    const signedTx = await this.signRawTransaction(tx);

    // Step 2: Submit to MEV Blocker RPC
    const txHash = await this.sendRawTransaction(signedTx);

    // Step 3: Return response with wait() that polls for receipt
    return {
      hash: txHash,
      wait: (_confirmations?: number): Promise<TransactionReceipt | null> => {
        return this.waitForReceipt(txHash);
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
   * eth_call does not need MEV protection since it is a read-only operation.
   */
  async call(tx: { to: string; data: string; value?: bigint }): Promise<string> {
    if (this.innerWallet.call) {
      return this.innerWallet.call(tx);
    }
    throw new Error("MEVBlockerSigner: inner wallet does not support call()");
  }

  // ---------------------------------------------------------------------------
  // Private: Transaction Signing
  // ---------------------------------------------------------------------------

  /**
   * Sign the transaction using the inner wallet and return the serialized
   * signed transaction hex string.
   */
  private async signRawTransaction(tx: TransactionParams): Promise<string> {
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
  // Private: MEV Blocker RPC Communication
  // ---------------------------------------------------------------------------

  /**
   * Submit a signed raw transaction via eth_sendRawTransaction to the
   * MEV Blocker RPC endpoint.
   *
   * Returns the transaction hash.
   */
  private async sendRawTransaction(signedTx: string): Promise<string> {
    const result = await this.rpcRequest("eth_sendRawTransaction", [signedTx]);

    if (result.error) {
      const errMsg = typeof result.error === "object" ? result.error.message : String(result.error);
      throw new Error(`MEV Blocker eth_sendRawTransaction failed: ${errMsg}`);
    }

    return result.result as string;
  }

  /**
   * Poll for a transaction receipt via eth_getTransactionReceipt.
   *
   * Polls the MEV Blocker RPC at regular intervals until the receipt is
   * available or the timeout is reached.
   */
  private async waitForReceipt(
    txHash: string,
    timeoutMs: number = 120_000,
    pollIntervalMs: number = 2_000,
  ): Promise<TransactionReceipt | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const result = await this.rpcRequest("eth_getTransactionReceipt", [txHash]);

      if (result.result && result.result !== null) {
        const receipt = result.result;
        return {
          status: parseInt(receipt.status, 16),
          blockNumber: parseInt(receipt.blockNumber, 16),
          gasUsed: BigInt(receipt.gasUsed),
          effectiveGasPrice: receipt.effectiveGasPrice
            ? BigInt(receipt.effectiveGasPrice)
            : undefined,
          logs: (receipt.logs ?? []).map((log: RpcLog) => ({
            topics: log.topics,
            data: log.data,
            address: log.address,
          })),
        };
      }

      await this.sleep(pollIntervalMs);
    }

    // Timed out
    return null;
  }

  /**
   * Send a JSON-RPC request to the MEV Blocker RPC endpoint.
   */
  private async rpcRequest(
    method: string,
    params: unknown[],
  ): Promise<RpcResponse> {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    });

    const response = await this.fetchFn(this.rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `MEV Blocker RPC HTTP ${response.status}: ${text}`,
      );
    }

    return (await response.json()) as RpcResponse;
  }

  /** Promise-based sleep helper */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

/** Shape of a JSON-RPC response */
interface RpcResponse {
  jsonrpc: string;
  id: number;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  result?: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  error?: { code: number; message: string } | string;
}

/** Shape of a log entry in an RPC receipt response */
interface RpcLog {
  topics: string[];
  data: string;
  address: string;
}
