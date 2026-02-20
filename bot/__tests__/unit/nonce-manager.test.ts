import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, readFileSync, unlinkSync, mkdirSync } from "node:fs";
import { NonceManager } from "../../src/nonce/NonceManager.js";
import type { NonceManagerConfig } from "../../src/nonce/types.js";

const TEST_STATE_PATH = ".data/test-nonce.json";
const TEST_ADDRESS = "0x1234567890123456789012345678901234567890";

describe("NonceManager", () => {
  let mockProvider: NonceManagerConfig["provider"];
  let onChainNonce = 0;

  beforeEach(() => {
    // Reset on-chain nonce
    onChainNonce = 0;

    // Mock provider
    mockProvider = {
      getTransactionCount: vi.fn(async () => onChainNonce),
    };

    // Clean up test state file
    if (existsSync(TEST_STATE_PATH)) {
      unlinkSync(TEST_STATE_PATH);
    }

    // Ensure .data directory exists
    if (!existsSync(".data")) {
      mkdirSync(".data", { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test state file
    if (existsSync(TEST_STATE_PATH)) {
      unlinkSync(TEST_STATE_PATH);
    }
  });

  describe("Initialization", () => {
    it("should initialize fresh state when no state file exists", async () => {
      const manager = new NonceManager({
        provider: mockProvider,
        address: TEST_ADDRESS,
        statePath: TEST_STATE_PATH,
      });

      await manager.syncWithOnChain();

      const state = manager.getState();
      expect(state.nonce).toBe(0);
      expect(state.address).toBe(TEST_ADDRESS.toLowerCase());
      expect(state.txHash).toBeUndefined();
      expect(state.submittedAt).toBeUndefined();
    });

    it("should load existing state from disk", async () => {
      // Create a state file manually
      const initialState = {
        nonce: 5,
        address: TEST_ADDRESS.toLowerCase(),
        txHash: "0xabc",
        submittedAt: Date.now(),
      };

      const fs = await import("node:fs");
      fs.writeFileSync(TEST_STATE_PATH, JSON.stringify(initialState, null, 2), "utf-8");

      const manager = new NonceManager({
        provider: mockProvider,
        address: TEST_ADDRESS,
        statePath: TEST_STATE_PATH,
      });

      const state = manager.getState();
      expect(state.nonce).toBe(5);
      expect(state.txHash).toBe("0xabc");
      expect(state.submittedAt).toBe(initialState.submittedAt);
    });

    it("should sync with on-chain nonce when on-chain is higher", async () => {
      onChainNonce = 10;

      const manager = new NonceManager({
        provider: mockProvider,
        address: TEST_ADDRESS,
        statePath: TEST_STATE_PATH,
      });

      await manager.syncWithOnChain();

      const state = manager.getState();
      expect(state.nonce).toBe(10);
    });
  });

  describe("Transaction Submission", () => {
    it("should return current nonce when no pending transaction exists", async () => {
      const manager = new NonceManager({
        provider: mockProvider,
        address: TEST_ADDRESS,
        statePath: TEST_STATE_PATH,
      });

      await manager.syncWithOnChain();

      const result = await manager.getNextNonce();
      expect(result.nonce).toBe(0);
      expect(result.hadPending).toBe(false);
    });

    it("should persist state after marking a transaction as submitted", async () => {
      const manager = new NonceManager({
        provider: mockProvider,
        address: TEST_ADDRESS,
        statePath: TEST_STATE_PATH,
      });

      await manager.syncWithOnChain();

      manager.markSubmitted("0x123abc");

      const state = manager.getState();
      expect(state.txHash).toBe("0x123abc");
      expect(state.submittedAt).toBeGreaterThan(0);

      // Verify disk persistence
      const diskState = JSON.parse(readFileSync(TEST_STATE_PATH, "utf-8"));
      expect(diskState.txHash).toBe("0x123abc");
    });

    it("should increment nonce after marking a transaction as confirmed", async () => {
      const manager = new NonceManager({
        provider: mockProvider,
        address: TEST_ADDRESS,
        statePath: TEST_STATE_PATH,
      });

      await manager.syncWithOnChain();
      manager.markSubmitted("0x123abc");

      const stateBefore = manager.getState();
      expect(stateBefore.nonce).toBe(0);

      manager.markConfirmed("0x123abc");

      const stateAfter = manager.getState();
      expect(stateAfter.nonce).toBe(1);
      expect(stateAfter.txHash).toBeUndefined();
      expect(stateAfter.submittedAt).toBeUndefined();
    });
  });

  describe("Crash Recovery", () => {
    it("should detect a confirmed pending transaction after restart", async () => {
      // Simulate: bot submits tx with nonce 0, then crashes
      const manager1 = new NonceManager({
        provider: mockProvider,
        address: TEST_ADDRESS,
        statePath: TEST_STATE_PATH,
      });

      await manager1.syncWithOnChain();
      manager1.markSubmitted("0x123abc");

      // Simulate: transaction gets mined (on-chain nonce advances)
      onChainNonce = 1;

      // Restart: new manager instance loads persisted state
      const manager2 = new NonceManager({
        provider: mockProvider,
        address: TEST_ADDRESS,
        statePath: TEST_STATE_PATH,
      });

      const result = await manager2.getNextNonce();
      expect(result.hadPending).toBe(true);
      expect(result.pendingStatus).toBe("confirmed");
      expect(result.nonce).toBe(1); // Nonce incremented after confirming pending tx
    });

    it("should detect a dropped pending transaction after timeout", async () => {
      // Simulate: bot submits tx with nonce 0, then crashes
      const manager1 = new NonceManager({
        provider: mockProvider,
        address: TEST_ADDRESS,
        statePath: TEST_STATE_PATH,
        pendingTimeoutMs: 100, // 100ms timeout for test speed
      });

      await manager1.syncWithOnChain();
      manager1.markSubmitted("0x123abc");

      // Simulate: transaction never gets mined (on-chain nonce stays at 0)
      onChainNonce = 0;

      // Wait for timeout to exceed
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Restart: new manager instance loads persisted state
      const manager2 = new NonceManager({
        provider: mockProvider,
        address: TEST_ADDRESS,
        statePath: TEST_STATE_PATH,
        pendingTimeoutMs: 100,
      });

      const result = await manager2.getNextNonce();
      expect(result.hadPending).toBe(true);
      expect(result.pendingStatus).toBe("dropped");
      expect(result.nonce).toBe(0); // Nonce reused (not incremented)
    });
  });

  describe("State Persistence", () => {
    it("should create .data directory if it doesn't exist", async () => {
      // Remove .data directory
      const fs = await import("node:fs");
      if (existsSync(".data")) {
        fs.rmSync(".data", { recursive: true });
      }

      const manager = new NonceManager({
        provider: mockProvider,
        address: TEST_ADDRESS,
        statePath: TEST_STATE_PATH,
      });

      await manager.syncWithOnChain();
      manager.markSubmitted("0x123abc");

      // Verify directory was created
      expect(existsSync(".data")).toBe(true);
      expect(existsSync(TEST_STATE_PATH)).toBe(true);
    });

    it("should survive multiple submit-confirm cycles", async () => {
      const manager = new NonceManager({
        provider: mockProvider,
        address: TEST_ADDRESS,
        statePath: TEST_STATE_PATH,
      });

      await manager.syncWithOnChain();

      // Submit tx 1
      manager.markSubmitted("0x111");
      expect(manager.getState().nonce).toBe(0);

      // Confirm tx 1
      manager.markConfirmed("0x111");
      expect(manager.getState().nonce).toBe(1);

      // Submit tx 2
      manager.markSubmitted("0x222");
      expect(manager.getState().nonce).toBe(1);

      // Confirm tx 2
      manager.markConfirmed("0x222");
      expect(manager.getState().nonce).toBe(2);

      // Verify disk state matches
      const diskState = JSON.parse(readFileSync(TEST_STATE_PATH, "utf-8"));
      expect(diskState.nonce).toBe(2);
      expect(diskState.txHash).toBeUndefined();
    });
  });
});
