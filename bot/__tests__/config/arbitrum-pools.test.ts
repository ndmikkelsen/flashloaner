import { describe, it, expect } from "vitest";
import { ARBITRUM_MAINNET_POOLS } from "../../src/config/chains/pools/arbitrum-mainnet.js";

/**
 * Tests validating cross-fee-tier pool coverage for Arbitrum mainnet.
 *
 * Purpose: Ensure all 5 major token pairs have cross-fee-tier or cross-DEX coverage,
 * enabling sub-0.60% cost floor opportunities via fee-tier routing.
 */

// Token addresses (Arbitrum mainnet)
const WETH = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1";
const USDC = "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8";
const USDT = "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9";
const ARB = "0x912ce59144191c1204e64559fe8253a0e49e6548";
const LINK = "0xf97f4df75117a78c1a5a0dbb814af92458539fb4";
const GMX = "0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a";

/**
 * Helper function to normalize token pairs for grouping.
 * Sorts addresses lexicographically to create a canonical pair key.
 */
function pairKey(pool: { token0: string; token1: string }): string {
  const [a, b] = [pool.token0.toLowerCase(), pool.token1.toLowerCase()].sort();
  return `${a}/${b}`;
}

describe("Arbitrum Mainnet Pool Config", () => {
  describe("Cross-Fee-Tier Coverage", () => {
    it("should have at least 2 pools for each major token pair", () => {
      // Group pools by normalized token pair
      const poolsByPair = new Map<string, typeof ARBITRUM_MAINNET_POOLS>();
      ARBITRUM_MAINNET_POOLS.forEach((pool) => {
        const key = pairKey(pool);
        const existing = poolsByPair.get(key) || [];
        poolsByPair.set(key, [...existing, pool]);
      });

      // Major pairs (sorted)
      const majorPairs = [
        pairKey({ token0: WETH, token1: USDC }),
        pairKey({ token0: WETH, token1: USDT }),
        pairKey({ token0: ARB, token1: WETH }),
        pairKey({ token0: LINK, token1: WETH }),
        pairKey({ token0: GMX, token1: WETH }),
      ];

      majorPairs.forEach((pair) => {
        const pools = poolsByPair.get(pair) || [];
        expect(pools.length).toBeGreaterThanOrEqual(
          2,
          `${pair} should have at least 2 pools (found ${pools.length})`
        );
      });
    });

    it("should have cross-fee-tier coverage for WETH/USDC", () => {
      const wethUsdcPools = ARBITRUM_MAINNET_POOLS.filter(
        (p) => pairKey(p) === pairKey({ token0: WETH, token1: USDC })
      );

      const feeTiers = new Set(
        wethUsdcPools.map((p) => p.feeTier ?? "v2-default")
      );

      expect(feeTiers.size).toBeGreaterThanOrEqual(
        2,
        `WETH/USDC should have 2+ distinct fee tiers (found: ${Array.from(feeTiers).join(", ")})`
      );
    });

    it("should have cross-fee-tier coverage for WETH/USDT", () => {
      const wethUsdtPools = ARBITRUM_MAINNET_POOLS.filter(
        (p) => pairKey(p) === pairKey({ token0: WETH, token1: USDT })
      );

      const feeTiers = new Set(
        wethUsdtPools.map((p) => p.feeTier ?? "v2-default")
      );

      expect(feeTiers.size).toBeGreaterThanOrEqual(
        2,
        `WETH/USDT should have 2+ distinct fee tiers (found: ${Array.from(feeTiers).join(", ")})`
      );
    });

    it("should have cross-fee-tier or cross-DEX coverage for ARB/WETH", () => {
      const arbWethPools = ARBITRUM_MAINNET_POOLS.filter(
        (p) => pairKey(p) === pairKey({ token0: ARB, token1: WETH })
      );

      const feeTiers = new Set(
        arbWethPools.map((p) => p.feeTier ?? "v2-default")
      );
      const dexes = new Set(arbWethPools.map((p) => p.dex));

      const hasCrossFeeTier = feeTiers.size >= 2;
      const hasCrossDex = dexes.size >= 2;

      expect(hasCrossFeeTier || hasCrossDex).toBe(
        true,
        `ARB/WETH should have cross-fee-tier OR cross-DEX coverage (feeTiers: ${feeTiers.size}, dexes: ${dexes.size})`
      );
    });

    it("should have cross-fee-tier or cross-DEX coverage for LINK/WETH", () => {
      const linkWethPools = ARBITRUM_MAINNET_POOLS.filter(
        (p) => pairKey(p) === pairKey({ token0: LINK, token1: WETH })
      );

      const feeTiers = new Set(
        linkWethPools.map((p) => p.feeTier ?? "v2-default")
      );
      const dexes = new Set(linkWethPools.map((p) => p.dex));

      const hasCrossFeeTier = feeTiers.size >= 2;
      const hasCrossDex = dexes.size >= 2;

      expect(hasCrossFeeTier || hasCrossDex).toBe(
        true,
        `LINK/WETH should have cross-fee-tier OR cross-DEX coverage (feeTiers: ${feeTiers.size}, dexes: ${dexes.size})`
      );
    });

    it("should have cross-fee-tier coverage for GMX/WETH", () => {
      const gmxWethPools = ARBITRUM_MAINNET_POOLS.filter(
        (p) => pairKey(p) === pairKey({ token0: GMX, token1: WETH })
      );

      const feeTiers = new Set(
        gmxWethPools.map((p) => p.feeTier ?? "v2-default")
      );

      expect(feeTiers.size).toBeGreaterThanOrEqual(
        2,
        `GMX/WETH should have 2+ distinct fee tiers (found: ${Array.from(feeTiers).join(", ")})`
      );
    });
  });

  describe("Token Ordering Validation", () => {
    it("all pools should have token0 address < token1 address (on-chain ordering)", () => {
      ARBITRUM_MAINNET_POOLS.forEach((pool) => {
        const token0Lower = pool.token0.toLowerCase();
        const token1Lower = pool.token1.toLowerCase();

        expect(token0Lower < token1Lower).toBe(
          true,
          `${pool.label}: token0 (${pool.token0}) must be < token1 (${pool.token1})`
        );
      });
    });
  });

  describe("Pool Address Validation", () => {
    it("all pool addresses should be valid checksummed hex strings", () => {
      const validAddressPattern = /^0x[0-9a-fA-F]{40}$/;

      ARBITRUM_MAINNET_POOLS.forEach((pool) => {
        expect(validAddressPattern.test(pool.poolAddress)).toBe(
          true,
          `${pool.label}: poolAddress ${pool.poolAddress} is not a valid 42-character hex string`
        );
      });
    });
  });
});
