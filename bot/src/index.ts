import "dotenv/config";
import { JsonRpcProvider } from "ethers";
import { PriceMonitor } from "./monitor/PriceMonitor.js";
import { OpportunityDetector } from "./detector/OpportunityDetector.js";
import {
  parseEnv,
  buildConfig,
  type BotConfig,
  type PoolDefinition,
} from "./config/index.js";

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
  private _status: BotStatus = "idle";
  private shutdownHandlers: Array<() => void> = [];

  constructor(config: BotConfig) {
    this.config = config;

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
  static fromEnv(overrides: Partial<BotConfig> = {}): FlashloanBot {
    const envVars = parseEnv(process.env);
    const config = buildConfig(envVars, overrides);
    return new FlashloanBot(config);
  }

  /** Current bot status */
  get status(): BotStatus {
    return this._status;
  }

  /** Start all modules in dependency order */
  async start(): Promise<void> {
    if (this._status === "running") return;
    this._status = "starting";

    this.log("info", `Flashloan Bot v${BOT_VERSION} starting...`);
    this.log("info", `Chain ID: ${this.config.network.chainId}`);
    this.log("info", `Monitoring ${this.config.pools.length} pools`);

    // 1. Attach detector to monitor
    this.detector.attach(this.monitor);

    // 2. Start price monitoring
    this.monitor.start();

    // 3. Register graceful shutdown
    this.registerShutdownHandlers();

    this._status = "running";
    this.log("info", "Bot is running");
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

    this._status = "stopped";
    this.log("info", "Bot stopped");
  }

  /** Wire up inter-module events and logging */
  private wireEvents(): void {
    // Monitor events
    this.monitor.on("error", (err, pool) => {
      this.log("warn", `Price fetch error [${pool.label}]: ${err.message}`);
    });

    this.monitor.on("stale", (pool) => {
      this.log("warn", `Pool stale: ${pool.label}`);
    });

    // Detector events
    this.detector.on("error", (err) => {
      this.log("error", `Detector error: ${err instanceof Error ? err.message : String(err)}`);
    });

    this.detector.on("opportunityFound", (opp) => {
      this.log(
        "info",
        `Opportunity: ${opp.path.label} | net=${opp.netProfit.toFixed(6)} ETH (${opp.netProfitPercent.toFixed(2)}%)`,
      );
    });

    this.detector.on("opportunityRejected", (reason) => {
      this.log("debug", `Rejected: ${reason}`);
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
