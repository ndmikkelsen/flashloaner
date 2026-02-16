# Testing Patterns

**Analysis Date:** 2026-02-16

## Test Frameworks

**Solidity - Foundry (forge):**
- Framework: Foundry forge
- Config: `foundry.toml`
- Solidity version: 0.8.24
- Optimizer: 200 runs

**TypeScript - Vitest:**
- Framework: Vitest
- Config: `vitest.config.ts`
- Environment: `node`
- Globals: `true` (describe/it/expect available without import)

**Run Commands:**
```bash
forge test                            # Run all Solidity tests
forge test -vvv                       # Verbose output with traces
forge test --match-path test/unit/FlashloanExecutor.t.sol  # Specific file
forge test --match-test testArbitrage # Specific test function
forge test --fork-url $MAINNET_RPC_URL # Against mainnet fork
forge test --gas-report               # With gas profiling
forge test --summary                  # Summary counts only

pnpm test                            # Run all TypeScript tests (vitest run)
pnpm test -- --run src/bot/__tests__/detector/OpportunityDetector.test.ts  # Specific file
```

## Solidity Test Configuration

**Default profile (`foundry.toml`):**
```toml
[profile.default.fuzz]
runs = 256
max_test_rejects = 65536

[profile.default.invariant]
runs = 256
depth = 15
```

**CI profile (higher fuzz iterations):**
```toml
[profile.ci.fuzz]
runs = 1000

[profile.ci.invariant]
runs = 512
depth = 20
```

**Security profile (maximum coverage):**
```toml
[profile.security.fuzz]
runs = 10000

[profile.security.invariant]
runs = 1024
depth = 30
```

Run with profiles:
```bash
FOUNDRY_PROFILE=ci forge test         # CI fuzz runs
FOUNDRY_PROFILE=security forge test   # Security-level fuzz runs
```

## Test File Organization

**Solidity - Separate test directory with category subdirectories:**
```
contracts/test/
├── unit/                    # Standard unit tests
│   ├── FlashloanExecutor.t.sol    # 52 tests
│   ├── FlashloanReceiver.t.sol    # 34 tests
│   └── adapters/
│       ├── UniswapV2Adapter.t.sol # 21 tests
│       └── UniswapV3Adapter.t.sol # 27 tests
├── safety/                  # Safety module tests
│   ├── CircuitBreaker.t.sol       # 50 tests
│   ├── ProfitValidator.t.sol      # 19 tests
│   └── SafetyIntegration.t.sol    # 17 tests (skipped)
├── fuzz/                    # Advanced fuzz tests
│   └── FlashloanFuzz.t.sol        # 22 tests
├── invariants/              # Invariant/stateful fuzz tests
│   └── SafetyInvariants.t.sol     # 16 tests
├── formal/                  # Formal verification via fuzz
│   └── ProfitValidatorFormal.t.sol # 10 tests
├── security/                # Security audit regression tests
│   └── SecurityAuditTests.t.sol   # 20 tests
├── fork/                    # Mainnet fork tests (placeholder)
├── integration/             # Integration tests (placeholder)
└── utils/                   # Shared test utilities
    └── SafetyTestHelpers.sol
```

**TypeScript - `__tests__` directories:**
```
bot/
├── __tests__/
│   ├── detector/
│   │   └── OpportunityDetector.test.ts  # 20+ tests
│   ├── helpers/
│   │   ├── FixtureFactory.ts    # Factory functions
│   │   ├── setup.ts             # Global beforeAll/afterEach
│   │   └── index.ts             # Barrel export
│   └── mocks/
│       └── index.ts             # MockProvider, MockPriceMonitor, etc.
└── src/
    └── (source files)
```

**Naming conventions:**
- Solidity: `*.t.sol` suffix
- TypeScript: `*.test.ts` suffix
- Test contracts: `ContractNameTest` (e.g., `FlashloanExecutorTest`)
- Test helpers: no `.t.sol` suffix (e.g., `SafetyTestHelpers.sol`)

## Solidity Test Structure

