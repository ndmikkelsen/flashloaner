#!/usr/bin/env bash
# Extract deployed addresses from Foundry broadcast logs
# Usage: ./extract-addresses.sh <chain-id>
#
# Example: ./extract-addresses.sh 11155111

set -e

CHAIN_ID=$1

if [ -z "$CHAIN_ID" ]; then
    echo "Usage: $0 <chain-id>"
    echo ""
    echo "Available chain IDs:"
    echo "  1         - Ethereum Mainnet"
    echo "  11155111  - Sepolia Testnet"
    echo "  42161     - Arbitrum One"
    echo "  421614    - Arbitrum Sepolia"
    echo "  8453      - Base"
    echo "  84532     - Base Sepolia"
    exit 1
fi

BROADCAST_DIR="broadcast/Deploy.s.sol/$CHAIN_ID"
RUN_LATEST="$BROADCAST_DIR/run-latest.json"

if [ ! -f "$RUN_LATEST" ]; then
    echo "Error: No deployment found for chain ID $CHAIN_ID"
    echo "Expected file: $RUN_LATEST"
    exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Deployed Addresses - Chain ID: $CHAIN_ID"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Extract contract addresses from broadcast log
# The run-latest.json contains all transactions with their deployed contract addresses

jq -r '.transactions[] | select(.contractName != null) | "\(.contractName): \(.contractAddress)"' "$RUN_LATEST"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "To update your .env file:"
echo ""

# Generate .env format
jq -r '.transactions[] | select(.contractName != null) |
    if .contractName == "FlashloanExecutor" then
        "FLASHLOAN_EXECUTOR_ADDRESS=\(.contractAddress)"
    elif .contractName == "CircuitBreaker" then
        "CIRCUIT_BREAKER_ADDRESS=\(.contractAddress)"
    elif .contractName == "ProfitValidator" then
        "PROFIT_VALIDATOR_ADDRESS=\(.contractAddress)"
    elif .contractName == "UniswapV2Adapter" then
        "UNISWAP_V2_ADAPTER_ADDRESS=\(.contractAddress)"
    elif .contractName == "UniswapV3Adapter" then
        "UNISWAP_V3_ADAPTER_ADDRESS=\(.contractAddress)"
    else
        ""
    end
' "$RUN_LATEST" | grep -v '^$'

echo ""
echo "Full deployment info: $RUN_LATEST"
echo "Deployment JSON: deployments/$CHAIN_ID.json"
