# Codebase Structure

**Analysis Date:** 2026-02-16

## Directory Layout

```
flashloaner/
├── contracts/                   # Solidity smart contracts (Foundry project)
│   ├── src/                     # Contract source files
│   │   ├── FlashloanExecutor.sol     # Main entry point contract
│   │   ├── FlashloanReceiver.sol     # Abstract flash loan callback handler
│   │   ├── adapters/                 # DEX adapter implementations
│   │   │   ├── UniswapV2Adapter.sol  # Uniswap V2 / SushiSwap adapter
│   │   │   └── UniswapV3Adapter.sol  # Uniswap V3 adapter with fee tiers
│   │   ├── interfaces/               # Solidity interface definitions
│   │   │   ├── IFlashloanExecutor.sol
│   │   │   ├── IFlashloanReceiver.sol
│   │   │   ├── IDEXAdapter.sol
│   │   │   ├── ICircuitBreaker.sol
│   │   │   └── IProfitValidator.sol
│   │   └── safety/                   # Safety/guardrail contracts
│   │       ├── CircuitBreaker.sol    # Gas/trade size limits, auto-pause
│   │       └── ProfitValidator.sol   # Stateless profit validation
│   ├── test/                    # Foundry test files
│   │   ├── unit/                     # Unit tests with mocks
│   │   │   ├── FlashloanExecutor.t.sol
│   │   │   ├── FlashloanReceiver.t.sol
│   │   │   └── adapters/
│   │   │       ├── UniswapV2Adapter.t.sol
│   │   │       └── UniswapV3Adapter.t.sol
│   │   ├── safety/                   # Safety contract tests
│   │   │   ├── CircuitBreaker.t.sol
│   │   │   ├── ProfitValidator.t.sol
│   │   │   └── SafetyIntegration.t.sol
│   │   ├── fork/                     # Mainnet fork integration tests
│   │   │   ├── ForkTestBase.sol
│   │   │   ├── AaveForkTest.sol
│   │   │   ├── ArbitrageForkTest.sol
│   │   │   └── UniswapForkTest.sol
│   │   ├── fuzz/                     # Fuzz tests
│   │   │   └── FlashloanFuzz.t.sol
│   │   ├── invariants/               # Invariant tests
│   │   │   └── SafetyInvariants.t.sol
│   │   ├── formal/                   # Formal verification tests
│   │   │   └── ProfitValidatorFormal.t.sol
│   │   ├── security/                 # Security audit test suite
│   │   │   └── SecurityAuditTests.t.sol
│   │   ├── interfaces/               # Interface compliance tests
│   │   │   └── Interfaces.t.sol
│   │   └── utils/                    # Test utilities
│   │       └── SafetyTestHelpers.sol
│   └── script/                  # Deployment/verification scripts
│       ├── Deploy.s.sol              # Full deployment script
│       └── Verify.s.sol             # Post-deployment verification
├── bot/                         # TypeScript off-chain bot
│   ├── src/                     # Bot source code
│   │   ├── index.ts                  # Main bot class + CLI entry point
│   │   ├── run-testnet.ts            # Sepolia testnet runner (report-only)
│   │   ├── reporting.ts              # Console output formatting
│   │   ├── monitor/                  # Price monitoring module
│   │   │   ├── PriceMonitor.ts       # DEX pool price polling
│   │   │   └── types.ts             # PoolConfig, PriceSnapshot, PriceDelta
│   │   ├── detector/                 # Opportunity detection module
│   │   │   ├── OpportunityDetector.ts  # Profitability analysis
│   │   │   └── types.ts             # SwapStep, SwapPath, ArbitrageOpportunity
│   │   ├── builder/                  # Transaction building module
│   │   │   ├── TransactionBuilder.ts  # ABI encoding, gas settings
│   │   │   ├── types.ts             # ArbitrageTransaction, PreparedTransaction
│   │   │   └── index.ts             # Barrel export
│   │   ├── engine/                   # Execution engine module
│   │   │   ├── ExecutionEngine.ts    # Submit, monitor, parse results
│   │   │   ├── types.ts             # ExecutionResult, ProfitRecord
│   │   │   └── index.ts             # Barrel export
│   │   ├── health/                   # Health monitoring module
│   │   │   ├── HealthMonitor.ts      # Balances, P&L, error rates
│   │   │   ├── types.ts             # HealthMonitorConfig, PnLReport, Alert
│   │   │   └── index.ts             # Barrel export
│   │   ├── mev/                      # MEV protection module
│   │   │   ├── FlashbotsSigner.ts    # Flashbots relay integration
│   │   │   ├── MEVBlockerSigner.ts   # MEV Blocker RPC integration
│   │   │   ├── types.ts             # FlashbotsConfig, MEVProtectionConfig
│   │   │   └── index.ts             # Factory + barrel export
│   │   └── config/                   # Bot configuration module
│   │       ├── types.ts             # BotConfig, NetworkConfig, PoolDefinition
│   │       ├── validate.ts          # parseEnv(), buildConfig(), validateConfig()
│   │       ├── defaults.ts          # Default configs, token addresses
│   │       ├── pools.ts             # Mainnet pool definitions
│   │       └── index.ts             # Barrel export
│   ├── __tests__/               # Vitest test files
│   │   ├── setup.ts                  # Test setup (global mocks)
│   │   ├── setup.test.ts            # Setup verification
│   │   ├── main.test.ts             # FlashloanBot integration tests
│   │   ├── bot.test.ts              # Bot module tests
│   │   ├── reporting.test.ts        # Reporting format tests
│   │   ├── monitor/
│   │   │   └── PriceMonitor.test.ts
│   │   ├── detector/
│   │   │   └── OpportunityDetector.test.ts
│   │   ├── builder/
│   │   │   └── TransactionBuilder.test.ts
│   │   ├── engine/
│   │   │   └── ExecutionEngine.test.ts
│   │   ├── health/
│   │   │   └── HealthMonitor.test.ts
│   │   ├── mev/
│   │   │   ├── FlashbotsSigner.test.ts
│   │   │   ├── MEVBlockerSigner.test.ts
│   │   │   └── factory.test.ts
│   │   ├── config/
│   │   │   └── validate.test.ts
│   │   ├── mocks/                    # Shared test mocks
│   │   │   ├── MockPriceMonitor.ts
│   │   │   ├── MockOpportunityDetector.ts
│   │   │   ├── MockProvider.ts
│   │   │   └── index.ts
│   │   ├── helpers/                  # Shared test helpers
│   │   │   ├── FixtureFactory.ts     # Test data builders
│   │   │   ├── TestHelpers.ts
│   │   │   ├── EventCapture.ts
│   │   │   ├── TimeHelpers.ts
│   │   │   ├── helpers.test.ts
│   │   │   └── index.ts
│   │   └── integration/              # Integration test suites
│   │       ├── IntegrationBase.ts
│   │       ├── helpers/
│   │       │   ├── fork-setup.ts
│   │       │   ├── event-collector.ts
│   │       │   └── scenario-builder.ts
│   │       ├── e2e/
│   │       │   ├── full-pipeline.test.ts
│   │       │   └── pipeline.test.ts
│   │       └── performance/
│   │           └── benchmarks.test.ts
│   ├── config/                  # Runtime config files
│   │   └── (sepolia-pools.json)      # Loaded at runtime by testnet runner
│   ├── docs/                    # Bot documentation
│   └── node_modules/            # Bot-specific dependencies (pnpm workspace)
├── lib/                         # Foundry dependencies (git submodules)
│   ├── forge-std/                    # Foundry test framework
│   └── openzeppelin-contracts/       # OpenZeppelin v5.x
├── deployments/                 # Deployment artifact output
│   ├── README.md
│   ├── .gitkeep
│   └── 11155111.json                 # Sepolia deployment addresses
├── .rules/                      # Technical documentation
│   ├── index.md                      # Documentation index
│   ├── architecture/
│   │   ├── system-overview.md        # Two-layer architecture overview
│   │   ├── contract-architecture.md  # Solidity design patterns
│   │   └── cognee-integration.md     # AI memory integration
│   └── patterns/
│       ├── bdd-workflow.md           # BDD pipeline conventions
│       ├── beads-integration.md      # Issue tracking with Beads
│       ├── git-workflow.md           # Git branching pipeline
│       ├── deployment.md             # Gated deployment process
│       ├── env-security.md           # Environment variable security
│       └── defi-security.md          # DeFi-specific security patterns
├── .claude/                     # Claude Code AI agent configuration
│   ├── agents/                       # Agent definitions (5 agents)
│   │   ├── contract-dev.md
│   │   ├── bot-dev.md
│   │   ├── defi-specialist.md
│   │   ├── security-lead.md
│   │   └── infra-dev.md
│   ├── commands/                     # Workflow commands
│   │   ├── deploy.md                 # /deploy gated deployment
│   │   ├── land.md                   # /land session protocol
│   │   └── query.md                  # /query Cognee search
│   ├── skills/                       # BDD pipeline skills
│   │   ├── README.md
│   │   ├── creating-features-from-tasks.md
│   │   ├── creating-tasks-from-plans.md
│   │   ├── implementing-with-tdd.md
│   │   └── planning-features.md
│   ├── scripts/                      # Cognee helper scripts
│   │   ├── cognee-local.sh
│   │   └── sync-to-cognee.sh
│   └── docker/                       # Cognee docker-compose
│       └── docker-compose.yml
├── .beads/                      # Issue tracking (Beads)
│   ├── config.yaml
│   └── metadata.json
├── .github/                     # GitHub Actions CI/CD
│   └── workflows/
│       ├── ci.yml                    # Main CI (tests, linting)
│       ├── deploy.yml                # Deployment workflow
│       ├── performance.yml           # Performance benchmarks
│       └── security.yml              # Security scans (Slither, gitleaks)
├── .planning/                   # GSD planning documents
│   └── codebase/                     # Codebase analysis docs (this directory)
├── scripts/                     # Shell utility scripts
│   ├── coverage-report.sh
│   └── security-scan.sh
├── docs/                        # Project-level documentation
├── cache/                       # Foundry build cache (gitignored)
├── out/                         # Foundry build output (gitignored)
├── foundry.toml                 # Foundry configuration
├── package.json                 # pnpm package manifest
├── pnpm-lock.yaml               # pnpm lockfile
├── tsconfig.json                # TypeScript configuration
├── vitest.config.ts             # Vitest test runner configuration
├── .env.example                 # Environment variable template
├── .gitignore                   # Git ignore rules
├── .gitleaks.toml               # Secret detection config
├── .pre-commit-config.yaml      # Pre-commit hooks
├── CLAUDE.md                    # AI agent instructions
├── AGENTS.md                    # Agent team overview
├── PLAN.md                      # Session handoff state
└── CONSTITUTION.md              # Project constitution
```

