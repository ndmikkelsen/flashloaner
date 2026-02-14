import { EventEmitter } from "node:events";
import { Interface } from "ethers";
import type { PreparedTransaction } from "../builder/types.js";
import type {
  ExecutionEngineConfig,
  ExecutionResult,
  ExecutionStatus,
  ProfitRecord,
  TrackedTransaction,
} from "./types.js";

// FlashloanExecutor ABI for event parsing and error decoding
const EXECUTOR_ABI = [
  "event ArbitrageExecuted(address indexed token, uint256 amount, uint256 profit)",
  "event ProfitWithdrawn(address indexed token, address indexed to, uint256 amount)",
  "error InsufficientProfit(uint256 received, uint256 required)",
  "error AdapterNotApproved(address adapter)",
  "error EmptySwapSteps()",
  "error NotAuthorized()",
  "error ContractPaused()",
  "error ZeroAddress()",
  "error ZeroAmount()",
];

const executorIface = new Interface(EXECUTOR_ABI);

/**
 * Minimal signer interface for transaction submission.
 * Compatible with ethers.js v6 Signer.
 */
export interface ExecutionSigner {
  sendTransaction(tx: {
    to: string;
    data: string;
    value: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
    gasLimit: bigint;
    nonce: number;
    chainId: number;
  }): Promise<{ hash: string; wait(confirmations?: number): Promise<TransactionReceipt | null> }>;
  getNonce(blockTag?: string): Promise<number>;
}

/** Minimal transaction receipt interface */
export interface TransactionReceipt {
  status: number;
  blockNumber: number;
  gasUsed: bigint;
  gasPrice?: bigint;
  effectiveGasPrice?: bigint;
  logs: ReadonlyArray<{ topics: readonly string[]; data: string; address: string }>;
}

/**
 * Submits, monitors, and tracks arbitrage transactions.
 *
 * Features:
 * - Transaction submission via ethers.js signer
 * - Confirmation waiting with timeout
 * - Revert reason parsing (FlashloanExecutor custom errors)
 * - Transaction replacement (speed up / cancel)
 * - Consecutive failure circuit breaker
 * - Profit tracking from ArbitrageExecuted events
 * - Dry-run mode for testing
 */
export class ExecutionEngine extends EventEmitter {
  readonly config: Required<ExecutionEngineConfig>;
  private readonly signer: ExecutionSigner;
  private _paused = false;
  private _consecutiveFailures = 0;
  private _tracked: Map<string, TrackedTransaction> = new Map();
  private _profitHistory: ProfitRecord[] = [];

  constructor(signer: ExecutionSigner, config: ExecutionEngineConfig = {}) {
    super();
    if (!signer) throw new Error("Signer is required");

    this.signer = signer;
    this.config = {
      confirmations: config.confirmations ?? 1,
      confirmationTimeoutMs: config.confirmationTimeoutMs ?? 120_000,
      maxConsecutiveFailures: config.maxConsecutiveFailures ?? 5,
      dryRun: config.dryRun ?? false,
      speedUpMultiplier: config.speedUpMultiplier ?? 1.125,
    };
  }

  /** Whether the engine is paused due to consecutive failures */
  get paused(): boolean {
    return this._paused;
  }

  /** Number of consecutive failures */
  get consecutiveFailures(): number {
    return this._consecutiveFailures;
  }

  /** All tracked transactions */
  get tracked(): ReadonlyMap<string, TrackedTransaction> {
    return this._tracked;
  }

  /** Profit history */
  get profitHistory(): readonly ProfitRecord[] {
    return this._profitHistory;
  }

