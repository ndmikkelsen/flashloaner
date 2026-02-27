import "dotenv/config";
import { JsonRpcProvider, type Wallet } from "ethers";
import { PriceMonitor } from "./monitor/PriceMonitor.js";
import { OpportunityDetector } from "./detector/OpportunityDetector.js";
import { ExecutionEngine } from "./engine/ExecutionEngine.js";
import { TransactionBuilder } from "./builder/TransactionBuilder.js";
import { NonceManager } from "./nonce/NonceManager.js";
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
import type { TradeStore } from "./dashboard/TradeStore.js";
import type { TradeOutcome } from "./dashboard/types.js";

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
  readonly mode: "dry-run" | "shadow" | "live";
  readonly engine?: ExecutionEngine;
  readonly builder?: TransactionBuilder;
  readonly nonceManager?: NonceManager;
  readonly tradeStore?: TradeStore;
  readonly stats: ScanStats;
  private _status: BotStatus = "idle";
  private shutdownHandlers: Array<() => void> = [];

  // Fix #3: Per-pair submission cooldown — prevents rapid-fire gas burn on the same spread
  private _pairCooldowns: Map<string, number> = new Map();
  private readonly SUBMISSION_COOLDOWN_MS = 10_000; // 10 seconds

  // Fix #4: Revert tracking — skip recently reverted pairs for N seconds
  private _revertedPairs: Map<string, { timestamp: number; blockNumber: number }> = new Map();
  private readonly REVERT_COOLDOWN_MS = 10_000; // 10 seconds (~40 blocks on Arbitrum)

  constructor(
    config: BotConfig,
    dryRun = true,
    executionConfig?: {
      wallet?: Wallet;
      executorAddress?: string;
      adapters?: Record<string, string>; // Partial adapter map (only configured DEXs)
      flashLoanProviders?: { aave_v3: string; balancer: string };
    },
    tradeStore?: TradeStore,
  ) {
    this.config = config;
    this.dryRun = dryRun;
    this.tradeStore = tradeStore;

    // Mode detection: DRY_RUN (backward compatible) -> SHADOW_MODE -> LIVE
    const shadowMode = process.env.SHADOW_MODE === "true";
    const liveMode = !dryRun && !shadowMode;

    this.mode = dryRun ? "dry-run" : shadowMode ? "shadow" : "live";

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
      minReserveWeth: config.monitor.minReserveWeth,
      wethAddress: config.monitor.wethAddress,
    });

    this.detector = new OpportunityDetector({
      minProfitThreshold: config.detector.minProfitThreshold,
      maxSlippage: config.detector.maxSlippage,
      defaultInputAmount: config.detector.defaultInputAmount,
      gasPriceGwei: config.detector.gasPriceGwei,
      gasPerSwap: config.detector.gasPerSwap,
    });

    // Initialize execution components in SHADOW or LIVE mode
    if (this.mode === "shadow" || this.mode === "live") {
      if (!executionConfig?.wallet) {
        throw new Error("Wallet is required for shadow/live mode");
      }

      if (!executionConfig?.executorAddress) {
        throw new Error("Executor address is required for shadow/live mode");
      }

      if (!executionConfig?.adapters) {
        throw new Error("Adapters config is required for shadow/live mode");
      }

      if (!executionConfig?.flashLoanProviders) {
        throw new Error("Flash loan providers config is required for shadow/live mode");
      }

      // Build full adapter map (required by TransactionBuilder)
      // Fill missing DEX protocols with zero address (they won't be used)
      const fullAdapterMap = {
        uniswap_v2: executionConfig.adapters.uniswap_v2 ?? "0x0000000000000000000000000000000000000000",
        uniswap_v3: executionConfig.adapters.uniswap_v3 ?? "0x0000000000000000000000000000000000000000",
        sushiswap: executionConfig.adapters.sushiswap ?? "0x0000000000000000000000000000000000000000",
        sushiswap_v3: executionConfig.adapters.sushiswap_v3 ?? "0x0000000000000000000000000000000000000000",
        camelot_v2: executionConfig.adapters.camelot_v2 ?? "0x0000000000000000000000000000000000000000",
        camelot_v3: executionConfig.adapters.camelot_v3 ?? "0x0000000000000000000000000000000000000000",
        ramses_v3: executionConfig.adapters.ramses_v3 ?? "0x0000000000000000000000000000000000000000",
        traderjoe_lb: executionConfig.adapters.traderjoe_lb ?? "0x0000000000000000000000000000000000000000",
      };

      this.builder = new TransactionBuilder({
        executorAddress: executionConfig.executorAddress,
        adapters: fullAdapterMap,
        flashLoanProviders: executionConfig.flashLoanProviders,
        chainId: config.network.chainId,
      });

      this.engine = new ExecutionEngine(executionConfig.wallet, {
        confirmations: 1,
        confirmationTimeoutMs: 120_000,
        maxConsecutiveFailures: 5,
        dryRun: this.mode === "shadow", // Shadow mode uses engine in dry-run
      });

      this.nonceManager = new NonceManager({
        provider: new JsonRpcProvider(config.network.rpcUrl),
        address: executionConfig.wallet.address,
        statePath: ".data/nonce.json",
        pendingTimeoutMs: 300_000, // 5 minutes
      });

      // Sync nonce manager with on-chain state
      void this.nonceManager.syncWithOnChain();

      // Track nonce on transaction submission
      this.engine.on("submitted", (txHash: string) => {
        if (this.nonceManager) {
          this.nonceManager.markSubmitted(txHash);
        }
      });
    }

    this.wireEvents();
  }

  /** Create a bot from environment variables */
  static fromEnv(overrides: Partial<BotConfig> = {}, dryRun?: boolean): FlashloanBot {
    const envVars = parseEnv(process.env);
    // Use mainnet pools by default if none provided
    const pools = overrides.pools ?? MAINNET_POOLS;
    const config = buildConfig(envVars, { ...overrides, pools });

    // Backward compatibility: DRY_RUN env var or explicit parameter
    const isDryRun = dryRun ?? (process.env.DRY_RUN !== "false");

    return new FlashloanBot(config, isDryRun);
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
        this.mode,
      ),
    );

    this.log("info", `Flashloan Bot v${BOT_VERSION} starting...`);
    this.log("info", `Chain ID: ${this.config.network.chainId}`);
    this.log("info", `Monitoring ${this.config.pools.length} pools`);
    this.log("info", `Mode: ${this.mode.toUpperCase()}`);

    // List monitored pools
    for (const pool of this.config.pools) {
      this.log("info", `  Pool: ${pool.label} (${pool.dex}) @ ${pool.poolAddress}`);
    }

    // 1. Attach detector to monitor
    this.detector.attach(this.monitor);

    // 2. Start price monitoring
    this.monitor.start();

    // 2b. Start WebSocket block subscriptions if wsUrl is configured
    if (this.config.network.wsUrl) {
      this.log("info", `WebSocket URL configured — enabling real-time block subscriptions`);
      this.monitor.on("ws:connected", () => {
        this.log("info", "WebSocket connected — polling driven by new blocks");
      });
      this.monitor.on("ws:disconnected", () => {
        this.log("warn", "WebSocket disconnected — falling back to HTTP polling");
      });
      this.monitor.on("ws:reconnecting", () => {
        this.log("info", "WebSocket reconnecting...");
      });
      this.monitor.startWebSocket(this.config.network.wsUrl);
    }

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

    this.detector.on("opportunityFound", async (opp) => {
      this.stats.opportunitiesFound++;

      // DRY_RUN mode: just report
      if (this.mode === "dry-run") {
        console.log(formatOpportunityReport(opp, true));
        return;
      }

      // SHADOW mode: simulate via eth_call, log estimated vs simulated
      if (this.mode === "shadow") {
        console.log(formatOpportunityReport(opp, true));

        if (!this.builder || !this.engine) {
          this.log("error", "[SHADOW] Builder or engine not initialized");
          return;
        }

        // Build the transaction
        const tx = this.builder.buildArbitrageTransaction(opp, "balancer");

        // Simulate via eth_call (free, no gas cost)
        const simResult = await this.engine.simulateTransaction({
          ...tx,
          gas: { maxFeePerGas: 0n, maxPriorityFeePerGas: 0n, gasLimit: 500_000n },
          nonce: 0,
        });

        const ts = new Date().toISOString();
        if (simResult.success) {
          console.log(`\x1b[32m[${ts}] [SHADOW] ✓ Simulation succeeded for ${opp.id}\x1b[0m`);
          console.log(`\x1b[32m[${ts}] [SHADOW]   Estimated profit: ${opp.netProfit.toFixed(8)} ETH\x1b[0m`);
          console.log(`\x1b[32m[${ts}] [SHADOW]   Would broadcast in live mode\x1b[0m`);
        } else {
          console.log(`\x1b[33m[${ts}] [SHADOW] ✗ Simulation failed: ${simResult.reason}\x1b[0m`);
          console.log(`\x1b[33m[${ts}] [SHADOW]   Estimated profit was ${opp.netProfit.toFixed(8)} ETH, but would revert on-chain\x1b[0m`);

          // Record simulation revert in trade store
          this.tradeStore?.append({
            txHash: `sim-${opp.id}`,
            timestamp: Date.now(),
            blockNumber: opp.blockNumber,
            path: opp.path.label,
            inputAmount: opp.inputAmount,
            grossProfit: 0,
            gasCost: 0,
            l1DataFee: 0,
            revertCost: 0,
            netProfit: 0,
            status: "simulation_revert",
          });
        }
        return;
      }

      // LIVE mode: check staleness, cooldowns, and execute
      if (this.mode === "live") {
        const staleness = this.detector.checkStaleness(opp);
        if (!staleness.fresh) {
          this.log("warn", `[STALE] Opportunity ${opp.id} is too stale (${staleness.latencyMs}ms > 200ms). Aborting.`);
          return;
        }

        // Fix #3: Check per-pair submission cooldown
        const pairKey = opp.priceDelta.pair;
        const lastSubmission = this._pairCooldowns.get(pairKey);
        if (lastSubmission && Date.now() - lastSubmission < this.SUBMISSION_COOLDOWN_MS) {
          const remaining = Math.ceil((this.SUBMISSION_COOLDOWN_MS - (Date.now() - lastSubmission)) / 1000);
          this.log("warn", `[COOLDOWN] Skipping ${pairKey} — submitted ${remaining}s ago, waiting for cooldown`);
          return;
        }

        // Fix #4: Check if this pair recently reverted
        const revertInfo = this._revertedPairs.get(pairKey);
        if (revertInfo && Date.now() - revertInfo.timestamp < this.REVERT_COOLDOWN_MS) {
          const remaining = Math.ceil((this.REVERT_COOLDOWN_MS - (Date.now() - revertInfo.timestamp)) / 1000);
          this.log("warn", `[REVERT-SKIP] Skipping ${pairKey} — reverted at block ${revertInfo.blockNumber}, cooldown ${remaining}s remaining`);
          return;
        }

        console.log(formatOpportunityReport(opp, false));
        this.log("info", `[LIVE] Latency: ${staleness.latencyMs}ms (fresh)`);

        if (!this.builder || !this.engine || !this.nonceManager) {
          this.log("error", "[LIVE] Builder, engine, or nonce manager not initialized");
          return;
        }

        try {
          // Get next nonce (waits for pending transactions if any)
          const nonceResult = await this.nonceManager.getNextNonce();
          if (nonceResult.hadPending) {
            this.log("info", `[LIVE] Resolved pending transaction (status: ${nonceResult.pendingStatus})`);
          }

          // Build transaction
          const tx = this.builder.buildArbitrageTransaction(opp, "balancer");

          // Get current gas parameters from provider
          const provider = new JsonRpcProvider(this.config.network.rpcUrl);
          const feeData = await provider.getFeeData();
          const baseFeeGwei = Number(feeData.gasPrice ?? 0n) / 1e9;
          const priorityFeeGwei = 0.01; // 0.01 gwei tip on Arbitrum

          // Calculate gas settings
          const gasSettings = this.builder.calculateGasSettings(
            baseFeeGwei,
            priorityFeeGwei,
            500_000, // Conservative gas limit
          );

          // Prepare transaction with gas and nonce
          const preparedTx = this.builder.prepareTransaction(tx, gasSettings, nonceResult.nonce);

          // Submit transaction — record cooldown immediately
          this.log("info", `[LIVE] Submitting transaction for ${opp.id}...`);
          this._pairCooldowns.set(pairKey, Date.now());
          const result = await this.engine.executeTransaction(preparedTx);

          if (result.status === "confirmed") {
            this.log("info", `[LIVE] ✓ Transaction confirmed: ${result.txHash}`);
            this.log("info", `[LIVE] Gas used: ${result.gasUsed?.toString() ?? "unknown"}`);
            this.nonceManager.markConfirmed(result.txHash!);

            // Record successful trade
            const gasUsedEth = result.gasUsed ? Number(result.gasUsed) * Number(feeData.gasPrice ?? 0n) / 1e18 : opp.costs.gasCost;
            this.tradeStore?.append({
              txHash: result.txHash!,
              timestamp: Date.now(),
              blockNumber: opp.blockNumber,
              path: opp.path.label,
              inputAmount: opp.inputAmount,
              grossProfit: opp.grossProfit,
              gasCost: gasUsedEth,
              l1DataFee: opp.costs.l1DataFee ?? 0,
              revertCost: 0,
              netProfit: opp.grossProfit - gasUsedEth - (opp.costs.l1DataFee ?? 0),
              status: "success",
            });
          } else if (result.status === "reverted") {
            this.log("warn", `[LIVE] ✗ Transaction reverted: ${result.txHash}`);
            this.log("warn", `[LIVE] Revert reason: ${result.revertReason ?? "unknown"}`);
            this.nonceManager.markConfirmed(result.txHash!); // Still increment nonce

            // Fix #4: Track reverted pair for cooldown
            this._revertedPairs.set(pairKey, { timestamp: Date.now(), blockNumber: opp.blockNumber });

            // Record reverted trade (gas burned)
            const revertGasEth = result.gasUsed ? Number(result.gasUsed) * Number(feeData.gasPrice ?? 0n) / 1e18 : opp.costs.gasCost;
            this.tradeStore?.append({
              txHash: result.txHash!,
              timestamp: Date.now(),
              blockNumber: opp.blockNumber,
              path: opp.path.label,
              inputAmount: opp.inputAmount,
              grossProfit: 0,
              gasCost: 0,
              l1DataFee: 0,
              revertCost: revertGasEth + (opp.costs.l1DataFee ?? 0),
              netProfit: -(revertGasEth + (opp.costs.l1DataFee ?? 0)),
              status: "revert",
            });
          } else {
            this.log("error", `[LIVE] ✗ Transaction failed: ${result.error}`);
          }
        } catch (err) {
          this.log("error", `[LIVE] Execution error: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
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
