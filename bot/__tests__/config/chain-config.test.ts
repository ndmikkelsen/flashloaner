import { describe, it, expect } from "vitest";
import { loadChainConfig } from "../../src/config/chains/index.js";
import { ARBITRUM_SEPOLIA_CONFIG } from "../../src/config/chains/arbitrum-sepolia.js";

// ---------------------------------------------------------------------------
// Chain Config System — pure unit tests, no network calls, no mocking needed
// ---------------------------------------------------------------------------

describe("loadChainConfig", () => {
  // ---- Arbitrum Sepolia (421614) ----

  describe("Arbitrum Sepolia (421614)", () => {
    it("should return config with correct chainId", () => {
      const config = loadChainConfig(421614);
      expect(config.chainId).toBe(421614);
    });

    it("should return config with correct chainName", () => {
      const config = loadChainConfig(421614);
      expect(config.chainName).toBe("Arbitrum Sepolia");
    });

    it("should have correct WETH address (not zero address)", () => {
      const config = loadChainConfig(421614);
      expect(config.tokens.WETH).toBe("0x980B62Da83eFf3D4576C647993b0c1D7faf17c73");
      expect(config.tokens.WETH).not.toBe("0x0000000000000000000000000000000000000000");
    });

    it("should have correct Uniswap V3 factory (not Ethereum mainnet address)", () => {
      const config = loadChainConfig(421614);
      // Must be Arbitrum Sepolia testnet-specific factory, NOT mainnet CREATE2 address
      expect(config.dexes.uniswapV3?.factory).toBe("0x248AB79Bbb9bC29bB72f7Cd42F17e054Fc40188e");
      // Should NOT be the Ethereum mainnet factory (confirms the fix was applied)
      expect(config.dexes.uniswapV3?.factory).not.toBe("0x1F98431c8aD98523631AE4a59f267346ea31F984");
    });

    it("should have correct Aave V3 Pool address", () => {
      const config = loadChainConfig(421614);
      expect(config.protocols.aaveV3Pool).toBe("0x794a61358D6845594F94dc1DB02A252b5b4814aD");
    });

    it("should have 1s polling interval (not 12s Ethereum default)", () => {
      const config = loadChainConfig(421614);
      expect(config.monitor.pollIntervalMs).toBe(1000);
      expect(config.monitor.pollIntervalMs).not.toBe(12000);
    });

    it("should have MEV mode of none", () => {
      const config = loadChainConfig(421614);
      expect(config.mev.mode).toBe("none");
    });

    it("should have Balancer Vault at canonical CREATE2 address", () => {
      const config = loadChainConfig(421614);
      expect(config.protocols.balancerVault).toBe("0xBA12222222228d8Ba445958a75a0704d566BF2C8");
    });
  });

  // ---- Arbitrum mainnet (42161) — sanity check ----

  describe("Arbitrum mainnet (42161)", () => {
    it("should return config with chainId 42161", () => {
      const config = loadChainConfig(42161);
      expect(config.chainId).toBe(42161);
    });

    it("should have chainName of Arbitrum One", () => {
      const config = loadChainConfig(42161);
      expect(config.chainName).toBe("Arbitrum One");
    });

    it("should have Aave V3 Pool address (same on all Arbitrum chains)", () => {
      const config = loadChainConfig(42161);
      expect(config.protocols.aaveV3Pool).toBe("0x794a61358D6845594F94dc1DB02A252b5b4814aD");
    });
  });

  // ---- Unsupported chain ----

  describe("unsupported chain", () => {
    it("should throw error for unsupported chain ID", () => {
      expect(() => loadChainConfig(99999)).toThrow();
    });

    it("should include chain ID in error message", () => {
      expect(() => loadChainConfig(99999)).toThrow("99999");
    });
  });
});

// ---------------------------------------------------------------------------
// ARBITRUM_SEPOLIA_CONFIG constant direct inspection
// ---------------------------------------------------------------------------

describe("ARBITRUM_SEPOLIA_CONFIG", () => {
  it("should have pools as an array", () => {
    expect(Array.isArray(ARBITRUM_SEPOLIA_CONFIG.pools)).toBe(true);
  });

  it("should have dexes.uniswapV3 configured", () => {
    expect(ARBITRUM_SEPOLIA_CONFIG.dexes.uniswapV3).toBeDefined();
  });

  it("should have gas config with reasonable maxGasPriceGwei", () => {
    expect(ARBITRUM_SEPOLIA_CONFIG.gas.maxGasPriceGwei).toBe(0.1);
  });

  it("should have detector config with small minProfitThreshold for testnet", () => {
    // Testnet uses much lower threshold than mainnet
    expect(ARBITRUM_SEPOLIA_CONFIG.detector.minProfitThreshold).toBeLessThan(0.01);
    expect(ARBITRUM_SEPOLIA_CONFIG.detector.minProfitThreshold).toBeGreaterThan(0);
  });

  it("should have Camelot DEX configured (Arbitrum-native DEX)", () => {
    expect(ARBITRUM_SEPOLIA_CONFIG.dexes.camelot).toBeDefined();
    expect(ARBITRUM_SEPOLIA_CONFIG.dexes.camelot?.router).toBeTruthy();
    expect(ARBITRUM_SEPOLIA_CONFIG.dexes.camelot?.factory).toBeTruthy();
  });
});
