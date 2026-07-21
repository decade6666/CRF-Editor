# Git & Tooling Conventions

> **Purpose**: Project-local rules for PR merge ownership and multi-CLI dispatch paths.
> Prevents agents from re-doing CI-owned merges or searching stale wrapper locations.

---

## 1. draft → main PR Auto-Merge

**What**: Owner-authored `draft` → `main` PRs are **auto-merged after required checks pass**. Agents and humans must **not** run manual `gh pr merge` (or equivalent) as part of the normal finish path.

**Why**:
- Workflow `.github/workflows/auto-merge-draft-to-main.yml` enables merge-commit auto-merge on qualifying PRs.
- Manual merge races CI, triggers unnecessary permission prompts, and can bypass the intended gate order.

### Contract

| Field | Rule |
|-------|------|
| Base | `main` only |
| Head | `draft` only |
| Author | `decade6666` (repo owner) |
| Same-repo PR | head repo must equal base repo (no fork PRs) |
| Draft PR flag | must be **ready for review** (`draft == false`) |
| Merge method | merge commit (`gh pr merge --auto --merge`) |
| Agent action after open | **stop** — wait for CI + auto-merge; do not call `gh pr merge` |

### Agent checklist (finish path)

- [ ] Push `draft` and open PR `draft` → `main` if missing
- [ ] Ensure PR is not marked draft (ready for review)
- [ ] Confirm CI workflows are running / green (or still pending)
- [ ] **Do not** run `gh pr merge` / click Merge / force-merge
- [ ] Report the PR URL and that auto-merge will complete after checks

### Wrong vs Correct

#### Wrong
```bash
# Agent tries to finish by merging immediately
gh pr create --base main --head draft ...
gh pr merge 49 --merge   # ❌ CI-owned; may be denied or race checks
```

#### Correct
```bash
gh pr create --base main --head draft ...
# Optional: gh pr view <N> --json state,mergeStateStatus,autoMergeRequest
# Then stop. Auto-merge runs after required checks pass.
```

### Source of truth

- Workflow: `.github/workflows/auto-merge-draft-to-main.yml`
- Trigger types: `opened` / `reopened` / `synchronize` / `ready_for_review`
- Action: `gh pr merge "$PR_URL" --auto --merge`

### Exceptions (only with explicit user instruction)

- Emergency hot-fix when CI is broken and the user **explicitly** authorizes a manual merge
- Non-`draft` head branches (feature branches) are **out of scope** of this auto-merge workflow — ask before any merge

---

## 2. `codeagent-wrapper` Path

**What**: On this host, the multi-backend dispatcher is installed at:

```text
/usr/bin/codeagent-wrapper
```

It is an npm global bin symlink to:

```text
/usr/lib/node_modules/@decade666/trellis/bin/codeagent-wrapper.mjs
```

**Why**:
- Older notes / personal rules may still mention `~/.claude/bin/codeagent-wrapper`, `~/.local/bin/codeagent-wrapper`, or `/tmp/trellis-wrapper-*` stubs.
- Searching those paths wastes turns and can invoke the wrong binary.

### Invocation contract

```bash
echo "<prompt>" | /usr/bin/codeagent-wrapper --backend <agy|codex|claude|grok|kimi> [--model <m>] - "$PWD"
```

| Aspect | Rule |
|--------|------|
| Preferred absolute path | `/usr/bin/codeagent-wrapper` |
| PATH name | `codeagent-wrapper` (same binary when PATH is standard) |
| stdin | task prompt (required; empty → exit 2) |
| last positional | working directory |
| stdout | backend plain-text reply |
| stderr | progress / diagnostics |
| exit | `0` ok · `2` bad args/empty prompt · `127` backend binary missing |

### Overrides

| Env | Purpose |
|-----|---------|
| `TRELLIS_CODEAGENT_WRAPPER` | Point at a different wrapper build (absolute path to `.mjs` or bin) |
| `TRELLIS_{AGY,CODEX,CLAUDE,GROK,KIMI}_BIN` | Per-backend binary overrides |

### Wrong vs Correct

#### Wrong
```bash
# Stale locations — do not search these first
~/.claude/bin/codeagent-wrapper
~/.local/bin/codex
/tmp/trellis-wrapper-*
```

#### Correct
```bash
/usr/bin/codeagent-wrapper --backend codex - "$PWD" < task.txt
# or, if PATH includes /usr/bin:
codeagent-wrapper --backend agy - "$PWD" < task.txt
```

### Related

- Trellis workflow overview: `.trellis/workflow.md` → section `codeagent-wrapper — direct multi-backend dispatch`
- Channel collab patterns: `trellis-channel/references/workflows.md`
- Auto-merge workflow: `.github/workflows/auto-merge-draft-to-main.yml`
