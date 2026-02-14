# Deployment Guide

Complete guide for deploying the flashloan arbitrage bot to testnet and mainnet.

## Quick Start

```bash
# 1. Copy environment template
cp .env.sepolia.example .env.sepolia

# 2. Fill in your configuration
vim .env.sepolia

# 3. Load environment
export $(cat .env.sepolia | xargs)

# 4. Test deployment on fork (dry run)
forge script script/Deploy.s.sol --fork-url $SEPOLIA_RPC_URL -vvv

# 5. Deploy to testnet
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast --verify -vvv

# 6. Verify deployment
forge script script/Verify.s.sol --rpc-url $SEPOLIA_RPC_URL -vvv

# 7. Extract addresses
./contracts/script/helpers/extract-addresses.sh 11155111

# 8. Update bot configuration
./contracts/script/helpers/update-bot-env.sh 11155111 .env.sepolia
```

## Prerequisites

### 1. Install Tools

```bash
# Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Verify installation
forge --version
cast --version
```

### 2. Prepare Wallets

You need **TWO separate wallets**:

| Wallet | Purpose | Security | Balance Needed |
|--------|---------|----------|----------------|
| **Deployer** | Deploy contracts | Hardware wallet (mainnet) | ~0.1 ETH for gas |
| **Bot** | Execute arbitrage | Hot wallet (programmatic) | Funded for trading |

```bash
# Generate new wallets (if needed)
cast wallet new

# Check balance
cast balance 0xYourAddress --rpc-url $SEPOLIA_RPC_URL
```

### 3. Get RPC Endpoints

Sign up for RPC providers:
- **Infura**: https://infura.io
- **Alchemy**: https://alchemy.com
- **QuickNode**: https://quicknode.com

### 4. Get Etherscan API Key

For contract verification:
- **Etherscan**: https://etherscan.io/myapikey

### 5. Get Testnet ETH

- **Sepolia Faucet**: https://sepoliafaucet.com
- **Alchemy Faucet**: https://sepoliafaucet.com

## Step-by-Step Deployment

### Step 1: Configure Environment

```bash
# Copy template
cp .env.sepolia.example .env.sepolia

# Edit with your values
vim .env.sepolia
```

Fill in:
```bash
DEPLOYER_PRIVATE_KEY=0x...          # Your deployer wallet private key
BOT_WALLET_ADDRESS=0x...            # Your bot wallet address (NOT private key)
SEPOLIA_RPC_URL=https://...         # Your Sepolia RPC endpoint
ETHERSCAN_API_KEY=...               # Your Etherscan API key
```

Load environment:
```bash
export $(cat .env.sepolia | xargs)
```

### Step 2: Dry Run on Fork

Test deployment WITHOUT spending real gas:

```bash
forge script script/Deploy.s.sol \
  --fork-url $SEPOLIA_RPC_URL \
  -vvv
```

**Expected output:**
```
━━━ Step 1: Deploy Safety Contracts ━━━
✓ CircuitBreaker deployed: 0x...
✓ ProfitValidator deployed: 0x...

━━━ Step 2: Deploy FlashloanExecutor ━━━
✓ FlashloanExecutor deployed: 0x...

━━━ Step 3: Deploy DEX Adapters ━━━
✓ UniswapV2Adapter deployed: 0x...
✓ UniswapV3Adapter deployed: 0x...

━━━ Step 4: Register Adapters ━━━
✓ Registered UniswapV2Adapter
✓ Registered UniswapV3Adapter

━━━ Step 5: Verify Configuration ━━━
✓ All configuration checks passed
```

**Checks:**
- ✅ Script runs without errors
- ✅ Gas estimates are reasonable (<5M gas total)
- ✅ All contracts deploy successfully
- ✅ Configuration checks pass

### Step 3: Deploy to Testnet

Deploy contracts to Sepolia:

```bash
forge script script/Deploy.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  -vvv
```

**What happens:**
1. Contracts are deployed on-chain
2. Transactions are broadcast to Sepolia
3. Deployment logs saved to `broadcast/Deploy.s.sol/11155111/`
4. Addresses exported to `deployments/11155111.json`
5. Contracts automatically verified on Etherscan

**Monitor deployment:**
- Watch terminal output for transaction hashes
- Check Etherscan: `https://sepolia.etherscan.io/tx/<HASH>`
- Wait for all transactions to confirm

### Step 4: Verify Deployment

Run post-deployment checks:

```bash
forge script script/Verify.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  -vvv
```

**Checks performed:**
- ✅ Contract code exists at all addresses
- ✅ Owner is set correctly
- ✅ Bot wallet is configured
- ✅ Adapters are registered
- ✅ Safety parameters are set
- ✅ Contract is not paused

### Step 5: Extract Deployed Addresses

Get contract addresses from deployment:

```bash
# View all deployed addresses
./contracts/script/helpers/extract-addresses.sh 11155111
```

**Output:**
```
FlashloanExecutor: 0x1234abcd...
CircuitBreaker: 0x5678efgh...
ProfitValidator: 0x9abcijkl...
UniswapV2Adapter: 0xdef01234...
UniswapV3Adapter: 0x56789abc...
```

### Step 6: Update Bot Configuration

Update your bot's `.env` with deployed addresses:

```bash
# Automatically update .env.sepolia
./contracts/script/helpers/update-bot-env.sh 11155111 .env.sepolia

# Or manually add addresses
echo "FLASHLOAN_EXECUTOR_ADDRESS=0x..." >> .env.sepolia
```

### Step 7: Manual Verification on Etherscan

If `--verify` failed during deployment:

