# Git & Tooling Conventions

> **Purpose**: Project-local rules for PR merge ownership and multi-CLI dispatch paths.
> Prevents agents from re-doing CI-owned merges or searching stale wrapper locations.

---

## 1. any branch → main PR Merge Gate

**What**: Owner-authored same-repo PRs targeting `main` (any head branch) are merged by the CI merge job `merge-owner-pr` in `.github/workflows/ci.yml`, **only after the four CI jobs and the `gitleaks` check pass on the PR head**. Agents and humans must **not** run manual `gh pr merge` (or equivalent) as part of the normal finish path.

**Why**:
- The merge job `needs` all four CI jobs (backend tests, frontend tests, frontend lint, frontend build) with an implicit `success()`, then polls the `gitleaks` check runs on the PR head SHA before merging.
- `gh pr merge --auto` is not used: this private repo is on the GitHub Free plan, where required checks are unavailable, so `--auto` merged immediately without waiting for CI.
- Manual merge races CI, triggers unnecessary permission prompts, and can bypass the intended gate order.

### Contract

| Field | Rule |
|-------|------|
| Base | `main` only |
| Head | **any branch** (same-repo; forks excluded) |
| Author | `decade6666` (repo owner) |
| Same-repo PR | head repo must equal base repo (no fork PRs) |
| Draft PR flag | must be **ready for review** (`draft == false`) |
| Merge method | merge commit (`gh pr merge --merge --match-head-commit <head sha>` from the `ci.yml` merge job, after the four CI jobs and gitleaks pass) |
| Agent action after open | **stop** — wait for CI + the merge job; do not call `gh pr merge` |

### Agent checklist (finish path)

- [ ] Push the task/feature branch and open PR `<branch>` → `main` if missing
- [ ] Ensure PR is not marked draft (ready for review)
- [ ] Confirm CI workflows are running / green (or still pending)
- [ ] **Do not** run `gh pr merge` / click Merge / force-merge
- [ ] Report the PR URL and that the CI merge job merges it after the four jobs and gitleaks pass

### Wrong vs Correct

#### Wrong
```bash
# Agent tries to finish by merging immediately
gh pr create --base main --head chore/foo ...
gh pr merge 49 --merge   # ❌ CI-owned; may be denied or race checks
```

#### Correct
```bash
gh pr create --base main --head chore/foo ...
# Optional: gh pr view <N> --json state,mergeStateStatus
# Then stop. The ci.yml merge-owner-pr job merges the PR after the four CI
# jobs and the gitleaks check pass on its head commit.
```

### Source of truth

- Workflow job: `.github/workflows/ci.yml` → `jobs.merge-owner-pr`
- Trigger types: `opened` / `reopened` / `synchronize` / `ready_for_review`
- Concurrency: one group per PR (`github.event.pull_request.number`) with `cancel-in-progress: true` — a newer push cancels the older run and its merge job
- Contract test: `backend/tests/test_ci_merge_gate.py` (runs inside the `Backend tests` CI job, so the gate checks its own configuration)

### Notes

- Re-running failed jobs also re-runs the previously skipped merge job, so a flaky job blocks the merge until green.
- A `gitleaks` failure, or the wait timing out (10-minute cap), means no merge: the job fails closed and a manual merge then needs explicit user authorization. A failed status query (API error) logs a warning and is retried until the deadline; it is never read as success.
- Bot merges made with `GITHUB_TOKEN` trigger no push-based workflows on `main` (the CI and gitleaks push runs).

### Exceptions (only with explicit user instruction)

- Emergency hot-fix when CI is broken and the user **explicitly** authorizes a manual merge

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
- CI merge gate: `.github/workflows/ci.yml` → job `merge-owner-pr` (see §1)
