# External Integrations

**Analysis Date:** 2026-02-16

## Blockchain Protocols

### Aave V3 (Flash Loan Provider)

**Purpose:** Primary flash loan source for borrowing tokens to execute arbitrage.

**On-chain integration:**
- Callback: `executeOperation()` in `contracts/src/FlashloanReceiver.sol`
- Request: `flashLoanSimple()` called via low-level `pool.call()` in `contracts/src/FlashloanExecutor.sol` (lines 142-169)
- Auth: `msg.sender` validated against immutable `aavePool` address
- Fee: 0.05% (5 bps) per flash loan, repaid by approving the Pool to pull back loan + premium
- Referral code: 0 (no referral)

**Off-chain integration:**
- Fee rate hardcoded in `bot/src/detector/OpportunityDetector.ts` as `aaveV3: 0.0005`
- Provider address resolved via `TransactionBuilderConfig.flashLoanProviders.aave_v3` in `bot/src/builder/TransactionBuilder.ts`

**Environment variables:**
- `AAVE_V3_POOL` - Aave V3 Pool contract address (required for deployment)

### Balancer (Flash Loan Provider)

**Purpose:** Alternative flash loan source with zero fees.

**On-chain integration:**
- Callback: `receiveFlashLoan()` in `contracts/src/FlashloanReceiver.sol` (lines 112-130)
- Auth: `msg.sender` validated against immutable `balancerVault` address
- Fee: 0% (zero-fee flash loans)
- Repayment: Direct `safeTransfer` of tokens back to the Vault

**Off-chain integration:**
- Fee rate hardcoded as `balancer: 0` in `bot/src/detector/OpportunityDetector.ts`
- Provider address resolved via `TransactionBuilderConfig.flashLoanProviders.balancer` in `bot/src/builder/types.ts`

**Environment variables:**
- `BALANCER_VAULT` - Balancer Vault contract address (required for deployment)

### Uniswap V2 (DEX - Swap Execution)

**Purpose:** Token swaps via Uniswap V2 Router (and compatible forks like SushiSwap).

**On-chain integration:**
- Adapter: `contracts/src/adapters/UniswapV2Adapter.sol`
- Router interface: `IUniswapV2Router02` (defined inline)
- Functions used: `swapExactTokensForTokens()`, `getAmountsOut()`, `factory()`
- Deadline: `block.timestamp + 300` (5 minutes)
- Multi-hop: Supported via `extraData` encoding `address[]` intermediate tokens

**Off-chain integration:**
- Price monitoring: `PriceMonitor` reads V2 pair reserves via `getReserves()` ABI in `bot/src/monitor/PriceMonitor.ts` (line 18-20)
- Price calculation: `reserve1/reserve0` with decimal normalization
- DEX protocol identifier: `"uniswap_v2"` in `bot/src/monitor/types.ts`
- Extra data encoding: Empty bytes `"0x"` for direct swaps in `bot/src/builder/TransactionBuilder.ts`

**Environment variables:**
- `UNISWAP_V2_ROUTER` - Uniswap V2 Router02 address (required for deployment)

### Uniswap V3 (DEX - Swap Execution)

**Purpose:** Token swaps via Uniswap V3 with concentrated liquidity and fee tiers.

**On-chain integration:**
- Adapter: `contracts/src/adapters/UniswapV3Adapter.sol`
- Router interface: `ISwapRouter` (defined inline) - `exactInputSingle()` and `exactInput()`
- Quoter interface: `IQuoterV2` (defined inline) - `quoteExactInputSingle()` and `quoteExactInput()`
- Fee tiers: 500 (0.05%), 3000 (0.3%), 10000 (1%)
- Path encoding: Packed `tokenIn + fee + intermediate + fee + tokenOut` for multi-hop
- Deadline: `block.timestamp + 300` (5 minutes)

**Off-chain integration:**
- Price monitoring: `PriceMonitor` reads V3 pool `slot0()` for `sqrtPriceX96` in `bot/src/monitor/PriceMonitor.ts` (line 22-24)
- Price calculation: `(sqrtPriceX96 / 2^96)^2 * 10^(d0 - d1)`
- DEX protocol identifier: `"uniswap_v3"` in `bot/src/monitor/types.ts`
- Extra data encoding: `abi.encode(uint24 feeTier)` for single-hop in `bot/src/builder/TransactionBuilder.ts`

**Environment variables:**
- `UNISWAP_V3_ROUTER` - Uniswap V3 SwapRouter address (required for deployment)
- `UNISWAP_V3_QUOTER` - Uniswap V3 QuoterV2 address (required for deployment)

### SushiSwap (DEX - Price Monitoring)

