#!/bin/bash
set -euo pipefail

# Sync knowledge to Cognee
# Usage: ./sync-to-cognee.sh [--clear] [dataset]
#   --clear: Delete datasets AND clear Neo4j graph before syncing (fresh upload)
#   dataset: specific dataset to sync (optional)
#   If no dataset specified, syncs all datasets
#
# Note: --clear also purges the Neo4j knowledge graph to prevent stale entity accumulation

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COGNEE_API="http://localhost:8003/api/v1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# Check if Cognee is running
check_cognee() {
    if ! curl -s -f "http://localhost:8003/health" > /dev/null 2>&1; then
        log_error "Cognee is not running. Start it with: .claude/scripts/cognee-local.sh up"
        exit 1
    fi
    log_info "Cognee is running"
}

# Get dataset ID by name
get_dataset_id() {
    local dataset_name="$1"
    curl -s "$COGNEE_API/datasets" | \
        python3 -c "import sys, json; datasets = json.load(sys.stdin); match = next((d for d in datasets if d['name'] == '$dataset_name'), None); print(match['id'] if match else '')"
}

# Delete dataset by name
delete_dataset() {
    local dataset_name="$1"
    local dataset_id
    dataset_id=$(get_dataset_id "$dataset_name")

    if [ -z "$dataset_id" ]; then
        log_warn "Dataset not found: $dataset_name (will be created on upload)"
        return 0
    fi

    log_info "Deleting dataset: $dataset_name (ID: $dataset_id)"
    curl -s -X DELETE "$COGNEE_API/datasets/$dataset_id" > /dev/null
    log_info "Deleted: $dataset_name"
}

# Clear Neo4j knowledge graph (prevents stale entity accumulation)
clear_neo4j_graph() {
    log_info "Clearing Neo4j knowledge graph..."

    # Get Neo4j password from .env file or use default
    local neo4j_password="neo4j_password"
    local env_file="$REPO_ROOT/.claude/docker/.env"
    if [ -f "$env_file" ]; then
        local env_password
        env_password=$(grep -E "^COGNEE_NEO4J_PASSWORD=" "$env_file" 2>/dev/null | cut -d'=' -f2)
        if [ -n "$env_password" ]; then
            neo4j_password="$env_password"
        fi
    fi

    # Clear all nodes and relationships from Neo4j
    if docker exec flashloaner-cognee-neo4j cypher-shell -u neo4j -p "$neo4j_password" "MATCH (n) DETACH DELETE n" > /dev/null 2>&1; then
        log_info "Neo4j graph cleared"
    else
        log_warn "Could not clear Neo4j graph (container may not be running or wrong password)"
    fi
}

# Upload files to dataset
upload_files() {
    local dataset_name="$1"
    shift
    local files=("$@")

    if [ ${#files[@]} -eq 0 ]; then
        log_warn "No files to upload for dataset: $dataset_name"
        return 0
    fi

    # Clear dataset if --clear flag was set
    if [ "${CLEAR_DATASETS:-false}" = "true" ]; then
        delete_dataset "$dataset_name"
    fi

    log_info "Uploading ${#files[@]} files to $dataset_name"

    for file in "${files[@]}"; do
        if [ ! -f "$file" ]; then
            log_warn "File not found: $file"
            continue
        fi

        filename=$(basename "$file")
        log_info "  -> $filename"

        # Upload file to Cognee
        curl -s -X POST "$COGNEE_API/add" \
            -F "data=@$file" \
            -F "datasetName=$dataset_name" > /dev/null
    done

    log_info "Processing dataset: $dataset_name"
    # Cognify using dataset name
    curl -s -X POST "$COGNEE_API/cognify" \
        -H "Content-Type: application/json" \
        -d "{\"datasets\": [\"$dataset_name\"]}" > /dev/null

    log_info "Completed: $dataset_name"
}

# Sync .claude/skills/ knowledge files
sync_skills() {
    log_info "=== Syncing Skills (.claude/skills/) ==="

    files=()
    while IFS= read -r -d '' file; do
        files+=("$file")
    done < <(find "$REPO_ROOT/.claude/skills" -name "*.md" -type f -print0 2>/dev/null)

    upload_files "flashloaner-skills" "${files[@]}"
}

# Sync .rules/ pattern files
sync_rules() {
    log_info "=== Syncing Rules (.rules/) ==="

    files=()
    while IFS= read -r -d '' file; do
        files+=("$file")
    done < <(find "$REPO_ROOT/.rules" -name "*.md" -type f -print0 2>/dev/null)

    upload_files "flashloaner-rules" "${files[@]}"
}

# Sync root-level project documentation (CONSTITUTION.md, VISION.md, CLAUDE.md)
sync_project_docs() {
    log_info "=== Syncing Project Documentation ==="

    files=()
    for doc in CONSTITUTION.md VISION.md CLAUDE.md; do
        if [ -f "$REPO_ROOT/$doc" ]; then
            files+=("$REPO_ROOT/$doc")
        fi
    done

    upload_files "flashloaner-project" "${files[@]}"
}

# Sync Solidity-specific documentation (contract architecture, DeFi security patterns)
sync_solidity_docs() {
    log_info "=== Syncing Solidity Documentation ==="

    files=()

    # Contract documentation and architecture files
    while IFS= read -r -d '' file; do
        files+=("$file")
    done < <(find "$REPO_ROOT/contracts" -name "*.md" -type f -print0 2>/dev/null)

    # DeFi security patterns and audit notes
    while IFS= read -r -d '' file; do
        files+=("$file")
    done < <(find "$REPO_ROOT/docs" -name "*.md" -type f -print0 2>/dev/null)

    # Feature specs (Gherkin files as documentation)
    while IFS= read -r -d '' file; do
        files+=("$file")
    done < <(find "$REPO_ROOT/features" -name "*.feature" -type f -print0 2>/dev/null)

    # Feature plans
    while IFS= read -r -d '' file; do
        files+=("$file")
    done < <(find "$REPO_ROOT/features" -name "*.plan.md" -type f -print0 2>/dev/null)

    if [ ${#files[@]} -gt 0 ]; then
        upload_files "flashloaner-solidity" "${files[@]}"
    else
        log_warn "No Solidity documentation found to sync"
    fi
}

# Main execution
main() {
    cd "$REPO_ROOT"
    check_cognee

    # Parse flags
    CLEAR_DATASETS=false
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --clear)
                CLEAR_DATASETS=true
                shift
                ;;
            *)
                break
                ;;
        esac
    done
    export CLEAR_DATASETS

    # Clear Neo4j graph if --clear flag is set
    if [ "$CLEAR_DATASETS" = "true" ]; then
        clear_neo4j_graph
    fi

    if [ $# -eq 0 ]; then
        # Sync all datasets
        sync_skills
        sync_rules
        sync_project_docs
        sync_solidity_docs
        log_info "=== All datasets synced ==="
    else
        # Sync specific dataset
        case "$1" in
            skills)
                sync_skills
                ;;
            rules)
                sync_rules
                ;;
            project)
                sync_project_docs
                ;;
            solidity|contracts)
                sync_solidity_docs
                ;;
            *)
                log_error "Unknown dataset: $1"
                log_info "Available datasets: skills, rules, project, solidity"
                exit 1
                ;;
        esac
    fi
}

main "$@"
