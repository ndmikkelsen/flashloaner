import { vi } from "vitest";

/**
 * Anvil fork management for integration tests.
 *
 * Requires `anvil` to be installed (via foundryup).
 * Tests using this should be gated behind a `FORK_URL` env var.
 *
 * Usage:
 * ```ts
 * const fork = new AnvilFork({ forkUrl: process.env.FORK_URL! });
 * await fork.start();
 * const provider = fork.getProvider();
 * // ... run tests
 * await fork.stop();
 * ```
 */
export class AnvilFork {
  private process: ReturnType<typeof import("node:child_process").spawn> | null = null;
  private readonly forkUrl: string;
  private readonly port: number;
  private readonly blockNumber?: number;

  constructor(opts: {
    forkUrl: string;
    port?: number;
    blockNumber?: number;
  }) {
    this.forkUrl = opts.forkUrl;
    this.port = opts.port ?? 8545;
    this.blockNumber = opts.blockNumber;
  }

  /** Start an Anvil fork process */
  async start(): Promise<void> {
    const { spawn } = await import("node:child_process");

    const args = [
      "--fork-url", this.forkUrl,
      "--port", String(this.port),
      "--no-mining", // manual mining for deterministic tests
    ];

    if (this.blockNumber) {
      args.push("--fork-block-number", String(this.blockNumber));
    }

    this.process = spawn("anvil", args, { stdio: "pipe" });

    // Wait for Anvil to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Anvil startup timed out after 15s"));
      }, 15_000);

      this.process!.stdout?.on("data", (data: Buffer) => {
        if (data.toString().includes("Listening on")) {
          clearTimeout(timeout);
          resolve();
        }
      });

      this.process!.on("error", (err) => {
        clearTimeout(timeout);
        reject(new Error(`Anvil failed to start: ${err.message}`));
      });

      this.process!.on("exit", (code) => {
        if (code !== null && code !== 0) {
          clearTimeout(timeout);
          reject(new Error(`Anvil exited with code ${code}`));
        }
      });
    });
  }

  /** Stop the Anvil process */
  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
    }
  }

  /** Get the RPC URL for the running fork */
  get rpcUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /** Check if Anvil is available on this system */
  static async isAvailable(): Promise<boolean> {
    try {
      const { execSync } = await import("node:child_process");
      execSync("anvil --version", { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Check if fork testing prerequisites are met.
 * Returns a skip reason or null if ready to proceed.
 */
export function checkForkPrereqs(): string | null {
  if (!process.env.FORK_URL && !process.env.MAINNET_RPC_URL) {
    return "FORK_URL or MAINNET_RPC_URL not set";
  }
  return null;
}
