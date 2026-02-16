export type { BotConfig, NetworkConfig, PoolDefinition, MonitorConfig, DetectorConfig, EnvVars } from "./types.js";
export { DEFAULT_CONFIG, DEFAULT_MONITOR, DEFAULT_DETECTOR, DEFAULT_MEV_CONFIG, MAINNET_MEV_CONFIG, MEV_BLOCKER_CONFIG, MAINNET_TOKENS, SEPOLIA_TOKENS, SEPOLIA_MONITOR, SEPOLIA_DETECTOR } from "./defaults.js";
export { parseEnv, buildConfig, validateConfig, ConfigError } from "./validate.js";
export { MAINNET_POOLS } from "./pools.js";

// ──── Chain Config System (Multi-chain Support) ────────────────────
export { loadChainConfig } from "./chains/index.js";
export type { ChainConfig } from "./chains/types.js";
