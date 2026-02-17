import "dotenv/config";
import { JsonRpcProvider } from "ethers";
import { loadChainConfig } from "./config/index.js";
import { FlashloanBot, BOT_VERSION } from "./index.js";
import { estimateArbitrumGas, gasComponentsToEth } from "./gas/index.js";
import type { ArbitrageOpportunity } from "./detector/types.js";
import type { PriceSnapshot, PriceDelta } from "./monitor/types.js";

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
    `\n[${ts()}] [STATS] uptime=${mins}m${secs}s ` +
      `prices=${stats.priceUpdates} ` +
      `found=${stats.opportunitiesFound} ` +
      `rejected=${stats.opportunitiesRejected} ` +
      `errors=${stats.errors}\n`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  // Load chain config using chainId 421614 (Arbitrum Sepolia)
  const chain = loadChainConfig(421614);

  const rpcStatus = chain.rpcUrl ? "configured" : "MISSING";

  console.log(`\n========================================`);
  console.log(`  Flashloan Bot v${BOT_VERSION} — ARBITRUM SEPOLIA`);
  console.log(`  Report-only (no transactions)`);
  console.log(`  Chain:    ${chain.chainName} (chainId ${chain.chainId})`);
  console.log(`  RPC:      ${rpcStatus}`);
  console.log(`  Pools:    ${chain.pools.length} configured`);
  console.log(`  WETH:     ${chain.tokens.WETH}`);
  console.log(`========================================\n`);

  // Guard: RPC URL is required
  if (!chain.rpcUrl) {
    console.error(`[ERROR] RPC_URL environment variable is not set.`);
    console.error(`[ERROR] Set RPC_URL to your Arbitrum Sepolia RPC endpoint and retry.`);
    console.error(`[ERROR] Example: export RPC_URL=https://arb-sepolia.g.alchemy.com/v2/YOUR_KEY`);
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
      // Fallback: use simple estimation if NodeInterface call fails (e.g., on local fork)
      console.warn(
        `[GAS] NodeInterface call failed, using L2-only estimate: ${err instanceof Error ? err.message : err}`,
      );
      return { gasCost: 0, l1DataFee: undefined };
    }
  };

  bot.detector.setGasEstimator(arbGasEstimator);

  // ---- Event listeners ----

  // Price updates
  bot.monitor.on("priceUpdate", (snapshot: PriceSnapshot) => {
    stats.priceUpdates++;
    console.log(
      `[${ts()}] [PRICE] ${snapshot.pool.label} ` +
        `price=${snapshot.price.toFixed(8)} ` +
        `block=${snapshot.blockNumber}`,
    );
  });

  // Opportunities found
  bot.detector.on("opportunityFound", (opp: ArbitrageOpportunity) => {
    stats.opportunitiesFound++;
    console.log(`[${ts()}] [OPPORTUNITY] ================================`);
    console.log(`  Path:       ${opp.path.label}`);
    console.log(`  Input:      ${opp.inputAmount} ETH`);
    console.log(`  Gross:      ${opp.grossProfit.toFixed(8)} ETH`);
    console.log(`  Gas (L2):   ${opp.costs.gasCost.toFixed(8)} ETH`);
    if (opp.costs.l1DataFee !== undefined) {
      console.log(`  L1 data fee:${opp.costs.l1DataFee.toFixed(8)} ETH`);
    }
    console.log(`  Flash fee:  ${opp.costs.flashLoanFee.toFixed(8)} ETH`);
    console.log(`  Slippage:   ${opp.costs.slippageCost.toFixed(8)} ETH`);
    console.log(`  Total cost: ${opp.costs.totalCost.toFixed(8)} ETH`);
    console.log(`  Net profit: ${opp.netProfit.toFixed(8)} ETH (${opp.netProfitPercent.toFixed(4)}%)`);
    console.log(`  Block:      ${opp.blockNumber}`);
    console.log(`  [REPORT-ONLY] No transaction sent`);
    console.log(`================================================`);
  });

  // Opportunities rejected
  bot.detector.on("opportunityRejected", (reason: string, delta: PriceDelta) => {
    stats.opportunitiesRejected++;
    console.log(
      `[${ts()}] [REJECTED] ${reason} | pair=${delta.pair} delta=${delta.deltaPercent.toFixed(4)}%`,
    );
  });

  // Errors
  bot.monitor.on("error", (err: Error, pool) => {
    stats.errors++;
    console.error(`[${ts()}] [ERROR] Pool ${pool.label}: ${err.message}`);
  });

  bot.monitor.on("stale", (pool) => {
    console.warn(`[${ts()}] [STALE] Pool marked stale: ${pool.label}`);
  });

  bot.detector.on("error", (err: unknown) => {
    stats.errors++;
    console.error(`[${ts()}] [ERROR] Detector: ${err instanceof Error ? err.message : String(err)}`);
  });

  // ---- Stats interval (every 60s) ----
  const statsInterval = setInterval(logStats, 60_000);

  // ---- Graceful shutdown ----
  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`\n[${ts()}] [SHUTDOWN] Stopping Arbitrum Sepolia monitor...`);
    clearInterval(statsInterval);
    await bot.stop();

    console.log(`\n[${ts()}] [SHUTDOWN] Final stats:`);
    logStats();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  // ---- Start ----
  await bot.start();

  // Warn if no pools configured (expected initially — requires on-chain discovery)
  if (chain.pools.length === 0) {
    console.log(`\n[${ts()}] [ARB-SEPOLIA] No pools configured — bot is running but idle.`);
    console.log(`[${ts()}] [ARB-SEPOLIA] Discover pools via factory.getPool() and populate`);
    console.log(`[${ts()}] [ARB-SEPOLIA] bot/src/config/chains/pools/arbitrum-sepolia.ts`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
