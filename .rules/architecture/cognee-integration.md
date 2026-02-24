---
description: Cognee AI memory layer — deployed to compute server via Kamal
tags: [cognee, architecture, knowledge-graph, semantic-search, kamal]
last_updated: 2026-02-24
---

# Cognee Integration Architecture

Cognee provides semantic search, knowledge graphs, and AI-powered insights over the flashloan bot documentation, BDD specs, trading patterns, and contract documentation.

## Deployment

Cognee runs on the compute server (`10.10.20.138`) deployed via **Kamal**. Each project gets its own isolated Cognee instance.

```
Client (curl, /query, sync-to-cognee.sh)
    │
    │ HTTPS
    ▼
Traefik (*.apps.compute.lan wildcard TLS)
    │
    ▼
kamal-proxy
    │
    ├─► flashloaner-cognee-web  (Cognee API, port 8000)
    │       │  Graph: Kuzu (embedded)
    │       │  Vectors: pgvector
    │       │  Relational: PostgreSQL
    │       │
    └─► flashloaner-cognee-db   (pgvector/pgvector:pg17)
            │  NFS: /mnt/nfs/databases/flashloaner-cognee
```

### Stack (Slim Deployment)

| Component | Technology | Notes |
|-----------|-----------|-------|
| **API** | `cognee/cognee:latest` (v0.5.2) | FastAPI on port 8000 |
| **Graph DB** | Kuzu (embedded) | File-based, no external server |
| **Vector DB** | pgvector | PostgreSQL extension |
| **Relational DB** | PostgreSQL 17 | pgvector image includes both |
| **Secrets** | 1Password via `op read` | Fetched at deploy time |

No Neo4j, no Redis — minimal footprint.

### Endpoints

| Service | URL |
|---------|-----|
| **Cognee API** | `https://flashloaner-cognee.apps.compute.lan` |
| **Health** | `https://flashloaner-cognee.apps.compute.lan/health` |
| **API Docs** | `https://flashloaner-cognee.apps.compute.lan/docs` |

### Deployment Commands

```bash
# Deploy (from repo root, requires kamal + op CLI)
kamal deploy

# Check status
kamal details

# View logs
kamal app logs

# Redeploy after config changes
kamal deploy
```

### Configuration Files

| File | Purpose |
|------|---------|
| `config/deploy.yml` | Kamal deployment config |
| `.kamal/secrets` | 1Password secret references (gitignored) |
| `.claude/docker/Dockerfile.cognee` | Thin wrapper (`FROM cognee/cognee:latest`) |

## Data Sources

**Claude Configuration** (`.claude/`)
- Commands, skills, agent definitions

**Technical Documentation** (`.rules/`)
- Architecture, patterns, workflows

**Project Documentation** (root)
- CONSTITUTION.md, VISION.md, CLAUDE.md

**Contract Documentation** (`contracts/`, `docs/`)
- Solidity docs, security audits, feature specs

## Datasets

| Dataset | Source | Purpose |
|---------|--------|---------|
| `flashloaner-skills` | `.claude/skills/` | BDD pipeline, planning, TDD skills |
| `flashloaner-rules` | `.rules/` | Architecture, patterns, workflows |
| `flashloaner-project` | Root `.md` files | Constitution, vision, project config |
| `flashloaner-solidity` | `contracts/`, `docs/`, `features/` | Contract docs, audits, specs |

## Data Flow

### Ingestion (Knowledge -> Cognee)

```
1. User runs: sync-to-cognee.sh (or /land auto-syncs)
   │
2. Script finds .md and .feature files in .claude/, .rules/, contracts/, docs/
   │
3. For each file:
   │  ├─ Upload to Cognee API (POST /api/v1/add)
   │  └─ Assign to dataset
   │
4. Cognee processes (cognify):
   │  ├─ Chunk documents (semantic chunking)
   │  ├─ Generate embeddings (text-embedding-3-small)
   │  ├─ Extract entities (LLM-based)
   │  ├─ Build knowledge graph (Kuzu)
   │  └─ Index for search (pgvector)
```

### Query (User -> Cognee -> Answer)

```
1. User runs: /query "How does the FlashloanExecutor route swaps?"
   │
2. Claude calls Cognee API:
   │  POST https://flashloaner-cognee.apps.compute.lan/api/v1/search
   │  { "query": "How does the FlashloanExecutor route swaps?" }
   │
3. Cognee processes:
   │  ├─ Generate query embedding
   │  ├─ Vector similarity search (pgvector)
   │  ├─ Graph traversal (Kuzu)
   │  └─ Return ranked results
   │
4. Claude displays answer + sources
```

## Workflows

### Syncing Knowledge

```bash
# Sync all datasets to Cognee
.claude/scripts/sync-to-cognee.sh

# Sync specific dataset
.claude/scripts/sync-to-cognee.sh rules

# Clear everything and re-sync from scratch
.claude/scripts/sync-to-cognee.sh --clear

# Available datasets: skills, rules, project, solidity
```

### Querying

```bash
# Via /query command
/query How does the FlashloanExecutor handle Aave callbacks?

# Via curl
curl -sk -X POST https://flashloaner-cognee.apps.compute.lan/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "How does the FlashloanExecutor route swaps?"}'
```

### Health Check

```bash
curl -sk https://flashloaner-cognee.apps.compute.lan/health
# {"status":"ready","health":"healthy","version":"0.5.2-local"}
```

## Environment Override

The sync script defaults to the compute server. Override with `COGNEE_URL` for local dev:

```bash
COGNEE_URL=http://localhost:8003 .claude/scripts/sync-to-cognee.sh
```

## Related Documentation

- [/query Command](../../.claude/commands/query.md)
- [System Overview](system-overview.md)
- [Cognee Docs](https://docs.cognee.ai/)
