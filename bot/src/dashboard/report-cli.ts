#!/usr/bin/env node
import "dotenv/config";
import { TradeStore } from "./TradeStore.js";
import type { TradeOutcome } from "./types.js";

// ANSI colors (same helpers as run-arb-mainnet.ts)
const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

function formatTradeOutcome(trade: TradeOutcome, index: number): string {
  const statusColor = trade.status === "success" ? c.green : trade.status === "revert" ? c.red : c.yellow;
  const netColor = trade.netProfit >= 0 ? c.green : c.red;

  const date = new Date(trade.timestamp).toISOString();

  let output = statusColor(`\n[${index + 1}] ${trade.status.toUpperCase()} — ${date}\n`);
  output += c.dim(`    TxHash:       ${trade.txHash}\n`);
  output += c.dim(`    Block:        ${trade.blockNumber}\n`);
  output += c.cyan(`    Path:         ${trade.path}\n`);
  output += c.cyan(`    Input:        ${trade.inputAmount.toFixed(4)} ETH\n`);
  output += c.cyan(`    ────────────────────────────────────────\n`);
  output += c.cyan(`    Gross profit: ${trade.grossProfit.toFixed(6)} ETH\n`);
  output += c.cyan(`    Gas (L2):     ${trade.gasCost.toFixed(6)} ETH\n`);
  output += c.cyan(`    L1 data fee:  ${trade.l1DataFee.toFixed(6)} ETH\n`);
  output += c.cyan(`    Revert cost:  ${trade.revertCost.toFixed(6)} ETH\n`);
  output += c.cyan(`    ────────────────────────────────────────\n`);
  output += netColor(`    Net P&L:      ${trade.netProfit.toFixed(6)} ETH\n`);

  return output;
}

function main(): void {
  // Parse CLI args
  const args = process.argv.slice(2);
  let lastN = 10; // Default: last 10 trades

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--last" && args[i + 1]) {
      lastN = parseInt(args[i + 1], 10);
      if (isNaN(lastN) || lastN < 1) {
        console.error(c.red(`[ERROR] --last must be a positive integer`));
        process.exit(1);
      }
      i++; // Skip next arg (already consumed)
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`
${c.bold("Flashloan Bot — Trade Report CLI")}

Usage:
  pnpm report [--last N]

Options:
  --last N    Show last N trades (default: 10)
  --help      Show this help message

Examples:
  pnpm report              # Show last 10 trades
  pnpm report --last 20    # Show last 20 trades
`);
      process.exit(0);
    } else {
      console.error(c.red(`[ERROR] Unknown argument: ${args[i]}`));
      console.error(c.dim(`Run with --help for usage info`));
      process.exit(1);
    }
  }

  // Load TradeStore
  const store = new TradeStore();

  // Get session stats
  const stats = store.getStats();

  // Print header
  console.log(c.bold(`\n========================================`));
  console.log(c.bold(`  Flashloan Bot — Trade Report`));
  console.log(c.bold(`========================================\n`));

  console.log(c.cyan(`Total trades:    ${stats.totalTrades}`));
  console.log(c.cyan(`Success:         ${stats.successCount} (${(stats.winRate * 100).toFixed(1)}% win rate)`));
  console.log(c.cyan(`Reverts:         ${stats.revertCount}`));
  console.log(c.cyan(`Sim reverts:     ${stats.simulationRevertCount}`));
  console.log(c.cyan(`────────────────────────────────────────`));
  console.log(c.cyan(`Gross profit:    ${stats.grossProfitEth.toFixed(6)} ETH`));
  console.log(c.cyan(`Gas cost (L2):   ${stats.gasCostEth.toFixed(6)} ETH`));
  console.log(c.cyan(`L1 data fee:     ${stats.l1DataFeeEth.toFixed(6)} ETH`));
  console.log(c.cyan(`Revert cost:     ${stats.revertCostEth.toFixed(6)} ETH`));
  console.log(c.cyan(`────────────────────────────────────────`));
  const netColor = stats.netProfitEth >= 0 ? c.green : c.red;
  console.log(netColor(`Net P&L:         ${stats.netProfitEth.toFixed(6)} ETH`));

  // Print recent trades
  const trades = store.getLast(lastN);

  if (trades.length === 0) {
    console.log(c.dim(`\nNo trades yet.\n`));
    return;
  }

  console.log(c.bold(`\n\nLast ${trades.length} trade(s):\n`));

  for (let i = 0; i < trades.length; i++) {
    console.log(formatTradeOutcome(trades[i], i));
  }

  console.log(c.dim(`\n(Showing ${trades.length} of ${stats.totalTrades} total trades)\n`));
}

main();
