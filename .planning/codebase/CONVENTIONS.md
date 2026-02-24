# Coding Conventions

**Analysis Date:** 2026-02-16

## Naming Patterns

**Solidity Files:**
- PascalCase for contract files: `FlashloanExecutor.sol`, `CircuitBreaker.sol`, `ProfitValidator.sol`
- PascalCase prefixed with `I` for interfaces: `IFlashloanExecutor.sol`, `IDEXAdapter.sol`, `ICircuitBreaker.sol`
- Interfaces live in `contracts/src/interfaces/`
- Adapters live in `contracts/src/adapters/`
- Safety modules live in `contracts/src/safety/`

**Solidity Contracts/Interfaces:**
- PascalCase: `FlashloanExecutor`, `CircuitBreaker`, `ProfitValidator`
- Interfaces prefixed with `I`: `IFlashloanExecutor`, `IDEXAdapter`, `ICircuitBreaker`, `IProfitValidator`

**Solidity Functions:**
- camelCase for public/external: `executeArbitrage()`, `validateProfit()`, `recordFailure()`
- Underscore-prefixed camelCase for internal: `_executeSwaps()`, `_validateSwapStep()`
- `test_` prefix for unit tests: `test_executeArbitrage_success()`
- `test_revertWhen_` prefix for revert tests: `test_revertWhen_notAuthorized()`
- `testFuzz_` prefix for fuzz tests: `testFuzz_executeArbitrage_randomAmounts()`
- `testFormal_` prefix for formal verification: `testFormal_successImpliesProfit()`
- `invariant_` prefix for invariant tests: `invariant_noResidualTokens()`

**Solidity Variables:**
- camelCase for state variables: `maxGasPrice`, `maxTradeSize`, `consecutiveFailures`
- UPPER_SNAKE_CASE for constants: `DEFAULT_MAX_GAS_PRICE`, `MIN_PROFIT`
- Underscore-prefixed camelCase for constructor parameters: `_aavePool`, `_owner`, `_botWallet`
- Underscore-prefixed for internal state: (used sparingly, most state is public)

**Solidity Custom Errors:**
- PascalCase, no `Error` suffix: `ZeroAddress()`, `NotAuthorized()`, `ExecutionLoss(uint256, uint256)`
- Defined in interfaces, not in contracts

**Solidity Events:**
- PascalCase past tense: `ArbitrageExecuted`, `FailureRecorded`, `ProfitValidated`
- Defined in interfaces alongside errors and structs

**TypeScript Files:**
- PascalCase for classes: `OpportunityDetector.ts`, `PriceMonitor.ts`, `TransactionBuilder.ts`
- camelCase for utility modules: `validate.ts`
- Separate `types.ts` files per module directory

**TypeScript Functions/Methods:**
- camelCase: `analyzeDelta()`, `buildTransaction()`, `parseEnv()`
- Factory methods: `fromEnv()` static pattern on classes

**TypeScript Variables:**
- camelCase for variables/parameters: `priceMonitor`, `opportunityDetector`
- UPPER_SNAKE_CASE for module-level constants: defined inline in config objects
- PascalCase for types/interfaces: `ArbitrageOpportunity`, `PoolSnapshot`, `BotConfig`

## Code Style

**Solidity Formatting (enforced via `foundry.toml` formatter):**
- 4-space indentation (tab_width = 4)
- 120 character line length
- Double quotes for strings
- Bracket spacing enabled
- Multiline function headers on parameters exceeding line length
- Config at `foundry.toml` under `[fmt]`:
  ```toml
  line_length = 120
  tab_width = 4
  bracket_spacing = true
  quote_style = "double"
  number_underscore = "thousands"
  ```

**TypeScript Formatting:**
- No explicit Prettier/ESLint config detected
- Follow patterns in existing files: 2-space indentation inferred from `tsconfig.json` and source
- Single quotes for imports (observed in all `.ts` files)
- Semicolons used consistently

**Linting:**
- Solidity: Slither static analysis configured via `slither.config.json`
  - Excludes: `naming-convention`, `constable-states`, `immutable-states` detectors
  - Excludes: `contracts/test/`, `contracts/script/`, `contracts/lib/` paths
- TypeScript: No ESLint config detected; rely on TypeScript strict mode (`strict: true` in `tsconfig.json`)
- Secret detection: gitleaks via `.gitleaks.toml` and `.pre-commit-config.yaml`

## Solidity Source File Layout

Every Solidity source file follows this exact structure:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// External imports (OpenZeppelin, etc.)
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Internal interface imports
import {IFlashloanExecutor} from "./interfaces/IFlashloanExecutor.sol";

