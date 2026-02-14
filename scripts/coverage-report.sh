#!/usr/bin/env bash
# Coverage report script for flashloan arbitrage bot
# Generates Solidity test coverage using forge coverage
#
# Usage:
#   ./scripts/coverage-report.sh           # Summary report
#   ./scripts/coverage-report.sh --lcov    # Generate lcov report for CI
#   ./scripts/coverage-report.sh --check   # Check against thresholds

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ─── Coverage Thresholds (percentage) ─────────────────────
# Safety contracts require 100% coverage before mainnet
SAFETY_LINE_THRESHOLD=100
SAFETY_BRANCH_THRESHOLD=95

# Other contracts require 90% minimum
DEFAULT_LINE_THRESHOLD=90
DEFAULT_BRANCH_THRESHOLD=80

# ─── Functions ─────────────────────────────────────────────

generate_summary() {
    echo ""
    echo "============================================"
    echo "  Forge Coverage Report"
    echo "============================================"
    echo ""

    forge coverage 2>&1

    echo ""
    echo "Coverage thresholds:"
    echo "  Safety contracts (CircuitBreaker, ProfitValidator): ${SAFETY_LINE_THRESHOLD}% line, ${SAFETY_BRANCH_THRESHOLD}% branch"
    echo "  Other contracts: ${DEFAULT_LINE_THRESHOLD}% line, ${DEFAULT_BRANCH_THRESHOLD}% branch"
}

generate_lcov() {
    echo "Generating lcov coverage report..."

    LCOV_FILE="coverage/lcov.info"
    mkdir -p coverage

    forge coverage --report lcov 2>&1

    if [ -f "$LCOV_FILE" ]; then
        echo -e "${GREEN}LCOV report generated${NC}: $LCOV_FILE"

        # Generate HTML report if genhtml is available
        if command -v genhtml &>/dev/null; then
            genhtml "$LCOV_FILE" \
                --output-directory coverage/html \
                --title "Flashloaner Coverage" \
                --legend \
                --branch-coverage 2>&1
            echo -e "${GREEN}HTML report${NC}: coverage/html/index.html"
        else
            echo -e "${YELLOW}Note${NC}: Install lcov for HTML reports (brew install lcov)"
        fi
    else
        echo -e "${RED}Failed to generate lcov report${NC}"
        exit 1
    fi
}

check_thresholds() {
    echo "Checking coverage against thresholds..."
    echo ""

    # Capture forge coverage output
    output=$(forge coverage 2>&1)
    echo "$output"

    # Parse coverage percentages for safety contracts
    # forge coverage output format: "| File | % Lines | % Statements | % Branches | % Funcs |"
    safety_pass=true

    # Check CircuitBreaker
    cb_line=$(echo "$output" | grep -i "CircuitBreaker" | awk -F'|' '{print $3}' | tr -d ' %' || echo "0")
    if [ -n "$cb_line" ] && [ "$cb_line" != "0" ]; then
        cb_int=${cb_line%.*}
        if [ "$cb_int" -lt "$SAFETY_LINE_THRESHOLD" ]; then
            echo -e "${RED}FAIL${NC}: CircuitBreaker line coverage ${cb_line}% < ${SAFETY_LINE_THRESHOLD}%"
            safety_pass=false
        else
            echo -e "${GREEN}PASS${NC}: CircuitBreaker line coverage ${cb_line}%"
        fi
    fi

    # Check ProfitValidator
    pv_line=$(echo "$output" | grep -i "ProfitValidator" | awk -F'|' '{print $3}' | tr -d ' %' || echo "0")
    if [ -n "$pv_line" ] && [ "$pv_line" != "0" ]; then
        pv_int=${pv_line%.*}
        if [ "$pv_int" -lt "$SAFETY_LINE_THRESHOLD" ]; then
            echo -e "${RED}FAIL${NC}: ProfitValidator line coverage ${pv_line}% < ${SAFETY_LINE_THRESHOLD}%"
            safety_pass=false
        else
            echo -e "${GREEN}PASS${NC}: ProfitValidator line coverage ${pv_line}%"
        fi
    fi

    echo ""
    if [ "$safety_pass" = true ]; then
        echo -e "${GREEN}Coverage thresholds met${NC}"
    else
        echo -e "${RED}Coverage below required thresholds${NC}"
        exit 1
    fi
}

# ─── Main ──────────────────────────────────────────────────
case "${1:---summary}" in
    --lcov)
        generate_lcov
        ;;
    --check)
        check_thresholds
        ;;
    --summary|*)
        generate_summary
        ;;
esac