**Purpose:** SushiSwap pools monitored for cross-DEX arbitrage opportunities.

**Integration:**
- Uses the same V2 pair ABI (`getReserves()`) as Uniswap V2 for price fetching
- DEX protocol identifier: `"sushiswap"` in `bot/src/monitor/types.ts`
- Routed through `UniswapV2Adapter` on-chain (SushiSwap is a Uniswap V2 fork)
- Pools configured in `bot/src/config/pools.ts`

### Uniswap V3 Flash Loans (Flash Loan Provider - Callback Only)

**Purpose:** Receives flash loans from Uniswap V3 pools.

**On-chain integration:**
- Callback: `uniswapV3FlashCallback()` in `contracts/src/FlashloanReceiver.sol` (lines 133-137)
- Auth: Guarded by `_flashLoanActive` flag (no `msg.sender` check, since any V3 pool can call)
- Not actively initiated by `FlashloanExecutor` (Aave V3 is the primary provider)

### dYdX (Flash Loan Provider - Callback Only)

**Purpose:** Receives flash loans from dYdX SoloMargin (zero-fee).

**On-chain integration:**
- Callback: `callFunction()` in `contracts/src/FlashloanReceiver.sol` (lines 140-149)
- Auth: Guarded by `_flashLoanActive` flag
- Fee: 0% (zero-fee, must repay exact amount)
- Not actively initiated by `FlashloanExecutor` (Aave V3 is the primary provider)

**Off-chain integration:**
- Fee rate hardcoded as `dydx: 0` in `bot/src/detector/OpportunityDetector.ts`

## External Services

### Flashbots Relay (MEV Protection)

**Purpose:** Submit transactions as private bundles to avoid the public mempool and protect against sandwich/front-running attacks.

**Integration:**
- Implementation: `bot/src/mev/FlashbotsSigner.ts`
- Default relay URL: `https://relay.flashbots.net`
- Auth: `X-Flashbots-Signature` header using a dedicated auth key (not the bot wallet key)
- JSON-RPC methods: `eth_sendBundle`, `eth_callBundle`
- Bundle simulation: Optional pre-submission via `eth_callBundle`
- Inclusion strategy: Resubmit bundles for up to 5 consecutive blocks
- Polling interval: 1s for block-by-block inclusion checks
- Implements `ExecutionSigner` interface as a drop-in replacement for standard wallet

**Environment variables:**
- `FLASHBOTS_AUTH_KEY` - Private key hex for relay authentication (separate from bot wallet)

**Config type:** `FlashbotsConfig` in `bot/src/mev/types.ts`

### MEV Blocker RPC (MEV Protection - Alternative)

**Purpose:** Simpler MEV protection by routing transactions through a private RPC endpoint.

**Integration:**
- Implementation: `bot/src/mev/MEVBlockerSigner.ts`
- Default RPC: `https://rpc.mevblocker.io`
- No auth key required (uses standard `eth_sendRawTransaction`)
- Receipt polling via `eth_getTransactionReceipt` at 2s intervals
- Implements `ExecutionSigner` interface as a drop-in replacement

**Config type:** `MEVBlockerConfig` in `bot/src/mev/types.ts`

### JSON-RPC Provider (Blockchain Access)

**Purpose:** Read chain state (prices, block numbers) and submit transactions.

**Integration:**
- Client: `ethers.JsonRpcProvider` instantiated in `bot/src/index.ts` (line 57)
- Used by: `PriceMonitor` for pool reads, `ExecutionEngine` for tx submission
- Optional WebSocket URL for real-time events (configured but not yet implemented)
- Contract reads: `getReserves()` for V2, `slot0()` for V3, `getBlockNumber()`
- Transaction simulation: `eth_call` via signer's `call()` method

**Environment variables:**
- `RPC_URL` or `MAINNET_RPC_URL` - Primary JSON-RPC HTTP endpoint (required)
- `WS_URL` - WebSocket endpoint (optional)
- `CHAIN_ID` - Network chain ID, defaults to 1 (mainnet)

**RPC endpoints in `foundry.toml`:**
- `MAINNET_RPC_URL` - Ethereum mainnet
- `SEPOLIA_RPC_URL` - Sepolia testnet
- `ARBITRUM_RPC_URL` - Arbitrum One
- `BASE_RPC_URL` - Base

### Etherscan (Contract Verification)

**Purpose:** Verify deployed contract source code on block explorers.

**Integration:**
- Used via `forge script ... --verify` flag in deployment workflows
- Verification command: `forge verify-contract <ADDRESS> <CONTRACT> --chain <name>`

**Environment variables:**
- `ETHERSCAN_API_KEY` - API key for contract verification (CI secret)

## Data Storage

