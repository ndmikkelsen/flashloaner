#!/usr/bin/env bash
# Deployment preflight check for Sepolia testnet
# Validates environment, tools, wallets, and protocol addresses before deployment
#
# Usage:
#   ./scripts/preflight-check.sh                    # Full preflight check
#   ./scripts/preflight-check.sh --env-only         # Environment vars only
#   ./scripts/preflight-check.sh --skip-tests       # Skip forge test (faster)
#
# Prerequisites:
#   1. cp .env.sepolia.example .env.sepolia
#   2. Fill in your values in .env.sepolia
#   3. export $(cat .env.sepolia | xargs)
#   4. Run this script

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# ─── Colors ───────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

passed=0
failed=0
warned=0

# ─── Helpers ──────────────────────────────────────────────

print_header() {
    echo ""
    echo -e "${BLUE}━━━ $1 ━━━${NC}"
}

pass() {
    echo -e "  ${GREEN}✓${NC} $1"
    passed=$((passed + 1))
}

fail() {
    echo -e "  ${RED}✗${NC} $1"
    failed=$((failed + 1))
}

warn() {
    echo -e "  ${YELLOW}!${NC} $1"
    warned=$((warned + 1))
}

is_placeholder() {
    local val="$1"
    case "$val" in
        YOUR_*|CHANGE_ME*|""|0x0000000000000000000000000000000000000000)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# ─── Check: Required Tools ───────────────────────────────

check_tools() {
    print_header "Required Tools"

    if command -v forge &>/dev/null; then
        pass "forge $(forge --version 2>&1 | head -1)"
    else
        fail "forge not installed (install Foundry: https://getfoundry.sh)"
    fi

    if command -v cast &>/dev/null; then
        pass "cast available"
    else
        fail "cast not installed (part of Foundry)"
    fi

    if command -v gitleaks &>/dev/null; then
        pass "gitleaks available"
    else
        warn "gitleaks not installed (secret scanning will be skipped)"
    fi

    if command -v jq &>/dev/null; then
        pass "jq available"
    else
        warn "jq not installed (address extraction requires it)"
    fi
}

# ─── Check: Environment Variables ─────────────────────────

check_env_vars() {
    print_header "Environment Variables"

    # Required secrets (must be set and not placeholders)
    local required_secrets=(
        "DEPLOYER_PRIVATE_KEY"
        "SEPOLIA_RPC_URL"
        "ETHERSCAN_API_KEY"
        "BOT_WALLET_ADDRESS"
    )

    for var in "${required_secrets[@]}"; do
        local val="${!var:-}"
        if [ -z "$val" ]; then
            fail "$var is not set"
        elif is_placeholder "$val"; then
            fail "$var is still a placeholder value"
        else
            # Mask sensitive values in output
            case "$var" in
                *PRIVATE_KEY*|*SECRET*|*PASSWORD*)
                    pass "$var is set (***masked***)"
                    ;;
                *RPC_URL*|*API_KEY*)
                    pass "$var is set (${val:0:20}...)"
                    ;;
                *)
                    pass "$var is set ($val)"
                    ;;
            esac
        fi
    done

    # Required non-secret vars (should have reasonable values)
    local required_config=(
        "CHAIN_ID"
        "AAVE_V3_POOL"
        "UNISWAP_V3_ROUTER"
        "WETH_ADDRESS"
    )

    for var in "${required_config[@]}"; do
        local val="${!var:-}"
        if [ -z "$val" ]; then
            fail "$var is not set"
        else
            pass "$var = $val"
        fi
    done

    # Verify CHAIN_ID is Sepolia
    if [ "${CHAIN_ID:-}" = "11155111" ]; then
        pass "CHAIN_ID is Sepolia (11155111)"
    elif [ -n "${CHAIN_ID:-}" ]; then
        warn "CHAIN_ID is ${CHAIN_ID} (expected 11155111 for Sepolia)"
    fi
}

# ─── Check: RPC Connectivity ─────────────────────────────

