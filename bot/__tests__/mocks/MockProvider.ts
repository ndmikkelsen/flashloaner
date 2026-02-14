/**
 * Mock ethers.js v6 Provider for testing.
 *
 * Intercepts at the `call` level and returns ABI-encoded responses,
 * avoiding the need for real RPC connections in tests.
 */

import { vi } from "vitest";
import {
  encodeGetReserves,
  encodeSlot0,
  RESERVES_2000,
  SQRT_PRICE_2000,
} from "../helpers/FixtureFactory.js";

export interface MockProviderOptions {
  /** Block number to return from getBlockNumber(). Default: 19_000_000 */
  blockNumber?: number;
  /** V2 getReserves return values [reserve0, reserve1, timestamp] */
  getReservesReturn?: [bigint, bigint, number];
  /** V3 slot0 return values */
  slot0Return?: [bigint, number, number, number, number, number, boolean];
  /** Chain ID to return. Default: 1 */
  chainId?: number;
  /** Gas price in wei. Default: 30 gwei */
  gasPrice?: bigint;
}

/**
 * Build a mock ethers v6 Provider that responds to common contract calls.
 *
 * Supports:
 * - `getBlockNumber()` — returns configured block number
 * - `call()` — dispatches by function selector:
 *   - `0x0902f1ac` → getReserves() (Uniswap V2/Sushi)
 *   - `0x3850c7bd` → slot0() (Uniswap V3)
 * - `getNetwork()` — returns configured chain ID
 * - `getFeeData()` — returns configured gas price
 */
export function createMockProvider(opts: MockProviderOptions = {}) {
  const blockNum = opts.blockNumber ?? 19_000_000;
  const chainId = opts.chainId ?? 1;
  const gasPrice = opts.gasPrice ?? 30_000_000_000n; // 30 gwei

  return {
    getBlockNumber: vi.fn().mockResolvedValue(blockNum),

    call: vi.fn().mockImplementation(async (tx: { data: string; to?: string }) => {
      const selector = tx.data.slice(0, 10);

      // getReserves() → 0x0902f1ac
      if (selector === "0x0902f1ac") {
        const [r0, r1, ts] = opts.getReservesReturn ?? [
          RESERVES_2000.reserve0,
          RESERVES_2000.reserve1,
          0,
        ];
        return encodeGetReserves(r0, r1, ts);
      }

      // slot0() → 0x3850c7bd
      if (selector === "0x3850c7bd") {
        const [sqrtPrice, tick, obsIdx, obsCar, obsCarNext, feeProt, unlocked] =
          opts.slot0Return ?? [SQRT_PRICE_2000, 0, 0, 0, 0, 0, true];
        return encodeSlot0(sqrtPrice, tick, obsIdx, obsCar, obsCarNext, feeProt, unlocked);
      }

      throw new Error(`MockProvider: unknown selector ${selector}`);
    }),

    getNetwork: vi.fn().mockResolvedValue({ chainId: BigInt(chainId), name: "mainnet" }),

    getFeeData: vi.fn().mockResolvedValue({
      gasPrice,
      maxFeePerGas: gasPrice,
      maxPriorityFeePerGas: 1_000_000_000n, // 1 gwei
    }),

    estimateGas: vi.fn().mockResolvedValue(300_000n),

    getTransactionReceipt: vi.fn().mockResolvedValue(null),

    waitForTransaction: vi.fn().mockResolvedValue({
      status: 1,
      blockNumber: blockNum + 1,
      gasUsed: 250_000n,
    }),
  } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * Build a mock provider that routes calls by contract address.
 * Useful for tests with multiple pools at different prices.
 */
export function createRoutingProvider(
  routes: Record<string, { reserves?: [bigint, bigint, number]; slot0?: Parameters<typeof encodeSlot0> }>,
  blockNumber = 19_000_000,
) {
  return {
    getBlockNumber: vi.fn().mockResolvedValue(blockNumber),
    call: vi.fn().mockImplementation(async (tx: { to: string; data: string }) => {
      const to = tx.to.toLowerCase();
      const selector = tx.data.slice(0, 10);

      for (const [addr, config] of Object.entries(routes)) {
        if (to === addr.toLowerCase()) {
          if (selector === "0x0902f1ac" && config.reserves) {
            return encodeGetReserves(...config.reserves);
          }
          if (selector === "0x3850c7bd" && config.slot0) {
            return encodeSlot0(...config.slot0);
          }
        }
      }

      throw new Error(`MockProvider: no route for ${tx.to} selector ${selector}`);
    }),
    getNetwork: vi.fn().mockResolvedValue({ chainId: 1n, name: "mainnet" }),
    getFeeData: vi.fn().mockResolvedValue({
      gasPrice: 30_000_000_000n,
      maxFeePerGas: 30_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
    }),
  } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * Build a mock provider that always rejects.
 * Useful for testing error handling and retry logic.
 */
export function createFailingProvider(errorMsg = "RPC call failed") {
  return {
    getBlockNumber: vi.fn().mockRejectedValue(new Error(errorMsg)),
    call: vi.fn().mockRejectedValue(new Error(errorMsg)),
    getNetwork: vi.fn().mockRejectedValue(new Error(errorMsg)),
    getFeeData: vi.fn().mockRejectedValue(new Error(errorMsg)),
    estimateGas: vi.fn().mockRejectedValue(new Error(errorMsg)),
  } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}
