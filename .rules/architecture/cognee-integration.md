---
description: Cognee AI memory layer integration for flashloan arbitrage bot knowledge system
tags: [cognee, architecture, knowledge-graph, semantic-search]
last_updated: 2026-02-13
---

# Cognee Integration Architecture

Cognee provides semantic search, knowledge graphs, and AI-powered insights over the flashloan bot documentation, BDD specs, trading patterns, and contract documentation.

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Knowledge Sources                         │
│  (.claude/ + .rules/ + contracts/docs/ + Session History)   │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ /land (auto-sync) or sync-to-cognee.sh
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                    Cognee Stack                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  PostgreSQL  │  │    Redis     │  │    Neo4j     │      │
│  │  + pgvector  │  │   (Cache)    │  │   (Graph)    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                  │                 │              │
│         └──────────────────┴─────────────────┘              │
│                           │                                 │
│                  ┌────────▼────────┐                        │
│                  │  Cognee API     │                        │
│                  │  (FastAPI)      │                        │
│                  └────────┬────────┘                        │
└───────────────────────────┼─────────────────────────────────┘
                            │
                            │ HTTP API
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Consumers                               │
│  - /query command (semantic search)                         │
│  - /land command (session capture)                          │
│  - Claude agents (context retrieval)                        │
│  - Neo4j Browser (graph visualization)                      │
└─────────────────────────────────────────────────────────────┘
```

## Unique Deployment (Isolated from Other Projects)

This Cognee instance is **completely independent** from any other project's Cognee deployment (e.g., compute-stack). All container names, ports, volumes, and networks use the `flashloaner-cognee-*` prefix.

### Port Mappings

| Service | Container | Host | Purpose |
|---------|-----------|------|---------|
| PostgreSQL | 5432 | **5436** | Vector DB |
| Redis | 6379 | **6383** | Cache |
| Neo4j HTTP | 7474 | **7477** | Browser UI |
| Neo4j Bolt | 7687 | **7690** | Protocol |
| Cognee API | 8000 | **8003** | REST API |

### Container Names

| Service | Container Name |
|---------|---------------|
| PostgreSQL | `flashloaner-cognee-postgres` |
| Redis | `flashloaner-cognee-redis` |
| Neo4j | `flashloaner-cognee-neo4j` |
| Cognee API | `flashloaner-cognee-api` |

### Docker Volumes

| Volume | Purpose |
|--------|---------|
| `flashloaner-cognee-pgdata` | PostgreSQL data + pgvector |
| `flashloaner-cognee-redis` | Redis persistence |
| `flashloaner-cognee-neo4j` | Neo4j graph data |

### Docker Network

| Network | Purpose |
|---------|---------|
| `flashloaner-cognee` | Internal communication between Cognee services |

## Components

### 1. Data Sources

**Claude Configuration** (`.claude/`)
- Commands (workflow automation)
- Skills (BDD pipeline, planning, TDD)
- Agent definitions
- Hook configurations

**Technical Documentation** (`.rules/`)
- Architecture (system overview, contract architecture, this document)
- Patterns (BDD workflow, beads integration, git workflow, deployment, security)

**Contract Documentation** (`contracts/docs/`)
- Solidity NatSpec documentation
- Interface specifications
- Audit reports

**Session History**
- Captured via `/land` command
- Work completed, decisions made, challenges solved
- BDD specs written, tests passed/failed
- Trading pattern discoveries

### 2. Cognee Stack

**PostgreSQL + pgvector**
- Document storage and metadata
- Vector embeddings for semantic search
- Full-text search capabilities

**Redis**
- Response caching
- Async job queue
- Session storage

**Neo4j**
- Knowledge graph database
- Entity relationships (contracts, DEXes, tokens, patterns)
- Dependency mapping between components

**Cognee API**
- REST API (FastAPI)
- Document ingestion and processing
- Semantic search
- Knowledge graph queries

## Datasets

| Dataset | Source | Purpose |
|---------|--------|---------|
| `flashloaner-knowledge` | `.claude/` + `.rules/` files | Commands, skills, agents, architecture, patterns |
| `flashloaner-patterns` | `.rules/patterns/` files | Trading patterns, workflow patterns, security patterns |
| `flashloaner-sessions` | Session summaries | Work history, decisions, solutions |
| `flashloaner-contracts` | Solidity docs/NatSpec | Contract interfaces, function docs, audit findings |

## Data Flow

### Ingestion (Knowledge -> Cognee)

```
1. User runs: /land (auto-syncs when .claude/ or .rules/ changed)
   │
2. sync-to-cognee.sh finds all .md and .sol files in .claude/, .rules/, contracts/
   │
