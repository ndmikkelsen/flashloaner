# Flashloaner Bot — Off-Chain Arbitrage Engine

The off-chain TypeScript bot that detects cross-DEX price discrepancies and executes flash loan arbitrage trades.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FlashloanBot                            │
│                   (orchestrator/entry point)                  │
│                                                              │
│  ┌──────────────┐    opportunity    ┌──────────────────────┐ │
│  │ PriceMonitor  │ ──────────────► │ OpportunityDetector   │ │
│  │               │                  │                       │ │
│  │ • V2 reserves │    stale         │ • Profit calculation  │ │
│  │ • V3 slot0    │ ──────────────► │ • Cost estimation     │ │
│  │ • Polling     │                  │ • Path building       │ │
│  └──────────────┘                  └──────────┬────────────┘ │
│                                     opportunityFound         │
│                                                │             │
│  ┌──────────────┐                  ┌──────────▼────────────┐ │
│  │  Execution   │ ◄────────────── │ TransactionBuilder     │ │
│  │   Engine     │   tx ready       │                       │ │
│  │              │                  │ • Calldata encoding    │ │
│  │ • Flashbots  │                  │ • Gas estimation       │ │
│  │ • Monitoring │                  │ • Nonce management     │ │
│  └──────────────┘                  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Module Responsibilities

| Module | Status | Purpose |
|--------|--------|---------|
| **PriceMonitor** | Done | Polls DEX pools, normalizes prices, detects deltas |
| **OpportunityDetector** | Done | Analyzes deltas, calculates profit, filters by threshold |
| **TransactionBuilder** | Planned | Encodes calldata for FlashloanExecutor contract |
| **ExecutionEngine** | Planned | Submits via Flashbots, monitors confirmation |
| **Config** | Done | Environment-based config with validation |

## Event Flow

```
PriceMonitor.poll()
    │
    ├─► "priceUpdate" (every pool, every cycle)
    ├─► "opportunity" (when delta > threshold)
    ├─► "error" (fetch failure)
    └─► "stale" (consecutive failures > maxRetries)
            │
            ▼
OpportunityDetector.analyzeDelta()
    │
    ├─► "opportunityFound" (profitable after costs)
    ├─► "opportunityRejected" (below threshold or stale)
    └─► "error" (analysis failure)
            │
            ▼
[TransactionBuilder — planned]
    │
    ▼
[ExecutionEngine — planned]
```

## Quick Start

```bash
# Install
pnpm install

# Set environment
export RPC_URL="https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY"

# Run
pnpm dev

# Test
pnpm test
```

## Configuration

Configuration flows: **environment variables → config builder → validated BotConfig**.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RPC_URL` | Yes | — | JSON-RPC endpoint |
| `WS_URL` | No | — | WebSocket endpoint |
| `CHAIN_ID` | No | `1` | Network chain ID |
| `LOG_LEVEL` | No | `info` | `debug\|info\|warn\|error` |
| `MIN_PROFIT_THRESHOLD` | No | `0.01` | Min profit (ETH) |
| `GAS_PRICE_GWEI` | No | `30` | Gas price for cost estimation |
| `POLL_INTERVAL_MS` | No | `12000` | Price polling interval |

### Programmatic Config

```typescript
import { FlashloanBot } from "./index.js";

const bot = FlashloanBot.fromEnv({
  pools: [
    {
      label: "WETH/USDC UniV2",
      dex: "uniswap_v2",
      poolAddress: "0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc",
      token0: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      token1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      decimals0: 18,
      decimals1: 6,
    },
  ],
  detector: {
    minProfitThreshold: 0.05,
    maxSlippage: 0.003,
    defaultInputAmount: 50,
    gasPriceGwei: 25,
    gasPerSwap: 150_000,
  },
});

await bot.start();
```

## Error Handling

- **Pool fetch failures**: Retried up to `maxRetries` times, then marked `stale`
- **Stale pools**: Opportunities involving stale pools are automatically rejected
- **Analysis errors**: Caught and emitted as `error` events
- **Graceful shutdown**: `SIGINT`/`SIGTERM` handlers stop all modules in reverse order

## Directory Structure

```
bot/
├── src/
│   ├── index.ts              # FlashloanBot entry point
│   ├── config/               # Configuration system
│   │   ├── types.ts          # BotConfig, EnvVars types
│   │   ├── defaults.ts       # Default values, token addresses
│   │   ├── validate.ts       # parseEnv, buildConfig, validateConfig
│   │   └── index.ts          # Re-exports
│   ├── monitor/              # Price monitoring
│   │   ├── types.ts          # PoolConfig, PriceSnapshot, PriceDelta
│   │   └── PriceMonitor.ts   # Polls DEX pools, detects deltas
│   ├── detector/             # Opportunity detection
│   │   ├── types.ts          # SwapPath, ArbitrageOpportunity, CostEstimate
│   │   └── OpportunityDetector.ts  # Profit calculation, filtering
│   ├── builder/              # [planned] Transaction construction
│   ├── engine/               # [planned] Execution & MEV protection
│   └── health/               # [planned] Health monitoring
├── __tests__/                # Vitest test files
│   ├── bot.test.ts
│   ├── config/
│   ├── monitor/
│   └── detector/
└── docs/
    └── API.md                # API reference
```
