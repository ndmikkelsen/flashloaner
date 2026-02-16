# Architecture

**Analysis Date:** 2026-02-16

## Pattern Overview

**Overall:** Two-layer event-driven architecture with on-chain atomic execution and off-chain opportunity detection.

**Key Characteristics:**
- On-chain layer (Solidity/Foundry) handles atomic flash loan borrowing, multi-hop DEX swaps, and profit validation -- all in a single transaction that reverts if unprofitable
- Off-chain layer (TypeScript/ethers.js v6) polls DEX pools for price discrepancies, estimates profitability, builds encoded calldata, and submits transactions via MEV-protected channels
- Interface-first design -- all on-chain interactions defined through Solidity interfaces (`IDEXAdapter`, `IFlashloanExecutor`, `IFlashloanReceiver`, `ICircuitBreaker`, `IProfitValidator`), enabling swappable adapter implementations
- Event-driven communication between off-chain modules via Node.js `EventEmitter` pattern

## Layers

**On-Chain Layer (Solidity):**
- Purpose: Atomic flash loan execution and DEX swap routing
- Location: `contracts/src/`
- Contains: Smart contracts, interfaces, adapters, safety modules
- Depends on: OpenZeppelin (Ownable, ReentrancyGuard, SafeERC20), forge-std
- Used by: Off-chain bot via ethers.js ABI encoding

**Off-Chain Layer (TypeScript):**
- Purpose: Opportunity detection, transaction building, execution monitoring
- Location: `bot/src/`
- Contains: Price monitoring, arbitrage detection, calldata encoding, MEV protection, health monitoring
- Depends on: ethers.js v6, dotenv
- Used by: CLI entry points (`bot/src/index.ts`, `bot/src/run-testnet.ts`)

## On-Chain Component Architecture

### Inheritance Hierarchy

```
Ownable (OpenZeppelin)
  |
ReentrancyGuard (OpenZeppelin)
  |
FlashloanReceiver (abstract, contracts/src/FlashloanReceiver.sol)
  |
FlashloanExecutor (concrete, contracts/src/FlashloanExecutor.sol)
  |
  +--- uses IDEXAdapter (contracts/src/interfaces/IDEXAdapter.sol)
  |      |--- UniswapV2Adapter (contracts/src/adapters/UniswapV2Adapter.sol)
  |      |--- UniswapV3Adapter (contracts/src/adapters/UniswapV3Adapter.sol)
  |
  +--- companion: CircuitBreaker (contracts/src/safety/CircuitBreaker.sol)
  +--- companion: ProfitValidator (contracts/src/safety/ProfitValidator.sol)
```

### FlashloanReceiver (`contracts/src/FlashloanReceiver.sol`)

Abstract base contract implementing flash loan callbacks for four providers:

| Callback | Provider | Validation |
|----------|----------|------------|
| `executeOperation()` | Aave V3 | `msg.sender == aavePool` and `initiator == address(this)` |
| `receiveFlashLoan()` | Balancer | `msg.sender == balancerVault` |
| `uniswapV3FlashCallback()` | Uniswap V3 | `_flashLoanActive` flag check |
| `callFunction()` | dYdX | `_flashLoanActive` flag check |

All callbacks are protected by `nonReentrant` modifier and delegate to abstract `_executeArbitrage(bytes calldata params)`.

Constructor takes `aavePool` and `balancerVault` as immutable addresses, plus `owner`. Provides emergency withdrawal functions (`emergencyWithdrawToken`, `emergencyWithdrawETH`).

### FlashloanExecutor (`contracts/src/FlashloanExecutor.sol`)

Main contract implementing `IFlashloanExecutor`. Orchestrates the full arbitrage flow.

**State:**
- `botWallet` (address): Authorized execution wallet (not owner)
- `minProfit` (uint256): Minimum profit threshold in token units
- `approvedAdapters` (mapping): Whitelist of registered DEX adapter addresses
- `paused` (bool): Execution pause flag
- `_pendingSteps` (SwapStep[]): Temporary storage for swap steps during callback
- `_pendingToken` (address): Temporary storage for flash loan token address

