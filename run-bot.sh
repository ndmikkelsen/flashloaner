#!/usr/bin/env bash
# run-bot.sh — Start the flashloan bot in any execution mode
#
# Usage:
#   ./run-bot.sh                   # dry-run (default, safe)
#   ./run-bot.sh shadow            # shadow mode (simulates via eth_call, free)
#   ./run-bot.sh live              # live mode (broadcasts transactions, costs gas)
#   ./run-bot.sh dry               # explicit dry-run
#   ./run-bot.sh shadow arb-sepolia # shadow mode on testnet
set -euo pipefail

# ── Parse args ──
MODE="${1:-dry}"
CHAIN="${2:-arb-mainnet}"
LOGDIR="/tmp"
LOGFILE="${LOGDIR}/flashbot-${CHAIN}-${MODE}-$(date +%Y%m%d-%H%M%S).log"

# ── Resolve env file ──
case "$CHAIN" in
  arb-mainnet)  ENV_FILE=".env.arbitrum-mainnet" ;;
  arb-sepolia)  ENV_FILE=".env.arbitrum-sepolia" ;;
  *)
    echo "Unknown chain: $CHAIN"
    echo "Usage: ./run-bot.sh [dry|shadow|live] [arb-mainnet|arb-sepolia]"
    exit 1
    ;;
esac

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE not found."
  exit 1
fi

# ── Source env ──
set -a && source "$ENV_FILE" && set +a

# ── Set execution mode env vars (after sourcing env to take precedence) ──
case "$MODE" in
  dry|dry-run|dryrun)
    export DRY_RUN=true
    unset SHADOW_MODE 2>/dev/null || true
    MODE_LABEL="DRY-RUN (detect only, no transactions)"
    ;;
  shadow)
    export DRY_RUN=false
    export SHADOW_MODE=true
    MODE_LABEL="SHADOW (simulate via eth_call, zero gas cost)"
    ;;
  live)
    export DRY_RUN=false
    unset SHADOW_MODE 2>/dev/null || true
    MODE_LABEL="LIVE (broadcasting transactions, spending gas)"
    ;;
  *)
    echo "Unknown mode: $MODE"
    echo ""
    echo "Usage: ./run-bot.sh [dry|shadow|live] [arb-mainnet|arb-sepolia]"
    echo ""
    echo "  dry     Detect opportunities, log them, do nothing (default)"
    echo "  shadow  Build real transactions, simulate via eth_call (free)"
    echo "  live    Broadcast transactions on-chain (costs gas)"
    exit 1
    ;;
esac

# ── Safety gate for live mode ──
if [[ "$MODE" == "live" ]]; then
  echo ""
  echo "  ⚠️  LIVE MODE — transactions will be broadcast and gas will be spent."
  echo "  Press Enter to continue, or Ctrl+C to abort."
  read -r
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Mode:    $MODE_LABEL"
echo "  Chain:   $CHAIN"
echo "  Env:     $ENV_FILE"
echo "  Log:     $LOGFILE"
echo "  Stop:    Ctrl+C"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Run bot (tee to log) ──
node --import tsx bot/src/run-arb-mainnet.ts 2>&1 | tee "$LOGFILE"
EXIT_CODE=${PIPESTATUS[0]}

# ── Summary ──
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  SESSION SUMMARY ($MODE)"
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