/// @title ContractName
/// @notice One-line user-facing description
/// @dev Technical details, design rationale, security notes
contract ContractName is Ownable, ReentrancyGuard, IFlashloanExecutor {
    using SafeERC20 for IERC20;

    // ──────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────

    // immutable state first
    address public immutable aavePool;
    // then mutable state
    uint256 public minProfit;
    mapping(address => bool) public approvedAdapters;

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    constructor(address _aavePool, address _owner, uint256 _minProfit) Ownable(_owner) {
        if (_aavePool == address(0)) revert ZeroAddress();
        aavePool = _aavePool;
        minProfit = _minProfit;
    }

    // ──────────────────────────────────────────────
    //  External / Public Functions
    // ──────────────────────────────────────────────

    function executeArbitrage(...) external onlyAuthorized whenNotPaused nonReentrant {
        // ...
    }

    // ──────────────────────────────────────────────
    //  Owner Functions
    // ──────────────────────────────────────────────

    function setMinProfit(uint256 _newMinProfit) external onlyOwner {
        // ...
    }

    // ──────────────────────────────────────────────
    //  Internal Functions
    // ──────────────────────────────────────────────

    function _executeSwaps(...) internal returns (uint256) {
        // ...
    }
}
```

**Section dividers** use the Unicode box-drawing character: `// ──────────────────────────────────────────────`

**Section order within a contract:**
1. `using` declarations
2. State variables (immutable first, then mutable)
3. Constructor
4. Modifiers (if custom)
5. External/public functions
6. Owner-only functions
7. Internal/private functions

## Interface Design

Interfaces define ALL errors, events, and structs. Contracts inherit them:

```solidity
// In IFlashloanExecutor.sol
interface IFlashloanExecutor {
    // Errors
    error ZeroAddress();
    error NotAuthorized();
    error AdapterNotApproved(address adapter);

    // Events
    event ArbitrageExecuted(address indexed token, uint256 profit);
    event AdapterRegistered(address indexed adapter);

    // Structs
    struct SwapStep {
        address adapter;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        bytes extraData;
    }

    // Functions
    function executeArbitrage(...) external;
}
```

Reference files:
- `contracts/src/interfaces/IFlashloanExecutor.sol`
- `contracts/src/interfaces/IDEXAdapter.sol`
- `contracts/src/interfaces/ICircuitBreaker.sol`
- `contracts/src/interfaces/IProfitValidator.sol`
- `contracts/src/interfaces/IFlashloanReceiver.sol`

## Import Organization

**Solidity Import Order:**
1. External library imports (OpenZeppelin, Aave, Uniswap)
2. Internal interface imports
3. Internal concrete imports (rare, prefer interfaces)

**Import style:** Named imports only, never wildcard:
```solidity
// CORRECT
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// NEVER
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
```

**Solidity Path Aliases (from `remappings.txt`):**
- `@openzeppelin/` → `lib/openzeppelin-contracts/`
- `@aave/` → `lib/aave-v3-core/`
- `@uniswap/v2-periphery/` → `lib/v2-periphery/`
- `@uniswap/v3-periphery/` → `lib/v3-periphery/`
- `forge-std/` → `lib/forge-std/src/`

**TypeScript Import Order:**
1. Node.js built-in modules (`node:events`)
2. External packages (`ethers`)
3. Internal modules (relative paths)

**TypeScript Import style:** Named imports:
```typescript
import { ethers } from "ethers";
import { EventEmitter } from "node:events";
import type { PoolSnapshot, PriceDelta } from "../types.js";
```

**TypeScript Path Aliases:** None configured. Use relative paths.

## Error Handling

**Solidity - Custom Errors (mandatory):**
```solidity
// Define in interface
error ExecutionLoss(uint256 balanceBefore, uint256 balanceAfter);
error ProfitBelowMinimum(uint256 actualProfit, uint256 minProfit);
error ZeroAddress();

// Use in contracts - inline revert for simple checks
if (_aavePool == address(0)) revert ZeroAddress();

// Use vm.expectRevert in tests
vm.expectRevert(IFlashloanExecutor.NotAuthorized.selector);
vm.expectRevert(abi.encodeWithSelector(IProfitValidator.ExecutionLoss.selector, before, after));
```

Never use `require()` with string messages. Always use custom errors.

**Solidity - Event-before-revert pattern (ProfitValidator):**
```solidity
// Emit event for off-chain tracking, then revert
emit ProfitValidationFailed(token, balanceBefore, balanceAfter);
revert ExecutionLoss(balanceBefore, balanceAfter);
```
Reference: `contracts/src/safety/ProfitValidator.sol`

**TypeScript - Error coercion helper:**
```typescript
function toError(err: unknown): Error {
    return err instanceof Error ? err : new Error(String(err));
}
```
Reference: `bot/src/index.ts`

**TypeScript - Custom error classes with fields:**
```typescript
class ConfigError extends Error {
    constructor(public readonly field: string, message: string) {
        super(message);
        this.name = "ConfigError";
    }
}
```
Reference: `bot/src/config/validate.ts`

## NatSpec Documentation (Solidity)

**All public contracts, interfaces, and functions require NatSpec:**

```solidity
/// @title FlashloanExecutor
/// @notice Executes multi-step flash loan arbitrage through approved DEX adapters
/// @dev Inherits Aave V3 flash loan callback. Only the bot wallet or owner can trigger execution.
///      Uses SafeERC20 for all token operations and cleans up allowances after each swap.
contract FlashloanExecutor is FlashloanReceiver, IFlashloanExecutor {

    /// @notice Execute a flash loan arbitrage with the given swap steps
    /// @param pool The Aave pool to flash loan from
    /// @param token The token to borrow
    /// @param amount The amount to borrow
    /// @param steps The swap steps to execute
    function executeArbitrage(
        address pool,
        address token,
        uint256 amount,
        SwapStep[] calldata steps
    ) external onlyAuthorized whenNotPaused nonReentrant {
```

