# Sonnet Implementation Handoff — Weekly AI-Assisted Release

## Execution Boundary

This is a **planning handoff**, not permission to execute now. The task must stay `planning` until the user reviews the artifacts and explicitly asks for implementation. The user named Sonnet as the later executor; do not dispatch an implementation agent from the planning session.

- Worktree: `/home/decade/crf-editor-weekly-ai-release`
- Branch: `task/weekly-ai-release`
- Task: `.trellis/tasks/10-16-weekly-ai-release`
- Planning base: `main` at `5025182`; re-check current main/worktrees before implementation.
- Context order: curated JSONL entries -> `prd.md` -> `design.md` -> this checklist. Load `trellis-before-dev` when implementation is actually authorized.
- Do not commit/push, set remote Variables/Secrets, enable schedules, call a live release AI, run a real publishing test, create a Release/tag, or modify production data without the applicable separate authorization.

## Confirmed Product Choices

1. `+0.1` means semantic minor; `+0.01` means semantic patch. Keep bare three-part tags and integer component arithmetic.
2. AI may receive change summaries and bounded, filtered, secret-scanned source diffs. It may not receive real configuration, secrets, business/clinical data, or unrestricted repository content.
3. Publish tag + Chinese notes + GitHub-generated source archives only. Do not implement Windows/Linux binaries, custom attachments, or deployment.

The authoritative requirements and acceptance IDs are in `prd.md`; operational contracts and recovery states are in `design.md`. Do not broaden those choices during implementation.

## Ordered Work and Verification Board

### 0. Reconcile and Activate Only After Authorization

- [x] Confirm `git status --short` matches only these task artifacts; check `git worktree list` and current `main` to detect concurrent work.
- [x] Read root/module instructions and `.context/prefs/` plus the curated specs/research. Current package version and latest GitHub release were `0.4.0` during planning; re-query read-only at activation rather than pinning future behavior.
- [x] Verify the task's `branch` and `worktree_path` still match. Do not silently move work onto main.
- [x] Validate manifests, then run `task.py start` **only after** the user's artifact review/implementation request.
- [x] Capture pre-change backend/frontend test and coverage baselines. Existing suite coverage remains statistics-only; do not change `pytest.ini` addopts.

### 1. RED — Add Release Logic and Security Tests (AC1–AC4, AC7)

Create `backend/tests/test_weekly_release.py` first. Use behavior-oriented names, AAA, pytest parametrization and local fixtures. Import the eventual CLI as `scripts.weekly_release` so focused coverage measures the actual code. Record the expected failing run before writing implementation.

- [x] Semantic minor/patch: reset patch on minor; `0.4.9 -> 0.4.10`; reject major, arbitrary version strings and malformed three-part tags.
- [x] Three application-version fields stay aligned; only those fields may change, and dependency/lock content stays unchanged.
- [x] Disabled schedules and no-net-product-change/doc-only/test-only/own-version-only runs do not validate/request a key or call AI/GitHub mutation; an explicit eligible manual dry run may call AI with publishing off, but makes no remote writes.
- [x] Runtime code/dependency/deployment/config-contract changes qualify; additions/deletions/rename old/new paths and fully reverted changes behave correctly.
- [x] Environment validation covers required key/model/base URL, protocol choice, HTTPS, bad suffix, embedded credentials, timeout limits and disabled redirects. Test with mocked values only; never read actual developer settings.
- [x] The exact outgoing payload excludes denied paths/data and author emails; covers deleted secret lines/commit subjects; obeys byte budgets and explicit truncation markers; secret-scan failure/unavailability stops before HTTP.
- [x] OpenAI-compatible and Anthropic-compatible request/response shapes are mocked; no live network. HTTP timeout/429/5xx, bounded retries, invalid/fenced/oversized JSON, extra fields, insufficient context and breaking changes stop publication.
- [x] AI text containing shell metacharacters, workflow command syntax, malicious instructions or unsafe notes remains data or is rejected. Scan all decoded decision fields and the final serialized plan/public commit/Release content before persistence or publication, and again on recovery. Include a case where only `rationale` contains a simulated secret and `notes_zh` is clean: no plan artifact, commit or release may be persisted. Verify sanitized logs contain no credentials/raw payload/error body.

### 2. GREEN — Implement the Standalone Deterministic Core

