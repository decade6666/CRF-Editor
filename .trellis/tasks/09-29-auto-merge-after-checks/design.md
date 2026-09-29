# Design

Research: `research/github-merge-after-ci.md`.

## Chosen approach: merge job inside `ci.yml`

### `.github/workflows/ci.yml`

- `on.pull_request`: keep `branches: [main]` and add `types: [opened, reopened, synchronize, ready_for_review]`. Leave `push` unchanged.
- Add workflow-level concurrency:
  ```yaml
  concurrency:
    group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.run_id }}
    cancel-in-progress: true
  ```
  All runs of one PR share a group, so a newer event cancels the older run and its merge job. Push runs get unique groups and are never cancelled.
- Add job `merge-owner-pr`, named `Merge owner PR into main`:
  - `needs: [backend-tests, frontend-tests, frontend-lint, frontend-build]`.
  - `if:` requires `github.event_name == 'pull_request'`, `user.login == 'decade6666'`, `base.ref == 'main'`, `head.repo.full_name == github.repository`, and `draft == false`. It contains no status function, so GitHub prepends `success()`: the job is skipped unless every needed job succeeded.
  - Job-level `permissions: { contents: write, pull-requests: write, checks: read }`. The workflow-level `contents: read` still applies to the four test jobs.
  - Step `Wait for gitleaks`: poll `repos/$GITHUB_REPOSITORY/commits/$HEAD_SHA/check-runs?check_name=gitleaks` every 15 s for up to 10 minutes. Use gh's built-in `--jq` to reduce the runs to one state:
    - `missing`: no runs yet; keep waiting.
    - `pending`: some run not completed; keep waiting.
    - `success`: all runs completed with `success`; continue to the merge step.
    - `failure`: `::error::` plus exit 1.
    - Timeout: `::error::` plus exit 1.
    - Failed query (API error): `::warning::`, treated as not yet known, polling continues until the deadline. Never read as success.
  - Step `Merge with a merge commit`: `gh pr merge "$PR_URL" --merge --match-head-commit "$HEAD_SHA"`.
    - No `--auto`: without required checks it merges immediately anyway. The gate is the `needs` chain.
    - `--match-head-commit` makes GitHub refuse the merge (409) if the head moved after this run started.
  - `PR_URL`, `HEAD_SHA`, and `GH_TOKEN` come from `env:`, never from inline `${{ }}` inside `run:`, to avoid script injection. No checkout is needed.

### Other files

- Delete `.github/workflows/auto-merge-draft-to-main.yml`.
- Delete `.github/workflows/sync-to-gitee.yml`. The user chose to drop the Gitee mirror. It was broken anyway: it cloned the private repository over HTTPS without credentials, and bot merges never triggered it.
- Add `backend/tests/test_ci_merge_gate.py`, a PyYAML contract test. YAML 1.1 parses the key `on` as boolean `True`; read `data.get('on', data.get(True))`. It runs inside `Backend tests`, so the gate checks its own configuration.
- Docs:
  - Root `.claude/CLAUDE.md` Git Workflow: workflow bullet and changelog; module index backend tests 63→64 files.
  - `.trellis/spec/guides/git-and-tooling-conventions.md` §1: Why, Contract table, checklist, Correct example, Source of truth. Add notes on re-running failed jobs and on bot merges not triggering push workflows.
  - `backend/.claude/CLAUDE.md`: test inventory and changelog.
  - `.claude/index.json`: add the test file to the backend tests list.

## Why gitleaks is polled instead of listed in `needs`

`needs` only reaches jobs in the same workflow. Moving gitleaks into `ci.yml`, or turning it into a reusable workflow, would either change its push/schedule/dispatch triggers or scan PRs twice. Polling leaves `gitleaks.yml` untouched.

Only runs named `gitleaks` are read, so the merge job never waits on itself (`gh pr checks --watch` would include its own in-progress check). gitleaks runs on both `push` and `pull_request`, so the head SHA can carry two `gitleaks` runs; all of them must succeed.

## Rejected

- A separate `workflow_run` merge workflow. It always runs from the default-branch copy, so this PR could not test itself. Its payload's `pull_requests` list is not guaranteed, so the PR would need a SHA lookup. More moving parts.
- Keeping the old workflow and making it wait. It would hold a runner for the whole CI duration on a private repository with a minute quota, and `gh pr checks --watch` would include its own check.
- Keeping `--auto`. It has no effect without required checks.

## Bootstrap and rollout

Pull-request runs use the workflow files from the PR merge ref (`refs/pull/N/merge`). This PR's own run therefore uses the new `ci.yml` and does not run the deleted workflow, so the PR is merged by the new gate. That is the live end-to-end test. If the old workflow still ran and merged immediately, that counts as a failed live check, but it does no harm.

A PR opened before this change merges keeps the old behavior until its next push, when the merge ref is recomputed. The pending autocomplete-fix PR (`fix/designer-autocomplete-candidates`) should be opened after this one merges, so it also goes through the gate.

## Accepted risks

- Base drift: `main` can move between the CI run and the merge, leaving the merged result untested. The only fix is "require branches up to date", which this plan does not have. Low risk for one maintainer.
- Post-merge: merges made with `GITHUB_TOKEN` trigger no push workflows on `main` (CI and gitleaks on push). Unchanged and documented.
- Flaky jobs: a flaky job blocks the merge. "Re-run failed jobs" also re-runs the skipped dependent merge job.
- gitleaks cap: the wait is capped at 10 minutes. If gitleaks never reports, for example because its workflow is disabled, the merge job fails closed and a manual merge needs explicit user authorization.

## Rollback

Revert the merge commit. That restores the old workflow and the previous `ci.yml`.