**Key flow -- `executeArbitrage()`:**
1. Caller must be `owner` or `botWallet` (`onlyAuthorized` modifier)
2. Contract must not be paused (`whenNotPaused` modifier)
3. Validates all adapters in steps are approved
4. Copies steps to temporary contract storage (`_pendingSteps`, `_pendingToken`)
5. Sets `_flashLoanActive = true`
6. Calls `_requestAaveFlashLoan()` which does a low-level `call` to `pool.flashLoanSimple()`
7. Aave calls back `executeOperation()` on the receiver
8. `_executeArbitrage()` executes each `SwapStep` sequentially via `IDEXAdapter.swap()`
9. Validates `balanceAfter > balanceBefore + minProfit`, reverts if not
10. Sets `_flashLoanActive = false`

**Admin functions:** `registerAdapter`, `removeAdapter`, `setBotWallet`, `setMinProfit`, `pause/unpause`, `withdrawToken`, `withdrawETH` -- all `onlyOwner`.

### DEX Adapters

All adapters implement `IDEXAdapter` (`contracts/src/interfaces/IDEXAdapter.sol`):

```solidity
interface IDEXAdapter {
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin, bytes calldata extraData) external returns (uint256 amountOut);
    function getAmountOut(address tokenIn, address tokenOut, uint256 amountIn, bytes calldata extraData) external view returns (uint256 amountOut);
}
```

**UniswapV2Adapter** (`contracts/src/adapters/UniswapV2Adapter.sol`):
- Uses `IUniswapV2Router02.swapExactTokensForTokens()`
- `extraData`: Empty for direct swap, or `abi.encode(address[])` of intermediate tokens for multi-hop
- Deadline: `block.timestamp + 300` (5 minutes)
- Pulls tokens from caller via `safeTransferFrom`, sends output directly to caller

**UniswapV3Adapter** (`contracts/src/adapters/UniswapV3Adapter.sol`):
- Uses `ISwapRouter.exactInputSingle()` for single-hop, `ISwapRouter.exactInput()` for multi-hop
- Uses `IQuoterV2` for off-chain quotes via `staticcall`
- `extraData` encoding:
  - Single-hop (32 bytes): `abi.encode(uint24 fee)` -- e.g., 3000 for 0.3% tier
  - Multi-hop (>32 bytes): `abi.encode(uint24[] fees, address[] intermediates)` where `fees.length == intermediates.length + 1`

### Safety Contracts

**CircuitBreaker** (`contracts/src/safety/CircuitBreaker.sol`):
- Enforces: max gas price, max trade size, auto-pause on N consecutive failures
- `isWithinLimits(gasPrice, amount)` -- view check
- `enforceLimits(gasPrice, amount)` -- reverts with descriptive errors
- `recordFailure()` / `recordSuccess()` -- tracks consecutive failures, auto-pauses at threshold
- `authorizedCallers` mapping -- who can record failure/success
- Note: Currently deployed as a standalone companion contract, not directly integrated into `FlashloanExecutor.executeArbitrage()` flow

**ProfitValidator** (`contracts/src/safety/ProfitValidator.sol`):
- Stateless -- validates `balanceAfter - balanceBefore >= minProfit`
- Emits `ProfitValidated` or `InsufficientProfit` events
- Reverts with `ExecutionLoss` or `ProfitBelowMinimum` custom errors
- Note: Currently deployed standalone. The `FlashloanExecutor` performs inline profit validation in `_executeArbitrage()` rather than calling this contract

## Off-Chain Component Architecture

### Module Pipeline

