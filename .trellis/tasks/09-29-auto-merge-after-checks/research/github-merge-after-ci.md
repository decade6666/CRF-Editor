# Research: GitHub auto-merge after CI — gh CLI / Actions behavior

- **Query**: 10 questions on pull_request workflow semantics, `needs`/`if`, `gh pr merge`, GITHUB_TOKEN permissions and event non-recursion, workflow_run payload, check-runs REST, `gh pr checks`, concurrency, and Yikun/hub-mirror-action private-source requirements
- **Scope**: external (official docs fetched live 2026-09-29 via curl: docs.github.com, cli.github.com, raw.githubusercontent.com for gh and hub-mirror-action source)
- **Date**: 2026-09-29
- **Repo facts used (verified by lead, not re-derived)**: private GitHub Free repo, no branch protection / required checks possible; `ci.yml` (backend-tests / frontend-tests / frontend-lint / frontend-build, no needs chain, `contents: read`); `gitleaks.yml` job name `gitleaks`; `sync-to-gitee.yml` on `push: main` + `workflow_dispatch`; bot merges produce no push-triggered runs on main.

---

## 1. Is the pull_request workflow definition taken from the PR's merge commit?

**Answer: Yes.** For `pull_request`-triggered workflows, the run executes against the PR's merge ref: `GITHUB_REF` = `refs/pull/<N>/merge` and `GITHUB_SHA` = "the last merge commit of the pull request merge branch" (to get the head-branch commit instead, use `github.event.pull_request.head.sha`). The workflow file version that runs is the one present in that merge ref, so a same-repo PR that edits a workflow file changes its own run, and a PR that deletes the workflow file removes that run for its own events. (Fork PRs additionally require maintainer approval before any workflow runs; workflows also do not run while the PR has a merge conflict.)

- Source: https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#pull_request (quotes: "GITHUB_REF ... PR merge branch `refs/pull/PULL_REQUEST_NUMBER/merge`"; "GITHUB_SHA for this event is the last merge commit of the pull request merge branch").
- Confidence: **High** for the merge-ref execution semantics (direct doc quote). The "delete ⇒ no run for that event" corollary is standard behavior implied by the merge-ref semantics — not spelled out verbatim in the docs (medium confidence).

## 2. `needs: [a,b,c,d]` + explicit `if:` with no status function — is `success()` implied?

**Answer: Yes.** Docs: "A default status check of `success()` is applied unless you include one of these functions." Combined with `jobs.<job_id>.needs`: "If a job fails or is skipped, all jobs that need it are skipped unless the jobs use a conditional expression that causes the job to continue." So a dependent job whose `if:` contains no status function runs only when every needed job succeeded; it is skipped (not failed) when any needed job fails, is cancelled, or is skipped. To run regardless, the `if:` must contain a status function such as `always()` (docs recommend `!cancelled()` instead of `always()`).

- Sources: https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#status-check-functions ; https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idneeds
- Confidence: **High** (both quotes fetched live).

## 3. `gh pr merge --match-head-commit`; head moved; `--merge` without `--auto`

**Answer:**
- The flag exists: `--match-head-commit <SHA>` — "Commit SHA that the pull request head must match to allow merge" (gh manual). In gh's source (`pkg/cmd/pr/merge/merge.go`, checked at v2.63.2) it populates `expectedHeadOid`, which is sent as the REST merge body param `sha`.
- If the PR head moved: the REST endpoint returns **409 Conflict — "if sha was provided and pull request head did not match"** — the merge does not happen and gh exits non-zero (exact gh error wording not verified).
- `--auto` = "Automatically merge only after necessary requirements are met". Without `--auto`, `gh pr merge --merge` attempts an **immediate** merge; on this repo (no required checks — branch protection API returns 403 on Free plan private repos) nothing blocks it, so it merges right away, before CI finishes. (With unmet required checks a non-auto merge fails — REST 405 "Method Not Allowed if merge cannot be performed".)

- Sources: https://cli.github.com/manual/gh_pr_merge ; https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request (body param `sha`, 405/409 rows) ; https://github.com/cli/cli/blob/trunk/pkg/cmd/pr/merge/merge.go
- Confidence: **High** for flag existence, REST 409, and immediate merge with no required checks. **Medium** for gh's exact client-side error text (not executed).

## 4. Minimum GITHUB_TOKEN permissions