## Directory Purposes

**`contracts/src/`:**
- Purpose: All production Solidity smart contract source code
- Contains: Main contracts, abstract bases, interfaces, adapters, safety modules
- Key files: `FlashloanExecutor.sol` (302 lines, main entry), `FlashloanReceiver.sol` (200 lines, abstract base)

**`contracts/src/interfaces/`:**
- Purpose: Solidity interface definitions for all contract interactions
- Contains: 5 interface files defining the API boundaries
- Key files: `IFlashloanExecutor.sol` (SwapStep struct, core function signatures), `IDEXAdapter.sol` (swap/quote interface)

**`contracts/src/adapters/`:**
- Purpose: DEX-specific swap adapter implementations
- Contains: One file per supported DEX protocol
- Key files: `UniswapV2Adapter.sol` (123 lines), `UniswapV3Adapter.sol` (232 lines)

**`contracts/src/safety/`:**
- Purpose: On-chain safety guardrails and validation contracts
- Contains: Circuit breaker and profit validation
- Key files: `CircuitBreaker.sol` (229 lines), `ProfitValidator.sol` (34 lines)

**`contracts/test/`:**
- Purpose: All Foundry test files organized by test type
- Contains: Unit tests, fork tests, fuzz tests, invariant tests, formal verification, security audit tests
- Key subdirectories: `unit/` (isolated tests), `fork/` (mainnet state tests), `fuzz/` (randomized), `invariants/` (property-based), `security/` (audit suite)

