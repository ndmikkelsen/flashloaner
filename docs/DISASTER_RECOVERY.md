# Disaster Recovery

Emergency procedures for recovering from critical failures, security incidents, and fund-at-risk scenarios.

## Severity Classification

| Severity | Description | Response Time | Example |
|----------|-------------|---------------|---------|
| **P0 — Critical** | Active fund loss or imminent threat | Immediate (minutes) | Exploit in progress, key compromised |
| **P1 — High** | System down or safety controls bypassed | Within 1 hour | Bot down, contract behaving unexpectedly |
| **P2 — Medium** | Degraded operation, no fund risk | Within 4 hours | High revert rate, RPC issues |
| **P3 — Low** | Minor issue, system operational | Within 24 hours | Suboptimal parameters, stale prices |

## P0: Active Exploit or Key Compromise

### Step 1: Pause All Contracts (Immediate)

```bash
# Pause executor on all deployed chains
cast send <EXECUTOR_ETH> "pause()" \
  --private-key $OWNER_KEY \
  --rpc-url $ETH_RPC_URL

cast send <EXECUTOR_ARB> "pause()" \
  --private-key $OWNER_KEY \
  --rpc-url $ARBITRUM_RPC_URL

cast send <EXECUTOR_BASE> "pause()" \
  --private-key $OWNER_KEY \
  --rpc-url $BASE_RPC_URL

# Verify all paused
cast call <EXECUTOR_ETH> "paused()(bool)" --rpc-url $ETH_RPC_URL
cast call <EXECUTOR_ARB> "paused()(bool)" --rpc-url $ARBITRUM_RPC_URL
cast call <EXECUTOR_BASE> "paused()(bool)" --rpc-url $BASE_RPC_URL
```

### Step 2: Stop the Bot

```bash
# Kill the bot process
sudo systemctl stop flashloaner-bot
# or
pm2 stop flashloaner-bot
# or
kill $(pgrep -f flashloaner)
```

### Step 3: Emergency Fund Withdrawal

```bash
# Withdraw all tokens from executor
cast send <EXECUTOR> "emergencyWithdraw(address)" $WETH_ADDRESS \
  --private-key $OWNER_KEY \
  --rpc-url $ETH_RPC_URL

cast send <EXECUTOR> "emergencyWithdraw(address)" $USDC_ADDRESS \
  --private-key $OWNER_KEY \
  --rpc-url $ETH_RPC_URL

cast send <EXECUTOR> "emergencyWithdraw(address)" $DAI_ADDRESS \
  --private-key $OWNER_KEY \
  --rpc-url $ETH_RPC_URL

# Withdraw ETH
cast send <EXECUTOR> "emergencyWithdrawETH()" \
  --private-key $OWNER_KEY \
  --rpc-url $ETH_RPC_URL
```

### Step 4: Secure Compromised Keys

If private key compromise is suspected:

```bash
# IMMEDIATELY transfer all funds from compromised wallet
# Automated bots scan for leaked keys in real-time

# 1. Transfer bot wallet funds to safe address
cast send $SAFE_ADDRESS --value $(cast balance $BOT_WALLET_ADDRESS --rpc-url $ETH_RPC_URL) \
  --private-key $BOT_PRIVATE_KEY \
  --rpc-url $ETH_RPC_URL

# 2. Generate new wallets
cast wallet new --password  # New bot wallet
cast wallet new            # New deployer (if compromised)

# 3. Rotate all secrets
# - RPC API keys
# - Etherscan API keys
# - Flashbots auth keys
# - Any other credentials in .env
```

### Step 5: Remove Secrets from Git (If Committed)

```bash
# CRITICAL: Do this AFTER transferring funds

# Option A: git-filter-repo (recommended)
pip install git-filter-repo
git filter-repo --invert-paths --path .env

# Option B: BFG Repo-Cleaner
bfg --delete-files .env

# Clean up
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push (coordinate with team first)
git push --force

# Verify clean
gitleaks detect --source .
```

## P1: System Down

### Bot Process Crash

```bash
# 1. Check process status
systemctl status flashloaner-bot
# or
pm2 status

# 2. Check logs for crash reason
journalctl -u flashloaner-bot --since "1 hour ago"
# or
pm2 logs flashloaner-bot --lines 100

# 3. Restart
sudo systemctl restart flashloaner-bot
# or
pm2 restart flashloaner-bot

# 4. If crash persists, start in dry-run mode
DRY_RUN=true pnpm dev
```

### RPC Provider Outage

```bash
# 1. Verify primary RPC is down
cast block-number --rpc-url $ETH_RPC_URL

# 2. Switch to backup RPC
export ETH_RPC_URL=$BACKUP_RPC_URL

# 3. Restart bot with backup
sudo systemctl restart flashloaner-bot

# 4. Monitor backup RPC health
watch -n 5 'cast block-number --rpc-url $ETH_RPC_URL'
```

### Contract Behaving Unexpectedly

```bash
# 1. Pause immediately
cast send <EXECUTOR> "pause()" --private-key $OWNER_KEY --rpc-url $ETH_RPC_URL

# 2. Investigate recent transactions
cast logs --address <EXECUTOR> --rpc-url $ETH_RPC_URL --from-block -100

# 3. Check all state variables
cast call <EXECUTOR> "owner()(address)" --rpc-url $ETH_RPC_URL
cast call <EXECUTOR> "botWallet()(address)" --rpc-url $ETH_RPC_URL
cast call <EXECUTOR> "maxGasPrice()(uint256)" --rpc-url $ETH_RPC_URL
cast call <EXECUTOR> "minProfit()(uint256)" --rpc-url $ETH_RPC_URL
cast call <EXECUTOR> "maxTradeSize()(uint256)" --rpc-url $ETH_RPC_URL

# 4. Replay suspicious transactions
cast run <SUSPICIOUS_TX_HASH> --rpc-url $ETH_RPC_URL

# 5. If root cause found and fixable: fix parameters and unpause
# 6. If contract bug: withdraw funds, deploy new version
```

