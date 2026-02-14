/**
 * Test data fixtures for flashloan bot tests.
 *
 * Provides factory functions that produce realistic test data for
 * pools, price snapshots, price deltas, arbitrage opportunities,
 * and cost estimates. All factories accept partial overrides.
 */

import type {
  DEXProtocol,
  PoolConfig,
  PriceDelta,
  PriceSnapshot,
} from "../../src/monitor/types.js";
import type {
  ArbitrageOpportunity,
  CostEstimate,
  SwapPath,
  SwapStep,
} from "../../src/detector/types.js";

// ---------------------------------------------------------------------------
// Well-known addresses (checksummed fakes for testing)
// ---------------------------------------------------------------------------

export const ADDRESSES = {
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
  POOL_UNI_V2: "0x0000000000000000000000000000000000000001",
  POOL_UNI_V3: "0x0000000000000000000000000000000000000002",
  POOL_SUSHI: "0x0000000000000000000000000000000000000003",
  POOL_CURVE: "0x0000000000000000000000000000000000000004",
  EXECUTOR: "0x0000000000000000000000000000000000000010",
  BOT_WALLET: "0x0000000000000000000000000000000000000020",
  AAVE_POOL: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
} as const;

// ---------------------------------------------------------------------------
// Pool Fixtures
// ---------------------------------------------------------------------------

export function makePool(overrides: Partial<PoolConfig> = {}): PoolConfig {
  return {
    label: "WETH/USDC UniV2",
    dex: "uniswap_v2",
    poolAddress: ADDRESSES.POOL_UNI_V2,
    token0: ADDRESSES.WETH,
    token1: ADDRESSES.USDC,
    decimals0: 18,
    decimals1: 6,
    ...overrides,
  };
}

export function makeV3Pool(overrides: Partial<PoolConfig> = {}): PoolConfig {
  return makePool({
    label: "WETH/USDC UniV3",
    dex: "uniswap_v3",
    poolAddress: ADDRESSES.POOL_UNI_V3,
    feeTier: 3000,
    ...overrides,
  });
}

