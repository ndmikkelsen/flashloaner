import { AbiCoder, Interface, parseUnits } from "ethers";
import type { ArbitrageOpportunity, SwapStep } from "../detector/types.js";
import type { DEXProtocol } from "../monitor/types.js";
import type {
  AdapterMap,
  ArbitrageTransaction,
  ContractSwapStep,
  FlashLoanProvider,
  GasSettings,
  PreparedTransaction,
  TransactionBuilderConfig,
} from "./types.js";

// ABI fragment for FlashloanExecutor.executeArbitrage
const EXECUTE_ARBITRAGE_ABI = [
  "function executeArbitrage(address flashLoanProvider, address flashLoanToken, uint256 flashLoanAmount, tuple(address adapter, address tokenIn, address tokenOut, uint256 amountIn, bytes extraData)[] steps)",
];

const abiCoder = AbiCoder.defaultAbiCoder();

/**
 * Builds encoded transactions for FlashloanExecutor.executeArbitrage().
 *
 * Transforms ArbitrageOpportunity objects from the OpportunityDetector into
 * ABI-encoded calldata that can be submitted to the blockchain.
 */
export class TransactionBuilder {
  private static readonly ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  readonly config: TransactionBuilderConfig;
  private readonly iface: Interface;

  constructor(config: TransactionBuilderConfig) {
    if (!config.executorAddress) {
      throw new Error("executorAddress is required");
    }
    if (!config.adapters) {
      throw new Error("adapters config is required");
    }
    if (!config.flashLoanProviders) {
      throw new Error("flashLoanProviders config is required");
    }

    this.config = { ...config, chainId: config.chainId ?? 1 };
    this.iface = new Interface(EXECUTE_ARBITRAGE_ABI);
  }

  /**
   * Build an arbitrage transaction from an opportunity.
   *
   * @param opportunity - The detected arbitrage opportunity
   * @param flashLoanProvider - Which flash loan provider to use (default: "aave_v3")
   * @returns Encoded transaction ready for gas estimation and signing
   */
  buildArbitrageTransaction(
    opportunity: ArbitrageOpportunity,
    flashLoanProvider: FlashLoanProvider = "aave_v3",
  ): ArbitrageTransaction {
    if (!opportunity.path.steps.length) {
      throw new Error("Opportunity has no swap steps");
    }
    if (opportunity.inputAmount <= 0) {
      throw new Error("Input amount must be positive");
    }

    const baseToken = opportunity.path.baseToken;
    const baseDecimals = this.resolveBaseDecimals(opportunity);
    const flashLoanAmount = this.toWei(opportunity.inputAmount, baseDecimals);
    const providerAddress = this.resolveFlashLoanProvider(flashLoanProvider);

    const contractSteps = this.encodeSwapSteps(
      opportunity.path.steps,
      flashLoanAmount,
    );

    const data = this.iface.encodeFunctionData("executeArbitrage", [
      providerAddress,
      baseToken,
      flashLoanAmount,
      contractSteps.map((s) => [
        s.adapter,
        s.tokenIn,
        s.tokenOut,
        s.amountIn,
        s.extraData,
      ]),
    ]);

    return {
      to: this.config.executorAddress,
      data,
      value: 0n,
      chainId: this.config.chainId!,
      steps: contractSteps,
      flashLoanProvider: providerAddress,
      flashLoanToken: baseToken,
      flashLoanAmount,
    };
  }

  /**
   * Encode bot SwapSteps into contract-compatible ContractSwapSteps.
   *
   * - First step gets the flash loan amount as amountIn
   * - Subsequent steps get amountIn = 0 (use full balance)
   * - DEX protocol is resolved to adapter address
   * - V3 fee tiers are packed into extraData
   */
  encodeSwapSteps(
    steps: SwapStep[],
    flashLoanAmount: bigint,
  ): ContractSwapStep[] {
    return steps.map((step, i) => ({
      adapter: this.resolveAdapter(step.dex),
      tokenIn: step.tokenIn,
      tokenOut: step.tokenOut,
      amountIn: i === 0 ? flashLoanAmount : 0n,
      extraData: this.encodeExtraData(step),
    }));
  }

