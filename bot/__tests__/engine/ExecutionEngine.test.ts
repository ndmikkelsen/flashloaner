import { describe, it, expect, beforeEach, vi } from "vitest";
import { AbiCoder, Interface, parseUnits } from "ethers";
import { ExecutionEngine } from "../../src/engine/ExecutionEngine.js";
import type { ExecutionSigner, TransactionReceipt } from "../../src/engine/ExecutionEngine.js";
import type { PreparedTransaction } from "../../src/builder/types.js";
import type { ExecutionResult, ProfitRecord } from "../../src/engine/types.js";
import { ADDRESSES } from "../helpers/index.js";

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const EXECUTOR_ADDRESS = ADDRESSES.EXECUTOR;
const BOT_WALLET = ADDRESSES.BOT_WALLET;
const TX_HASH = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
const TX_HASH_2 = "0x1111111111111111111111111111111111111111111111111111111111111111";

// ABI for encoding ArbitrageExecuted event
const executorIface = new Interface([
  "event ArbitrageExecuted(address indexed token, uint256 amount, uint256 profit)",
  "error InsufficientProfit(uint256 received, uint256 required)",
  "error NotAuthorized()",
  "error ContractPaused()",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePreparedTx(overrides: Partial<PreparedTransaction> = {}): PreparedTransaction {
  return {
    to: EXECUTOR_ADDRESS,
    data: "0x12345678",
    value: 0n,
    chainId: 1,
    steps: [],
    flashLoanProvider: ADDRESSES.AAVE_POOL,
    flashLoanToken: ADDRESSES.WETH,
    flashLoanAmount: parseUnits("10", 18),
    gas: {
      maxFeePerGas: parseUnits("62", "gwei"),
      maxPriorityFeePerGas: parseUnits("2", "gwei"),
      gasLimit: 400_000n,
    },
    nonce: 5,
    ...overrides,
  };
}

function makeSuccessReceipt(overrides: Partial<TransactionReceipt> = {}): TransactionReceipt {
  return {
    status: 1,
    blockNumber: 19_000_001,
    gasUsed: 250_000n,
    effectiveGasPrice: parseUnits("30", "gwei"),
    logs: [],
    ...overrides,
  };
}

function makeRevertReceipt(): TransactionReceipt {
  return {
    status: 0,
    blockNumber: 19_000_001,
    gasUsed: 150_000n,
    effectiveGasPrice: parseUnits("30", "gwei"),
    logs: [],
  };
}

function makeArbitrageExecutedLog() {
  const topic0 = executorIface.getEvent("ArbitrageExecuted")!.topicHash;
  const tokenTopic = AbiCoder.defaultAbiCoder().encode(["address"], [ADDRESSES.WETH]);
  const data = AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256"],
    [parseUnits("10", 18), parseUnits("0.05", 18)],
  );
  return {
    topics: [topic0, tokenTopic] as readonly string[],
    data,
    address: EXECUTOR_ADDRESS,
  };
}

function createMockSigner(overrides: Partial<ExecutionSigner> = {}): ExecutionSigner {
  const defaultWait = vi.fn().mockResolvedValue(makeSuccessReceipt());
  return {
    sendTransaction: vi.fn().mockResolvedValue({
      hash: TX_HASH,
      wait: defaultWait,
    }),
    getNonce: vi.fn().mockResolvedValue(5),
    call: vi.fn().mockResolvedValue("0x"),
    ...overrides,
  };
}

function createFailingSigner(error: Error): ExecutionSigner {
  return {
    sendTransaction: vi.fn().mockRejectedValue(error),
    getNonce: vi.fn().mockResolvedValue(0),
    call: vi.fn().mockResolvedValue("0x"),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ExecutionEngine", () => {
  let signer: ExecutionSigner;
  let engine: ExecutionEngine;

  beforeEach(() => {
    signer = createMockSigner();
    engine = new ExecutionEngine(signer);
  });

  // ─────────────────────────────────────────────
  // Constructor Tests
  // ─────────────────────────────────────────────

  describe("constructor", () => {
    it("sets default config values", () => {
      expect(engine.config.confirmations).toBe(1);
      expect(engine.config.confirmationTimeoutMs).toBe(120_000);
      expect(engine.config.maxConsecutiveFailures).toBe(5);
      expect(engine.config.dryRun).toBe(false);
      expect(engine.config.speedUpMultiplier).toBe(1.125);
    });

    it("accepts custom config", () => {
      const custom = new ExecutionEngine(signer, {
        confirmations: 3,
        confirmationTimeoutMs: 60_000,
        maxConsecutiveFailures: 10,
        dryRun: true,
        speedUpMultiplier: 1.2,
      });
      expect(custom.config.confirmations).toBe(3);
      expect(custom.config.confirmationTimeoutMs).toBe(60_000);
      expect(custom.config.maxConsecutiveFailures).toBe(10);
      expect(custom.config.dryRun).toBe(true);
      expect(custom.config.speedUpMultiplier).toBe(1.2);
    });

    it("throws if signer is not provided", () => {
      expect(() => new ExecutionEngine(null as unknown as ExecutionSigner)).toThrow(
        "Signer is required",
      );
    });

    it("starts unpaused with zero failures", () => {
      expect(engine.paused).toBe(false);
      expect(engine.consecutiveFailures).toBe(0);
    });
  });

  // ─────────────────────────────────────────────
  // executeTransaction Tests
  // ─────────────────────────────────────────────

  describe("executeTransaction", () => {
    it("submits transaction and returns confirmed result", async () => {
      const tx = makePreparedTx();
      const result = await engine.executeTransaction(tx);

      expect(result.status).toBe("confirmed");
      expect(result.txHash).toBe(TX_HASH);
      expect(result.blockNumber).toBe(19_000_001);
      expect(result.gasUsed).toBe(250_000n);
    });

    it("calls signer.sendTransaction with correct params", async () => {
      const tx = makePreparedTx();
      await engine.executeTransaction(tx);

      expect(signer.sendTransaction).toHaveBeenCalledWith({
        to: tx.to,
        data: tx.data,
        value: tx.value,
        maxFeePerGas: tx.gas.maxFeePerGas,
        maxPriorityFeePerGas: tx.gas.maxPriorityFeePerGas,
        gasLimit: tx.gas.gasLimit,
        nonce: tx.nonce,
        chainId: tx.chainId,
      });
    });

    it("emits submitted event", async () => {
      const submitted = vi.fn();
      engine.on("submitted", submitted);

      const tx = makePreparedTx();
      await engine.executeTransaction(tx);

      expect(submitted).toHaveBeenCalledWith(TX_HASH, tx);
    });

    it("emits confirmed event on success", async () => {
      const confirmed = vi.fn();
      engine.on("confirmed", confirmed);

      await engine.executeTransaction(makePreparedTx());

      expect(confirmed).toHaveBeenCalledTimes(1);
      expect(confirmed.mock.calls[0][0].status).toBe("confirmed");
    });

    it("tracks the transaction", async () => {
      await engine.executeTransaction(makePreparedTx());

      expect(engine.tracked.size).toBe(1);
      const tracked = engine.tracked.get(TX_HASH);
      expect(tracked).toBeDefined();
      expect(tracked!.status).toBe("confirmed");
    });

    it("resets consecutive failures on success", async () => {
      // Inject some failures directly, then succeed
      (engine as any)._consecutiveFailures = 3;
      await engine.executeTransaction(makePreparedTx());
      expect(engine.consecutiveFailures).toBe(0);
    });

    it("returns failed when engine is paused", async () => {
      (engine as any)._paused = true;

      const result = await engine.executeTransaction(makePreparedTx());
      expect(result.status).toBe("failed");
      expect(result.error).toContain("paused");
    });

    it("calculates gasCostWei correctly", async () => {
      const result = await engine.executeTransaction(makePreparedTx());

      // 250,000 gas * 30 gwei = 7,500,000 gwei = 0.0075 ETH
      expect(result.gasCostWei).toBe(250_000n * parseUnits("30", "gwei"));
    });
  });

  // ─────────────────────────────────────────────
  // Revert Handling Tests
  // ─────────────────────────────────────────────

  describe("revert handling", () => {
    it("returns reverted status when receipt.status is 0", async () => {
      const revertSigner = createMockSigner({
        sendTransaction: vi.fn().mockResolvedValue({
          hash: TX_HASH,
          wait: vi.fn().mockResolvedValue(makeRevertReceipt()),
        }),
      });
      const revertEngine = new ExecutionEngine(revertSigner);

      const result = await revertEngine.executeTransaction(makePreparedTx());
      expect(result.status).toBe("reverted");
      expect(result.revertReason).toBe("Transaction reverted on-chain");
    });

    it("emits reverted event", async () => {
      const reverted = vi.fn();
      const revertSigner = createMockSigner({
        sendTransaction: vi.fn().mockResolvedValue({
          hash: TX_HASH,
          wait: vi.fn().mockResolvedValue(makeRevertReceipt()),
        }),
      });
      const revertEngine = new ExecutionEngine(revertSigner);
      revertEngine.on("reverted", reverted);

      await revertEngine.executeTransaction(makePreparedTx());
      expect(reverted).toHaveBeenCalledTimes(1);
    });

    it("increments consecutive failures on revert", async () => {
      const revertSigner = createMockSigner({
        sendTransaction: vi.fn().mockResolvedValue({
          hash: TX_HASH,
          wait: vi.fn().mockResolvedValue(makeRevertReceipt()),
        }),
      });
      const revertEngine = new ExecutionEngine(revertSigner);

      await revertEngine.executeTransaction(makePreparedTx());
      expect(revertEngine.consecutiveFailures).toBe(1);

      await revertEngine.executeTransaction(makePreparedTx());
      expect(revertEngine.consecutiveFailures).toBe(2);
    });
  });

  // ─────────────────────────────────────────────
  // Submission Failure Tests
  // ─────────────────────────────────────────────

  describe("submission failure", () => {
    it("returns failed when sendTransaction throws", async () => {
      const failSigner = createFailingSigner(new Error("insufficient funds"));
      const failEngine = new ExecutionEngine(failSigner);
      failEngine.on("error", () => {}); // Prevent unhandled error event

      const result = await failEngine.executeTransaction(makePreparedTx());
      expect(result.status).toBe("failed");
      expect(result.error).toBe("insufficient funds");
    });

    it("emits failed and error events", async () => {
      const failed = vi.fn();
      const errHandler = vi.fn();
      const failSigner = createFailingSigner(new Error("nonce too low"));
      const failEngine = new ExecutionEngine(failSigner);
      failEngine.on("failed", failed);
      failEngine.on("error", errHandler);

      await failEngine.executeTransaction(makePreparedTx());

      expect(failed).toHaveBeenCalledTimes(1);
      expect(errHandler).toHaveBeenCalledTimes(1);
      expect(errHandler.mock.calls[0][0].message).toBe("nonce too low");
    });

    it("increments consecutive failures", async () => {
      const failSigner = createFailingSigner(new Error("fail"));
      const failEngine = new ExecutionEngine(failSigner);
      failEngine.on("error", () => {}); // Prevent unhandled error event

      await failEngine.executeTransaction(makePreparedTx());
      expect(failEngine.consecutiveFailures).toBe(1);
    });
  });

  // ─────────────────────────────────────────────
  // Circuit Breaker Tests
  // ─────────────────────────────────────────────

  describe("circuit breaker", () => {
    it("pauses after maxConsecutiveFailures", async () => {
      const failSigner = createFailingSigner(new Error("fail"));
      const failEngine = new ExecutionEngine(failSigner, {
        maxConsecutiveFailures: 3,
      });
      failEngine.on("error", () => {}); // Prevent unhandled error event

      await failEngine.executeTransaction(makePreparedTx());
      await failEngine.executeTransaction(makePreparedTx());
      expect(failEngine.paused).toBe(false);

      await failEngine.executeTransaction(makePreparedTx());
      expect(failEngine.paused).toBe(true);
      expect(failEngine.consecutiveFailures).toBe(3);
    });

    it("emits paused event when circuit breaker trips", async () => {
      const paused = vi.fn();
      const failSigner = createFailingSigner(new Error("fail"));
      const failEngine = new ExecutionEngine(failSigner, {
        maxConsecutiveFailures: 2,
      });
      failEngine.on("paused", paused);
      failEngine.on("error", () => {}); // Prevent unhandled error event

      await failEngine.executeTransaction(makePreparedTx());
      await failEngine.executeTransaction(makePreparedTx());

      expect(paused).toHaveBeenCalledTimes(1);
      expect(paused.mock.calls[0][0]).toContain("2 consecutive failures");
    });

    it("rejects execution when paused", async () => {
      const failSigner = createFailingSigner(new Error("fail"));
      const failEngine = new ExecutionEngine(failSigner, {
        maxConsecutiveFailures: 1,
      });
      failEngine.on("error", () => {}); // Prevent unhandled error event

      await failEngine.executeTransaction(makePreparedTx());
      expect(failEngine.paused).toBe(true);

      const result = await failEngine.executeTransaction(makePreparedTx());
      expect(result.status).toBe("failed");
      expect(result.error).toContain("paused");
    });

    it("resumes after calling resume()", async () => {
      const failSigner = createFailingSigner(new Error("fail"));
      const failEngine = new ExecutionEngine(failSigner, {
        maxConsecutiveFailures: 1,
      });
      failEngine.on("error", () => {}); // Prevent unhandled error event

      await failEngine.executeTransaction(makePreparedTx());
      expect(failEngine.paused).toBe(true);

      failEngine.resume();
      expect(failEngine.paused).toBe(false);
      expect(failEngine.consecutiveFailures).toBe(0);
    });

    it("does not pause when maxConsecutiveFailures is 0 (disabled)", async () => {
      const failSigner = createFailingSigner(new Error("fail"));
      const failEngine = new ExecutionEngine(failSigner, {
        maxConsecutiveFailures: 0,
      });
      failEngine.on("error", () => {}); // Prevent unhandled error event

      for (let i = 0; i < 10; i++) {
        await failEngine.executeTransaction(makePreparedTx());
      }
      expect(failEngine.paused).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  // Pre-flight Simulation Tests
  // ─────────────────────────────────────────────

  describe("pre-flight simulation", () => {
    it("calls signer.call before sendTransaction", async () => {
      const tx = makePreparedTx();
      await engine.executeTransaction(tx);

      expect(signer.call).toHaveBeenCalledWith({
        to: tx.to,
        data: tx.data,
        value: tx.value,
      });
      // call should happen before sendTransaction
      const callOrder = (signer.call as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
      const sendOrder = (signer.sendTransaction as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
      expect(callOrder).toBeLessThan(sendOrder);
    });

    it("skips submission when simulation reverts", async () => {
      const simFailSigner = createMockSigner({
        call: vi.fn().mockRejectedValue(new Error("execution reverted: InsufficientProfit")),
      });
      const simEngine = new ExecutionEngine(simFailSigner);

      const result = await simEngine.executeTransaction(makePreparedTx());

      expect(result.status).toBe("failed");
      expect(result.error).toContain("Simulation reverted");
      expect(simFailSigner.sendTransaction).not.toHaveBeenCalled();
    });

    it("emits simulationFailed event with revert reason", async () => {
      const simFailed = vi.fn();
      const simFailSigner = createMockSigner({
        call: vi.fn().mockRejectedValue(new Error("execution reverted: InsufficientProfit")),
      });
      const simEngine = new ExecutionEngine(simFailSigner);
      simEngine.on("simulationFailed", simFailed);

      await simEngine.executeTransaction(makePreparedTx());

      expect(simFailed).toHaveBeenCalled();
    });

    it("parses InsufficientProfit from simulation revert data", async () => {
      const revertData = executorIface.encodeErrorResult("InsufficientProfit", [
        parseUnits("9.99", 18),
        parseUnits("10.01", 18),
      ]);
      const simFailSigner = createMockSigner({
        call: vi.fn().mockRejectedValue({ data: revertData }),
      });
      const simEngine = new ExecutionEngine(simFailSigner);

      const result = await simEngine.executeTransaction(makePreparedTx());

      expect(result.status).toBe("failed");
      expect(result.revertReason).toContain("InsufficientProfit");
      expect(simFailSigner.sendTransaction).not.toHaveBeenCalled();
    });

    it("proceeds to submit when simulation succeeds", async () => {
      const tx = makePreparedTx();
      await engine.executeTransaction(tx);

      expect(signer.call).toHaveBeenCalled();
      expect(signer.sendTransaction).toHaveBeenCalled();
    });

    it("skips simulation when signer.call is not available", async () => {
      const noCallSigner = createMockSigner();
      delete (noCallSigner as any).call;
      const noCallEngine = new ExecutionEngine(noCallSigner);

      const result = await noCallEngine.executeTransaction(makePreparedTx());

      expect(result.status).toBe("confirmed");
      expect(noCallSigner.sendTransaction).toHaveBeenCalled();
    });

    it("does not count simulation failure as consecutive failure", async () => {
      const simFailSigner = createMockSigner({
        call: vi.fn().mockRejectedValue(new Error("revert")),
      });
      const simEngine = new ExecutionEngine(simFailSigner);

      await simEngine.executeTransaction(makePreparedTx());

      // Simulation failures should not trip the circuit breaker —
      // they saved us gas, not cost us anything
      expect(simEngine.consecutiveFailures).toBe(0);
      expect(simEngine.paused).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  // Dry Run Tests
  // ─────────────────────────────────────────────

  describe("dry run mode", () => {
    it("returns confirmed without submitting", async () => {
      const dryEngine = new ExecutionEngine(signer, { dryRun: true });
      const result = await dryEngine.executeTransaction(makePreparedTx());

      expect(result.status).toBe("confirmed");
      expect(signer.sendTransaction).not.toHaveBeenCalled();
    });

    it("emits confirmed event in dry run", async () => {
      const confirmed = vi.fn();
      const dryEngine = new ExecutionEngine(signer, { dryRun: true });
      dryEngine.on("confirmed", confirmed);

      await dryEngine.executeTransaction(makePreparedTx());
      expect(confirmed).toHaveBeenCalledTimes(1);
    });

    it("uses zero hash in dry run", async () => {
      const dryEngine = new ExecutionEngine(signer, { dryRun: true });
      const result = await dryEngine.executeTransaction(makePreparedTx());
      expect(result.txHash).toBe(`0x${"0".repeat(64)}`);
    });
  });

  // ─────────────────────────────────────────────
  // Speed Up Tests
  // ─────────────────────────────────────────────

  describe("buildSpeedUp", () => {
    it("returns new tx with increased gas prices", async () => {
      // Submit but don't confirm — need the tx to be "submitted" status
      const pendingSigner = createMockSigner({
        sendTransaction: vi.fn().mockResolvedValue({
          hash: TX_HASH,
          wait: vi.fn().mockImplementation(() => new Promise(() => {})), // Never resolves
        }),
      });
      const pendingEngine = new ExecutionEngine(pendingSigner);

      // Manually track as submitted
      const tx = makePreparedTx();
      (pendingEngine as any)._tracked.set(TX_HASH, {
        tx,
        txHash: TX_HASH,
        submittedAt: Date.now(),
        status: "submitted",
        replacements: 0,
      });

      const speedUp = pendingEngine.buildSpeedUp(TX_HASH);

      // 1.125x multiplier increases gas prices
      expect(speedUp.gas.maxFeePerGas).toBeGreaterThan(tx.gas.maxFeePerGas);
      expect(speedUp.gas.maxPriorityFeePerGas).toBeGreaterThanOrEqual(tx.gas.maxPriorityFeePerGas);
      expect(speedUp.gas.gasLimit).toBe(tx.gas.gasLimit);
      expect(speedUp.nonce).toBe(tx.nonce); // Same nonce
    });

    it("throws for unknown txHash", () => {
      expect(() => engine.buildSpeedUp("0xunknown")).toThrow("Transaction not tracked");
    });

    it("throws for non-submitted transaction", async () => {
      await engine.executeTransaction(makePreparedTx());
      // TX is now "confirmed", not "submitted"
      expect(() => engine.buildSpeedUp(TX_HASH)).toThrow("Cannot speed up");
    });
  });

  // ─────────────────────────────────────────────
  // Cancellation Tests
  // ─────────────────────────────────────────────

  describe("buildCancellation", () => {
    it("returns self-transfer with same nonce and higher gas", () => {
      const tx = makePreparedTx();
      (engine as any)._tracked.set(TX_HASH, {
        tx,
        txHash: TX_HASH,
        submittedAt: Date.now(),
        status: "submitted",
        replacements: 0,
      });

      const cancel = engine.buildCancellation(TX_HASH, BOT_WALLET);

      expect(cancel.to).toBe(BOT_WALLET);
      expect(cancel.data).toBe("0x");
      expect(cancel.value).toBe(0n);
      expect(cancel.gas.gasLimit).toBe(21_000n);
      expect(cancel.gas.maxFeePerGas).toBeGreaterThan(tx.gas.maxFeePerGas);
      expect(cancel.nonce).toBe(tx.nonce);
    });

    it("throws for unknown txHash", () => {
      expect(() => engine.buildCancellation("0xunknown", BOT_WALLET)).toThrow(
        "Transaction not tracked",
      );
    });
  });

  // ─────────────────────────────────────────────
  // markReplaced Tests
  // ─────────────────────────────────────────────

  describe("markReplaced", () => {
    it("updates tracked status and emits replaced event", () => {
      const replaced = vi.fn();
      engine.on("replaced", replaced);

      const tx = makePreparedTx();
      (engine as any)._tracked.set(TX_HASH, {
        tx,
        txHash: TX_HASH,
        submittedAt: Date.now(),
        status: "submitted",
        replacements: 0,
      });

      engine.markReplaced(TX_HASH, TX_HASH_2);

      expect(engine.tracked.get(TX_HASH)!.status).toBe("replaced");
      expect(replaced).toHaveBeenCalledWith(TX_HASH, TX_HASH_2);
    });
  });

  // ─────────────────────────────────────────────
  // parseRevertReason Tests
  // ─────────────────────────────────────────────

  describe("parseRevertReason", () => {
    it("parses InsufficientProfit error data", () => {
      const data = executorIface.encodeErrorResult("InsufficientProfit", [
        parseUnits("9.99", 18),
        parseUnits("10.01", 18),
      ]);
      const reason = engine.parseRevertReason({ data });
      expect(reason).toContain("InsufficientProfit");
      expect(reason).toContain("received=");
    });

    it("parses NotAuthorized error data", () => {
      const data = executorIface.encodeErrorResult("NotAuthorized", []);
      const reason = engine.parseRevertReason({ data });
      expect(reason).toBe("NotAuthorized");
    });

    it("parses ContractPaused error data", () => {
      const data = executorIface.encodeErrorResult("ContractPaused", []);
      const reason = engine.parseRevertReason({ data });
      expect(reason).toBe("ContractPaused");
    });

    it("extracts reason string from error", () => {
      const reason = engine.parseRevertReason({ reason: "execution reverted" });
      expect(reason).toBe("execution reverted");
    });

    it("extracts reason from error message pattern", () => {
      const reason = engine.parseRevertReason({
        message: 'call revert exception; reason="Gas too high"',
      });
      expect(reason).toBe("Gas too high");
    });

    it("returns undefined for non-object input", () => {
      expect(engine.parseRevertReason(null)).toBeUndefined();
      expect(engine.parseRevertReason("string")).toBeUndefined();
      expect(engine.parseRevertReason(42)).toBeUndefined();
    });

    it("returns undefined for unknown error data", () => {
      const reason = engine.parseRevertReason({ data: "0xdeadbeef" });
      expect(reason).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────
  // Profit Tracking Tests
  // ─────────────────────────────────────────────

  describe("profit tracking", () => {
    it("records profit from ArbitrageExecuted event", async () => {
      const profitHandler = vi.fn();
      const arbLog = makeArbitrageExecutedLog();

      const profitSigner = createMockSigner({
        sendTransaction: vi.fn().mockResolvedValue({
          hash: TX_HASH,
          wait: vi.fn().mockResolvedValue(makeSuccessReceipt({ logs: [arbLog] })),
        }),
      });
      const profitEngine = new ExecutionEngine(profitSigner);
      profitEngine.on("profit", profitHandler);

      await profitEngine.executeTransaction(makePreparedTx());

      expect(profitHandler).toHaveBeenCalledTimes(1);
      const record: ProfitRecord = profitHandler.mock.calls[0][0];
      expect(record.txHash).toBe(TX_HASH);
      expect(record.token).toBe(ADDRESSES.WETH);
      expect(record.profitable).toBe(true);
      expect(record.blockNumber).toBe(19_000_001);
    });

    it("adds to profit history", async () => {
      const arbLog = makeArbitrageExecutedLog();
      const profitSigner = createMockSigner({
        sendTransaction: vi.fn().mockResolvedValue({
          hash: TX_HASH,
          wait: vi.fn().mockResolvedValue(makeSuccessReceipt({ logs: [arbLog] })),
        }),
      });
      const profitEngine = new ExecutionEngine(profitSigner);

      await profitEngine.executeTransaction(makePreparedTx());

      expect(profitEngine.profitHistory).toHaveLength(1);
      expect(profitEngine.profitHistory[0].txHash).toBe(TX_HASH);
    });

    it("does not record profit when no ArbitrageExecuted event", async () => {
      const profitHandler = vi.fn();
      engine.on("profit", profitHandler);

      await engine.executeTransaction(makePreparedTx());

      expect(profitHandler).not.toHaveBeenCalled();
      expect(engine.profitHistory).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────
  // Timeout Tests
  // ─────────────────────────────────────────────

  describe("confirmation timeout", () => {
    it("returns failed when wait times out", async () => {
      const hangSigner = createMockSigner({
        sendTransaction: vi.fn().mockResolvedValue({
          hash: TX_HASH,
          wait: vi.fn().mockImplementation(
            () => new Promise((resolve) => setTimeout(() => resolve(null), 500)),
          ),
        }),
      });
      const timeoutEngine = new ExecutionEngine(hangSigner, {
        confirmationTimeoutMs: 50,
      });

      const result = await timeoutEngine.executeTransaction(makePreparedTx());
      expect(result.status).toBe("failed");
      expect(result.error).toContain("timed out");
    });
  });

  // ─────────────────────────────────────────────
  // Gas Multiplier Tests
  // ─────────────────────────────────────────────

  describe("gas multiplier", () => {
    it("applies 1.125x multiplier to speed-up gas", () => {
      const tx = makePreparedTx({
        gas: {
          maxFeePerGas: 1000n,
          maxPriorityFeePerGas: 100n,
          gasLimit: 400_000n,
        },
      });
      (engine as any)._tracked.set(TX_HASH, {
        tx,
        txHash: TX_HASH,
        submittedAt: Date.now(),
        status: "submitted",
        replacements: 0,
      });

      const speedUp = engine.buildSpeedUp(TX_HASH);

      // 1000 * 1.125 = 1125
      expect(speedUp.gas.maxFeePerGas).toBe(1125n);
      // 100 * 1125 / 1000 = 112 (integer truncation)
      expect(speedUp.gas.maxPriorityFeePerGas).toBe(112n);
    });

    it("uses custom multiplier", () => {
      const customEngine = new ExecutionEngine(signer, { speedUpMultiplier: 1.5 });
      const tx = makePreparedTx({
        gas: {
          maxFeePerGas: 1000n,
          maxPriorityFeePerGas: 100n,
          gasLimit: 400_000n,
        },
      });
      (customEngine as any)._tracked.set(TX_HASH, {
        tx,
        txHash: TX_HASH,
        submittedAt: Date.now(),
        status: "submitted",
        replacements: 0,
      });

      const speedUp = customEngine.buildSpeedUp(TX_HASH);
      expect(speedUp.gas.maxFeePerGas).toBe(1500n);
      expect(speedUp.gas.maxPriorityFeePerGas).toBe(150n);
    });
  });

  // ─────────────────────────────────────────────
  // Resume Tests
  // ─────────────────────────────────────────────

  describe("resume", () => {
    it("clears paused state and failure counter", () => {
      (engine as any)._paused = true;
      (engine as any)._consecutiveFailures = 5;

      engine.resume();

      expect(engine.paused).toBe(false);
      expect(engine.consecutiveFailures).toBe(0);
    });
  });
});
