import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FlashloanBot, BOT_VERSION } from "./index.js";
import { SEPOLIA_TOKENS, SEPOLIA_MONITOR, SEPOLIA_DETECTOR } from "./config/index.js";
import type { PoolDefinition } from "./config/index.js";
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
// Pool loading
// ---------------------------------------------------------------------------
function loadPools(): PoolDefinition[] {
  const poolPath = resolve(import.meta.dirname ?? ".", "../config/sepolia-pools.json");
  if (existsSync(poolPath)) {
    try {
      const raw = readFileSync(poolPath, "utf-8");
      const pools = JSON.parse(raw) as PoolDefinition[];
      console.log(`[TESTNET] Loaded ${pools.length} pools from ${poolPath}`);
      return pools;
    } catch (err) {
      console.warn(`[TESTNET] Failed to parse ${poolPath}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.warn("[TESTNET] No sepolia-pools.json found — running with empty pool list");
  console.warn("[TESTNET] Create bot/config/sepolia-pools.json to monitor pools");
  return [];
}

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
  console.log(`\n========================================`);
  console.log(`  Flashloan Bot v${BOT_VERSION} — TESTNET MODE`);
  console.log(`  Report-only (no transactions)`);
  console.log(`  Network: Sepolia (chainId 11155111)`);
  console.log(`  Tokens: WETH=${SEPOLIA_TOKENS.WETH}`);
  console.log(`          USDC=${SEPOLIA_TOKENS.USDC}`);
  console.log(`========================================\n`);

  const pools = loadPools();

  const bot = FlashloanBot.fromEnv({
    pools,
    monitor: SEPOLIA_MONITOR,
    detector: SEPOLIA_DETECTOR,
    logLevel: (process.env.LOG_LEVEL as "debug" | "info" | "warn" | "error") ?? "debug",
  });

  // ---- Enhanced event listeners for report-only mode ----

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
    console.log(`  Gas cost:   ${opp.costs.gasCost.toFixed(8)} ETH`);
    console.log(`  Flash fee:  ${opp.costs.flashLoanFee.toFixed(8)} ETH`);
    console.log(`  Slippage:   ${opp.costs.slippageCost.toFixed(8)} ETH`);
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

  // ---- Stats interval ----
  const statsInterval = setInterval(logStats, 60_000);

  // ---- Graceful shutdown ----
  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`\n[${ts()}] [SHUTDOWN] Stopping testnet monitor...`);
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

  if (pools.length === 0) {
    console.log(`\n[${ts()}] [TESTNET] No pools configured — bot is running but idle.`);
    console.log(`[${ts()}] [TESTNET] Add pools to bot/config/sepolia-pools.json to start monitoring.`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