```bash
# Get constructor arguments
ARGS=$(cast abi-encode \
  "constructor(address,address,address,address,uint256)" \
  $AAVE_V3_POOL \
  $BALANCER_VAULT \
  $(cast wallet address $DEPLOYER_PRIVATE_KEY) \
  $BOT_WALLET_ADDRESS \
  10000000000000000)

# Verify FlashloanExecutor
forge verify-contract \
  <EXECUTOR_ADDRESS> \
  src/FlashloanExecutor.sol:FlashloanExecutor \
  --chain sepolia \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  --constructor-args $ARGS
```

### Step 8: Test Live Interaction

Verify deployment with live contract calls:

```bash
# Check owner
cast call <EXECUTOR_ADDRESS> "owner()(address)" --rpc-url $SEPOLIA_RPC_URL

# Check bot wallet
cast call <EXECUTOR_ADDRESS> "botWallet()(address)" --rpc-url $SEPOLIA_RPC_URL

# Check minimum profit
cast call <EXECUTOR_ADDRESS> "minProfit()(uint256)" --rpc-url $SEPOLIA_RPC_URL

# Check if paused
cast call <EXECUTOR_ADDRESS> "paused()(bool)" --rpc-url $SEPOLIA_RPC_URL

# Check adapter registration
cast call <EXECUTOR_ADDRESS> "approvedAdapters(address)(bool)" <ADAPTER_ADDRESS> --rpc-url $SEPOLIA_RPC_URL
```

### Step 9: Commit Deployment

Save deployment artifacts to git:

```bash
git add broadcast/ deployments/ .env.sepolia.example
git commit -m "deploy: flashloan arbitrage bot to Sepolia testnet"
git push
```

**⚠️ NEVER commit `.env.sepolia` (the real file with private keys)!**

## Mainnet Deployment

### Additional Checks Before Mainnet

- [ ] All tests pass: `forge test && pnpm test`
- [ ] Testnet deployment verified and tested
- [ ] Security audit completed
- [ ] Code frozen (no pending changes)
- [ ] Hardware wallet ready for deployment
- [ ] Emergency procedures documented

### Mainnet Deployment Command

```bash
# Load mainnet environment
export $(cat .env.mainnet | xargs)

# Deploy with --slow flag (waits for confirmations)
forge script script/Deploy.s.sol \
  --rpc-url $ETH_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  --slow \
  -vvv
```

**⚠️ CRITICAL MAINNET NOTES:**
- Use `--slow` flag to wait for transaction confirmations
- Monitor gas prices before deploying
- Have emergency pause procedure ready
- Test with small amounts first

## Tracking Deployments

### Where Addresses Are Stored

1. **Console Output** - Copy immediately during deployment
2. **Broadcast Logs** - `broadcast/Deploy.s.sol/<chainId>/run-latest.json`
3. **Deployment JSON** - `deployments/<chainId>.json`
4. **Etherscan** - Search deployer address transactions
5. **Bot .env** - Environment variables for bot

### Finding Lost Addresses

If you lose contract addresses:

```bash
# 1. Check broadcast logs
cat broadcast/Deploy.s.sol/11155111/run-latest.json | jq '.transactions[].contractAddress'

# 2. Check deployment JSON
cat deployments/11155111.json | jq '.contracts'

# 3. Search deployer transactions on Etherscan
# https://sepolia.etherscan.io/address/<DEPLOYER_ADDRESS>
```

## Troubleshooting

### Deployment Fails: "Insufficient Funds"

```bash
# Check deployer balance
cast balance $(cast wallet address $DEPLOYER_PRIVATE_KEY) --rpc-url $SEPOLIA_RPC_URL

# Get testnet ETH from faucet
# https://sepoliafaucet.com
```

### Verification Fails

```bash
# Retry verification manually
forge verify-contract <ADDRESS> <CONTRACT_PATH> \
  --chain sepolia \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  --watch

# Check Etherscan status
forge verify-check <VERIFICATION_GUID> --chain sepolia
```

### "Nonce Too Low" Error

```bash
# Check current nonce
cast nonce $(cast wallet address $DEPLOYER_PRIVATE_KEY) --rpc-url $SEPOLIA_RPC_URL

# Resume deployment (Foundry automatically handles this)
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast --resume
```

### Contract Already Deployed at Address

```bash
# Use --force to redeploy (NOT recommended for mainnet)
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast --force
```

## Emergency Procedures

### Pause All Contracts

```bash
# Pause executor
cast send <EXECUTOR_ADDRESS> "pause()" \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --rpc-url $SEPOLIA_RPC_URL

# Verify paused
cast call <EXECUTOR_ADDRESS> "paused()(bool)" --rpc-url $SEPOLIA_RPC_URL
```

### Emergency Withdraw

```bash
# Withdraw tokens
cast send <EXECUTOR_ADDRESS> "emergencyWithdrawToken(address,address,uint256)" \
  $WETH_ADDRESS \
  $RECEIVER_ADDRESS \
  $(cast --to-wei 10) \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --rpc-url $SEPOLIA_RPC_URL

# Withdraw ETH
cast send <EXECUTOR_ADDRESS> "emergencyWithdrawETH()" \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --rpc-url $SEPOLIA_RPC_URL
```

## Next Steps

After deployment:

1. **Test Live** - Run integration tests against deployed contracts
2. **Monitor** - Set up monitoring and alerting
3. **Small Trade** - Execute a tiny test arbitrage
4. **Scale Up** - Gradually increase trade sizes
5. **Document** - Update runbooks with deployment addresses

## Related Documentation

- [Deployment Patterns](.rules/patterns/deployment.md) - Detailed deployment patterns
- [Environment Security](.rules/patterns/env-security.md) - Secret management
- [Git Workflow](.rules/patterns/git-workflow.md) - Branching strategy
