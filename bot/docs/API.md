# Bot API Reference

## FlashloanBot

Main orchestrator — initializes and coordinates all modules.

```typescript
import { FlashloanBot } from "./index.js";
```

### Constructor

```typescript
new FlashloanBot(config: BotConfig)
```

### Static Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `FlashloanBot.fromEnv(overrides?)` | `FlashloanBot` | Create from env vars + optional overrides |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `config` | `BotConfig` | Readonly config |
| `monitor` | `PriceMonitor` | Price monitoring module |
| `detector` | `OpportunityDetector` | Opportunity detection module |
| `status` | `BotStatus` | `idle\|starting\|running\|stopping\|stopped` |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `start()` | `Promise<void>` | Start all modules |
| `stop()` | `Promise<void>` | Graceful shutdown |

---

## PriceMonitor

Polls DEX pools and detects cross-DEX price differences.

```typescript
import { PriceMonitor } from "./monitor/PriceMonitor.js";
```

### Constructor

```typescript
new PriceMonitor(config: PriceMonitorConfig)
```

| Config Field | Type | Default | Description |
|-------------|------|---------|-------------|
| `provider` | `Provider` | required | ethers.js v6 provider |
| `pools` | `PoolConfig[]` | required | Pools to monitor |
| `deltaThresholdPercent` | `number` | `0.5` | Min delta (%) to emit |
| `pollIntervalMs` | `number` | `12000` | Poll interval (ms) |
| `maxRetries` | `number` | `3` | Consecutive failures before stale |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `start()` | `void` | Start polling loop |
| `stop()` | `void` | Stop polling loop |
| `poll()` | `Promise<void>` | Single poll cycle |
| `fetchPrice(pool)` | `Promise<PriceSnapshot>` | Fetch one pool's price |
| `getSnapshot(address)` | `PriceSnapshot \| undefined` | Get cached snapshot |
| `getAllSnapshots()` | `PriceSnapshot[]` | Get all cached snapshots |
| `calculateV2Price(r0, r1, d0, d1)` | `number` | Price from V2 reserves |
| `calculateV3Price(sqrtPriceX96, d0, d1)` | `number` | Price from V3 slot0 |

### Events

| Event | Payload | When |
|-------|---------|------|
| `priceUpdate` | `PriceSnapshot` | Each successful pool fetch |
| `opportunity` | `PriceDelta` | Delta exceeds threshold |
| `error` | `Error, PoolConfig` | Pool fetch fails |
| `stale` | `PoolConfig` | Consecutive failures >= maxRetries |

### Types

```typescript
interface PoolConfig {
  label: string;
  dex: "uniswap_v2" | "uniswap_v3" | "sushiswap";
  poolAddress: string;
  token0: string;
  token1: string;
  decimals0: number;
  decimals1: number;
  feeTier?: number;
}

interface PriceSnapshot {
  pool: PoolConfig;
  price: number;          // token0 in terms of token1
  inversePrice: number;   // token1 in terms of token0
  blockNumber: number;
  timestamp: number;
}

interface PriceDelta {
  pair: string;
  buyPool: PriceSnapshot;   // lower price
  sellPool: PriceSnapshot;  // higher price
  deltaPercent: number;
  timestamp: number;
}
```

---

## OpportunityDetector

Analyzes price deltas and identifies profitable arbitrage paths.

```typescript
import { OpportunityDetector } from "./detector/OpportunityDetector.js";
```

### Constructor

```typescript
new OpportunityDetector(config?: OpportunityDetectorConfig)
```

