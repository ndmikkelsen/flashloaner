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

const TRADER_JOE_LB_PAIR_ABI = [
  "function getActiveId() view returns (uint24 activeId)",
];

const LIQUIDITY_ABI = [
  "function liquidity() view returns (uint128)",
];

// Pre-built Interface instances for encoding/decoding call data
const v2Iface = new Interface(UNISWAP_V2_PAIR_ABI);
const v3Iface = new Interface(UNISWAP_V3_POOL_ABI);
const algebraIface = new Interface(ALGEBRA_V3_POOL_ABI);
const lbPairIface = new Interface(TRADER_JOE_LB_PAIR_ABI);
const liquidityIface = new Interface(LIQUIDITY_ABI);

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

    // Build multicall: price calls (1 per pool) + liquidity calls (1 per V3 pool)
    const priceCalls = this.config.pools.map((pool) => ({
      target: pool.poolAddress,
      allowFailure: true,
      callData: this.getCallDataForPool(pool),
    }));

    const v3PoolIndices: number[] = [];
    const liquidityCalls: Array<{ target: string; allowFailure: boolean; callData: string }> = [];
    for (let i = 0; i < this.config.pools.length; i++) {
      if (this.isV3Pool(this.config.pools[i])) {
        v3PoolIndices.push(i);
        liquidityCalls.push({
          target: this.config.pools[i].poolAddress,
          allowFailure: true,
          callData: liquidityIface.encodeFunctionData("liquidity"),
        });
      }
    }

    const allCalls = [...priceCalls, ...liquidityCalls];
    const calldata = multicallIface.encodeFunctionData("aggregate3", [allCalls]);
    const rawResult = await this.config.provider.call({
      to: MULTICALL3_ADDRESS,
      data: calldata,
    });

    if (!rawResult || rawResult === "0x") {
      throw new Error("Multicall3 returned empty result");
    }

    const decoded = multicallIface.decodeFunctionResult("aggregate3", rawResult);
    const results = decoded[0];

    // Process price results (indices 0..N-1)
    const N = this.config.pools.length;
    const poolData = new Map<number, {
      price: number;
      reserves?: [bigint, bigint];
      sqrtPriceX96?: bigint;
      liquidity?: bigint;
      activeId?: number;
    }>();

    for (let i = 0; i < N; i++) {
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
        const priceData = this.decodePriceFromResult(pool, result.returnData);
        poolData.set(i, priceData);
      } catch (err) {
        const errCount = (this.consecutiveErrors.get(key) ?? 0) + 1;
        this.consecutiveErrors.set(key, errCount);
        this.emit("error", toError(err), pool);
        if (errCount >= this.config.maxRetries) {
          this.emit("stale", pool);
        }
      }
    }

    // Process liquidity results (indices N..N+M-1, one per V3 pool)
    for (let j = 0; j < v3PoolIndices.length; j++) {
      const poolIndex = v3PoolIndices[j];
      const result = results[N + j];
      if (result?.success) {
        try {
          const liqDecoded = liquidityIface.decodeFunctionResult("liquidity", result.returnData);
          const data = poolData.get(poolIndex);
          if (data) {
            data.liquidity = BigInt(liqDecoded[0]);
          }
        } catch {
          // Liquidity fetch failed — non-critical, slippage falls back to static
        }
      }
    }

    // Build and emit enriched snapshots
    for (const [poolIndex, data] of poolData) {
      const pool = this.config.pools[poolIndex];
      const key = pool.poolAddress.toLowerCase();

      const snapshot: PriceSnapshot = {
        pool,
        price: data.price,
        inversePrice: 1 / data.price,
        blockNumber,
        timestamp: Date.now(),
        ...(data.reserves && { reserves: data.reserves }),
        ...(data.liquidity !== undefined && { liquidity: data.liquidity }),
        ...(data.sqrtPriceX96 !== undefined && { sqrtPriceX96: data.sqrtPriceX96 }),
        ...(data.activeId !== undefined && { activeId: data.activeId }),
      };

      this.consecutiveErrors.set(key, 0);
      this.snapshots.set(key, snapshot);
      freshPools.add(key);
      this.emit("priceUpdate", snapshot);
    }

    this.detectOpportunities(freshPools);
  }

  /** Get the encoded call data for reading price from a pool */
  private getCallDataForPool(pool: PoolConfig): string {
    if (pool.dex === "traderjoe_lb") {
      return lbPairIface.encodeFunctionData("getActiveId");
    }
    if (pool.dex === "camelot_v3") {
      return algebraIface.encodeFunctionData("globalState");
    }
    if (pool.dex === "uniswap_v3" || pool.dex === "sushiswap_v3" || pool.dex === "ramses_v3") {
      return v3Iface.encodeFunctionData("slot0");
    }
    return v2Iface.encodeFunctionData("getReserves");
  }

  /** Decode price and liquidity data from raw return data based on pool's DEX type */
  private decodePriceFromResult(pool: PoolConfig, returnData: string): {
    price: number;
    reserves?: [bigint, bigint];
    sqrtPriceX96?: bigint;
    activeId?: number;
  } {
    if (pool.dex === "traderjoe_lb") {
      const decoded = lbPairIface.decodeFunctionResult("getActiveId", returnData);
      const activeId = Number(decoded[0]);
      if (!pool.feeTier) {
        throw new Error(`Trader Joe LB pool ${pool.label} missing feeTier (binStep)`);
      }
      let price = this.calculateLBPrice(activeId, pool.feeTier, pool.decimals0, pool.decimals1);
      if (pool.invertPrice) {
        price = price > 0 ? 1 / price : 0;
      }
      return { price, activeId };
    }
    if (pool.dex === "camelot_v3") {
      const decoded = algebraIface.decodeFunctionResult(
        "globalState",
        returnData,
      );
      const sqrtPriceX96 = BigInt(decoded[0]);
      return {
        price: this.calculateV3Price(sqrtPriceX96, pool.decimals0, pool.decimals1),
        sqrtPriceX96,
      };
    }
    if (pool.dex === "uniswap_v3" || pool.dex === "sushiswap_v3" || pool.dex === "ramses_v3") {
      const decoded = v3Iface.decodeFunctionResult("slot0", returnData);
      const sqrtPriceX96 = BigInt(decoded[0]);
      return {
        price: this.calculateV3Price(sqrtPriceX96, pool.decimals0, pool.decimals1),
        sqrtPriceX96,
      };
    }
    const decoded = v2Iface.decodeFunctionResult("getReserves", returnData);
    const reserve0 = BigInt(decoded[0]);
    const reserve1 = BigInt(decoded[1]);
    this.checkV2Liquidity(pool, reserve0, reserve1);
    return {
      price: this.calculateV2Price(reserve0, reserve1, pool.decimals0, pool.decimals1),
      reserves: [reserve0, reserve1],
    };
  }

  /** Check if a pool uses V3-style concentrated liquidity */
  private isV3Pool(pool: PoolConfig): boolean {
    return pool.dex === "uniswap_v3" || pool.dex === "sushiswap_v3" || pool.dex === "camelot_v3" || pool.dex === "ramses_v3";
  }

  /** Fetch the current price from a single pool */
  async fetchPrice(pool: PoolConfig): Promise<PriceSnapshot> {
    const blockNumber = await this.config.provider.getBlockNumber();

    if (pool.dex === "traderjoe_lb") {
      const data = await this.fetchLBPrice(pool);
      return {
        pool, price: data.price, inversePrice: 1 / data.price,
        blockNumber, timestamp: Date.now(),
        activeId: data.activeId,
      };
    }

    if (pool.dex === "camelot_v3") {
      const data = await this.fetchAlgebraPrice(pool);
      return {
        pool, price: data.price, inversePrice: 1 / data.price,
        blockNumber, timestamp: Date.now(),
        sqrtPriceX96: data.sqrtPriceX96, liquidity: data.liquidity,
      };
    }

    if (pool.dex === "uniswap_v3" || pool.dex === "sushiswap_v3" || pool.dex === "ramses_v3") {
      const data = await this.fetchV3Price(pool);
      return {
        pool, price: data.price, inversePrice: 1 / data.price,
        blockNumber, timestamp: Date.now(),
        sqrtPriceX96: data.sqrtPriceX96, liquidity: data.liquidity,
      };
    }

    // uniswap_v2, sushiswap, and camelot_v2 use the same pair interface
    const data = await this.fetchV2Price(pool);
    return {
      pool, price: data.price, inversePrice: 1 / data.price,
      blockNumber, timestamp: Date.now(),
      reserves: data.reserves,
    };
  }

  /** Read reserves from a Uniswap V2-style pair */
  private async fetchV2Price(pool: PoolConfig): Promise<{ price: number; reserves: [bigint, bigint] }> {
    const contract = new Contract(
      pool.poolAddress,
      UNISWAP_V2_PAIR_ABI,
      this.config.provider,
    );
    const [reserve0, reserve1] = await contract.getReserves();
    const r0 = BigInt(reserve0);
    const r1 = BigInt(reserve1);
    this.checkV2Liquidity(pool, r0, r1);
    return {
      price: this.calculateV2Price(r0, r1, pool.decimals0, pool.decimals1),
      reserves: [r0, r1],
    };
  }

  /** Read sqrtPriceX96 from a Uniswap V3-style pool */
  private async fetchV3Price(pool: PoolConfig): Promise<{ price: number; sqrtPriceX96: bigint; liquidity?: bigint }> {
    const contract = new Contract(
      pool.poolAddress,
      UNISWAP_V3_POOL_ABI,
      this.config.provider,
    );
    const [sqrtPriceX96Raw] = await contract.slot0();
    const sqrtPriceX96 = BigInt(sqrtPriceX96Raw);

    const liquidity = await this.fetchLiquidity(pool);

    return {
      price: this.calculateV3Price(sqrtPriceX96, pool.decimals0, pool.decimals1),
      sqrtPriceX96,
      liquidity,
    };
  }

  /** Read sqrtPriceX96 from an Algebra V3-style pool (Camelot V3) */
  private async fetchAlgebraPrice(pool: PoolConfig): Promise<{ price: number; sqrtPriceX96: bigint; liquidity?: bigint }> {
    const contract = new Contract(
      pool.poolAddress,
      ALGEBRA_V3_POOL_ABI,
      this.config.provider,
    );
    const [sqrtPriceX96Raw] = await contract.globalState();
    const sqrtPriceX96 = BigInt(sqrtPriceX96Raw);

    const liquidity = await this.fetchLiquidity(pool);

    return {
      price: this.calculateV3Price(sqrtPriceX96, pool.decimals0, pool.decimals1),
      sqrtPriceX96,
      liquidity,
    };
  }

  /** Read active bin ID from a Trader Joe LB pair */
  private async fetchLBPrice(pool: PoolConfig): Promise<{ price: number; activeId: number }> {
    const contract = new Contract(
      pool.poolAddress,
      TRADER_JOE_LB_PAIR_ABI,
      this.config.provider,
    );
    const activeId = await contract.getActiveId();
    const activeIdNum = Number(activeId);

    if (!pool.feeTier) {
      throw new Error(`Trader Joe LB pool ${pool.label} missing feeTier (binStep)`);
    }

    let price = this.calculateLBPrice(activeIdNum, pool.feeTier, pool.decimals0, pool.decimals1);

    // LB bin price gives tokenY/tokenX. When token0/token1 (hex-sorted) doesn't
    // match the LB pair's tokenX/tokenY ordering, the raw price is inverted
    // relative to our convention (price = token1 per token0).
    if (pool.invertPrice) {
      price = price > 0 ? 1 / price : 0;
    }

    return { price, activeId: activeIdNum };
  }

  /** Fetch in-range liquidity from a V3 pool (non-critical, returns undefined on failure) */
  private async fetchLiquidity(pool: PoolConfig): Promise<bigint | undefined> {
    try {
      const calldata = liquidityIface.encodeFunctionData("liquidity");
      const result = await this.config.provider.call({
        to: pool.poolAddress,
        data: calldata,
      });
      if (result && result !== "0x") {
        const decoded = liquidityIface.decodeFunctionResult("liquidity", result);
        return BigInt(decoded[0]);
      }
    } catch {
      // Non-critical — slippage estimation falls back to static model
    }
    return undefined;
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
   * Calculate price from Trader Joe LB active bin ID.
   *
   * Formula: price = (1 + binStep/10000)^(activeId - 2^23) * 10^(decimals0 - decimals1)
   *
   * Where:
   * - binStep is the fee tier in basis points (e.g., 25 = 0.25%)
   * - activeId is the current active bin (uint24, centered at 2^23 = 8388608)
   * - 2^23 is the price anchor point (activeId 8388608 = price ratio 1:1)
   *
   * Implementation uses logarithms to avoid overflow:
   * price = exp((activeId - 2^23) * ln(1 + binStep/10000)) * 10^(decimals0 - decimals1)
   */
  calculateLBPrice(
    activeId: number,
    binStep: number,
    decimals0: number,
    decimals1: number,
  ): number {
    const PRICE_ANCHOR = 2 ** 23; // 8388608 (center point where price = 1:1)
    const binStepDecimal = binStep / 10_000; // Convert basis points to decimal
    const exponent = activeId - PRICE_ANCHOR;

    // Compute (1 + binStep/10000)^exponent using logarithms
    // price_ratio = exp(exponent * ln(1 + binStepDecimal))
    const priceRatio = Math.exp(exponent * Math.log(1 + binStepDecimal));

    // Adjust for token decimals
    const decimalAdjustment = 10 ** (decimals0 - decimals1);
    return priceRatio * decimalAdjustment;
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
