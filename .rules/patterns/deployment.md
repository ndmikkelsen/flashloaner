---
description: Foundry deployment pipeline for flashloan arbitrage bot smart contracts
tags: [deployment, foundry, solidity, forge, mainnet, testnet]
last_updated: 2026-02-13
---

# Deployment Patterns

## Overview

This project uses **Foundry** (`forge script`) for smart contract deployment. The pipeline is: **fork simulation -> testnet deployment -> mainnet deployment**. Each stage must pass before proceeding to the next.

## Deployment Pipeline

```
Fork Simulation (local)
    |  forge script --fork-url $RPC (dry run)
    |  All tests pass, gas reviewed
    |
Testnet Deployment (Sepolia / Arbitrum Sepolia / Base Sepolia)
    |  forge script --broadcast --verify
    |  Contracts verified on explorer
    |  Integration tests pass against live testnet
    |
Mainnet Deployment (Ethereum / Arbitrum / Base)
    |  forge script --broadcast --verify
    |  Contracts verified on explorer
    |  Monitor first transactions
    |
Post-Deployment
    |  Update bot config with new addresses
    |  Run live integration test (small trade)
    |  Enable monitoring
```

## Prerequisites

### Local Machine Requirements

1. **Foundry** - Install via `curl -L https://foundry.paradigm.xyz | bash && foundryup`
2. **Node.js 18+** and **pnpm** - For TypeScript bot
3. **Private key** - For deployment wallet (NOT the bot wallet)
4. **RPC endpoints** - Private endpoints for each target chain
5. **Etherscan API keys** - For contract verification

### Wallet Setup

**CRITICAL**: Use separate wallets for deployment and bot operation.

| Wallet | Purpose | Security Level |
|--------|---------|---------------|
| **Deployer wallet** | Deploy and configure contracts | Hardware wallet for mainnet, hot wallet for testnet |
| **Bot wallet** | Execute arbitrage transactions | Hot wallet (needs to sign programmatically) |
| **Owner wallet** | Admin functions (pause, withdraw, upgrade config) | Hardware wallet or multi-sig |

## Project Structure

```
script/
├── Deploy.s.sol              # Main deployment script
├── DeployAdapters.s.sol      # Deploy DEX adapters only
├── ConfigureExecutor.s.sol   # Post-deploy configuration
└── helpers/
    └── BaseScript.s.sol      # Shared deployment utilities

broadcast/                     # Foundry broadcast logs (auto-generated)
├── Deploy.s.sol/
│   ├── 1/                    # Ethereum mainnet (chain ID 1)
│   ├── 11155111/             # Sepolia testnet
│   ├── 42161/                # Arbitrum One
│   └── 8453/                 # Base
```

## Deployment Script Pattern

### Main Deployment Script

```solidity
// script/Deploy.s.sol
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {FlashloanExecutor} from "../src/FlashloanExecutor.sol";
import {UniswapV2Adapter} from "../src/adapters/UniswapV2Adapter.sol";
import {UniswapV3Adapter} from "../src/adapters/UniswapV3Adapter.sol";
import {SushiSwapAdapter} from "../src/adapters/SushiSwapAdapter.sol";
import {CurveAdapter} from "../src/adapters/CurveAdapter.sol";
import {BalancerAdapter} from "../src/adapters/BalancerAdapter.sol";

contract Deploy is Script {
    function run() external {
        // Load deployer private key
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address botWallet = vm.envAddress("BOT_WALLET_ADDRESS");
        address weth = vm.envAddress("WETH_ADDRESS");
        address aavePool = vm.envAddress("AAVE_POOL_ADDRESS");

        console2.log("Deployer:", deployer);
        console2.log("Bot wallet:", botWallet);
        console2.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerKey);

        // 1. Deploy core executor
        FlashloanExecutor executor = new FlashloanExecutor(aavePool, weth);
        console2.log("FlashloanExecutor deployed:", address(executor));

        // 2. Deploy DEX adapters
        UniswapV2Adapter uniV2 = new UniswapV2Adapter(
            vm.envAddress("UNISWAP_V2_ROUTER")
        );
        UniswapV3Adapter uniV3 = new UniswapV3Adapter(
            vm.envAddress("UNISWAP_V3_ROUTER")
        );
        SushiSwapAdapter sushi = new SushiSwapAdapter(
            vm.envAddress("SUSHISWAP_ROUTER")
        );

        console2.log("UniswapV2Adapter:", address(uniV2));
        console2.log("UniswapV3Adapter:", address(uniV3));
        console2.log("SushiSwapAdapter:", address(sushi));

        // 3. Register adapters
        executor.registerAdapter(address(uniV2));
        executor.registerAdapter(address(uniV3));
        executor.registerAdapter(address(sushi));

        // 4. Set bot wallet
        executor.setBotWallet(botWallet);

        // 5. Set safety parameters
        executor.setMaxGasPrice(vm.envUint("MAX_GAS_PRICE"));
        executor.setMinProfit(vm.envUint("MIN_PROFIT_WEI"));
        executor.setMaxTradeSize(vm.envUint("MAX_TRADE_SIZE"));

        vm.stopBroadcast();

        // Log summary
        console2.log("--- Deployment Complete ---");
        console2.log("Executor:", address(executor));
        console2.log("Adapters registered:", 3);
    }
}
```