**`contracts/script/`:**
- Purpose: Foundry deployment and verification scripts
- Contains: `Deploy.s.sol` (340 lines, full deployment), `Verify.s.sol` (261 lines, post-deployment checks)

**`bot/src/`:**
- Purpose: TypeScript off-chain bot source code organized by module
- Contains: 6 modules (monitor, detector, builder, engine, health, mev) plus config, reporting, entry points
- Each module follows: `ModuleName.ts` (class), `types.ts` (interfaces), `index.ts` (barrel export)

**`bot/src/config/`:**
- Purpose: Bot configuration parsing, validation, and defaults
- Contains: Type definitions, env parsing, config building, pool definitions, default values
- Key files: `validate.ts` (config parsing/validation), `defaults.ts` (default configs + token addresses), `pools.ts` (mainnet pool definitions)

**`bot/src/mev/`:**
- Purpose: MEV protection strategies for transaction submission
- Contains: Flashbots relay integration, MEV Blocker RPC integration, factory function
- Key files: `FlashbotsSigner.ts` (420 lines), `MEVBlockerSigner.ts` (264 lines), `index.ts` (factory)

**`bot/__tests__/`:**
- Purpose: All Vitest test files for the TypeScript bot
- Contains: Unit tests per module, shared mocks/helpers, integration tests, e2e pipeline tests, performance benchmarks
- Pattern: Mirrors `bot/src/` structure with test files in corresponding subdirectories

