---
triggers: ['/query', 'search knowledge', 'ask cognee']
description: Query flashloan-bot knowledge using Cognee semantic search
---

# /query -- Semantic Search

Query flashloan-bot knowledge using Cognee's semantic search capabilities.

## Usage

```
/query <your question>
```

## Examples

```
/query How does the flashloan execution flow work?
/query What DEX adapters are implemented?
/query How is the Uniswap V3 integration configured?
/query What security patterns are used for contract interactions?
/query How does the opportunity detection engine work?
/query What is the gas optimization strategy?
/query How do I add a new DEX adapter?
```

## How It Works

1. **Submits query to Cognee** - Uses semantic search across:
    - `.claude/` - Commands, skills, agents
    - `.rules/` - Architecture and technical patterns
    - `contracts/` and `docs/` - Solidity documentation
    - `features/` - BDD specs

2. **Receives contextualized answer** - Cognee returns:
    - Relevant snippets from documentation
    - Related documents and patterns

3. **Displays results** - Shows:
    - The answer
    - Source documents referenced

## Implementation

When user invokes `/query <question>`:

1. **Check Cognee availability**:
   ```bash
   curl -sk https://flashloaner-cognee.apps.compute.lan/health
   ```

   If not available, tell user to check the deployment (`kamal details`).

2. **Submit search query**:
   ```bash
   curl -sk -X POST https://flashloaner-cognee.apps.compute.lan/api/v1/search \
     -H "Content-Type: application/json" \
     -d "{\"query\": \"<question>\"}"
   ```

3. **Parse and display results**:
    - Show the answer
    - List source documents
    - Include relevant snippets

## Datasets Searched

Searches across all datasets:

- `flashloaner-skills` - .claude/skills/ (BDD pipeline, planning, TDD)
- `flashloaner-rules` - .rules/ (architecture, patterns, workflows)
- `flashloaner-project` - Root docs (CONSTITUTION, VISION, CLAUDE.md)
- `flashloaner-solidity` - Contract docs, audits, feature specs

## Syncing Knowledge

**Manual sync**:
```bash
.claude/scripts/sync-to-cognee.sh
```

**Clear and re-sync**:
```bash
.claude/scripts/sync-to-cognee.sh --clear
```

## Troubleshooting

**Cognee not responding:**
```bash
# Check health
curl -sk https://flashloaner-cognee.apps.compute.lan/health

# Check deployment status
kamal details

# View logs
kamal app logs
```

**Stale results:**
- Run `sync-to-cognee.sh` to push latest changes
- Use `--clear` flag for a fresh re-sync

## Related Commands

- `/land` - Save session and sync to Cognee

## Related Documentation

- [Cognee Integration](.rules/architecture/cognee-integration.md)
- [System Overview](.rules/architecture/system-overview.md)
