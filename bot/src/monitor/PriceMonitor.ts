import { EventEmitter } from "node:events";
import { Contract } from "ethers";
import type {
  PoolConfig,
  PriceDelta,
  PriceMonitorConfig,
  PriceMonitorEvents,
  PriceSnapshot,
} from "./types.js";

/** Safely coerce an unknown caught value to an Error */
function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

// Minimal ABIs for reading pool reserves / slot0
const UNISWAP_V2_PAIR_ABI = [
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
];

const UNISWAP_V3_POOL_ABI = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
];

/**
 * Monitors DEX pool prices and detects cross-DEX arbitrage opportunities.
 *
 * Polls configured pools at a set interval, computes normalized prices,
 * and emits `opportunity` events when the price delta between any two pools
 * for the same token pair exceeds the configured threshold.
 */
export class PriceMonitor extends EventEmitter {
  private readonly config: Required<PriceMonitorConfig>;
  private readonly snapshots = new Map<string, PriceSnapshot>();
  private readonly consecutiveErrors = new Map<string, number>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(config: PriceMonitorConfig) {
    super();
    this.config = {
      provider: config.provider,
      pools: config.pools,
      deltaThresholdPercent: config.deltaThresholdPercent ?? 0.5,
      pollIntervalMs: config.pollIntervalMs ?? 12_000,
      maxRetries: config.maxRetries ?? 3,
    };
  }

  /** Start the polling loop */
  start(): void {
    if (this.running) return;
    this.running = true;
    // Fetch immediately, then on interval
    void this.poll();
    this.pollTimer = setInterval(() => void this.poll(), this.config.pollIntervalMs);
  }

  /** Stop the polling loop */
  stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** Whether the monitor is currently running */
  get isRunning(): boolean {
    return this.running;
  }

  /** Get the latest price snapshot for a pool */
  getSnapshot(poolAddress: string): PriceSnapshot | undefined {
    return this.snapshots.get(poolAddress.toLowerCase());
  }

  /** Get all current snapshots */
  getAllSnapshots(): PriceSnapshot[] {
    return [...this.snapshots.values()];
  }

  /** Single poll cycle: fetch all pools, detect deltas */
  async poll(): Promise<void> {
    await Promise.all(
      this.config.pools.map(async (pool) => {
        const key = pool.poolAddress.toLowerCase();
        try {
          const snapshot = await this.fetchPrice(pool);
          this.consecutiveErrors.set(key, 0);
          this.snapshots.set(key, snapshot);
          this.emit("priceUpdate", snapshot);
        } catch (err) {
          const errCount = (this.consecutiveErrors.get(key) ?? 0) + 1;
          this.consecutiveErrors.set(key, errCount);
          this.emit("error", toError(err), pool);

          if (errCount >= this.config.maxRetries) {
            this.emit("stale", pool);
          }
        }
      }),
    );

    this.detectOpportunities();
  }

  /** Fetch the current price from a single pool */
  async fetchPrice(pool: PoolConfig): Promise<PriceSnapshot> {
    const blockNumber = await this.config.provider.getBlockNumber();

    let price: number;
    if (pool.dex === "uniswap_v3" || pool.dex === "sushiswap_v3") {
      price = await this.fetchV3Price(pool);
    } else {
      // uniswap_v2 and sushiswap use the same pair interface
      price = await this.fetchV2Price(pool);
    }

    return {
      pool,
      price,
      inversePrice: 1 / price,
      blockNumber,
      timestamp: Date.now(),
    };
  }

  /** Read reserves from a Uniswap V2-style pair */
  private async fetchV2Price(pool: PoolConfig): Promise<number> {
    const contract = new Contract(
      pool.poolAddress,
      UNISWAP_V2_PAIR_ABI,
      this.config.provider,
    );
    const [reserve0, reserve1] = await contract.getReserves();

    return this.calculateV2Price(
      BigInt(reserve0),
      BigInt(reserve1),
      pool.decimals0,
      pool.decimals1,
    );
  }

  /** Read sqrtPriceX96 from a Uniswap V3-style pool */
  private async fetchV3Price(pool: PoolConfig): Promise<number> {
    const contract = new Contract(
      pool.poolAddress,
      UNISWAP_V3_POOL_ABI,
      this.config.provider,
    );
    const [sqrtPriceX96] = await contract.slot0();

    return this.calculateV3Price(
      BigInt(sqrtPriceX96),
      pool.decimals0,
      pool.decimals1,
    );
  }

  /**
   * Calculate price from V2 reserves.
   * price = (reserve1 / 10^d1) / (reserve0 / 10^d0)
   */
  calculateV2Price(
    reserve0: bigint,
    reserve1: bigint,
    decimals0: number,
    decimals1: number,
  ): number {
    const r0 = Number(reserve0) / 10 ** decimals0;
    const r1 = Number(reserve1) / 10 ** decimals1;
    if (r0 === 0) return 0;
    return r1 / r0;
  }

  /**
   * Calculate price from V3 sqrtPriceX96.
   * price = (sqrtPriceX96 / 2^96)^2 * 10^(d0 - d1)
   */
  calculateV3Price(
    sqrtPriceX96: bigint,
    decimals0: number,
    decimals1: number,
  ): number {
    const Q96 = 2n ** 96n;
    // Use floating point for the final calculation to avoid overflow
    const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
    const rawPrice = sqrtPrice * sqrtPrice;
    return rawPrice * 10 ** (decimals0 - decimals1);
  }

  /** Compare all pools with the same token pair and emit opportunity events */
  private detectOpportunities(): void {
    // Group snapshots by token pair
    const pairGroups = new Map<string, PriceSnapshot[]>();

    for (const snapshot of this.snapshots.values()) {
      const key = this.pairKey(snapshot.pool);
      const group = pairGroups.get(key) ?? [];
      group.push(snapshot);
      pairGroups.set(key, group);
    }

    // For each pair with 2+ pools, find max delta
    for (const [pair, snapshots] of pairGroups) {
      if (snapshots.length < 2) continue;

      let minSnap = snapshots[0];
      let maxSnap = snapshots[0];

      for (const snap of snapshots) {
        if (snap.price < minSnap.price) minSnap = snap;
        if (snap.price > maxSnap.price) maxSnap = snap;
      }

      if (minSnap.price === 0) continue;

      const deltaPercent =
        ((maxSnap.price - minSnap.price) / minSnap.price) * 100;

      if (deltaPercent >= this.config.deltaThresholdPercent) {
        const delta: PriceDelta = {
          pair,
          buyPool: minSnap,
          sellPool: maxSnap,
          deltaPercent,
          timestamp: Date.now(),
        };
        this.emit("opportunity", delta);
      }
    }
  }

  /** Create a canonical key for a token pair, regardless of order */
  private pairKey(pool: PoolConfig): string {
    const [a, b] = [pool.token0.toLowerCase(), pool.token1.toLowerCase()].sort();
    return `${a}/${b}`;
  }
}
