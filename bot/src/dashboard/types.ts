export interface TradeOutcome {
  // Identifiers
  txHash: string;               // Transaction hash (or "simulation" for reverts caught in eth_call)
  timestamp: number;             // Unix timestamp in milliseconds
  blockNumber: number;           // Block where transaction was mined (or simulated block for reverts)

  // Trade details
  path: string;                  // Path label (e.g., "WETH/USDC UniV3 0.05% -> WETH/USDC UniV3 0.3%")
  inputAmount: number;           // Input amount in ETH

  // Three-bucket P&L accounting
  grossProfit: number;           // ETH profit before costs (can be negative if simulation caught a loss)
  gasCost: number;               // L2 gas cost in ETH
  l1DataFee: number;             // L1 data fee in ETH (Arbitrum-specific, 0 on L1-only chains)
  revertCost: number;            // Gas burned on reverted transaction (0 for successful trades)

  // Computed field
  netProfit: number;             // grossProfit - gasCost - l1DataFee - revertCost

  // Status
  status: "success" | "revert" | "simulation_revert";
  // "success": transaction mined and profitable
  // "revert": transaction mined but reverted on-chain (burned gas)
  // "simulation_revert": eth_call simulation caught unprofitability, transaction not broadcast
}

export interface SessionStats {
  totalTrades: number;
  successCount: number;
  revertCount: number;
  simulationRevertCount: number;

  grossProfitEth: number;
  gasCostEth: number;
  l1DataFeeEth: number;
  revertCostEth: number;
  netProfitEth: number;

  winRate: number;              // successCount / totalTrades
  firstTradeTimestamp?: number;
  lastTradeTimestamp?: number;
}
