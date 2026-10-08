# Git & Tooling Conventions

> **Purpose**: Project-local rules for commit messages, the direct-to-`main` merge policy, worktree isolation, and model collaboration.
> The 2026-10-08 user decisions below **supersede** the 2026-09-29 PR merge gate (kept at the end as legacy reference).

---

## 1. Commit Messages (Chinese descriptions)

**What**: Keep the Conventional Commits shell, write the description in Chinese:

```text
<type>(<scope>): 中文描述
```

- Types: `feat` / `fix` / `refactor` / `docs` / `test` / `chore` / `perf` / `ci`.
- `type`/`scope`, code identifiers, and paths stay ASCII; the description (and any body) uses Chinese whenever practical.
- No attribution trailers (`Co-Authored-By` etc.), per user rule.

## 2. Direct Commits to `main` (No PR)

**What** (since 2026-10-08): Updates are committed **directly on `main`** — no PR, no CI merge gate.

| Item | Rule |
|------|------|
| Normal path | commit on `main`, or merge a task branch into `main` locally |
| PRs | not opened for routine updates; do not run `gh pr create` / `gh pr merge` |
| Push | push `main` after committing/merging |
| CI | none — GitHub Actions workflows were removed on 2026-10-08; the local pre-commit gate (§6), once enabled per development machine, checks every commit, and the backend / frontend suites must still be run locally before merging |

**Why**: single-owner repo; the PR + CI merge workflow added on 2026-09-29 is no longer the required path.

## 3. Worktree Workflow (code changes)

**What**: Any task that writes code or project files runs in a dedicated git worktree + task branch, merges back into `main` directly when done, then cleans up both the worktree and the branch.

```bash
git worktree add ../crf-editor-<task> -b <task-branch>
# ... implement + commit + checks on <task-branch> ...
git checkout main
git merge <task-branch>            # direct local merge, no PR
git worktree remove ../crf-editor-<task>
git branch -d <task-branch>
```

- Never implement a new code task directly on `main`.
- Merge only after targeted tests / lint / build pass; push `main` afterwards.
- Cleanup is part of the finish path — no leftover worktrees or merged branches.

## 4. Trellis Updates Get Standalone Commits

**What**: Changes under `.trellis/` (task archives, journal, spec guides, runtime state) are committed on their own — never mixed with project code commits.

- Task archival keeps the existing `chore(task): …` commit shape, with a Chinese description where applicable.
- If a task produces both code and `.trellis/` changes, split them into separate commits (code first, then the trellis housekeeping commit).

## 5. Multi-Model Collaboration: Haiku-Only Frontend Review

**What** (since 2026-10-08): The external-CLI collaboration plane (Codex execution/review, Antigravity review via `codeagent-wrapper`) is **discontinued** for this project. The only retained reviewer model is **Haiku**, and only for **frontend modifications**.

| Role | Mechanism | Scope |
|------|-----------|-------|
| Frontend change review | Claude-native sub-agent (`Agent` tool, `model: haiku`), read-only | Review the frontend diff for defects / edge cases; report findings, do not edit code |

- Claude (lead model) keeps implementation, orchestration, and final decisions.
- Backend changes have no separate reviewer model beyond Claude's own review.
- Do not dispatch `codeagent-wrapper` / Codex / Antigravity by default anymore.

## 6. Local Pre-commit Gate

**What** (since 2026-10-08): a versioned `.githooks/pre-commit` hook replaces the deleted CI checks at commit time. Enable it once per development machine:

```bash
git config core.hooksPath .githooks
```

Four gates run on every `git commit` (no test suites, no builds, no npm; a few seconds total, elapsed time printed at the end):

| Gate | Check | Failure behavior |
|------|-------|------------------|
| 1 | gitleaks staged scan: `gitleaks git --staged --config <repo-root>/.gitleaks.toml --exit-code 1 --no-banner --verbose` (`--verbose` required: v8.30.1 prints only a count otherwise, not the RuleID/file/line) | commit blocked; gitleaks missing from PATH or `.gitleaks.toml` missing also blocks (fail closed) with a dedicated Chinese hint |
| 2 | `git diff --cached --check` (whitespace errors, conflict markers) | commit blocked |
| 3 | staged `*.py` files (from `git -c core.quotePath=false diff --cached --name-only --diff-filter=ACMR`; `quotePath=false` keeps non-ASCII filenames literal so the `*.py` match cannot silently skip them): `python3 -m py_compile` per file | commit blocked, failing file named |
| 4 | `ruff format --check` on staged `*.py` files when `ruff` is on PATH | commit blocked; when ruff is absent, exactly one notice line is printed and the check is skipped |

- **Worktree semantics**: `core.hooksPath` lives in `.git/config`, which is shared by every worktree of this repository — enabling it in one worktree activates the hook for commits in all worktrees. The script and config are versioned, so each worktree checks out its own copy.
- **gitleaks version facts** (verified 2026-10-08, v8.30.1): staged scanning uses `gitleaks git --staged`; the old `protect` subcommand is deprecated since v8.19.0. The repo-root `.gitleaks.toml` (restored byte-identical from `8ed19cd^`) extends the default rule set and uses the `[[allowlists]]` array-of-tables syntax. Note for fake-key tests: the default rules do not flag the AWS example key (`AKIA…EXAMPLE`) or very short PEM bodies; `ghp_` / `xoxb-` style tokens are detected.
- **`--no-verify` policy**: `git commit --no-verify` exists for emergencies only and must not be used routinely; gitleaks false positives go through the `.gitleaks.toml` allowlist process instead of bypassing the hook.
- **backend-format integration**: Gate 4 is conditional — once the `backend-format` task lands and `ruff` is installed on PATH, the format check lights up automatically with no hook change. When wiring that up, verify against the installed ruff version: (a) whether `ruff format --check` accepts a `--` end-of-options separator (staged files named like `-foo.py` currently hit flag parsing, failing with a misleading message); (b) distinguish exit code 1 (would reformat) from 2 (runtime/config error) so the block message stays accurate.

---

## Legacy reference

- **PR merge gate (2026-09-29 → 2026-10-08)**: owner-authored same-repo PRs to `main` were merged by the CI job `merge-owner-pr` in `.github/workflows/ci.yml` after the four CI jobs and the `gitleaks` check passed. The whole mechanism was removed on 2026-10-08: both workflow files (including `gitleaks.yml`), the repo-root `.gitleaks.toml`, and the contract test `backend/tests/test_ci_merge_gate.py` are deleted — local test runs are now the only gate before merging.
- **`codeagent-wrapper` path**: `/usr/bin/codeagent-wrapper` (npm global bin → `/usr/lib/node_modules/@decade666/trellis/bin/codeagent-wrapper.mjs`) remains installed for Trellis platform internals, but is not part of this project's default collaboration flow.