check_rpc() {
    print_header "RPC Connectivity"

    local rpc_url="${SEPOLIA_RPC_URL:-}"
    if [ -z "$rpc_url" ] || is_placeholder "$rpc_url"; then
        fail "SEPOLIA_RPC_URL not configured — skipping RPC checks"
        return
    fi

    # Test RPC connection
    if cast client --rpc-url "$rpc_url" &>/dev/null; then
        local client
        client=$(cast client --rpc-url "$rpc_url" 2>/dev/null)
        pass "RPC endpoint reachable ($client)"
    else
        fail "RPC endpoint unreachable: ${rpc_url:0:30}..."
        return
    fi

    # Check chain ID matches
    local chain_id
    chain_id=$(cast chain-id --rpc-url "$rpc_url" 2>/dev/null || echo "")
    if [ "$chain_id" = "11155111" ]; then
        pass "Chain ID confirmed: 11155111 (Sepolia)"
    elif [ -n "$chain_id" ]; then
        fail "Chain ID mismatch: got $chain_id, expected 11155111"
    else
        fail "Could not fetch chain ID from RPC"
    fi

    # Check latest block (RPC is functional)
    local block
    block=$(cast block-number --rpc-url "$rpc_url" 2>/dev/null || echo "")
    if [ -n "$block" ]; then
        pass "Latest block: $block"
    else
        warn "Could not fetch latest block number"
    fi
}

# ─── Check: Wallet Balances ──────────────────────────────

