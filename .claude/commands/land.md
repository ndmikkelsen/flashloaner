---
triggers: ['land the plane', "let's land", 'wrap up', '/land']
---

# /land -- Session Landing Protocol

Execute ALL steps in order. /land is NOT complete until step 10 passes.

## Step 1: Run Quality Gates

```bash
# Run Solidity tests (ALWAYS -- primary gate for contracts)
forge test

# Run TypeScript tests (ALWAYS -- primary gate for bot)
pnpm test

# Gas report (check for regressions)
forge test --gas-report

# Secret detection (ALWAYS -- prevents credential leaks)
gitleaks detect --source . --no-git --config .gitleaks.toml

# Solidity compilation check (if .sol files changed)
forge build

# TypeScript compilation check (if .ts files changed)
pnpm run build
```

**On failure:** Ask user -- fix now or file P0 issue and continue?

## Step 2: File Remaining Work

Check for incomplete work and file Beads issues:

```bash
# Check for TODOs, FIXMEs, or incomplete work
rg "TODO|FIXME|XXX|HACK" --type sol --type ts --type md

# If found, create Beads issues
bd create "Complete TODO: <description>" \
  --description="Found in <file>:<line>" \
  -t task -p 2
```

## Step 3: Update Issue Status

```bash
# Close completed issues
bd close <id> --reason "Completed in this session"

# Update in-progress issues
bd update <id> --status backlog --comment "Pausing for next session"

# Sync with git
bd sync
```

## Step 4: Check for Uncommitted Files

```bash
git status
```

If there are modified or untracked files (excluding `.gitignore`d files):

- Stage them: `git add <files>`
- Commit with descriptive conventional commit message

## Step 5: Push to Remote (MANDATORY)

```bash
git push origin <current-branch>
```

If push fails (e.g., behind remote), pull and retry:

```bash
git pull --rebase origin <current-branch>
git push origin <current-branch>
```

**CRITICAL**: Work is NOT complete until `git push` succeeds. NEVER stop before pushing.

## Step 6: Write STICKYNOTE.md (BLOCKING)

**THIS STEP IS MANDATORY -- DO NOT SKIP**

Write session handoff to `STICKYNOTE.md` (local only, gitignored):

```markdown
# Session Handoff

**Date:** [TODAY]
**Branch:** [branch name]
**Last Commit:** [hash] - [message]

## Completed This Session

- [what was accomplished]

## Key Files Changed

- [list of significant files]

## Beads Closed

- [list of closed beads with IDs]

## Gas Report Summary

- [any notable gas changes or regressions]

## Pending/Follow-up (Ready Work)

[output of `bd ready`]

## Context for Next Session

[brief context for whoever picks this up next -- active DEX integrations, pending protocol changes, etc.]

## Technical Notes

[any important technical details, gotchas, DeFi-specific decisions, or security considerations]
```

**Verification:** Confirm file exists and has content before proceeding.

## Step 7: Capture Session to Cognee (BLOCKING)

**THIS STEP IS MANDATORY -- DO NOT SKIP**

Capture session context to Cognee for searchable history:

```bash
# Create session note file
SESSION_FILE="/tmp/session-$(date +%Y%m%d-%H%M%S).txt"
cat > "$SESSION_FILE" << 'EOF'
Session: [DATE]
Branch: [branch name]
Commit: [hash] - [message]

Completed:
- [bullet points]

Key Changes:
- [significant files/features]

Beads Closed:
- [IDs and titles]

Gas Report:
- [notable gas changes]

Technical Decisions:
- [any important decisions or discoveries]

Challenges/Solutions:
- [what problems were encountered and how they were solved]

Related Patterns:
- [any .rules/ docs that are relevant]
EOF

# Upload to Cognee (set COGNEE_RUNNING for Step 7b)
COGNEE_URL="${COGNEE_URL:-https://flashloaner-cognee.apps.compute.lan}"
COGNEE_RUNNING=false
if curl -sk "${COGNEE_URL}/health" > /dev/null 2>&1; then
  curl -sk -X POST "${COGNEE_URL}/api/v1/add" \
    -F "data=@${SESSION_FILE}" \
    -F "datasetName=flashloaner-sessions"

  # Cognify to create knowledge graph
  curl -sk -X POST "${COGNEE_URL}/api/v1/cognify" \
    -H "Content-Type: application/json" \
    -d '{"datasets": ["flashloaner-sessions"]}'

  COGNEE_RUNNING=true
else
  echo "Cognee not reachable at ${COGNEE_URL} -- skipping session capture"
fi
```

