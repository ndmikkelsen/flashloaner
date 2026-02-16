import { describe, it, expect } from "vitest";
import {
  formatOpportunityReport,
  formatRejectionReport,
  formatScanHeader,
  formatScanSummary,
  type ScanStats,
} from "../src/reporting.js";
import type { ArbitrageOpportunity } from "../src/detector/types.js";
import type { PriceDelta } from "../src/monitor/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTestOpportunity(
  overrides: Partial<ArbitrageOpportunity> = {},
): ArbitrageOpportunity {
  return {
    id: "test-opp-1",
    path: {
      steps: [
        {
          dex: "uniswap_v2",
          poolAddress: "0x0000000000000000000000000000000000000001",
          tokenIn: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          tokenOut: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
          decimalsIn: 6,
          decimalsOut: 18,
          expectedPrice: 0.0005,
        },
        {
          dex: "sushiswap",
          poolAddress: "0x0000000000000000000000000000000000000003",
          tokenIn: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
          tokenOut: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          decimalsIn: 18,
          decimalsOut: 6,
          expectedPrice: 2020,
        },
      ],
      baseToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      label: "WETH/USDC UniV2 → WETH/USDC Sushi",
    },
    inputAmount: 10,
    grossProfit: 0.1,
    costs: {
      flashLoanFee: 0,
      gasCost: 0.0096,
      slippageCost: 0.0997,
      totalCost: 0.1093,
    },
    netProfit: -0.0093,
    netProfitPercent: -0.093,
    priceDelta: {
      pair: "weth/usdc",
      buyPool: {
        pool: {
          label: "WETH/USDC UniV2",
          dex: "uniswap_v2",
          poolAddress: "0x0000000000000000000000000000000000000001",
          token0: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
          token1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          decimals0: 18,
          decimals1: 6,
        },
        price: 2000,
        inversePrice: 0.0005,
        blockNumber: 19000000,
        timestamp: Date.now(),
      },
      sellPool: {
        pool: {
          label: "WETH/USDC Sushi",
          dex: "sushiswap",
          poolAddress: "0x0000000000000000000000000000000000000003",
          token0: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
          token1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          decimals0: 18,
          decimals1: 6,
        },
        price: 2020,
        inversePrice: 1 / 2020,
        blockNumber: 19000000,
        timestamp: Date.now(),
      },
      deltaPercent: 1.0,
      timestamp: Date.now(),
    },
    blockNumber: 19000000,
    timestamp: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("reporting", () => {
  describe("formatOpportunityReport", () => {
    it("should include opportunity path label", () => {
      const opp = makeTestOpportunity();
      const report = formatOpportunityReport(opp, true);
      expect(report).toContain("WETH/USDC UniV2 → WETH/USDC Sushi");
    });

    it("should include spread percentage", () => {
      const opp = makeTestOpportunity();
      const report = formatOpportunityReport(opp, true);
      expect(report).toContain("1.00%");
    });

    it("should include gross profit", () => {
      const opp = makeTestOpportunity();
      const report = formatOpportunityReport(opp, true);
      expect(report).toContain("0.100000");
    });

    it("should include cost breakdown", () => {
      const opp = makeTestOpportunity();
      const report = formatOpportunityReport(opp, true);
      expect(report).toContain("Flash loan fee");
      expect(report).toContain("Gas cost");
      expect(report).toContain("Slippage");
    });

    it("should include net profit", () => {
      const opp = makeTestOpportunity();
      const report = formatOpportunityReport(opp, true);
      expect(report).toContain("Net profit");
    });

    it("should show SKIP decision in dry-run mode for unprofitable opportunity", () => {
      const opp = makeTestOpportunity({ netProfit: -0.01 });
      const report = formatOpportunityReport(opp, true);
      expect(report).toContain("SKIP");
    });

    it("should show WOULD EXECUTE for profitable opportunity in dry-run mode", () => {
      const opp = makeTestOpportunity({
        netProfit: 0.05,
        netProfitPercent: 0.5,
      });
      const report = formatOpportunityReport(opp, true);
      expect(report).toContain("WOULD EXECUTE");
    });

    it("should show EXECUTE for profitable opportunity in live mode", () => {
      const opp = makeTestOpportunity({
        netProfit: 0.05,
        netProfitPercent: 0.5,
      });
      const report = formatOpportunityReport(opp, false);
      expect(report).toContain("EXECUTE");
      expect(report).not.toContain("WOULD EXECUTE");
    });

    it("should include buy and sell pool labels", () => {
      const opp = makeTestOpportunity();
      const report = formatOpportunityReport(opp, true);
      expect(report).toContain("WETH/USDC UniV2");
      expect(report).toContain("WETH/USDC Sushi");
    });

    it("should include buy and sell prices", () => {
      const opp = makeTestOpportunity();
      const report = formatOpportunityReport(opp, true);
      expect(report).toContain("2000");
      expect(report).toContain("2020");
    });

    it("should include input amount", () => {
      const opp = makeTestOpportunity();
      const report = formatOpportunityReport(opp, true);
      expect(report).toContain("10");
    });
  });

  describe("formatRejectionReport", () => {
    it("should include the rejection reason", () => {
      const report = formatRejectionReport(
        "Net profit -0.01 below threshold 0.01",
        "weth/usdc",
      );
      expect(report).toContain("below threshold");
    });

    it("should include the token pair", () => {
      const report = formatRejectionReport("Pool stale", "weth/usdc");
      expect(report).toContain("weth/usdc");
    });
  });

  describe("formatScanHeader", () => {
    it("should include pool count", () => {
      const header = formatScanHeader(4, 1, 12000);
      expect(header).toContain("4");
    });

    it("should include chain ID", () => {
      const header = formatScanHeader(4, 1, 12000);
      expect(header).toContain("Chain ID:");
    });

    it("should include poll interval", () => {
      const header = formatScanHeader(4, 1, 12000);
      expect(header).toContain("12.0s");
    });
  });

  describe("formatScanSummary", () => {
    it("should show zero stats for empty scan", () => {
      const stats: ScanStats = {
        pollCount: 0,
        opportunitiesFound: 0,
        opportunitiesRejected: 0,
        priceUpdates: 0,
        errors: 0,
        startTime: Date.now() - 60000,
      };
      const summary = formatScanSummary(stats);
      expect(summary).toContain("0");
    });

    it("should show all stats categories", () => {
      const stats: ScanStats = {
        pollCount: 10,
        opportunitiesFound: 2,
        opportunitiesRejected: 5,
        priceUpdates: 40,
        errors: 1,
        startTime: Date.now() - 120000,
      };
      const summary = formatScanSummary(stats);
      expect(summary).toContain("10");
      expect(summary).toContain("2");
      expect(summary).toContain("40");
    });

    it("should include runtime duration", () => {
      const stats: ScanStats = {
        pollCount: 5,
        opportunitiesFound: 0,
        opportunitiesRejected: 0,
        priceUpdates: 10,
        errors: 0,
        startTime: Date.now() - 65000,
      };
      const summary = formatScanSummary(stats);
      // Should include some measure of time
      expect(summary).toContain("min");
    });
  });
});
