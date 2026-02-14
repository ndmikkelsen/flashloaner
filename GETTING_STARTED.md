# Getting Started

## Prerequisites

| Tool | Version | Installation |
|------|---------|-------------|
| **Foundry** | Latest | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` |
| **Node.js** | >= 20 | [nodejs.org](https://nodejs.org/) |
| **pnpm** | >= 9 | `npm install -g pnpm` |
| **gitleaks** | Latest | `brew install gitleaks` or [GitHub releases](https://github.com/gitleaks/gitleaks/releases) |

Verify installations:

```bash
forge --version    # foundry
node --version     # >= 20
pnpm --version     # >= 9
gitleaks version   # gitleaks
```

## Installation

```bash
# Clone the repository
git clone https://github.com/ndmikkelsen/feat.flash-framework.git
cd feat.flash-framework

# Install TypeScript dependencies
pnpm install

# Install Solidity dependencies (OpenZeppelin, etc.)
forge install

# Copy environment template
cp .env.example .env
```

## Configuration

Edit `.env` with your settings:

```bash
# Required: Ethereum JSON-RPC endpoint
RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY_HERE

# Optional: WebSocket for real-time events
WS_URL=wss://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY_HERE

# Optional: Override defaults
CHAIN_ID=1
LOG_LEVEL=info
MIN_PROFIT_THRESHOLD=0.01
GAS_PRICE_GWEI=30
POLL_INTERVAL_MS=12000
```

### Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RPC_URL` | Yes | — | JSON-RPC endpoint (Alchemy, Infura, etc.) |
| `WS_URL` | No | — | WebSocket endpoint for subscriptions |
| `CHAIN_ID` | No | `1` | Network chain ID |
| `LOG_LEVEL` | No | `info` | Logging level (`debug`, `info`, `warn`, `error`) |
| `MIN_PROFIT_THRESHOLD` | No | `0.01` | Minimum profit in ETH to execute |
| `GAS_PRICE_GWEI` | No | `30` | Gas price for cost estimation |
| `MAX_SLIPPAGE` | No | `0.005` | Maximum slippage tolerance (0.5%) |
| `POLL_INTERVAL_MS` | No | `12000` | Price polling interval in ms |

## Running Tests

### Solidity Tests

```bash
# Run all contract tests
forge test

# Verbose output (shows traces on failure)
forge test -vvv

# With CI profile (1000 fuzz runs)
FOUNDRY_PROFILE=ci forge test

# Specific test file
forge test --match-path contracts/test/safety/CircuitBreaker.t.sol

# Specific test function
forge test --match-test testCircuitBreaker

# Gas report
forge test --gas-report

# Fork tests (requires RPC URL)
forge test --fork-url $RPC_URL
```

### TypeScript Tests

```bash
# Run all bot tests
pnpm test

# Watch mode (re-runs on changes)
pnpm test:watch

# Specific test file
pnpm test -- --run bot/__tests__/monitor/PriceMonitor.test.ts

# Type checking only (no tests)
pnpm typecheck
```

### Run Everything

```bash
forge test && pnpm test
```

## Running the Bot

### Development Mode

```bash
# Requires RPC_URL in .env
pnpm dev
```

### Programmatic Usage

```typescript
import { FlashloanBot } from "./bot/src/index.js";

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
    {
      label: "WETH/USDC Sushi",
      dex: "sushiswap",
      poolAddress: "0x397FF1542f962076d0BFE58eA045FfA2d347ACa0",
      token0: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      token1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      decimals0: 18,
      decimals1: 6,
    },
  ],
});

await bot.start();
```

## Deploying Contracts

Deployment follows a gated process: **fork test → testnet → mainnet**.

```bash
# Step 1: Simulate on local fork (always do this first)
forge script contracts/script/Deploy.s.sol --fork-url $RPC_URL

# Step 2: Deploy to Sepolia testnet
forge script contracts/script/Deploy.s.sol \
  --fork-url $SEPOLIA_RPC_URL \
  --broadcast --verify

# Step 3: Deploy to mainnet (requires explicit approval)
forge script contracts/script/Deploy.s.sol \
  --fork-url $MAINNET_RPC_URL \
  --broadcast --verify
```

See [CI/CD documentation](bot/docs/CI_CD.md) for automated deployment via GitHub Actions.

## Troubleshooting

### `forge test` fails with "missing dependencies"

```bash
forge install
```

### `pnpm test` fails with import errors

```bash
pnpm install
pnpm typecheck  # Check for TypeScript errors first
```

### "FORK_URL not set" in integration tests

Fork-based integration tests require an RPC URL:

```bash
export FORK_URL="https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY"
```

These tests are skipped automatically when the variable is not set.

### Anvil not found

Install Foundry's full toolchain:

```bash
foundryup
```

### Gas report shows high costs

Check the Foundry profile being used:

```bash
# Default profile: 256 fuzz runs
forge test --gas-report

# CI profile: 1000 fuzz runs (more accurate)
FOUNDRY_PROFILE=ci forge test --gas-report
```

## Next Steps

- Read [Architecture](ARCHITECTURE.md) for the full system design
- Read [Testing](TESTING.md) for the test strategy
- Read [Contributing](CONTRIBUTING.md) for the development workflow
- Check [Bot API docs](bot/docs/API.md) for module-level API reference