**Verification:** Confirm Cognee upload succeeded before proceeding. If Cognee is not running, note it and continue.

## Step 7b: Smart Sync Knowledge Garden

Sync `.claude/` and `.rules/` to Cognee if they changed this session:

```bash
# Check if knowledge files changed in this session
GARDEN_CHANGED=$(git diff --name-only origin/main...HEAD | grep '^\(.claude/\|.rules/\)' || echo "")

if [ -n "$GARDEN_CHANGED" ] && [ "$COGNEE_RUNNING" = true ]; then
  echo "Syncing knowledge garden to Cognee..."

  # Upload .claude/ files to flashloaner-skills dataset
  for file in $(find .claude -type f -name "*.md" | sort); do
    curl -sk -X POST "${COGNEE_URL}/api/v1/add" \
      -F "data=@${file}" \
      -F "datasetName=flashloaner-skills" > /dev/null
  done

  # Upload .rules/ files to flashloaner-rules dataset
  if [ -d .rules ]; then
    for file in $(find .rules -type f -name "*.md" | sort); do
      curl -sk -X POST "${COGNEE_URL}/api/v1/add" \
        -F "data=@${file}" \
        -F "datasetName=flashloaner-rules" > /dev/null
    done
  fi

  # Cognify both datasets
  curl -sk -X POST "${COGNEE_URL}/api/v1/cognify" \
    -H "Content-Type: application/json" \
    -d '{"datasets": ["flashloaner-skills", "flashloaner-rules"]}' > /dev/null

  echo "Knowledge garden synced to Cognee"
elif [ -n "$GARDEN_CHANGED" ]; then
  echo "Knowledge garden changed but Cognee not running -- skipping sync"
else
  echo "No knowledge garden changes, skipping sync"
fi
```

## Step 8: Output Clipboard-Ready Handoff (BLOCKING)

**THIS STEP IS MANDATORY -- DO NOT SKIP**

Display this block for the user to copy:

```
## Session Handoff

**Previous Session:** [DATE]
**Branch:** [current branch]
**Last Commit:** [commit hash and message]

### Completed
- [bullet points]

### Gas Report
- [notable changes]

### Pending/Follow-up
- [from bd ready]

### Context
[brief context for next session]
```

## Step 9: Update PLAN.md (Optional)

If significant architectural changes or major milestones were reached, update `PLAN.md`:

```markdown
## Recent Work

**Session**: [DATE]
**Branch**: [branch name]
**Last Commit**: [hash] - [message]

### Major Milestones
- [significant accomplishments only]

### Architecture Changes
- [any architectural decisions or changes -- new DEX integrations, contract upgrades, etc.]

### Next Major Steps
- [high-level next steps]
```

**Note:** PLAN.md is for major updates only. Day-to-day work is captured in STICKYNOTE.md and Cognee.

## Step 10: Verify Clean State

```bash
git status
```

Must show:
- `nothing to commit, working tree clean`
- `Your branch is up to date with 'origin/<branch>'`

## Step 11: Confirm Completion

Only say "/land complete" when ALL of the above are done.

**FINAL CHECKLIST (all must be true):**

- [ ] Quality gates passed (forge test + pnpm test, or issues filed)
- [ ] Gas report reviewed for regressions
- [ ] Secret detection passed (gitleaks)
- [ ] Remaining work filed in Beads
- [ ] Beads issues updated and synced
- [ ] All changes committed
- [ ] Pushed to remote successfully
- [ ] STICKYNOTE.md written with session context
- [ ] Session captured to Cognee
- [ ] Knowledge garden synced to Cognee (if changed)
- [ ] Clipboard handoff block displayed to user
- [ ] PLAN.md updated (if needed)
- [ ] `git status` shows clean + up to date

**NEVER:**

- Declare complete with uncommitted files
- Declare complete without pushing
- Skip STICKYNOTE.md (step 6)
- Skip Cognee capture (step 7)
- Skip clipboard handoff block (step 8)
- Declare complete without showing the final checklist
- Say "ready to push when you are" - YOU must push

## Related Documentation

- [Git Workflow](.rules/patterns/git-workflow.md)
- [Beads Integration](.rules/patterns/beads-integration.md)
- [Cognee Integration](.rules/architecture/cognee-integration.md)
- [/query command](.claude/commands/query.md) - Semantic search via Cognee
