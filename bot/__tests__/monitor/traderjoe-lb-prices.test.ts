import { describe, it, expect, beforeAll } from "vitest";
import { JsonRpcProvider } from "ethers";
import { PriceMonitor } from "../../src/monitor/PriceMonitor.js";
import type { PoolConfig } from "../../src/monitor/types.js";

describe("PriceMonitor - Trader Joe LB", () => {
  let provider: JsonRpcProvider | undefined;
  let monitor: PriceMonitor;

  // Known Arbitrum LB pool
  // TODO: Discover pool address via:
  // cast call 0x8e42f2F4101563bF679975178e880FD87d3eFd4e \
  //   "getLBPairInformation(address,address,uint256)" \
  //   0x82af49447d8a07e3bd95bd0d56f35241523fbab1 \
  //   0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8 \
  //   25 --rpc-url $ARBITRUM_MAINNET_RPC_URL
  const WETH_USDC_LB_POOL: PoolConfig = {
    label: "WETH/USDC Trader Joe LB (0.25%)",
    dex: "traderjoe_lb",
    poolAddress: "0x0000000000000000000000000000000000000000", // PLACEHOLDER - needs discovery
    token0: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    token1: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", // USDC.e
    decimals0: 18,
    decimals1: 6,
    feeTier: 25, // binStep 25 = 0.25%
  };

  beforeAll(() => {
    const rpcUrl = process.env.ARBITRUM_MAINNET_RPC_URL;
    if (rpcUrl) {
      provider = new JsonRpcProvider(rpcUrl);
      monitor = new PriceMonitor({
        provider,
        pools: [WETH_USDC_LB_POOL],
        deltaThresholdPercent: 0.5,
      });
    }
  });

  it.skip("should read active bin ID from LB pool", async () => {
    // Skip until pool address is discovered
    const snapshot = await monitor.fetchPrice(WETH_USDC_LB_POOL);

    expect(snapshot.activeId).toBeDefined();
    expect(snapshot.activeId).toBeGreaterThan(0);
    expect(snapshot.activeId).toBeLessThan(2 ** 24); // uint24 max
  });

  it.skip("should calculate price from active bin ID", async () => {
    // Skip until pool address is discovered
    const snapshot = await monitor.fetchPrice(WETH_USDC_LB_POOL);

    expect(snapshot.price).toBeGreaterThan(0);
    expect(snapshot.inversePrice).toBeGreaterThan(0);
    expect(snapshot.price).toBeCloseTo(1 / snapshot.inversePrice, 2);

    // WETH/USDC price should be roughly in 1000-4000 range (1 WETH = ~$2000-$4000)
    expect(snapshot.price).toBeGreaterThan(500);
    expect(snapshot.price).toBeLessThan(10_000);
  });

  it("should calculate correct bin-to-price conversion", () => {
    // Test calculateLBPrice directly with known values
    // Create minimal monitor for unit testing (no RPC needed)
    const mockProvider = { getBlockNumber: async () => 1 } as any;
    const testMonitor = new PriceMonitor({ provider: mockProvider, pools: [] });

    const PRICE_ANCHOR = 2 ** 23; // 8388608

    // activeId at anchor (1:1 price ratio before decimal adjustment)
    const priceAt1to1 = testMonitor.calculateLBPrice(PRICE_ANCHOR, 25, 18, 18);
    expect(priceAt1to1).toBeCloseTo(1.0, 4);

    // activeId above anchor (price shifted toward token1)
    const priceAbove = testMonitor.calculateLBPrice(PRICE_ANCHOR + 1000, 25, 18, 18);
    expect(priceAbove).toBeGreaterThan(priceAt1to1);

    // activeId below anchor (price shifted toward token0)
    const priceBelow = testMonitor.calculateLBPrice(PRICE_ANCHOR - 1000, 25, 18, 18);
    expect(priceBelow).toBeLessThan(priceAt1to1);
  });

  it("should apply decimal adjustment correctly", () => {
    const mockProvider = { getBlockNumber: async () => 1 } as any;
    const testMonitor = new PriceMonitor({ provider: mockProvider, pools: [] });

    const PRICE_ANCHOR = 2 ** 23;

    // WETH(18) / USDC(6) at 1:1 bin ratio → price = 10^12 (USDC per WETH in raw units)
    const wethUsdcPrice = testMonitor.calculateLBPrice(PRICE_ANCHOR, 25, 18, 6);
    expect(wethUsdcPrice).toBeCloseTo(10 ** 12, -6);

    // USDC(6) / WETH(18) at 1:1 bin ratio → price = 10^-12
    const usdcWethPrice = testMonitor.calculateLBPrice(PRICE_ANCHOR, 25, 6, 18);
    expect(usdcWethPrice).toBeCloseTo(10 ** -12, 18);
  });

  it("should handle different binSteps correctly", () => {
    const mockProvider = { getBlockNumber: async () => 1 } as any;
    const testMonitor = new PriceMonitor({ provider: mockProvider, pools: [] });

    const PRICE_ANCHOR = 2 ** 23;
    const activeId = PRICE_ANCHOR + 1000;

    // Higher binStep → larger price movement per bin
    const price15 = testMonitor.calculateLBPrice(activeId, 15, 18, 18);
    const price25 = testMonitor.calculateLBPrice(activeId, 25, 18, 18);
    const price100 = testMonitor.calculateLBPrice(activeId, 100, 18, 18);

    expect(price25).toBeGreaterThan(price15);
    expect(price100).toBeGreaterThan(price25);
  });

  it.skip("should emit priceUpdate event with activeId", async () => {
    // Skip until pool address is discovered
    return new Promise<void>((resolve) => {
      monitor.once("priceUpdate", (snapshot) => {
        expect(snapshot.pool.dex).toBe("traderjoe_lb");
        expect(snapshot.activeId).toBeDefined();
        expect(snapshot.price).toBeGreaterThan(0);
        resolve();
      });

      void monitor.poll();
    });
  });

  it("should throw if LB pool missing feeTier", async () => {
    const mockProvider = {
      getBlockNumber: async () => 1,
      call: async () => "0x0000000000000000000000000000000000000000000000000000000000800000", // Mock activeId = 8388608
    } as any;
    const testMonitor = new PriceMonitor({ provider: mockProvider, pools: [] });

    const invalidPool: PoolConfig = {
      ...WETH_USDC_LB_POOL,
      feeTier: undefined, // Missing binStep
    };

    await expect(testMonitor.fetchPrice(invalidPool)).rejects.toThrow(/missing feeTier/);
  });
});
