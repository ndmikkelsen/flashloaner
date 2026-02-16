import "dotenv/config";
import { JsonRpcProvider } from "ethers";
import { PriceMonitor } from "./monitor/PriceMonitor.js";
import { OpportunityDetector } from "./detector/OpportunityDetector.js";
import {
  parseEnv,
  buildConfig,
  MAINNET_POOLS,
  type BotConfig,
  type PoolDefinition,
} from "./config/index.js";
import {
  formatOpportunityReport,
  formatRejectionReport,
  formatScanHeader,
  formatScanSummary,
  type ScanStats,
} from "./reporting.js";

export const BOT_VERSION = "0.1.0";

export type BotStatus = "idle" | "starting" | "running" | "stopping" | "stopped";

/**
 * Main bot orchestrator. Initializes and coordinates all modules:
 * PriceMonitor → OpportunityDetector → (TransactionBuilder → ExecutionEngine)
 *
 * Usage:
 * ```ts
 * const bot = FlashloanBot.fromEnv();
 * await bot.start();
 * // ... bot runs until stopped
 * await bot.stop();
 * ```
 */
export class FlashloanBot {
  readonly config: BotConfig;
  readonly monitor: PriceMonitor;
  readonly detector: OpportunityDetector;
  readonly dryRun: boolean;
  readonly stats: ScanStats;
  private _status: BotStatus = "idle";
  private shutdownHandlers: Array<() => void> = [];

  constructor(config: BotConfig, dryRun = true) {
    this.config = config;
    this.dryRun = dryRun;
    this.stats = {
      pollCount: 0,
      opportunitiesFound: 0,
      opportunitiesRejected: 0,
      priceUpdates: 0,
      errors: 0,
      startTime: Date.now(),
    };

    const provider = new JsonRpcProvider(config.network.rpcUrl);

    const pools: PoolDefinition[] = config.pools;

    this.monitor = new PriceMonitor({
      provider,
      pools,
      deltaThresholdPercent: config.monitor.deltaThresholdPercent,
      pollIntervalMs: config.monitor.pollIntervalMs,
      maxRetries: config.monitor.maxRetries,
    });

    this.detector = new OpportunityDetector({
      minProfitThreshold: config.detector.minProfitThreshold,
      maxSlippage: config.detector.maxSlippage,
      defaultInputAmount: config.detector.defaultInputAmount,
      gasPriceGwei: config.detector.gasPriceGwei,
      gasPerSwap: config.detector.gasPerSwap,
    });

    this.wireEvents();
  }

  /** Create a bot from environment variables */
  static fromEnv(overrides: Partial<BotConfig> = {}, dryRun = true): FlashloanBot {
    const envVars = parseEnv(process.env);
    // Use mainnet pools by default if none provided
    const pools = overrides.pools ?? MAINNET_POOLS;
    const config = buildConfig(envVars, { ...overrides, pools });
    return new FlashloanBot(config, dryRun);
  }

  /** Current bot status */
  get status(): BotStatus {
    return this._status;
  }

  /** Start all modules in dependency order */
  async start(): Promise<void> {
    if (this._status === "running") return;
    this._status = "starting";

    this.stats.startTime = Date.now();

    // Print startup header
    console.log(
      formatScanHeader(
        this.config.pools.length,
        this.config.network.chainId,
        this.config.monitor.pollIntervalMs,
      ),
    );

    this.log("info", `Flashloan Bot v${BOT_VERSION} starting...`);
    this.log("info", `Chain ID: ${this.config.network.chainId}`);
    this.log("info", `Monitoring ${this.config.pools.length} pools`);
    this.log("info", `Dry-run mode: ${this.dryRun}`);

    // List monitored pools
    for (const pool of this.config.pools) {
      this.log("info", `  Pool: ${pool.label} (${pool.dex}) @ ${pool.poolAddress}`);
    }

    // 1. Attach detector to monitor
    this.detector.attach(this.monitor);

    // 2. Start price monitoring
    this.monitor.start();

    // 3. Register graceful shutdown
    this.registerShutdownHandlers();

    this._status = "running";
    this.log("info", "Bot is running. Press Ctrl+C to stop.");
  }

