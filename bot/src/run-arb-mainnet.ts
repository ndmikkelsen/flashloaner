/**
 * Arbitrum One Mainnet Entry Point
 *
 * Execution Modes (controlled by environment variables):
 * - DRY_RUN=true (default): Report opportunities without submitting transactions
 * - SHADOW_MODE=true: Simulate transactions via eth_call to validate profit estimates
 * - DRY_RUN=false: Enable live transaction submission (requires PRIVATE_KEY)
 *
 * Environment Variables:
 * - RPC_URL: Arbitrum One RPC endpoint (required)
 * - BOT_PRIVATE_KEY: Bot wallet private key for signing transactions (required for shadow/live modes)
 * - EXECUTOR_ADDRESS: FlashloanExecutor contract address (required for shadow/live modes)
 * - ADAPTER_UNISWAP_V2: UniswapV2Adapter contract address
 * - ADAPTER_UNISWAP_V3: UniswapV3Adapter contract address
 * - ADAPTER_SUSHISWAP: SushiSwapV2Adapter contract address (reuses UniswapV2Adapter with Sushi router)
 * - ADAPTER_SUSHISWAP_V3: SushiSwapV3Adapter contract address (reuses UniswapV3Adapter with Sushi router)
 * - ADAPTER_CAMELOT_V2: CamelotV2Adapter contract address (reuses UniswapV2Adapter with Camelot router)
 * - ADAPTER_CAMELOT_V3: CamelotV3Adapter contract address
 * - ADAPTER_TRADERJOE_LB: TraderJoeLBAdapter contract address
 * - LOG_LEVEL: Logging level (debug, info, warn, error)
 */
