---
description: Two-layer flashloan arbitrage bot architecture and component relationships
tags: [architecture, solidity, typescript, defi, flashloan]
last_updated: 2026-02-13
---

# System Architecture

## Overview

The flashloan arbitrage bot is a two-layer system for detecting and executing cross-DEX arbitrage opportunities using flash loans. The **on-chain layer** (Solidity/Foundry) handles atomic execution of flash loans and DEX swaps. The **off-chain layer** (TypeScript/ethers.js v6) handles opportunity detection, transaction building, and execution monitoring.

## Component Diagram

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
│                       BLOCKCHAIN                                │
│                    (Ethereum / L2s)                              │
└─────────┬─────────────────────────────────────────┬─────────────┘
          │                                         │
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

## On-Chain Layer (Solidity / Foundry)

### FlashloanExecutor

The core contract and entry point for all flash loan operations.

| Component | Purpose | Key Functions |
|-----------|---------|---------------|
| **FlashloanExecutor** | Entry point - receives flash loans, orchestrates swaps | `executeArbitrage()`, `onFlashLoan()` |
| **FlashloanReceiver** | Base contract - implements flash loan provider callbacks | `executeOperation()` (Aave), `callFunction()` (dYdX) |

### DEX Adapters

Modular adapters for each supported DEX, implementing `IDEXAdapter`.

| Adapter | DEX | Swap Type | Notes |
|---------|-----|-----------|-------|
| **UniswapV2Adapter** | Uniswap V2, forks | `swapExactTokensForTokens` | Most liquidity pairs |
| **UniswapV3Adapter** | Uniswap V3 | `exactInputSingle` | Concentrated liquidity, tick math |
| **SushiSwapAdapter** | SushiSwap | `swapExactTokensForTokens` | Uni V2 fork, separate routers |
| **CurveAdapter** | Curve Finance | `exchange` | Stablecoin pools, meta-pools |
| **BalancerAdapter** | Balancer V2 | `batchSwap` | Weighted pools, flash loans |

### Safety Module

On-chain safety checks that run atomically within the flash loan transaction.

| Component | Purpose | Behavior |
|-----------|---------|----------|
| **Circuit Breakers** | Halt execution on anomalous conditions | Max gas price, max slippage, max trade size |
| **Profit Validation** | Ensure minimum profit after all costs | Revert if net profit < threshold (gas + fees) |
| **Access Control** | Restrict who can trigger execution | Owner-only for admin, bot wallet for execution |

### Flash Loan Providers

| Provider | Fee | Max Amount | Chain Support |
|----------|-----|------------|---------------|
| **Aave V3** | 0.05% (0.09% for some) | Pool liquidity | Ethereum, Arbitrum, Optimism, Base, Polygon |
| **dYdX** | 0% | Pool liquidity | Ethereum mainnet only |
| **Balancer** | 0% | Pool liquidity | Ethereum, Arbitrum, Polygon |
| **Uniswap V3** | Pool fee tier | Pool liquidity | All Uniswap V3 chains |

## Off-Chain Layer (TypeScript / Node.js)

### Price Monitor

Continuously fetches prices from multiple DEX sources.

| Feature | Implementation |
|---------|---------------|
| Multi-DEX price feeds | Batch `multicall` reads from on-chain pools |
| WebSocket subscriptions | Listen for `Swap`, `Sync` events in real-time |
| Price normalization | Normalize to common base (USD/ETH) with decimals handling |
| Staleness detection | Alert when price feeds go stale (>N blocks) |

### Opportunity Detector

Identifies profitable arbitrage paths across DEXes.

| Feature | Implementation |
|---------|---------------|
| Path finding | Graph-based search across token pairs and DEXes |
| Profit estimation | Simulate swap outputs, deduct gas + fees + slippage |
| Multi-hop paths | Support 2-hop and 3-hop arbitrage routes |
| Filtering | Minimum profit threshold, maximum gas price, liquidity depth |

### Transaction Builder

Constructs the flash loan transaction calldata.

| Feature | Implementation |
|---------|---------------|
| Calldata encoding | ABI-encode swap sequence for FlashloanExecutor |
| Gas estimation | `estimateGas()` with safety margin (1.2x) |
| Nonce management | Track pending nonces, handle replacements |
| EIP-1559 gas pricing | Dynamic `maxFeePerGas` and `maxPriorityFeePerGas` |

### Execution Engine

Submits and monitors flash loan transactions.

| Feature | Implementation |
|---------|---------------|
| Flashbots / MEV protection | Submit via `eth_sendBundle` to avoid public mempool |
| Private mempools | Support for MEV Blocker, MEV Share |
| Transaction monitoring | Wait for confirmation, detect reverts |
| Retry logic | Resubmit with higher gas on timeout |

### Health Monitor

Tracks bot health and alerts on issues.