**Tags used:**
- `@title` - Contract title (one per contract)
- `@notice` - User-facing description
- `@dev` - Developer-facing technical notes
- `@param` - Parameter description
- `@return` - Return value description
- `@inheritdoc` - Used in concrete contracts implementing interfaces

## TypeScript Documentation

**JSDoc on public class methods:**
```typescript
/**
 * Build an executeArbitrage transaction for the FlashloanExecutor contract.
 * @param opportunity - The detected arbitrage opportunity
 * @returns Populated transaction request ready for signing
 */
buildTransaction(opportunity: ArbitrageOpportunity): TransactionRequest {
```

Reference: `bot/src/builder/TransactionBuilder.ts`

## Logging

**Solidity:** Events serve as the logging mechanism. Emit events for all state changes:
```solidity
emit ArbitrageExecuted(token, profit);
emit AdapterRegistered(adapter);
emit FailureRecorded(consecutiveFailures);
```

**TypeScript:** `console.log` / `console.error` with structured messages:
```typescript
console.log(`[FlashloanBot] Starting with ${config.pools.length} pools`);
console.error(`[FlashloanBot] Fatal error: ${toError(err).message}`);
```
Prefix log messages with `[ClassName]` for grep-ability.

## Solidity Security Patterns

**Always follow these patterns:**

1. **SafeERC20 for all token operations:**
   ```solidity
   using SafeERC20 for IERC20;
   token.safeTransfer(recipient, amount);
   token.forceApprove(spender, amount);
   ```

2. **Allowance cleanup after swaps:**
   ```solidity
   IERC20(step.tokenIn).forceApprove(step.adapter, step.amountIn);
   // ... execute swap ...
   IERC20(step.tokenIn).forceApprove(step.adapter, 0); // cleanup
   ```
   Reference: `contracts/src/FlashloanExecutor.sol` lines in `_executeSwaps()`

3. **ReentrancyGuard on all external state-changing functions:**
   ```solidity
   function executeArbitrage(...) external nonReentrant { ... }
   function withdrawToken(...) external nonReentrant { ... }
   ```

4. **Flash loan active flag:**
   ```solidity
   bool private _flashLoanActive;
   // Set true before flash loan, false after. Callback checks it.
   ```
   Reference: `contracts/src/FlashloanReceiver.sol`

5. **Zero-address validation in constructors:**
   ```solidity
   if (_aavePool == address(0)) revert ZeroAddress();
   ```

6. **Modifier stacking order:** `onlyAuthorized` → `whenNotPaused` → `nonReentrant`

## Gas Optimization Patterns

**Unchecked loop increment:**
```solidity
for (uint256 i = 0; i < steps.length;) {
    // ... loop body ...
    unchecked { ++i; }
}
```
Use `++i` not `i++` inside `unchecked` blocks.

**Immutable for addresses set once:**
```solidity
address public immutable aavePool;
address public immutable balancerVault;
```

## TypeScript Architecture Patterns

**EventEmitter-based module communication:**
```typescript
class OpportunityDetector extends EventEmitter {
    // Emits "opportunity" events when arbitrage found
    private analyzeDelta(delta: PriceDelta): void {
        if (profit > threshold) {
            this.emit("opportunity", opportunity);
        }
    }
}
```
Reference: `bot/src/detector/OpportunityDetector.ts`, `bot/src/monitor/PriceMonitor.ts`

**Static factory method for environment config:**
```typescript
class FlashloanBot {
    static fromEnv(): FlashloanBot {
        const config = buildConfig();
        return new FlashloanBot(config);
    }
}
```
Reference: `bot/src/index.ts`

**Interface-first with separate types files:**
- `bot/src/detector/types.ts`
- `bot/src/monitor/types.ts`
- `bot/src/builder/types.ts`
- `bot/src/config/types.ts`

## Module Design

**Solidity Exports:**
- One primary contract per file
- Interfaces in separate files under `contracts/src/interfaces/`
- No barrel files; import directly from the contract file

**TypeScript Exports:**
- Named exports only, no default exports
- Type-only exports for interfaces: `export type { ArbitrageOpportunity }`
- Barrel files (`index.ts`) used in `bot/__tests__/helpers/` and `bot/__tests__/mocks/`

## Git Commit Conventions

**Conventional commits format:**
```
feat: add bot entry point, eth_call simulation, fuzz/invariant tests
fix: correct profit calculation overflow
chore(deps): bump crytic/slither-action from 0.4.0 to 0.4.2
docs(plan): update session handoff notes
test: add formal verification for ProfitValidator
```

**Prefixes used:**
- `feat:` - New feature
- `fix:` - Bug fix
- `chore:` / `chore(deps):` - Maintenance, dependency updates
- `docs:` / `docs(plan):` - Documentation changes
- `test:` - Test additions/changes

---

*Convention analysis: 2026-02-16*