**`lib/`:**
- Purpose: Foundry library dependencies managed as git submodules
- Contains: `forge-std` (testing framework), `openzeppelin-contracts` (ERC20, access control, etc.)
- Generated: Yes (git submodule)
- Committed: Yes (submodule references)

**`deployments/`:**
- Purpose: Deployment artifact storage (contract addresses per chain)
- Contains: JSON files named by chain ID (e.g., `11155111.json` for Sepolia)
- Generated: By `Deploy.s.sol` script
- Committed: Yes

**`.rules/`:**
- Purpose: Technical documentation and pattern guides consumed by AI agents
- Contains: Architecture docs, workflow patterns, security guides
- Key files: `architecture/system-overview.md`, `architecture/contract-architecture.md`, `patterns/deployment.md`

**`.claude/`:**
- Purpose: Claude Code AI agent configuration
- Contains: Agent definitions, workflow commands, BDD skills, Cognee scripts
- Key files: `commands/land.md` (session protocol), `commands/deploy.md` (deployment workflow)

## Key File Locations

**Entry Points:**
- `bot/src/index.ts`: Main bot entry point + FlashloanBot class (283 lines)
- `bot/src/run-testnet.ts`: Sepolia testnet runner (176 lines)
- `contracts/script/Deploy.s.sol`: Full deployment script (340 lines)
- `contracts/script/Verify.s.sol`: Post-deployment verification (261 lines)

**Configuration:**
- `foundry.toml`: Foundry project config (Solidity compiler, test paths, profiles, formatter)
- `package.json`: pnpm package manifest (scripts, dependencies)
- `tsconfig.json`: TypeScript config (ES2022, NodeNext modules, strict)
- `vitest.config.ts`: Vitest config (root: ./bot, include patterns)
- `.env.example`: Environment variable template (DO NOT read contents)
- `.gitleaks.toml`: Secret detection rules
- `.pre-commit-config.yaml`: Pre-commit hook configuration

**Core On-Chain Logic:**
- `contracts/src/FlashloanExecutor.sol`: Main arbitrage orchestrator (302 lines)
- `contracts/src/FlashloanReceiver.sol`: Abstract flash loan callback handler (200 lines)
- `contracts/src/adapters/UniswapV2Adapter.sol`: V2 swap adapter (123 lines)
- `contracts/src/adapters/UniswapV3Adapter.sol`: V3 swap adapter with fee tiers (232 lines)
- `contracts/src/safety/CircuitBreaker.sol`: Operational limits + auto-pause (229 lines)
- `contracts/src/safety/ProfitValidator.sol`: Profit threshold validation (34 lines)