| Feature | Implementation |
|---------|---------------|
| Balance monitoring | Bot wallet ETH and token balances |
| Profit tracking | Running P&L, per-trade metrics |
| Error alerting | Log and notify on repeated failures |
| Uptime tracking | Heartbeat checks, restart detection |

## Infrastructure

### Build & Test Tools

| Tool | Purpose | Commands |
|------|---------|----------|
| **Foundry** | Solidity compilation, testing, deployment | `forge build`, `forge test`, `forge script` |
| **Node.js / pnpm** | TypeScript bot runtime and dependencies | `pnpm install`, `pnpm build`, `pnpm start` |
| **ethers.js v6** | Blockchain interaction from TypeScript | Provider, Contract, Wallet |
| **Vitest** | TypeScript unit and integration testing | `pnpm test`, `pnpm test:watch` |

### Project Structure

```
init.flashloan-scaffolding/
├── .claude/                    # AI agent configuration
├── .rules/                     # Technical documentation (this directory)
├── contracts/                  # Solidity smart contracts
│   └── src/
│       ├── FlashloanExecutor.sol
│       ├── adapters/
│       │   ├── UniswapV2Adapter.sol
│       │   ├── UniswapV3Adapter.sol
│       │   ├── SushiSwapAdapter.sol
│       │   ├── CurveAdapter.sol
│       │   └── BalancerAdapter.sol
│       ├── interfaces/
│       │   ├── IFlashloanExecutor.sol
│       │   └── IDEXAdapter.sol
│       └── safety/
│           ├── CircuitBreaker.sol
│           └── ProfitValidator.sol
├── test/                       # Foundry tests
│   ├── FlashloanExecutor.t.sol
│   ├── adapters/
│   ├── safety/
│   └── fork/                   # Mainnet fork tests
├── script/                     # Foundry deployment scripts
│   └── Deploy.s.sol
├── src/                        # TypeScript bot
│   ├── index.ts
│   ├── monitor/
│   │   └── PriceMonitor.ts
│   ├── detector/
│   │   └── OpportunityDetector.ts
│   ├── builder/
│   │   └── TransactionBuilder.ts
│   ├── engine/
│   │   └── ExecutionEngine.ts
│   └── health/
│       └── HealthMonitor.ts
├── features/                   # BDD feature files
├── foundry.toml                # Foundry configuration
├── package.json                # Node.js dependencies
├── tsconfig.json               # TypeScript configuration
└── .env.example                # Environment variable template
```

## Data Flow

### Arbitrage Execution Flow

```
1. Price Monitor detects price discrepancy across DEXes
       │
2. Opportunity Detector calculates profit (revenue - gas - fees - slippage)
       │
3. Transaction Builder encodes calldata for FlashloanExecutor
       │
4. Execution Engine submits via Flashbots (MEV protection)
       │
5. FlashloanExecutor receives flash loan from provider
       │
6. FlashloanExecutor routes swaps through DEX Adapters
       │
7. Safety Module validates profit > minimum threshold
       │
8. Flash loan repaid + fee, profit sent to bot wallet
       │
9. Health Monitor logs trade result and updates P&L
```

### Failure Modes

| Failure | Cause | Effect | Recovery |
|---------|-------|--------|----------|
| Insufficient profit | Price moved during execution | Transaction reverts (atomic) | No loss, gas spent on revert |
| Flash loan unavailable | Pool liquidity drained | Transaction fails | Retry with different provider |
| DEX swap fails | Slippage exceeded, pool depleted | Transaction reverts (atomic) | Adjust slippage, skip pair |
| Gas spike | Network congestion | Profit erased by gas costs | Circuit breaker halts execution |
| MEV attack | Sandwich attack in mempool | Reduced or negative profit | Use Flashbots/private mempool |
| RPC failure | Provider downtime | Bot stops monitoring | Fallback RPC, health alert |

## Multi-Chain Considerations

| Chain | Flash Loan Providers | Key DEXes | Gas Token |
|-------|---------------------|-----------|-----------|
| **Ethereum** | Aave V3, dYdX, Balancer, Uniswap V3 | Uniswap, Sushi, Curve, Balancer | ETH |
| **Arbitrum** | Aave V3, Balancer | Uniswap V3, Sushi, Camelot, GMX | ETH |
| **Base** | Aave V3 | Uniswap V3, Aerodrome, BaseSwap | ETH |
| **Optimism** | Aave V3, Balancer | Uniswap V3, Velodrome | ETH |
| **Polygon** | Aave V3, Balancer | Uniswap V3, QuickSwap, Curve | MATIC |

## Related Documentation

- [Contract Architecture](.rules/architecture/contract-architecture.md)
- [DeFi Security Patterns](.rules/patterns/defi-security.md)
- [Deployment Patterns](.rules/patterns/deployment.md)
- [BDD Workflow](.rules/patterns/bdd-workflow.md)
