# Auto-merge owner PRs only after CI passes

## Background

- `.github/workflows/auto-merge-draft-to-main.yml` runs `gh pr merge --auto --merge` on every qualifying PR event. `--auto` waits only for *required* checks. This repository is private on the GitHub Free plan, where branch protection and rulesets are unavailable (both APIs return 403), so no check is required and every qualifying PR merges immediately, before CI finishes. PRs #85–#88 all merged this way.
- The root `.claude/CLAUDE.md` Git Workflow ("CI auto-merge after checks pass") and `.trellis/spec/guides/git-and-tooling-conventions.md` §1 ("auto-merged after required checks pass") describe behavior that does not happen.

## Requirements

- Qualifying PRs are unchanged: author `decade6666`, base `main`, head in the same repository, not a draft.
- A qualifying PR is merged with a merge commit only after the four CI jobs (`Backend tests`, `Frontend tests`, `Frontend lint`, `Frontend build`) succeed for the PR's current head and every `gitleaks` check run on that head commit has succeeded.
- If any of these fails, is cancelled, or does not finish, the PR is not merged.
- Automation never merges a head commit other than the one CI tested. A newer push supersedes the older run.
- Marking a draft PR ready for review starts a gated run.
- Non-qualifying PRs (drafts, forks, other authors, other bases) and push-triggered runs never merge anything.
- The four test jobs keep a read-only token; only the merge job gets write permissions.
- The Gitee mirror workflow `.github/workflows/sync-to-gitee.yml` is removed. The user chose to drop the mirror rather than repair it (2026-09-29).
- The root `.claude/CLAUDE.md` Git Workflow and `.trellis/spec/guides/git-and-tooling-conventions.md` §1 describe the real behavior.

## Acceptance Criteria

- [x] A pytest contract test over the workflow files fails before the change and passes after. It checks that:
  - the old auto-merge workflow is gone;
  - the `ci.yml` pull_request types include `ready_for_review`;
  - the merge job `needs` all four CI jobs;
  - the merge job's `if` holds the qualifying conditions, is limited to `pull_request`, and uses no status function;
  - the merge job's permissions are exactly `contents: write`, `pull-requests: write`, `checks: read`;
  - the merge step uses `--merge --match-head-commit` and not `--auto`;
  - the gitleaks wait reads the `gitleaks` check runs of the PR head SHA and fails closed;
  - PR-scoped concurrency cancels superseded runs.
- [x] The workflow syntax check passes. It uses actionlint if obtainable; otherwise a YAML parse plus the contract test, and the report says which. (actionlint could not be executed: the permission system blocked the downloaded binary. YAML parse, contract test, a real-API run of the extracted wait step, and a fake-`gh` simulation passed.)
- [x] `sync-to-gitee.yml` is deleted, and no live doc references it. History logs under `.context/history/` stay as records.
- [x] The backend full suite passes (proxy variables unset, as documented in `backend/.claude/CLAUDE.md`). 943 passed / 2 skipped / 4 xfailed.
- [ ] Live check on this task's own PR: the merge job starts only after the four jobs succeed, waits for gitleaks, and merges the PR; the deleted auto-merge workflow does not run for this PR. Run IDs and timings are reported. If anything else merges the PR, that is reported as a failed check.

## Out of Scope

- Deleting the Gitee-side repository and the `GITEE_USERNAME` / `GITEE_PRIVATE_KEY` / `GITEE_TOKEN` repository secrets. These are user-side actions; the report suggests them.
- Post-merge workflows. Merges made with `GITHUB_TOKEN` do not trigger push-based runs on `main` (CI and gitleaks on push). This is unchanged and gets documented.
- Requiring the branch to be up to date with `main`. That needs branch protection; it is an accepted risk for a single-maintainer repository.
