# Bot Test Infrastructure

Test utilities and patterns for the flashloan arbitrage bot.

## Directory Structure

```
bot/__tests__/
├── helpers/             # Shared test utilities
│   ├── FixtureFactory.ts    # Factory functions for test data
│   ├── EventCapture.ts      # Event listener utilities
│   ├── TimeHelpers.ts       # Timer and timestamp helpers
│   ├── TestHelpers.ts       # Common assertion helpers
│   ├── helpers.test.ts      # Tests for the infrastructure itself
│   └── index.ts             # Barrel export
├── mocks/               # Module mocks
│   ├── MockProvider.ts      # Mock ethers.js provider
│   ├── MockPriceMonitor.ts  # Mock PriceMonitor (EventEmitter)
│   ├── MockOpportunityDetector.ts  # Mock OpportunityDetector
│   └── index.ts             # Barrel export
├── integration/         # Integration test scaffolding
│   └── IntegrationBase.ts   # Pipeline context and fork helpers
├── monitor/             # PriceMonitor tests
├── detector/            # OpportunityDetector tests
├── config/              # Configuration tests
├── setup.ts             # Global test setup (opt-in)
└── README.md            # This file
```

## Usage Patterns

### Creating Test Data

Use the fixture factories in `helpers/FixtureFactory.ts`. All factories accept partial overrides:

```ts
import { makePool, makeSnapshot, makeOpportunity, ADDRESSES } from "../helpers/index.js";

const pool = makePool({ dex: "sushiswap" });
const snap = makeSnapshot({ price: 2500, pool: { dex: "uniswap_v3" } });
const opp = makeOpportunity({ grossProfit: 0.5 });
```

### Mocking the Provider

Use `MockProvider.ts` to avoid real RPC calls:

```ts
import { createMockProvider, createRoutingProvider, createFailingProvider } from "../mocks/index.js";

// Default provider (V2 price ~2000)
const provider = createMockProvider();

// Custom reserves
const provider = createMockProvider({
  blockNumber: 20_000_000,
  getReservesReturn: [500n * 10n ** 18n, 1_000_000n * 10n ** 6n, 0],
});

// Multiple pools at different prices
const provider = createRoutingProvider({
  [ADDRESSES.POOL_UNI_V2]: { reserves: [1000n * 10n ** 18n, 2_000_000n * 10n ** 6n, 0] },
  [ADDRESSES.POOL_SUSHI]:  { reserves: [1000n * 10n ** 18n, 2_020_000n * 10n ** 6n, 0] },
});

// Test error handling
const provider = createFailingProvider("RPC timeout");
```

### Mocking Modules

Use mock classes to test downstream modules in isolation:

```ts
import { MockPriceMonitor } from "../mocks/index.js";
import { makeSnapshot, makeDelta } from "../helpers/index.js";

const monitor = new MockPriceMonitor();
monitor.setSnapshot(makeSnapshot({ price: 2000 }));
monitor.emitOpportunity(makeDelta());
```

### Capturing Events

Use `EventCapture.ts` for event-driven assertions:

```ts
import { captureEvents, waitForEvent, assertNoEvent } from "../helpers/index.js";

// Collect all events
const captured = captureEvents(monitor, "priceUpdate");
await monitor.poll();
expect(captured()).toHaveLength(2);

// Wait for a specific event
const opp = await waitForEvent(detector, "opportunityFound", 5000);

// Assert event is NOT emitted
await assertNoEvent(detector, "opportunityFound", async () => {
  monitor.emitOpportunity(unprofitableDelta);
});
```

### Time Control

Use `TimeHelpers.ts` for deterministic timing:

```ts
import { advanceTime, mockDateNow, fixedTimestamp, delay } from "../helpers/index.js";

// Fake timers
vi.useFakeTimers();
monitor.start();
await advanceTime(12_000);
vi.useRealTimers();

// Fixed timestamps
const ts = fixedTimestamp("2026-01-15T12:00:00Z");
const restore = mockDateNow(ts);
// ... test ...
restore();
```

### Environment Variables

Use `setTestEnv` for safe env manipulation:

```ts
import { setTestEnv } from "../helpers/index.js";

const restore = setTestEnv({
  MAX_GAS_PRICE: "100000000000",
  DRY_RUN: "false",
});
// ... test ...
restore(); // restores previous values
```

### Integration Tests

Use `IntegrationBase.ts` for multi-module tests:

```ts
import { createPipelineContext, isForkAvailable, createForkContext } from "../integration/IntegrationBase.js";

// Mock-based pipeline test
const ctx = createPipelineContext({
  pools: [makePool(), makeSushiPool()],
  deltaThreshold: 0.5,
});
// ... wire modules and test ...
ctx.cleanup();

// Fork-based test (requires MAINNET_RPC_URL)
describe.skipIf(!isForkAvailable())("fork tests", () => {
  const ctx = createForkContext({ forkBlock: 19_000_000 });
  // ... test with real chain data ...
});
```

## Running Tests

```bash
# Run all bot tests
pnpm test

# Run specific test file
pnpm test -- --run bot/__tests__/helpers/helpers.test.ts

# Run with watch mode
pnpm test:watch

# Type check (tests excluded from tsconfig but validated by vitest)
pnpm run typecheck
```

## Adding New Test Modules

When adding tests for a new module (e.g., TransactionBuilder):

1. Create `bot/__tests__/builder/TransactionBuilder.test.ts`
2. Import fixtures from `../helpers/index.js`
3. Import mocks from `../mocks/index.js`
4. If the module needs its own mock, add it to `mocks/` and export from `mocks/index.ts`
5. Add helper tests in `helpers/helpers.test.ts` for any new factory functions
