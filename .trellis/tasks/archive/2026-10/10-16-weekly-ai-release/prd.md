# Weekly AI-Assisted Source Release

## Goal and Execution Boundary

Automatically check for unreleased application changes once a week and, when changes qualify, use a configured AI service to classify the release and generate Chinese notes before publishing a new GitHub source version.

This session creates planning artifacts only. The user intends to have Sonnet implement them later. Keep the task `planning`: do not run `task.py start`, implement/enable a workflow, configure remote secrets, call the release AI, commit, push, tag, or publish during planning.

## Background and Verified Evidence

- The existing project removed GitHub Actions on 2026-10-08 and uses direct local merges into `main`, without a routine PR/CI gate (`.trellis/spec/guides/git-and-tooling-conventions.md:20-35`). This request is a release-specific exception, not permission to restore unrelated CI.
- The current application version is three-part `0.4.0` (`frontend/package.json:2-5`), mirrored in the lock's root `version` and `packages[""].version` (`frontend/package-lock.json:2-9`). No automatic version synchronizer was found. Local historical tags use the same three-part format without `v`.
- Read-only `gh release list` / `gh release view` checks on 2026-10-16 independently confirmed the latest stable GitHub release is `0.4.0`, published 2026-07-21, with no uploaded binary assets. This is planning evidence, not a baseline to hard-code for future runs.
- Existing application AI settings distinguish URL, key, model, timeout and protocol (`backend/src/config.py:111-117`); adapters support OpenAI-compatible `/chat/completions` and Anthropic `/messages` (`backend/src/services/ai_review_service.py:227-309`). Release automation must not read the application's real configuration or production credentials.
- Windows packaging is a PyInstaller directory bundle, not a standalone EXE (`backend/crf.spec:94-120`, `backend/build.bat:32-46`). Clean-runner gaps include configuration input (`backend/crf.spec:51-58`, `backend/src/config.py:31-36`) and desktop dependencies (`backend/build.bat:17-20`, `backend/app_launcher.py:67-78,156-158`). Linux currently uses source/systemd deployment (`README.md:402-408`). These paths explain the explicit packaging/deployment exclusion below; no build failure was reproduced in planning.
- Planning lives in `/home/decade/crf-editor-weekly-ai-release`, branch `task/weekly-ai-release`, based on `main` at `5025182`; main itself was not modified.

## Requirements

### R1 — Schedule and Deterministic Update Detection

- Add one release-specific workflow: weekly Monday 01:17 UTC / 09:17 China Standard Time (`17 1 * * 1`) plus manual dispatch with `dry_run=true` by default.
- Keep scheduled/publication behavior disabled unless `WEEKLY_RELEASE_ENABLED=true`. Reject a non-main execution before loading AI secrets. Disabled schedules and no-change runs make no AI calls and need no release key; an explicit manual dry run may use AI while the publication flag is off, but may never write remote refs/releases.
- Compare the pinned main candidate with the resolved source commit of the last successfully published stable release, not only the last seven days or the latest arbitrary tag. Exclude draft/prerelease baselines; no valid release, an unresolved/non-ancestor tag, or unexplained version drift stops for manual reconciliation.
- Use a tested explicit net-product-diff policy: runtime code, runtime dependency/build inputs, deployment/configuration contracts and shipped resources qualify; docs, tests, task/context records, development-only tools and release-engineering changes alone do not. Handle deletion, rename old/new paths and complete reverts.
- Ignore only the application's own version fields when comparing manifests, not whole files or commit subjects. No eligible change means no version commit, tag, release or AI request.

### R2 — Constrained AI Classification and Version Arithmetic

- The user confirmed `+0.1` means semantic `minor` (`0.4.0` -> `0.5.0`), and `+0.01` means semantic `patch` (`0.4.0` -> `0.4.1`). Preserve integer three-part versions: `0.4.9` -> `0.4.10` for patch; minor resets patch to zero. No automatic major bump.
- Require a closed, size-limited JSON decision containing only the designed minor/patch classification, rationale, Chinese notes, context-sufficiency and breaking-change flags. Trusted code computes the final version/tag.
- Missing configuration, timeout, HTTP/scan failure, invalid/oversized output, insufficient context or breaking-change flags fail without publication. Never silently fall back to patch or present a failed AI request as a successful review.
- Treat commit text, diffs and AI output as untrusted data: no executable shell interpolation, arbitrary Git refs, command execution or AI code-editing tools.

### R3 — Configuration, External Payload and Least Privilege

- Use repository Actions Variables for `RELEASE_AI_API_URL`, `RELEASE_AI_MODEL`, `RELEASE_AI_API_FORMAT` and optional `RELEASE_AI_TIMEOUT_SECONDS`; put `RELEASE_AI_API_KEY` only in encrypted Actions Secrets. Define base-URL semantics and supported OpenAI-compatible/Anthropic protocol selection without hard-coding a provider/model.
- Keep release credentials/settings separate from application runtime configuration. Never place real keys in examples, source, task artifacts, logs, notes, build artifacts or prompts. Do not request secret values in chat.
- The user selected **change summaries plus bounded source diffs**. Filter eligible text source, exclude actual configuration/data/secrets/binaries and personal metadata, scan the exact outgoing payload, enforce per-file/total byte limits, and explicitly mark omitted/truncated content as specified in `design.md`. Scan all decoded decision fields (including rationale), the serialized recovery envelope and final public text before persistence/upload/push, and repeat this during recovery; clean release notes alone are insufficient. A suspected secret blocks transmission, persistence and publication.
- Give the API key only to the AI HTTP step; keep GitHub write credentials out of that step. Restrict `contents: write` to publication, use trusted-main triggers, disable redirects and verify TLS. Send no raw diff/prompt artifact or raw HTTP error body to logs.

