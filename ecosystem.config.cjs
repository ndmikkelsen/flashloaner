module.exports = {
  apps: [
    {
      name: "flashloaner-arb",
      script: "bot/src/run-arb-mainnet.ts",
      interpreter: "node",
      interpreter_args: "--import tsx",

      // Fork mode (NOT cluster — nonce conflicts)
      instances: 1,
      exec_mode: "fork",

      // Auto-restart on crash
      autorestart: true,
      max_restarts: 10,             // Max restarts within restart window
      min_uptime: "10s",            // Consider crashed if exits within 10s
      restart_delay: 5000,          // 5s delay before restart

      // Memory-based restart (runaway memory protection)
      max_memory_restart: "500M",

      // Graceful shutdown
      kill_timeout: 10000,          // 10s graceful shutdown timeout (SIGTERM -> SIGKILL)

      // Log rotation
      error_file: ".data/logs/err.log",
      out_file: ".data/logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,

      // Environment (inherit from shell, allow .env override)
      env: {
        NODE_ENV: "production",
        // PM2 will inherit RPC_URL, PRIVATE_KEY, etc. from shell environment
        // Users can override with `pm2 start ecosystem.config.cjs --update-env` after changing .env
      },

      // Watch mode DISABLED for production (use pm2 restart for updates)
      watch: false,

      // Time zone (UTC for consistent logs)
      time: true,
    },
  ],
};