## Stage 1: Fork Simulation

Simulate deployment against a mainnet fork without spending real gas.

```bash
# Simulate deployment (no broadcast, no real transactions)
forge script script/Deploy.s.sol \
  --fork-url $ETH_RPC_URL \
  -vvvv

# Expected output:
# - All contract deployments simulated
# - Gas estimates shown
# - No actual transactions sent
```

### Checklist Before Proceeding

- [ ] Script runs without errors
- [ ] Gas estimates are reasonable
- [ ] All adapter registrations succeed
- [ ] Bot wallet is correctly set
- [ ] Safety parameters are within expected ranges

## Stage 2: Testnet Deployment

Deploy to testnet and verify contracts on explorer.

```bash
# Deploy to Sepolia testnet
forge script script/Deploy.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  -vvvv

# Deploy to Arbitrum Sepolia
forge script script/Deploy.s.sol \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ARBISCAN_API_KEY \
  -vvvv

# Deploy to Base Sepolia
forge script script/Deploy.s.sol \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $BASESCAN_API_KEY \
  -vvvv
```

### Post-Testnet Verification

```bash
# Verify contract on explorer (if --verify failed)
forge verify-contract \
  <DEPLOYED_ADDRESS> \
  src/FlashloanExecutor.sol:FlashloanExecutor \
  --chain sepolia \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  --constructor-args $(cast abi-encode "constructor(address,address)" $AAVE_POOL $WETH)

# Test live interactions on testnet
cast call <EXECUTOR_ADDRESS> "owner()(address)" --rpc-url $SEPOLIA_RPC_URL
cast call <EXECUTOR_ADDRESS> "botWallet()(address)" --rpc-url $SEPOLIA_RPC_URL
cast call <EXECUTOR_ADDRESS> "paused()(bool)" --rpc-url $SEPOLIA_RPC_URL
```

### Checklist Before Mainnet

- [ ] All contracts verified on testnet explorer
- [ ] `owner()` returns deployer address
- [ ] `botWallet()` returns correct bot wallet
- [ ] `paused()` returns false
- [ ] All adapters registered (`approvedAdapters(addr)` returns true)
- [ ] Safety parameters set correctly
- [ ] Integration test passes against testnet

## Stage 3: Mainnet Deployment

Deploy to production chain.

```bash
# Deploy to Ethereum mainnet
forge script script/Deploy.s.sol \
  --rpc-url $ETH_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  --slow \
  -vvvv

# Deploy to Arbitrum One
forge script script/Deploy.s.sol \
  --rpc-url $ARBITRUM_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ARBISCAN_API_KEY \
  -vvvv

# Deploy to Base
forge script script/Deploy.s.sol \
  --rpc-url $BASE_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $BASESCAN_API_KEY \
  -vvvv
```

**Note**: Use `--slow` on Ethereum mainnet to wait for each transaction to confirm before sending the next. This prevents nonce issues during high gas periods.

## Stage 4: Post-Deployment

### Verify Contracts on Explorer

```bash
# Check verification status
forge verify-check <VERIFICATION_GUID> --chain mainnet

# If auto-verification failed, verify manually
forge verify-contract \
  <DEPLOYED_ADDRESS> \
  src/FlashloanExecutor.sol:FlashloanExecutor \
  --chain mainnet \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  --constructor-args $(cast abi-encode "constructor(address,address)" $AAVE_POOL $WETH)
```

### Test Live Interactions

```bash
# Read contract state
cast call <EXECUTOR_ADDRESS> "owner()(address)" --rpc-url $ETH_RPC_URL
cast call <EXECUTOR_ADDRESS> "botWallet()(address)" --rpc-url $ETH_RPC_URL
cast call <EXECUTOR_ADDRESS> "maxGasPrice()(uint256)" --rpc-url $ETH_RPC_URL
cast call <EXECUTOR_ADDRESS> "minProfit()(uint256)" --rpc-url $ETH_RPC_URL

# Check adapter registration
cast call <EXECUTOR_ADDRESS> "approvedAdapters(address)(bool)" <ADAPTER_ADDRESS> --rpc-url $ETH_RPC_URL
```

### Update Bot Configuration

After deployment, update the bot's configuration with new contract addresses:

```bash
# Update .env with deployed addresses
FLASHLOAN_EXECUTOR_ADDRESS=0x...
UNISWAP_V2_ADAPTER_ADDRESS=0x...
UNISWAP_V3_ADAPTER_ADDRESS=0x...
SUSHISWAP_ADAPTER_ADDRESS=0x...
```

### Monitor First Transactions

```bash
# Watch for events from the executor contract
cast logs --address <EXECUTOR_ADDRESS> --rpc-url $ETH_RPC_URL

# Monitor bot wallet balance
cast balance <BOT_WALLET_ADDRESS> --rpc-url $ETH_RPC_URL
```

