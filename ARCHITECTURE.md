# Architecture

## System Overview

Flashloaner is a two-layer system:

- **On-chain layer** (Solidity/Foundry): Atomic flash loan execution and DEX swaps
- **Off-chain layer** (TypeScript/ethers.js v6): Opportunity detection and transaction submission

```
┌─────────────────────────────────────────────────────────────────┐
│                      OFF-CHAIN LAYER                            │
│                    (TypeScript / Node.js)                       │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │    Price      │  │ Opportunity  │  │   Transaction         │ │
│  │   Monitor     │──│  Detector    │──│    Builder            │ │
│  │ (multi-DEX)   │  │ (pathfinder) │  │ (calldata + gas)     │ │
│  └──────────────┘  └──────────────┘  └───────────┬───────────┘ │
│                                                   │             │
│  ┌──────────────┐  ┌──────────────┐              │             │
│  │  Execution   │  │   Health     │              │             │
│  │   Engine     │◄─┤  Monitor     │              │             │
│  │ (MEV protect)│  │ (alerts)     │              │             │
│  └──────┬───────┘  └──────────────┘              │             │
│         │                                         │             │
└─────────┼─────────────────────────────────────────┼─────────────┘
          │ ethers.js v6                            │
          │ (JSON-RPC / Flashbots)                  │
          ▼                                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                       ON-CHAIN LAYER                            │
│                    (Solidity / Foundry)                         │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  FlashloanExecutor                        │  │
│  │               (entry point contract)                      │  │
│  │                                                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │  │
│  │  │  Uniswap V2 │  │  Uniswap V3 │  │   SushiSwap     │  │  │
│  │  │   Adapter   │  │   Adapter   │  │    Adapter      │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │  │
│  │  ┌─────────────┐  ┌─────────────┐                       │  │
│  │  │   Curve     │  │  Balancer   │                       │  │
│  │  │   Adapter   │  │   Adapter   │                       │  │
│  │  └─────────────┘  └─────────────┘                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Safety Module                           │  │
│  │  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐  │  │
│  │  │   Circuit    │  │    Profit     │  │   Access      │  │  │
│  │  │  Breakers    │  │  Validation   │  │   Control     │  │  │
│  │  └──────────────┘  └───────────────┘  └──────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │               Flash Loan Providers                        │  │
│  │  Aave V3  │  dYdX  │  Balancer  │  Uniswap V3 Flash     │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Arbitrage Execution

```
1. PriceMonitor polls DEX reserves (getReserves, slot0)
       │
2. PriceMonitor detects price delta > threshold
       │
3. OpportunityDetector calculates profit (revenue - gas - fees - slippage)
       │
4. TransactionBuilder encodes calldata for FlashloanExecutor
       │
5. ExecutionEngine submits via Flashbots (MEV protection)
       │
6. FlashloanExecutor borrows via flash loan provider
       │
7. FlashloanExecutor routes swaps through DEX Adapters
       │
8. Safety Module validates profit > minimum threshold
       │
9. Flash loan repaid + fee, profit sent to bot wallet
```

### Event Flow (Bot Internals)

```
PriceMonitor.poll()
    ├── "priceUpdate"   → snapshot per pool per cycle
    ├── "opportunity"   → delta exceeds threshold → OpportunityDetector
    ├── "error"         → fetch failure for a pool
    └── "stale"         → consecutive failures > maxRetries

OpportunityDetector.analyzeDelta()
    ├── "opportunityFound"    → profitable after costs
    ├── "opportunityRejected" → below threshold or stale data
    └── "error"               → analysis failure

[TransactionBuilder → planned]
[ExecutionEngine → planned]
```

## On-Chain Layer

### Contract Inheritance

```
Ownable (OpenZeppelin)
    └── ReentrancyGuard (OpenZeppelin)
            └── FlashloanReceiver (abstract — provider callbacks)
                    └── FlashloanExecutor (main contract)
                            ├── IDEXAdapter implementations
                            └── Safety Module