**Core Off-Chain Logic:**
- `bot/src/monitor/PriceMonitor.ts`: DEX pool price polling (243 lines)
- `bot/src/detector/OpportunityDetector.ts`: Arbitrage profitability analysis (294 lines)
- `bot/src/builder/TransactionBuilder.ts`: ABI calldata encoding (241 lines)
- `bot/src/engine/ExecutionEngine.ts`: Transaction submission + monitoring (495 lines)
- `bot/src/health/HealthMonitor.ts`: Health + P&L tracking (298 lines)
- `bot/src/mev/FlashbotsSigner.ts`: Flashbots relay bundle submission (420 lines)
- `bot/src/mev/MEVBlockerSigner.ts`: MEV Blocker private RPC (264 lines)

**Type Definitions:**
- `bot/src/monitor/types.ts`: PoolConfig, PriceSnapshot, PriceDelta (73 lines)
- `bot/src/detector/types.ts`: SwapStep, SwapPath, ArbitrageOpportunity (100 lines)
- `bot/src/builder/types.ts`: ArbitrageTransaction, PreparedTransaction (84 lines)
- `bot/src/engine/types.ts`: ExecutionResult, ProfitRecord (92 lines)
- `bot/src/health/types.ts`: HealthMonitorConfig, PnLReport, Alert (111 lines)
- `bot/src/mev/types.ts`: FlashbotsConfig, MEVProtectionConfig (64 lines)
- `bot/src/config/types.ts`: BotConfig, PoolDefinition, EnvVars (72 lines)

**Testing:**
- `contracts/test/unit/FlashloanExecutor.t.sol`: Executor unit tests
- `contracts/test/unit/FlashloanReceiver.t.sol`: Receiver unit tests
- `contracts/test/fork/ForkTestBase.sol`: Shared fork test setup
- `contracts/test/fuzz/FlashloanFuzz.t.sol`: Fuzz tests
- `contracts/test/invariants/SafetyInvariants.t.sol`: Invariant tests
- `contracts/test/security/SecurityAuditTests.t.sol`: Security audit suite
- `bot/__tests__/main.test.ts`: Bot integration tests
- `bot/__tests__/integration/e2e/full-pipeline.test.ts`: Full pipeline e2e
- `bot/__tests__/mocks/`: Shared mock implementations
- `bot/__tests__/helpers/FixtureFactory.ts`: Test data builders

## Naming Conventions

**Solidity Files:**
- Contracts: PascalCase matching contract name (`FlashloanExecutor.sol` contains `contract FlashloanExecutor`)
- Interfaces: `I` prefix + PascalCase (`IFlashloanExecutor.sol` contains `interface IFlashloanExecutor`)
- Test files: Contract name + `.t.sol` suffix (`FlashloanExecutor.t.sol`)
- Script files: Action name + `.s.sol` suffix (`Deploy.s.sol`)

**TypeScript Files:**
- Classes: PascalCase matching class name (`PriceMonitor.ts` contains `class PriceMonitor`)
- Types: `types.ts` in each module directory
- Barrel exports: `index.ts` in each module directory
- Test files: Class name + `.test.ts` suffix (`PriceMonitor.test.ts`)
- Mocks: `Mock` prefix + class name (`MockPriceMonitor.ts`)

**Directories:**
- Solidity: lowercase (`adapters/`, `interfaces/`, `safety/`, `unit/`, `fork/`, `fuzz/`)
- TypeScript: lowercase module names (`monitor/`, `detector/`, `builder/`, `engine/`, `health/`, `mev/`, `config/`)
- Test directories: `__tests__/` for TypeScript (co-located within `bot/`), `test/` for Solidity (within `contracts/`)

## Where to Add New Code

**New DEX Adapter (Solidity):**
- Interface already exists: `contracts/src/interfaces/IDEXAdapter.sol`
- Implementation: Create `contracts/src/adapters/{DexName}Adapter.sol` implementing `IDEXAdapter`
- Unit test: Create `contracts/test/unit/adapters/{DexName}Adapter.t.sol`
- Fork test: Add to `contracts/test/fork/` if testing against real pools
- Register: Add to `Deploy.s.sol` deployment + `executor.registerAdapter()` call

