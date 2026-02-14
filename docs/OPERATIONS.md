# Operations Runbook

Day-to-day operational procedures for running and managing the flashloan arbitrage bot.

## Starting and Stopping the Bot

### Normal Start

```bash
# Start in dry-run mode (recommended for first run)
DRY_RUN=true pnpm dev

# Start in live mode
DRY_RUN=false pnpm dev

# Start with custom config overrides
MAX_GAS_PRICE=80000000000 MIN_PROFIT_WEI=5000000000000000 pnpm dev
```

### Normal Stop

```bash
# Graceful shutdown (Ctrl+C sends SIGINT)
# The bot should:
# 1. Stop accepting new opportunities
# 2. Wait for in-flight transactions to confirm/timeout
# 3. Log final P&L summary
# 4. Exit cleanly
```

### Process Management (Production)

```bash
# Using systemd (recommended for servers)
sudo systemctl start flashloaner-bot
sudo systemctl stop flashloaner-bot
sudo systemctl restart flashloaner-bot
sudo systemctl status flashloaner-bot

# Using pm2 (alternative)
pm2 start ecosystem.config.js
pm2 stop flashloaner-bot
pm2 restart flashloaner-bot
pm2 logs flashloaner-bot
```

## Daily Operations Checklist

### Morning Check

- [ ] Bot process is running: `systemctl status flashloaner-bot` or `pm2 status`
- [ ] Bot wallet balance sufficient: `cast balance $BOT_WALLET_ADDRESS --rpc-url $ETH_RPC_URL`
- [ ] No error spikes in logs (last 12 hours)
- [ ] P&L tracking: review profits/losses from previous day
- [ ] Gas prices normal: check current gas vs `MAX_GAS_PRICE` setting

### Weekly Review

- [ ] Total P&L for the week
- [ ] Trade count and success rate
- [ ] Average gas cost per trade
- [ ] Any new error patterns in logs
- [ ] RPC endpoint health (latency, error rate)
- [ ] Bot wallet balance trend (should be stable or growing)
- [ ] Review and rotate bot wallet if needed

## Common Issues and Troubleshooting

### Bot Not Finding Opportunities

**Symptoms:** Bot is running but no `opportunityFound` events in logs.

**Diagnosis:**
1. Check delta threshold: is it too high?
   ```bash
   # Current setting
   echo $MIN_PROFIT_WEI
   ```
2. Check pool prices manually:
   ```bash
   # Read pool reserves
   cast call <POOL_ADDRESS> "getReserves()(uint112,uint112,uint32)" --rpc-url $ETH_RPC_URL
   ```
3. Check if markets are quiet (low volatility periods are normal)
4. Verify RPC is returning fresh data:
   ```bash
   cast block-number --rpc-url $ETH_RPC_URL
   ```

**Resolution:** Adjust thresholds, verify RPC connectivity, wait for market activity.

### Transactions Reverting

**Symptoms:** Opportunities detected but transactions revert on-chain.

**Diagnosis:**
1. Check revert reason:
   ```bash
   cast run <TX_HASH> --rpc-url $ETH_RPC_URL
   ```
2. Common revert reasons:
   - `InsufficientProfit` — Price moved between detection and execution
   - `GasPriceTooHigh` — Gas spiked above circuit breaker limit
   - `TradeSizeTooLarge` — Flash loan amount exceeds `maxTradeSize`
   - `AdapterNotApproved` — DEX adapter not registered
   - `NotAuthorized` — Bot wallet not set correctly

**Resolution:** Adjust safety parameters, check for MEV competition, reduce execution latency.

### RPC Connection Failures

**Symptoms:** `RPC call failed`, `ECONNREFUSED`, or `timeout` errors in logs.

**Diagnosis:**
1. Test RPC manually:
   ```bash
   cast block-number --rpc-url $ETH_RPC_URL
   cast chain-id --rpc-url $ETH_RPC_URL
   ```
2. Check provider status page (Alchemy, Infura, etc.)
3. Check rate limits — may be hitting request caps

**Resolution:**
- Switch to backup RPC endpoint
- Upgrade RPC plan for higher rate limits
- Add fallback RPC configuration

### High Gas Costs Eating Profits

**Symptoms:** Trades executing but net profit is very low or negative.

**Diagnosis:**
1. Check recent gas prices:
   ```bash
   cast gas-price --rpc-url $ETH_RPC_URL
   ```
2. Review gas usage per trade in logs
3. Compare `MIN_PROFIT_WEI` to actual gas costs

**Resolution:**
- Increase `MIN_PROFIT_WEI` to account for current gas
- Decrease `MAX_GAS_PRICE` to skip high-gas periods
- Consider L2 deployment where gas is cheaper

### Bot Wallet Running Low

**Symptoms:** `insufficient funds for gas` errors or declining wallet balance.

**Diagnosis:**
```bash
cast balance $BOT_WALLET_ADDRESS --rpc-url $ETH_RPC_URL
```

**Resolution:**
```bash
# Fund bot wallet from a funded wallet
cast send $BOT_WALLET_ADDRESS --value 0.1ether \
  --private-key $FUNDED_WALLET_KEY \
  --rpc-url $ETH_RPC_URL
```

Keep minimal funds (~0.1 ETH) in the hot wallet. Sweep profits to a cold wallet.

### Stale Price Data

**Symptoms:** `stale` events in logs, opportunities based on outdated prices.

**Diagnosis:**
1. Check block number freshness:
   ```bash
   cast block-number --rpc-url $ETH_RPC_URL
   ```
2. Compare bot's reported block number vs chain head
3. Check if WebSocket connection dropped (if using WS)

