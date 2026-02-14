import { vi } from "vitest";
import type { PoolConfig, PriceSnapshot, PriceDelta } from "../../../src/monitor/types.js";

/** Well-known test addresses */
export const TEST_TOKENS = {
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
} as const;

export const TEST_POOLS = {
  WETH_USDC_UNIV2: "0x0000000000000000000000000000000000000001",
  WETH_USDC_SUSHI: "0x0000000000000000000000000000000000000002",
  WETH_USDC_UNIV3: "0x0000000000000000000000000000000000000003",
  WETH_USDT_UNIV2: "0x0000000000000000000000000000000000000004",
  WETH_USDT_SUSHI: "0x0000000000000000000000000000000000000005",
} as const;

/** Create a pool config for testing */
export function pool(opts: {
  label?: string;
  dex?: PoolConfig["dex"];
  address?: string;
  token0?: string;
  token1?: string;
  decimals0?: number;
  decimals1?: number;
  feeTier?: number;
}): PoolConfig {
  return {
    label: opts.label ?? "WETH/USDC",
    dex: opts.dex ?? "uniswap_v2",
    poolAddress: opts.address ?? TEST_POOLS.WETH_USDC_UNIV2,
    token0: opts.token0 ?? TEST_TOKENS.WETH,
    token1: opts.token1 ?? TEST_TOKENS.USDC,
    decimals0: opts.decimals0 ?? 18,
    decimals1: opts.decimals1 ?? 6,
    feeTier: opts.feeTier,
  };
}

/** Create a price snapshot */
export function snapshot(
  poolConfig: PoolConfig,
  price: number,
  blockNumber = 19_000_000,
): PriceSnapshot {
  return {
    pool: poolConfig,
    price,
    inversePrice: 1 / price,
    blockNumber,
    timestamp: Date.now(),
  };
}

/** Create a price delta between two pools */
export function delta(opts: {
  buyPool: PoolConfig;
  sellPool: PoolConfig;
  buyPrice: number;
  sellPrice: number;
  blockNumber?: number;
}): PriceDelta {
  const block = opts.blockNumber ?? 19_000_000;
  return {
    pair: `${opts.buyPool.token0.toLowerCase()}/${opts.buyPool.token1.toLowerCase()}`,
    buyPool: snapshot(opts.buyPool, opts.buyPrice, block),
    sellPool: snapshot(opts.sellPool, opts.sellPrice, block),
    deltaPercent:
      ((opts.sellPrice - opts.buyPrice) / opts.buyPrice) * 100,
    timestamp: Date.now(),
  };
}

/** ABI-encode getReserves return value */
export function encodeGetReserves(
  reserve0: bigint,
  reserve1: bigint,
  timestamp = 0,
): string {
  const pad = (v: bigint | number) =>
    BigInt(v).toString(16).padStart(64, "0");
  return "0x" + pad(reserve0) + pad(reserve1) + pad(timestamp);
}

/** ABI-encode slot0 return value */
export function encodeSlot0(sqrtPriceX96: bigint): string {
  const pad = (v: bigint | number) =>
    BigInt(v).toString(16).padStart(64, "0");
  return (
    "0x" +
    pad(sqrtPriceX96) +
    pad(0n) + // tick
    pad(0n) + // observationIndex
    pad(0n) + // observationCardinality
    pad(0n) + // observationCardinalityNext
    pad(0n) + // feeProtocol
    pad(1n)   // unlocked
  );
}

/**
 * Build a mock provider with configurable per-pool reserves.
 * Keys are pool addresses (lowercase), values are [reserve0, reserve1].
 */
export function mockProvider(
  poolReserves: Record<string, [bigint, bigint]>,
  blockNumber = 19_000_000,
) {
  return {
    getBlockNumber: vi.fn().mockResolvedValue(blockNumber),
    call: vi.fn().mockImplementation(async (tx: { to: string; data: string }) => {
      const to = tx.to.toLowerCase();
      const selector = tx.data.slice(0, 10);

      const reserves = poolReserves[to];
      if (!reserves) {
        throw new Error(`No mock reserves for pool ${to}`);
      }

      // getReserves() = 0x0902f1ac
      if (selector === "0x0902f1ac") {
        return encodeGetReserves(reserves[0], reserves[1]);
      }

      // slot0() = 0x3850c7bd
      if (selector === "0x3850c7bd") {
        throw new Error("Use encodeSlot0 for V3 pools");
      }

      throw new Error(`Unknown selector: ${selector}`);
    }),
  } as any;
}

/**
 * Predefined scenarios for integration testing.
 */