**Answer:**
- **Merge a PR with gh** (`gh pr merge` → REST `PUT /repos/{owner}/{repo}/pulls/{n}/merge`): fine-grained permission **"Contents" repository permissions (write)** ⇒ GITHUB_TOKEN **`contents: write`**. The REST doc lists only Contents (write) for this endpoint. `pull-requests: write` covers other PR mutations (labels, comments; scope doc: "Work with pull requests. For example, `pull-requests: write` permits an action to add a label to a pull request") and is what the existing auto-merge workflow already grants alongside contents — keeping both is safe; contents: write is the documented minimum for the merge call itself.
- **Read check runs** (`GET /repos/{owner}/{repo}/commits/{ref}/check-runs`): **"Checks" repository permissions (read)** ⇒ GITHUB_TOKEN **`checks: read`** (classic PAT needs `repo` scope on private repos; scope doc: `checks` — "Work with check runs and check suites").
- **Dispatch another workflow** (`POST /repos/{owner}/{repo}/actions/workflows/{id}/dispatches`): **"Actions" repository permissions (write)** ⇒ GITHUB_TOKEN **`actions: write`**.

- Sources: https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request ; https://docs.github.com/en/rest/checks/runs#list-check-runs-for-a-git-reference ; https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event ; scope list: https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#permissions
- Confidence: **High** (all four pages fetched live, permission blocks quoted).

## 5. Do GITHUB_TOKEN events trigger workflows? Can a GITHUB_TOKEN job dispatch sync-to-gitee?

**Answer:** No for most events, yes for the dispatch exceptions. Docs (fetched): "When you use the repository's GITHUB_TOKEN to perform tasks, events triggered by the GITHUB_TOKEN will not create a new workflow run, with the following exceptions: `workflow_dispatch` and `repository_dispatch` events always create workflow runs." (Also: `pull_request` opened/synchronize/reopened events created by GITHUB_TOKEN produce approval-required runs.) Explicit push example: "if a workflow run pushes code using the repository's GITHUB_TOKEN, a new workflow will not run even when the repository contains a workflow configured to run when push events occur" — this explains why bot merges on main never started `sync-to-gitee.yml`.

So yes: a job whose GITHUB_TOKEN has `actions: write` can run `gh workflow run sync-to-gitee.yml --ref main`, provided (a) the workflow has a `workflow_dispatch:` trigger (it does), and (b) the workflow file exists on the **default branch** — "This trigger only receives events when the workflow file is on the default branch." `workflow_id` accepts the workflow file name.

- Sources: https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow (legacy path `/en/actions/using-workflows/triggering-a-workflow` redirects here) ; https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event
- Confidence: **High**.

## 6. workflow_run: file version, pull_requests array, head SHA / conclusion

**Answer:**
- **Which branch's workflow file**: the default branch — "This event will only trigger a workflow run if the workflow file exists on the default branch." The triggered workflow's own `GITHUB_SHA`/`GITHUB_REF` point at the default branch; code from the triggering run must be fetched via the payload's head SHA.
- **`github.event.workflow_run.pull_requests`**: present in the payload schema as an array of minimal pull-request objects, but the current official docs give **no guarantee** it is populated; the analogous REST note (check-runs) says fork-side pushes yield "an empty `pull_requests` array and a `null` value for `head_branch`". Community-known behavior: usually populated for same-repo PRs but racy (empty if the run was requested before the PR object existed). **Do not rely on it as the primary lookup; treat same-repo population as UNCONFIRMED.**
- **Fields**: head SHA = **`github.event.workflow_run.head_sha`**; result = **`github.event.workflow_run.conclusion`** (official example: `if: github.event.workflow_run.conclusion == 'success'`); progress = `github.event.workflow_run.status`; also `head_branch`, `id`, `name` (triggering workflow name).

- Sources: https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#workflow_run (default-branch note; conclusion example) ; https://docs.github.com/en/webhooks/webhook-events-and-payloads#workflow_run (payload schema)
- Confidence: **High** for default-branch rule and head_sha/conclusion; `pull_requests` population for same-repo PRs **UNCONFIRMED**.

## 7. REST endpoint to read a named check (gitleaks) for a SHA

