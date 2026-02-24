import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseUnits } from "ethers";
import { MEVBlockerSigner } from "../../src/mev/MEVBlockerSigner.js";
import type { MEVBlockerInnerWallet } from "../../src/mev/MEVBlockerSigner.js";
import type { MEVBlockerConfig } from "../../src/mev/types.js";

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const SIGNED_TX_HEX = "0x02f8640180843b9aca0085174876e80082ea600194deadbeefdeadbeefdeadbeefdeadbeefdeadbeef8080c001a0bbbb";
const TX_HASH = "0xaaaa1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab";

const TX_PARAMS = {
  to: "0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF",
  data: "0x12345678",
  value: 0n,
  maxFeePerGas: parseUnits("62", "gwei"),
  maxPriorityFeePerGas: parseUnits("2", "gwei"),
  gasLimit: 400_000n,
  nonce: 5,
  chainId: 1,
};

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeInnerWallet(
  overrides: Partial<MEVBlockerInnerWallet> = {},
): MEVBlockerInnerWallet {
  return {
    sendTransaction: vi.fn().mockResolvedValue({
      hash: TX_HASH,
      wait: vi.fn().mockResolvedValue(null),
    }),
    getNonce: vi.fn().mockResolvedValue(5),
    call: vi.fn().mockResolvedValue("0x"),
    signTransaction: vi.fn().mockResolvedValue(SIGNED_TX_HEX),
    ...overrides,
  };
}

