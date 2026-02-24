import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock ethers.js Contract so tests don't need a real Arbitrum node.
// vi.mock is hoisted — declare shared state in module scope so the factory
// can close over it without TDZ issues.
// ---------------------------------------------------------------------------

const mockState = {
  gasEstimateComponents: vi.fn(),
  lastConstructedAddress: "" as string,
};

vi.mock("ethers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ethers")>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function MockContract(address: string, _abi: any[], _provider: unknown) {
    mockState.lastConstructedAddress = address;
    return {
      gasEstimateComponents: mockState.gasEstimateComponents,
    };
  }

  return {
    ...actual,
    Contract: MockContract,
  };
});

// Import AFTER mock is set up (vi.mock hoisting ensures this is fine)
import { estimateArbitrumGas, gasComponentsToEth } from "../../src/gas/ArbitrumGasEstimator.js";
import type { ArbitrumGasComponents } from "../../src/gas/ArbitrumGasEstimator.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DUMMY_TO = "0x794a61358D6845594F94dc1DB02A252b5b4814aD";
const DUMMY_DATA = "0x12345678";

// ---------------------------------------------------------------------------
// gasComponentsToEth — pure function, no mocking needed
// ---------------------------------------------------------------------------

describe("gasComponentsToEth", () => {
  it("should convert bigint gas components to floating-point ETH values", () => {
    const components: ArbitrumGasComponents = {
      totalGas: 500_000n,
      l1Gas: 475_000n,
      l2Gas: 25_000n,
      baseFee: 100_000_000n,             // 0.1 gwei
      l1BaseFeeEstimate: 10_000_000_000n, // 10 gwei
      totalCostWei: 50_000_000_000_000n,
    };

    const result = gasComponentsToEth(components);

    // totalCostEth = 5e13 / 1e18 = 0.00005
    expect(result.totalCostEth).toBeCloseTo(0.00005, 8);

    // l1CostEth = 475000 * 1e8 / 1e18 = 4.75e13 / 1e18 = 0.0000475
    expect(result.l1CostEth).toBeCloseTo(0.0000475, 8);

    // l2CostEth = 25000 * 1e8 / 1e18 = 2.5e12 / 1e18 = 0.0000025
    expect(result.l2CostEth).toBeCloseTo(0.0000025, 8);

    // L1 cost should be much larger than L2 cost (Arbitrum L1 data fee ~95% of total)
    expect(result.l1CostEth).toBeGreaterThan(result.l2CostEth);
  });

  it("should return zero costs when all values are zero", () => {
    const components: ArbitrumGasComponents = {
      totalGas: 0n,
      l1Gas: 0n,
      l2Gas: 0n,
      baseFee: 0n,
      l1BaseFeeEstimate: 0n,
      totalCostWei: 0n,
    };

    const result = gasComponentsToEth(components);

    expect(result.totalCostEth).toBe(0);
    expect(result.l1CostEth).toBe(0);
    expect(result.l2CostEth).toBe(0);
  });

  it("should handle zero L1 gas (testnet scenario)", () => {
    // On some testnets, l1Gas may be 0
    const components: ArbitrumGasComponents = {
      totalGas: 100_000n,
      l1Gas: 0n,
      l2Gas: 100_000n,
      baseFee: 100_000_000n,
      l1BaseFeeEstimate: 0n,
      totalCostWei: 10_000_000_000_000n,
    };

    const result = gasComponentsToEth(components);

    expect(result.l1CostEth).toBe(0);
    expect(result.l2CostEth).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// estimateArbitrumGas — calls mocked Contract
// ---------------------------------------------------------------------------

describe("estimateArbitrumGas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.lastConstructedAddress = "";
  });

  it("should call gasEstimateComponents on the NodeInterface contract", async () => {
    mockState.gasEstimateComponents.mockResolvedValue({
      gasEstimate: 500_000n,
      gasEstimateForL1: 475_000n,
      baseFee: 100_000_000n,
      l1BaseFeeEstimate: 10_000_000_000n,
    });

    const mockProvider = {} as Parameters<typeof estimateArbitrumGas>[0];
    await estimateArbitrumGas(mockProvider, DUMMY_TO, DUMMY_DATA);

    // gasEstimateComponents should be called with correct args (to, false, data)
    expect(mockState.gasEstimateComponents).toHaveBeenCalledWith(DUMMY_TO, false, DUMMY_DATA);
  });

  it("should return ArbitrumGasComponents with correct structure", async () => {
    mockState.gasEstimateComponents.mockResolvedValue({
      gasEstimate: 500_000n,
      gasEstimateForL1: 475_000n,
      baseFee: 100_000_000n,
      l1BaseFeeEstimate: 10_000_000_000n,
    });

    const mockProvider = {} as Parameters<typeof estimateArbitrumGas>[0];
    const result = await estimateArbitrumGas(mockProvider, DUMMY_TO, DUMMY_DATA);

    expect(result.totalGas).toBe(500_000n);
    expect(result.l1Gas).toBe(475_000n);
    expect(result.l2Gas).toBe(25_000n); // totalGas - l1Gas
    expect(result.baseFee).toBe(100_000_000n);
    expect(result.l1BaseFeeEstimate).toBe(10_000_000_000n);
    expect(result.totalCostWei).toBe(500_000n * 100_000_000n);
  });

  it("should compute l2Gas as totalGas minus l1Gas", async () => {
    const totalGas = 800_000n;
    const l1Gas = 760_000n;

    mockState.gasEstimateComponents.mockResolvedValue({
      gasEstimate: totalGas,
      gasEstimateForL1: l1Gas,
      baseFee: 50_000_000n,
      l1BaseFeeEstimate: 5_000_000_000n,
    });

    const mockProvider = {} as Parameters<typeof estimateArbitrumGas>[0];
    const result = await estimateArbitrumGas(mockProvider, DUMMY_TO, DUMMY_DATA);

    expect(result.l2Gas).toBe(totalGas - l1Gas);
    expect(result.l2Gas).toBe(40_000n);
  });

  it("should handle zero L1 gas (testnet scenario where l1Gas=0)", async () => {
    mockState.gasEstimateComponents.mockResolvedValue({
      gasEstimate: 200_000n,
      gasEstimateForL1: 0n,
      baseFee: 100_000_000n,
      l1BaseFeeEstimate: 0n,
    });

    const mockProvider = {} as Parameters<typeof estimateArbitrumGas>[0];
    const result = await estimateArbitrumGas(mockProvider, DUMMY_TO, DUMMY_DATA);

    // l2Gas should equal totalGas when l1Gas is 0
    expect(result.l1Gas).toBe(0n);
    expect(result.l2Gas).toBe(result.totalGas);
  });

  it("should compute totalCostWei as totalGas * baseFee", async () => {
    const gasEstimate = 500_000n;
    const baseFee = 100_000_000n;

    mockState.gasEstimateComponents.mockResolvedValue({
      gasEstimate,
      gasEstimateForL1: 475_000n,
      baseFee,
      l1BaseFeeEstimate: 10_000_000_000n,
    });

    const mockProvider = {} as Parameters<typeof estimateArbitrumGas>[0];
    const result = await estimateArbitrumGas(mockProvider, DUMMY_TO, DUMMY_DATA);

    expect(result.totalCostWei).toBe(gasEstimate * baseFee);
  });
});

// ---------------------------------------------------------------------------
// NODE_INTERFACE_ADDRESS constant verification
// ---------------------------------------------------------------------------

describe("NODE_INTERFACE_ADDRESS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.lastConstructedAddress = "";
  });

  it("should use the correct Arbitrum NodeInterface precompile address 0xC8", async () => {
    mockState.gasEstimateComponents.mockResolvedValue({
      gasEstimate: 100n,
      gasEstimateForL1: 90n,
      baseFee: 1n,
      l1BaseFeeEstimate: 1n,
    });

    const mockProvider = {} as Parameters<typeof estimateArbitrumGas>[0];
    await estimateArbitrumGas(mockProvider, DUMMY_TO, DUMMY_DATA);

    // The NodeInterface precompile must be at 0xC8
    expect(mockState.lastConstructedAddress).toBe(
      "0x00000000000000000000000000000000000000C8",
    );
  });
});