import "dotenv/config";
import { JsonRpcProvider, Wallet } from "ethers";
import { loadChainConfig } from "./config/index.js";
import { FlashloanBot, BOT_VERSION } from "./index.js";
import { estimateArbitrumGas, gasComponentsToEth } from "./gas/index.js";
import type { ArbitrageOpportunity } from "./detector/types.js";
import type { PriceSnapshot, PriceDelta } from "./monitor/types.js";
import { TradeStore } from "./dashboard/TradeStore.js";
import type { TradeOutcome } from "./dashboard/types.js";

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
// TJ LB stale-bin tracking: pool address → { activeId, count }
// ---------------------------------------------------------------------------
const lbBinTracker = new Map<string, { activeId: number; count: number }>();
const STALE_BIN_THRESHOLD = 5;

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

  // Initialize TradeStore
  const tradeStore = new TradeStore(); // Uses default path: .data/trades.jsonl

  // Execution mode detection
  const dryRun = process.env.DRY_RUN !== "false";
  const shadowMode = process.env.SHADOW_MODE === "true";
  const liveMode = !dryRun && !shadowMode;

  const mode = dryRun ? "DRY-RUN" : shadowMode ? "SHADOW" : "LIVE";

  const rpcStatus = chain.rpcUrl ? "configured" : "MISSING";

  console.log(c.cyan(`\n========================================`));
  console.log(c.cyan(`  Flashloan Bot v${BOT_VERSION} — ARBITRUM ONE`));
  console.log(c.cyan(`  Mode:     ${mode}`));
  console.log(c.cyan(`  Chain:    ${chain.chainName} (chainId ${chain.chainId})`));
  console.log(c.cyan(`  RPC:      ${rpcStatus}`));
  console.log(c.cyan(`  Pools:    ${chain.pools.length} configured`));
  console.log(c.cyan(`  WETH:     ${chain.tokens.WETH}`));
  console.log(c.cyan(`  Input:    ${chain.detector.defaultInputAmount} ETH`));
  console.log(c.cyan(`========================================\n`));

  // Display session stats on startup
  const sessionStats = tradeStore.getStats();
  if (sessionStats.totalTrades > 0) {
    console.log(c.bold(`\n[SESSION STATS] Lifetime Performance`));
    console.log(c.cyan(`  Total trades:    ${sessionStats.totalTrades}`));
    console.log(c.cyan(`  Success:         ${sessionStats.successCount} (${(sessionStats.winRate * 100).toFixed(1)}% win rate)`));
    console.log(c.cyan(`  Reverts:         ${sessionStats.revertCount}`));
    console.log(c.cyan(`  Sim reverts:     ${sessionStats.simulationRevertCount}`));
    console.log(c.cyan(`  ────────────────────────────────────────`));
    console.log(c.cyan(`  Gross profit:    ${sessionStats.grossProfitEth.toFixed(6)} ETH`));
    console.log(c.cyan(`  Gas cost (L2):   ${sessionStats.gasCostEth.toFixed(6)} ETH`));
    console.log(c.cyan(`  L1 data fee:     ${sessionStats.l1DataFeeEth.toFixed(6)} ETH`));
    console.log(c.cyan(`  Revert cost:     ${sessionStats.revertCostEth.toFixed(6)} ETH`));
    console.log(c.cyan(`  ────────────────────────────────────────`));
    const netColor = sessionStats.netProfitEth >= 0 ? c.green : c.red;
    console.log(netColor(`  Net P&L:         ${sessionStats.netProfitEth.toFixed(6)} ETH`));
    console.log(c.cyan(`\n`));
  } else {
    console.log(c.dim(`\n[SESSION STATS] No trades yet (first run)\n`));
  }

  // Guard: RPC URL is required
  if (!chain.rpcUrl) {
    console.error(`[ERROR] RPC_URL environment variable is not set.`);
    console.error(`[ERROR] Set RPC_URL to your Arbitrum One RPC endpoint and retry.`);
    console.error(`[ERROR] Example: export RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY`);
    process.exit(1);
  }

  // Load wallet in shadow/live modes
  let wallet: Wallet | undefined;
  if (shadowMode || liveMode) {
    const privateKey = process.env.BOT_PRIVATE_KEY ?? process.env.PRIVATE_KEY;
    if (!privateKey) {
      console.error(`[ERROR] BOT_PRIVATE_KEY environment variable is required for ${mode} mode.`);
      console.error(`[ERROR] Set BOT_PRIVATE_KEY to the bot wallet's private key (0xdC9d...)`);
      process.exit(1);
    }

    const provider = new JsonRpcProvider(chain.rpcUrl);
    wallet = new Wallet(privateKey, provider);

    console.log(c.cyan(`  Wallet:   ${wallet.address}`));
    console.log(c.cyan(`  Balance:  (checking...)`));

    const balance = await provider.getBalance(wallet.address);
    const balanceEth = Number(balance) / 1e18;
    console.log(c.cyan(`            ${balanceEth.toFixed(6)} ETH\n`));

    if (balanceEth < 0.01) {
      console.warn(c.yellow(`[WARN] Low wallet balance (${balanceEth.toFixed(6)} ETH). Ensure you have enough ETH for gas.`));
    }
  }

  // Execution config (adapters, executor address, flash loan providers)
  const executionConfig = (shadowMode || liveMode) && wallet ? {
    wallet,
    executorAddress: process.env.EXECUTOR_ADDRESS ?? "0x0000000000000000000000000000000000000000", // TODO: Set in .env
    adapters: {
      uniswap_v2: process.env.ADAPTER_UNISWAP_V2 ?? "0x0000000000000000000000000000000000000000",
      uniswap_v3: process.env.ADAPTER_UNISWAP_V3 ?? "0x0000000000000000000000000000000000000000",
      sushiswap: process.env.ADAPTER_SUSHISWAP ?? "0x0000000000000000000000000000000000000000",
      sushiswap_v3: process.env.ADAPTER_SUSHISWAP_V3 ?? "0x0000000000000000000000000000000000000000",
      camelot_v2: process.env.ADAPTER_CAMELOT_V2 ?? "0x0000000000000000000000000000000000000000",
      camelot_v3: process.env.ADAPTER_CAMELOT_V3 ?? "0x0000000000000000000000000000000000000000",
      traderjoe_lb: process.env.ADAPTER_TRADERJOE_LB ?? "0x0000000000000000000000000000000000000000",
    },
    flashLoanProviders: {
      aave_v3: chain.protocols.aaveV3Pool,
      balancer: chain.protocols.balancerVault,
    },
  } : undefined;

  // Construct FlashloanBot directly with chain config values (NOT fromEnv())
  // This avoids the default config path that hardcodes Ethereum/Sepolia values.
  const bot = new FlashloanBot(
    {
      network: { rpcUrl: chain.rpcUrl, chainId: chain.chainId },
      pools: chain.pools,
      monitor: chain.monitor,
      detector: chain.detector,
      logLevel: (process.env.LOG_LEVEL as "debug" | "info" | "warn" | "error") ?? "debug",
    },
    dryRun,
    executionConfig,
    tradeStore,
  );

  // ---- Inject Arbitrum gas estimator ----
  // Uses NodeInterface precompile at 0xC8 for accurate L1+L2 cost breakdown.
  // In dry-run mode (no executor deployed), use static estimates silently.
  // In shadow/live mode, use NodeInterface with fallback on failure.
  const executorAddr = process.env.EXECUTOR_ADDRESS;
  const hasExecutor = executorAddr && executorAddr !== "0x0000000000000000000000000000000000000000";

  const arbGasEstimator = async (numSwaps: number): Promise<{ gasCost: number; l1DataFee?: number }> => {
    // Static L1+L2 estimate based on typical Arbitrum conditions:
    // L1 data ~90% of cost, L2 execution ~10%. Total ~0.0002 ETH per swap step.
    const staticL2 = 0.00002 * numSwaps;
    const staticL1 = 0.00018 * numSwaps;

    if (!hasExecutor) {
      // No executor deployed (dry-run) — skip NodeInterface, use static estimates
      return { gasCost: staticL2, l1DataFee: staticL1 };
    }

    // Build approximate calldata size for a swap transaction
    // Each swap step ~= 256 bytes calldata (conservative estimate)
    const estimatedCalldataSize = 4 + 32 * 8 * numSwaps; // function selector + args per swap
    const dummyData = "0x" + "00".repeat(estimatedCalldataSize);

    try {
      const provider = new JsonRpcProvider(chain.rpcUrl);
      const components = await estimateArbitrumGas(provider, executorAddr, dummyData);
      const ethCosts = gasComponentsToEth(components);
      return { gasCost: ethCosts.l2CostEth, l1DataFee: ethCosts.l1CostEth };
    } catch (err) {
      // Fallback: static estimate when NodeInterface fails (e.g., contract not yet verified)
      console.warn(
        `[GAS] NodeInterface call failed, using static estimate: ${err instanceof Error ? err.message : err}`,
      );
      return { gasCost: staticL2, l1DataFee: staticL1 };
    }
  };

  bot.detector.setGasEstimator(arbGasEstimator);

  // ---- Event listeners ----

  // Price updates (dim — high volume, low priority)
  bot.monitor.on("priceUpdate", (snapshot: PriceSnapshot) => {
    stats.priceUpdates++;

    // Include bin ID for TJ LB pools
    const binSuffix = snapshot.activeId !== undefined
      ? ` binId=${snapshot.activeId}`
      : "";

    console.log(
      c.dim(
        `[${ts()}] [PRICE] ${snapshot.pool.label} ` +
          `price=${snapshot.price.toFixed(8)} ` +
          `block=${snapshot.blockNumber}${binSuffix}`,
      ),
    );

    // Track TJ LB bin staleness
    if (snapshot.pool.dex === "traderjoe_lb" && snapshot.activeId !== undefined) {
      const key = snapshot.pool.poolAddress.toLowerCase();
      const prev = lbBinTracker.get(key);
      if (prev && prev.activeId === snapshot.activeId) {
        prev.count++;
        if (prev.count === STALE_BIN_THRESHOLD) {
          console.warn(
            c.yellow(
              `[${ts()}] [WARN] Stale bin: ${snapshot.pool.label} binId=${snapshot.activeId} unchanged for ${prev.count} cycles`,
            ),
          );
        }
      } else {
        lbBinTracker.set(key, { activeId: snapshot.activeId, count: 1 });
      }
    }
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
      let feeRate: string;
      if (step.dex === "traderjoe_lb") {
        // LB: feeTier is binStep in basis points (15 = 0.15%)
        // Show with 50% buffer indicator matching getSwapFeeRate() logic
        const basePct = (step.feeTier ?? 0) / 100; // bps to percent
        feeRate = `${basePct.toFixed(2)}% (LB, +50% buffer)`;
      } else if (step.feeTier !== undefined) {
        // V3: feeTier in hundredths of a bip (500 = 0.05%, 3000 = 0.3%)
        feeRate = `${(step.feeTier / 10000).toFixed(2)}%`;
      } else {
        // V2: standard 0.3%
        feeRate = "0.30% (V2)";
      }
      const direction = i === 0 ? "Buy" : "Sell";
      console.log(col(`  ${direction} fee:   ${feeRate} on ${step.dex}`));
    }
    const combinedFee = opp.path.steps.reduce((sum, s) => {
      let rate: number;
      if (s.dex === "traderjoe_lb") {
        // LB: feeTier is binStep in bps, with 50% buffer
        rate = ((s.feeTier ?? 0) / 10_000) * 1.5;
      } else if (s.feeTier !== undefined) {
        // V3: feeTier in hundredths of a bip
        rate = s.feeTier / 1_000_000;
      } else {
        // V2: standard 0.3%
        rate = 0.003;
      }
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

  // ---- Stats intervals ----
  const priceStatsInterval = setInterval(logStats, 60_000); // Existing price/opportunity stats every 60s

  const tradeStatsInterval = setInterval(() => {
    const sessionStats = tradeStore.getStats();
    if (sessionStats.totalTrades > 0) {
      console.log(c.bold(`\n[SESSION UPDATE] Trade Stats`));
      console.log(c.cyan(`  Total: ${sessionStats.totalTrades} | Win rate: ${(sessionStats.winRate * 100).toFixed(1)}%`));
      const netColor = sessionStats.netProfitEth >= 0 ? c.green : c.red;
      console.log(netColor(`  Net P&L: ${sessionStats.netProfitEth.toFixed(6)} ETH`));
      console.log(c.dim(`  (Gross: ${sessionStats.grossProfitEth.toFixed(6)} | Gas: ${sessionStats.gasCostEth.toFixed(6)} | L1: ${sessionStats.l1DataFeeEth.toFixed(6)} | Revert: ${sessionStats.revertCostEth.toFixed(6)})`));
      console.log(c.cyan(``));
    }
  }, 300_000); // Every 5 minutes

  // ---- Graceful shutdown ----
  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(c.bold(`\n[${ts()}] [SHUTDOWN] Stopping Arbitrum One monitor...`));
    clearInterval(priceStatsInterval);
    clearInterval(tradeStatsInterval);
    await bot.stop();

    // Display final session stats
    const finalStats = tradeStore.getStats();
    if (finalStats.totalTrades > 0) {
      console.log(c.bold(`\n[${ts()}] [SHUTDOWN] Final Session Stats:`));
      console.log(c.cyan(`  Total trades: ${finalStats.totalTrades} | Win rate: ${(finalStats.winRate * 100).toFixed(1)}%`));
      const netColor = finalStats.netProfitEth >= 0 ? c.green : c.red;
      console.log(netColor(`  Net P&L: ${finalStats.netProfitEth.toFixed(6)} ETH`));
    }

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
