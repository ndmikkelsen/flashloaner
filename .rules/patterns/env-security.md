---
description: Environment variable patterns, private key management, and secret detection for DeFi projects
tags: [security, env, secrets, private-keys, pre-commit]
last_updated: 2026-02-13
---

# Environment Variable Security

## Overview

This project handles highly sensitive credentials including **private keys** that control real funds. A leaked private key means **immediate, irreversible loss of all funds** in that wallet. This guide covers `.env.example` conventions, private key management, DeFi-specific security, and a 3-layer defense against secret leaks.

## 3-Layer Defense

```
Layer 1: Pre-commit hooks (gitleaks)
    |  Blocks commits containing secrets
    |
Layer 2: /land gates
    |  Scans before session capture
    |  Rejects if secrets detected
    |
Layer 3: /deploy gates
    |  Final scan before deployment
    |  Blocks deployment if secrets in codebase
```

All three layers must pass. Any single failure blocks the operation.

## Private Key Management

### CRITICAL RULES

1. **NEVER store private keys in git** - Not in `.env`, not in comments, not in test files
2. **NEVER use the same wallet for deploying and bot operation**
3. **Use hardware wallet for mainnet** - Deployer and owner wallets
4. **Bot wallet is a hot wallet** - Funded with only what it needs for gas
5. **Rotate bot wallet periodically** - Deploy new wallet, transfer minimal gas funds

### Wallet Separation

| Wallet | Type | Holds | Security |
|--------|------|-------|----------|
| **Deployer** | Hardware (Ledger/Trezor) | ETH for deployment gas | Physical device, never exposed to network |
| **Owner** | Hardware or multi-sig | Nothing (only signs admin txs) | Gnosis Safe for team setups |
| **Bot** | Hot wallet (keystore file) | Minimal ETH for gas (~0.1 ETH) | Encrypted keystore, auto-rotated |

### Using Hardware Wallet with Foundry

```bash
# Deploy using Ledger
forge script script/Deploy.s.sol \
  --rpc-url $ETH_RPC_URL \
  --broadcast \
  --ledger \
  --sender <YOUR_LEDGER_ADDRESS>

# Deploy using Trezor
forge script script/Deploy.s.sol \
  --rpc-url $ETH_RPC_URL \
  --broadcast \
  --trezor
```

### Bot Wallet (Hot Wallet) Best Practices

```bash
# Generate encrypted keystore (not a raw private key)
cast wallet new --password

# Use keystore in scripts
cast send <TO> --keystore ~/.flashloaner/bot-wallet.json --password-file ~/.flashloaner/bot-password

# Fund bot wallet with minimal gas
# Only keep ~0.1 ETH for gas. Profits should be swept to a cold wallet.
```

## RPC URL Security

### Rules

1. **Use private RPC endpoints** - Not public Infura/Alchemy default endpoints
2. **Use authenticated endpoints** - API key in URL, not shared publicly
3. **Rate limit protection** - Private endpoints have higher limits
4. **No logging of RPC URLs** - Treat as secrets (they contain API keys)

### Private RPC Providers

| Provider | Free Tier | Notes |
|----------|-----------|-------|
| **Alchemy** | 300M compute units/month | Recommended for production |
| **Infura** | 100K requests/day | Good for development |
| **QuickNode** | 10M API credits/month | Fast, good for MEV |
| **Chainstack** | 3M requests/month | Multi-chain support |
| **Ankr** | 30 requests/second | Good free tier |

### RPC URL Format in .env

```bash
# GOOD: private, authenticated endpoint
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY_HERE

# BAD: public endpoint (rate limited, no privacy)
# ETH_RPC_URL=https://rpc.ankr.com/eth

# GOOD: WebSocket for real-time monitoring
ETH_WS_URL=wss://eth-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY_HERE
```

## .env.example Pattern

### File Location

```
init.flashloan-scaffolding/
├── .env.example                # Main environment template
├── .env.example.ethereum       # Ethereum-specific addresses
├── .env.example.arbitrum       # Arbitrum-specific addresses
└── .env.example.base           # Base-specific addresses
```

### Main .env.example