**Standard unit test pattern:**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {FlashloanExecutor} from "../../src/FlashloanExecutor.sol";
import {IFlashloanExecutor} from "../../src/interfaces/IFlashloanExecutor.sol";

// Inline mock contracts at top of file
contract MockToken is IERC20 { ... }
contract MockAdapter { ... }
contract MockAavePool { ... }

contract FlashloanExecutorTest is Test {
    // ── State ──
    FlashloanExecutor internal executor;
    MockToken internal token;
    address internal owner = makeAddr("owner");
    address internal bot = makeAddr("bot");

    // ── Setup ──
    function setUp() public {
        vm.prank(owner);
        executor = new FlashloanExecutor(...);
    }

    // ── Helpers ──
    function _setupProfitableSwap(uint256 amount) internal { ... }
    function _singleSwapStep(uint256 amount) internal view returns (IFlashloanExecutor.SwapStep[] memory) { ... }

    // ── Tests grouped by function ──

    // --- executeArbitrage ---
    function test_executeArbitrage_success() public { ... }
    function test_revertWhen_notAuthorized() public { ... }
    function testFuzz_executeArbitrage_randomAmounts(uint256 amount) public { ... }
}
```

Reference: `contracts/test/unit/FlashloanExecutor.t.sol`

**Test naming convention (critical -- follow exactly):**
| Prefix | Use | Example |
|--------|-----|---------|
| `test_` | Standard passing test | `test_executeArbitrage_success` |
| `test_revertWhen_` | Expected revert | `test_revertWhen_notAuthorized` |
| `testFuzz_` | Fuzz test | `testFuzz_executeArbitrage_randomAmounts` |
| `testFormal_` | Formal verification | `testFormal_successImpliesProfit` |
| `invariant_` | Invariant test | `invariant_noResidualTokens` |

**Test grouping within a contract:**
Use comment headers to group tests by the function being tested:
```solidity
// --- executeArbitrage ---
function test_executeArbitrage_success() public { ... }
function test_executeArbitrage_emitsEvent() public { ... }
function test_revertWhen_executeArbitrage_notAuthorized() public { ... }

// --- setMinProfit ---
function test_setMinProfit_success() public { ... }
```

## Solidity Mocking Patterns

**Inline mock contracts (primary pattern):**

Mock contracts are defined at the top of each test file, not in shared files. Each test file creates purpose-built mocks:

```solidity
contract MockToken is IERC20 {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    // ... minimal IERC20 implementation
}

