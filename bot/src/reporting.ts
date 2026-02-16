import type { ArbitrageOpportunity } from "./detector/types.js";

export interface ScanStats {
  pollCount: number;
  opportunitiesFound: number;
  opportunitiesRejected: number;
  priceUpdates: number;
  errors: number;
  startTime: number;
}

/**
 * Format a detailed opportunity report for console output.
 * Shows token pair, pools, spread, profit breakdown, and execute/skip decision.
 */
export function formatOpportunityReport(
  opp: ArbitrageOpportunity,
  dryRun: boolean,
): string {
  const { priceDelta, costs, path } = opp;
  const buyLabel = priceDelta.buyPool.pool.label;
  const sellLabel = priceDelta.sellPool.pool.label;
  const buyPrice = priceDelta.buyPool.price;
  const sellPrice = priceDelta.sellPool.price;
  const spread = priceDelta.deltaPercent;

  const profitable = opp.netProfit > 0;
  let decision: string;
  if (profitable) {
    decision = dryRun ? "WOULD EXECUTE (dry-run)" : "EXECUTE";
  } else {
    decision = "SKIP (unprofitable)";
  }

  const lines = [
    ``,
    `${"=".repeat(60)}`,
    `  OPPORTUNITY DETECTED`,
    `${"=".repeat(60)}`,
    `  Path:         ${path.label}`,
    `  Buy pool:     ${buyLabel} @ ${buyPrice.toFixed(4)}`,
    `  Sell pool:    ${sellLabel} @ ${sellPrice.toFixed(4)}`,
    `  Spread:       ${spread.toFixed(2)}%`,
    `  Block:        ${opp.blockNumber}`,
    `${"─".repeat(60)}`,
    `  Input amount: ${opp.inputAmount} (base token)`,
    `  Gross profit: ${opp.grossProfit.toFixed(6)}`,
    `  Costs:`,
    `    Flash loan fee: ${costs.flashLoanFee.toFixed(6)}`,
    `    Gas cost:       ${costs.gasCost.toFixed(6)}`,
    `    Slippage:       ${costs.slippageCost.toFixed(6)}`,
    `    Total costs:    ${costs.totalCost.toFixed(6)}`,
    `  Net profit:   ${opp.netProfit.toFixed(6)} (${opp.netProfitPercent.toFixed(3)}%)`,
    `${"─".repeat(60)}`,
    `  Decision:     ${decision}`,
    `${"=".repeat(60)}`,
    ``,
  ];

  return lines.join("\n");
}

/**
 * Format a brief rejection report (debug-level output).
 */
export function formatRejectionReport(reason: string, pair: string): string {
  return `  [REJECTED] ${pair}: ${reason}`;
}

/**
 * Format the startup header showing what the bot will monitor.
 */
export function formatScanHeader(
  poolCount: number,
  chainId: number,
  pollIntervalMs: number,
): string {
  const intervalSec = (pollIntervalMs / 1000).toFixed(1);
  const lines = [
    ``,
    `${"*".repeat(60)}`,
    `  FLASHLOAN ARBITRAGE BOT - DRY RUN`,
    `${"*".repeat(60)}`,
    `  Chain ID:       ${chainId}`,
    `  Pools:          ${poolCount}`,
    `  Poll interval:  ${intervalSec}s`,
    `  Mode:           Monitor & Report (no execution)`,
    `${"*".repeat(60)}`,
    ``,
  ];
  return lines.join("\n");
}

/**
 * Format a summary of scan statistics at shutdown.
 */
export function formatScanSummary(stats: ScanStats): string {
  const elapsedMs = Date.now() - stats.startTime;
  const elapsedMin = (elapsedMs / 60000).toFixed(1);

  const lines = [
    ``,
    `${"=".repeat(60)}`,
    `  SCAN SUMMARY`,
    `${"=".repeat(60)}`,
    `  Runtime:             ${elapsedMin} min`,
    `  Poll cycles:         ${stats.pollCount}`,
    `  Price updates:       ${stats.priceUpdates}`,
    `  Opportunities found: ${stats.opportunitiesFound}`,
    `  Opportunities skipped: ${stats.opportunitiesRejected}`,
    `  Errors:              ${stats.errors}`,
    `${"=".repeat(60)}`,
    ``,
  ];
  return lines.join("\n");
}