export function makeSushiPool(overrides: Partial<PoolConfig> = {}): PoolConfig {
  return makePool({
    label: "WETH/USDC Sushi",
    dex: "sushiswap",
    poolAddress: ADDRESSES.POOL_SUSHI,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Price Snapshot Fixtures
// ---------------------------------------------------------------------------

export function makeSnapshot(
  overrides: Partial<PriceSnapshot> & { pool?: Partial<PoolConfig> } = {},
): PriceSnapshot {
  const pool = makePool(overrides.pool);
  const price = overrides.price ?? 2000;
  return {
    pool,
    price,
    inversePrice: overrides.inversePrice ?? 1 / price,
    blockNumber: overrides.blockNumber ?? 19_000_000,
    timestamp: overrides.timestamp ?? Date.now(),
  };
}

export function makeSnapshotPair(opts: {
  buyPrice?: number;
  sellPrice?: number;
  buyDex?: DEXProtocol;
  sellDex?: DEXProtocol;
} = {}): { buy: PriceSnapshot; sell: PriceSnapshot } {
  const buyPrice = opts.buyPrice ?? 2000;
  const sellPrice = opts.sellPrice ?? 2020;

  return {
    buy: makeSnapshot({
      price: buyPrice,
      pool: {
        label: `WETH/USDC ${opts.buyDex ?? "uniswap_v2"}`,
        dex: opts.buyDex ?? "uniswap_v2",
        poolAddress: ADDRESSES.POOL_UNI_V2,
      },
    }),
    sell: makeSnapshot({
      price: sellPrice,
      pool: {
        label: `WETH/USDC ${opts.sellDex ?? "sushiswap"}`,
        dex: opts.sellDex ?? "sushiswap",
        poolAddress: ADDRESSES.POOL_SUSHI,
      },
    }),
  };
}

// ---------------------------------------------------------------------------
// Price Delta Fixtures
// ---------------------------------------------------------------------------

export function makeDelta(overrides: Partial<PriceDelta> = {}): PriceDelta {
  const pair = makeSnapshotPair();
  const buyPrice = pair.buy.price;
  const sellPrice = pair.sell.price;

  return {
    pair: `${ADDRESSES.USDC}/${ADDRESSES.WETH}`,
    buyPool: pair.buy,
    sellPool: pair.sell,
    deltaPercent: ((sellPrice - buyPrice) / buyPrice) * 100,
    timestamp: Date.now(),
    ...overrides,
  };
}

/** Create a delta that should be profitable after costs */
export function makeProfitableDelta(profitBps = 100): PriceDelta {
  const buyPrice = 2000;
  const sellPrice = buyPrice * (1 + profitBps / 10_000);
  const pair = makeSnapshotPair({ buyPrice, sellPrice });

  return {
    pair: `${ADDRESSES.USDC}/${ADDRESSES.WETH}`,
    buyPool: pair.buy,
    sellPool: pair.sell,
    deltaPercent: ((sellPrice - buyPrice) / buyPrice) * 100,
    timestamp: Date.now(),
  };
}

/** Create a delta that should NOT be profitable after costs */
export function makeUnprofitableDelta(): PriceDelta {
  return makeDelta({
    buyPool: makeSnapshot({ price: 2000 }),
    sellPool: makeSnapshot({
      price: 2001,
      pool: { dex: "sushiswap", poolAddress: ADDRESSES.POOL_SUSHI },
    }),
    deltaPercent: 0.05,
  });
}

// ---------------------------------------------------------------------------
// Swap Step / Path Fixtures
// ---------------------------------------------------------------------------

export function makeSwapStep(overrides: Partial<SwapStep> = {}): SwapStep {
  return {
    dex: "uniswap_v2",
    poolAddress: ADDRESSES.POOL_UNI_V2,
    tokenIn: ADDRESSES.USDC,
    tokenOut: ADDRESSES.WETH,
    decimalsIn: 6,
    decimalsOut: 18,
    expectedPrice: 0.0005, // 1 USDC = 0.0005 WETH
    ...overrides,
  };
}

export function makeSwapPath(overrides: Partial<SwapPath> = {}): SwapPath {
  return {
    steps: overrides.steps ?? [
      makeSwapStep({
        dex: "uniswap_v2",
        tokenIn: ADDRESSES.USDC,
        tokenOut: ADDRESSES.WETH,
        expectedPrice: 0.0005,
      }),
      makeSwapStep({
        dex: "sushiswap",
        poolAddress: ADDRESSES.POOL_SUSHI,
        tokenIn: ADDRESSES.WETH,
        tokenOut: ADDRESSES.USDC,
        decimalsIn: 18,
        decimalsOut: 6,
        expectedPrice: 2020,
      }),
    ],
    baseToken: ADDRESSES.USDC,
    label: "WETH/USDC UniV2 → WETH/USDC Sushi",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Cost / Opportunity Fixtures
// ---------------------------------------------------------------------------

export function makeCostEstimate(
  overrides: Partial<CostEstimate> = {},
): CostEstimate {
  const flashLoanFee = overrides.flashLoanFee ?? 0.005; // 0.05% of 10 ETH
  const gasCost = overrides.gasCost ?? 0.01;
  const slippageCost = overrides.slippageCost ?? 0.05;
  const totalCost =
    overrides.totalCost ?? flashLoanFee + gasCost + slippageCost;

  return { flashLoanFee, gasCost, slippageCost, totalCost };
}

export function makeOpportunity(
  overrides: Partial<ArbitrageOpportunity> = {},
): ArbitrageOpportunity {
  const costs = makeCostEstimate(overrides.costs);
  const grossProfit = overrides.grossProfit ?? 0.1;
  const netProfit = overrides.netProfit ?? grossProfit - costs.totalCost;
  const inputAmount = overrides.inputAmount ?? 10;

  return {
    id: overrides.id ?? "test-opportunity-1",
    path: overrides.path ?? makeSwapPath(),
    inputAmount,
    grossProfit,
    costs,
    netProfit,
    netProfitPercent: overrides.netProfitPercent ?? (netProfit / inputAmount) * 100,
    priceDelta: overrides.priceDelta ?? makeDelta(),
    blockNumber: overrides.blockNumber ?? 19_000_000,
    timestamp: overrides.timestamp ?? Date.now(),
  };
}

// ---------------------------------------------------------------------------
// ABI Encoding Helpers (for mock provider responses)
// ---------------------------------------------------------------------------

/** ABI-encode getReserves() return value */
export function encodeGetReserves(
  r0: bigint,
  r1: bigint,
  ts: number = 0,
): string {
  const pad = (v: bigint | number) =>
    BigInt(v).toString(16).padStart(64, "0");
  return "0x" + pad(r0) + pad(r1) + pad(ts);
}

/** ABI-encode slot0() return value */
export function encodeSlot0(
  sqrtPriceX96: bigint,
  tick: number = 0,
  obsIdx: number = 0,
  obsCar: number = 0,
  obsCarNext: number = 0,
  feeProt: number = 0,
  unlocked: boolean = true,
): string {
  const pad = (v: bigint | number) =>
    BigInt(v).toString(16).padStart(64, "0");
  const tickBig = tick >= 0 ? BigInt(tick) : (1n << 256n) + BigInt(tick);
  return (
    "0x" +
    pad(sqrtPriceX96) +
    tickBig.toString(16).padStart(64, "0") +
    pad(obsIdx) +
    pad(obsCar) +
    pad(obsCarNext) +
    pad(feeProt) +
    pad(unlocked ? 1 : 0)
  );
}

// ---------------------------------------------------------------------------
// Reserve Presets (common pool states)
// ---------------------------------------------------------------------------

/** 1000 WETH + 2,000,000 USDC → price ~2000 */
export const RESERVES_2000 = {
  reserve0: BigInt("1000000000000000000000"),
  reserve1: BigInt("2000000000000"),
} as const;

/** 500 WETH + 1,000,000 USDC → price ~2000 */
export const RESERVES_2000_SMALL = {
  reserve0: BigInt("500000000000000000000"),
  reserve1: BigInt("1000000000000"),
} as const;

/** 1000 WETH + 2,020,000 USDC → price ~2020 */
export const RESERVES_2020 = {
  reserve0: BigInt("1000000000000000000000"),
  reserve1: BigInt("2020000000000"),
} as const;

/** sqrtPriceX96 for ~2000 USDC/WETH */
export const SQRT_PRICE_2000 = BigInt("3543191142285914000000000");