```
FlashloanBot (bot/src/index.ts)
  |
  +--- PriceMonitor (bot/src/monitor/PriceMonitor.ts)
  |      Polls DEX pools on interval
  |      Emits: priceUpdate, opportunity, error, stale
  |
  +--- OpportunityDetector (bot/src/detector/OpportunityDetector.ts)
  |      Listens to PriceMonitor.opportunity events
  |      Analyzes profitability (gross - gas - flash fee - slippage)
  |      Emits: opportunityFound, opportunityRejected, error
  |
  +--- TransactionBuilder (bot/src/builder/TransactionBuilder.ts)
  |      Encodes ArbitrageOpportunity into ABI calldata for FlashloanExecutor
  |      Handles EIP-1559 gas calculation, adapter resolution, nonce
  |
  +--- ExecutionEngine (bot/src/engine/ExecutionEngine.ts)
  |      Pre-flight simulation via eth_call
  |      Submits via signer (standard, Flashbots, or MEV Blocker)
  |      Waits for confirmation, parses revert reasons
  |      Circuit breaker: auto-pauses after N consecutive failures
  |      Profit tracking from ArbitrageExecuted event logs
  |      Emits: submitted, confirmed, reverted, failed, paused, profit
  |
  +--- HealthMonitor (bot/src/health/HealthMonitor.ts)
  |      Balance monitoring with thresholds
  |      Rolling-window error rate tracking
  |      P&L tracking per token
  |      Periodic heartbeat
  |      Emits: lowBalance, highErrorRate, pnlUpdate, heartbeat, alert
  |
  +--- MEV Protection (bot/src/mev/)
         createMEVProtectedSigner() factory
         FlashbotsSigner: bundle submission via Flashbots relay
         MEVBlockerSigner: private RPC via rpc.mevblocker.io
```

### FlashloanBot (`bot/src/index.ts`)

Main orchestrator class that wires all modules together.

- `FlashloanBot.fromEnv()`: Factory that parses env vars via `parseEnv()`, builds config via `buildConfig()`, instantiates bot
- `start()`: Attaches detector to monitor, starts polling loop, registers SIGINT/SIGTERM handlers
- `stop()`: Stops monitor, detaches detector, prints scan summary
- `wireEvents()`: Connects all inter-module event listeners for logging and stats

Current state: Only the monitor-detector pipeline is wired in the main loop. TransactionBuilder and ExecutionEngine exist as standalone modules not yet integrated into the main `start()` flow.

### PriceMonitor (`bot/src/monitor/PriceMonitor.ts`)

- Extends `EventEmitter`
- Polls all configured pools in parallel using `Promise.all`
- Reads on-chain data: V2 `getReserves()`, V3 `slot0()` via minimal ABI fragments
- Calculates normalized prices: V2 from reserves ratio, V3 from `sqrtPriceX96`
- Groups pools by token pair, compares prices, emits `opportunity` when delta exceeds threshold
- Tracks consecutive errors per pool, marks pool as `stale` after `maxRetries` failures
- Config: `deltaThresholdPercent` (default: 0.3%), `pollIntervalMs` (default: 12000ms), `maxRetries` (default: 3)

### OpportunityDetector (`bot/src/detector/OpportunityDetector.ts`)

- Extends `EventEmitter`
- Attaches/detaches to PriceMonitor via `attach(monitor)` / `detach()`
- Listens for `opportunity` events (price deltas)
- `analyzeDelta()`: Builds a 2-step swap path (buy low / sell high), calculates gross profit, estimates costs, checks net profit against threshold
- Cost estimation: flash loan fee (cheapest provider), gas cost (`gasPerSwap * numSteps * gasPriceGwei`), compounded slippage
- Supports triangular arbitrage path building via `buildTriangularPath()` (3 snapshots)
- Config: `minProfitThreshold` (default: 0.01 ETH), `maxSlippage` (default: 0.5%), `defaultInputAmount` (default: 10 ETH)

### TransactionBuilder (`bot/src/builder/TransactionBuilder.ts`)

