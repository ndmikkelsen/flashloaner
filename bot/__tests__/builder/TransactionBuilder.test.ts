import { describe, it, expect, beforeEach } from "vitest";
import { AbiCoder, Interface, parseUnits } from "ethers";
import { TransactionBuilder } from "../../src/builder/TransactionBuilder.js";
import type {
  TransactionBuilderConfig,
  ContractSwapStep,
  FlashLoanProvider,
} from "../../src/builder/types.js";
import {
  ADDRESSES,
  makeOpportunity,
  makeSwapStep,
  makeSwapPath,
} from "../helpers/index.js";

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const UNI_V2_ADAPTER = "0x1111111111111111111111111111111111111111";
const UNI_V3_ADAPTER = "0x2222222222222222222222222222222222222222";
const SUSHI_ADAPTER = "0x3333333333333333333333333333333333333333";
const AAVE_V3_POOL = ADDRESSES.AAVE_POOL;
const BALANCER_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";

const defaultConfig: TransactionBuilderConfig = {
  executorAddress: ADDRESSES.EXECUTOR,
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
};

const abiCoder = AbiCoder.defaultAbiCoder();
const iface = new Interface([
  "function executeArbitrage(address flashLoanProvider, address flashLoanToken, uint256 flashLoanAmount, tuple(address adapter, address tokenIn, address tokenOut, uint256 amountIn, bytes extraData)[] steps)",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeV2Opportunity(inputAmount = 10) {
  return makeOpportunity({
    inputAmount,
    path: makeSwapPath({
      steps: [
        makeSwapStep({
          dex: "uniswap_v2",
          poolAddress: ADDRESSES.POOL_UNI_V2,
          tokenIn: ADDRESSES.WETH,
          tokenOut: ADDRESSES.USDC,
          decimalsIn: 18,
          decimalsOut: 6,
          expectedPrice: 2000,
        }),
        makeSwapStep({
          dex: "sushiswap",
          poolAddress: ADDRESSES.POOL_SUSHI,
          tokenIn: ADDRESSES.USDC,
          tokenOut: ADDRESSES.WETH,
          decimalsIn: 6,
          decimalsOut: 18,
          expectedPrice: 0.000505,
        }),
      ],
      baseToken: ADDRESSES.WETH,
      label: "WETH→USDC(UniV2)→WETH(Sushi)",
    }),
  });
}

function makeV3Opportunity(feeTier = 500) {
  return makeOpportunity({
    inputAmount: 5,
    path: makeSwapPath({
      steps: [
        makeSwapStep({
          dex: "uniswap_v3",
          poolAddress: ADDRESSES.POOL_UNI_V3,
          tokenIn: ADDRESSES.WETH,
          tokenOut: ADDRESSES.USDC,
          decimalsIn: 18,
          decimalsOut: 6,
          expectedPrice: 2000,
          feeTier,
        }),
        makeSwapStep({
          dex: "uniswap_v2",
          poolAddress: ADDRESSES.POOL_UNI_V2,
          tokenIn: ADDRESSES.USDC,
          tokenOut: ADDRESSES.WETH,
          decimalsIn: 6,
          decimalsOut: 18,
          expectedPrice: 0.000505,
        }),
      ],
      baseToken: ADDRESSES.WETH,
      label: "WETH→USDC(V3-500)→WETH(V2)",
    }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TransactionBuilder", () => {
  let builder: TransactionBuilder;

  beforeEach(() => {
    builder = new TransactionBuilder(defaultConfig);
  });

  // ─────────────────────────────────────────────
  // Constructor Tests
  // ─────────────────────────────────────────────

  describe("constructor", () => {
    it("stores config with default chainId", () => {
      const b = new TransactionBuilder({
        ...defaultConfig,
        chainId: undefined,
      });
      expect(b.config.chainId).toBe(1);
    });

    it("stores custom chainId", () => {
      const b = new TransactionBuilder({ ...defaultConfig, chainId: 42161 });
      expect(b.config.chainId).toBe(42161);
    });

    it("throws if executorAddress is empty", () => {
      expect(
        () =>
          new TransactionBuilder({ ...defaultConfig, executorAddress: "" }),
      ).toThrow("executorAddress is required");
    });

    it("throws if adapters config is missing", () => {
      expect(
        () =>
          new TransactionBuilder({
            ...defaultConfig,
            adapters: undefined as unknown as TransactionBuilderConfig["adapters"],
          }),
      ).toThrow("adapters config is required");
    });

    it("throws if flashLoanProviders config is missing", () => {
      expect(
        () =>
          new TransactionBuilder({
            ...defaultConfig,
            flashLoanProviders: undefined as unknown as TransactionBuilderConfig["flashLoanProviders"],
          }),
      ).toThrow("flashLoanProviders config is required");
    });
  });

  // ─────────────────────────────────────────────
  // buildArbitrageTransaction Tests
  // ─────────────────────────────────────────────

  describe("buildArbitrageTransaction", () => {
    it("builds a valid transaction for a V2 opportunity", () => {
      const opp = makeV2Opportunity();
      const tx = builder.buildArbitrageTransaction(opp);

      expect(tx.to).toBe(ADDRESSES.EXECUTOR);
      expect(tx.value).toBe(0n);
      expect(tx.chainId).toBe(1);
      expect(tx.flashLoanProvider).toBe(AAVE_V3_POOL);
      expect(tx.flashLoanToken).toBe(ADDRESSES.WETH);
      expect(tx.flashLoanAmount).toBe(parseUnits("10", 18));
      expect(tx.steps).toHaveLength(2);
      expect(tx.data).toMatch(/^0x/);
    });

    it("encodes the correct function selector", () => {
      const opp = makeV2Opportunity();
      const tx = builder.buildArbitrageTransaction(opp);

      // executeArbitrage selector
      const selector = iface.getFunction("executeArbitrage")!.selector;
      expect(tx.data.startsWith(selector)).toBe(true);
    });

    it("decodes back to the original parameters", () => {
      const opp = makeV2Opportunity();
      const tx = builder.buildArbitrageTransaction(opp);

      const decoded = iface.decodeFunctionData("executeArbitrage", tx.data);
      expect(decoded[0]).toBe(AAVE_V3_POOL); // flashLoanProvider
      expect(decoded[1]).toBe(ADDRESSES.WETH); // flashLoanToken
      expect(decoded[2]).toBe(parseUnits("10", 18)); // flashLoanAmount
      expect(decoded[3]).toHaveLength(2); // steps
    });

    it("uses Balancer when specified", () => {
      const opp = makeV2Opportunity();
      const tx = builder.buildArbitrageTransaction(opp, "balancer");

      expect(tx.flashLoanProvider).toBe(BALANCER_VAULT);
      const decoded = iface.decodeFunctionData("executeArbitrage", tx.data);
      expect(decoded[0]).toBe(BALANCER_VAULT);
    });

    it("throws if opportunity has no swap steps", () => {
      const opp = makeOpportunity({
        path: makeSwapPath({ steps: [] }),
      });
      expect(() => builder.buildArbitrageTransaction(opp)).toThrow(
        "Opportunity has no swap steps",
      );
    });

    it("throws if input amount is zero", () => {
      const opp = makeV2Opportunity(0);
      expect(() => builder.buildArbitrageTransaction(opp)).toThrow(
        "Input amount must be positive",
      );
    });

    it("throws if input amount is negative", () => {
      const opp = makeV2Opportunity(-5);
      expect(() => builder.buildArbitrageTransaction(opp)).toThrow(
        "Input amount must be positive",
      );
    });

    it("correctly converts inputAmount to wei for 18-decimal token", () => {
      const opp = makeV2Opportunity(1.5);
      const tx = builder.buildArbitrageTransaction(opp);
      expect(tx.flashLoanAmount).toBe(parseUnits("1.5", 18));
    });

    it("correctly converts inputAmount for 6-decimal token (USDC base)", () => {
      const opp = makeOpportunity({
        inputAmount: 1000,
        path: makeSwapPath({
          steps: [
            makeSwapStep({
              dex: "uniswap_v2",
              tokenIn: ADDRESSES.USDC,
              tokenOut: ADDRESSES.WETH,
              decimalsIn: 6,
              decimalsOut: 18,
            }),
            makeSwapStep({
              dex: "sushiswap",
              poolAddress: ADDRESSES.POOL_SUSHI,
              tokenIn: ADDRESSES.WETH,
              tokenOut: ADDRESSES.USDC,
              decimalsIn: 18,
              decimalsOut: 6,
            }),
          ],
          baseToken: ADDRESSES.USDC,
          label: "USDC→WETH→USDC",
        }),
      });

      const tx = builder.buildArbitrageTransaction(opp);
      // 1000 USDC = 1000 * 10^6 = 1,000,000,000
      expect(tx.flashLoanAmount).toBe(parseUnits("1000", 6));
    });
  });

  // ─────────────────────────────────────────────
  // encodeSwapSteps Tests
  // ─────────────────────────────────────────────

  describe("encodeSwapSteps", () => {
    it("maps dex to adapter addresses", () => {
      const steps = [
        makeSwapStep({ dex: "uniswap_v2" }),
        makeSwapStep({ dex: "sushiswap", poolAddress: ADDRESSES.POOL_SUSHI }),
      ];

      const encoded = builder.encodeSwapSteps(steps, 10n ** 18n);
      expect(encoded[0].adapter).toBe(UNI_V2_ADAPTER);
      expect(encoded[1].adapter).toBe(SUSHI_ADAPTER);
    });

    it("sets first step amountIn to flashLoanAmount", () => {
      const steps = [makeSwapStep(), makeSwapStep()];
      const flashLoanAmount = parseUnits("10", 18);

      const encoded = builder.encodeSwapSteps(steps, flashLoanAmount);
      expect(encoded[0].amountIn).toBe(flashLoanAmount);
    });

    it("sets subsequent steps amountIn to 0 (use full balance)", () => {
      const steps = [
        makeSwapStep(),
        makeSwapStep({ dex: "sushiswap" }),
        makeSwapStep({ dex: "uniswap_v3", feeTier: 500 }),
      ];

      const encoded = builder.encodeSwapSteps(steps, 10n ** 18n);
      expect(encoded[1].amountIn).toBe(0n);
      expect(encoded[2].amountIn).toBe(0n);
    });

    it("preserves tokenIn and tokenOut", () => {
      const steps = [
        makeSwapStep({
          tokenIn: ADDRESSES.WETH,
          tokenOut: ADDRESSES.USDC,
        }),
      ];

      const encoded = builder.encodeSwapSteps(steps, 10n ** 18n);
      expect(encoded[0].tokenIn).toBe(ADDRESSES.WETH);
      expect(encoded[0].tokenOut).toBe(ADDRESSES.USDC);
    });

    it("encodes V3 fee tier in extraData", () => {
      const steps = [
        makeSwapStep({ dex: "uniswap_v3", feeTier: 500 }),
      ];

      const encoded = builder.encodeSwapSteps(steps, 10n ** 18n);
      const decoded = abiCoder.decode(["uint24"], encoded[0].extraData);
      expect(decoded[0]).toBe(500n);
    });

    it("uses empty extraData for V2", () => {
      const steps = [makeSwapStep({ dex: "uniswap_v2" })];
      const encoded = builder.encodeSwapSteps(steps, 10n ** 18n);
      expect(encoded[0].extraData).toBe("0x");
    });
  });

  // ─────────────────────────────────────────────
  // encodeExtraData Tests
  // ─────────────────────────────────────────────

  describe("encodeExtraData", () => {
    it("returns 0x for uniswap_v2", () => {
      const step = makeSwapStep({ dex: "uniswap_v2" });
      expect(builder.encodeExtraData(step)).toBe("0x");
    });

    it("returns 0x for sushiswap", () => {
      const step = makeSwapStep({ dex: "sushiswap" });
      expect(builder.encodeExtraData(step)).toBe("0x");
    });

    it("encodes fee tier for uniswap_v3 (500 bps)", () => {
      const step = makeSwapStep({ dex: "uniswap_v3", feeTier: 500 });
      const data = builder.encodeExtraData(step);
      const decoded = abiCoder.decode(["uint24"], data);
      expect(decoded[0]).toBe(500n);
    });

    it("encodes fee tier for uniswap_v3 (3000 bps)", () => {
      const step = makeSwapStep({ dex: "uniswap_v3", feeTier: 3000 });
      const data = builder.encodeExtraData(step);
      const decoded = abiCoder.decode(["uint24"], data);
      expect(decoded[0]).toBe(3000n);
    });

    it("encodes fee tier for uniswap_v3 (10000 bps)", () => {
      const step = makeSwapStep({ dex: "uniswap_v3", feeTier: 10000 });
      const data = builder.encodeExtraData(step);
      const decoded = abiCoder.decode(["uint24"], data);
      expect(decoded[0]).toBe(10000n);
    });

    it("defaults to 3000 bps if V3 feeTier is not set", () => {
      const step = makeSwapStep({ dex: "uniswap_v3", feeTier: undefined });
      const data = builder.encodeExtraData(step);
      const decoded = abiCoder.decode(["uint24"], data);
      expect(decoded[0]).toBe(3000n);
    });
  });

  // ─────────────────────────────────────────────
  // resolveAdapter Tests
  // ─────────────────────────────────────────────

  describe("resolveAdapter", () => {
    it("resolves uniswap_v2", () => {
      expect(builder.resolveAdapter("uniswap_v2")).toBe(UNI_V2_ADAPTER);
    });

    it("resolves uniswap_v3", () => {
      expect(builder.resolveAdapter("uniswap_v3")).toBe(UNI_V3_ADAPTER);
    });

    it("resolves sushiswap", () => {
      expect(builder.resolveAdapter("sushiswap")).toBe(SUSHI_ADAPTER);
    });

    it("throws for unknown dex", () => {
      expect(() =>
        builder.resolveAdapter("curve" as unknown as import("../../src/monitor/types.js").DEXProtocol),
      ).toThrow("No adapter configured for DEX protocol: curve");
    });
  });

  // ─────────────────────────────────────────────
  // resolveFlashLoanProvider Tests
  // ─────────────────────────────────────────────

  describe("resolveFlashLoanProvider", () => {
    it("resolves aave_v3", () => {
      expect(builder.resolveFlashLoanProvider("aave_v3")).toBe(AAVE_V3_POOL);
    });

    it("resolves balancer", () => {
      expect(builder.resolveFlashLoanProvider("balancer")).toBe(BALANCER_VAULT);
    });

    it("throws for unknown provider", () => {
      expect(() =>
        builder.resolveFlashLoanProvider("dydx" as FlashLoanProvider),
      ).toThrow("No address configured for flash loan provider: dydx");
    });
  });

  // ─────────────────────────────────────────────
  // calculateGasSettings Tests
  // ─────────────────────────────────────────────

  describe("calculateGasSettings", () => {
    it("calculates maxFeePerGas as 2 * baseFee + priorityFee", () => {
      const gas = builder.calculateGasSettings(30, 2, 300_000);

      const expectedMaxFee =
        parseUnits("30", "gwei") * 2n + parseUnits("2", "gwei");
      expect(gas.maxFeePerGas).toBe(expectedMaxFee);
      expect(gas.maxPriorityFeePerGas).toBe(parseUnits("2", "gwei"));
      expect(gas.gasLimit).toBe(300_000n);
    });

    it("handles zero base fee", () => {
      const gas = builder.calculateGasSettings(0, 1, 100_000);
      expect(gas.maxFeePerGas).toBe(parseUnits("1", "gwei"));
    });

    it("handles zero priority fee", () => {
      const gas = builder.calculateGasSettings(50, 0, 200_000);
      expect(gas.maxFeePerGas).toBe(parseUnits("50", "gwei") * 2n);
      expect(gas.maxPriorityFeePerGas).toBe(0n);
    });

    it("throws for negative base fee", () => {
      expect(() => builder.calculateGasSettings(-1, 2, 300_000)).toThrow(
        "Base fee cannot be negative",
      );
    });

    it("throws for negative priority fee", () => {
      expect(() => builder.calculateGasSettings(30, -1, 300_000)).toThrow(
        "Priority fee cannot be negative",
      );
    });

    it("throws for zero gas limit", () => {
      expect(() => builder.calculateGasSettings(30, 2, 0)).toThrow(
        "Gas limit must be positive",
      );
    });
  });

  // ─────────────────────────────────────────────
  // estimateGasCostEth Tests
  // ─────────────────────────────────────────────

  describe("estimateGasCostEth", () => {
    it("calculates gas cost in ETH", () => {
      const gas = builder.calculateGasSettings(30, 2, 300_000);
      const cost = builder.estimateGasCostEth(gas);

      // maxFeePerGas = 62 gwei, gasLimit = 300,000
      // cost = 62e9 * 300,000 / 1e18 = 0.0186 ETH
      const expectedMaxFeeGwei = 30 * 2 + 2; // 62 gwei
      const expectedCost = (expectedMaxFeeGwei * 1e9 * 300_000) / 1e18;
      expect(cost).toBeCloseTo(expectedCost, 10);
    });

    it("returns 0 when gas is free", () => {
      const gas = { maxFeePerGas: 0n, maxPriorityFeePerGas: 0n, gasLimit: 300_000n };
      expect(builder.estimateGasCostEth(gas)).toBe(0);
    });
  });

  // ─────────────────────────────────────────────
  // prepareTransaction Tests
  // ─────────────────────────────────────────────

  describe("prepareTransaction", () => {
    it("adds gas and nonce to transaction", () => {
      const opp = makeV2Opportunity();
      const tx = builder.buildArbitrageTransaction(opp);
      const gas = builder.calculateGasSettings(30, 2, 300_000);

      const prepared = builder.prepareTransaction(tx, gas, 42);

      expect(prepared.gas).toBe(gas);
      expect(prepared.nonce).toBe(42);
      expect(prepared.to).toBe(tx.to);
      expect(prepared.data).toBe(tx.data);
    });

    it("throws for negative nonce", () => {
      const opp = makeV2Opportunity();
      const tx = builder.buildArbitrageTransaction(opp);
      const gas = builder.calculateGasSettings(30, 2, 300_000);

      expect(() => builder.prepareTransaction(tx, gas, -1)).toThrow(
        "Nonce cannot be negative",
      );
    });

    it("accepts nonce of 0", () => {
      const opp = makeV2Opportunity();
      const tx = builder.buildArbitrageTransaction(opp);
      const gas = builder.calculateGasSettings(30, 2, 300_000);

      const prepared = builder.prepareTransaction(tx, gas, 0);
      expect(prepared.nonce).toBe(0);
    });
  });

  // ─────────────────────────────────────────────
  // toWei Tests
  // ─────────────────────────────────────────────

  describe("toWei", () => {
    it("converts 1 ETH to 1e18 wei", () => {
      expect(builder.toWei(1, 18)).toBe(10n ** 18n);
    });

    it("converts 1000 USDC to 1e9 (6 decimals)", () => {
      expect(builder.toWei(1000, 6)).toBe(1_000_000_000n);
    });

    it("converts fractional amounts", () => {
      expect(builder.toWei(1.5, 18)).toBe(parseUnits("1.5", 18));
    });

    it("converts small fractional amounts", () => {
      expect(builder.toWei(0.001, 18)).toBe(parseUnits("0.001", 18));
    });

    it("converts 0 to 0n", () => {
      expect(builder.toWei(0, 18)).toBe(0n);
    });
  });

  // ─────────────────────────────────────────────
  // V3 Integration Tests
  // ─────────────────────────────────────────────

  describe("V3 integration", () => {
    it("encodes V3 fee tier correctly in full transaction", () => {
      const opp = makeV3Opportunity(500);
      const tx = builder.buildArbitrageTransaction(opp);

      // First step is V3 with fee 500
      expect(tx.steps[0].adapter).toBe(UNI_V3_ADAPTER);
      const decoded = abiCoder.decode(["uint24"], tx.steps[0].extraData);
      expect(decoded[0]).toBe(500n);

      // Second step is V2 with empty extraData
      expect(tx.steps[1].adapter).toBe(UNI_V2_ADAPTER);
      expect(tx.steps[1].extraData).toBe("0x");
    });

    it("supports different V3 fee tiers", () => {
      for (const tier of [100, 500, 3000, 10000]) {
        const opp = makeV3Opportunity(tier);
        const tx = builder.buildArbitrageTransaction(opp);
        const decoded = abiCoder.decode(["uint24"], tx.steps[0].extraData);
        expect(decoded[0]).toBe(BigInt(tier));
      }
    });
  });

  // ─────────────────────────────────────────────
  // Multi-hop Tests
  // ─────────────────────────────────────────────

  describe("multi-hop paths", () => {
    it("handles 3-step path with mixed DEXes", () => {
      const opp = makeOpportunity({
        inputAmount: 5,
        path: makeSwapPath({
          steps: [
            makeSwapStep({
              dex: "uniswap_v3",
              tokenIn: ADDRESSES.WETH,
              tokenOut: ADDRESSES.USDC,
              decimalsIn: 18,
              decimalsOut: 6,
              feeTier: 500,
            }),
            makeSwapStep({
              dex: "uniswap_v2",
              tokenIn: ADDRESSES.USDC,
              tokenOut: ADDRESSES.DAI,
              decimalsIn: 6,
              decimalsOut: 18,
            }),
            makeSwapStep({
              dex: "sushiswap",
              poolAddress: ADDRESSES.POOL_SUSHI,
              tokenIn: ADDRESSES.DAI,
              tokenOut: ADDRESSES.WETH,
              decimalsIn: 18,
              decimalsOut: 18,
            }),
          ],
          baseToken: ADDRESSES.WETH,
          label: "WETH→USDC(V3)→DAI(V2)→WETH(Sushi)",
        }),
      });

      const tx = builder.buildArbitrageTransaction(opp);

      expect(tx.steps).toHaveLength(3);
      // Step 0: V3, full amount
      expect(tx.steps[0].adapter).toBe(UNI_V3_ADAPTER);
      expect(tx.steps[0].amountIn).toBe(parseUnits("5", 18));
      // Step 1: V2, use balance
      expect(tx.steps[1].adapter).toBe(UNI_V2_ADAPTER);
      expect(tx.steps[1].amountIn).toBe(0n);
      // Step 2: Sushi, use balance
      expect(tx.steps[2].adapter).toBe(SUSHI_ADAPTER);
      expect(tx.steps[2].amountIn).toBe(0n);

      // Verify decoding
      const decoded = iface.decodeFunctionData("executeArbitrage", tx.data);
      expect(decoded[3]).toHaveLength(3);
    });
  });

  // ─────────────────────────────────────────────
  // End-to-End Pipeline Tests
  // ─────────────────────────────────────────────

  describe("end-to-end pipeline", () => {
    it("builds and prepares a full transaction", () => {
      const opp = makeV2Opportunity(10);
      const tx = builder.buildArbitrageTransaction(opp);
      const gas = builder.calculateGasSettings(30, 2, 400_000);
      const prepared = builder.prepareTransaction(tx, gas, 5);

      expect(prepared.to).toBe(ADDRESSES.EXECUTOR);
      expect(prepared.value).toBe(0n);
      expect(prepared.chainId).toBe(1);
      expect(prepared.nonce).toBe(5);
      expect(prepared.gas.gasLimit).toBe(400_000n);
      expect(prepared.flashLoanAmount).toBe(parseUnits("10", 18));
      expect(prepared.data).toMatch(/^0x/);
    });

    it("gas cost is reasonable for a 2-step arb", () => {
      const gas = builder.calculateGasSettings(30, 2, 400_000);
      const costEth = builder.estimateGasCostEth(gas);

      // At 62 gwei maxFee, 400k gas = 0.0248 ETH
      expect(costEth).toBeLessThan(0.05);
      expect(costEth).toBeGreaterThan(0.01);
    });
  });
});