## P2: Degraded Operation

### High Transaction Revert Rate

```bash
# 1. Check recent reverts
cast run <REVERTED_TX_HASH> --rpc-url $ETH_RPC_URL

# 2. Common causes and fixes:
#    - InsufficientProfit → Increase MIN_PROFIT_WEI
#    - GasPriceTooHigh → Increase MAX_GAS_PRICE or wait for gas to drop
#    - Slippage exceeded → Reduce MAX_TRADE_SIZE
#    - MEV competition → Enable Flashbots submission

# 3. Adjust parameters
cast send <EXECUTOR> "setMinProfit(uint256)" <NEW_VALUE> \
  --private-key $OWNER_KEY --rpc-url $ETH_RPC_URL
```

### Persistent RPC Errors

```bash
# 1. Check error patterns in logs
grep "RPC\|timeout\|ECONNREFUSED" bot.log | tail -20

# 2. Test RPC health
for i in $(seq 1 10); do
  time cast block-number --rpc-url $ETH_RPC_URL
done

# 3. If rate limited, reduce poll frequency in bot config
# 4. If persistent, switch RPC provider
```

### Unprofitable Trading Period

```bash
# 1. Review P&L
grep "profit" bot.log | tail -50

# 2. Check gas market
cast gas-price --rpc-url $ETH_RPC_URL

# 3. Options:
#    a. Increase MIN_PROFIT_WEI to skip marginal trades
#    b. Pause and wait for better market conditions
#    c. Switch to lower-gas chains (Arbitrum, Base)

# 4. If losses continue, pause and investigate
cast send <EXECUTOR> "pause()" --private-key $OWNER_KEY --rpc-url $ETH_RPC_URL
```

## Contract Redeployment

If a contract bug requires redeployment:

### 1. Secure Current Deployment

```bash
# Pause
cast send <EXECUTOR> "pause()" --private-key $OWNER_KEY --rpc-url $ETH_RPC_URL

# Withdraw all funds
cast send <EXECUTOR> "emergencyWithdraw(address)" $WETH_ADDRESS \
  --private-key $OWNER_KEY --rpc-url $ETH_RPC_URL
cast send <EXECUTOR> "emergencyWithdrawETH()" \
  --private-key $OWNER_KEY --rpc-url $ETH_RPC_URL
```

### 2. Fix and Test

```bash
# Fix the bug in contract code

# Run full test suite
forge test -vvv
FOUNDRY_PROFILE=security forge test
forge test --fork-url $ETH_RPC_URL

# Security scan
./scripts/security-scan.sh
```

### 3. Deploy New Version

```bash
# Fork simulation first
forge script script/Deploy.s.sol --fork-url $ETH_RPC_URL -vvvv

# If simulation passes, deploy
forge script script/Deploy.s.sol \
  --rpc-url $ETH_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  --slow \
  -vvvv
```

### 4. Update Bot Configuration

```bash
# Update .env with new contract addresses
FLASHLOAN_EXECUTOR_ADDRESS=0x<NEW_ADDRESS>

# Restart bot in dry-run mode
DRY_RUN=true pnpm dev

# Verify, then switch to live
DRY_RUN=false pnpm dev
```

## Backup Procedures

### What to Back Up

| Item | Location | Backup Method | Frequency |
|------|----------|---------------|-----------|
| Bot wallet keystore | `~/.flashloaner/` | Encrypted copy to secure storage | After creation/rotation |
| `.env` configuration | Project root (gitignored) | Encrypted copy to secure storage | After each change |
| Deployment broadcast logs | `broadcast/` | Git (committed to repo) | After each deployment |
| Bot logs | `/var/log/flashloaner/` | Log rotation + archival | Daily |
| Deployed contract addresses | `.env` + docs | Document in deployment notes | After each deployment |

### Backup Verification

```bash
# Verify keystore backup
cast wallet address --keystore <BACKUP_PATH>

# Verify .env backup
diff .env <BACKUP_PATH>/.env.backup

# Verify broadcast logs are committed
git log --oneline -- broadcast/
```

## Recovery Contacts

Maintain an emergency contact list:

| Role | Responsibility | Contact Method |
|------|----------------|----------------|
| Contract owner | Pause contracts, withdraw funds | Hardware wallet holder |
| Bot operator | Stop/restart bot, adjust parameters | System admin |
| Security lead | Investigate incidents, coordinate response | On-call rotation |
| RPC provider | Escalate connectivity issues | Support ticket |

## Post-Incident Review

After any P0 or P1 incident:

1. **Timeline**: Document exact sequence of events
2. **Root cause**: Identify what went wrong and why
3. **Impact**: Quantify fund loss (if any), downtime
4. **Response evaluation**: What went well, what could improve
5. **Action items**: Specific changes to prevent recurrence
6. **Documentation update**: Update this document and relevant procedures

## Related Documentation

- [Security Checklist](SECURITY_CHECKLIST.md) — Pre-deployment verification
- [Operations Runbook](OPERATIONS.md) — Day-to-day operations
- [Monitoring Guide](MONITORING.md) — Metrics and alerting
- [Deployment Guide](DEPLOYMENT.md) — Deployment procedures
- [Security Policy](SECURITY.md) — Threat model and defense layers