**Databases:**
- None. No traditional database is used. All state is on-chain or in-memory.

**File Storage:**
- Deployment artifacts: `broadcast/` and `deployments/` directories
- Deployment JSON export: `deployments/{chainId}.json` (generated by `contracts/script/Deploy.s.sol`)
- Pool configuration: `bot/config/sepolia-pools.json` (loaded by `bot/src/run-testnet.ts`)

**Caching:**
- In-memory only. `PriceMonitor` stores snapshots in a `Map<string, PriceSnapshot>`.
- `ExecutionEngine` tracks transactions in a `Map<string, TrackedTransaction>`.

## APIs & Interfaces

### Contract ABIs Used by Bot

**FlashloanExecutor:**
- `executeArbitrage(address, address, uint256, SwapStep[])` - ABI-encoded in `bot/src/builder/TransactionBuilder.ts`
- Events: `ArbitrageExecuted`, `ProfitWithdrawn` - parsed in `bot/src/engine/ExecutionEngine.ts`
- Errors: `InsufficientProfit`, `AdapterNotApproved`, `EmptySwapSteps`, `NotAuthorized`, `ContractPaused`, `ZeroAddress`, `ZeroAmount`

**Uniswap V2 Pair (read-only):**
- `getReserves() view returns (uint112, uint112, uint32)` - used in `bot/src/monitor/PriceMonitor.ts`

**Uniswap V3 Pool (read-only):**
- `slot0() view returns (uint160, int24, uint16, uint16, uint16, uint8, bool)` - used in `bot/src/monitor/PriceMonitor.ts`

### JSON-RPC Methods Used

**Standard:**
- `eth_getBlockNumber` - Current block number
- `eth_call` - Transaction simulation (free, no gas)
- `eth_sendTransaction` - Standard transaction submission
- `eth_sendRawTransaction` - Raw signed transaction submission (MEV Blocker)
- `eth_getTransactionReceipt` - Receipt polling (MEV Blocker)

**Flashbots-specific:**
- `eth_sendBundle` - Submit a transaction bundle to the relay
- `eth_callBundle` - Simulate a bundle (free)

### EIP Standards

- **EIP-1559** - All transactions use `maxFeePerGas` and `maxPriorityFeePerGas` (type 2)
- **ERC-20** - Token interactions via `IERC20`, `SafeERC20`

## Data Sources

### Price Feeds

**On-chain pool reads (primary):**
- Uniswap V2 pairs: `getReserves()` for reserve-based pricing
- Uniswap V3 pools: `slot0()` for `sqrtPriceX96`-based pricing
- SushiSwap pairs: Same V2 interface as Uniswap V2
- Polling interval: 12s (mainnet, ~1 block), 5s (Sepolia)

**Configured mainnet pools (in `bot/src/config/pools.ts`):**
- WETH/USDC: UniV2, UniV3 0.3%, UniV3 0.05%, SushiSwap
- WETH/USDT: UniV2, UniV3 0.3%, SushiSwap
- WETH/DAI: UniV2, UniV3 0.3%, SushiSwap
- WETH/WBTC: UniV2, UniV3 0.3%, SushiSwap

**Tokens tracked:**
- Mainnet: WETH, USDC, USDT, DAI, WBTC (addresses in `bot/src/config/defaults.ts`)
- Sepolia: WETH, USDC, USDC_CIRCLE (addresses in `bot/src/config/defaults.ts`)

### Gas Estimation

- Gas per swap step: 150,000 gas (configurable, default in `bot/src/config/defaults.ts`)
- Base transaction gas: 21,000
- Gas price: Configurable via `GAS_PRICE_GWEI` env var, default 30 gwei
- EIP-1559 strategy: `maxFeePerGas = 2 * baseFee + priorityFee` in `bot/src/builder/TransactionBuilder.ts`

## Integration Patterns

### Contract Call Pattern (On-chain)

Contracts use low-level calls with error bubbling for cross-protocol interactions:

```solidity
// contracts/src/FlashloanExecutor.sol (lines 149-169)
(bool success, bytes memory returnData) = pool.call(
    abi.encodeWithSignature(
        "flashLoanSimple(address,address,uint256,bytes,uint16)",
        address(this), asset, amount, params, uint16(0)
    )
);
if (!success) {
    if (returnData.length > 0) {
        assembly { revert(add(returnData, 32), mload(returnData)) }
    }
    revert("FlashLoan request failed");
}
```

### DEX Adapter Pattern (On-chain)

All DEX interactions go through the `IDEXAdapter` interface (`contracts/src/interfaces/IDEXAdapter.sol`):
1. Executor validates adapter is approved
2. Executor approves adapter to spend tokens via `safeIncreaseAllowance`
3. Adapter pulls tokens from executor, swaps, sends output back
4. Executor clears residual allowance via `forceApprove(adapter, 0)`