export const SCENARIOS = {
  /** 1% profitable spread between UniV2 and SushiSwap */
  profitable_1pct() {
    const buyPool = pool({
      label: "WETH/USDC UniV2",
      dex: "uniswap_v2",
      address: TEST_POOLS.WETH_USDC_UNIV2,
    });
    const sellPool = pool({
      label: "WETH/USDC Sushi",
      dex: "sushiswap",
      address: TEST_POOLS.WETH_USDC_SUSHI,
    });
    return {
      pools: [buyPool, sellPool],
      provider: mockProvider({
        [TEST_POOLS.WETH_USDC_UNIV2.toLowerCase()]: [
          BigInt("1000000000000000000000"), // 1000 WETH
          BigInt("2000000000000"),           // 2,000,000 USDC → price = 2000
        ],
        [TEST_POOLS.WETH_USDC_SUSHI.toLowerCase()]: [
          BigInt("1000000000000000000000"), // 1000 WETH
          BigInt("2020000000000"),           // 2,020,000 USDC → price = 2020
        ],
      }),
      expectedDeltaPercent: 1.0,
    };
  },

  /** 5% profitable spread — large opportunity */
  profitable_5pct() {
    const buyPool = pool({
      label: "WETH/USDC UniV2",
      address: TEST_POOLS.WETH_USDC_UNIV2,
    });
    const sellPool = pool({
      label: "WETH/USDC Sushi",
      dex: "sushiswap",
      address: TEST_POOLS.WETH_USDC_SUSHI,
    });
    return {
      pools: [buyPool, sellPool],
      provider: mockProvider({
        [TEST_POOLS.WETH_USDC_UNIV2.toLowerCase()]: [
          BigInt("1000000000000000000000"),
          BigInt("2000000000000"),  // price = 2000
        ],
        [TEST_POOLS.WETH_USDC_SUSHI.toLowerCase()]: [
          BigInt("1000000000000000000000"),
          BigInt("2100000000000"),  // price = 2100
        ],
      }),
      expectedDeltaPercent: 5.0,
    };
  },

  /** 0.1% spread — too small to be profitable */
  unprofitable_tiny_spread() {
    const buyPool = pool({
      label: "WETH/USDC UniV2",
      address: TEST_POOLS.WETH_USDC_UNIV2,
    });
    const sellPool = pool({
      label: "WETH/USDC Sushi",
      dex: "sushiswap",
      address: TEST_POOLS.WETH_USDC_SUSHI,
    });
    return {
      pools: [buyPool, sellPool],
      provider: mockProvider({
        [TEST_POOLS.WETH_USDC_UNIV2.toLowerCase()]: [
          BigInt("1000000000000000000000"),
          BigInt("2000000000000"),  // price = 2000
        ],
        [TEST_POOLS.WETH_USDC_SUSHI.toLowerCase()]: [
          BigInt("1000000000000000000000"),
          BigInt("2002000000000"),  // price = 2002 → 0.1%
        ],
      }),
      expectedDeltaPercent: 0.1,
    };
  },

  /** Multiple token pairs with opportunities */
  multi_pair() {
    const pools = [
      pool({
        label: "WETH/USDC UniV2",
        address: TEST_POOLS.WETH_USDC_UNIV2,
        token0: TEST_TOKENS.WETH,
        token1: TEST_TOKENS.USDC,
      }),
      pool({
        label: "WETH/USDC Sushi",
        dex: "sushiswap",
        address: TEST_POOLS.WETH_USDC_SUSHI,
        token0: TEST_TOKENS.WETH,
        token1: TEST_TOKENS.USDC,
      }),
      pool({
        label: "WETH/USDT UniV2",
        address: TEST_POOLS.WETH_USDT_UNIV2,
        token0: TEST_TOKENS.WETH,
        token1: TEST_TOKENS.USDT,
      }),
      pool({
        label: "WETH/USDT Sushi",
        dex: "sushiswap",
        address: TEST_POOLS.WETH_USDT_SUSHI,
        token0: TEST_TOKENS.WETH,
        token1: TEST_TOKENS.USDT,
      }),
    ];
    return {
      pools,
      provider: mockProvider({
        [TEST_POOLS.WETH_USDC_UNIV2.toLowerCase()]: [
          BigInt("1000000000000000000000"),
          BigInt("2000000000000"),
        ],
        [TEST_POOLS.WETH_USDC_SUSHI.toLowerCase()]: [
          BigInt("1000000000000000000000"),
          BigInt("2040000000000"), // 2% delta
        ],
        [TEST_POOLS.WETH_USDT_UNIV2.toLowerCase()]: [
          BigInt("1000000000000000000000"),
          BigInt("2000000000000"),
        ],
        [TEST_POOLS.WETH_USDT_SUSHI.toLowerCase()]: [
          BigInt("1000000000000000000000"),
          BigInt("2060000000000"), // 3% delta
        ],
      }),
    };
  },
} as const;