  /**
   * Calculate EIP-1559 gas settings.
   *
   * @param baseFeeGwei - Current base fee in gwei
   * @param priorityFeeGwei - Priority fee (tip) in gwei
   * @param gasLimit - Estimated gas limit
   * @returns Gas settings with maxFeePerGas and maxPriorityFeePerGas
   */
  calculateGasSettings(
    baseFeeGwei: number,
    priorityFeeGwei: number,
    gasLimit: number,
  ): GasSettings {
    if (baseFeeGwei < 0) throw new Error("Base fee cannot be negative");
    if (priorityFeeGwei < 0) throw new Error("Priority fee cannot be negative");
    if (gasLimit <= 0) throw new Error("Gas limit must be positive");

    const baseFeeWei = parseUnits(baseFeeGwei.toString(), "gwei");
    const priorityFeeWei = parseUnits(priorityFeeGwei.toString(), "gwei");

    // maxFeePerGas = 2 * baseFee + priorityFee (standard EIP-1559 strategy)
    const maxFeePerGas = baseFeeWei * 2n + priorityFeeWei;
    return {
      maxFeePerGas,
      maxPriorityFeePerGas: priorityFeeWei,
      gasLimit: BigInt(gasLimit),
    };
  }

  /**
   * Estimate gas cost in ETH for a given gas settings.
   *
   * @param gas - Gas settings (from calculateGasSettings)
   * @returns Estimated gas cost in ETH (as number)
   */
  estimateGasCostEth(gas: GasSettings): number {
    const costWei = gas.maxFeePerGas * gas.gasLimit;
    return Number(costWei) / 1e18;
  }

  /**
   * Prepare a transaction with gas settings and nonce.
   *
   * @param tx - The base arbitrage transaction
   * @param gas - Gas settings
   * @param nonce - Sender's nonce
   * @returns Fully-prepared transaction ready for signing
   */
  prepareTransaction(
    tx: ArbitrageTransaction,
    gas: GasSettings,
    nonce: number,
  ): PreparedTransaction {
    if (nonce < 0) throw new Error("Nonce cannot be negative");
    return { ...tx, gas, nonce };
  }

  /**
   * Resolve a DEX protocol identifier to its deployed adapter address.
   *
   * Throws if no adapter is configured for the DEX, or if the configured
   * address is the zero address (adapter not yet deployed). This prevents
   * silent failures where a transaction would revert on-chain with
   * AdapterNotApproved(address(0)).
   */
  resolveAdapter(dex: DEXProtocol): string {
    const adapter = this.config.adapters[dex];
    if (!adapter) {
      throw new Error(`No adapter configured for DEX protocol: ${dex}`);
    }
    // Guard: zero address means adapter not deployed — skip this opportunity
    if (adapter === TransactionBuilder.ZERO_ADDRESS) {
      throw new Error(`Adapter for DEX protocol '${dex}' is zero address — adapter not deployed`);
    }
    return adapter;
  }

  /**
   * Resolve a flash loan provider to its on-chain address.
   */
  resolveFlashLoanProvider(provider: FlashLoanProvider): string {
    const address = this.config.flashLoanProviders[provider];
    if (!address) {
      throw new Error(`No address configured for flash loan provider: ${provider}`);
    }
    return address;
  }

  /**
   * Encode adapter-specific extra data for a swap step.
   *
   * - uniswap_v2 / sushiswap / camelot_v2: empty bytes (direct swap)
   * - uniswap_v3 / sushiswap_v3 / camelot_v3 / ramses_v3: abi.encode(uint24 feeTier)
   * - traderjoe_lb: abi.encode(uint24 binStep)
   */
  encodeExtraData(step: SwapStep): string {
    if (
      step.dex === "uniswap_v3" ||
      step.dex === "sushiswap_v3" ||
      step.dex === "camelot_v3" ||
      step.dex === "ramses_v3"
    ) {
      const feeTier = step.feeTier ?? 3000;
      return abiCoder.encode(["uint24"], [feeTier]);
    }
    if (step.dex === "traderjoe_lb") {
      const binStep = step.feeTier ?? 15;
      return abiCoder.encode(["uint24"], [binStep]);
    }
    // V2-style DEXes (uniswap_v2, sushiswap, camelot_v2) use empty extra data
    return "0x";
  }

  /**
   * Convert a human-readable amount to wei (bigint) with the given decimals.
   */
  toWei(amount: number, decimals: number): bigint {
    // Use string conversion to avoid floating-point precision issues
    // Cap to `decimals` decimal places to prevent parseUnits from failing
    const str = amount.toFixed(decimals);
    return parseUnits(str, decimals);
  }

  /**
   * Resolve the base token's decimals from the opportunity's first swap step.
   */
  private resolveBaseDecimals(opportunity: ArbitrageOpportunity): number {
    const firstStep = opportunity.path.steps[0];
    // The base token is the input of the first step
    if (firstStep.tokenIn === opportunity.path.baseToken) {
      return firstStep.decimalsIn;
    }
    // Or check if it's the output of the last step
    const lastStep = opportunity.path.steps[opportunity.path.steps.length - 1];
    if (lastStep.tokenOut === opportunity.path.baseToken) {
      return lastStep.decimalsOut;
    }
    // Default to 18 (ETH/WETH)
    return 18;
  }
}