**Answer:** `GET /repos/{owner}/{repo}/commits/{ref}/check-runs` where `ref` = commit SHA (also accepts branch/tag names). Query params: **`check_name`** (e.g. `gitleaks`), `status` (`queued|in_progress|completed`), `filter` (`latest` default | `all`), `per_page` (max 100), `page`, `app_id`. Permission: fine-grained **"Checks" repository permissions (read)** ⇒ GITHUB_TOKEN **`checks: read`**; classic PAT `repo` scope for private repos; works unauthenticated only for public repos. Response: `total_count` plus `check_runs[]` with `status`, `conclusion`, `head_sha`, `name`. Note: fork pushes are not detected (empty `pull_requests`, `null` head_branch). Example: `gh api "repos/decade6666/CRF-Editor/commits/$SHA/check-runs?check_name=gitleaks"`.

- Source: https://docs.github.com/en/rest/checks/runs#list-check-runs-for-a-git-reference
- Confidence: **High** (page fetched live; params and permission block quoted).

## 8. `gh pr checks` flags; would watching all checks wait on its own check?

**Answer:** Manual (fetched): `--watch` = "Watch checks until they finish"; `--fail-fast` = "Exit watch mode on first check failure"; `--interval <int>` (default 10) = "Refresh interval in seconds in watch mode"; `--required` = "Only show checks that are required"; `--json` exposes `bucket` (`pass|fail|pending|skipping|cancel`) and `state`; extra exit code **8 = "Checks pending"**.

Self-wait: **UNCONFIRMED — inference only.** `gh pr checks` reports all check runs attached to the PR head SHA; the calling workflow's own run is itself such a check run, and no documented self-exclusion exists, so `gh pr checks --watch` (all checks) would plausibly wait on its own in-progress check until the job times out. On this repo `--required` would list nothing (Free plan, no required checks), so it cannot be used as the filter. Recommend polling the check-runs REST endpoint for the specific check names instead (Q7); verify the self-wait behavior empirically before relying on `--watch`.

- Source: https://cli.github.com/manual/gh_pr_checks
- Confidence: **High** for flags/exit code; self-wait behavior is **inference, not documented**.

## 9. Concurrency so a newer push to the same PR cancels the older CI run

**Answer:** Official example (workflow level):

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

For `pull_request` runs `github.ref` is `refs/pull/<N>/merge`, so each PR forms its own group: a newer synchronize cancels the older in-progress run. Can also be set per job. Extras (current docs): group names are case-insensitive; new `queue` property (`single` default, `max`) controls pending runs; `queue: max` + `cancel-in-progress: true` is rejected with a workflow validation error; same-group runs are FIFO by queueing time.

- Source: https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#concurrency
- Confidence: **High** (example quoted verbatim from fetched page).

## 10. Yikun/hub-mirror-action with a private GitHub source repo

**Answer:** Current usage (`sync-to-gitee.yml`) passes `src: github/<owner>`, `dst_key`, `dst_token`, `account_type: user`, `static_list`, `force_update` — and the default `clone_style: https`. README + action source (master, 2026-09-29):
- **Root cause verified in source**: `get_clone_repo_base()` builds the clone URL as plain `https://github.com/{account}` when `clone_style == "https"` (else `git@github.com:`); **no token is ever embedded in the clone URL**. `src_token` is used only for API repo-listing (`Authorization: token ...` headers). Hence cloning a private GitHub repo over https fails with `fatal: could not read Username for 'https://github.com'`.
- **README-documented fix**: set **`clone_style: ssh`** — "当设置为ssh时，你需要将`dst_key`所对应的公钥同时配置到源端和目的端" (the `dst_key` public key must be registered on **both** GitHub and Gitee). `src_key` is not a current input; the README documents `src_token` ("用于从源端获取仓库列表的API tokens。当源端为组织或私有仓库且需要认证时...必须配置") but per source it does not authenticate the clone itself.
- `dst_key` (SSH private key for pushing) and `dst_token` (destination API token, auto-creates the Gitee repo) remain as configured; `clone_style` default is `https`.

- Sources: https://github.com/Yikun/hub-mirror-action (README, master) ; https://github.com/Yikun/hub-mirror-action/blob/master/hub-mirror/platforms.py (`get_clone_repo_base`)
- Confidence: **High** (README + source verified); note the action tracks `@master`, so pinning a tag would be a user decision, not a documented requirement.

---

## Caveats / Not Found

- Exact gh client-side error text for a `--match-head-commit` mismatch (REST 409 is confirmed; gh's wording is not).
- `github.event.workflow_run.pull_requests` population for same-repo PRs: no official guarantee found — UNCONFIRMED.
- `gh pr checks --watch` self-wait: no official statement — inference.
- No official statement found that a PR deleting its own workflow file suppresses that event's run (strongly implied by merge-ref semantics).