**New DEX Support (TypeScript):**
- Add protocol to `DEXProtocol` type in `bot/src/monitor/types.ts`
- Add pool definitions to `bot/src/config/pools.ts` for mainnet
- Add adapter address mapping in `TransactionBuilderConfig.adapters`
- Add V3-style `extraData` encoding in `TransactionBuilder.encodeExtraData()` if needed
- PriceMonitor already supports V2/V3 price reading; add new ABI if protocol differs

**New Flash Loan Provider:**
- On-chain: Add callback to `FlashloanReceiver.sol` (new function signature per provider spec)
- On-chain: Add request method in `FlashloanExecutor.sol` (e.g., `_requestBalancerFlashLoan()`)
- Off-chain: Add to `FlashLoanProvider` type in `bot/src/builder/types.ts`
- Off-chain: Add provider address to `TransactionBuilderConfig.flashLoanProviders`
- Off-chain: Add fee rate to `FlashLoanFees` in `bot/src/detector/types.ts`

**New Safety Contract:**
- Interface: Create `contracts/src/interfaces/I{ContractName}.sol`
- Implementation: Create `contracts/src/safety/{ContractName}.sol`
- Tests: Create `contracts/test/safety/{ContractName}.t.sol`
- Integration: Wire into `FlashloanExecutor` or deploy as standalone companion

**New Bot Module:**
- Create `bot/src/{module}/` directory with:
  - `{ModuleName}.ts` -- class extending EventEmitter
  - `types.ts` -- all interfaces for the module
  - `index.ts` -- barrel export
- Create `bot/__tests__/{module}/{ModuleName}.test.ts`
- Wire events in `FlashloanBot.wireEvents()` in `bot/src/index.ts`

**New MEV Protection Strategy:**
- Create `bot/src/mev/{StrategyName}Signer.ts` implementing `ExecutionSigner` interface
- Add config type to `bot/src/mev/types.ts`
- Add case to `createMEVProtectedSigner()` factory in `bot/src/mev/index.ts`
- Add default config to `bot/src/config/defaults.ts`

**New Configuration Parameter:**
- Add to relevant interface in `bot/src/config/types.ts` (BotConfig, MonitorConfig, DetectorConfig)
- Add default in `bot/src/config/defaults.ts`
- Add env var parsing in `bot/src/config/validate.ts`
- Add validation in `validateConfig()` in `bot/src/config/validate.ts`
- Add test in `bot/__tests__/config/validate.test.ts`

**New Test Helpers / Fixtures:**
- TypeScript: Add to `bot/__tests__/helpers/` (shared) or `bot/__tests__/mocks/` (mock classes)
- Solidity: Add to `contracts/test/utils/` (shared helpers)

## Special Directories

**`lib/`:**
- Purpose: Foundry library dependencies (forge-std, openzeppelin-contracts)
- Generated: Via `forge install` (git submodules)
- Committed: Yes (`.gitmodules` references + submodule SHAs)
- Do not modify files in this directory

**`cache/`:**
- Purpose: Foundry compilation cache
- Generated: By `forge build`
- Committed: No (gitignored)

**`out/`:**
- Purpose: Foundry build output (ABI, bytecode)
- Generated: By `forge build`
- Committed: No (gitignored)

**`node_modules/`:**
- Purpose: Node.js dependencies
- Generated: By `pnpm install`
- Committed: No (gitignored)

**`dist/`:**
- Purpose: TypeScript compilation output
- Generated: By `pnpm build` (tsc)
- Committed: No (gitignored)

**`broadcast/`:**
- Purpose: Foundry deployment broadcast records
- Generated: By `forge script --broadcast`
- Committed: Selectively (deployment artifacts)

**`deployments/`:**
- Purpose: Contract address records per chain ID
- Generated: By `Deploy.s.sol` via `vm.writeFile()`
- Committed: Yes
- Format: JSON with chainId, network, contracts, configuration

**`.beads/`:**
- Purpose: Issue tracking data (Beads tool)
- Committed: Yes
- Key files: `config.yaml` (project prefix, settings), `metadata.json` (issue metadata)

**`.planning/`:**
- Purpose: GSD planning and codebase analysis documents
- Committed: Yes
- Key subdirectory: `.planning/codebase/` (analysis documents consumed by GSD commands)

---

*Structure analysis: 2026-02-16*