| Config Field | Type | Default | Description |
|-------------|------|---------|-------------|
| `minProfitThreshold` | `number` | `0.01` | Min net profit (ETH) |
| `maxSlippage` | `number` | `0.005` | Max slippage (0.5%) |
| `defaultInputAmount` | `number` | `10` | Flash loan size (ETH) |
| `gasPriceGwei` | `number` | `30` | Gas price for estimation |
| `gasPerSwap` | `number` | `150000` | Gas per swap step |
| `flashLoanFees` | `Partial<FlashLoanFees>` | Aave rates | Provider fee overrides |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `attach(monitor)` | `void` | Listen to PriceMonitor events |
| `detach()` | `void` | Stop listening |
| `analyzeDelta(delta)` | `ArbitrageOpportunity \| null` | Evaluate profitability |
| `buildSwapPath(delta)` | `SwapPath` | Build 2-step arb path |
| `buildTriangularPath(ab, bc, ca)` | `SwapPath` | Build 3-step triangle |
| `calculateGrossProfit(path, amount)` | `number` | Gross profit estimate |
| `estimateCosts(path, amount)` | `CostEstimate` | Full cost breakdown |
| `estimateFlashLoanFee(amount)` | `number` | Flash loan fee |
| `estimateGasCost(numSwaps)` | `number` | Gas cost in ETH |
| `estimateSlippage(path, amount)` | `number` | Slippage estimate |

### Events

| Event | Payload | When |
|-------|---------|------|
| `opportunityFound` | `ArbitrageOpportunity` | Profitable opportunity detected |
| `opportunityRejected` | `string, PriceDelta` | Below threshold or stale pool |
| `error` | `Error` | Analysis failure |

### Types

```typescript
interface ArbitrageOpportunity {
  id: string;
  path: SwapPath;
  inputAmount: number;
  grossProfit: number;
  costs: CostEstimate;
  netProfit: number;
  netProfitPercent: number;
  priceDelta: PriceDelta;
  blockNumber: number;
  timestamp: number;
}

interface SwapPath {
  steps: SwapStep[];
  baseToken: string;
  label: string;
}

interface CostEstimate {
  flashLoanFee: number;
  gasCost: number;
  slippageCost: number;
  totalCost: number;
}
```

---

## TransactionBuilder (Planned)

Will encode calldata for the on-chain FlashloanExecutor contract.

### Planned Methods

| Method | Description |
|--------|-------------|
| `buildTransaction(opportunity)` | Encode flash loan calldata |
| `estimateGas(tx)` | On-chain gas estimation |
| `signTransaction(tx)` | Sign with bot wallet |

---

## ExecutionEngine (Planned)

Will submit transactions via Flashbots and monitor confirmation.

### Planned Methods

| Method | Description |
|--------|-------------|
| `execute(signedTx)` | Submit via Flashbots bundle |
| `monitor(txHash)` | Wait for confirmation |
| `retry(tx, options)` | Resubmit with higher gas |

---

## Configuration

```typescript
import { parseEnv, buildConfig, validateConfig } from "./config/index.js";
```

| Function | Description |
|----------|-------------|
| `parseEnv(env)` | Parse env vars → `EnvVars` |
| `buildConfig(envVars, overrides?)` | Build + validate → `BotConfig` |
| `validateConfig(config)` | Validate config, throws `ConfigError` |

### Integration Example

```typescript
import { FlashloanBot } from "./index.js";
import { MAINNET_TOKENS } from "./config/index.js";

const bot = FlashloanBot.fromEnv({
  pools: [
    {
      label: "WETH/USDC UniV2",
      dex: "uniswap_v2",
      poolAddress: "0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc",
      token0: MAINNET_TOKENS.WETH,
      token1: MAINNET_TOKENS.USDC,
      decimals0: 18,
      decimals1: 6,
    },
    {
      label: "WETH/USDC Sushi",
      dex: "sushiswap",
      poolAddress: "0x397FF1542f962076d0BFE58eA045FfA2d347ACa0",
      token0: MAINNET_TOKENS.WETH,
      token1: MAINNET_TOKENS.USDC,
      decimals0: 18,
      decimals1: 6,
    },
  ],
});

bot.detector.on("opportunityFound", (opp) => {
  console.log(`Found: ${opp.path.label} | +${opp.netProfit.toFixed(4)} ETH`);
});

await bot.start();
```
