#!/usr/bin/env bash
# run-bot.sh — Start the flashloan bot with logging and summary on exit
set -euo pipefail

# ── Defaults ──
CHAIN="${1:-arb-mainnet}"
LOGDIR="/tmp"
LOGFILE="${LOGDIR}/flashbot-${CHAIN}-$(date +%Y%m%d-%H%M%S).log"

# ── Resolve env file and script ──
case "$CHAIN" in
  arb-mainnet)  ENV_FILE=".env.arbitrum-mainnet" ;;
  arb-sepolia)  ENV_FILE=".env.arbitrum-sepolia" ;;
  *)
    echo "Unknown chain: $CHAIN"
    echo "Usage: ./run-bot.sh [arb-mainnet|arb-sepolia]"
    exit 1
    ;;
esac

SCRIPT="bot:${CHAIN}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE not found. Copy from .env.example.${CHAIN} and fill in your keys."
  exit 1
fi

# ── Source env ──
set -a && source "$ENV_FILE" && set +a

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Chain:   $CHAIN"
echo "  Env:     $ENV_FILE"
echo "  Log:     $LOGFILE"
echo "  Stop:    Ctrl+C"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Run bot (tee to log) ──
pnpm "$SCRIPT" 2>&1 | tee "$LOGFILE"
EXIT_CODE=${PIPESTATUS[0]}

# ── Summary ──
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SESSION SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Strip ANSI codes for parsing
CLEAN=$(sed 's/\x1b\[[0-9;]*m//g' "$LOGFILE")

# Extract final stats line
STATS=$(echo "$CLEAN" | grep '\[STATS\]' | tail -1)
if [[ -n "$STATS" ]]; then
  UPTIME=$(echo "$STATS" | grep -o 'uptime=[^ ]*' | cut -d= -f2)
  PRICES=$(echo "$STATS" | grep -o 'prices=[^ ]*' | cut -d= -f2)
  FOUND=$(echo "$STATS" | grep -o 'found=[^ ]*' | cut -d= -f2)
  REJECTED=$(echo "$STATS" | grep -o 'rejected=[^ ]*' | cut -d= -f2)
  ERRORS=$(echo "$STATS" | grep -o 'errors=[^ ]*' | cut -d= -f2)

  echo "  Uptime:         $UPTIME"
  echo "  Price updates:  $PRICES"
  echo "  Opportunities:  $FOUND"
  echo "  Rejected:       $REJECTED"
  echo "  Errors:         $ERRORS"
else
  echo "  (no stats captured)"
fi

# Count profitable vs unprofitable
PROFITABLE=$(echo "$CLEAN" | grep -c '\[OPPORTUNITY\] =' || true)
UNPROFITABLE=$(echo "$CLEAN" | grep -c '\[OPPORTUNITY (unprofitable)\]' || true)
echo "  Profitable:     $PROFITABLE"
echo "  Unprofitable:   $UNPROFITABLE"

# Best opportunity
BEST=$(echo "$CLEAN" | grep 'Net profit:' | sort -t: -k2 -rn | head -1)
if [[ -n "$BEST" ]]; then
  echo "  Best net:       $(echo "$BEST" | sed 's/.*Net profit: *//')"
fi

echo ""
echo "  Log saved:      $LOGFILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