  /** Stop all modules gracefully */
  async stop(): Promise<void> {
    if (this._status === "stopped" || this._status === "stopping") return;
    this._status = "stopping";

    this.log("info", "Shutting down...");

    // Stop in reverse order
    this.monitor.stop();
    this.detector.detach();

    this.removeShutdownHandlers();

    // Print summary
    console.log(formatScanSummary(this.stats));

    this._status = "stopped";
    this.log("info", "Bot stopped");
  }

  /** Wire up inter-module events and logging */
  private wireEvents(): void {
    // Monitor events — price updates
    this.monitor.on("priceUpdate", (snapshot) => {
      this.stats.priceUpdates++;
      this.log(
        "debug",
        `Price: ${snapshot.pool.label} = ${snapshot.price.toFixed(4)} (block ${snapshot.blockNumber})`,
      );
    });

    this.monitor.on("error", (err, pool) => {
      this.stats.errors++;
      this.log("warn", `Price fetch error [${pool.label}]: ${err.message}`);
    });

    this.monitor.on("stale", (pool) => {
      this.log("warn", `Pool stale: ${pool.label}`);
    });

    // Track poll cycles via monitoring price updates grouped
    this.monitor.on("opportunity", () => {
      this.stats.pollCount++;
    });

    // Detector events — detailed reporting
    this.detector.on("error", (err) => {
      this.stats.errors++;
      this.log("error", `Detector error: ${err instanceof Error ? err.message : String(err)}`);
    });

    this.detector.on("opportunityFound", (opp) => {
      this.stats.opportunitiesFound++;
      console.log(formatOpportunityReport(opp, this.dryRun));
    });

    this.detector.on("opportunityRejected", (reason, delta) => {
      this.stats.opportunitiesRejected++;
      const pair = delta?.pair ?? "unknown";
      this.log("debug", formatRejectionReport(reason, pair));
    });
  }

  /** Register process signal handlers for graceful shutdown */
  private registerShutdownHandlers(): void {
    const handler = () => {
      void this.stop();
    };
    process.on("SIGINT", handler);
    process.on("SIGTERM", handler);
    this.shutdownHandlers.push(handler);
  }

  /** Remove process signal handlers */
  private removeShutdownHandlers(): void {
    for (const handler of this.shutdownHandlers) {
      process.off("SIGINT", handler);
      process.off("SIGTERM", handler);
    }
    this.shutdownHandlers = [];
  }

  /** Simple structured logging */
  private log(level: BotConfig["logLevel"], message: string): void {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    if (levels[level] < levels[this.config.logLevel]) return;

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

    switch (level) {
      case "error":
        console.error(`${prefix} ${message}`);
        break;
      case "warn":
        console.warn(`${prefix} ${message}`);
        break;
      case "debug":
        console.debug(`${prefix} ${message}`);
        break;
      default:
        console.log(`${prefix} ${message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// CLI Entry Point
// ---------------------------------------------------------------------------

/**
 * Main entry point: creates a bot from env vars and runs in dry-run mode.
 * The bot will monitor prices, detect opportunities, and report findings
 * without executing any transactions.
 */
async function main(): Promise<void> {
  const dryRun = process.env.DRY_RUN !== "false";

  try {
    const bot = FlashloanBot.fromEnv({}, dryRun);

    // Keep process alive until shutdown signal
    await bot.start();

    // Wait for shutdown signal — the bot runs via setInterval internally
    await new Promise<void>((resolve) => {
      const check = () => {
        if (bot.status === "stopped") {
          resolve();
        }
      };
      process.on("SIGINT", check);
      process.on("SIGTERM", check);
    });
  } catch (err) {
    console.error("Fatal error:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

// Run main() when this file is executed directly (not imported)
// In ESM, detect direct execution via import.meta
const isDirectExecution =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("/index.ts") || process.argv[1].endsWith("/index.js"));

if (isDirectExecution) {
  main();
}