  /**
   * Execute a prepared arbitrage transaction.
   *
   * Submits the transaction, waits for confirmation, parses the result,
   * and tracks profit/loss.
   */
  async executeTransaction(tx: PreparedTransaction): Promise<ExecutionResult> {
    if (this._paused) {
      return this.makeResult("failed", {
        error: "Engine is paused due to consecutive failures",
      });
    }

    // Dry-run mode: simulate without submitting
    if (this.config.dryRun) {
      const result = this.makeResult("confirmed", {
        txHash: `0x${"0".repeat(64)}`,
        blockNumber: 0,
        gasUsed: tx.gas.gasLimit,
      });
      this.emit("confirmed", result);
      return result;
    }

    // Submit
    let txHash: string;
    let txResponse: { hash: string; wait(confirmations?: number): Promise<TransactionReceipt | null> };
    try {
      txResponse = await this.signer.sendTransaction({
        to: tx.to,
        data: tx.data,
        value: tx.value,
        maxFeePerGas: tx.gas.maxFeePerGas,
        maxPriorityFeePerGas: tx.gas.maxPriorityFeePerGas,
        gasLimit: tx.gas.gasLimit,
        nonce: tx.nonce,
        chainId: tx.chainId,
      });
      txHash = txResponse.hash;
    } catch (err) {
      this.recordFailure();
      const result = this.makeResult("failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      this.emit("failed", result);
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
      return result;
    }

    // Track the transaction
    this._tracked.set(txHash, {
      tx,
      txHash,
      submittedAt: Date.now(),
      status: "submitted",
      replacements: 0,
    });
    this.emit("submitted", txHash, tx);

    // Wait for confirmation
    return this.waitForConfirmation(txHash, txResponse);
  }

  /**
   * Wait for a submitted transaction to be confirmed or reverted.
   */
  async waitForConfirmation(
    txHash: string,
    txResponse: { wait(confirmations?: number): Promise<TransactionReceipt | null> },
  ): Promise<ExecutionResult> {
    try {
      const receipt = await Promise.race([
        txResponse.wait(this.config.confirmations),
        this.timeout(this.config.confirmationTimeoutMs),
      ]);

      if (!receipt) {
        this.recordFailure();
        const result = this.makeResult("failed", {
          txHash,
          error: "Transaction confirmation timed out",
        });
        this.emit("failed", result);
        return result;
      }

      if (receipt.status === 1) {
        // Success
        this.resetFailures();
        const gasCostWei = receipt.gasUsed * (receipt.effectiveGasPrice ?? receipt.gasPrice ?? 0n);
        const result = this.makeResult("confirmed", {
          txHash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed,
          effectiveGasPrice: receipt.effectiveGasPrice ?? receipt.gasPrice,
          gasCostWei,
        });

        this.updateTracked(txHash, "confirmed");
        this.emit("confirmed", result);

        // Parse profit from logs
        this.parseProfitFromReceipt(txHash, receipt);

        return result;
      } else {
        // Reverted
        this.recordFailure();
        const result = this.makeResult("reverted", {
          txHash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed,
          effectiveGasPrice: receipt.effectiveGasPrice ?? receipt.gasPrice,
          gasCostWei: receipt.gasUsed * (receipt.effectiveGasPrice ?? receipt.gasPrice ?? 0n),
          revertReason: "Transaction reverted on-chain",
        });

        this.updateTracked(txHash, "reverted");
        this.emit("reverted", result);
        return result;
      }
    } catch (err) {
      this.recordFailure();

      // Try to parse revert reason from error data
      const revertReason = this.parseRevertReason(err);

      const result = this.makeResult("failed", {
        txHash,
        error: err instanceof Error ? err.message : String(err),
        revertReason,
      });
      this.updateTracked(txHash, "failed");
      this.emit("failed", result);
      return result;
    }
  }

  /**
   * Build a speed-up replacement transaction with higher gas.
   *
   * Returns a new PreparedTransaction with the same nonce but increased
   * maxFeePerGas and maxPriorityFeePerGas.
   */
  buildSpeedUp(txHash: string): PreparedTransaction {
    const tracked = this._tracked.get(txHash);
    if (!tracked) throw new Error(`Transaction not tracked: ${txHash}`);
    if (tracked.status !== "submitted") {
      throw new Error(`Cannot speed up transaction with status: ${tracked.status}`);
    }

    const multiplier = this.config.speedUpMultiplier;
    const origGas = tracked.tx.gas;

    return {
      ...tracked.tx,
      gas: {
        maxFeePerGas: this.applyMultiplier(origGas.maxFeePerGas, multiplier),
        maxPriorityFeePerGas: this.applyMultiplier(origGas.maxPriorityFeePerGas, multiplier),
        gasLimit: origGas.gasLimit,
      },
    };
  }

  /**
   * Build a cancellation transaction (0-value self-transfer with same nonce).
   */
  buildCancellation(txHash: string, selfAddress: string): PreparedTransaction {
    const tracked = this._tracked.get(txHash);
    if (!tracked) throw new Error(`Transaction not tracked: ${txHash}`);
    if (tracked.status !== "submitted") {
      throw new Error(`Cannot cancel transaction with status: ${tracked.status}`);
    }

    const multiplier = this.config.speedUpMultiplier;
    const origGas = tracked.tx.gas;

    return {
      ...tracked.tx,
      to: selfAddress,
      data: "0x",
      value: 0n,
      steps: [],
      flashLoanProvider: "",
      flashLoanToken: "",
      flashLoanAmount: 0n,
      gas: {
        maxFeePerGas: this.applyMultiplier(origGas.maxFeePerGas, multiplier),
        maxPriorityFeePerGas: this.applyMultiplier(origGas.maxPriorityFeePerGas, multiplier),
        gasLimit: 21_000n, // Simple transfer
      },
    };
  }

  /**
   * Mark a transaction as replaced (e.g., after speed-up or cancel).
   */
  markReplaced(oldHash: string, newHash: string): void {
    this.updateTracked(oldHash, "replaced");
    this.emit("replaced", oldHash, newHash);
  }

  /**
   * Parse a revert reason from an error, attempting to decode
   * FlashloanExecutor custom errors.
   */
  parseRevertReason(error: unknown): string | undefined {
    if (!error || typeof error !== "object") return undefined;

    const err = error as Record<string, unknown>;

    // ethers.js v6 wraps revert data in error.data
    const data = err.data as string | undefined;
    if (data && typeof data === "string" && data.startsWith("0x") && data.length >= 10) {
      try {
        const parsed = executorIface.parseError(data);
        if (parsed) {
          return this.formatParsedError(parsed.name, parsed.args);
        }
      } catch {
        // Not a known error selector
      }
    }

    // Check error.reason (ethers.js v6)
    if (typeof err.reason === "string") return err.reason;

    // Check error.message
    if (typeof err.message === "string") {
      // Extract revert reason from common error message patterns
      const match = (err.message as string).match(/reason="([^"]+)"/);
      if (match) return match[1];
    }

    return undefined;
  }

