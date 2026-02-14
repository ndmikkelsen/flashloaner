import type { DEXProtocol } from "../monitor/types.js";

/** Supported flash loan providers */
export type FlashLoanProvider = "aave_v3" | "balancer";

/** Maps DEX protocol identifiers to deployed adapter contract addresses */
export type AdapterMap = Record<DEXProtocol, string>;

/**
 * Contract-side SwapStep struct, mirrors IFlashloanExecutor.SwapStep.
 * Used for ABI encoding the executeArbitrage call.
 */
export interface ContractSwapStep {
  /** DEX adapter contract address */
  adapter: string;
  /** Input token address */
  tokenIn: string;
  /** Output token address */
  tokenOut: string;
  /** Input amount in wei (0 = use full balance) */
  amountIn: bigint;
  /** Adapter-specific data (e.g., V3 fee tier) */
  extraData: string;
}

/** EIP-1559 gas fee parameters */
export interface GasSettings {
  /** Maximum fee per gas in wei */
  maxFeePerGas: bigint;
  /** Maximum priority fee per gas in wei */
  maxPriorityFeePerGas: bigint;
  /** Gas limit */
  gasLimit: bigint;
}

/** A fully-encoded transaction ready for signing and submission */
export interface ArbitrageTransaction {
  /** Target contract (FlashloanExecutor) address */
  to: string;
  /** ABI-encoded calldata for executeArbitrage() */
  data: string;
  /** ETH value (always 0 for arbitrage) */
  value: bigint;
  /** Chain ID */
  chainId: number;
  /** The encoded contract swap steps (for inspection/debugging) */
  steps: ContractSwapStep[];
  /** Flash loan provider address */
  flashLoanProvider: string;
  /** Flash loan token address */
  flashLoanToken: string;
  /** Flash loan amount in wei */
  flashLoanAmount: bigint;
}

/** A transaction with gas and nonce, ready to sign */
export interface PreparedTransaction extends ArbitrageTransaction {
  /** EIP-1559 gas settings */
  gas: GasSettings;
  /** Sender nonce */
  nonce: number;
}

/** Configuration for the TransactionBuilder */
export interface TransactionBuilderConfig {
  /** FlashloanExecutor contract address */
  executorAddress: string;
  /** Map of DEX protocol → adapter contract address */
  adapters: AdapterMap;
  /** Flash loan provider addresses */
  flashLoanProviders: {
    aave_v3: string;
    balancer: string;
  };
  /** Chain ID (default: 1 for mainnet) */
  chainId?: number;
}

/** Events emitted by TransactionBuilder */
export interface TransactionBuilderEvents {
  transactionBuilt: (tx: ArbitrageTransaction) => void;
  transactionPrepared: (tx: PreparedTransaction) => void;
  error: (error: Error) => void;
}