contract MockAdapter {
    uint256 public returnAmount;

    function setReturnAmount(uint256 _amount) external {
        returnAmount = _amount;
    }

    function swap(...) external returns (uint256) {
        MockToken(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        MockToken(tokenOut).transfer(msg.sender, returnAmount);
        return returnAmount;
    }
}
```

Reference: `contracts/test/unit/FlashloanExecutor.t.sol` (MockToken, MockAdapter, MockAavePool)

**Shared test helpers (for cross-file reuse):**
```solidity
// contracts/test/utils/SafetyTestHelpers.sol
library SafetyConstants {
    uint256 internal constant DEFAULT_MAX_GAS_PRICE = 50 gwei;
    uint256 internal constant DEFAULT_MAX_TRADE_SIZE = 100 ether;
    uint256 internal constant DEFAULT_FAILURE_THRESHOLD = 5;
}

contract MockERC20 { ... }
contract MockFlashLoanProvider { ... }
contract MockDEXAdapter { ... }
contract ReentrantAdapter { ... }

abstract contract SafetyTestBase is Test {
    // Common setup for safety tests
}
```

Reference: `contracts/test/utils/SafetyTestHelpers.sol`

**What to mock:**
- ERC20 tokens (minimal balanceOf/transfer/approve/transferFrom)
- DEX routers (controlled swap return amounts)
- Aave pool (simplified flashLoanSimple that calls executeOperation callback)
- Any external protocol dependency

**What NOT to mock:**
- The contract under test itself
- OpenZeppelin base contracts (Ownable, ReentrancyGuard, Pausable)
- Internal functions of the contract under test

## Foundry Cheatcodes Used

**Identity and authorization:**
```solidity
address owner = makeAddr("owner");        // Deterministic address from label
vm.prank(owner);                          // Next call as owner
vm.startPrank(owner);                     // All calls as owner until stopPrank
vm.stopPrank();
```

**Assertions and expectations:**
```solidity
vm.expectRevert(IFlashloanExecutor.NotAuthorized.selector);  // Expect specific error
vm.expectRevert(abi.encodeWithSelector(IProfitValidator.ExecutionLoss.selector, before, after));
vm.expectEmit(true, true, false, true);   // Expect event emission
emit ArbitrageExecuted(token, profit);    // Expected event
```

**Fuzz test input bounding:**
```solidity
vm.assume(amount > 0);                    // Skip if condition not met
vm.assume(amount < type(uint128).max);
amount = bound(amount, 0.01 ether, 100 ether);  // Constrain range
```

**State manipulation:**
```solidity
vm.skip(true);                            // Skip test (for blocked tests)
deal(address(token), user, 100 ether);    // Set token balance
vm.warp(block.timestamp + 1 hours);       // Advance time
vm.roll(block.number + 1);                // Advance block
```

## Invariant Testing Pattern

**Handler contract pattern with ghost variables:**

Invariant tests use a separate handler contract that wraps the system under test. The handler:
1. Bounds inputs to valid ranges
2. Tracks ghost variables for cross-call assertions
3. Handles edge cases (e.g., skip when paused)

```solidity
contract CircuitBreakerHandler is Test {
    CircuitBreaker public breaker;
    address internal owner;

    // Ghost variables track cumulative state
    uint256 public ghost_successCount;
    uint256 public ghost_failureCount;
    uint256 public ghost_pauseCount;

    function recordFailure() external {
        if (breaker.paused()) return;  // Guard: skip when paused
        vm.prank(owner);
        breaker.recordFailure();
        ghost_failureCount++;
    }

    function setMaxGasPriceWithBounds(uint256 newPrice) external {
        newPrice = bound(newPrice, 1 gwei, 10_000 gwei);  // Bound inputs
        vm.prank(owner);
        breaker.setMaxGasPrice(newPrice);
    }
}

contract CircuitBreakerInvariantTest is Test {
    function setUp() public {
        handler = new CircuitBreakerHandler(breaker, owner);
        targetContract(address(handler));  // Foundry fuzzes handler functions
    }

    function invariant_maxGasPricePositive() public view {
        assertGt(breaker.maxGasPrice(), 0);
    }
}
```

Reference: `contracts/test/invariants/SafetyInvariants.t.sol`

**Key invariants tested:**
- CircuitBreaker: maxGasPrice > 0, maxTradeSize > 0, pause blocks all, owner never zero
- FlashloanExecutor: no residual tokens, paused blocks execution, access control holds, bot balance non-decreasing, minProfit > 0, adapter approval stable, revert rate < 99%

## Formal Verification Pattern

Formal verification uses Foundry fuzz testing with carefully partitioned input spaces to prove properties hold for ALL possible inputs:

```solidity
/// @notice FORMAL: success implies strict profit and minimum threshold met
function testFormal_successImpliesProfit(uint256 balanceBefore, uint256 balanceAfter, uint256 minProfit) public {
    // Restrict to the success partition
    vm.assume(balanceAfter > balanceBefore);
    vm.assume(balanceAfter - balanceBefore >= minProfit);

    uint256 profit = validator.validateProfit(TOKEN, balanceBefore, balanceAfter, minProfit);

    // Property: balance must have increased
    assertGt(balanceAfter, balanceBefore);
    // Property: profit must meet minimum
    assertGe(profit, minProfit);
    // Property: profit must equal the actual difference
    assertEq(profit, balanceAfter - balanceBefore);
}
```

Run with high iterations:
```bash
forge test --match-path test/formal/ProfitValidatorFormal.t.sol --fuzz-runs 100000
```

Reference: `contracts/test/formal/ProfitValidatorFormal.t.sol`

**Properties proven for ProfitValidator:**
1. No-loss invariant: success implies balanceAfter > balanceBefore
2. Revert completeness: all losses revert
3. Revert completeness: all below-minimum profits revert
4. Return value correctness: returned profit == actual difference
5. Zero-profit boundary: zero profit reverts when minProfit > 0
6. Token address independence: token parameter does not affect logic
7. Exact boundary: profit == minProfit-1 reverts, profit == minProfit succeeds
8. Commutativity: swapping before/after causes revert
9. Large value safety: no overflow near uint256 max

## Security Audit Tests

Regression tests for specific security findings, organized by finding ID:

```solidity
/// @title F-01: Access Control Bypass Tests
contract F01_AccessControlTests is SafetyTestBase {
    function test_F01_onlyOwnerCanRegisterAdapter() public { ... }
    function test_F01_onlyAuthorizedCanExecute() public { ... }
}

/// @title F-02: Callback Guard Tests
contract F02_CallbackGuardTests is SafetyTestBase {
    function test_F02_executeOperationOnlyDuringFlashloan() public { ... }
}
```

Reference: `contracts/test/security/SecurityAuditTests.t.sol`

**Finding categories tested:**
- F-01: Access control bypass (5 tests)
- F-02: Flash loan callback guard (3 tests)
- F-03: Residual allowance cleanup (3 tests)
- F-04: Withdrawal reentrancy (3 tests)
- F-05: Emergency withdrawal reentrancy (3 tests)
- F-06: Flash loan active flag lifecycle (3 tests)

## TypeScript Test Structure

**Suite organization with describe/it blocks:**
```typescript
describe("OpportunityDetector", () => {
    describe("construction", () => {
        it("stores config values", () => { ... });
        it("sets default cost estimate when omitted", () => { ... });
    });

    describe("attach / detach", () => {
        it("subscribes to priceDelta events on attach", () => { ... });
        it("removes listener on detach", () => { ... });
    });

    describe("path building", () => {
        it("builds a two-step round-trip path", () => { ... });
    });

    describe("profit calculation", () => {
        it("emits opportunity when profit exceeds threshold", () => { ... });
        it("does not emit when profit below threshold", () => { ... });
    });
});
```

Reference: `bot/__tests__/detector/OpportunityDetector.test.ts`

## TypeScript Mocking

**Inline helper factories (primary pattern):**
```typescript
function makePool(overrides: Partial<PoolConfig> = {}): PoolConfig {
    return {
        address: "0x" + "a".repeat(40),
        token0: "0x" + "b".repeat(40),
        token1: "0x" + "c".repeat(40),
        dex: "uniswap-v2",
        fee: 3000,
        ...overrides,
    };
}

function makeDelta(overrides: Partial<PriceDelta> = {}): PriceDelta {
    return {
        pool: makePool(),
        priceBefore: 1000n,
        priceAfter: 1100n,
        timestamp: Date.now(),
        ...overrides,
    };
}
```

**Shared fixture factory (for cross-file reuse):**
```typescript
// bot/__tests__/helpers/FixtureFactory.ts
export function makePool(overrides?: Partial<PoolConfig>): PoolConfig { ... }
export function makeV3Pool(overrides?: Partial<PoolConfig>): PoolConfig { ... }
export function makeSnapshot(overrides?: Partial<PoolSnapshot>): PoolSnapshot { ... }
export function makeSnapshotPair(): [PoolSnapshot, PoolSnapshot] { ... }
export function makeDelta(overrides?: Partial<PriceDelta>): PriceDelta { ... }
export function makeSwapStep(overrides?: Partial<SwapStep>): SwapStep { ... }
export function makeOpportunity(overrides?: Partial<ArbitrageOpportunity>): ArbitrageOpportunity { ... }

// ABI encoding helpers for mock responses
export function encodeGetReserves(r0: bigint, r1: bigint): string { ... }
export function encodeSlot0(sqrtPriceX96: bigint): string { ... }

// Reserve presets
export const RESERVES = {
    balanced: { reserve0: 1000000n * 10n ** 18n, reserve1: 1000000n * 10n ** 6n },
    ...
};
```

Reference: `bot/__tests__/helpers/FixtureFactory.ts`

**Mock objects (for external dependencies):**
```typescript
// bot/__tests__/mocks/index.ts
export { MockProvider } from "./MockProvider";
export { MockPriceMonitor } from "./MockPriceMonitor";
export { MockOpportunityDetector } from "./MockOpportunityDetector";
```

**What to mock in TypeScript:**
- ethers.js Provider (network calls)
- PriceMonitor (for testing OpportunityDetector in isolation)
- External API responses

**What NOT to mock:**
- Pure logic functions
- Type validation
- Config parsing

## TypeScript Test Setup

**Global test setup (`bot/__tests__/helpers/setup.ts`):**
```typescript
beforeAll(() => {
    // Set deterministic env vars for config validation
    process.env.RPC_URL = "http://localhost:8545";
    process.env.EXECUTOR_ADDRESS = "0x" + "1".repeat(40);
    // ...
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});
```

Referenced in `vitest.config.ts`:
```typescript
setupFiles: ["./bot/__tests__/helpers/setup.ts"]
```

## Test Counts (Current)

**Solidity (278+ passing, 17 skipped):**

| File | Tests | Category |
|------|-------|----------|
| `contracts/test/unit/FlashloanExecutor.t.sol` | 52 | Unit + Fuzz |
| `contracts/test/unit/FlashloanReceiver.t.sol` | 34 | Unit + Fuzz |
| `contracts/test/unit/adapters/UniswapV2Adapter.t.sol` | 21 | Unit + Fuzz |
| `contracts/test/unit/adapters/UniswapV3Adapter.t.sol` | 27 | Unit + Fuzz |
| `contracts/test/safety/CircuitBreaker.t.sol` | 50 | Unit + Fuzz |
| `contracts/test/safety/ProfitValidator.t.sol` | 19 | Unit + Fuzz |
| `contracts/test/fuzz/FlashloanFuzz.t.sol` | 22 | Advanced Fuzz |
| `contracts/test/invariants/SafetyInvariants.t.sol` | 16 | Invariant |
| `contracts/test/formal/ProfitValidatorFormal.t.sol` | 10 | Formal |
| `contracts/test/security/SecurityAuditTests.t.sol` | 20 | Security Regression |
| `contracts/test/safety/SafetyIntegration.t.sol` | 17 (skipped) | Integration |
| Interface compilation tests | 5 | Compilation |

**TypeScript:**

| File | Tests | Category |
|------|-------|----------|
| `bot/__tests__/detector/OpportunityDetector.test.ts` | 20+ | Unit |

## Coverage

**Solidity:**
```bash
forge coverage                          # Basic coverage report
forge coverage --report lcov            # LCOV format for tooling
```

No explicit coverage threshold enforced in CI configuration.

**TypeScript:**
```bash
pnpm test -- --coverage                # Vitest coverage
```

No explicit coverage threshold configured in `vitest.config.ts`.

## Test Types Summary

**Unit Tests:**
- Scope: Individual contract functions in isolation
- Location: `contracts/test/unit/`, `bot/__tests__/`
- Pattern: Single function per test, inline mocks, explicit setup
- Count: ~200+ Solidity, 20+ TypeScript

**Fuzz Tests:**
- Scope: Function behavior across randomized inputs
- Location: Embedded in unit test files (`testFuzz_` prefix) and `contracts/test/fuzz/`
- Pattern: `vm.assume()` for preconditions, `bound()` for ranges
- Config: 256 runs default, 1000 CI, 10000 security

**Invariant Tests:**
- Scope: System-wide properties that must ALWAYS hold across random call sequences
- Location: `contracts/test/invariants/`
- Pattern: Handler contracts with ghost variables, `targetContract()` directive
- Config: 256 runs, depth 15 (default); 512/20 (CI); 1024/30 (security)

**Formal Verification Tests:**
- Scope: Mathematical proof of correctness across ALL possible inputs
- Location: `contracts/test/formal/`
- Pattern: Partitioned input spaces with `vm.assume()`, property assertions
- Run with: `--fuzz-runs 100000` for maximum confidence

**Security Audit Tests:**
- Scope: Regression tests for specific security findings
- Location: `contracts/test/security/`
- Pattern: Finding-ID prefixed test contracts (F-01, F-02, etc.)

**Integration Tests:**
- Scope: Multi-contract interaction (safety integration)
- Location: `contracts/test/safety/SafetyIntegration.t.sol`
- Status: 17 tests exist but ALL skipped (`vm.skip(true)`) -- blocked on dependencies

**Fork Tests:**
- Scope: Against real mainnet state
- Location: `contracts/test/fork/` (placeholder, no tests yet)
- Run with: `forge test --fork-url $MAINNET_RPC_URL`

## Common Patterns

**Async Testing (TypeScript):**
```typescript
it("emits opportunity on profitable delta", async () => {
    const events: ArbitrageOpportunity[] = [];
    detector.on("opportunity", (opp) => events.push(opp));

    monitor.emit("priceDelta", makeDelta({ priceAfter: 1200n }));

    // EventEmitter is synchronous in Node.js, so no await needed
    expect(events).toHaveLength(1);
    expect(events[0].estimatedProfit).toBeGreaterThan(0n);
});
```

**Revert Testing (Solidity):**
```solidity
function test_revertWhen_notAuthorized() public {
    vm.prank(makeAddr("attacker"));
    vm.expectRevert(IFlashloanExecutor.NotAuthorized.selector);
    executor.executeArbitrage(pool, token, 1 ether, steps);
}

function test_revertWhen_executionLoss() public {
    vm.expectRevert(
        abi.encodeWithSelector(IProfitValidator.ExecutionLoss.selector, 100, 90)
    );
    validator.validateProfit(token, 100, 90, 0);
}
```

**Event Testing (Solidity):**
```solidity
function test_executeArbitrage_emitsEvent() public {
    _setupProfitableSwap(1 ether);
    vm.expectEmit(true, true, false, true);
    emit ArbitrageExecuted(address(token), expectedProfit);
    vm.prank(bot);
    executor.executeArbitrage(pool, token, 1 ether, steps);
}
```

**Testing abstract contracts (Solidity):**
```solidity
// Create a concrete implementation for testing
contract TestReceiver is FlashloanReceiver {
    constructor(address _pool, address _vault, address _owner)
        FlashloanReceiver(_pool, _vault, _owner) {}

    // Expose internal functions for testing
    function exposed_flashLoanActive() external view returns (bool) {
        return _flashLoanActive;
    }
}
```

Reference: `contracts/test/unit/FlashloanReceiver.t.sol`

## Where to Add New Tests

**New Solidity contract:**
1. Unit tests: `contracts/test/unit/ContractName.t.sol`
2. Fuzz tests: Include `testFuzz_` functions in the unit test file
3. Security tests: Add finding-specific tests to `contracts/test/security/`

**New Solidity safety module:**
1. Unit tests: `contracts/test/safety/ModuleName.t.sol`
2. Invariant tests: Add handler + invariant contract to `contracts/test/invariants/`
3. Formal verification: `contracts/test/formal/ModuleNameFormal.t.sol`

**New TypeScript module:**
1. Unit tests: `bot/__tests__/{module}/ModuleName.test.ts`
2. Fixtures: Add `make*()` functions to `bot/__tests__/helpers/FixtureFactory.ts`
3. Mocks: Add to `bot/__tests__/mocks/` if needed

**New DEX adapter:**
1. Unit tests: `contracts/test/unit/adapters/NewAdapter.t.sol`
2. Include MockRouter for the specific DEX
3. Include fuzz tests for swap amount ranges

## Pre-Commit Quality Gates

Both test suites must pass before any commit:
```bash
forge test && pnpm test && gitleaks detect --source . --no-git
```

Secret detection is enforced via pre-commit hook (`.pre-commit-config.yaml`):
- Tool: gitleaks v8.30.0
- Config: `.gitleaks.toml` with allowlists for example files and known public addresses

---

*Testing analysis: 2026-02-16*