- Stateless -- no EventEmitter, pure function calls
- `buildArbitrageTransaction()`: Takes `ArbitrageOpportunity` + flash loan provider, returns `ArbitrageTransaction` with ABI-encoded calldata
- Resolves DEX protocols to deployed adapter addresses via `AdapterMap`
- Resolves flash loan providers to on-chain addresses
- Encodes `extraData` per adapter: V3 gets `abi.encode(uint24)` fee tier, V2/Sushi get `0x`
- First swap step gets flash loan amount as `amountIn`, subsequent steps get `0n` (use full balance)
- `calculateGasSettings()`: EIP-1559 strategy: `maxFeePerGas = 2 * baseFee + priorityFee`
- `prepareTransaction()`: Adds gas settings + nonce to produce `PreparedTransaction`

### ExecutionEngine (`bot/src/engine/ExecutionEngine.ts`)

- Extends `EventEmitter`
- Accepts any `ExecutionSigner` interface (standard wallet, FlashbotsSigner, MEVBlockerSigner)
- `simulateTransaction()`: Pre-flight via `signer.call()` (eth_call), free check for revert
- `executeTransaction()`: Simulates, submits, waits for confirmation, parses result
- Parses revert reasons from FlashloanExecutor custom errors (`InsufficientProfit`, `AdapterNotApproved`, etc.)
- `buildSpeedUp()`: Creates replacement tx with `speedUpMultiplier` (default: 1.125x) higher gas
- `buildCancellation()`: Creates 0-value self-transfer at same nonce with higher gas
- Circuit breaker: Auto-pauses after `maxConsecutiveFailures` (default: 5), resets on success
- Dry-run mode: Returns synthetic confirmed result without submitting

### MEV Protection (`bot/src/mev/`)

Factory function `createMEVProtectedSigner()` wraps a base signer in one of:

**FlashbotsSigner** (`bot/src/mev/FlashbotsSigner.ts`):
- Signs raw tx, submits as single-tx bundle via `eth_sendBundle`
- Optionally simulates via `eth_callBundle` before sending
- Waits for inclusion by polling blocks, resubmits for subsequent blocks
- Auth: `X-Flashbots-Signature` header using separate auth key (not bot wallet key)
- Default relay: `https://relay.flashbots.net`

**MEVBlockerSigner** (`bot/src/mev/MEVBlockerSigner.ts`):
- Signs raw tx, submits via `eth_sendRawTransaction` to MEV Blocker RPC
- Polls `eth_getTransactionReceipt` for confirmation
- No auth key needed
- Default RPC: `https://rpc.mevblocker.io`

### HealthMonitor (`bot/src/health/HealthMonitor.ts`)

- Balance monitoring: `updateBalance(token, balance)`, alerts when below threshold
- P&L tracking: `recordProfit/recordLoss/recordGasCost()`, per-token and overall net P&L
- Error rate: Rolling window calculation, alerts when rate exceeds threshold
- Heartbeat: Periodic health status emission with uptime, error rate, P&L summary
- Alert types: `lowBalance`, `highErrorRate`, `pnlThreshold` with severity levels

## Data Flow

**Arbitrage Execution Flow (Full Pipeline):**

1. `PriceMonitor.poll()` reads reserves/slot0 from all configured pools via JSON-RPC
2. `PriceMonitor.detectOpportunities()` groups pools by token pair, finds max price delta
3. If delta exceeds threshold, `PriceMonitor` emits `opportunity` event with `PriceDelta`
4. `OpportunityDetector.analyzeDelta()` receives delta, builds swap path, estimates costs
5. If net profit exceeds threshold, emits `opportunityFound` with `ArbitrageOpportunity`
6. `TransactionBuilder.buildArbitrageTransaction()` encodes calldata for `FlashloanExecutor.executeArbitrage()`
7. `TransactionBuilder.prepareTransaction()` adds gas settings and nonce
8. `ExecutionEngine.simulateTransaction()` pre-flights via `eth_call`
9. `ExecutionEngine.executeTransaction()` submits via signer (Flashbots/MEV Blocker/standard)
10. On-chain: `FlashloanExecutor` borrows from Aave, executes swap steps through adapters, validates profit, repays loan
11. `ExecutionEngine` parses receipt, records profit from `ArbitrageExecuted` event
12. `HealthMonitor` tracks balance changes, P&L, error rates

