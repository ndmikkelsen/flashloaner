#!/usr/bin/env bash
# Update bot .env file with deployed contract addresses
# Usage: ./update-bot-env.sh <chain-id> <env-file>
#
# Example: ./update-bot-env.sh 11155111 ../../.env.sepolia

set -e

CHAIN_ID=$1
ENV_FILE=$2

if [ -z "$CHAIN_ID" ] || [ -z "$ENV_FILE" ]; then
    echo "Usage: $0 <chain-id> <env-file>"
    echo ""
    echo "Example:"
    echo "  $0 11155111 ../../.env.sepolia"
    echo ""
    echo "Available chain IDs:"
    echo "  1         - Ethereum Mainnet"
    echo "  11155111  - Sepolia Testnet"
    echo "  42161     - Arbitrum One"
    exit 1
fi

DEPLOYMENT_JSON="deployments/$CHAIN_ID.json"

if [ ! -f "$DEPLOYMENT_JSON" ]; then
    echo "Error: Deployment JSON not found: $DEPLOYMENT_JSON"
    echo "Run deployment script first: forge script script/Deploy.s.sol --broadcast"
    exit 1
fi

echo "Reading deployment addresses from: $DEPLOYMENT_JSON"
echo "Updating environment file: $ENV_FILE"
echo ""

# Extract addresses
EXECUTOR=$(jq -r '.contracts.FlashloanExecutor' "$DEPLOYMENT_JSON")
V2_ADAPTER=$(jq -r '.contracts.UniswapV2Adapter' "$DEPLOYMENT_JSON")
V3_ADAPTER=$(jq -r '.contracts.UniswapV3Adapter' "$DEPLOYMENT_JSON")
NETWORK=$(jq -r '.network' "$DEPLOYMENT_JSON")

# Create or update .env file
{
    echo "# Deployed Contract Addresses - $NETWORK (Chain ID: $CHAIN_ID)"
    echo "# Generated: $(date)"
    echo "# Deployment: $DEPLOYMENT_JSON"
    echo ""
    echo "NETWORK=$NETWORK"
    echo "CHAIN_ID=$CHAIN_ID"
    echo ""
    echo "# Core Contracts"
    echo "FLASHLOAN_EXECUTOR_ADDRESS=$EXECUTOR"
    echo "UNISWAP_V2_ADAPTER_ADDRESS=$V2_ADAPTER"
    echo "UNISWAP_V3_ADAPTER_ADDRESS=$V3_ADAPTER"
} > "$ENV_FILE"

echo "✓ Environment file updated successfully"
echo ""
echo "Contents:"
cat "$ENV_FILE"
echo ""
echo "To use this configuration:"
echo "  export \$(cat $ENV_FILE | xargs)"
echo "  pnpm start"
