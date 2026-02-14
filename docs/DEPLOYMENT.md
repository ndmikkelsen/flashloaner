# Deployment Guide

Complete guide for deploying the flashloan arbitrage system — smart contracts and off-chain bot — from local development through mainnet production.

## Prerequisites

### Required Tools

| Tool | Version | Install |
|------|---------|---------|
| Foundry (forge, cast, anvil) | Latest | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` |
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| pnpm | 8+ | `npm install -g pnpm` |
| gitleaks | 8.21+ | `brew install gitleaks` |

### Required Accounts

| Service | Purpose |
|---------|---------|
| Alchemy / Infura / QuickNode | Private RPC endpoints |
| Etherscan (+ Arbiscan, Basescan) | Contract verification |
| Flashbots (optional) | MEV protection relay |

### Wallet Setup

**Use separate wallets for each role.** This is non-negotiable.

| Wallet | Purpose | Type | Holds |
|--------|---------|------|-------|
| **Deployer** | Deploy and configure contracts | Hardware wallet (mainnet) or hot wallet (testnet) | ETH for deployment gas |
| **Owner** | Admin functions (pause, withdraw, config) | Hardware wallet or Gnosis Safe multi-sig | Nothing (signs admin txs only) |
| **Bot** | Execute arbitrage transactions | Hot wallet (programmatic signing) | Minimal ETH for gas (~0.1 ETH) |

```bash
# Generate encrypted keystore for bot wallet
cast wallet new --password

# For testnet, use Foundry's default test accounts:
# Account 0: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
# Account 1: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
```

## Environment Configuration

### 1. Copy and Configure .env

```bash
cp .env.example .env
# Edit .env with your actual values
```

### 2. Chain-Specific Addresses

Mainnet addresses for core protocols:

| Contract | Ethereum | Arbitrum | Base |
|----------|----------|----------|------|
| WETH | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` | `0x82aF49447D8a07e3bd95BD0d56f35241523fBab1` | `0x4200000000000000000000000000000000000006` |
| Aave V3 Pool | `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2` | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` |
| Uniswap V2 Router | `0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D` | — | — |
| Uniswap V3 Router | `0xE592427A0AEce92De3Edee1F18E0157C05861564` | `0xE592427A0AEce92De3Edee1F18E0157C05861564` | `0x2626664c2603336E57B271c5C0b26F421741e481` |

### 3. Safety Parameters (Conservative Defaults)

```bash
MAX_GAS_PRICE=50000000000        # 50 gwei — circuit breaker threshold
MIN_PROFIT_WEI=10000000000000000 # 0.01 ETH — minimum profit per trade
MAX_TRADE_SIZE=10000000000000000000 # 10 ETH — maximum flash loan amount
MAX_SLIPPAGE_BPS=50              # 0.5% — slippage tolerance
```

### 4. Secret Management

- Private keys: **Never** in git. Use `.env` (gitignored) or hardware wallet.
- RPC URLs: Use authenticated private endpoints. Treat as secrets.
- Keystore: Store encrypted keystore files outside the repo (e.g., `~/.flashloaner/`).

```bash
# Verify no secrets in codebase
gitleaks detect --source . --no-git
```

## Deployment Pipeline

```
Stage 1: Quality Gates
    ↓  All tests pass, security scan clean
Stage 2: Fork Simulation
    ↓  Dry-run against mainnet fork
Stage 3: Testnet Deployment
    ↓  Deploy, verify, integration test
Stage 4: Mainnet Deployment
    ↓  Deploy, verify, small test trade
Stage 5: Post-Deployment
    ↓  Configure bot, transfer ownership, enable monitoring
```

## Stage 1: Quality Gates

**Every deployment must pass these gates.** No exceptions.

```bash
# 1. All Solidity tests pass
forge test -vvv

# 2. All TypeScript tests pass
pnpm test

# 3. Fork tests pass against mainnet state
forge test --fork-url $ETH_RPC_URL

# 4. Extended fuzz testing
FOUNDRY_PROFILE=security forge test

# 5. Gas report reviewed
forge test --gas-report

# 6. Contract sizes under 24KB
forge build --sizes

# 7. No secret leaks
gitleaks detect --source . --no-git