```bash
# ============================================================
# Flashloan Arbitrage Bot Environment Configuration
# ============================================================
# Copy this file to .env and fill in your values:
#   cp .env.example .env
#
# IMPORTANT: Never commit .env files. They contain private keys.
# A leaked private key = immediate, irreversible loss of funds.
# ============================================================

# ----------------------------------------------------------
# Required: Wallet Configuration
# ----------------------------------------------------------

# Deployer private key (use hardware wallet for mainnet!)
# For testnet only. On mainnet, use --ledger flag instead.
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Bot wallet private key (hot wallet, minimal funds)
BOT_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

# Bot wallet address (derived from BOT_PRIVATE_KEY)
BOT_WALLET_ADDRESS=0x70997970C51812dc3A010C7d01b50e0d17dc79C8

# ----------------------------------------------------------
# Required: RPC Endpoints
# ----------------------------------------------------------

# Ethereum mainnet (use private endpoint!)
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY_HERE
ETH_WS_URL=wss://eth-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY_HERE

# Arbitrum One
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY_HERE

# Base
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY_HERE

# Testnet RPCs
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY_HERE

# ----------------------------------------------------------
# Required: Contract Addresses (filled after deployment)
# ----------------------------------------------------------

# FlashloanExecutor contract address (set after deployment)
FLASHLOAN_EXECUTOR_ADDRESS=0x0000000000000000000000000000000000000000

# ----------------------------------------------------------
# Required: Chain-Specific Addresses
# ----------------------------------------------------------

# See .env.example.ethereum, .env.example.arbitrum, .env.example.base
# for chain-specific contract addresses (WETH, Aave, DEX routers)

# WETH address (chain-specific)
WETH_ADDRESS=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2

# Aave V3 Pool (chain-specific)
AAVE_POOL_ADDRESS=0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2

# ----------------------------------------------------------
# Required: Block Explorer API Keys (for verification)
# ----------------------------------------------------------

ETHERSCAN_API_KEY=YOUR_ETHERSCAN_API_KEY_HERE
ARBISCAN_API_KEY=YOUR_ARBISCAN_API_KEY_HERE
BASESCAN_API_KEY=YOUR_BASESCAN_API_KEY_HERE

# ----------------------------------------------------------
# Required: Bot Safety Parameters
# ----------------------------------------------------------

# Maximum gas price (in wei) - circuit breaker threshold
MAX_GAS_PRICE=50000000000

# Minimum profit (in wei) - skip trades below this
MIN_PROFIT_WEI=1000000000000000

# Maximum trade size (in wei) - limit position size
MAX_TRADE_SIZE=100000000000000000000

# Maximum slippage (in basis points, 100 = 1%)
MAX_SLIPPAGE_BPS=100

# ----------------------------------------------------------
# Optional: MEV Protection
# ----------------------------------------------------------

# Flashbots relay URL
# FLASHBOTS_RELAY_URL=https://relay.flashbots.net

# Flashbots auth signer (separate from bot wallet)
# FLASHBOTS_AUTH_KEY=0x...

# ----------------------------------------------------------
# Optional: Monitoring
# ----------------------------------------------------------

# Telegram bot token for alerts
# TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN_HERE
# TELEGRAM_CHAT_ID=YOUR_TELEGRAM_CHAT_ID_HERE
```

### Placeholder Formats

| Variable Type | Placeholder Format | Example |
|---------------|-------------------|---------|
| Private keys | Foundry default test key | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| RPC URLs | Provider URL with placeholder | `https://eth-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY_HERE` |
| Contract addresses | Zero address or placeholder | `0x0000000000000000000000000000000000000000` |
| API keys | Descriptive placeholder | `YOUR_ETHERSCAN_API_KEY_HERE` |
| Numeric params | Reasonable defaults | `50000000000` (50 gwei) |

**Note**: The default private keys in `.env.example` are Foundry's well-known test accounts (Anvil accounts 0 and 1). They are publicly known and contain no real funds. This is intentional -- they allow developers to immediately run fork tests locally.

## Security Guidelines

### What NEVER Goes in .env.example or Git

| Category | Examples | Why |
|----------|----------|-----|
| Real private keys | `0x<your-actual-key>` | **Immediate fund loss** |
| Real RPC API keys | `https://...alchemy.com/v2/abc123real` | Account abuse, billing |
| Production contract addresses | Deployed mainnet addresses | Operational security |
| Real Flashbots auth keys | `0x<actual-flashbots-key>` | MEV protection bypass |