  /**
   * Resume execution after being paused. Resets the failure counter.
   */
  resume(): void {
    this._paused = false;
    this._consecutiveFailures = 0;
  }

  /**
   * Parse ArbitrageExecuted events from a transaction receipt to track profit.
   */
  private parseProfitFromReceipt(txHash: string, receipt: TransactionReceipt): void {
    const tracked = this._tracked.get(txHash);
    if (!tracked) return;

    for (const log of receipt.logs) {
      try {
        const parsed = executorIface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsed && parsed.name === "ArbitrageExecuted") {
          const gasCostWei = receipt.gasUsed * (receipt.effectiveGasPrice ?? receipt.gasPrice ?? 0n);
          const record: ProfitRecord = {
            txHash,
            token: parsed.args[0] as string,
            flashLoanAmount: tracked.tx.flashLoanAmount,
            gasCostWei,
            profitable: true,
            blockNumber: receipt.blockNumber,
            timestamp: Date.now(),
          };
          this._profitHistory.push(record);
          this.emit("profit", record);
        }
      } catch {
        // Not a matching event, skip
      }
    }
  }

  private formatParsedError(name: string, args: readonly unknown[]): string {
    switch (name) {
      case "InsufficientProfit":
        return `InsufficientProfit: received=${args[0]}, required=${args[1]}`;
      case "AdapterNotApproved":
        return `AdapterNotApproved: ${args[0]}`;
      case "EmptySwapSteps":
        return "EmptySwapSteps";
      case "NotAuthorized":
        return "NotAuthorized";
      case "ContractPaused":
        return "ContractPaused";
      case "ZeroAddress":
        return "ZeroAddress";
      case "ZeroAmount":
        return "ZeroAmount";
      default:
        return name;
    }
  }

  private recordFailure(): void {
    this._consecutiveFailures++;
    if (
      this.config.maxConsecutiveFailures > 0 &&
      this._consecutiveFailures >= this.config.maxConsecutiveFailures
    ) {
      this._paused = true;
      this.emit("paused", `Paused after ${this._consecutiveFailures} consecutive failures`);
    }
  }

  private resetFailures(): void {
    this._consecutiveFailures = 0;
  }

  private updateTracked(txHash: string, status: ExecutionStatus): void {
    const tracked = this._tracked.get(txHash);
    if (tracked) {
      tracked.status = status;
    }
  }

  private makeResult(
    status: ExecutionStatus,
    fields: Partial<ExecutionResult> = {},
  ): ExecutionResult {
    return {
      status,
      timestamp: Date.now(),
      ...fields,
    };
  }

  private applyMultiplier(value: bigint, multiplier: number): bigint {
    // Multiply in integer arithmetic: value * (multiplier * 1000) / 1000
    const factor = Math.round(multiplier * 1000);
    return (value * BigInt(factor)) / 1000n;
  }

  private timeout(ms: number): Promise<null> {
    return new Promise((resolve) => setTimeout(() => resolve(null), ms));
  }
}
