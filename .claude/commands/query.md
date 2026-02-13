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
    - `src/` and `bot/` documentation
    - Session history (if captured via `/land`)

2. **Receives contextualized answer** - Cognee returns:
    - Direct answer to your question
    - Relevant snippets from documentation
    - Related documents and patterns

3. **Displays results** - Shows:
    - The answer
    - Source documents referenced
    - Confidence scores

## Requirements

Cognee must be running (flashloaner-cognee-* containers):

```bash
# Check if Cognee is running (port 8003)
curl http://localhost:8003/health

# If not running, start Cognee containers
docker compose -f docker/cognee/docker-compose.yml up -d
```

## Implementation

When user invokes `/query <question>`:

1. **Check Cognee availability**:
   ```bash
   curl -s http://localhost:8003/health
   ```

   If not available, tell user to start Cognee.

2. **Submit search query**:
   ```bash
   curl -X POST http://localhost:8003/api/v1/search \
     -H "Content-Type: application/json" \
     -d "{\"query\": \"<question>\"}"
   ```

3. **Parse and display results**:
    - Show the answer
    - List source documents
    - Include relevant snippets
    - Suggest related queries

4. **Optionally refine**:
    - If answer is unclear, ask follow-up questions
    - If results seem stale, remind user to run `/land` to sync latest changes

## Datasets Searched

By default, searches across all datasets:

- `flashloaner-knowledge` - .claude/ files (commands, skills, agents)
- `flashloaner-patterns` - .rules/ files (architecture, technical patterns)
- `flashloaner-sessions` - Session history from `/land`
- `flashloaner-contracts` - Contract source and documentation

To search a specific dataset:

```bash
curl -X POST http://localhost:8003/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "your question",
    "dataset_name": "flashloaner-knowledge"
  }'
```

## When to Use

**Use `/query` when:**
- Looking for how a contract or bot component is configured
- Can't remember where documentation lives
- Want to find related patterns or architecture decisions
- Exploring the knowledge base for prior session context
- Need to recall DeFi protocol integration details

**Don't use `/query` when:**
- You know exactly which file to read (just read it)
- Cognee isn't running (start it first)
- Knowledge hasn't been synced yet (run `/land` to sync)

## Syncing Knowledge

**Automatic sync** via `/land`:
- Session summaries captured automatically (Step 7)
- Knowledge garden (`.claude/` and `.rules/`) syncs when changed (Step 7b)
- Knowledge graph updated with each session

**Manual sync**:
```bash
.claude/scripts/sync-to-cognee.sh
```

## Troubleshooting

**Cognee not responding:**
```bash
# Check container status
docker ps --filter "name=flashloaner-cognee"

# Check health endpoint
curl http://localhost:8003/health

# View logs
docker logs flashloaner-cognee-api
```

**Stale results:**
- Run `/land` to ensure latest changes are synced
- Wait a few moments for Cognee to process updates

**No results found:**
- Check if knowledge has been synced
- Try rephrasing your question
- Search a specific dataset
- Verify Cognee is processing correctly

## Cognee Container Ports

| Service    | Port  |
|------------|-------|
| PostgreSQL | 5436  |
| Redis      | 6383  |
| Neo4j HTTP | 7477  |
| Neo4j Bolt | 7690  |
| Cognee API | 8003  |

## Related Commands

- `/land` - Save session and sync to Cognee

## Related Documentation

- [Cognee Integration](.rules/architecture/cognee-integration.md)
- [System Overview](.rules/architecture/system-overview.md)
