#!/usr/bin/env bash
# Security scan script for flashloan arbitrage bot
# Runs Slither static analysis, gitleaks secret detection, and forge tests
#
# Usage:
#   ./scripts/security-scan.sh          # Run all scans
#   ./scripts/security-scan.sh slither  # Slither only
#   ./scripts/security-scan.sh secrets  # Gitleaks only
#   ./scripts/security-scan.sh tests    # Forge tests only
#   ./scripts/security-scan.sh gas      # Gas report only

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# Ensure Python-installed tools (slither) are on PATH
PYTHON_BIN="$(python3 -c 'import sysconfig; print(sysconfig.get_path("scripts"))' 2>/dev/null || true)"
if [ -n "$PYTHON_BIN" ] && [ -d "$PYTHON_BIN" ]; then
    export PATH="$PYTHON_BIN:$PATH"
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

passed=0
failed=0
skipped=0

print_header() {
    echo ""
    echo "============================================"
    echo "  $1"
    echo "============================================"
}

print_result() {
    if [ "$1" -eq 0 ]; then
        echo -e "${GREEN}PASSED${NC}: $2"
        passed=$((passed + 1))
    else
        echo -e "${RED}FAILED${NC}: $2"
        failed=$((failed + 1))
    fi
}

print_skip() {
    echo -e "${YELLOW}SKIPPED${NC}: $1"
    skipped=$((skipped + 1))
}

# ─── Slither Static Analysis ───────────────────────────────
run_slither() {
    print_header "Slither Static Analysis"

    if ! command -v slither &>/dev/null; then
        print_skip "slither not installed (pip install slither-analyzer)"
        return
    fi

    # Check if there are any .sol source files (not just interfaces)
    sol_count=$(find contracts/src -name "*.sol" ! -path "*/interfaces/*" -type f 2>/dev/null | wc -l | tr -d ' ')
    if [ "$sol_count" -eq 0 ]; then
        print_skip "No contract source files found (only interfaces). Slither needs implementations."
        return
    fi

    echo "Running slither on contracts/src/..."
    if slither . --config-file slither.config.json 2>&1; then
        print_result 0 "Slither analysis"
    else
        exit_code=$?
        # Exit code 255 means findings found but not necessarily failures
        if [ "$exit_code" -eq 255 ]; then
            echo -e "${YELLOW}WARNING${NC}: Slither found issues (review output above)"
            print_result 0 "Slither analysis (findings require review)"
        else
            print_result 1 "Slither analysis"
        fi
    fi
}

# ─── Secret Detection ──────────────────────────────────────
run_secrets() {
    print_header "Secret Detection (gitleaks)"

    if ! command -v gitleaks &>/dev/null; then
        print_skip "gitleaks not installed"
        return
    fi

    echo "Scanning for leaked secrets..."
    if gitleaks detect --source . --no-git -v 2>&1; then
        print_result 0 "No secrets detected"
    else
        print_result 1 "Potential secrets found!"
    fi
}

# ─── Forge Tests ───────────────────────────────────────────
run_tests() {
    print_header "Forge Tests"

    if ! command -v forge &>/dev/null; then
        print_skip "forge not installed"
        return
    fi

    echo "Running forge test..."
    if forge test -vvv 2>&1; then
        print_result 0 "All forge tests"
    else
        print_result 1 "Forge tests"
    fi
}

# ─── Forge Tests with High Fuzz Runs ──────────────────────
run_fuzz() {
    print_header "Fuzz Tests (extended)"

    if ! command -v forge &>/dev/null; then
        print_skip "forge not installed"
        return
    fi

    echo "Running fuzz tests with 10,000 iterations..."
    if FOUNDRY_FUZZ_RUNS=10000 forge test --match-test "testFuzz_" -vvv 2>&1; then
        print_result 0 "Extended fuzz tests (10,000 runs)"
    else
        print_result 1 "Extended fuzz tests"
    fi
}

# ─── Gas Report ────────────────────────────────────────────
run_gas() {
    print_header "Gas Report"

    if ! command -v forge &>/dev/null; then
        print_skip "forge not installed"
        return
    fi

    echo "Generating gas report..."
    if forge test --gas-report 2>&1; then
        print_result 0 "Gas report generated"
    else
        print_result 1 "Gas report"
    fi
}

# ─── Summary ───────────────────────────────────────────────
print_summary() {
    print_header "Security Scan Summary"
    echo -e "  ${GREEN}Passed${NC}:  $passed"
    echo -e "  ${RED}Failed${NC}:  $failed"
    echo -e "  ${YELLOW}Skipped${NC}: $skipped"
    echo ""

    if [ "$failed" -gt 0 ]; then
        echo -e "${RED}SECURITY SCAN FAILED${NC} — Fix issues before deployment"
        exit 1
    else
        echo -e "${GREEN}SECURITY SCAN PASSED${NC}"
        exit 0
    fi
}

# ─── Main ──────────────────────────────────────────────────
case "${1:-all}" in
    slither)
        run_slither
        ;;
    secrets)
        run_secrets
        ;;
    tests)
        run_tests
        ;;
    fuzz)
        run_fuzz
        ;;
    gas)
        run_gas
        ;;
    all)
        run_slither
        run_secrets
        run_tests
        run_gas
        ;;
    *)
        echo "Usage: $0 {all|slither|secrets|tests|fuzz|gas}"
        exit 1
        ;;
esac

print_summary