check_wallets() {
    print_header "Wallet Balances"

    local rpc_url="${SEPOLIA_RPC_URL:-}"
    local deployer_key="${DEPLOYER_PRIVATE_KEY:-}"

    if [ -z "$rpc_url" ] || is_placeholder "$rpc_url"; then
        fail "RPC not configured — skipping wallet checks"
        return
    fi

    # Check deployer balance
    if [ -n "$deployer_key" ] && ! is_placeholder "$deployer_key"; then
        local deployer_addr
        deployer_addr=$(cast wallet address "$deployer_key" 2>/dev/null || echo "")
        if [ -n "$deployer_addr" ]; then
            local balance_wei
            balance_wei=$(cast balance "$deployer_addr" --rpc-url "$rpc_url" 2>/dev/null || echo "0")
            local balance_eth
            balance_eth=$(cast from-wei "$balance_wei" 2>/dev/null || echo "0")

            # Need at least 0.05 ETH (50000000000000000 wei)
            local min_wei=50000000000000000
            if [ "$balance_wei" -ge "$min_wei" ] 2>/dev/null; then
                pass "Deployer ($deployer_addr): ${balance_eth} ETH"
            else
                fail "Deployer ($deployer_addr): ${balance_eth} ETH (need >= 0.05 ETH)"
                echo -e "       Get testnet ETH: ${YELLOW}https://sepoliafaucet.com${NC}"
            fi
        else
            fail "Could not derive deployer address from private key"
        fi
    else
        fail "DEPLOYER_PRIVATE_KEY not set — cannot check balance"
    fi

    # Check bot wallet address is valid
    local bot_addr="${BOT_WALLET_ADDRESS:-}"
    if [ -n "$bot_addr" ] && ! is_placeholder "$bot_addr"; then
        # Basic address format validation (0x + 40 hex chars)
        if [[ "$bot_addr" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
            pass "Bot wallet address valid: $bot_addr"
        else
            fail "Bot wallet address invalid format: $bot_addr"
        fi
    else
        fail "BOT_WALLET_ADDRESS not set"
    fi
}

# ─── Check: Protocol Addresses ───────────────────────────

check_protocols() {
    print_header "Protocol Contracts (on-chain verification)"

    local rpc_url="${SEPOLIA_RPC_URL:-}"
    if [ -z "$rpc_url" ] || is_placeholder "$rpc_url"; then
        fail "RPC not configured — skipping protocol checks"
        return
    fi

    # Addresses to verify have deployed code
    local names=("Aave V3 Pool" "Uniswap V3 Router" "Uniswap V3 Quoter" "WETH")
    local addrs=("${AAVE_V3_POOL:-}" "${UNISWAP_V3_ROUTER:-}" "${UNISWAP_V3_QUOTER:-}" "${WETH_ADDRESS:-}")

    for i in "${!names[@]}"; do
        local name="${names[$i]}"
        local addr="${addrs[$i]}"
        if [ -z "$addr" ]; then
            fail "$name: address not set"
            continue
        fi

        local code
        code=$(cast code "$addr" --rpc-url "$rpc_url" 2>/dev/null || echo "0x")
        if [ "$code" != "0x" ] && [ -n "$code" ]; then
            pass "$name ($addr) has deployed code"
        else
            fail "$name ($addr) has NO code — contract not deployed"
        fi
    done

    # Optional protocols (may not be on Sepolia)
    local opt_names=("Balancer Vault" "Uniswap V2 Router")
    local opt_addrs=("${BALANCER_VAULT:-}" "${UNISWAP_V2_ROUTER:-}")

    for i in "${!opt_names[@]}"; do
        local name="${opt_names[$i]}"
        local addr="${opt_addrs[$i]}"
        if [ -z "$addr" ]; then
            continue
        fi

        local code
        code=$(cast code "$addr" --rpc-url "$rpc_url" 2>/dev/null || echo "0x")
        if [ "$code" != "0x" ] && [ -n "$code" ]; then
            pass "$name ($addr) has deployed code"
        else
            warn "$name ($addr) has no code (may not be deployed on Sepolia)"
        fi
    done
}

# ─── Check: Etherscan API Key ────────────────────────────

check_etherscan() {
    print_header "Etherscan API Key"

    local api_key="${ETHERSCAN_API_KEY:-}"
    if [ -z "$api_key" ] || is_placeholder "$api_key"; then
        fail "ETHERSCAN_API_KEY not configured"
        return
    fi

    # Test with a known Sepolia contract (WETH9 canonical)
    local response
    response=$(curl -s --max-time 10 "https://api-sepolia.etherscan.io/api?module=contract&action=getabi&address=0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14&apikey=$api_key" 2>/dev/null || echo "")

    if echo "$response" | grep -q '"status":"1"'; then
        pass "Etherscan API key is valid"
    elif echo "$response" | grep -q '"result":"Invalid API Key"'; then
        fail "Etherscan API key is invalid"
    else
        warn "Could not verify Etherscan API key (network issue?)"
    fi
}

# ─── Check: Build & Tests ────────────────────────────────

check_build() {
    print_header "Contract Build"

    echo "  Running forge build..."
    if forge build --root "$PROJECT_ROOT" &>/dev/null; then
        pass "Contracts compile successfully"
    else
        fail "Contract compilation failed — run 'forge build' for details"
    fi
}

check_tests() {
    print_header "Test Suite"

    echo "  Running forge test..."
    if forge test --root "$PROJECT_ROOT" &>/dev/null; then
        pass "All Solidity tests pass"
    else
        fail "Solidity tests failing — run 'forge test -vvv' for details"
    fi
}

# ─── Check: Secret Scanning ──────────────────────────────

check_secrets() {
    print_header "Secret Scanning"

    if ! command -v gitleaks &>/dev/null; then
        warn "gitleaks not installed — skipping secret scan"
        return
    fi

    if gitleaks detect --source "$PROJECT_ROOT" --no-git &>/dev/null 2>&1; then
        pass "No secrets detected in codebase"
    else
        fail "Potential secrets detected! Run: gitleaks detect --source . --no-git -v"
    fi
}

# ─── Summary ──────────────────────────────────────────────

print_summary() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  Preflight Check Summary${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  ${GREEN}Passed${NC}:   $passed"
    echo -e "  ${RED}Failed${NC}:   $failed"
    echo -e "  ${YELLOW}Warnings${NC}: $warned"
    echo ""

    if [ "$failed" -gt 0 ]; then
        echo -e "  ${RED}NOT READY${NC} — Fix $failed issue(s) before deployment"
        echo ""
        echo "  Next steps:"
        echo "    1. Fix the failed checks above"
        echo "    2. Re-run: ./scripts/preflight-check.sh"
        echo "    3. Once all checks pass, proceed with deployment"
        echo ""
        exit 1
    else
        echo -e "  ${GREEN}READY FOR DEPLOYMENT${NC}"
        echo ""
        echo "  Next steps:"
        echo "    1. Dry run:  forge script script/Deploy.s.sol --fork-url \$SEPOLIA_RPC_URL -vvv"
        echo "    2. Deploy:   forge script script/Deploy.s.sol --rpc-url \$SEPOLIA_RPC_URL --broadcast --verify -vvv"
        echo "    3. Verify:   forge script script/Verify.s.sol --rpc-url \$SEPOLIA_RPC_URL -vvv"
        echo ""
        exit 0
    fi
}

# ─── Main ─────────────────────────────────────────────────

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Sepolia Deployment Preflight Check${NC}"
echo -e "${BLUE}============================================${NC}"

SKIP_TESTS=false
ENV_ONLY=false

case "${1:-}" in
    --env-only)
        ENV_ONLY=true
        ;;
    --skip-tests)
        SKIP_TESTS=true
        ;;
    --help|-h)
        echo ""
        echo "Usage: $0 [--env-only|--skip-tests]"
        echo ""
        echo "  --env-only     Check environment variables only (fastest)"
        echo "  --skip-tests   Skip forge test (faster, still checks build)"
        echo ""
        exit 0
        ;;
esac

check_tools
check_env_vars

if [ "$ENV_ONLY" = true ]; then
    print_summary
fi

check_rpc
check_wallets
check_protocols
check_etherscan
check_build

if [ "$SKIP_TESTS" = false ]; then
    check_tests
fi

check_secrets
print_summary
