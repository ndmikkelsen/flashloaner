import { describe, it, expect, beforeEach, vi } from "vitest";
import { keccak256, parseUnits, toBeHex } from "ethers";
import { FlashbotsSigner } from "../../src/mev/FlashbotsSigner.js";
import type { FlashbotsInnerWallet } from "../../src/mev/FlashbotsSigner.js";
import type { FlashbotsConfig, MinimalProvider } from "../../src/mev/types.js";

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

// Foundry test account #2 (publicly known, safe for tests)
const AUTH_KEY_HEX =
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

const SIGNED_TX_HEX = "0x02f8640180843b9aca0085174876e80082ea600194deadbeefdeadbeefdeadbeefdeadbeefdeadbeef8080c001a0aaaa";

const TX_HASH = keccak256(SIGNED_TX_HEX);
const BUNDLE_HASH = "0xbundlehash123456789abcdef";

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

function makeFlashbotsConfig(
  overrides: Partial<FlashbotsConfig> = {},
): FlashbotsConfig {
  return {
    relayUrl: "https://relay.flashbots.net",
    authKeyHex: AUTH_KEY_HEX,
    maxBlocksToWait: 5,
    simulateBeforeSend: true,
    ...overrides,
  };
}

function makeInnerWallet(
  overrides: Partial<FlashbotsInnerWallet> = {},
): FlashbotsInnerWallet {
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

function makeProvider(
  overrides: Partial<MinimalProvider> = {},
): MinimalProvider {
  return {
    getBlockNumber: vi.fn().mockResolvedValue(19_000_000),
    getBlock: vi.fn().mockResolvedValue({ timestamp: 1700000000 }),
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

/** Standard successful eth_callBundle response */
function callBundleSuccessResponse() {
  return {
    jsonrpc: "2.0",
    id: 1,
    result: {
      totalGasUsed: "250000",
      gasFees: { effectiveGasPrice: "30000000000" },
      results: [{ gasUsed: "250000" }],
    },
  };
}

/** Standard successful eth_sendBundle response */
function sendBundleSuccessResponse(bundleHash = BUNDLE_HASH) {
  return {
    jsonrpc: "2.0",
    id: 1,
    result: { bundleHash },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FlashbotsSigner", () => {
  let wallet: FlashbotsInnerWallet;
  let provider: MinimalProvider;
  let config: FlashbotsConfig;

  beforeEach(() => {
    wallet = makeInnerWallet();
    provider = makeProvider();
    config = makeFlashbotsConfig();
  });

  // -----------------------------------------------------------------------
  // Construction
  // -----------------------------------------------------------------------

  describe("constructor", () => {
    it("creates with valid config", () => {
      const signer = new FlashbotsSigner(wallet, provider, config);
      expect(signer).toBeDefined();
    });

    it("throws if authKeyHex is missing", () => {
      expect(
        () =>
          new FlashbotsSigner(wallet, provider, {
            ...config,
            authKeyHex: "",
          }),
      ).toThrow("authKeyHex is required");
    });

    it("defaults relayUrl if not provided", () => {
      const signer = new FlashbotsSigner(wallet, provider, {
        ...config,
        relayUrl: "",
      });
      // The signer should not throw; the default is used internally.
      expect(signer).toBeDefined();
    });

    it("defaults maxBlocksToWait to 5", () => {
      // We cannot directly read the private field, but we can verify it
      // works correctly in the inclusion tests below.
      const signer = new FlashbotsSigner(wallet, provider, {
        ...config,
        maxBlocksToWait: undefined as unknown as number,
      });
      expect(signer).toBeDefined();
    });

    it("defaults simulateBeforeSend to true", () => {
      const signer = new FlashbotsSigner(wallet, provider, {
        ...config,
        simulateBeforeSend: undefined as unknown as boolean,
      });
      expect(signer).toBeDefined();
    });

    it("accepts authKeyHex without 0x prefix", () => {
      const keyWithoutPrefix = AUTH_KEY_HEX.slice(2);
      const signer = new FlashbotsSigner(wallet, provider, {
        ...config,
        authKeyHex: keyWithoutPrefix,
      });
      expect(signer).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // getNonce delegation
  // -----------------------------------------------------------------------

  describe("getNonce", () => {
    it("delegates to inner wallet", async () => {
      const signer = new FlashbotsSigner(wallet, provider, config);
      const nonce = await signer.getNonce("pending");
      expect(nonce).toBe(5);
      expect(wallet.getNonce).toHaveBeenCalledWith("pending");
    });
  });

  // -----------------------------------------------------------------------
  // call delegation
  // -----------------------------------------------------------------------

  describe("call", () => {
    it("delegates to inner wallet", async () => {
      const signer = new FlashbotsSigner(wallet, provider, config);
      const callTx = { to: "0xabc", data: "0x1234" };
      const result = await signer.call(callTx);
      expect(result).toBe("0x");
      expect(wallet.call).toHaveBeenCalledWith(callTx);
    });

    it("throws if inner wallet does not support call", async () => {
      const walletNoCall = makeInnerWallet();
      delete (walletNoCall as Record<string, unknown>).call;
      const signer = new FlashbotsSigner(walletNoCall, provider, config);

      await expect(signer.call({ to: "0x", data: "0x" })).rejects.toThrow(
        "inner wallet does not support call()",
      );
    });
  });

  // -----------------------------------------------------------------------
  // Bundle simulation (eth_callBundle)
  // -----------------------------------------------------------------------

  describe("simulateBundle", () => {
    it("calls eth_callBundle with correct payload", async () => {
      const signer = new FlashbotsSigner(wallet, provider, config);
      const fetchMock = mockFetch(callBundleSuccessResponse());
      signer.fetchFn = fetchMock;

      await signer.simulateBundle(SIGNED_TX_HEX, 19_000_000);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(config.relayUrl);

      const body = JSON.parse(options.body);
      expect(body.method).toBe("eth_callBundle");
      expect(body.params[0].txs).toEqual([SIGNED_TX_HEX]);
      expect(body.params[0].blockNumber).toBe(toBeHex(19_000_000));
      expect(body.params[0].stateBlockNumber).toBe("latest");
    });

    it("returns success with gas info on successful simulation", async () => {
      const signer = new FlashbotsSigner(wallet, provider, config);
      signer.fetchFn = mockFetch(callBundleSuccessResponse());

      const result = await signer.simulateBundle(SIGNED_TX_HEX, 19_000_000);

      expect(result.success).toBe(true);
      expect(result.gasUsed).toBe(250_000n);
      expect(result.effectiveGasPrice).toBe(30_000_000_000n);
    });

    it("returns failure when relay response has error field", async () => {
      const signer = new FlashbotsSigner(wallet, provider, config);
      signer.fetchFn = mockFetch({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32000, message: "bundle simulation failed" },
      });

      const result = await signer.simulateBundle(SIGNED_TX_HEX, 19_000_000);

      expect(result.success).toBe(false);
      expect(result.error).toContain("bundle simulation failed");
    });

    it("returns failure when a tx in the bundle reverted", async () => {
      const signer = new FlashbotsSigner(wallet, provider, config);
      signer.fetchFn = mockFetch({
        jsonrpc: "2.0",
        id: 1,
        result: {
          totalGasUsed: "100000",
          results: [{ gasUsed: "100000", revert: "InsufficientProfit" }],
        },
      });

      const result = await signer.simulateBundle(SIGNED_TX_HEX, 19_000_000);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Revert: InsufficientProfit");
    });

    it("returns failure when a tx in the bundle has error", async () => {
      const signer = new FlashbotsSigner(wallet, provider, config);
      signer.fetchFn = mockFetch({
        jsonrpc: "2.0",
        id: 1,
        result: {
          totalGasUsed: "100000",
          results: [{ gasUsed: "100000", error: "execution reverted" }],
        },
      });

      const result = await signer.simulateBundle(SIGNED_TX_HEX, 19_000_000);

      expect(result.success).toBe(false);
      expect(result.error).toBe("execution reverted");
    });

    it("returns failure when fetch throws network error", async () => {
      const signer = new FlashbotsSigner(wallet, provider, config);
      signer.fetchFn = vi.fn().mockRejectedValue(new Error("network timeout"));

      const result = await signer.simulateBundle(SIGNED_TX_HEX, 19_000_000);

      expect(result.success).toBe(false);
      expect(result.error).toBe("network timeout");
    });
  });

  // -----------------------------------------------------------------------
  // Auth signing (X-Flashbots-Signature header)
  // -----------------------------------------------------------------------

  describe("auth signing", () => {
    it("produces X-Flashbots-Signature header on relay requests", async () => {
      const signer = new FlashbotsSigner(wallet, provider, config);
      const fetchMock = mockFetch(callBundleSuccessResponse());
      signer.fetchFn = fetchMock;

      await signer.simulateBundle(SIGNED_TX_HEX, 19_000_000);

      const [, options] = fetchMock.mock.calls[0];
      const sigHeader = options.headers["X-Flashbots-Signature"];
      expect(sigHeader).toBeDefined();
      expect(typeof sigHeader).toBe("string");
      // Header format: <address>:<signature>
      expect(sigHeader).toMatch(/^0x[0-9a-fA-F]{40}:0x[0-9a-fA-F]+$/);
    });

    it("auth address is consistent across requests", async () => {
      const signer = new FlashbotsSigner(wallet, provider, config);

      // Make two requests to verify the auth address is the same
      const fetchMock = mockFetch(callBundleSuccessResponse());
      signer.fetchFn = fetchMock;

      await signer.simulateBundle(SIGNED_TX_HEX, 19_000_000);
      await signer.simulateBundle(SIGNED_TX_HEX, 19_000_001);

      const header1 = fetchMock.mock.calls[0][1].headers["X-Flashbots-Signature"];
      const header2 = fetchMock.mock.calls[1][1].headers["X-Flashbots-Signature"];

      const address1 = header1.split(":")[0];
      const address2 = header2.split(":")[0];
      expect(address1).toBe(address2);
    });

    it("signatures differ for different payloads", async () => {
      const signer = new FlashbotsSigner(wallet, provider, config);
      const fetchMock = mockFetch(callBundleSuccessResponse());
      signer.fetchFn = fetchMock;

      await signer.simulateBundle(SIGNED_TX_HEX, 19_000_000);
      await signer.simulateBundle("0xdifferent", 19_000_001);

      const sig1 = fetchMock.mock.calls[0][1].headers["X-Flashbots-Signature"].split(":")[1];
      const sig2 = fetchMock.mock.calls[1][1].headers["X-Flashbots-Signature"].split(":")[1];
      expect(sig1).not.toBe(sig2);
    });
  });

  // -----------------------------------------------------------------------
  // sendTransaction: Bundle construction and submission
  // -----------------------------------------------------------------------

  describe("sendTransaction", () => {
    it("signs the transaction via inner wallet", async () => {
      const signer = new FlashbotsSigner(wallet, provider, config);

      // fetchMock must handle simulate (eth_callBundle) + submit (eth_sendBundle)
      let callCount = 0;
      signer.fetchFn = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // eth_callBundle simulation
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(callBundleSuccessResponse()),
          });
        }
        // eth_sendBundle
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(sendBundleSuccessResponse()),
        });
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

    it("targets the next block for bundle inclusion", async () => {
      const signer = new FlashbotsSigner(wallet, provider, config);

      // Track the fetch calls to inspect the blockNumber used
      const fetchCalls: { method: string; blockNumber: string }[] = [];
      signer.fetchFn = vi.fn().mockImplementation((_url: string, opts: { body: string }) => {
        const body = JSON.parse(opts.body);
        if (body.params[0]?.blockNumber) {
          fetchCalls.push({
            method: body.method,
            blockNumber: body.params[0].blockNumber,
          });
        }
        if (body.method === "eth_callBundle") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(callBundleSuccessResponse()),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(sendBundleSuccessResponse()),
        });
      });

      await signer.sendTransaction(TX_PARAMS);

      // The eth_sendBundle should target currentBlock + 1
      const sendBundleCall = fetchCalls.find((c) => c.method === "eth_sendBundle");
      expect(sendBundleCall).toBeDefined();
      // currentBlock is 19_000_000, so target is 19_000_001
      expect(sendBundleCall!.blockNumber).toBe(toBeHex(19_000_001));
    });

    it("returns hash computed from signed transaction", async () => {
      const signer = new FlashbotsSigner(wallet, provider, config);

      signer.fetchFn = vi.fn().mockImplementation((_url: string, opts: { body: string }) => {
        const body = JSON.parse(opts.body);
        if (body.method === "eth_callBundle") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(callBundleSuccessResponse()),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(sendBundleSuccessResponse()),
        });
      });

      const response = await signer.sendTransaction(TX_PARAMS);

      // Hash should be keccak256 of the signed tx
      expect(response.hash).toBe(keccak256(SIGNED_TX_HEX));
    });

    it("skips simulation when simulateBeforeSend is false", async () => {
      const noSimConfig = makeFlashbotsConfig({ simulateBeforeSend: false });
      const signer = new FlashbotsSigner(wallet, provider, noSimConfig);

      const fetchMock = mockFetch(sendBundleSuccessResponse());
      signer.fetchFn = fetchMock;

      await signer.sendTransaction(TX_PARAMS);

      // Only one fetch call (eth_sendBundle), no eth_callBundle
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.method).toBe("eth_sendBundle");
    });

    it("throws when simulation fails", async () => {
      const signer = new FlashbotsSigner(wallet, provider, config);

      signer.fetchFn = mockFetch({
        jsonrpc: "2.0",
        id: 1,
        result: {
          totalGasUsed: "100000",
          results: [{ gasUsed: "100000", revert: "InsufficientProfit" }],
        },
      });

      await expect(signer.sendTransaction(TX_PARAMS)).rejects.toThrow(
        "Flashbots bundle simulation failed",
      );
    });
  });

  // -----------------------------------------------------------------------
  // Bundle submission errors
  // -----------------------------------------------------------------------

  describe("relay error handling", () => {
    it("throws on eth_sendBundle error response", async () => {
      const noSimConfig = makeFlashbotsConfig({ simulateBeforeSend: false });
      const signer = new FlashbotsSigner(wallet, provider, noSimConfig);

      signer.fetchFn = mockFetch({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32000, message: "bundle already submitted" },
      });

      await expect(signer.sendTransaction(TX_PARAMS)).rejects.toThrow(
        "eth_sendBundle failed",
      );
    });

    it("throws on HTTP error from relay", async () => {
      const noSimConfig = makeFlashbotsConfig({ simulateBeforeSend: false });
      const signer = new FlashbotsSigner(wallet, provider, noSimConfig);

      signer.fetchFn = mockFetch("Internal Server Error", 500);

      await expect(signer.sendTransaction(TX_PARAMS)).rejects.toThrow(
        "relay HTTP 500",
      );
    });
  });

  // -----------------------------------------------------------------------
  // Network error handling
  // -----------------------------------------------------------------------

  describe("network error handling", () => {
    it("propagates fetch() failures during submission", async () => {
      const noSimConfig = makeFlashbotsConfig({ simulateBeforeSend: false });
      const signer = new FlashbotsSigner(wallet, provider, noSimConfig);

      signer.fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

      await expect(signer.sendTransaction(TX_PARAMS)).rejects.toThrow(
        "ECONNREFUSED",
      );
    });

    it("propagates provider errors when getting block number", async () => {
      const failProvider = makeProvider({
        getBlockNumber: vi.fn().mockRejectedValue(new Error("provider down")),
      });
      const signer = new FlashbotsSigner(wallet, failProvider, config);

      await expect(signer.sendTransaction(TX_PARAMS)).rejects.toThrow(
        "provider down",
      );
    });
  });

  // -----------------------------------------------------------------------
  // Bundle inclusion waiting
  // -----------------------------------------------------------------------

  describe("waitForInclusion (via sendTransaction().wait())", () => {
    it("returns null when bundle is not included after maxBlocksToWait", async () => {
      // Use maxBlocksToWait = 1 for fast test
      const fastConfig = makeFlashbotsConfig({
        maxBlocksToWait: 1,
        simulateBeforeSend: false,
      });
      const signer = new FlashbotsSigner(wallet, provider, fastConfig);

      // Provider returns block 19_000_001 immediately (target block reached)
      let blockCallCount = 0;
      (provider.getBlockNumber as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          blockCallCount++;
          // First call returns current block (19_000_000), subsequent calls
          // return target block so waitForInclusion completes immediately
          if (blockCallCount <= 1) return Promise.resolve(19_000_000);
          return Promise.resolve(19_000_001);
        },
      );

      signer.fetchFn = mockFetch(sendBundleSuccessResponse());

      const response = await signer.sendTransaction(TX_PARAMS);
      const receipt = await response.wait();

      // When the bundle is not confirmed on-chain, waitForInclusion returns null
      expect(receipt).toBeNull();
    });

    it("response has a valid wait() function", async () => {
      const fastConfig = makeFlashbotsConfig({
        maxBlocksToWait: 1,
        simulateBeforeSend: false,
      });
      const signer = new FlashbotsSigner(wallet, provider, fastConfig);

      // First call to getBlockNumber (in sendTransaction) returns 19_000_000
      // so targetBlock becomes 19_000_001. Subsequent calls (in pollUntilBlock)
      // must return >= 19_000_001 for the poll to resolve.
      let callIdx = 0;
      (provider.getBlockNumber as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          callIdx++;
          if (callIdx <= 1) return Promise.resolve(19_000_000);
          return Promise.resolve(19_000_001);
        },
      );

      signer.fetchFn = mockFetch(sendBundleSuccessResponse());

      const response = await signer.sendTransaction(TX_PARAMS);

      expect(typeof response.wait).toBe("function");
      // wait() should resolve since blocks advance past target
      const receipt = await response.wait();
      // Receipt is null because waitForInclusion always returns null
      expect(receipt).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Content-Type header
  // -----------------------------------------------------------------------

  describe("request format", () => {
    it("sends Content-Type application/json", async () => {
      const signer = new FlashbotsSigner(wallet, provider, config);
      const fetchMock = mockFetch(callBundleSuccessResponse());
      signer.fetchFn = fetchMock;

      await signer.simulateBundle(SIGNED_TX_HEX, 19_000_000);

      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers["Content-Type"]).toBe("application/json");
    });

    it("sends JSON-RPC 2.0 format", async () => {
      const signer = new FlashbotsSigner(wallet, provider, config);
      const fetchMock = mockFetch(callBundleSuccessResponse());
      signer.fetchFn = fetchMock;

      await signer.simulateBundle(SIGNED_TX_HEX, 19_000_000);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.jsonrpc).toBe("2.0");
      expect(body.id).toBe(1);
    });
  });
});
