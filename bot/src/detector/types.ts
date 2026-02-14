import type { DEXProtocol, PriceDelta } from "../monitor/types.js";

/** A single swap step in an arbitrage path */
export interface SwapStep {
  /** DEX to execute this swap on */
  dex: DEXProtocol;
  /** Pool address for this swap */
  poolAddress: string;
  /** Token to sell */
  tokenIn: string;
  /** Token to receive */
  tokenOut: string;
  /** Decimals of tokenIn */
  decimalsIn: number;
  /** Decimals of tokenOut */
  decimalsOut: number;
  /** Expected price (tokenOut per tokenIn) */
  expectedPrice: number;
  /** Uniswap V3 fee tier (bps) — only for uniswap_v3 */
  feeTier?: number;
}

/** A complete arbitrage path (sequence of swaps) */
export interface SwapPath {
  /** Ordered sequence of swaps */
  steps: SwapStep[];
  /** Token that starts and ends the path (e.g. WETH) */
  baseToken: string;
  /** Human-readable label (e.g. "WETH→USDC(UniV2)→WETH(Sushi)") */
  label: string;
}

/** Cost breakdown for an arbitrage opportunity */
export interface CostEstimate {
  /** Flash loan fee in base token units (e.g. 0.05% of borrow) */
  flashLoanFee: number;
  /** Estimated gas cost in base token units (ETH) */
  gasCost: number;
  /** Expected slippage loss in base token units */
  slippageCost: number;
  /** Total costs */
  totalCost: number;
}

/** A validated, profitable arbitrage opportunity */
export interface ArbitrageOpportunity {
  /** Unique identifier */
  id: string;
  /** The swap path to execute */
  path: SwapPath;
  /** Input amount in base token (human-readable, e.g. 10.5 ETH) */
  inputAmount: number;
  /** Expected gross revenue (before costs) in base token */
  grossProfit: number;
  /** Cost breakdown */
  costs: CostEstimate;
  /** Net profit after all costs in base token */
  netProfit: number;
  /** Net profit as percentage of input */
  netProfitPercent: number;
  /** The price delta that triggered this opportunity */
  priceDelta: PriceDelta;
  /** Block number at time of detection */
  blockNumber: number;
  /** Timestamp (ms) of detection */
  timestamp: number;
}

/** Flash loan provider fee schedules */
export interface FlashLoanFees {
  /** Aave V3 fee as decimal (0.0005 = 0.05%) */
  aaveV3: number;
  /** dYdX fee (0 = free) */
  dydx: number;
  /** Balancer fee (0 = free) */
  balancer: number;
}

/** Configuration for the OpportunityDetector */
export interface OpportunityDetectorConfig {
  /** Minimum net profit in base token to emit an opportunity. Default: 0.01 (ETH) */
  minProfitThreshold?: number;
  /** Maximum slippage tolerance as decimal (0.005 = 0.5%). Default: 0.005 */
  maxSlippage?: number;
  /** Default input amount in base token for profit estimation. Default: 10 */
  defaultInputAmount?: number;
  /** Gas price in gwei. Default: 30 */
  gasPriceGwei?: number;
  /** Estimated gas per swap step. Default: 150000 */
  gasPerSwap?: number;
  /** Flash loan fee config. Defaults to Aave V3 rates */
  flashLoanFees?: Partial<FlashLoanFees>;
}

/** Events emitted by OpportunityDetector */
export interface OpportunityDetectorEvents {
  opportunityFound: (opportunity: ArbitrageOpportunity) => void;
  opportunityRejected: (reason: string, delta: PriceDelta) => void;
  error: (error: Error) => void;
}
