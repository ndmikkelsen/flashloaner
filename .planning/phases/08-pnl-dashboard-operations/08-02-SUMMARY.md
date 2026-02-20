---
phase: 08-pnl-dashboard-operations
plan: 02
subsystem: operations
tags: [pm2, process-management, log-rotation, production]
dependencies:
  requires:
    - bot/src/run-arb-mainnet.ts (entry point)
  provides:
    - ecosystem.config.cjs (PM2 configuration)
    - .data/logs/ (log directory structure)
    - pm2:* scripts (process management convenience)
  affects:
    - package.json (added 7 pm2 scripts)
    - .gitignore (data directory exclusion rules)
tech-stack:
  added:
    - pm2@^5.3.0 (process manager)
  patterns:
    - Fork mode with single instance (nonce safety)
    - Memory-based auto-restart (500MB threshold)
    - Log rotation with pm2-logrotate module
    - node --import tsx interpreter for ESM TypeScript
key-files:
  created:
    - ecosystem.config.cjs (PM2 app config)
    - .data/logs/.gitkeep (log directory structure marker)
  modified:
    - package.json (pm2 convenience scripts)
    - .gitignore (data directory exclusion)
decisions:
  - Use .cjs extension for ecosystem config (ESM compatibility)
  - Fork mode only (prevents nonce conflicts with multiple wallet instances)
  - 500MB memory limit for runaway leak protection
  - Log rotation delegated to pm2-logrotate module
  - Graceful shutdown timeout 10s (SIGTERM -> SIGKILL)
metrics:
  duration_seconds: 133
  tasks_completed: 3
  files_created: 2
  files_modified: 2
  commits: 3
  completed_at: "2026-02-20T16:46:09Z"
---

# Phase 08 Plan 02: PM2 Process Management Summary

**PM2 ecosystem config with fork mode, tsx interpreter, memory-based auto-restart, and log rotation**

## Overview

Created PM2 ecosystem configuration for unattended bot operation on Arbitrum mainnet. The config uses .cjs extension for ESM compatibility, fork mode to prevent nonce conflicts, node+tsx interpreter for TypeScript ESM support, 500MB memory limit for runaway leak protection, and log rotation to .data/logs/ directory.

## What Was Built

### 1. PM2 Ecosystem Config (ecosystem.config.cjs)

**File:** `ecosystem.config.cjs` (CommonJS module for PM2)

**Key features:**
- **Interpreter:** `node --import tsx` (NOT `tsx` binary — ensures TypeScript ESM compatibility)
- **Fork mode:** Single instance to prevent nonce collision when signing transactions
- **Memory limit:** 500MB auto-restart threshold (typical usage <100MB, so 500MB catches real leaks)
- **Auto-restart:** Max 10 restarts, 10s min uptime, 5s delay between restarts
- **Graceful shutdown:** 10s timeout (SIGTERM → SIGKILL)
- **Log rotation:** Writes to `.data/logs/out.log` and `.data/logs/err.log` with timestamp format
- **Environment:** Inherits RPC_URL, PRIVATE_KEY from shell (no secrets in config file)

**Why .cjs extension?**
ESM projects with `"type": "module"` in package.json require .cjs extension for CommonJS config files. Using .js would cause module resolution errors.

### 2. PM2 Convenience Scripts (package.json)

Added 7 npm scripts for common PM2 operations:

| Script | Purpose |
|--------|---------|
| `pm2:start` | Start bot using ecosystem config |
| `pm2:stop` | Stop bot gracefully (keeps in pm2 list) |
| `pm2:restart` | Restart bot (use after code changes) |
| `pm2:logs` | Tail logs (last 100 lines + follow) |
| `pm2:status` | Show pm2 process list (status, uptime, restarts, memory) |
| `pm2:monit` | Real-time monitoring dashboard (CPU, memory, logs) |
| `pm2:delete` | Remove from pm2 list (use before fresh start) |

**Also added:** Comment with log rotation setup instructions:
```json
"// PM2 Process Management": "Install pm2 globally: npm i -g pm2. For log rotation: pm2 install pm2-logrotate && pm2 set pm2-logrotate:max_size 10M && pm2 set pm2-logrotate:retain 7"
```

### 3. Log Directory Structure (.data/logs/)

**Created:** `.data/logs/` directory with `.gitkeep` file

**.gitignore rules:**
```
.data/*
!.data/logs/
.data/logs/*
!.data/logs/.gitkeep
```

**Effect:**
- All files in `.data/` are ignored (including JSONL trade persistence files)
- Log files in `.data/logs/` are ignored (out.log, err.log)
- `.gitkeep` file is tracked to preserve directory structure in git

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

All verification steps passed:

1. ✅ `node ecosystem.config.cjs` — Valid CommonJS syntax
2. ✅ `cat ecosystem.config.cjs | grep "interpreter.*node"` — Confirms node interpreter
3. ✅ `cat ecosystem.config.cjs | grep "interpreter_args.*--import tsx"` — Confirms tsx loading
4. ✅ `cat ecosystem.config.cjs | grep "exec_mode.*fork"` — Confirms fork mode
5. ✅ `cat package.json | grep pm2:start` — Confirms PM2 scripts exist
6. ✅ `ls -la .data/logs/.gitkeep` — Confirms log directory structure
7. ✅ `git check-ignore .data/logs/out.log` — Confirms logs are gitignored

## Success Criteria Met

✅ PM2 ecosystem config exists as `ecosystem.config.cjs` with fork mode, node+tsx interpreter, 500MB memory limit, and log rotation
✅ package.json has 7 pm2 convenience scripts
✅ `.data/logs` directory exists with `.gitkeep` tracked by git
✅ Bot can run via `pnpm pm2:start` and operate unattended

## Usage

**Start the bot:**
```bash
pnpm pm2:start
```

**Monitor logs:**
```bash
pnpm pm2:logs
```

**Check status:**
```bash
pnpm pm2:status
```

**Restart after code changes:**
```bash
pnpm pm2:restart
```

**Stop the bot:**
```bash
pnpm pm2:stop
```

**Setup log rotation (one-time):**
```bash
npm i -g pm2
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

## Impact

This completes the operational infrastructure for unattended bot execution:
- **Plan 08-01:** JSONL persistence for crash-safe trade tracking
- **Plan 08-02 (THIS PLAN):** PM2 process management with auto-restart and log rotation
- **Plan 08-03 (NEXT):** P&L dashboard for real-time profit monitoring

The bot can now run 24/7 with automatic restart on crash, memory leak protection, and log rotation to prevent disk fill.

## Self-Check

✅ **Files exist:**
- ecosystem.config.cjs: EXISTS
- .data/logs/.gitkeep: EXISTS

✅ **Commits exist:**
- 3831e67: feat(08-pnl-dashboard-operations): create PM2 ecosystem config with fork mode and tsx interpreter
- 20abd1b: feat(08-pnl-dashboard-operations): add PM2 convenience scripts to package.json
- 6ddfeae: feat(08-pnl-dashboard-operations): create .data/logs directory with .gitkeep

## Self-Check: PASSED