**Resolution:**
- Restart bot to refresh connections
- Switch to a lower-latency RPC endpoint
- Verify WebSocket URL is correct

## Log Analysis

### Log Levels

| Level | Meaning | Action |
|-------|---------|--------|
| `INFO` | Normal operation (startup, shutdown, trade executed) | None |
| `WARN` | Non-critical issue (high gas, low profit trade skipped) | Monitor |
| `ERROR` | Failed operation (RPC error, revert, timeout) | Investigate |

### Key Log Patterns

```bash
# Find all errors in last hour
grep "ERROR" bot.log | tail -50

# Find all executed trades
grep "ArbitrageExecuted" bot.log

# Find all reverted transactions
grep "revert\|Revert\|REVERT" bot.log

# Find gas-related circuit breaker activations
grep "GasPriceTooHigh\|Gas too high" bot.log

# Find opportunity detections
grep "opportunityFound" bot.log | wc -l

# Find RPC errors
grep "RPC\|ECONNREFUSED\|timeout" bot.log
```

### P&L Extraction

```bash
# Sum profits from logs (format depends on implementation)
grep "profit" bot.log | awk '{sum += $NF} END {print sum " wei"}'

# Count trades
grep "ArbitrageExecuted" bot.log | wc -l

# Average profit per trade
grep "ArbitrageExecuted" bot.log | awk '{sum += $NF; count++} END {print sum/count " wei avg"}'
```

## Performance Tuning

### Poll Interval

Controls how frequently the bot checks prices.

| Setting | Value | Trade-off |
|---------|-------|-----------|
| Aggressive | 1-2 seconds | More opportunities, higher RPC costs |
| Normal | 5-10 seconds | Good balance |
| Conservative | 15-30 seconds | Lower costs, may miss fast-moving opportunities |

### Gas Price Strategy

| Market Condition | MAX_GAS_PRICE | MIN_PROFIT_WEI |
|-----------------|---------------|-----------------|
| Low gas (< 20 gwei) | 30 gwei | 0.005 ETH |
| Normal gas (20-50 gwei) | 60 gwei | 0.01 ETH |
| High gas (50-100 gwei) | 80 gwei | 0.05 ETH |
| Very high gas (> 100 gwei) | Pause bot | — |

### Dynamic Parameter Adjustment

```bash
# Lower threshold during low-gas periods
cast send <EXECUTOR_ADDRESS> "setMaxGasPrice(uint256)" 30000000000 \
  --private-key $OWNER_KEY --rpc-url $ETH_RPC_URL

# Increase minimum profit during high-gas periods
cast send <EXECUTOR_ADDRESS> "setMinProfit(uint256)" 50000000000000000 \
  --private-key $OWNER_KEY --rpc-url $ETH_RPC_URL

# Adjust maximum trade size
cast send <EXECUTOR_ADDRESS> "setMaxTradeSize(uint256)" 20000000000000000000 \
  --private-key $OWNER_KEY --rpc-url $ETH_RPC_URL
```

## Emergency Procedures

### Circuit Breaker Activation (Pause All Trading)

```bash
# Pause the executor contract — stops all trade execution
cast send <EXECUTOR_ADDRESS> "pause()" \
  --private-key $OWNER_KEY \
  --rpc-url $ETH_RPC_URL

# Verify pause took effect
cast call <EXECUTOR_ADDRESS> "paused()(bool)" --rpc-url $ETH_RPC_URL
# Should return: true
```

### Resume After Emergency

```bash
# Verify issue is resolved before unpausing

# 1. Check contract state
cast call <EXECUTOR_ADDRESS> "owner()(address)" --rpc-url $ETH_RPC_URL
cast call <EXECUTOR_ADDRESS> "botWallet()(address)" --rpc-url $ETH_RPC_URL

# 2. Unpause
cast send <EXECUTOR_ADDRESS> "unpause()" \
  --private-key $OWNER_KEY \
  --rpc-url $ETH_RPC_URL

# 3. Restart bot in dry-run mode first
DRY_RUN=true pnpm dev
# Verify everything looks good, then switch to live
```

### Emergency Fund Withdrawal

See [Disaster Recovery](DISASTER_RECOVERY.md) for full procedures.

```bash
# Quick withdrawal of all WETH from executor
cast send <EXECUTOR_ADDRESS> "emergencyWithdraw(address)" $WETH_ADDRESS \
  --private-key $OWNER_KEY \
  --rpc-url $ETH_RPC_URL
```

## Bot Wallet Rotation

Rotate the hot wallet periodically (monthly or after any suspected compromise):

```bash
# 1. Stop the bot
# 2. Generate new wallet
cast wallet new --password

# 3. Update bot wallet on executor
cast send <EXECUTOR_ADDRESS> "setBotWallet(address)" <NEW_BOT_ADDRESS> \
  --private-key $OWNER_KEY \
  --rpc-url $ETH_RPC_URL

# 4. Fund new wallet
cast send <NEW_BOT_ADDRESS> --value 0.1ether \
  --private-key $OLD_BOT_KEY \
  --rpc-url $ETH_RPC_URL

# 5. Update .env with new BOT_PRIVATE_KEY and BOT_WALLET_ADDRESS
# 6. Restart bot
```

## Related Documentation

- [Deployment Guide](DEPLOYMENT.md) — Initial setup and deployment
- [Monitoring Guide](MONITORING.md) — Metrics and alerting
- [Disaster Recovery](DISASTER_RECOVERY.md) — Emergency procedures
- [Security Checklist](SECURITY_CHECKLIST.md) — Security verification
