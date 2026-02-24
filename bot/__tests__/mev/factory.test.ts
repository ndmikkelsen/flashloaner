import { describe, it, expect, vi } from "vitest";
import { createMEVProtectedSigner } from "../../src/mev/index.js";
import { FlashbotsSigner } from "../../src/mev/FlashbotsSigner.js";
import { MEVBlockerSigner } from "../../src/mev/MEVBlockerSigner.js";
import type { ExecutionSigner } from "../../src/engine/ExecutionEngine.js";
import type { MEVProtectionConfig, MinimalProvider } from "../../src/mev/types.js";

// ---------------------------------------------------------------------------
// Foundry test account #2 (publicly known, safe for tests)
// ---------------------------------------------------------------------------
const AUTH_KEY_HEX =
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeBaseSigner(): ExecutionSigner & {
  signTransaction(tx: Record<string, unknown>): Promise<string>;
} {
  return {
    sendTransaction: vi.fn().mockResolvedValue({
      hash: "0x" + "ab".repeat(32),
      wait: vi.fn().mockResolvedValue(null),
    }),
    getNonce: vi.fn().mockResolvedValue(0),
    call: vi.fn().mockResolvedValue("0x"),
    signTransaction: vi.fn().mockResolvedValue("0xsigned"),
  };
}

function makeProvider(): MinimalProvider {
  return {
    getBlockNumber: vi.fn().mockResolvedValue(19_000_000),
    getBlock: vi.fn().mockResolvedValue({ timestamp: 1700000000 }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createMEVProtectedSigner (factory)", () => {
  // -----------------------------------------------------------------------
  // mode: "none"
  // -----------------------------------------------------------------------

  describe('mode "none"', () => {
    it("returns the base signer unchanged", () => {
      const baseSigner = makeBaseSigner();
      const provider = makeProvider();
      const config: MEVProtectionConfig = { mode: "none" };

      const result = createMEVProtectedSigner(baseSigner, provider, config);

      // Should be the exact same object reference
      expect(result).toBe(baseSigner);
    });

    it("returned signer is not a FlashbotsSigner", () => {
      const baseSigner = makeBaseSigner();
      const provider = makeProvider();
      const config: MEVProtectionConfig = { mode: "none" };

      const result = createMEVProtectedSigner(baseSigner, provider, config);

      expect(result).not.toBeInstanceOf(FlashbotsSigner);
      expect(result).not.toBeInstanceOf(MEVBlockerSigner);
    });
  });

  // -----------------------------------------------------------------------
  // mode: "flashbots"
  // -----------------------------------------------------------------------

  describe('mode "flashbots"', () => {
    it("returns a FlashbotsSigner", () => {
      const baseSigner = makeBaseSigner();
      const provider = makeProvider();
      const config: MEVProtectionConfig = {
        mode: "flashbots",
        flashbots: {
          relayUrl: "https://relay.flashbots.net",
          authKeyHex: AUTH_KEY_HEX,
          maxBlocksToWait: 5,
          simulateBeforeSend: true,
        },
      };

      const result = createMEVProtectedSigner(baseSigner, provider, config);

      expect(result).toBeInstanceOf(FlashbotsSigner);
    });

    it("throws when flashbots config is missing", () => {
      const baseSigner = makeBaseSigner();
      const provider = makeProvider();
      const config: MEVProtectionConfig = {
        mode: "flashbots",
        // flashbots config deliberately omitted
      };

      expect(() =>
        createMEVProtectedSigner(baseSigner, provider, config),
      ).toThrow("no flashbots config provided");
    });

    it("delegates getNonce through to base signer", async () => {
      const baseSigner = makeBaseSigner();
      const provider = makeProvider();
      const config: MEVProtectionConfig = {
        mode: "flashbots",
        flashbots: {
          relayUrl: "https://relay.flashbots.net",
          authKeyHex: AUTH_KEY_HEX,
          maxBlocksToWait: 5,
          simulateBeforeSend: true,
        },
      };

      const result = createMEVProtectedSigner(baseSigner, provider, config);
      const nonce = await result.getNonce("pending");

      expect(nonce).toBe(0);
      expect(baseSigner.getNonce).toHaveBeenCalledWith("pending");
    });
  });

  // -----------------------------------------------------------------------
  // mode: "mev_blocker"
  // -----------------------------------------------------------------------

  describe('mode "mev_blocker"', () => {
    it("returns a MEVBlockerSigner", () => {
      const baseSigner = makeBaseSigner();
      const provider = makeProvider();
      const config: MEVProtectionConfig = {
        mode: "mev_blocker",
        mevBlocker: {
          rpcUrl: "https://rpc.mevblocker.io",
        },
      };

      const result = createMEVProtectedSigner(baseSigner, provider, config);

      expect(result).toBeInstanceOf(MEVBlockerSigner);
    });

    it("works without mevBlocker config (uses defaults)", () => {
      const baseSigner = makeBaseSigner();
      const provider = makeProvider();
      const config: MEVProtectionConfig = {
        mode: "mev_blocker",
        // No mevBlocker config -- should use default RPC URL
      };

      const result = createMEVProtectedSigner(baseSigner, provider, config);

      expect(result).toBeInstanceOf(MEVBlockerSigner);
    });

    it("delegates getNonce through to base signer", async () => {
      const baseSigner = makeBaseSigner();
      const provider = makeProvider();
      const config: MEVProtectionConfig = {
        mode: "mev_blocker",
        mevBlocker: { rpcUrl: "https://rpc.mevblocker.io" },
      };

      const result = createMEVProtectedSigner(baseSigner, provider, config);
      const nonce = await result.getNonce();

      expect(nonce).toBe(0);
      expect(baseSigner.getNonce).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Invalid mode
  // -----------------------------------------------------------------------

  describe("invalid mode", () => {
    it("throws for unknown mode", () => {
      const baseSigner = makeBaseSigner();
      const provider = makeProvider();
      const config = { mode: "unknown_mode" } as unknown as MEVProtectionConfig;

      expect(() =>
        createMEVProtectedSigner(baseSigner, provider, config),
      ).toThrow("Unknown MEV protection mode");
    });
  });
});
