# Flashloaner

[![CI](https://github.com/ndmikkelsen/feat.flash-framework/actions/workflows/ci.yml/badge.svg)](https://github.com/ndmikkelsen/feat.flash-framework/actions/workflows/ci.yml)
[![Security](https://github.com/ndmikkelsen/feat.flash-framework/actions/workflows/security.yml/badge.svg)](https://github.com/ndmikkelsen/feat.flash-framework/actions/workflows/security.yml)

A flashloan arbitrage framework with on-chain Solidity smart contracts for atomic execution and an off-chain TypeScript bot for opportunity detection.

## How It Works

```
Price Monitor ──► Opportunity Detector ──► Transaction Builder ──► Execution Engine
   (polls DEX        (calculates profit,       (encodes calldata      (submits via
    reserves)          filters by costs)         for contracts)        Flashbots)
                                                       │
                                                       ▼
                                              FlashloanExecutor
                                               (on-chain: borrow
                                                → swap → repay)
```

1. The **bot** monitors prices across DEXes (Uniswap, SushiSwap, Curve, Balancer)
2. When a price discrepancy exceeds costs (gas + fees + slippage), the bot builds a transaction
3. The **smart contract** takes a flash loan, executes swaps atomically, and repays the loan
4. If the trade isn't profitable after all costs, the transaction reverts — no funds at risk

## Project Structure

```
flashloaner/
├── contracts/          # Solidity smart contracts (Foundry)
│   ├── src/            # Contract source (interfaces, adapters, safety)
│   ├── test/           # Foundry tests (unit, fuzz, invariant, fork)
│   └── script/         # Deployment scripts
├── bot/                # TypeScript off-chain bot
│   ├── src/            # Bot source (monitor, detector, config)
│   ├── __tests__/      # Vitest tests (unit, integration, performance)
│   └── docs/           # Bot API reference
├── .github/workflows/  # CI/CD pipelines
└── .rules/             # Technical documentation
```

## Quick Start

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (forge, cast, anvil)
- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 9

### Setup

```bash
# Clone
git clone https://github.com/ndmikkelsen/feat.flash-framework.git
cd feat.flash-framework

# Install dependencies
pnpm install
forge install

# Copy environment template
cp .env.example .env
# Edit .env with your RPC URL
```

### Run Tests

```bash
# Solidity tests (1000 fuzz runs with CI profile)
FOUNDRY_PROFILE=ci forge test -vvv

# TypeScript tests
pnpm test

# Both
forge test && pnpm test
```

### Run the Bot

```bash
# Set your RPC URL
export RPC_URL="https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY"

# Start in development mode
pnpm dev
```

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Smart Contracts | Solidity 0.8.24 | Flash loan execution, DEX swaps, safety checks |
| Contract Framework | Foundry | Build, test, deploy, fuzz |
| Off-chain Bot | TypeScript | Opportunity detection, transaction building |
| Ethereum Library | ethers.js v6 | Blockchain interaction |
| Testing | Foundry + Vitest | Dual-language test suites |
| CI/CD | GitHub Actions | Automated testing, security scanning, deployment |
| Secret Detection | gitleaks | Pre-commit and CI secret scanning |

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](ARCHITECTURE.md) | System design, data flow, component relationships |
| [Getting Started](GETTING_STARTED.md) | Installation, configuration, first run |
| [Testing](TESTING.md) | Test strategy, running tests, writing tests |
| [Contributing](CONTRIBUTING.md) | Development workflow, PR process, code style |
| [Bot API](bot/docs/API.md) | TypeScript module API reference |
| [CI/CD](bot/docs/CI_CD.md) | Pipeline documentation |

## Contract Architecture

```
FlashloanExecutor (entry point)
    ├── FlashloanReceiver (Aave, dYdX, Balancer callbacks)
    ├── DEX Adapters (UniswapV2, UniswapV3, SushiSwap, Curve, Balancer)
    └── Safety Module (CircuitBreaker, ProfitValidator, AccessControl)
```

## Bot Architecture

```
FlashloanBot (orchestrator)
    ├── PriceMonitor      ── polls reserves, calculates prices, detects deltas
    ├── OpportunityDetector ── analyzes profit, estimates costs, filters opportunities
    ├── TransactionBuilder  ── encodes calldata, estimates gas          [planned]
    └── ExecutionEngine     ── submits via Flashbots, monitors txns    [planned]
```

## Security

- Flash loan transactions are atomic — if unprofitable, they revert with no loss
- On-chain circuit breakers enforce gas price, trade size, and slippage limits
- Two-tier access control (owner + bot wallet)
- Pre-commit hooks and CI scan for leaked secrets
- Immutable contracts (no upgrade risk)

## License

ISC