# 8. Full security scan
./scripts/security-scan.sh
```

### Quality Gate Checklist

- [ ] `forge test` — all pass
- [ ] `pnpm test` — all pass
- [ ] `forge test --fork-url $ETH_RPC_URL` — fork tests pass
- [ ] `FOUNDRY_PROFILE=security forge test` — extended fuzz pass (10K runs)
- [ ] `forge test --gas-report` — gas within targets
- [ ] `forge build --sizes` — all contracts < 24KB
- [ ] `gitleaks detect --source . --no-git` — clean
- [ ] `./scripts/security-scan.sh` — no high/medium findings
- [ ] `./scripts/coverage-report.sh --check` — coverage thresholds met

## Stage 2: Fork Simulation

Simulate the full deployment without spending gas:

```bash
forge script script/Deploy.s.sol \
  --fork-url $ETH_RPC_URL \
  -vvvv
```

### Fork Simulation Checklist

- [ ] Script completes without errors
- [ ] Gas estimates are reasonable (< 5M total)
- [ ] All adapter registrations succeed
- [ ] Bot wallet is correctly set
- [ ] Safety parameters are within expected ranges
- [ ] Console output shows correct addresses

## Stage 3: Testnet Deployment

### Deploy to Sepolia

```bash
forge script script/Deploy.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  -vvvv
```

### Verify Testnet Deployment

```bash
# Check contract state
cast call <EXECUTOR_ADDRESS> "owner()(address)" --rpc-url $SEPOLIA_RPC_URL
cast call <EXECUTOR_ADDRESS> "botWallet()(address)" --rpc-url $SEPOLIA_RPC_URL
cast call <EXECUTOR_ADDRESS> "paused()(bool)" --rpc-url $SEPOLIA_RPC_URL
cast call <EXECUTOR_ADDRESS> "maxGasPrice()(uint256)" --rpc-url $SEPOLIA_RPC_URL
cast call <EXECUTOR_ADDRESS> "minProfit()(uint256)" --rpc-url $SEPOLIA_RPC_URL

# Check adapter registration
cast call <EXECUTOR_ADDRESS> "approvedAdapters(address)(bool)" <ADAPTER_ADDRESS> --rpc-url $SEPOLIA_RPC_URL

# Manual verification if auto-verify failed
forge verify-contract \
  <DEPLOYED_ADDRESS> \
  src/FlashloanExecutor.sol:FlashloanExecutor \
  --chain sepolia \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  --constructor-args $(cast abi-encode "constructor(address,address)" $AAVE_POOL $WETH)
```

### Testnet Checklist

- [ ] All contracts deployed and verified on explorer
- [ ] `owner()` returns deployer address
- [ ] `botWallet()` returns correct bot wallet
- [ ] `paused()` returns `false`
- [ ] All adapters registered (each returns `true`)
- [ ] Safety parameters set correctly
- [ ] Bot runs in dry-run mode against testnet successfully

## Stage 4: Mainnet Deployment

**Requires explicit approval.** Do not proceed without team sign-off.

### Pre-Mainnet Additional Gates

- [ ] Security audit completed (internal or external)
- [ ] Testnet deployment verified and tested for 24+ hours
- [ ] Emergency withdrawal functions tested on testnet
- [ ] Pause mechanism tested on testnet
- [ ] Bot wallet funded with sufficient ETH for gas
- [ ] Owner wallet ready (hardware wallet or multi-sig)

### Deploy to Mainnet

```bash
forge script script/Deploy.s.sol \
  --rpc-url $ETH_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  --slow \
  -vvvv
```

Use `--slow` on Ethereum mainnet to wait for each transaction confirmation before sending the next. This prevents nonce issues during congestion.

### For Hardware Wallet Deployment

```bash
# Ledger
forge script script/Deploy.s.sol \
  --rpc-url $ETH_RPC_URL \
  --broadcast \
  --verify \
  --ledger \
  --sender <YOUR_LEDGER_ADDRESS>

# Trezor
forge script script/Deploy.s.sol \
  --rpc-url $ETH_RPC_URL \
  --broadcast \
  --verify \
  --trezor
