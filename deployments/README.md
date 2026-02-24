# Deployment Artifacts

Contract deployment records per chain. Each file is named `{chainId}.json`.

## Deployed Chains

| Chain ID | Network | Status | File |
|----------|---------|--------|------|
| 11155111 | Sepolia (Ethereum testnet) | Deployed | `11155111.json` |
| 421614 | Arbitrum Sepolia (testnet) | Pending | `421614.json` |
| 1 | Ethereum Mainnet | Not deployed | `1.json` |
| 42161 | Arbitrum One (mainnet) | Not deployed | `42161.json` |

## Deployment Commands

### Ethereum Sepolia
```bash
source .env.sepolia && forge script script/Deploy.s.sol \
  --rpc-url $SEPOLIA_RPC_URL --broadcast --verify
```

### Arbitrum Sepolia
```bash
source .env.arbitrum-sepolia && forge script script/Deploy.s.sol \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --broadcast --verify \
  --etherscan-api-key $ARBISCAN_API_KEY
```

## File Structure

```
deployments/
├── 1.json           # Ethereum Mainnet
├── 11155111.json    # Sepolia Testnet
├── 42161.json       # Arbitrum One
├── 421614.json      # Arbitrum Sepolia
├── 8453.json        # Base
└── 84532.json       # Base Sepolia
```

## Artifact Format

Each `{chainId}.json` contains:
- `chainId`: Network chain ID
- `network`: Human-readable network name
- `deployedAt`: Unix timestamp of deployment
- `blockNumber`: Block number at deployment
- `contracts`: Deployed contract addresses
- `configuration`: Protocol addresses used as constructor args

Example:
```json
{
  "chainId": 11155111,
  "network": "sepolia",
  "deployedAt": "1739469234",
  "blockNumber": 5123456,
  "contracts": {
    "FlashloanExecutor": "0x1234...",
    "CircuitBreaker": "0x5678...",
    "ProfitValidator": "0x9abc...",
    "UniswapV2Adapter": "0xdef0...",
    "UniswapV3Adapter": "0x1111..."
  },
  "configuration": {
    "aavePool": "0x...",
    "balancerVault": "0x...",
    "uniswapV2Router": "0x...",
    "uniswapV3Router": "0x...",
    "uniswapV3Quoter": "0x..."
  }
}
```

## Usage

### Loading Addresses in Scripts

```solidity
// In Foundry scripts
string memory json = vm.readFile("deployments/11155111.json");
address executor = vm.parseJsonAddress(json, ".contracts.FlashloanExecutor");
```

```typescript
// In TypeScript bot
import deployments from './deployments/11155111.json';
const executorAddress = deployments.contracts.FlashloanExecutor;
```

### Updating Bot Configuration

After deployment, update your bot's `.env`:

```bash
# Read from deployment JSON
FLASHLOAN_EXECUTOR_ADDRESS=$(jq -r '.contracts.FlashloanExecutor' deployments/11155111.json)
echo "FLASHLOAN_EXECUTOR_ADDRESS=$FLASHLOAN_EXECUTOR_ADDRESS" >> .env.sepolia
```

## Verification

Verify deployment with:

```bash
forge script script/Verify.s.sol --rpc-url $SEPOLIA_RPC_URL -vvv
```

## Git Tracking

✅ **These files SHOULD be committed to git** - they contain only public addresses, no secrets.

The deployment history provides:
- Audit trail of when contracts were deployed
- Easy rollback to previous versions
- Team visibility into production addresses
