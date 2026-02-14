# Monitoring Guide

Key metrics, alert thresholds, and observability setup for the flashloan arbitrage bot.

## Key Metrics

### Critical Metrics (Alert Immediately)

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| **Bot process alive** | Is the bot process running? | Process down for > 30 seconds |
| **Bot wallet balance** | ETH in the hot wallet for gas | Below 0.05 ETH |
| **Contract paused** | Is the executor paused unexpectedly? | State changed without operator action |
| **Consecutive errors** | Sequential RPC or execution failures | > 5 consecutive errors |
| **Transaction revert rate** | % of submitted txs that revert | > 50% over 1 hour |
| **Secret leak detection** | gitleaks finding on push | Any finding |

### Warning Metrics (Investigate Within Hours)

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| **Net P&L** | Profit/loss over rolling window | Negative P&L over 24 hours |
| **Gas cost ratio** | Gas spent vs profit earned | Gas > 80% of gross profit |
| **RPC latency** | Round-trip time for RPC calls | p99 > 2 seconds |
| **RPC error rate** | Failed RPC calls / total calls | > 5% over 15 minutes |
| **Stale price feeds** | Pools not updated within threshold | Any pool stale > 2 minutes |
| **Opportunity miss rate** | Opportunities detected but not executed | > 90% miss rate |

### Informational Metrics (Review Daily/Weekly)

| Metric | Description | Notes |
|--------|-------------|-------|
| **Trades executed** | Number of successful arbitrage trades | Track daily/weekly trends |
| **Average profit per trade** | Mean net profit | Should be > `MIN_PROFIT_WEI` |
| **Average gas per trade** | Mean gas used | Target: < 300K for 2-hop |
| **Pool price spread** | Average delta across monitored pools | Indicates market conditions |
| **Block latency** | Blocks behind chain head | Should be 0-1 |
| **Opportunity detection count** | Deltas exceeding threshold | Indicates market activity |

## Metric Collection

### On-Chain Metrics (via cast)

```bash
# Bot wallet balance
cast balance $BOT_WALLET_ADDRESS --rpc-url $ETH_RPC_URL

# Contract state
cast call <EXECUTOR> "paused()(bool)" --rpc-url $ETH_RPC_URL
cast call <EXECUTOR> "owner()(address)" --rpc-url $ETH_RPC_URL
cast call <EXECUTOR> "botWallet()(address)" --rpc-url $ETH_RPC_URL
cast call <EXECUTOR> "maxGasPrice()(uint256)" --rpc-url $ETH_RPC_URL

# Current gas price
cast gas-price --rpc-url $ETH_RPC_URL

# Current block number
cast block-number --rpc-url $ETH_RPC_URL

# Contract events (recent trades)
cast logs --address <EXECUTOR> --rpc-url $ETH_RPC_URL --from-block -1000
```

### Off-Chain Metrics (from bot logs)

The bot should emit structured logs for each key event:

| Event | Fields | Example |
|-------|--------|---------|
| `priceUpdate` | pool, price, blockNumber | `[INFO] priceUpdate pool=0x...B4e1 price=2001.32 block=19500000` |
| `opportunityFound` | pair, deltaPercent, estimatedProfit | `[INFO] opportunityFound pair=WETH/USDC delta=1.2% profit=0.015ETH` |
| `opportunityRejected` | pair, reason | `[INFO] opportunityRejected pair=WETH/USDC reason="profit below minimum"` |
| `tradeSubmitted` | txHash, path, inputAmount | `[INFO] tradeSubmitted tx=0x... path=UniV2→Sushi amount=10ETH` |
| `tradeConfirmed` | txHash, profit, gasUsed | `[INFO] tradeConfirmed tx=0x... profit=0.015ETH gas=285000` |
| `tradeReverted` | txHash, reason | `[ERROR] tradeReverted tx=0x... reason="InsufficientProfit"` |
| `rpcError` | endpoint, error | `[ERROR] rpcError endpoint=alchemy error="timeout"` |
| `circuitBreaker` | type, value, limit | `[WARN] circuitBreaker type=gasPrice value=85gwei limit=50gwei` |

## Alert Configuration

### Telegram Alerts (Recommended)

```bash
# .env configuration
TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN_HERE
TELEGRAM_CHAT_ID=YOUR_TELEGRAM_CHAT_ID_HERE
```

Alert categories:

| Category | Severity | Example Message |
|----------|----------|-----------------|
| CRITICAL | Immediate | "Bot process down", "Wallet balance < 0.05 ETH" |
| WARNING | Within hours | "5 consecutive RPC errors", "Negative P&L 24h" |
| INFO | Daily digest | "Daily P&L: +0.15 ETH", "42 trades executed" |

### Alert Rules

```
# Critical: Bot down
IF process_alive == false FOR 30s
THEN alert CRITICAL "Bot process is down"

# Critical: Low balance
IF bot_wallet_balance < 0.05 ETH
THEN alert CRITICAL "Bot wallet balance critically low: {balance} ETH"

# Warning: High error rate
IF error_count > 5 IN 5m
THEN alert WARNING "High error rate: {count} errors in 5 minutes"

# Warning: No trades
IF trade_count == 0 IN 24h AND opportunity_count > 0
THEN alert WARNING "No trades executed in 24h despite {opportunity_count} opportunities"

# Info: Daily summary
AT 00:00 UTC
THEN send INFO "Daily report: P&L={pnl}, Trades={count}, Avg profit={avg}"
```