**On-Chain Atomic Flow (within single transaction):**

```
External call: executeArbitrage(provider, token, amount, steps[])
  |
  +-- Validate: onlyAuthorized, whenNotPaused
  +-- Validate: all adapters approved
  +-- Store steps in _pendingSteps, token in _pendingToken
  +-- Set _flashLoanActive = true
  +-- Call pool.flashLoanSimple() on Aave
  |     |
  |     +-- Aave transfers loan amount to contract
  |     +-- Aave calls executeOperation() callback
  |           |
  |           +-- Verify msg.sender == aavePool, initiator == this
  |           +-- Call _executeArbitrage()
  |                 |
  |                 +-- Record balanceBefore
  |                 +-- For each SwapStep:
  |                 |     approve adapter, call adapter.swap()
  |                 |     clear residual allowance
  |                 +-- Record balanceAfter
  |                 +-- Revert if profit < minProfit
  |                 +-- Emit ArbitrageExecuted
  |                 +-- Clean up _pendingSteps, _pendingToken
  |           |
  |           +-- Approve Aave to pull back loan + premium
  |           +-- Return true
  |
  +-- Set _flashLoanActive = false
```

**State Management:**
- On-chain: Persistent state in `FlashloanExecutor` (adapters, botWallet, minProfit, paused). Temporary state in `_pendingSteps` / `_pendingToken` (set before flash loan, cleared after)
- Off-chain: In-memory state across all modules. `PriceMonitor` maintains price snapshot map. `ExecutionEngine` tracks pending transactions and profit history. `HealthMonitor` tracks balances, P&L, error rates. No persistent database -- all state is lost on restart.
- Configuration: Bot config from environment variables via `parseEnv()` / `buildConfig()`. Contract config from constructor params and admin functions. Pool definitions hardcoded in `bot/src/config/pools.ts` for mainnet, loaded from JSON for Sepolia.

## Key Abstractions

**SwapStep (on-chain):**
- Purpose: Describes a single DEX swap within a multi-hop arbitrage route
- Defined in: `contracts/src/interfaces/IFlashloanExecutor.sol`
- Fields: `adapter` (address), `tokenIn`, `tokenOut`, `amountIn` (0 = full balance), `extraData` (adapter-specific params)
- Pattern: Stored in contract storage before flash loan, consumed during callback

**SwapStep (off-chain):**
- Purpose: Higher-level swap description with DEX protocol ID and expected price
- Defined in: `bot/src/detector/types.ts`
- Fields: `dex` (DEXProtocol), `poolAddress`, `tokenIn`, `tokenOut`, `decimalsIn/Out`, `expectedPrice`, `feeTier?`
- Pattern: Built by OpportunityDetector, transformed to ContractSwapStep by TransactionBuilder

**ExecutionSigner (off-chain):**
- Purpose: Abstraction over transaction signing and submission strategies
- Defined in: `bot/src/engine/ExecutionEngine.ts`
- Interface: `sendTransaction(tx)`, `getNonce()`, `call?(tx)` (optional simulation)
- Implementations: Standard ethers.js Wallet, `FlashbotsSigner`, `MEVBlockerSigner`
- Pattern: Strategy pattern -- ExecutionEngine is unaware of MEV protection details

**IDEXAdapter (on-chain):**
- Purpose: Uniform interface for all DEX integrations
- Defined in: `contracts/src/interfaces/IDEXAdapter.sol`
- Interface: `swap()` (execute), `getAmountOut()` (quote)
- Implementations: `UniswapV2Adapter`, `UniswapV3Adapter`
- Pattern: Adapter pattern -- FlashloanExecutor delegates to registered adapters by address

## Entry Points

