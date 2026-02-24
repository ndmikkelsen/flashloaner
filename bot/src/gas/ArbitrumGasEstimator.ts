import { Contract, type Provider } from "ethers";

/**
 * Arbitrum NodeInterface precompile address.
 * Always deployed at this fixed address on all Arbitrum chains.
 */
const NODE_INTERFACE_ADDRESS = "0x00000000000000000000000000000000000000C8";

/**
 * ABI for the `gasEstimateComponents` function on the NodeInterface precompile.
 * Returns L1 data fee component and L2 execution component separately.
 *
 * @see https://docs.arbitrum.io/build-decentralized-apps/how-to-estimate-gas
 */
const NODE_INTERFACE_ABI = [
  "function gasEstimateComponents(address to, bool contractCreation, bytes calldata data) view returns (uint64 gasEstimate, uint64 gasEstimateForL1, uint256 baseFee, uint256 l1BaseFeeEstimate)",
];

/**
 * Dual-component gas breakdown for an Arbitrum transaction.
 *
 * On Arbitrum, total transaction cost has two components:
 *  - L1 data fee: cost to post calldata to Ethereum L1 (~95% of total)
 *  - L2 execution fee: cost to execute on the Arbitrum sequencer (~5% of total)
 *
 * Without accounting for L1 data fees, profitability calculations will be
 * significantly understated, causing the bot to execute losing trades.
 *
 * @see https://docs.arbitrum.io/build-decentralized-apps/how-to-estimate-gas
 */
export interface ArbitrumGasComponents {
  /** Total L1+L2 gas units (gasEstimate from NodeInterface) */
  totalGas: bigint;
  /** L1 data component in gas units (~95% of total on Arbitrum) */
  l1Gas: bigint;
  /** L2 execution component in gas units (~5% of total) */
  l2Gas: bigint;
  /** Current L2 base fee in wei per gas unit */
  baseFee: bigint;
  /** L1 gas price estimate in wei (used to price L1 data posting) */
  l1BaseFeeEstimate: bigint;
  /** Approximate total cost in wei: totalGas * baseFee */
  totalCostWei: bigint;
}

/**
 * Estimates Arbitrum transaction gas using the NodeInterface precompile at 0xC8.
 *
 * This calls `gasEstimateComponents` which returns a dual breakdown:
 * - `gasEstimateForL1`: gas units attributable to L1 data fee
 * - `gasEstimate`: total gas (L1 + L2 combined)
 * - `baseFee`: current L2 base fee
 * - `l1BaseFeeEstimate`: estimated L1 gas price for data posting cost
 *
 * @param provider - An ethers.js v6 Provider connected to an Arbitrum chain
 * @param to       - Target contract address for the transaction
 * @param data     - Encoded calldata (hex string)
 * @returns ArbitrumGasComponents with L1/L2 breakdown and total cost in wei
 *
 * @see https://docs.arbitrum.io/build-decentralized-apps/how-to-estimate-gas
 */
export async function estimateArbitrumGas(
  provider: Provider,
  to: string,
  data: string,
): Promise<ArbitrumGasComponents> {
  const nodeInterface = new Contract(NODE_INTERFACE_ADDRESS, NODE_INTERFACE_ABI, provider);

  const result = await nodeInterface.gasEstimateComponents(to, false, data);

  const totalGas = BigInt(result.gasEstimate);
  const l1Gas = BigInt(result.gasEstimateForL1);
  const baseFee = BigInt(result.baseFee);
  const l1BaseFeeEstimate = BigInt(result.l1BaseFeeEstimate);

  const l2Gas = totalGas - l1Gas;
  const totalCostWei = totalGas * baseFee;

  return {
    totalGas,
    l1Gas,
    l2Gas,
    baseFee,
    l1BaseFeeEstimate,
    totalCostWei,
  };
}

/**
 * Converts ArbitrumGasComponents bigint values to human-readable ETH amounts.
 *
 * Useful for logging, reporting, and comparing against profit estimates
 * which are typically expressed as floating-point ETH values.
 *
 * @param components - Gas breakdown from estimateArbitrumGas
 * @returns ETH-denominated cost breakdown as floating-point numbers
 */
export function gasComponentsToEth(components: ArbitrumGasComponents): {
  totalCostEth: number;
  l1CostEth: number;
  l2CostEth: number;
} {
  return {
    totalCostEth: Number(components.totalCostWei) / 1e18,
    l1CostEth: Number(components.l1Gas * components.baseFee) / 1e18,
    l2CostEth: Number(components.l2Gas * components.baseFee) / 1e18,
  };
}
