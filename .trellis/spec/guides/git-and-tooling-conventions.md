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
| CI | the four test jobs still run on push; the `merge-owner-pr` job fires only on `pull_request` events, so it stays inert for direct pushes |

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

---

## Legacy reference (pre-2026-10-08)

- **PR merge gate (2026-09-29 → 2026-10-08)**: owner-authored same-repo PRs to `main` were merged by the CI job `merge-owner-pr` in `.github/workflows/ci.yml` after the four CI jobs and the `gitleaks` check passed. Contract test `backend/tests/test_ci_merge_gate.py` still locks that workflow file's shape and keeps passing — the gate is simply no longer on the normal path, because direct pushes never trigger it.
- **`codeagent-wrapper` path**: `/usr/bin/codeagent-wrapper` (npm global bin → `/usr/lib/node_modules/@decade666/trellis/bin/codeagent-wrapper.mjs`) remains installed for Trellis platform internals, but is not part of this project's default collaboration flow.