## Health Check Script

Create a health check script for monitoring systems:

```bash
#!/usr/bin/env bash
# scripts/health-check.sh

set -euo pipefail

ERRORS=0

# Check bot process
if ! pgrep -f "flashloaner" > /dev/null 2>&1; then
  echo "CRITICAL: Bot process not running"
  ERRORS=$((ERRORS + 1))
fi

# Check RPC connectivity
if ! cast block-number --rpc-url "$ETH_RPC_URL" > /dev/null 2>&1; then
  echo "CRITICAL: RPC endpoint unreachable"
  ERRORS=$((ERRORS + 1))
fi

# Check bot wallet balance
BALANCE=$(cast balance "$BOT_WALLET_ADDRESS" --rpc-url "$ETH_RPC_URL" 2>/dev/null || echo "0")
BALANCE_ETH=$(echo "scale=4; $BALANCE / 1000000000000000000" | bc 2>/dev/null || echo "0")
if [ "$(echo "$BALANCE_ETH < 0.05" | bc 2>/dev/null || echo "1")" = "1" ]; then
  echo "WARNING: Bot wallet balance low: $BALANCE_ETH ETH"
  ERRORS=$((ERRORS + 1))
fi

# Check contract state
PAUSED=$(cast call "$EXECUTOR_ADDRESS" "paused()(bool)" --rpc-url "$ETH_RPC_URL" 2>/dev/null || echo "unknown")
if [ "$PAUSED" = "true" ]; then
  echo "WARNING: Executor contract is paused"
  ERRORS=$((ERRORS + 1))
fi

if [ "$ERRORS" -eq 0 ]; then
  echo "OK: All health checks passed"
  exit 0
else
  echo "FAIL: $ERRORS health check(s) failed"
  exit 1
fi
```

## Dashboard Suggestions

### Grafana Dashboard Panels

If using Grafana with Prometheus or similar:

**Row 1: Overview**
- Bot status (up/down indicator)
- Wallet balance (gauge)
- 24h P&L (stat panel)
- Current gas price vs limit (gauge)

**Row 2: Trading Activity**
- Trades per hour (time series)
- Profit per trade (time series)
- Success vs revert rate (pie chart)
- Opportunity detection count (time series)

**Row 3: System Health**
- RPC latency p50/p99 (time series)
- RPC error rate (time series)
- Pool price spreads (time series)
- Block latency (time series)

**Row 4: Gas & Costs**
- Gas price trend (time series)
- Gas cost per trade (time series)
- Gas cost as % of profit (time series)
- Circuit breaker activations (counter)

### Simple Console Dashboard

For lightweight monitoring without Grafana:

```bash
# Watch key metrics in a terminal
watch -n 10 'echo "=== Flashloaner Status ===" && \
  echo "Block: $(cast block-number --rpc-url $ETH_RPC_URL)" && \
  echo "Gas: $(cast gas-price --rpc-url $ETH_RPC_URL) wei" && \
  echo "Balance: $(cast balance $BOT_WALLET_ADDRESS --rpc-url $ETH_RPC_URL) wei" && \
  echo "Paused: $(cast call $EXECUTOR_ADDRESS "paused()(bool)" --rpc-url $ETH_RPC_URL)"'
```

## Log Aggregation

### Structured Logging

The bot should output JSON-structured logs for easy parsing:

```json
{"level":"info","msg":"tradeConfirmed","txHash":"0x...","profit":"15000000000000000","gasUsed":"285000","timestamp":"2026-02-13T12:00:00Z"}
```

### Log Rotation

```bash
# logrotate configuration: /etc/logrotate.d/flashloaner
/var/log/flashloaner/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0640 flashloaner flashloaner
}
```

### Log Storage Recommendations

| Environment | Storage | Retention |
|-------------|---------|-----------|
| Development | Local files | 7 days |
| Staging | Local files + journald | 30 days |
| Production | Centralized logging (e.g., Loki) | 90 days |

## Performance Baselines

Establish baselines during the first week of operation:

| Metric | Expected Baseline | Investigate If |
|--------|-------------------|----------------|
| RPC latency (p50) | 50-200ms | > 500ms sustained |
| RPC latency (p99) | 200-500ms | > 2s sustained |
| Price poll cycle | 1-5 seconds | > 10 seconds |
| Opportunity detection | 5-50/hour (market dependent) | < 1/hour for > 6 hours |
| Trade success rate | > 70% | < 50% over 1 hour |
| Gas per 2-hop trade | 250K-350K | > 500K |
| Net profit per trade | > 0.005 ETH | Negative average |

## Related Documentation

- [Operations Runbook](OPERATIONS.md) — Daily operations and troubleshooting
- [Deployment Guide](DEPLOYMENT.md) — Initial setup
- [Disaster Recovery](DISASTER_RECOVERY.md) — Emergency procedures