```

### Multi-Chain Deployment

```bash
# Arbitrum One
forge script script/Deploy.s.sol \
  --rpc-url $ARBITRUM_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ARBISCAN_API_KEY \
  -vvvv

# Base
forge script script/Deploy.s.sol \
  --rpc-url $BASE_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $BASESCAN_API_KEY \
  -vvvv
```

## Stage 5: Post-Deployment

### 1. Update Bot Configuration

Update `.env` with deployed contract addresses:

```bash
FLASHLOAN_EXECUTOR_ADDRESS=0x...
UNISWAP_V2_ADAPTER_ADDRESS=0x...
UNISWAP_V3_ADAPTER_ADDRESS=0x...
SUSHISWAP_ADAPTER_ADDRESS=0x...
```

### 2. Transfer Ownership (Production)

Transfer contract ownership from deployer EOA to multi-sig:

```bash
cast send <EXECUTOR_ADDRESS> "transferOwnership(address)" <GNOSIS_SAFE_ADDRESS> \
  --private-key $DEPLOYER_KEY \
  --rpc-url $ETH_RPC_URL
```

### 3. Verify Final State

```bash
# Read contract state
cast call <EXECUTOR_ADDRESS> "owner()(address)" --rpc-url $ETH_RPC_URL
cast call <EXECUTOR_ADDRESS> "botWallet()(address)" --rpc-url $ETH_RPC_URL
cast call <EXECUTOR_ADDRESS> "maxGasPrice()(uint256)" --rpc-url $ETH_RPC_URL
cast call <EXECUTOR_ADDRESS> "minProfit()(uint256)" --rpc-url $ETH_RPC_URL
```

### 4. Start Bot in Dry-Run Mode

```bash
DRY_RUN=true pnpm dev
```

Verify the bot:
- Connects to RPC successfully
- Fetches pool prices
- Detects opportunities (logged, not executed)
- No errors in logs

### 5. Enable Live Trading

Once dry-run is verified:

```bash
DRY_RUN=false pnpm dev
```

### Post-Deployment Checklist

- [ ] Bot config updated with deployed addresses
- [ ] Ownership transferred to multi-sig (production)
- [ ] Contract state verified on-chain
- [ ] Bot runs successfully in dry-run mode
- [ ] First live trade executed successfully (small amount)
- [ ] Monitoring and alerting enabled
- [ ] Broadcast logs committed to git

## Rollback Procedures

### Contract Bug Found

Smart contracts are immutable. Rollback means:

1. **Pause immediately**: `cast send <EXECUTOR> "pause()" --private-key $OWNER_KEY --rpc-url $RPC`
2. **Withdraw funds**: `cast send <EXECUTOR> "emergencyWithdraw(address)" <TOKEN> --private-key $OWNER_KEY --rpc-url $RPC`
3. **Fix and redeploy**: Run full deployment pipeline for new version
4. **Update bot config**: Point bot to new contract addresses
5. **Resume operation**: Start bot against new contracts

### Bot Configuration Rollback

```bash
# Revert to previous config
git checkout HEAD~1 -- .env

# Or checkout specific version
git checkout <commit-hash> -- .env
```

### Bot Software Rollback

```bash
# Revert to previous bot version
git checkout <last-known-good-commit>
pnpm install
pnpm build
pnpm dev
```

## Broadcast Logs

Foundry stores deployment transaction logs in `broadcast/`. These are valuable for tracking deployed addresses and auditing.

```
broadcast/
├── Deploy.s.sol/
│   ├── 1/                    # Ethereum mainnet (chain ID 1)
│   │   ├── run-latest.json   # Most recent deployment
│   │   └── run-<timestamp>.json
│   ├── 11155111/             # Sepolia testnet
│   ├── 42161/                # Arbitrum One
│   └── 8453/                 # Base
```

**Commit broadcast logs** to git — they contain only public transaction data, no secrets.

## Related Documentation

- [Operations Runbook](OPERATIONS.md) — Running and managing the bot
- [Monitoring Guide](MONITORING.md) — Metrics, alerts, dashboards
- [Security Checklist](SECURITY_CHECKLIST.md) — Pre-deployment security review
- [Disaster Recovery](DISASTER_RECOVERY.md) — Emergency procedures
- [Security Policy](SECURITY.md) — Threat model and defense layers
