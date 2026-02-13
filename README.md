# Flashloaner

Automated flashloan arbitrage bot for DeFi protocols. Detects and executes profitable arbitrage opportunities using flashloans across decentralized exchanges.

## Architecture

Flashloaner is a two-layer system:

```
Off-chain Bot (TypeScript)          On-chain Contracts (Solidity)
+---------------------------+       +---------------------------+
| Opportunity Detection     |       | Flashloan Executor        |
| - Monitor DEX prices      |  -->  | - Borrow via flashloan    |
| - Calculate profitability  |       | - Execute DEX swaps       |
| - Submit transactions      |       | - Repay loan + keep profit|
+---------------------------+       +---------------------------+
```

- **On-chain**: Solidity smart contracts handle flashloan borrowing, multi-hop DEX swaps, and profit extraction
- **Off-chain**: TypeScript bot monitors prices, detects arbitrage opportunities, and submits transactions

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity |
| Contract Framework | Foundry (forge, cast, anvil) |
| Off-chain Bot | TypeScript |
| Ethereum Library | ethers.js v6 |
| TS Testing | Vitest |
| Runtime | Node.js |

## Getting Started

### Prerequisites

- [Foundry](https://getfoundry.sh/) (Solidity toolchain)
- Node.js 18+ and pnpm
- An RPC endpoint (Alchemy, Infura, etc.)

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd flashloaner

# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Install Node.js dependencies
pnpm install

# Copy environment template
cp .env.example .env
# Edit .env with your RPC URLs and configuration
```

### Run Tests

```bash
# Run Solidity tests
forge test

# Run Solidity tests with gas report
forge test --gas-report

# Run Solidity tests against mainnet fork
forge test --fork-url $MAINNET_RPC_URL

# Run TypeScript tests
pnpm test
```

### Deploy

Deployment follows a gated process: fork test -> testnet -> mainnet.

```bash
# Step 1: Test on local fork (always do this first)
forge script script/Deploy.s.sol --fork-url $MAINNET_RPC_URL

# Step 2: Deploy to testnet
forge script script/Deploy.s.sol --fork-url $TESTNET_RPC_URL --broadcast

# Step 3: Deploy to mainnet (after testnet verification)
forge script script/Deploy.s.sol --fork-url $MAINNET_RPC_URL --broadcast --verify
```

## Development

### Workflow

This project uses a BDD (Behavior-Driven Development) pipeline:

1. Define the feature as a Beads issue
2. Write a Gherkin `.feature` spec
3. Create a plan from the spec
4. Break the plan into trackable tasks
5. Implement using TDD (red-green-refactor)

### Branching Strategy

All work follows the PR pipeline: `feature -> dev -> main`

- Create feature branches for all work
- Never commit directly to `main` or `dev`
- All PRs require security review

## Security

This project uses pre-commit hooks and gitleaks to prevent secrets from being committed:

```bash
# Install pre-commit hooks
pre-commit install

# Manually scan for secrets
gitleaks detect --source . --no-git
```

**Important**:
- `.env.example` contains only placeholders -- never commit real secrets
- `.env` files are gitignored -- your real credentials stay local
- Pre-commit hooks automatically scan for secrets before each commit
- See [environment security guide](.rules/patterns/env-security.md) for details

## Project Structure

```
flashloaner/
├── contracts/              # Solidity smart contracts
│   ├── src/                # Contract source files
│   ├── test/               # Foundry test files
│   └── script/             # Deployment scripts
├── bot/                    # TypeScript off-chain bot
│   ├── src/                # Bot source code
│   └── __tests__/          # Vitest test files
├── .rules/                 # Technical documentation
│   ├── architecture/       # System design
│   └── patterns/           # Workflows, best practices
├── foundry.toml            # Foundry config
├── package.json            # pnpm config
├── vitest.config.ts        # Vitest config
└── .env.example            # Environment template
```

## Documentation

- **Architecture**: `.rules/architecture/` -- System design, contract architecture
- **Patterns**: `.rules/patterns/` -- Git workflow, BDD, deployment, security

## Safety Disclaimer

This software is provided for educational and research purposes. Flashloan arbitrage involves significant financial risk:

- **Smart contract risk**: Bugs in contracts can lead to loss of funds
- **Market risk**: Arbitrage opportunities can disappear between detection and execution
- **Gas risk**: Failed transactions still cost gas
- **MEV risk**: Other bots may front-run or sandwich your transactions
- **Protocol risk**: DEX or lending protocol bugs can affect your transactions

**This is not financial advice.** Use at your own risk. Always test thoroughly on forks and testnets before deploying to mainnet with real funds.

## License

MIT License - See [LICENSE](LICENSE) for details.