### What IS Safe in .env.example

| Category | Approach | Example |
|----------|----------|---------|
| Private keys | Foundry default test accounts | `0xac0974bec...` (Anvil account 0) |
| RPC URLs | Provider URL with placeholder key | `https://...YOUR_ALCHEMY_KEY_HERE` |
| Contract addresses | Zero address | `0x0000...0000` |
| Well-known addresses | Public protocol addresses | WETH, Aave Pool (these are public) |
| Numeric params | Reasonable defaults | Gas limits, slippage |

## Prevention: Secret Detection

### gitleaks Pre-commit Hook

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.21.2
    hooks:
      - id: gitleaks
```

Install:

```bash
pip install pre-commit
pre-commit install
```

### Custom Rules

```toml
# .gitleaks.toml
[extend]
useDefault = true

[allowlist]
description = "Allowlisted files and patterns"
paths = [
    '''\.env\.example''',
    '''\.env\.example\.\w+$''',
    '''\.rules/patterns/env-security\.md$''',
]

# Allow Foundry default test account keys (publicly known)
regexes = [
    '''YOUR_\w+_HERE''',
    '''CHANGE_ME_\w+''',
    '''0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80''',
    '''0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d''',
]
```

### .gitignore Safeguards

```gitignore
# Environment files (contain secrets / private keys)
.env
.env.local
.env.*.local
.env.production
.env.mainnet

# Foundry cache and artifacts (may contain RPC URLs in metadata)
cache/
out/

# Keystore files
*.json.key
keystore/

# Never commit these
*.pem
*.key
```

## Recovery: If Private Key Is Committed

### IMMEDIATE ACTIONS (Time-Critical)

1. **Transfer ALL funds from the compromised wallet IMMEDIATELY** - Assume bots are scanning git for keys
2. **Do NOT wait** - Automated bots scrape GitHub for private keys in real-time
3. **Rotate ALL secrets** in the committed file (RPC keys, API keys, everything)

### After Fund Recovery

```bash
# Remove from git history
pip install git-filter-repo
git filter-repo --invert-paths --path .env

# Or use BFG
bfg --delete-files .env

# Clean up
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push (coordinate with team)
git push --force

# Verify
gitleaks detect --source .
```

### Generate New Wallets

```bash
# New deployer wallet (use hardware wallet for mainnet)
cast wallet new

# New bot wallet
cast wallet new --password

# Fund new bot wallet with minimal ETH
cast send <NEW_BOT_ADDRESS> --value 0.1ether --private-key <FUNDED_WALLET_KEY> --rpc-url $ETH_RPC_URL
```

## DeFi-Specific Environment Variables

### Flashloan Parameters

| Variable | Purpose | Risk if Wrong |
|----------|---------|---------------|
| `MAX_GAS_PRICE` | Circuit breaker gas limit | Too high = unprofitable trades; too low = missed opportunities |
| `MIN_PROFIT_WEI` | Minimum profit threshold | Too low = net loss after gas; too high = missed trades |
| `MAX_TRADE_SIZE` | Maximum position size | Too high = excessive price impact; too low = small profits |
| `MAX_SLIPPAGE_BPS` | Slippage tolerance | Too high = sandwich attack target; too low = reverts |

### Safe Defaults

```bash
# Conservative defaults for starting out
MAX_GAS_PRICE=50000000000        # 50 gwei
MIN_PROFIT_WEI=10000000000000000 # 0.01 ETH
MAX_TRADE_SIZE=10000000000000000000 # 10 ETH
MAX_SLIPPAGE_BPS=50               # 0.5%
```

## Checklist: Adding a New Environment Variable

When adding a new env var to the project:

1. Add to `.env.example` with placeholder value and comment
2. Add to `.env.example.<chain>` if chain-specific
3. Update deployment script if needed
4. Update bot configuration loader
5. Run `gitleaks detect --source . --no-git` before committing
6. Verify `.env` patterns are in `.gitignore`
7. Document the variable's purpose and safe range

## Related Documentation

- [Deployment Patterns](deployment.md) - Foundry deployment pipeline
- [DeFi Security](defi-security.md) - Security patterns
- [Git Workflow](git-workflow.md) - Branching and PR process
