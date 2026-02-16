# Technology Stack

**Analysis Date:** 2026-02-16

## Languages

**Primary:**
- Solidity ^0.8.24 - Smart contracts (flash loan execution, DEX adapters, safety modules)
- TypeScript ^5.9.3 - Off-chain bot (opportunity detection, transaction building, execution)

**Secondary:**
- YAML - CI/CD workflows, pre-commit hooks configuration

## Runtime

**Environment:**
- Node.js 20 (specified in CI workflows via `NODE_VERSION: "20"`)
- EVM (Cancun hard fork target, per `foundry.toml` `evm_version = "cancun"`)

**Package Manager:**
- pnpm 9 (used in CI with `pnpm/action-setup@v4`, version 9)
- Lockfile: `pnpm-lock.yaml` present

## Frameworks

**Core:**
- Foundry (forge, cast, anvil) - Solidity build, test, deploy, and local chain
- ethers.js v6 (`"ethers": "^6"`) - Blockchain interaction from TypeScript

**Testing:**
- Foundry/forge-std v1.14.0+ - Solidity unit, fuzz, invariant, and fork testing
- Vitest ^4.0.18 - TypeScript unit and integration testing

**Build/Dev:**
- TypeScript Compiler (`tsc`) - TypeScript compilation to `dist/`
- tsx ^4.21.0 - TypeScript execution without pre-compilation (for `node --import tsx`)
- forge fmt - Solidity formatting
- forge build - Solidity compilation with optimizer

## Key Dependencies

**Critical (Runtime):**
- `ethers` ^6 - JSON-RPC provider, contract interaction, ABI encoding, wallet signing, EIP-1559 gas
- `dotenv` ^17.3.1 - Environment variable loading

**Critical (Dev):**
- `typescript` ^5.9.3 - TypeScript compiler
- `vitest` ^4.0.18 - Test runner
- `tsx` ^4.21.0 - TypeScript execution via Node.js loader
- `@types/node` ^25.2.3 - Node.js type definitions

**Solidity Libraries (git submodules in `lib/`):**
- `forge-std` v1.14.0+ - Foundry standard library (test utilities, script helpers, console2)
- `openzeppelin-contracts` v5.x (commit fcbae5394) - Ownable, ReentrancyGuard, SafeERC20, IERC20

## Configuration

**TypeScript:**
- Target: ES2022
- Module: NodeNext (ESM)
- Module Resolution: NodeNext
- Strict mode: enabled
- Root dir: `./bot`
- Output dir: `./dist`
- Source maps and declaration maps: enabled
- Config file: `tsconfig.json`

**Solidity:**
- Compiler: solc 0.8.24
- Optimizer: enabled, 200 runs
- EVM version: Cancun
- Source dir: `contracts/src`
- Test dir: `contracts/test`
- Script dir: `contracts/script`
- Config file: `foundry.toml`

**Vitest:**
- Root: `./bot`
- Test patterns: `__tests__/**/*.test.ts`, `src/**/*.test.ts`
- Environment: node
- Globals: enabled
- Config file: `vitest.config.ts`

**Foundry Profiles:**
- `default` - 256 fuzz runs, 256 invariant runs (depth 15)
- `ci` - 1000 fuzz runs, 500 invariant runs (depth 25)
- `security` - 10000 fuzz runs, 1000 invariant runs (depth 50)

**Environment:**
- `.env` file present (gitignored, never committed)
- `.env.example` - Template with placeholder values
- `.env.sepolia.example` - Sepolia-specific template
- `.env.mainnet.example` - Mainnet-specific template

**Build:**
- `foundry.toml` - Solidity compiler, optimizer, formatter, fuzz/invariant settings
- `tsconfig.json` - TypeScript compiler options
- `vitest.config.ts` - Test runner configuration
- `package.json` - Node.js project manifest and scripts

## NPM Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `build` | `tsc` | Compile TypeScript to `dist/` |
| `start` | `node --import tsx bot/src/index.ts` | Run bot (production) |
| `start:dry-run` | `DRY_RUN=true node --import tsx bot/src/index.ts` | Run bot in dry-run mode |
| `start:testnet` | `node --import tsx bot/src/run-testnet.ts` | Run bot on Sepolia testnet |
| `dev` | `LOG_LEVEL=debug node --import tsx bot/src/index.ts` | Run bot with debug logging |
| `test` | `vitest run` | Run TypeScript tests |
| `test:watch` | `vitest` | Run tests in watch mode |
| `typecheck` | `tsc --noEmit` | Type-check without emitting |
| `preflight` | `pnpm run typecheck && pnpm run test && gitleaks detect --source . --no-git` | Full pre-commit validation |

## Security Tooling

- **gitleaks** v8.30.0 - Pre-commit secret detection hook
  - Config: `.gitleaks.toml`
  - Hook: `.pre-commit-config.yaml`
- **Slither** v0.4.2 - Static analysis for Solidity (CI only, via `crytic/slither-action`)
- **pnpm audit** - Dependency vulnerability scanning (CI)

## Platform Requirements

**Development:**
- macOS or Linux
- Node.js 20+
- pnpm 9+
- Foundry toolchain (forge, cast, anvil)
- Git with submodule support

**CI/CD:**
- GitHub Actions (ubuntu-latest runners)
- 4 workflows: `ci.yml`, `security.yml`, `deploy.yml`, `performance.yml`
- Foundry installed via `foundry-rs/foundry-toolchain@v1`
- Node.js via `actions/setup-node@v6`

**Production:**
- Ethereum Mainnet (chain ID 1) - primary target
- Sepolia Testnet (chain ID 11155111) - testing
- Arbitrum (chain ID 42161) and Base (chain ID 8453) - supported in deploy script
- RPC endpoint required (JSON-RPC HTTP, optional WebSocket)

## Version Constraints

- Solidity `^0.8.24` is pinned in `foundry.toml` (`solc = "0.8.24"`) - required for Cancun EVM features
- Node.js 20 is pinned in CI workflows - no `.nvmrc` or `.node-version` file detected
- ethers.js v6 is a major version dependency - v5 patterns are incompatible (e.g., `BigNumber` vs `bigint`)
- OpenZeppelin Contracts v5.x (git submodule) - uses `Ownable(_owner)` constructor pattern (v5 API)
- ESM module system (`"type": "module"` in `package.json`) - all imports must use `.js` extensions

---

*Stack analysis: 2026-02-16*