- [x] Add `backend/scripts/weekly_release.py` with narrow typed helpers for versions, eligibility, configuration, payload/schema checks and release-state inspection. Use immutable DTOs and existing dependencies, not runtime app config imports.
- [x] Separate Git/GitHub/HTTP boundaries so unit tests can mock external dependencies without mocking the code being tested. Use subprocess argument lists and files, never `shell=True` or string evaluation.
- [x] Expose only the CLI operations needed by the one workflow (inspection/planning, local preparation/verification, publication/recovery). Document concrete arguments in CLI help and the README; do not add package script runners.
- [x] Preserve safe user-facing Chinese run summaries, nonzero exit codes for failures, and successful named skip reasons. Apply `ruff format` to changed Python files, then re-run the targeted tests.

### 3. RED/GREEN — Git Transactions and Recovery (AC2, AC5–AC6)

Add `backend/tests/test_weekly_release_git.py` using pytest `tmp_path`, real disposable local Git/bare repositories, and a mocked GitHub boundary. Never use the actual worktree/remote as a publication sandbox.

- [x] Valid published baseline versus unrelated/latest-only tag; no release; unknown/non-ancestor tag; package/lock drift; historical changes older than seven days.
- [x] Main advancing before publication causes atomic rejection with neither remote main nor tag partially updated.
- [x] Only the tested versioned tree is committed/tagged; unexpected changed files or mismatched plan SHAs are rejected.
- [x] Duplicate/concurrent runs do not create duplicate releases or a second bump. Existing conflicting tags/manual drafts fail closed.
- [x] Push success followed by Release API failure leaves a clearly reported pending state. A later run reconstructs the same bounded plan from the release commit envelope, validates/reruns gates on that exact tag, and publishes it without AI/rebump/main rewrite.
- [x] New code after a pending tag is not smuggled into that tag's release; invalid/multiple pending envelopes or a changed release baseline stop.
- [x] An ambiguous publish response triggers a read-state check before another mutation. No force pushes, ref deletion, PAT fallback or branch-protection bypass exists.

### 4. RED/GREEN — Workflow Wiring and Gates (AC1, AC4–AC7)

Add `backend/tests/test_weekly_release_workflow.py` before the workflow. Parse/check the actual workflow, not merely a separate fixture.

- [x] Add only `.github/workflows/weekly-release.yml`: Monday `17 1 * * 1`, explicit UTC/local-time documentation, manual `dry_run=true`, default-off `WEEKLY_RELEASE_ENABLED`, and a trusted-main guard evaluated before secret use.
- [x] No `pull_request_target`, arbitrary-ref publish path, unrelated CI/PR workflow, top-level API key, or broadly write-enabled token. Manual publish requires the opt-in flag; manual dry run never writes refs/releases.
- [x] One fixed concurrency group, `cancel-in-progress: false`; source/baseline/plan integrity enforced between inspect, validate and publish jobs.
- [x] AI/validation checkout credentials are not persisted. Only the AI HTTP step receives `RELEASE_AI_API_KEY`; only publication gets `contents: write`.
- [x] Pin verified official actions and the project's existing gitleaks download/checksum; verify the installed CLI's stdin scan syntax. If scanner setup cannot be made trustworthy, stop instead of sending unscanned code.
- [x] Prepare the bumped version **locally** before gates; Node 24 is compatible with current complete frontend tests. Select a supported Python runner (3.10 or newer), install existing dependency manifests, and use `npm ci`.
- [x] Run new release tests, full backend/frontend tests, frontend lint/root-base build, and Python formatting/syntax validation. Keep build and publish in this one workflow; do not rely on a bot-created tag event triggering another workflow.
- [x] Publish only after all needs/gates succeed, using the verified existing tag and notes file. Do not upload executable assets or raw AI input artifacts.

### 5. Document and Review the Actual Diff (AC7–AC8)

- [x] Update `README.md` and `README.en.md` with setup UI paths, exact Variables/Secret names, API base-URL/protocol semantics, model/timeout requirements, schedule, eligibility policy, manual dry run, activation, failure recovery and emergency stop.
- [x] Explain that a dry run may call the external AI, ordinary Variables are unmasked, public schedules may be disabled after inactivity, and no production deploy/desktop binary is included. Emergency stop must cover disabling new work, canceling and verifying all running/queued release runs, then inspecting remote refs/Release/pending state; do not imply a flag change cancels existing work or reverses an in-flight API call.
- [x] Update root/module `.claude/CLAUDE.md` and `.claude/index.json` for the new release/test entry points without duplicating the full contract. Amend the tooling spec's no-Actions wording only for this release-specific exception, keeping no PR/merge-CI policy intact.
- [x] Inspect the actual `git diff`, perform a dedicated secrets/external-input/permissions/recovery security review, then an independent read-only review when available. Review alone does not authorize automatic fixes outside this scope.
- [ ] Keep code/docs commits separate from `.trellis/` spec/task/journal commits if/when the user explicitly requests commits. Never stage unrelated files or bypass pre-commit.

