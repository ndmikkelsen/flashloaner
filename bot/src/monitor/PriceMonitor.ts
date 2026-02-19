import { EventEmitter } from "node:events";
import { Contract, Interface } from "ethers";
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

const ALGEBRA_V3_POOL_ABI = [
  "function globalState() view returns (uint160 price, int24 tick, uint16 feeZto, uint16 feeOtz, uint16 timepointIndex, uint8 communityFeeToken0, uint8 communityFeeToken1)",
];

// Pre-built Interface instances for encoding/decoding call data
const v2Iface = new Interface(UNISWAP_V2_PAIR_ABI);
const v3Iface = new Interface(UNISWAP_V3_POOL_ABI);
const algebraIface = new Interface(ALGEBRA_V3_POOL_ABI);

// Multicall3 — deployed at same address on all EVM chains
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";
const MULTICALL3_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) returns (tuple(bool success, bytes returnData)[])",
];
const multicallIface = new Interface(MULTICALL3_ABI);

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
      useMulticall: config.useMulticall ?? true,
      minReserveWeth: config.minReserveWeth ?? 0,
      wethAddress: config.wethAddress ?? "",
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
    if (this.config.useMulticall) {
      try {
        await this.pollMulticall();
        return;
      } catch {
        // Multicall failed entirely — fall back to individual calls
      }
    }

    await this.pollIndividual();
  }

  /** Fetch all pools with individual RPC calls (fallback path) */
  private async pollIndividual(): Promise<void> {
    const freshPools = new Set<string>();

    await Promise.all(
      this.config.pools.map(async (pool) => {
        const key = pool.poolAddress.toLowerCase();
        try {
          const snapshot = await this.fetchPrice(pool);
          this.consecutiveErrors.set(key, 0);
          this.snapshots.set(key, snapshot);
          freshPools.add(key);
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

    this.detectOpportunities(freshPools);
  }

  /** Batch all pool reads into a single Multicall3 aggregate3() call */
  private async pollMulticall(): Promise<void> {
    const blockNumber = await this.config.provider.getBlockNumber();
    const freshPools = new Set<string>();

    const calls = this.config.pools.map((pool) => ({
      target: pool.poolAddress,
      allowFailure: true,
      callData: this.getCallDataForPool(pool),
    }));

    const calldata = multicallIface.encodeFunctionData("aggregate3", [calls]);
    const rawResult = await this.config.provider.call({
      to: MULTICALL3_ADDRESS,
      data: calldata,
    });

    if (!rawResult || rawResult === "0x") {
      throw new Error("Multicall3 returned empty result");
    }

    const decoded = multicallIface.decodeFunctionResult("aggregate3", rawResult);
    const results = decoded[0];

    for (let i = 0; i < this.config.pools.length; i++) {
      const pool = this.config.pools[i];
      const key = pool.poolAddress.toLowerCase();
      const result = results[i];

      if (!result.success) {
        const errCount = (this.consecutiveErrors.get(key) ?? 0) + 1;
        this.consecutiveErrors.set(key, errCount);
        this.emit(
          "error",
          new Error(`Multicall failed for ${pool.label}`),
          pool,
        );
        if (errCount >= this.config.maxRetries) {
          this.emit("stale", pool);
        }
        continue;
      }

      try {
        const price = this.decodePriceFromResult(pool, result.returnData);
        const snapshot: PriceSnapshot = {
          pool,
          price,
          inversePrice: 1 / price,
          blockNumber,
          timestamp: Date.now(),
        };
        this.consecutiveErrors.set(key, 0);
        this.snapshots.set(key, snapshot);
        freshPools.add(key);
        this.emit("priceUpdate", snapshot);
      } catch (err) {
        const errCount = (this.consecutiveErrors.get(key) ?? 0) + 1;
        this.consecutiveErrors.set(key, errCount);
        this.emit("error", toError(err), pool);
        if (errCount >= this.config.maxRetries) {
          this.emit("stale", pool);
        }
      }
    }

    this.detectOpportunities(freshPools);
  }

  /** Get the encoded call data for reading price from a pool */
  private getCallDataForPool(pool: PoolConfig): string {
    if (pool.dex === "camelot_v3") {
      return algebraIface.encodeFunctionData("globalState");
    }
    if (pool.dex === "uniswap_v3" || pool.dex === "sushiswap_v3") {
      return v3Iface.encodeFunctionData("slot0");
    }
    return v2Iface.encodeFunctionData("getReserves");
  }

  /** Decode the price from raw return data based on pool's DEX type */
  private decodePriceFromResult(pool: PoolConfig, returnData: string): number {
    if (pool.dex === "camelot_v3") {
      const decoded = algebraIface.decodeFunctionResult(
        "globalState",
        returnData,
      );
      return this.calculateV3Price(
        BigInt(decoded[0]),
        pool.decimals0,
        pool.decimals1,
      );
    }
    if (pool.dex === "uniswap_v3" || pool.dex === "sushiswap_v3") {
      const decoded = v3Iface.decodeFunctionResult("slot0", returnData);
      return this.calculateV3Price(
        BigInt(decoded[0]),
        pool.decimals0,
        pool.decimals1,
      );
    }
    const decoded = v2Iface.decodeFunctionResult("getReserves", returnData);
    const reserve0 = BigInt(decoded[0]);
    const reserve1 = BigInt(decoded[1]);
    this.checkV2Liquidity(pool, reserve0, reserve1);
    return this.calculateV2Price(reserve0, reserve1, pool.decimals0, pool.decimals1);
  }

  /** Fetch the current price from a single pool */
  async fetchPrice(pool: PoolConfig): Promise<PriceSnapshot> {
    const blockNumber = await this.config.provider.getBlockNumber();

    let price: number;
    if (pool.dex === "camelot_v3") {
      price = await this.fetchAlgebraPrice(pool);
    } else if (pool.dex === "uniswap_v3" || pool.dex === "sushiswap_v3") {
      price = await this.fetchV3Price(pool);
    } else {
      // uniswap_v2, sushiswap, and camelot_v2 use the same pair interface
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
    const r0 = BigInt(reserve0);
    const r1 = BigInt(reserve1);
    this.checkV2Liquidity(pool, r0, r1);
    return this.calculateV2Price(r0, r1, pool.decimals0, pool.decimals1);
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

  /** Read sqrtPriceX96 from an Algebra V3-style pool (Camelot V3) */
  private async fetchAlgebraPrice(pool: PoolConfig): Promise<number> {
    const contract = new Contract(
      pool.poolAddress,
      ALGEBRA_V3_POOL_ABI,
      this.config.provider,
    );
    const [sqrtPriceX96] = await contract.globalState();

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

  /**
   * Check that a V2 pool has sufficient WETH liquidity for viable arbitrage.
   * Throws if the WETH-side reserve is below the configured minimum,
   * preventing thin pools from generating false positive opportunities.
   */
  private checkV2Liquidity(pool: PoolConfig, reserve0: bigint, reserve1: bigint): void {
    const minReserve = this.config.minReserveWeth;
    const wethAddr = this.config.wethAddress?.toLowerCase();
    if (!minReserve || !wethAddr) return;

    let wethReserve: number;
    if (pool.token0.toLowerCase() === wethAddr) {
      wethReserve = Number(reserve0) / 1e18;
    } else if (pool.token1.toLowerCase() === wethAddr) {
      wethReserve = Number(reserve1) / 1e18;
    } else {
      return; // Not a WETH pair, skip check
    }

    if (wethReserve < minReserve) {
      throw new Error(
        `Low liquidity: ${pool.label} has ${wethReserve.toFixed(2)} WETH (min: ${minReserve})`,
      );
    }
  }

  /**
   * Compare all pools with the same token pair and emit opportunity events.
   * Only considers pools that were successfully refreshed this cycle to
   * avoid phantom spreads from stale cached prices after RPC errors.
   */
  private detectOpportunities(freshPools: Set<string>): void {
    // Group snapshots by token pair, only including pools refreshed this cycle
    const pairGroups = new Map<string, PriceSnapshot[]>();

    for (const snapshot of this.snapshots.values()) {
      if (!freshPools.has(snapshot.pool.poolAddress.toLowerCase())) continue;
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