**Bot CLI (`bot/src/index.ts`):**
- Location: `bot/src/index.ts` (bottom of file, `main()` function)
- Triggers: `pnpm start`, `pnpm start:dry-run`, `pnpm dev`
- Responsibilities: Creates `FlashloanBot.fromEnv()`, calls `start()`, waits for SIGINT/SIGTERM

**Testnet Runner (`bot/src/run-testnet.ts`):**
- Location: `bot/src/run-testnet.ts`
- Triggers: `pnpm start:testnet`
- Responsibilities: Loads Sepolia pool config from JSON, enhanced logging, report-only mode

**Contract Deployment (`contracts/script/Deploy.s.sol`):**
- Location: `contracts/script/Deploy.s.sol`
- Triggers: `forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast`
- Responsibilities: Deploys all 5 contracts (CircuitBreaker, ProfitValidator, FlashloanExecutor, UniswapV2Adapter, UniswapV3Adapter), registers adapters, exports JSON to `deployments/`

**Deployment Verification (`contracts/script/Verify.s.sol`):**
- Location: `contracts/script/Verify.s.sol`
- Triggers: `forge script script/Verify.s.sol --rpc-url $RPC_URL`
- Responsibilities: Post-deployment checks -- verifies contract code exists, owner/botWallet correct, adapters registered, safety params set

## Error Handling

**On-Chain Strategy:** Custom errors (gas-efficient, typed) with atomic revert on any failure.

**On-Chain Patterns:**
- Custom errors throughout: `NotAuthorized()`, `InsufficientProfit(received, required)`, `AdapterNotApproved(adapter)`, `ZeroAddress()`, `ZeroAmount()`, `ContractPaused()`
- All state-changing external functions protected by `nonReentrant`
- Token operations use `SafeERC20` (safeTransfer, safeIncreaseAllowance, forceApprove)
- Residual allowances explicitly cleared after each adapter swap
- Flash loan callback validates `msg.sender` against known provider address or `_flashLoanActive` flag

**Off-Chain Strategy:** EventEmitter-based error propagation with module-level circuit breakers.

**Off-Chain Patterns:**
- Each module catches errors internally and emits `error` events
- `toError(unknown)` utility converts caught values to Error instances
- `ExecutionEngine` parses revert reasons from ethers.js error data, decodes FlashloanExecutor custom errors
- `ExecutionEngine` auto-pauses after `maxConsecutiveFailures` (default: 5), requires explicit `resume()` call
- `HealthMonitor` tracks rolling error rate, alerts when threshold exceeded
- `PriceMonitor` tracks consecutive fetch failures per pool, marks as stale after `maxRetries`

## Cross-Cutting Concerns

**Logging:** Console-based structured logging in `FlashloanBot` with level filtering (debug/info/warn/error). Testnet runner adds enhanced per-event logging. No external logging framework.

**Validation:** On-chain: constructor parameter validation, modifier-based access control, custom error reverts. Off-chain: `validateConfig()` in `bot/src/config/validate.ts` validates all BotConfig fields, throws `ConfigError` with field name. `parseEnv()` validates required env vars.

**Authentication:** On-chain: Two-tier access control in `FlashloanExecutor` -- `onlyOwner` for admin (register/remove adapters, set params, pause, withdraw) and `onlyAuthorized` (owner OR botWallet) for execution. `CircuitBreaker` has `authorizedCallers` mapping for recording success/failure. Off-chain: MEV auth via Flashbots `X-Flashbots-Signature` header using separate auth key.

**Configuration:** Layered approach: environment variables (`RPC_URL`, `CHAIN_ID`, `LOG_LEVEL`, etc.) parsed by `parseEnv()`, merged with defaults from `bot/src/config/defaults.ts`, overrideable via `buildConfig()` second parameter. Pool definitions in `bot/src/config/pools.ts` (mainnet) or loaded from JSON (`bot/config/sepolia-pools.json`). Contract addresses provided at deploy time via env vars (`AAVE_V3_POOL`, `UNISWAP_V2_ROUTER`, etc.).

---

*Architecture analysis: 2026-02-16*
