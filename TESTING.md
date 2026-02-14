# Testing

## Philosophy

All code changes require passing tests in both languages before merge. The project uses a dual-language testing approach:

- **Foundry** (forge) for Solidity smart contracts
- **Vitest** for TypeScript bot code

Tests run automatically in CI via GitHub Actions on every push and PR.

## Test Structure

### Solidity Tests (`contracts/test/`)

```
contracts/test/
├── interfaces/           # Interface compilation tests
│   └── Interfaces.t.sol
├── safety/               # Safety module tests
│   ├── CircuitBreaker.t.sol
│   ├── ProfitValidator.t.sol
│   └── SafetyIntegration.t.sol
├── invariants/           # Invariant/property-based tests
│   └── SafetyInvariants.t.sol
└── utils/                # Shared test helpers
    └── SafetyTestHelpers.sol
```

### TypeScript Tests (`bot/__tests__/`)

```
bot/__tests__/
├── setup.test.ts                    # Smoke tests (exports, ethers)
├── bot.test.ts                      # FlashloanBot lifecycle
├── config/
│   └── validate.test.ts             # Config parsing and validation
├── monitor/
│   └── PriceMonitor.test.ts         # Price monitoring (V2, V3, staleness)
├── detector/
│   └── OpportunityDetector.test.ts  # Profit calculation, cost estimation
├── helpers/
│   └── helpers.test.ts              # Shared test helper tests
└── integration/
    ├── e2e/
    │   └── pipeline.test.ts         # Full PriceMonitor → Detector pipeline
    ├── performance/
    │   └── benchmarks.test.ts       # Latency and memory benchmarks
    └── helpers/
        ├── event-collector.ts       # Event collection utility
        ├── scenario-builder.ts      # Test scenarios and mock providers
        └── fork-setup.ts            # Anvil fork infrastructure
```

## Running Tests

### All Tests

```bash
# Both languages
forge test && pnpm test
```

### Solidity

```bash
# All tests
forge test

# Verbose (show traces on failure)
forge test -vvv

# CI profile (1000 fuzz runs)
FOUNDRY_PROFILE=ci forge test

# Security profile (10000 fuzz runs)
FOUNDRY_PROFILE=security forge test

# Specific file
forge test --match-path contracts/test/safety/CircuitBreaker.t.sol

# Specific function
forge test --match-test testCircuitBreaker

# Gas report
forge test --gas-report

# Coverage
forge coverage --report summary

# Fork tests
forge test --fork-url $MAINNET_RPC_URL
```

### TypeScript

```bash
# All tests
pnpm test

# Watch mode
pnpm test:watch

# Specific file
pnpm test -- --run bot/__tests__/monitor/PriceMonitor.test.ts

# Integration tests only
pnpm test -- --run bot/__tests__/integration/

# Performance benchmarks only
pnpm test -- --run bot/__tests__/integration/performance/

# With coverage
pnpm test -- --coverage

# Type checking (no test execution)
pnpm typecheck
```

## Test Types

### Unit Tests

Test individual functions and classes in isolation with mocked dependencies.

**Solidity**: Mock contracts for DEX adapters, flash loan providers.
**TypeScript**: Mock providers returning ABI-encoded responses, `vi.spyOn()` for method mocking.

### Integration Tests (E2E)

Test multiple modules working together through the real event pipeline.

The `bot/__tests__/integration/e2e/pipeline.test.ts` file tests the full `PriceMonitor → OpportunityDetector` pipeline with scenarios:

- Profitable 5% spread detection
- Tiny spread rejection (below threshold)
- Cost exceeding profit (opportunity rejected)
- Stale pool handling across module boundaries
- Multiple simultaneous opportunities across pairs
- State consistency across multiple poll cycles

### Performance Benchmarks

The `bot/__tests__/integration/performance/benchmarks.test.ts` file enforces latency baselines:

| Benchmark | Threshold |
|-----------|-----------|
| 2-pool poll cycle | < 50ms |
| 10-pool poll cycle | < 100ms |
| 100 consecutive cycles | < 2s total (avg < 20ms/cycle) |
| 1000 opportunity analyses | < 100ms total (avg < 0.1ms) |
| Memory across 50 cycles | No accumulation |

### Fuzz Tests (Solidity)

Foundry automatically generates random inputs to discover edge cases.

```bash
# Default: 256 runs
forge test

# CI: 1000 runs
FOUNDRY_PROFILE=ci forge test

# Security: 10000 runs
FOUNDRY_PROFILE=security forge test
```

### Invariant Tests (Solidity)

Property-based tests that verify conditions hold across sequences of random function calls.

### Fork Tests

Test against real mainnet state using Anvil:

```bash
# Solidity fork tests
forge test --fork-url $MAINNET_RPC_URL

# TypeScript fork tests (requires FORK_URL env var)
FORK_URL=$MAINNET_RPC_URL pnpm test -- --run bot/__tests__/integration/
```

Fork tests are automatically skipped when `FORK_URL` is not set.

## Test Helpers

### TypeScript

| Helper | Location | Purpose |
|--------|----------|---------|
| `EventCollector` | `integration/helpers/event-collector.ts` | Collect and wait for events from EventEmitters |
| `scenario-builder` | `integration/helpers/scenario-builder.ts` | Factory functions for pools, snapshots, deltas, mock providers |
| `AnvilFork` | `integration/helpers/fork-setup.ts` | Start/stop Anvil fork processes for integration tests |

### Key Patterns

**Mock Provider**: Intercepts at `provider.call()` and returns ABI-encoded hex matching function selectors (`0x0902f1ac` for getReserves, `0x3850c7bd` for slot0).

**Error Event Handling**: Always register `emitter.on("error", () => {})` in tests that trigger error paths. Node.js EventEmitter throws unhandled errors otherwise.

**Predefined Scenarios**: `SCENARIOS.profitable_5pct()`, `SCENARIOS.unprofitable_tiny_spread()`, etc. return pre-configured pools + mock providers.

## CI Integration

Tests run automatically via GitHub Actions (`.github/workflows/ci.yml`):

1. **Solidity Tests** job: `forge fmt --check` → `forge build --sizes` → `forge test` (CI profile)
2. **TypeScript Tests** job: `pnpm typecheck` → `pnpm test`
3. **Coverage** job: `forge coverage` + `vitest --coverage`
4. **Security Scan** job: gitleaks + `pnpm audit`

Performance benchmarks run on PRs via `.github/workflows/performance.yml` and post results as PR comments.

## Writing New Tests

### Solidity Test Template

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/YourContract.sol";

contract YourContractTest is Test {
    YourContract target;

    function setUp() public {
        target = new YourContract();
    }

    function test_basicBehavior() public {
        // Arrange, Act, Assert
    }

    function testFuzz_withRandomInput(uint256 value) public {
        vm.assume(value > 0 && value < type(uint128).max);
        // Test with random value
    }
}
```

### TypeScript Test Template

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("YourModule", () => {
  let instance: YourClass;

  beforeEach(() => {
    instance = new YourClass(/* config */);
  });

  afterEach(() => {
    instance?.cleanup();
  });

  it("should do the expected thing", () => {
    const result = instance.method();
    expect(result).toBe(expected);
  });
});
```

## Coverage Requirements

- All new modules must have corresponding test files
- All public methods should have at least one test
- Error paths and edge cases should be tested
- Integration tests should cover module boundaries
- Performance benchmarks should enforce latency baselines