3. For each file:
   │  ├─ Upload to Cognee API (POST /api/v1/add)
   │  ├─ Assign to dataset (flashloaner-knowledge, flashloaner-contracts, etc.)
   │  └─ Store metadata (file path, last modified)
   │
4. Cognee processes files:
   │  ├─ Chunk documents (semantic chunking)
   │  ├─ Generate embeddings (OpenAI text-embedding-3-small)
   │  ├─ Extract entities (LLM-based)
   │  ├─ Build knowledge graph (Neo4j)
   │  └─ Index for search (PostgreSQL + pgvector)
   │
5. Knowledge graph created and ready for queries
```

### Query (User -> Cognee -> Answer)

```
1. User runs: /query "How does the FlashloanExecutor route swaps?"
   │
2. Claude calls Cognee API:
   │  POST /api/v1/search
   │  { "query": "How does the FlashloanExecutor route swaps?" }
   │
3. Cognee processes query:
   │  ├─ Generate query embedding
   │  ├─ Vector similarity search (pgvector)
   │  ├─ Graph traversal (Neo4j) for related concepts
   │  ├─ LLM-based answer generation
   │  └─ Return answer + sources
   │
4. Claude displays:
   │  ├─ Answer to user's question
   │  ├─ Source documents referenced
   │  └─ Related contracts/patterns
```

### Session Capture (/land -> Cognee)

```
1. User runs: /land
   │
2. Create session summary:
   │  ├─ Date, branch, commit
   │  ├─ Work completed
   │  ├─ Beads closed
   │  ├─ Technical decisions
   │  └─ Challenges/solutions
   │
3. Upload to Cognee:
   │  ├─ POST /api/v1/add
   │  ├─ Dataset: flashloaner-sessions
   │  └─ Cognify to update graph
   │
4. Session indexed and searchable:
   │  ├─ "What DEX adapters did we add last week?"
   │  ├─ "How did we fix the reentrancy issue?"
   │  └─ "What fork tests cover Curve pools?"
```

## API Endpoints

### Health Check

```bash
curl http://localhost:8003/health
```

### Add Document

```bash
curl -X POST http://localhost:8003/api/v1/add \
  -H "Content-Type: application/json" \
  -d '{
    "data": "FlashloanExecutor routes swaps through registered DEX adapters.",
    "dataset_name": "flashloaner-knowledge"
  }'
```

### Cognify (Build Knowledge Graph)

```bash
curl -X POST http://localhost:8003/api/v1/cognify \
  -H "Content-Type: application/json" \
  -d '{
    "datasets": ["flashloaner-knowledge", "flashloaner-patterns", "flashloaner-contracts"]
  }'
```

### Search

```bash
curl -X POST http://localhost:8003/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How does the safety module validate profit?",
    "dataset_name": "flashloaner-knowledge"
  }'
```

## Configuration

### Environment Variables

See `.claude/docker/.env`:

```env
# Database
COGNEE_DB_PASSWORD=<secure-password>
COGNEE_NEO4J_PASSWORD=<secure-password>

# OpenAI (required)
OPENAI_API_KEY=sk-your-key-here
COGNEE_LLM_MODEL=gpt-4
COGNEE_EMBEDDING_MODEL=text-embedding-3-small

# Authentication (disabled for local dev)
COGNEE_REQUIRE_AUTH=false
```

## Workflows

### Initial Setup

```bash
# 1. Start Cognee stack
.claude/scripts/cognee-local.sh up

# 2. Wait for health checks
.claude/scripts/cognee-local.sh health

# 3. Initial sync
.claude/scripts/sync-to-cognee.sh

# 4. Verify in Neo4j Browser
open http://localhost:7477
```

### Daily Use

```bash
# Query knowledge
/query How does the FlashloanExecutor handle Aave callbacks?

# At end of session
/land  # Auto-syncs to Cognee, captures session
```

### Maintenance

```bash
# View logs
.claude/scripts/cognee-local.sh logs-api

# Check health
.claude/scripts/cognee-local.sh health

# Backup data
.claude/scripts/cognee-local.sh backup

# Reset everything
.claude/scripts/cognee-local.sh clean
.claude/scripts/cognee-local.sh up
```

## Limitations

### Local Development

- Requires Docker and 4GB+ RAM (8GB recommended)
- OpenAI API key required (costs money)
- Network connectivity for embeddings

### Performance

- Initial sync can take minutes for large documentation sets
- Search latency ~1-2 seconds
- Neo4j requires warm-up time after restart

## Related Documentation

- [/query Command](../../.claude/commands/query.md)
- [System Overview](system-overview.md)
- [Cognee Docs](https://docs.cognee.ai/)
