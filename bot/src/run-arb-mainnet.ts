import "dotenv/config";
import { JsonRpcProvider } from "ethers";
import { loadChainConfig } from "./config/index.js";
import { FlashloanBot, BOT_VERSION } from "./index.js";
import { estimateArbitrumGas, gasComponentsToEth } from "./gas/index.js";
import type { ArbitrageOpportunity } from "./detector/types.js";
import type { PriceSnapshot, PriceDelta } from "./monitor/types.js";

// ---------------------------------------------------------------------------
// ANSI color helpers (no dependencies)
// ---------------------------------------------------------------------------
const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

// ---------------------------------------------------------------------------
// Stats tracking
// ---------------------------------------------------------------------------
interface Stats {
  priceUpdates: number;
  opportunitiesFound: number;
  opportunitiesRejected: number;
  errors: number;
  startTime: number;
}

const stats: Stats = {
  priceUpdates: 0,
  opportunitiesFound: 0,
  opportunitiesRejected: 0,
  errors: 0,
  startTime: Date.now(),
};

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------
function ts(): string {
  return new Date().toISOString();
}

function logStats(): void {
  const uptime = Math.round((Date.now() - stats.startTime) / 1000);
  const mins = Math.floor(uptime / 60);
  const secs = uptime % 60;
  console.log(
    c.cyan(
      `\n[${ts()}] [STATS] uptime=${mins}m${secs}s ` +
        `prices=${stats.priceUpdates} ` +
        `found=${stats.opportunitiesFound} ` +
        `rejected=${stats.opportunitiesRejected} ` +
        `errors=${stats.errors}\n`,
    ),
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  // Load chain config using chainId 42161 (Arbitrum One)
  const chain = loadChainConfig(42161);

  const rpcStatus = chain.rpcUrl ? "configured" : "MISSING";

  console.log(c.cyan(`\n========================================`));
  console.log(c.cyan(`  Flashloan Bot v${BOT_VERSION} — ARBITRUM ONE`));
  console.log(c.cyan(`  Report-only (no transactions)`));
  console.log(c.cyan(`  Chain:    ${chain.chainName} (chainId ${chain.chainId})`));
  console.log(c.cyan(`  RPC:      ${rpcStatus}`));
  console.log(c.cyan(`  Pools:    ${chain.pools.length} configured`));
  console.log(c.cyan(`  WETH:     ${chain.tokens.WETH}`));
  console.log(c.cyan(`  Input:    ${chain.detector.defaultInputAmount} ETH`));
  console.log(c.cyan(`========================================\n`));

  // Guard: RPC URL is required
  if (!chain.rpcUrl) {
    console.error(`[ERROR] RPC_URL environment variable is not set.`);
    console.error(`[ERROR] Set RPC_URL to your Arbitrum One RPC endpoint and retry.`);
    console.error(`[ERROR] Example: export RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY`);
    process.exit(1);
  }

  // Construct FlashloanBot directly with chain config values (NOT fromEnv())
  // This avoids the default config path that hardcodes Ethereum/Sepolia values.
  const bot = new FlashloanBot({
    network: { rpcUrl: chain.rpcUrl, chainId: chain.chainId },
    pools: chain.pools,
    monitor: chain.monitor,
    detector: chain.detector,
    logLevel: (process.env.LOG_LEVEL as "debug" | "info" | "warn" | "error") ?? "debug",
  });

  // ---- Inject Arbitrum gas estimator ----
  // Uses NodeInterface precompile at 0xC8 for accurate L1+L2 cost breakdown.
  // Falls back to zero/L2-only estimate if NodeInterface call fails (e.g., local fork).
  const arbGasEstimator = async (numSwaps: number): Promise<{ gasCost: number; l1DataFee?: number }> => {
    // Build approximate calldata size for a swap transaction
    // Each swap step ~= 256 bytes calldata (conservative estimate)
    const estimatedCalldataSize = 4 + 32 * 8 * numSwaps; // function selector + args per swap
    const dummyData = "0x" + "00".repeat(estimatedCalldataSize);
    const flashloanExecutor = chain.protocols.aaveV3Pool;

    try {
      const provider = new JsonRpcProvider(chain.rpcUrl);
      const components = await estimateArbitrumGas(provider, flashloanExecutor, dummyData);
      const ethCosts = gasComponentsToEth(components);
      return { gasCost: ethCosts.l2CostEth, l1DataFee: ethCosts.l1CostEth };
    } catch (err) {
      // Fallback: static L1+L2 estimate when NodeInterface fails (e.g., on local fork).
      // Based on typical Arbitrum conditions: L1 data ~90% of cost, L2 execution ~10%.
      // Total ~0.0002 ETH per swap step (conservative).
      console.warn(
        `[GAS] NodeInterface call failed, using static estimate: ${err instanceof Error ? err.message : err}`,
      );
      const staticL2 = 0.00002 * numSwaps;
      const staticL1 = 0.00018 * numSwaps;
      return { gasCost: staticL2, l1DataFee: staticL1 };
    }
  };

  bot.detector.setGasEstimator(arbGasEstimator);

  // ---- Event listeners ----

  // Price updates (dim — high volume, low priority)
  bot.monitor.on("priceUpdate", (snapshot: PriceSnapshot) => {
    stats.priceUpdates++;
    console.log(
      c.dim(
        `[${ts()}] [PRICE] ${snapshot.pool.label} ` +
          `price=${snapshot.price.toFixed(8)} ` +
          `block=${snapshot.blockNumber}`,
      ),
    );
  });

  // Opportunities found (green = would execute, yellow = unprofitable)
  bot.detector.on("opportunityFound", (opp: ArbitrageOpportunity) => {
    stats.opportunitiesFound++;
    const profitable = opp.netProfit > 0;
    const col = profitable ? c.green : c.yellow;
    const tag = profitable ? "OPPORTUNITY" : "OPPORTUNITY (unprofitable)";
    console.log(col(`[${ts()}] [${tag}] ================================`));
    console.log(col(`  Path:       ${opp.path.label}`));
    // Show individual step fee breakdown for cross-tier visibility
    for (let i = 0; i < opp.path.steps.length; i++) {
      const step = opp.path.steps[i];
      const feeRate = step.feeTier !== undefined
        ? `${(step.feeTier / 10000).toFixed(2)}%`
        : "0.30% (V2)";
      const direction = i === 0 ? "Buy" : "Sell";
      console.log(col(`  ${direction} fee:   ${feeRate} on ${step.dex}`));
    }
    const combinedFee = opp.path.steps.reduce((sum, s) => {
      const rate = s.feeTier !== undefined ? s.feeTier / 1_000_000 : 0.003;
      return sum + rate;
    }, 0);
    console.log(col(`  Cost floor: ~${(combinedFee * 100).toFixed(2)}% (trading fees only)`));
    console.log(col(`  Input:      ${opp.inputAmount} ETH`));
    console.log(col(`  Gross:      ${opp.grossProfit.toFixed(8)} ETH`));
    console.log(col(`  Gas (L2):   ${opp.costs.gasCost.toFixed(8)} ETH`));
    if (opp.costs.l1DataFee !== undefined) {
      console.log(col(`  L1 data fee:${opp.costs.l1DataFee.toFixed(8)} ETH`));
    }
    console.log(col(`  Flash fee:  ${opp.costs.flashLoanFee.toFixed(8)} ETH`));
    console.log(col(`  Slippage:   ${opp.costs.slippageCost.toFixed(8)} ETH`));
    console.log(col(`  Total cost: ${opp.costs.totalCost.toFixed(8)} ETH`));
    console.log(col(`  Net profit: ${opp.netProfit.toFixed(8)} ETH (${opp.netProfitPercent.toFixed(4)}%)`));
    console.log(col(`  Block:      ${opp.blockNumber}`));
    const decision = profitable ? "WOULD EXECUTE (dry-run)" : "SKIP (costs exceed profit)";
    console.log(col(`  [${decision}]`));
    console.log(col(`================================================`));
  });

  // Opportunities rejected (dim — noise)
  bot.detector.on("opportunityRejected", (reason: string, delta: PriceDelta) => {
    stats.opportunitiesRejected++;
    console.log(
      c.dim(
        `[${ts()}] [REJECTED] ${reason} | pair=${delta.pair} delta=${delta.deltaPercent.toFixed(4)}%`,
      ),
    );
  });

  // Errors (red)
  bot.monitor.on("error", (err: Error, pool) => {
    stats.errors++;
    console.error(c.red(`[${ts()}] [ERROR] Pool ${pool.label}: ${err.message}`));
  });

  bot.monitor.on("stale", (pool) => {
    console.warn(c.yellow(`[${ts()}] [STALE] Pool marked stale: ${pool.label}`));
  });

  bot.detector.on("error", (err: unknown) => {
    stats.errors++;
    console.error(c.red(`[${ts()}] [ERROR] Detector: ${err instanceof Error ? err.message : String(err)}`));
  });

  // ---- Stats interval (every 60s) ----
  const statsInterval = setInterval(logStats, 60_000);

  // ---- Graceful shutdown ----
  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(c.bold(`\n[${ts()}] [SHUTDOWN] Stopping Arbitrum One monitor...`));
    clearInterval(statsInterval);
    await bot.stop();

    console.log(c.bold(`\n[${ts()}] [SHUTDOWN] Final stats:`));
    logStats();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  // ---- Start ----
  await bot.start();

  // Warn if no pools configured (expected initially — requires on-chain discovery)
  if (chain.pools.length === 0) {
    console.log(`\n[${ts()}] [ARB-MAINNET] No pools configured — bot is running but idle.`);
    console.log(`[${ts()}] [ARB-MAINNET] Discover pools via factory.getPool() and populate`);
    console.log(`[${ts()}] [ARB-MAINNET] bot/src/config/chains/pools/arbitrum-mainnet.ts`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
