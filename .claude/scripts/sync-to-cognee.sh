#!/bin/bash
set -euo pipefail

# Sync knowledge to Cognee (compute server deployment)
# Usage: ./sync-to-cognee.sh [--clear] [dataset]
#   --clear: Delete all datasets before syncing (fresh upload)
#   dataset: specific dataset to sync (optional)
#   If no dataset specified, syncs all datasets
#
# Default target: https://flashloaner-cognee.apps.compute.lan
# Override: COGNEE_URL=http://localhost:8003 ./sync-to-cognee.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COGNEE_API="${COGNEE_URL:-https://flashloaner-cognee.apps.compute.lan}/api/v1"

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
    local base_url="${COGNEE_URL:-https://flashloaner-cognee.apps.compute.lan}"
    if ! curl -sk -f "${base_url}/health" > /dev/null 2>&1; then
        log_error "Cognee is not reachable at ${base_url}"
        log_error "Set COGNEE_URL env var or check the deployment"
        exit 1
    fi
    log_info "Cognee is running at ${base_url}"
}

# Get dataset ID by name
get_dataset_id() {
    local dataset_name="$1"
    curl -sk "$COGNEE_API/datasets" | \
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
    curl -sk -X DELETE "$COGNEE_API/datasets/$dataset_id" > /dev/null
    log_info "Deleted: $dataset_name"
}

# Clear knowledge graph (deletes all datasets, Cognee rebuilds on next cognify)
clear_graph() {
    log_info "Clearing knowledge graph via API..."
    # Delete all datasets — Cognee will rebuild the graph on next cognify
    local datasets
    datasets=$(curl -sk "$COGNEE_API/datasets" 2>/dev/null)
    if [ -n "$datasets" ] && [ "$datasets" != "[]" ]; then
        echo "$datasets" | python3 -c "
import sys, json
for d in json.load(sys.stdin):
    print(d['id'])
" 2>/dev/null | while read -r did; do
            curl -sk -X DELETE "$COGNEE_API/datasets/$did" > /dev/null 2>&1
        done
        log_info "All datasets cleared"
    else
        log_info "No datasets to clear"
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
        curl -sk -X POST "$COGNEE_API/add" \
            -F "data=@$file" \
            -F "datasetName=$dataset_name" > /dev/null
    done

    log_info "Processing dataset: $dataset_name"
    # Cognify using dataset name
    curl -sk -X POST "$COGNEE_API/cognify" \
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

    # Clear all datasets if --clear flag is set
    if [ "$CLEAR_DATASETS" = "true" ]; then
        clear_graph
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