### Price Monitoring Pattern (Off-chain)

```typescript
// bot/src/monitor/PriceMonitor.ts
// Polling loop: fetch all pools in parallel, detect cross-DEX deltas
await Promise.all(this.config.pools.map(async (pool) => {
    const snapshot = await this.fetchPrice(pool);
    this.snapshots.set(key, snapshot);
    this.emit("priceUpdate", snapshot);
}));
this.detectOpportunities(); // compare prices across DEXes for same pair
```

### Transaction Submission Pattern (Off-chain)

```
Opportunity detected
  -> TransactionBuilder.buildArbitrageTransaction() (ABI encode)
  -> TransactionBuilder.calculateGasSettings() (EIP-1559)
  -> TransactionBuilder.prepareTransaction() (add gas + nonce)
  -> ExecutionEngine.simulateTransaction() (eth_call pre-flight)
  -> ExecutionEngine.executeTransaction() (submit via signer)
  -> signer.sendTransaction() (standard, Flashbots, or MEV Blocker)
```

### MEV Protection Pattern (Off-chain)

Three modes available, all implementing `ExecutionSigner` interface:
1. **None** - Standard `eth_sendTransaction` via public mempool
2. **Flashbots** (`bot/src/mev/FlashbotsSigner.ts`) - Bundle submission to relay
3. **MEV Blocker** (`bot/src/mev/MEVBlockerSigner.ts`) - Private RPC endpoint

Selection configured via `MEVProtectionConfig.mode` in `bot/src/mev/types.ts`.

### Error Handling Pattern (Off-chain)

- All modules extend `EventEmitter` and emit `"error"` events
- `ExecutionEngine` parses custom Solidity errors via `ethers.Interface.parseError()`
- Circuit breaker: Consecutive failures trigger auto-pause in both `ExecutionEngine` (off-chain) and `CircuitBreaker` contract (on-chain)
- Stale pool detection: `PriceMonitor` marks pools as stale after `maxRetries` consecutive failures

## Webhooks & Callbacks

**Incoming (on-chain callbacks):**
- `executeOperation()` - Called by Aave V3 Pool during flash loan
- `receiveFlashLoan()` - Called by Balancer Vault during flash loan
- `uniswapV3FlashCallback()` - Called by Uniswap V3 Pool during flash
- `callFunction()` - Called by dYdX SoloMargin during flash loan

**Outgoing:**
- None. The bot does not expose HTTP endpoints or send webhooks.

## Environment Configuration

**Required env vars (bot runtime):**
- `RPC_URL` or `MAINNET_RPC_URL` - JSON-RPC endpoint

**Required env vars (deployment):**
- `DEPLOYER_PRIVATE_KEY` - Deployer wallet private key
- `BOT_WALLET_ADDRESS` - Authorized bot wallet address
- `AAVE_V3_POOL` - Aave V3 Pool address
- `BALANCER_VAULT` - Balancer Vault address
- `UNISWAP_V2_ROUTER` - Uniswap V2 Router02 address
- `UNISWAP_V3_ROUTER` - Uniswap V3 SwapRouter address
- `UNISWAP_V3_QUOTER` - Uniswap V3 QuoterV2 address

**Optional env vars:**
- `WS_URL` - WebSocket endpoint
- `CHAIN_ID` - Network chain ID (default: 1)
- `LOG_LEVEL` - debug|info|warn|error (default: info)
- `DRY_RUN` - Set to "false" to enable live execution (default: true)
- `MIN_PROFIT_THRESHOLD` - Minimum net profit in ETH
- `GAS_PRICE_GWEI` - Gas price override
- `POLL_INTERVAL_MS` - Price polling interval
- `FLASHBOTS_AUTH_KEY` - Flashbots relay auth key
- `MIN_PROFIT_WEI` - On-chain minimum profit (default: 0.01 ETH)
- `MAX_GAS_PRICE` - Circuit breaker max gas price (default: 100 gwei)
- `MAX_TRADE_SIZE` - Circuit breaker max trade size (default: 1000 ETH)
- `FAILURE_THRESHOLD` - Consecutive failures before auto-pause (default: 5)

**CI secrets:**
- `SEPOLIA_RPC_URL` - Sepolia testnet RPC
- `MAINNET_RPC_URL` - Mainnet RPC
- `DEPLOYER_PRIVATE_KEY` - Deployment key
- `ETHERSCAN_API_KEY` - Contract verification
- `GITLEAKS_LICENSE` - Gitleaks CI license

---

*Integration audit: 2026-02-16*
