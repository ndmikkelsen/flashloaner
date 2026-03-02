#!/usr/bin/env bash
# run-bot.sh — Start the flashloan bot in any execution mode
#
# Usage:
#   ./run-bot.sh                   # dry-run (default, safe)
#   ./run-bot.sh shadow            # shadow mode (simulates via eth_call, free)
#   ./run-bot.sh live              # live mode (broadcasts transactions, costs gas)
#   ./run-bot.sh dry               # explicit dry-run
#   ./run-bot.sh shadow arb-sepolia # shadow mode on testnet
#   ./run-bot.sh stop [arb-mainnet] # stop a running bot instance
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIDDIR="${SCRIPT_DIR}/.data/pids"
LOGDIR="${SCRIPT_DIR}/.data/logs"
LOG_RETENTION_COUNT=3
LOG_MAX_SIZE_MB=50

# ── Ensure directories ──
mkdir -p "$PIDDIR" "$LOGDIR"

# ── Helper: resolve PID file path ──
pid_file() {
  local chain="${1:-arb-mainnet}"
  echo "${PIDDIR}/${chain}.pid"
}

# ── Helper: kill previous instance if running ──
kill_previous() {
  local pf="$1"
  if [[ -f "$pf" ]]; then
    local old_pid
    old_pid=$(cat "$pf")
    if kill -0 "$old_pid" 2>/dev/null; then
      echo "  Stopping previous instance (PID $old_pid)..."
      kill "$old_pid" 2>/dev/null || true
      # Wait up to 10s for graceful shutdown
      local waited=0
      while kill -0 "$old_pid" 2>/dev/null && (( waited < 10 )); do
        sleep 1
        (( waited++ ))
      done
      if kill -0 "$old_pid" 2>/dev/null; then
        echo "  Force-killing PID $old_pid..."
        kill -9 "$old_pid" 2>/dev/null || true
      fi
      echo "  Previous instance stopped."
    fi
    rm -f "$pf"
  fi
}

# ── Helper: clean old logs (>24h) ──
clean_old_logs() {
  local count
  count=$(find "$LOGDIR" -name "flashbot-*.log*" -mtime +1 2>/dev/null | wc -l | tr -d ' ')
  if (( count > 0 )); then
    echo "  Cleaning $count old log file(s)..."
    find "$LOGDIR" -name "flashbot-*.log*" -mtime +1 -delete 2>/dev/null
  fi
  # Also clean /tmp legacy logs older than 24h
  find /tmp -name "flashbot-*.log" -mtime +1 -delete 2>/dev/null || true
}

# ── Helper: rotate log if too large ──
rotate_log() {
  local logfile="$1"
  if [[ ! -f "$logfile" ]]; then
    return
  fi
  local size_mb
  size_mb=$(( $(wc -c < "$logfile") / 1048576 ))
  if (( size_mb >= LOG_MAX_SIZE_MB )); then
    # Shift existing rotations
    for (( i=LOG_RETENTION_COUNT; i>=1; i-- )); do
      local prev=$(( i - 1 ))
      if (( prev == 0 )); then
        [[ -f "$logfile" ]] && mv "$logfile" "${logfile}.1"
      else
        [[ -f "${logfile}.${prev}" ]] && mv "${logfile}.${prev}" "${logfile}.${i}"
      fi
    done
    # Remove oldest if over retention
    rm -f "${logfile}.$(( LOG_RETENTION_COUNT + 1 ))"
  fi
}

# ── Parse first arg ──
MODE="${1:-dry}"

# ── Handle 'stop' subcommand ──
if [[ "$MODE" == "stop" ]]; then
  CHAIN="${2:-arb-mainnet}"
  PF=$(pid_file "$CHAIN")
  if [[ -f "$PF" ]]; then
    kill_previous "$PF"
    echo "Bot stopped ($CHAIN)."
  else
    echo "No running bot found for $CHAIN (no PID file at $PF)."
  fi
  exit 0
fi

CHAIN="${2:-arb-mainnet}"
LOGFILE="${LOGDIR}/flashbot-${CHAIN}-${MODE}.log"
PF=$(pid_file "$CHAIN")

# ── Resolve env file ──
case "$CHAIN" in
  arb-mainnet)  ENV_FILE=".env.arbitrum-mainnet" ;;
  arb-sepolia)  ENV_FILE=".env.arbitrum-sepolia" ;;
  *)
    echo "Unknown chain: $CHAIN"
    echo "Usage: ./run-bot.sh [dry|shadow|live|stop] [arb-mainnet|arb-sepolia]"
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
    # Keep debug for dry-run unless explicitly set
    ;;
  shadow)
    export DRY_RUN=false
    export SHADOW_MODE=true
    MODE_LABEL="SHADOW (simulate via eth_call, zero gas cost)"
    # Default to info for production modes
    export LOG_LEVEL="${LOG_LEVEL:-info}"
    ;;
  live)
    export DRY_RUN=false
    unset SHADOW_MODE 2>/dev/null || true
    MODE_LABEL="LIVE (broadcasting transactions, spending gas)"
    # Default to info for production modes
    export LOG_LEVEL="${LOG_LEVEL:-info}"
    ;;
  *)
    echo "Unknown mode: $MODE"
    echo ""
    echo "Usage: ./run-bot.sh [dry|shadow|live|stop] [arb-mainnet|arb-sepolia]"
    echo ""
    echo "  dry     Detect opportunities, log them, do nothing (default)"
    echo "  shadow  Build real transactions, simulate via eth_call (free)"
    echo "  live    Broadcast transactions on-chain (costs gas)"
    echo "  stop    Stop a running bot instance"
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

# ── Kill previous instance ──
kill_previous "$PF"

# ── Clean old logs + rotate current ──
clean_old_logs
rotate_log "$LOGFILE"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Mode:    $MODE_LABEL"
echo "  Chain:   $CHAIN"
echo "  Env:     $ENV_FILE"
echo "  Log:     $LOGFILE"
echo "  PID:     $PF"
echo "  Stop:    Ctrl+C or ./run-bot.sh stop $CHAIN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Cleanup trap: remove PID file on exit ──
cleanup() {
  rm -f "$PF"
}
trap cleanup EXIT INT TERM

# ── Run bot (tee to log) ──
node --import tsx bot/src/run-arb-mainnet.ts 2>&1 | tee -a "$LOGFILE" &
BOT_PID=$!

# ── Write PID file ──
echo "$BOT_PID" > "$PF"

# Wait for bot to finish
wait "$BOT_PID" 2>/dev/null || true
EXIT_CODE=$?

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
