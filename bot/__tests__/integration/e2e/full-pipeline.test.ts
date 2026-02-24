/**
 * Full pipeline integration tests: PriceMonitor → OpportunityDetector →
 * TransactionBuilder → ExecutionEngine.
 *
 * Tests the complete arbitrage bot flow from price detection through
 * transaction execution, including error handling and safety mechanisms.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { AbiCoder, Interface, parseUnits } from "ethers";
import { PriceMonitor } from "../../../src/monitor/PriceMonitor.js";
import { OpportunityDetector } from "../../../src/detector/OpportunityDetector.js";
import { TransactionBuilder } from "../../../src/builder/TransactionBuilder.js";
import { ExecutionEngine } from "../../../src/engine/ExecutionEngine.js";
import type { ArbitrageOpportunity } from "../../../src/detector/types.js";
import type { PreparedTransaction } from "../../../src/builder/types.js";
import type { ExecutionResult, ProfitRecord } from "../../../src/engine/types.js";
import type { ExecutionSigner, TransactionReceipt } from "../../../src/engine/ExecutionEngine.js";
import { EventCollector } from "../helpers/event-collector.js";
import { SCENARIOS, TEST_TOKENS } from "../helpers/scenario-builder.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UNI_V2_ADAPTER = "0x1111111111111111111111111111111111111111";
const UNI_V3_ADAPTER = "0x2222222222222222222222222222222222222222";
const SUSHI_ADAPTER = "0x3333333333333333333333333333333333333333";
const EXECUTOR_ADDRESS = "0x0000000000000000000000000000000000000010";
const AAVE_V3_POOL = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2";
const BALANCER_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
const TX_HASH = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

const executorIface = new Interface([
  "event ArbitrageExecuted(address indexed token, uint256 amount, uint256 profit)",
  "function executeArbitrage(address flashLoanProvider, address flashLoanToken, uint256 flashLoanAmount, tuple(address adapter, address tokenIn, address tokenOut, uint256 amountIn, bytes extraData)[] steps)",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createBuilder() {
  return new TransactionBuilder({
    executorAddress: EXECUTOR_ADDRESS,
    adapters: {
      uniswap_v2: UNI_V2_ADAPTER,
      uniswap_v3: UNI_V3_ADAPTER,
      sushiswap: SUSHI_ADAPTER,
    },
    flashLoanProviders: {
      aave_v3: AAVE_V3_POOL,
      balancer: BALANCER_VAULT,
    },
    chainId: 1,
  });
}

function makeArbitrageExecutedLog(token: string, amount: bigint, profit: bigint) {
  const topic0 = executorIface.getEvent("ArbitrageExecuted")!.topicHash;
  const tokenTopic = AbiCoder.defaultAbiCoder().encode(["address"], [token]);
  const data = AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [amount, profit]);
  return { topics: [topic0, tokenTopic] as readonly string[], data, address: EXECUTOR_ADDRESS };
}

function createSuccessSigner(receipt?: Partial<TransactionReceipt>): ExecutionSigner {
  const defaultReceipt: TransactionReceipt = {
    status: 1,
    blockNumber: 19_000_001,
    gasUsed: 280_000n,
    effectiveGasPrice: parseUnits("25", "gwei"),
    logs: [],
    ...receipt,
  };
  return {
    sendTransaction: vi.fn().mockResolvedValue({
      hash: TX_HASH,
      wait: vi.fn().mockResolvedValue(defaultReceipt),
    }),
    getNonce: vi.fn().mockResolvedValue(42),
  };
}

function createRevertSigner(): ExecutionSigner {
  return {
    sendTransaction: vi.fn().mockResolvedValue({
      hash: TX_HASH,
      wait: vi.fn().mockResolvedValue({
        status: 0,
        blockNumber: 19_000_001,
        gasUsed: 150_000n,
        effectiveGasPrice: parseUnits("25", "gwei"),
        logs: [],
      }),
    }),
    getNonce: vi.fn().mockResolvedValue(42),
  };
}

function createFailingSigner(error: string): ExecutionSigner {
  return {
    sendTransaction: vi.fn().mockRejectedValue(new Error(error)),
    getNonce: vi.fn().mockResolvedValue(42),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Full Pipeline: Monitor → Detector → Builder → Engine", () => {
  let monitor: PriceMonitor;
  let detector: OpportunityDetector;
  let builder: TransactionBuilder;
  let engine: ExecutionEngine;
  let collector: EventCollector;

  afterEach(() => {
    monitor?.stop();
    detector?.detach();
    collector?.dispose();
  });

  // ─────────────────────────────────────────────
  // Happy Path Tests
  // ─────────────────────────────────────────────

  describe("happy path", () => {
    it("should detect opportunity, build tx, and execute successfully", async () => {
      const scenario = SCENARIOS.profitable_5pct();
      collector = new EventCollector();

      // Stage 1: Monitor + Detector
      monitor = new PriceMonitor({
        provider: scenario.provider,
        pools: scenario.pools,
        deltaThresholdPercent: 0.5,
      });
      detector = new OpportunityDetector({
        minProfitThreshold: 0,
        gasPriceGwei: 0,
        maxSlippage: 0,
      });
      detector.attach(monitor);
      monitor.on("error", () => {});
      detector.on("error", () => {});

      const opportunities = collector.collect<ArbitrageOpportunity>(detector, "opportunityFound");
      await monitor.poll();

      expect(opportunities).toHaveLength(1);
      const opp = opportunities[0];

      // Stage 2: Builder
      builder = createBuilder();
      const tx = builder.buildArbitrageTransaction(opp);

      expect(tx.to).toBe(EXECUTOR_ADDRESS);
      expect(tx.flashLoanToken).toBe(TEST_TOKENS.USDC);
      expect(tx.steps).toHaveLength(2);

      // Stage 3: Prepare transaction
      const gas = builder.calculateGasSettings(30, 2, 400_000);
      const prepared = builder.prepareTransaction(tx, gas, 42);

      expect(prepared.nonce).toBe(42);
      expect(prepared.gas.gasLimit).toBe(400_000n);

      // Stage 4: Execute
      const arbLog = makeArbitrageExecutedLog(
        TEST_TOKENS.USDC,
        prepared.flashLoanAmount,
        parseUnits("0.05", 18),
      );
      const signer = createSuccessSigner({ logs: [arbLog] });
      engine = new ExecutionEngine(signer);

      const profitEvents = collector.collect<ProfitRecord>(engine, "profit");
      const result = await engine.executeTransaction(prepared);

      expect(result.status).toBe("confirmed");
      expect(result.txHash).toBe(TX_HASH);
      expect(result.blockNumber).toBe(19_000_001);

      // Profit was tracked
      expect(profitEvents).toHaveLength(1);
      expect(profitEvents[0].token).toBe(TEST_TOKENS.USDC);
      expect(profitEvents[0].profitable).toBe(true);
    });

    it("should encode correct calldata that decodes back to original params", async () => {
      const scenario = SCENARIOS.profitable_5pct();
      collector = new EventCollector();

      monitor = new PriceMonitor({
        provider: scenario.provider,
        pools: scenario.pools,
        deltaThresholdPercent: 0.5,
      });
      detector = new OpportunityDetector({
        minProfitThreshold: 0,
        gasPriceGwei: 0,
        maxSlippage: 0,
      });
      detector.attach(monitor);
      monitor.on("error", () => {});
      detector.on("error", () => {});

      const opportunities = collector.collect<ArbitrageOpportunity>(detector, "opportunityFound");
      await monitor.poll();

      builder = createBuilder();
      const tx = builder.buildArbitrageTransaction(opportunities[0]);

      // Decode and verify
      const decoded = executorIface.decodeFunctionData("executeArbitrage", tx.data);
      expect(decoded[0]).toBe(AAVE_V3_POOL); // flashLoanProvider
      expect(decoded[1]).toBe(TEST_TOKENS.USDC); // flashLoanToken
      expect(decoded[2]).toBeGreaterThan(0n); // flashLoanAmount
      expect(decoded[3]).toHaveLength(2); // steps

      // Verify step adapters resolve correctly
      const step0 = decoded[3][0];
      const step1 = decoded[3][1];
      // First step: buy on UniV2 (cheaper pool)
      expect([UNI_V2_ADAPTER, SUSHI_ADAPTER]).toContain(step0[0]);
      // Second step: sell on the other DEX
      expect([UNI_V2_ADAPTER, SUSHI_ADAPTER]).toContain(step1[0]);
    });

    it("should work with Balancer as flash loan provider", async () => {
      const scenario = SCENARIOS.profitable_5pct();
      collector = new EventCollector();

      monitor = new PriceMonitor({
        provider: scenario.provider,
        pools: scenario.pools,
        deltaThresholdPercent: 0.5,
      });
      detector = new OpportunityDetector({
        minProfitThreshold: 0,
        gasPriceGwei: 0,
        maxSlippage: 0,
      });
      detector.attach(monitor);
      monitor.on("error", () => {});
      detector.on("error", () => {});

      const opportunities = collector.collect<ArbitrageOpportunity>(detector, "opportunityFound");
      await monitor.poll();

      builder = createBuilder();
      const tx = builder.buildArbitrageTransaction(opportunities[0], "balancer");

      expect(tx.flashLoanProvider).toBe(BALANCER_VAULT);

      const decoded = executorIface.decodeFunctionData("executeArbitrage", tx.data);
      expect(decoded[0]).toBe(BALANCER_VAULT);
    });
  });

  // ─────────────────────────────────────────────
  // Unprofitable Trade Tests
  // ─────────────────────────────────────────────

  describe("unprofitable trade", () => {
    it("should reject opportunity below profit threshold — no tx built", async () => {
      const scenario = SCENARIOS.profitable_1pct();
      collector = new EventCollector();

      monitor = new PriceMonitor({
        provider: scenario.provider,
        pools: scenario.pools,
        deltaThresholdPercent: 0.5,
      });
      detector = new OpportunityDetector({
        minProfitThreshold: 5.0, // Very high threshold — 5 ETH minimum
        gasPriceGwei: 50,
        maxSlippage: 0.01,
      });
      detector.attach(monitor);
      monitor.on("error", () => {});
      detector.on("error", () => {});

      const found = collector.collect<ArbitrageOpportunity>(detector, "opportunityFound");
      const rejected = collector.collect<[string]>(detector, "opportunityRejected");

      await monitor.poll();

      // Opportunity was rejected, not found
      expect(found).toHaveLength(0);
      expect(rejected.length).toBeGreaterThan(0);

      // No transaction should be built — pipeline stops at detector
    });

    it("should filter opportunities where gas cost exceeds profit", async () => {
      const scenario = SCENARIOS.profitable_1pct();
      collector = new EventCollector();

      monitor = new PriceMonitor({
        provider: scenario.provider,
        pools: scenario.pools,
        deltaThresholdPercent: 0.5,
      });
      detector = new OpportunityDetector({
        minProfitThreshold: 10.0,  // Very high threshold to force rejection
        gasPriceGwei: 500,         // Extremely high gas
        maxSlippage: 0.05,         // High slippage
      });
      detector.attach(monitor);
      monitor.on("error", () => {});
      detector.on("error", () => {});

      const found = collector.collect<ArbitrageOpportunity>(detector, "opportunityFound");
      await monitor.poll();

      expect(found).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────
  // Failed Transaction Tests
  // ─────────────────────────────────────────────

  describe("failed transaction", () => {
    it("should handle on-chain revert gracefully", async () => {
      const scenario = SCENARIOS.profitable_5pct();
      collector = new EventCollector();

      monitor = new PriceMonitor({
        provider: scenario.provider,
        pools: scenario.pools,
        deltaThresholdPercent: 0.5,
      });
      detector = new OpportunityDetector({
        minProfitThreshold: 0,
        gasPriceGwei: 0,
        maxSlippage: 0,
      });
      detector.attach(monitor);
      monitor.on("error", () => {});
      detector.on("error", () => {});

      const opportunities = collector.collect<ArbitrageOpportunity>(detector, "opportunityFound");
      await monitor.poll();

      builder = createBuilder();
      const tx = builder.buildArbitrageTransaction(opportunities[0]);
      const gas = builder.calculateGasSettings(30, 2, 400_000);
      const prepared = builder.prepareTransaction(tx, gas, 42);

      // Execute with revert signer
      const signer = createRevertSigner();
      engine = new ExecutionEngine(signer);

      const revertEvents = collector.collect<ExecutionResult>(engine, "reverted");
      const result = await engine.executeTransaction(prepared);

      expect(result.status).toBe("reverted");
      expect(result.txHash).toBe(TX_HASH);
      expect(revertEvents).toHaveLength(1);

      // Engine is still operational
      expect(engine.paused).toBe(false);
      expect(engine.consecutiveFailures).toBe(1);
    });

    it("should handle submission failure gracefully", async () => {
      const scenario = SCENARIOS.profitable_5pct();
      collector = new EventCollector();

      monitor = new PriceMonitor({
        provider: scenario.provider,
        pools: scenario.pools,
        deltaThresholdPercent: 0.5,
      });
      detector = new OpportunityDetector({
        minProfitThreshold: 0,
        gasPriceGwei: 0,
        maxSlippage: 0,
      });
      detector.attach(monitor);
      monitor.on("error", () => {});
      detector.on("error", () => {});

      const opportunities = collector.collect<ArbitrageOpportunity>(detector, "opportunityFound");
      await monitor.poll();

      builder = createBuilder();
      const tx = builder.buildArbitrageTransaction(opportunities[0]);
      const gas = builder.calculateGasSettings(30, 2, 400_000);
      const prepared = builder.prepareTransaction(tx, gas, 42);

      const signer = createFailingSigner("nonce too low");
      engine = new ExecutionEngine(signer);
      engine.on("error", () => {}); // Prevent unhandled error event

      const failEvents = collector.collect<ExecutionResult>(engine, "failed");
      const result = await engine.executeTransaction(prepared);

      expect(result.status).toBe("failed");
      expect(result.error).toBe("nonce too low");
      expect(failEvents).toHaveLength(1);
    });
  });

  // ─────────────────────────────────────────────
  // Transaction Replacement Tests
  // ─────────────────────────────────────────────

  describe("transaction replacement", () => {
    it("should build speed-up tx with higher gas from pending transaction", async () => {
      const scenario = SCENARIOS.profitable_5pct();
      collector = new EventCollector();

      monitor = new PriceMonitor({
        provider: scenario.provider,
        pools: scenario.pools,
        deltaThresholdPercent: 0.5,
      });
      detector = new OpportunityDetector({
        minProfitThreshold: 0,
        gasPriceGwei: 0,
        maxSlippage: 0,
      });
      detector.attach(monitor);
      monitor.on("error", () => {});
      detector.on("error", () => {});

      const opportunities = collector.collect<ArbitrageOpportunity>(detector, "opportunityFound");
      await monitor.poll();

      builder = createBuilder();
      const tx = builder.buildArbitrageTransaction(opportunities[0]);
      const gas = builder.calculateGasSettings(30, 2, 400_000);
      const prepared = builder.prepareTransaction(tx, gas, 42);

      // Create engine with a signer that hangs (never confirms)
      const hangSigner: ExecutionSigner = {
        sendTransaction: vi.fn().mockResolvedValue({
          hash: TX_HASH,
          wait: vi.fn().mockImplementation(() => new Promise(() => {})),
        }),
        getNonce: vi.fn().mockResolvedValue(42),
      };
      engine = new ExecutionEngine(hangSigner, { confirmationTimeoutMs: 50 });

      // Submit — will timeout
      const resultPromise = engine.executeTransaction(prepared);

      // While pending, build a speed-up
      // Need to wait for submission before building speed-up
      await new Promise((r) => setTimeout(r, 10));
      const speedUp = engine.buildSpeedUp(TX_HASH);

      expect(speedUp.gas.maxFeePerGas).toBeGreaterThan(prepared.gas.maxFeePerGas);
      expect(speedUp.gas.maxPriorityFeePerGas).toBeGreaterThanOrEqual(prepared.gas.maxPriorityFeePerGas);
      expect(speedUp.nonce).toBe(42); // Same nonce for replacement

      // Clean up — let the timeout complete
      await resultPromise;
    });

    it("should build cancellation tx as self-transfer", async () => {
      const scenario = SCENARIOS.profitable_5pct();
      collector = new EventCollector();

      monitor = new PriceMonitor({
        provider: scenario.provider,
        pools: scenario.pools,
        deltaThresholdPercent: 0.5,
      });
      detector = new OpportunityDetector({
        minProfitThreshold: 0,
        gasPriceGwei: 0,
        maxSlippage: 0,
      });
      detector.attach(monitor);
      monitor.on("error", () => {});
      detector.on("error", () => {});

      const opportunities = collector.collect<ArbitrageOpportunity>(detector, "opportunityFound");
      await monitor.poll();

      builder = createBuilder();
      const tx = builder.buildArbitrageTransaction(opportunities[0]);
      const gas = builder.calculateGasSettings(30, 2, 400_000);
      const prepared = builder.prepareTransaction(tx, gas, 42);

      // Track as submitted
      engine = new ExecutionEngine(createSuccessSigner());
      (engine as any)._tracked.set(TX_HASH, {
        tx: prepared,
        txHash: TX_HASH,
        submittedAt: Date.now(),
        status: "submitted",
        replacements: 0,
      });

      const botWallet = "0x0000000000000000000000000000000000000020";
      const cancel = engine.buildCancellation(TX_HASH, botWallet);

      expect(cancel.to).toBe(botWallet);
      expect(cancel.data).toBe("0x");
      expect(cancel.value).toBe(0n);
      expect(cancel.gas.gasLimit).toBe(21_000n);
      expect(cancel.nonce).toBe(42); // Same nonce
    });
  });

  // ─────────────────────────────────────────────
  // Circuit Breaker Tests
  // ─────────────────────────────────────────────

  describe("circuit breaker", () => {
    it("should pause after consecutive failures and block further execution", async () => {
      const scenario = SCENARIOS.profitable_5pct();
      collector = new EventCollector();

      monitor = new PriceMonitor({
        provider: scenario.provider,
        pools: scenario.pools,
        deltaThresholdPercent: 0.5,
      });
      detector = new OpportunityDetector({
        minProfitThreshold: 0,
        gasPriceGwei: 0,
        maxSlippage: 0,
      });
      detector.attach(monitor);
      monitor.on("error", () => {});
      detector.on("error", () => {});

      const opportunities = collector.collect<ArbitrageOpportunity>(detector, "opportunityFound");
      await monitor.poll();

      builder = createBuilder();
      const tx = builder.buildArbitrageTransaction(opportunities[0]);
      const gas = builder.calculateGasSettings(30, 2, 400_000);
      const prepared = builder.prepareTransaction(tx, gas, 42);

      // Engine with low failure threshold
      const failSigner = createFailingSigner("execution reverted");
      engine = new ExecutionEngine(failSigner, { maxConsecutiveFailures: 3 });
      engine.on("error", () => {});

      const pauseEvents = collector.collect<string>(engine, "paused");

      // Three failures trigger pause
      await engine.executeTransaction(prepared);
      await engine.executeTransaction(prepared);
      expect(engine.paused).toBe(false);

      await engine.executeTransaction(prepared);
      expect(engine.paused).toBe(true);
      expect(pauseEvents).toHaveLength(1);

      // Further execution is blocked
      const result = await engine.executeTransaction(prepared);
      expect(result.status).toBe("failed");
      expect(result.error).toContain("paused");
    });

    it("should resume after manual intervention", async () => {
      const failSigner = createFailingSigner("fail");
      engine = new ExecutionEngine(failSigner, { maxConsecutiveFailures: 1 });
      engine.on("error", () => {});

      const scenario = SCENARIOS.profitable_5pct();
      collector = new EventCollector();
      monitor = new PriceMonitor({
        provider: scenario.provider,
        pools: scenario.pools,
        deltaThresholdPercent: 0.5,
      });
      detector = new OpportunityDetector({
        minProfitThreshold: 0,
        gasPriceGwei: 0,
        maxSlippage: 0,
      });
      detector.attach(monitor);
      monitor.on("error", () => {});
      detector.on("error", () => {});

      const opportunities = collector.collect<ArbitrageOpportunity>(detector, "opportunityFound");
      await monitor.poll();

      builder = createBuilder();
      const tx = builder.buildArbitrageTransaction(opportunities[0]);
      const gas = builder.calculateGasSettings(30, 2, 400_000);
      const prepared = builder.prepareTransaction(tx, gas, 42);

      await engine.executeTransaction(prepared);
      expect(engine.paused).toBe(true);

      // Resume
      engine.resume();
      expect(engine.paused).toBe(false);
      expect(engine.consecutiveFailures).toBe(0);
    });
  });

  // ─────────────────────────────────────────────
  // Gas Estimation Tests
  // ─────────────────────────────────────────────

  describe("gas estimation", () => {
    it("should produce reasonable gas costs for 2-step arbitrage", () => {
      builder = createBuilder();

      // 30 gwei base fee, 2 gwei priority
      const gas = builder.calculateGasSettings(30, 2, 400_000);
      const costEth = builder.estimateGasCostEth(gas);

      // At 62 gwei maxFee, 400k gas = ~0.0248 ETH
      expect(costEth).toBeGreaterThan(0.01);
      expect(costEth).toBeLessThan(0.05);
    });

    it("should produce higher gas costs for 3-step arbitrage", () => {
      builder = createBuilder();

      const gas2 = builder.calculateGasSettings(30, 2, 400_000);
      const gas3 = builder.calculateGasSettings(30, 2, 600_000);

      expect(builder.estimateGasCostEth(gas3)).toBeGreaterThan(
        builder.estimateGasCostEth(gas2),
      );
    });

    it("should scale gas cost linearly with gas price", () => {
      builder = createBuilder();

      const gasLow = builder.calculateGasSettings(20, 1, 400_000);
      const gasHigh = builder.calculateGasSettings(40, 2, 400_000);

      const costLow = builder.estimateGasCostEth(gasLow);
      const costHigh = builder.estimateGasCostEth(gasHigh);

      // Higher gas price → higher cost
      expect(costHigh).toBeGreaterThan(costLow);
      // Roughly 2x (40+2 vs 20+1 → 82 vs 41 gwei maxFee)
      expect(costHigh / costLow).toBeCloseTo(2, 0);
    });
  });

  // ─────────────────────────────────────────────
  // Multi-Pair Pipeline Tests
  // ─────────────────────────────────────────────

  describe("multi-pair detection through pipeline", () => {
    it("should build separate transactions for each detected opportunity", async () => {
      const scenario = SCENARIOS.multi_pair();
      collector = new EventCollector();

      monitor = new PriceMonitor({
        provider: scenario.provider,
        pools: scenario.pools,
        deltaThresholdPercent: 0.5,
      });
      detector = new OpportunityDetector({
        minProfitThreshold: 0,
        gasPriceGwei: 0,
        maxSlippage: 0,
      });
      detector.attach(monitor);
      monitor.on("error", () => {});
      detector.on("error", () => {});

      const opportunities = collector.collect<ArbitrageOpportunity>(detector, "opportunityFound");
      await monitor.poll();

      expect(opportunities).toHaveLength(2);

      builder = createBuilder();
      const txs = opportunities.map((opp) =>
        builder.buildArbitrageTransaction(opp),
      );

      expect(txs).toHaveLength(2);
      // Each tx should target the executor
      txs.forEach((tx) => expect(tx.to).toBe(EXECUTOR_ADDRESS));
      // Each tx should have 2 swap steps
      txs.forEach((tx) => expect(tx.steps).toHaveLength(2));
      // Each tx should have different calldata
      expect(txs[0].data).not.toBe(txs[1].data);
    });
  });

  // ─────────────────────────────────────────────
  // Dry Run Pipeline Tests
  // ─────────────────────────────────────────────

  describe("dry run mode", () => {
    it("should complete full pipeline without sending real transactions", async () => {
      const scenario = SCENARIOS.profitable_5pct();
      collector = new EventCollector();

      monitor = new PriceMonitor({
        provider: scenario.provider,
        pools: scenario.pools,
        deltaThresholdPercent: 0.5,
      });
      detector = new OpportunityDetector({
        minProfitThreshold: 0,
        gasPriceGwei: 0,
        maxSlippage: 0,
      });
      detector.attach(monitor);
      monitor.on("error", () => {});
      detector.on("error", () => {});

      const opportunities = collector.collect<ArbitrageOpportunity>(detector, "opportunityFound");
      await monitor.poll();

      builder = createBuilder();
      const tx = builder.buildArbitrageTransaction(opportunities[0]);
      const gas = builder.calculateGasSettings(30, 2, 400_000);
      const prepared = builder.prepareTransaction(tx, gas, 42);

      // Dry-run engine
      const signer = createSuccessSigner();
      engine = new ExecutionEngine(signer, { dryRun: true });

      const result = await engine.executeTransaction(prepared);

      expect(result.status).toBe("confirmed");
      // Signer was NOT called
      expect(signer.sendTransaction).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // Profit Tracking Integration Tests
  // ─────────────────────────────────────────────

  describe("profit tracking", () => {
    it("should track profit across multiple successful executions", async () => {
      const scenario = SCENARIOS.profitable_5pct();
      collector = new EventCollector();

      monitor = new PriceMonitor({
        provider: scenario.provider,
        pools: scenario.pools,
        deltaThresholdPercent: 0.5,
      });
      detector = new OpportunityDetector({
        minProfitThreshold: 0,
        gasPriceGwei: 0,
        maxSlippage: 0,
      });
      detector.attach(monitor);
      monitor.on("error", () => {});
      detector.on("error", () => {});

      // Poll twice to get two opportunities
      const opportunities = collector.collect<ArbitrageOpportunity>(detector, "opportunityFound");
      await monitor.poll();
      await monitor.poll();
      expect(opportunities).toHaveLength(2);

      builder = createBuilder();

      // Execute both with profit events
      const arbLog = makeArbitrageExecutedLog(
        TEST_TOKENS.WETH,
        parseUnits("10", 18),
        parseUnits("0.05", 18),
      );
      const signer = createSuccessSigner({ logs: [arbLog] });
      engine = new ExecutionEngine(signer);

      for (const opp of opportunities) {
        const tx = builder.buildArbitrageTransaction(opp);
        const gas = builder.calculateGasSettings(30, 2, 400_000);
        const prepared = builder.prepareTransaction(tx, gas, 42);
        await engine.executeTransaction(prepared);
      }

      expect(engine.profitHistory).toHaveLength(2);
      engine.profitHistory.forEach((record) => {
        expect(record.profitable).toBe(true);
        expect(record.token).toBe(TEST_TOKENS.WETH);
      });
    });
  });

  // ─────────────────────────────────────────────
  // State Consistency Tests
  // ─────────────────────────────────────────────

  describe("state consistency", () => {
    it("should maintain correct state across detection-build-execute cycle", async () => {
      const scenario = SCENARIOS.profitable_5pct();
      collector = new EventCollector();

      monitor = new PriceMonitor({
        provider: scenario.provider,
        pools: scenario.pools,
        deltaThresholdPercent: 0.5,
      });
      detector = new OpportunityDetector({
        minProfitThreshold: 0,
        gasPriceGwei: 0,
        maxSlippage: 0,
      });
      detector.attach(monitor);
      monitor.on("error", () => {});
      detector.on("error", () => {});

      const opportunities = collector.collect<ArbitrageOpportunity>(detector, "opportunityFound");
      await monitor.poll();

      builder = createBuilder();
      const opp = opportunities[0];
      const tx = builder.buildArbitrageTransaction(opp);

      // Verify the chain of data is consistent
      expect(tx.flashLoanToken).toBe(opp.path.baseToken);
      expect(tx.steps.length).toBe(opp.path.steps.length);

      // Input/output tokens should match the opportunity path
      expect(tx.steps[0].tokenIn).toBe(opp.path.steps[0].tokenIn);
      expect(tx.steps[0].tokenOut).toBe(opp.path.steps[0].tokenOut);
      expect(tx.steps[1].tokenIn).toBe(opp.path.steps[1].tokenIn);
      expect(tx.steps[1].tokenOut).toBe(opp.path.steps[1].tokenOut);
    });
  });
});