## Safety Checks Before Deploy

### Mandatory Gates

Every deployment MUST pass these gates:

```bash
# 1. All unit tests pass
forge test

# 2. All fork tests pass
forge test --fork-url $ETH_RPC_URL

# 3. Fuzz tests with extended iterations
forge test --fuzz-runs 10000

# 4. Gas report reviewed
forge test --gas-report

# 5. Contract sizes under 24KB
forge build --sizes

# 6. No compiler warnings
forge build 2>&1 | grep -i warning

# 7. TypeScript bot tests pass
pnpm test

# 8. Secrets scan clean
gitleaks detect --source . --no-git
```

### Pre-Mainnet Additional Gates

- [ ] Security audit completed (internal or external)
- [ ] Fork simulation matches expected behavior
- [ ] Testnet deployment verified and tested
- [ ] Emergency withdrawal functions tested
- [ ] Pause mechanism tested
- [ ] Bot wallet has sufficient ETH for gas

## Multi-Chain Deployment

### Chain-Specific Configuration

Create `.env` files per chain with chain-specific addresses:

```bash
# .env.ethereum
WETH_ADDRESS=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
AAVE_POOL_ADDRESS=0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2
UNISWAP_V2_ROUTER=0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D
UNISWAP_V3_ROUTER=0xE592427A0AEce92De3Edee1F18E0157C05861564

# .env.arbitrum
WETH_ADDRESS=0x82aF49447D8a07e3bd95BD0d56f35241523fBab1
AAVE_POOL_ADDRESS=0x794a61358D6845594F94dc1DB02A252b5b4814aD
UNISWAP_V2_ROUTER=0x...
UNISWAP_V3_ROUTER=0xE592427A0AEce92De3Edee1F18E0157C05861564

# .env.base
WETH_ADDRESS=0x4200000000000000000000000000000000000006
AAVE_POOL_ADDRESS=0xA238Dd80C259a72e81d7e4664a9801593F98d1c5
UNISWAP_V3_ROUTER=0x2626664c2603336E57B271c5C0b26F421741e481
```

### Deploy Script with Chain Detection

```solidity
function getChainConfig() internal view returns (ChainConfig memory) {
    if (block.chainid == 1) return getEthereumConfig();
    if (block.chainid == 42161) return getArbitrumConfig();
    if (block.chainid == 8453) return getBaseConfig();
    revert("Unsupported chain");
}
```

## Broadcast Logs

Foundry stores broadcast logs in `broadcast/`. These are valuable for:

- Tracking deployed addresses per chain
- Reproducing deployments
- Auditing deployment transactions

```
broadcast/
├── Deploy.s.sol/
│   ├── 1/                    # Ethereum mainnet
│   │   ├── run-latest.json   # Most recent deployment
│   │   └── run-1708300000.json
│   ├── 42161/                # Arbitrum
│   │   └── run-latest.json
│   └── 8453/                 # Base
│       └── run-latest.json
```

**Commit broadcast logs** to git for deployment history tracking. They contain no secrets (only public transaction data).

## Rollback Procedures

### Contract Bug Found Post-Deployment

Smart contracts are immutable. Rollback means:

1. **Pause the contract**: `cast send <EXECUTOR> "pause()" --private-key $OWNER_KEY --rpc-url $RPC`
2. **Withdraw funds**: `cast send <EXECUTOR> "emergencyWithdraw(address)" <TOKEN> --private-key $OWNER_KEY --rpc-url $RPC`
3. **Deploy new version**: Fix bug, re-run deployment pipeline
4. **Update bot config**: Point bot to new contract addresses
5. **Resume operation**: Bot uses new contracts

### Bot Configuration Rollback

```bash
# Revert bot config to previous version
git checkout HEAD~1 -- .env
# or
git checkout <commit-hash> -- .env
```

## Emergency Procedures

### Pause All Contracts

```bash
# Pause executor on all chains
for chain in ethereum arbitrum base; do
  cast send <EXECUTOR_$chain> "pause()" \
    --private-key $OWNER_KEY \
    --rpc-url $(eval echo \$${chain^^}_RPC_URL)
done
```

### Emergency Fund Recovery

```bash
# Withdraw all tokens from executor
cast send <EXECUTOR> "emergencyWithdraw(address)" $WETH_ADDRESS \
  --private-key $OWNER_KEY \
  --rpc-url $ETH_RPC_URL

# Withdraw ETH
cast send <EXECUTOR> "emergencyWithdrawETH()" \
  --private-key $OWNER_KEY \
  --rpc-url $ETH_RPC_URL
```

## Related Documentation

- [System Overview](../architecture/system-overview.md) - Complete architecture
- [Contract Architecture](../architecture/contract-architecture.md) - Contract design patterns
- [Git Workflow](git-workflow.md) - Branching and PR process
- [Environment Security](env-security.md) - Secret management
- [DeFi Security](defi-security.md) - Security patterns