### R4 — Source-Only, Tested and Recoverable Publication

- The user selected a bare semantic-version tag, a formal GitHub Release with Chinese notes, and GitHub-generated source ZIP/tar.gz archives; no custom/binary assets.
- Use `frontend/package.json` as version authority and update the two lock root-package mirrors together. Preserve existing bare tags (`0.4.1`, not `v0.4.1`); change no dependency/lock content as part of the bump.
- Bind decisions, validation and publication to fixed baseline/source SHAs and the tested versioned tree. Serialize weekly/manual publishers and re-check freshness before writing.
- Validate the release tests, existing backend/frontend suites, formatting/lint and root-base frontend build before atomically pushing a version-only main commit and its tag. Create a Release only for the verified existing tag, using notes as a file.
- Make retries idempotent. A successful ref push followed by Release API failure is a pending release, not success: preserve refs, recover the same bounded decision from the version commit, revalidate that exact tag and finish it without rebumping/reasking AI. Conflicting/manual/malformed pending state stops; no force push, automatic deletion or history rewriting.

### R5 — Documentation, Handoff and Enablement

- Maintain `prd.md`, `design.md`, `implement.md`, research evidence and real curated `implement.jsonl`/`check.jsonl` entries. Include a RED/GREEN test sequence, validation commands, failure simulations, file boundaries and retry/rollback instructions.
- During implementation update `README.md`, `README.en.md`, the applicable root/module `CLAUDE.md`, `.claude/index.json` and the release-only tooling-spec exception, preserving the normal no-PR/merge-CI policy. Keep `.trellis/` updates separate from code commits when commits are authorized.
- Explain setup, exactly what leaves GitHub, default-off activation, manual preview, schedule delay/inactivity limitations and emergency stop. Stopping means disable new work, cancel/verify running and queued release runs, then inspect remote refs/Release/pending state; a flag change alone neither cancels in-flight work nor reverses publication. A dry run may call AI; it is not an offline mode.
- Implementation approval alone does not authorize real secret configuration, schedule enablement or the first public release. Those require separate operator authorization. Do not change branch protections or introduce PATs as a fallback.

## Acceptance Criteria

- [ ] **AC1 / R1:** Weekly/manual wiring and default-off/main-only guards are tested; disabled schedules, unchanged, docs/test-only and own-version-only cases make zero AI or publication calls; an explicit manual AI preview is permitted with publication off but performs no remote mutation.
- [ ] **AC2 / R1:** Old-but-unreleased changes qualify; additions/deletions/renames/reverts and initial/missing/invalid release-baseline cases have deterministic tested outcomes.
- [ ] **AC3 / R2, R4:** Both semantic increments, no decimal carry, the three synchronized version fields and unchanged non-version lock content are verified.
- [ ] **AC4 / R2–R3:** Mocked API/config/scan/timeout/schema/budget/secret/prompt-injection and insufficient-context/breaking cases fail closed without credential disclosure or publication; a secret confined to rationale blocks plan persistence even when notes are clean; no live external dependency is used in tests.
- [ ] **AC5 / R4:** Concurrent/repeated/stale-source runs, conflicting tags and interrupted publication cannot duplicate versions or mismatch the tested tree; same-tag recovery is exercised with local disposable Git remotes and a mocked GitHub boundary.
- [ ] **AC6 / R4:** Required suites/lint/format/build pass, new release code has >=80% focused coverage without reducing applicable baseline coverage, and source publication uses only a verified tag after gates; no desktop asset or production change is made.
- [ ] **AC7 / R3, R5:** Setup clearly separates Variables/Secrets, defines base URL/protocol/model and payload bounds, documents best-effort schedules, recovery and disable/cancel/state-verification stop steps, and keeps real enablement/publication explicitly operator-controlled.
- [ ] **AC8 / R5:** PRD convergence, real JSONL/path/diff checks and planning review are complete before activation. Sonnet receives the isolated worktree path and implementation checklist; task start and code changes await the user's later implementation request.

## Out of Scope

- Implementing, enabling or exercising the live workflow in this planning session; automatic AI code edits or a general PR/CI restoration.
- Windows/Linux executable packaging, desktop dependency/configuration repairs, custom release attachments, backend/UI/EXE version display changes, production deployment/restarts or database migrations.
- Uploading clinical forms, user databases, screenshots, production settings, credentials or an unrestricted repository copy to AI.
- New production dependencies/script runners, unrelated refactoring, branch-protection changes, PAT creation, force pushes or automatic deletion of releases/tags.

## Technical Design and Handoff

- [Technical design](design.md): job boundaries, exact configuration/AI budgets, baseline/eligibility policy, tested-tree transaction and recovery states.
- [Sonnet implementation checklist](implement.md): ordered TDD work, commands, changed-file boundaries, activation restrictions and reporting requirements.
- [Release-chain evidence](research/release-chain.md): source/tag/GitHub metadata, packaging gaps, test entry points and confirmed product decisions.
- [Workflow/security evidence](research/workflow-security.md): official Actions/CLI references, configuration/secret trust boundaries and installed-CLI differences.

No product decision remains blocking. Final artifact review and implementation/enablement permissions remain distinct later steps; this task stays `planning` on delivery.