### 6. Enablement Handoff — Not Automatic Implementation Cleanup

- [ ] Deliver local checks and remaining blockers without enabling publication. Do not change repository Variables/Secrets or workflow permissions on the user's behalf merely because `gh` is logged in.
- [ ] After separate operator authorization, configure the listed Variables/Secret and run a reviewed manual dry run. The first diff since `0.4.0` may be large; verify truncation/AI sufficiency and do not force a release through missing context.
- [ ] Only after explicit approval, set `WEEKLY_RELEASE_ENABLED=true` and, if requested, run the first real release. Do not treat source-code implementation approval as approval to test public publication.
- [ ] If branch protection rejects the publisher, report required permissions; do not silently switch to PATs, PRs, force pushes or modified protections.

## Planned Validation Commands

These are future execution commands, **not tests run in the planning session**. Use the worktree as the explicit cwd. The local Python interpreter was verified as `/home/decade/.venvs/crf-editor/bin/python` (3.10.21); current Node was 24.14.1. Clear loopback-interfering proxy settings only through the session's permitted environment procedure, without reading/dumping values. If a hook blocks a required precondition, stop/ask rather than bypassing it.

```bash
cd /home/decade/crf-editor-weekly-ai-release && python3 ./.trellis/scripts/task.py validate .trellis/tasks/10-16-weekly-ai-release

# RED first, then GREEN; focus coverage on the newly introduced module.
cd /home/decade/crf-editor-weekly-ai-release/backend && /home/decade/.venvs/crf-editor/bin/python -m pytest tests/test_weekly_release.py tests/test_weekly_release_git.py tests/test_weekly_release_workflow.py --cov=scripts.weekly_release --cov-report=term-missing --cov-fail-under=80

# Compare full-suite coverage with the recorded baseline; do not add a permanent global coverage gate.
cd /home/decade/crf-editor-weekly-ai-release/backend && /home/decade/.venvs/crf-editor/bin/python -m pytest --cov=src --cov=main --cov=scripts.weekly_release --cov-report=term-missing:skip-covered

cd /home/decade/crf-editor-weekly-ai-release/backend && /home/decade/.venvs/crf-editor/bin/python -m ruff format --check scripts/weekly_release.py tests/test_weekly_release.py tests/test_weekly_release_git.py tests/test_weekly_release_workflow.py
cd /home/decade/crf-editor-weekly-ai-release/backend && /home/decade/.venvs/crf-editor/bin/python -m py_compile scripts/weekly_release.py tests/test_weekly_release.py tests/test_weekly_release_git.py tests/test_weekly_release_workflow.py

cd /home/decade/crf-editor-weekly-ai-release/frontend && npm ci && npm test && npm run lint && VITE_BASE_PATH=/ npm run build

cd /home/decade/crf-editor-weekly-ai-release && git diff --check && git status --short --branch
```

Keep new module coverage >=80% and do not reduce the applicable baseline. Existing pytest-cov remains optional/statistics-only for the ordinary full-suite command. Do not claim static workflow tests are a real GitHub scheduled run. No UI behavior changes are planned; browser UI E2E is not required for a version-only manifest change, but local Git end-to-end recovery tests are required for this critical publishing flow. A real GitHub/AI E2E run remains not-run until separately authorized and configured.

## Risk and Rollback Points

- Before the atomic push: all preparation is local; a failing gate/stale source must leave remote refs/releases unchanged.
- After push, before Release success: preserve the pending tag/version commit and recover the same version; never delete/rewrite refs automatically.
- After publication: disabling automation prevents new releases, not already-running work or a completed release. Follow disable -> cancel/verify active and queued runs -> inspect remote state; a cancellation may race an in-flight API call. It does not deploy software or undo publication. Any removal/rollback is a separate high-risk operation requiring confirmation.
- Desktop packaging gaps discovered in research are explicitly deferred; do not repair `build.bat`, `crf.spec`, or desktop dependencies as opportunistic cleanup.

## Reporting Requirements

Report commands and distinguish passed, failed, not-run, and environment-blocked checks. Include coverage numbers only from actual runs. State whether remote settings, AI calls, tags/releases and publication were or were not performed. Link the task artifacts and supply the smallest next operator action. The current planning session must end with the task still `planning`.