```

### Interfaces

| Interface | Purpose |
|-----------|---------|
| `IFlashloanExecutor` | Entry point: `executeArbitrage()`, `withdrawToken()` |
| `IFlashloanReceiver` | Flash loan callbacks: `executeOperation()` (Aave), `callFunction()` (dYdX) |
| `IDEXAdapter` | DEX swap: `swap()`, `getAmountOut()` |
| `ICircuitBreaker` | Safety limits: gas price, trade size, slippage |
| `IProfitValidator` | Profit enforcement: minimum profit after costs |

### DEX Adapters

| Adapter | Protocol | Swap Method |
|---------|----------|-------------|
| UniswapV2Adapter | Uniswap V2, forks | `swapExactTokensForTokens` |
| UniswapV3Adapter | Uniswap V3 | `exactInputSingle` |
| SushiSwapAdapter | SushiSwap | `swapExactTokensForTokens` |
| CurveAdapter | Curve Finance | `exchange` |
| BalancerAdapter | Balancer V2 | `batchSwap` |

### Flash Loan Providers

| Provider | Fee | Notes |
|----------|-----|-------|
| Aave V3 | 0.05% | Multi-chain, most liquid |
| dYdX | 0% | Ethereum mainnet only |
| Balancer | 0% | Multi-chain |
| Uniswap V3 | Pool fee tier | Via flash swap |

### Safety Module

- **Circuit Breakers**: Max gas price, max trade size, max slippage — halt execution on anomalous conditions
- **Profit Validation**: Revert if net profit < threshold after all costs
- **Access Control**: Owner (admin) + bot wallet (execution only)

## Off-Chain Layer

### PriceMonitor

Polls DEX pool reserves and calculates normalized prices.

- **V2 pools**: Fetches `getReserves()`, calculates `price = (reserve1 / 10^d1) / (reserve0 / 10^d0)`
- **V3 pools**: Fetches `slot0()`, calculates `price = (sqrtPriceX96 / 2^96)^2 * 10^(d0 - d1)`
- **Delta detection**: Compares prices across same-pair pools on different DEXes
- **Staleness**: Marks pools as stale after consecutive fetch failures

### OpportunityDetector

Analyzes price deltas to determine profitable arbitrage opportunities.

- **Gross profit**: `deltaPercent / 100 * inputAmount`
- **Cost estimation**: Flash loan fees + gas costs + compound slippage
- **Flash loan fee selection**: Picks cheapest provider (dYdX 0%, Balancer 0%, Aave 0.05%)
- **Path building**: 2-step (buy low → sell high) and 3-step triangular paths

### Config System

Environment variables → config builder → validated `BotConfig`.

Key variables: `RPC_URL`, `CHAIN_ID`, `MIN_PROFIT_THRESHOLD`, `GAS_PRICE_GWEI`, `POLL_INTERVAL_MS`.

## Design Decisions

### Immutable Contracts (No Proxy)

Flash loan bots are operator-controlled, not user-facing protocols. If a contract needs changes, deploy a new version and update the bot config. Benefits: no upgrade risk, no storage collision, no delegatecall overhead.

### Event-Driven Architecture

The bot uses Node.js EventEmitter for loose coupling between modules. PriceMonitor emits events, OpportunityDetector subscribes. This allows independent testing and easy extension.

### Atomic Execution

All flash loan operations are atomic — if any step fails (insufficient profit, swap failure, slippage exceeded), the entire transaction reverts. No partial execution, no funds at risk.

## Multi-Chain Support

| Chain | Flash Loan Providers | Key DEXes |
|-------|---------------------|-----------|
| Ethereum | Aave V3, dYdX, Balancer, Uniswap V3 | Uniswap, SushiSwap, Curve, Balancer |
| Arbitrum | Aave V3, Balancer | Uniswap V3, SushiSwap, Camelot |
| Base | Aave V3 | Uniswap V3, Aerodrome |
| Optimism | Aave V3, Balancer | Uniswap V3, Velodrome |