/** Create a mock fetch that returns a successful JSON-RPC response */
function mockFetch(responseBody: unknown, statusCode = 200) {
  return vi.fn().mockResolvedValue({
    ok: statusCode >= 200 && statusCode < 300,
    status: statusCode,
    text: vi.fn().mockResolvedValue(JSON.stringify(responseBody)),
    json: vi.fn().mockResolvedValue(responseBody),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MEVBlockerSigner", () => {
  let wallet: MEVBlockerInnerWallet;
  let config: MEVBlockerConfig;

  beforeEach(() => {
    wallet = makeInnerWallet();
    config = { rpcUrl: "https://rpc.mevblocker.io" };
  });

  // -----------------------------------------------------------------------
  // Construction
  // -----------------------------------------------------------------------

  describe("constructor", () => {
    it("creates with valid config", () => {
      const signer = new MEVBlockerSigner(wallet, config);
      expect(signer).toBeDefined();
    });

    it("creates with no config (uses default RPC URL)", () => {
      const signer = new MEVBlockerSigner(wallet);
      expect(signer).toBeDefined();
    });

    it("creates with custom RPC URL", () => {
      const signer = new MEVBlockerSigner(wallet, {
        rpcUrl: "https://custom.rpc.io",
      });
      expect(signer).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // getNonce delegation
  // -----------------------------------------------------------------------

  describe("getNonce", () => {
    it("delegates to inner wallet", async () => {
      const signer = new MEVBlockerSigner(wallet, config);
      const nonce = await signer.getNonce("pending");
      expect(nonce).toBe(5);
      expect(wallet.getNonce).toHaveBeenCalledWith("pending");
    });

    it("delegates without blockTag", async () => {
      const signer = new MEVBlockerSigner(wallet, config);
      const nonce = await signer.getNonce();
      expect(nonce).toBe(5);
      expect(wallet.getNonce).toHaveBeenCalledWith(undefined);
    });
  });

  // -----------------------------------------------------------------------
  // call delegation
  // -----------------------------------------------------------------------

  describe("call", () => {
    it("delegates to inner wallet", async () => {
      const signer = new MEVBlockerSigner(wallet, config);
      const callTx = { to: "0xabc", data: "0x1234" };
      const result = await signer.call(callTx);
      expect(result).toBe("0x");
      expect(wallet.call).toHaveBeenCalledWith(callTx);
    });

    it("throws if inner wallet does not support call", async () => {
      const walletNoCall = makeInnerWallet();
      delete (walletNoCall as Record<string, unknown>).call;
      const signer = new MEVBlockerSigner(walletNoCall, config);

      await expect(signer.call({ to: "0x", data: "0x" })).rejects.toThrow(
        "inner wallet does not support call()",
      );
    });
  });

  // -----------------------------------------------------------------------
  // Transaction routing via MEV Blocker RPC
  // -----------------------------------------------------------------------

  describe("sendTransaction", () => {
    it("signs the transaction with inner wallet", async () => {
      const signer = new MEVBlockerSigner(wallet, config);

      signer.fetchFn = mockFetch({
        jsonrpc: "2.0",
        id: 1,
        result: TX_HASH,
      });

      await signer.sendTransaction(TX_PARAMS);

      expect(wallet.signTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          to: TX_PARAMS.to,
          data: TX_PARAMS.data,
          value: TX_PARAMS.value,
          maxFeePerGas: TX_PARAMS.maxFeePerGas,
          maxPriorityFeePerGas: TX_PARAMS.maxPriorityFeePerGas,
          gasLimit: TX_PARAMS.gasLimit,
          nonce: TX_PARAMS.nonce,
          chainId: TX_PARAMS.chainId,
          type: 2,
        }),
      );
    });

    it("sends eth_sendRawTransaction to MEV Blocker RPC", async () => {
      const signer = new MEVBlockerSigner(wallet, config);
      const fetchMock = mockFetch({
        jsonrpc: "2.0",
        id: 1,
        result: TX_HASH,
      });
      signer.fetchFn = fetchMock;

      await signer.sendTransaction(TX_PARAMS);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(config.rpcUrl);

      const body = JSON.parse(options.body);
      expect(body.method).toBe("eth_sendRawTransaction");
      expect(body.params).toEqual([SIGNED_TX_HEX]);
      expect(body.jsonrpc).toBe("2.0");
    });

    it("uses custom RPC URL", async () => {
      const customConfig = { rpcUrl: "https://custom.mev.io" };
      const signer = new MEVBlockerSigner(wallet, customConfig);
      const fetchMock = mockFetch({
        jsonrpc: "2.0",
        id: 1,
        result: TX_HASH,
      });
      signer.fetchFn = fetchMock;

      await signer.sendTransaction(TX_PARAMS);

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe("https://custom.mev.io");
    });

    it("returns the transaction hash from the RPC response", async () => {
      const signer = new MEVBlockerSigner(wallet, config);
      signer.fetchFn = mockFetch({
        jsonrpc: "2.0",
        id: 1,
        result: TX_HASH,
      });

      const response = await signer.sendTransaction(TX_PARAMS);
      expect(response.hash).toBe(TX_HASH);
    });

    it("returns a wait() function for receipt polling", async () => {
      const signer = new MEVBlockerSigner(wallet, config);
      signer.fetchFn = mockFetch({
        jsonrpc: "2.0",
        id: 1,
        result: TX_HASH,
      });

      const response = await signer.sendTransaction(TX_PARAMS);
      expect(typeof response.wait).toBe("function");
    });
  });

  // -----------------------------------------------------------------------
  // Receipt waiting
  // -----------------------------------------------------------------------

  describe("receipt waiting", () => {
    it("polls and returns receipt when transaction is confirmed", async () => {
      const signer = new MEVBlockerSigner(wallet, config);

      // First call: eth_sendRawTransaction, subsequent: eth_getTransactionReceipt
      let callCount = 0;
      signer.fetchFn = vi.fn().mockImplementation(
        (_url: string, opts: { body: string }) => {
          callCount++;
          const body = JSON.parse(opts.body);

          if (body.method === "eth_sendRawTransaction") {
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({ jsonrpc: "2.0", id: 1, result: TX_HASH }),
            });
          }

          // eth_getTransactionReceipt: return null first, then receipt
          if (callCount <= 2) {
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({ jsonrpc: "2.0", id: 1, result: null }),
            });
          }

          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                jsonrpc: "2.0",
                id: 1,
                result: {
                  status: "0x1",
                  blockNumber: "0x121eac1",
                  gasUsed: "0x3d090",
                  effectiveGasPrice: "0x6fc23ac00",
                  logs: [],
                },
              }),
          });
        },
      );

      const response = await signer.sendTransaction(TX_PARAMS);
      const receipt = await response.wait();

      expect(receipt).not.toBeNull();
      expect(receipt!.status).toBe(1);
      expect(receipt!.blockNumber).toBe(0x121eac1);
      expect(receipt!.gasUsed).toBe(BigInt("0x3d090"));
      expect(receipt!.effectiveGasPrice).toBe(BigInt("0x6fc23ac00"));
      expect(receipt!.logs).toEqual([]);
    });

    it("parses logs from receipt correctly", async () => {
      const signer = new MEVBlockerSigner(wallet, config);

      signer.fetchFn = vi.fn().mockImplementation(
        (_url: string, opts: { body: string }) => {
          const body = JSON.parse(opts.body);
          if (body.method === "eth_sendRawTransaction") {
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({ jsonrpc: "2.0", id: 1, result: TX_HASH }),
            });
          }
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                jsonrpc: "2.0",
                id: 1,
                result: {
                  status: "0x1",
                  blockNumber: "0x100",
                  gasUsed: "0x100",
                  effectiveGasPrice: "0x100",
                  logs: [
                    {
                      topics: ["0xtopic1", "0xtopic2"],
                      data: "0xlogdata",
                      address: "0xlogaddress",
                    },
                  ],
                },
              }),
          });
        },
      );

      const response = await signer.sendTransaction(TX_PARAMS);
      const receipt = await response.wait();

      expect(receipt).not.toBeNull();
      expect(receipt!.logs).toHaveLength(1);
      expect(receipt!.logs[0]).toEqual({
        topics: ["0xtopic1", "0xtopic2"],
        data: "0xlogdata",
        address: "0xlogaddress",
      });
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe("error handling", () => {
    it("throws on RPC error response", async () => {
      const signer = new MEVBlockerSigner(wallet, config);
      signer.fetchFn = mockFetch({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32000, message: "nonce too low" },
      });

      await expect(signer.sendTransaction(TX_PARAMS)).rejects.toThrow(
        "eth_sendRawTransaction failed",
      );
    });

    it("throws on HTTP error", async () => {
      const signer = new MEVBlockerSigner(wallet, config);
      signer.fetchFn = mockFetch("Bad Gateway", 502);

      await expect(signer.sendTransaction(TX_PARAMS)).rejects.toThrow(
        "RPC HTTP 502",
      );
    });

    it("propagates fetch() network errors", async () => {
      const signer = new MEVBlockerSigner(wallet, config);
      signer.fetchFn = vi
        .fn()
        .mockRejectedValue(new Error("ECONNREFUSED"));

      await expect(signer.sendTransaction(TX_PARAMS)).rejects.toThrow(
        "ECONNREFUSED",
      );
    });

    it("propagates inner wallet signTransaction errors", async () => {
      const failWallet = makeInnerWallet({
        signTransaction: vi
          .fn()
          .mockRejectedValue(new Error("signing failed")),
      });
      const signer = new MEVBlockerSigner(failWallet, config);

      await expect(signer.sendTransaction(TX_PARAMS)).rejects.toThrow(
        "signing failed",
      );
    });

    it("throws on RPC error as string", async () => {
      const signer = new MEVBlockerSigner(wallet, config);
      signer.fetchFn = mockFetch({
        jsonrpc: "2.0",
        id: 1,
        error: "some string error",
      });

      await expect(signer.sendTransaction(TX_PARAMS)).rejects.toThrow(
        "eth_sendRawTransaction failed",
      );
    });
  });

  // -----------------------------------------------------------------------
  // Content-Type and request format
  // -----------------------------------------------------------------------

  describe("request format", () => {
    it("sends Content-Type application/json", async () => {
      const signer = new MEVBlockerSigner(wallet, config);
      const fetchMock = mockFetch({
        jsonrpc: "2.0",
        id: 1,
        result: TX_HASH,
      });
      signer.fetchFn = fetchMock;

      await signer.sendTransaction(TX_PARAMS);

      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers["Content-Type"]).toBe("application/json");
    });

    it("sends POST method", async () => {
      const signer = new MEVBlockerSigner(wallet, config);
      const fetchMock = mockFetch({
        jsonrpc: "2.0",
        id: 1,
        result: TX_HASH,
      });
      signer.fetchFn = fetchMock;

      await signer.sendTransaction(TX_PARAMS);

      const [, options] = fetchMock.mock.calls[0];
      expect(options.method).toBe("POST");
    });
  });
});
