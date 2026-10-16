# Weekly AI-Assisted Source Release — Technical Design

## Status and Authorization

Planning only. The user has selected semantic minor/patch increments, summary plus bounded source-diff input, and source-only GitHub Releases. Sonnet is the intended later implementer. Do not activate the task, implement the workflow, call the release AI, configure remote settings, commit, push, or publish in this session.

Repository evidence is in `research/release-chain.md`; Actions/CLI/security evidence is in `research/workflow-security.md`. This design proposes the new release contract; it does not describe an existing publisher.

## 1. Scope and Architecture

Add one `.github/workflows/weekly-release.yml`, backed by a small standalone Python CLI in `backend/scripts/weekly_release.py` and pytest tests. Reuse existing `httpx`, Pydantic/PyYAML where appropriate, Python logging, and Git/`gh` CLI capabilities. Do not import the runtime application's AI service/config loader or introduce a new SDK, package script, production dependency, or general CI/PR gate.

The workflow has three responsibility boundaries:

1. **Inspect/plan (read-only GitHub access):** pin the candidate SHA; resolve the last published stable release; check pending-release recovery; detect eligible net changes; construct/scan bounded AI input; obtain and validate a release decision. Persist only a validated small plan, not prompts or raw diffs.
2. **Validate (read-only GitHub access):** check out the exact candidate, apply a deterministic local version update, run the release tests and existing suites/build, and record the tested Git tree hash. A recovery run instead validates the existing pending tag's exact tree.
3. **Publish (`contents: write` only here):** revalidate the source/baseline and plan; create a version-only commit; atomically push `main` and the new tag; then create the GitHub Release using the existing verified tag and a notes file. Recovery completes the existing release without another AI call or bump.

Use an identical concurrency group for weekly/manual runs with `cancel-in-progress: false`. Inter-job data must come from the same workflow run, be bound to source/baseline SHAs, and be schema-validated again by the publisher. Do not trust arbitrary external artifact names or user-supplied refs.

### File Boundaries

- New: `.github/workflows/weekly-release.yml`, `backend/scripts/weekly_release.py`, `backend/tests/test_weekly_release.py`, `backend/tests/test_weekly_release_git.py`, `backend/tests/test_weekly_release_workflow.py`.
- Documentation/index updates: `README.md`, `README.en.md`, root/backend/frontend `.claude/CLAUDE.md` as applicable, `.claude/index.json`, and the release-only exception in `.trellis/spec/guides/git-and-tooling-conventions.md`.
- Automated release writes, not the initial implementation: only the application-version fields in `frontend/package.json` and `frontend/package-lock.json`.
- Do not change Windows packaging, production deployment, authentication, database schemas, application AI settings, `.env` instances, or the current package version merely to merge the automation.

## 2. Trigger, Enablement, and Configuration

- Weekly cron: `17 1 * * 1`, Monday 01:17 UTC / 09:17 China Standard Time. GitHub schedules are best-effort, not an exact-time service.
- Add `workflow_dispatch` with `dry_run` defaulting to true. Both modes require the trusted default branch `main`; reject a dispatch from another branch before loading the AI key.
- `WEEKLY_RELEASE_ENABLED` defaults to false/unset. An unset flag makes scheduled runs skip before any AI call. An explicit manual dry run may analyze using configured AI, but never writes remote refs/releases. Manual publication also requires the enable flag.
- Normal publication is automatic once an operator explicitly enables it after validation. There is no new PR or per-week approval gate.
- Missing configuration is checked only after an eligible release or explicitly requested preview is identified. No-change/disabled runs do not require a key and do not call the AI.

| Name | GitHub storage | Contract |
| --- | --- | --- |
| `WEEKLY_RELEASE_ENABLED` | Repository Actions Variable | Exact `true` opts into scheduled/manual publishing; otherwise disabled |
| `RELEASE_AI_API_URL` | Repository Actions Variable | HTTPS API **base** URL; include a provider/gateway's `/v1` prefix when required; no embedded credentials, query tokens, or endpoint suffix |
| `RELEASE_AI_MODEL` | Repository Actions Variable | Required nonempty model identifier supplied by the operator; no assumed provider/model |
| `RELEASE_AI_API_FORMAT` | Repository Actions Variable | `openai` (default) or `anthropic` |
| `RELEASE_AI_TIMEOUT_SECONDS` | Repository Actions Variable | Optional positive bounded timeout; default 60 seconds |
| `RELEASE_AI_API_KEY` | Encrypted repository Actions Secret | Passed only to the AI HTTP step; never an ordinary Variable |
| `GITHUB_TOKEN` | GitHub-provided token | Read access for inspection; write access only in the publisher |

For `openai`, append `/chat/completions` and use bearer authorization. For `anthropic`, append `/messages` and use the provider's required headers. Reject an already-suffixed URL clearly instead of silently appending twice. Treat protocol selection as configuration, not runtime endpoint probing. TLS verification stays enabled; redirects are disabled; transient retries are bounded (at most two total attempts). Do not log request headers, the key, raw response/error bodies, prompts, or source diffs.

GitHub Variables are not secret/masked. If an endpoint itself contains confidential information, remove it from the URL or store it as a Secret through an explicitly documented alternative; do not put credentials into a supposedly non-secret URL.

## 3. Release Baseline and Eligibility

### Baseline

Query GitHub's latest published non-draft, non-prerelease release, resolve its bare semantic-version tag, and fetch/peel it to a commit. Validate that it is an ancestor of the pinned candidate and that normal source package/lock root versions match that published version. Exclude drafts and arbitrary newer tags as successful baselines.

Planning observed published `0.4.0` with no uploaded assets; do not hard-code it. No published release, an unsupported version/tag, an unresolved/non-ancestor tag, conflicting pending releases, or unexplained package/lock drift must stop with a clear manual-reconciliation message. Do not initialize or reinterpret release history automatically.

### Net Product Difference

Compare the fixed baseline and candidate trees, not the last seven days or the number of commits. Handle additions, deletions, and rename old/new paths. Fully reverted changes and merge/documentation-only histories must skip.

- Include backend runtime code/launcher/main, frontend runtime source/index/shipped resources, runtime dependency/build inputs, deployment behavior, and explicitly selected user-facing maintenance scripts.
- Configuration examples may count as application configuration-contract changes, while remaining excluded from source-diff transmission.
- Exclude changes solely in docs, tests, generated fixtures, `.trellis`, `.context`, other AI metadata, development-only tools, and release-engineering files.
- In package manifests, compare while ignoring only the three application version fields. Do not ignore a whole manifest or trust a `chore(release)` commit message to hide changes.
- Keep the path policy a small tested explicit implementation. Document the exact include/exclude list, including shipped resources and selected maintenance scripts, before merging.

No eligible net change returns `skipped_no_product_change` without AI, version changes, commits, tags, or releases.

## 4. AI Input, Decision, and Trust Boundary

The user explicitly chose summaries plus bounded source diffs, not full-repository upload.

1. Gather commit subjects relevant to eligible product paths, path/status information, and change statistics; omit author emails and unrelated task/history text.
2. Allow diffs only for eligible text source. Deny actual `.env`/configuration instances, credential files, private keys/certificates, databases/WAL/SHM, uploads, clinical documents, screenshots, binaries, and generated artifacts. Config examples receive path/stat summaries only.
3. Bound the final UTF-8 request to 64 KiB, with at most 48 KiB of source diff and at most 4 KiB per file. Deterministically prioritize runtime changes and identify omitted/truncated files; never silently claim full coverage. If even the required summary cannot fit, stop rather than omit the fact that changes exist.
4. Secret-scan the **exact outgoing payload**, including deleted lines and commit subjects, using the project's existing gitleaks tooling/configuration. Also scan every decoded field of the validated release plan, including `rationale` and `notes_zh`, and the final serialized commit-envelope/Release text before any artifact persistence, upload, commit or remote write; scanning notes alone is insufficient. Re-scan decoded plan fields and final public text during recovery, before any optional encoding hides values. A suspected secret or unavailable required scanner stops transmission/persistence/publication; diagnostics show locations/categories, never values. Reuse the existing tool with a verified pinned runner installation; do not introduce a second ad-hoc scanner or copy raw reports into artifacts.
5. Present commit text/diffs as untrusted data. The model has no tools, GitHub token, filesystem control, or command-execution ability.

Require one strict JSON object with closed fields: `bump` (`minor` or `patch`), `rationale`, `notes_zh`, `sufficient_context` (boolean), and `breaking_change` (boolean). Bound rationale to 1 KiB, Chinese notes to 8 KiB, and the HTTP response to 32 KiB before parsing. Reject malformed/fenced/multiple JSON values, extra fields, unsupported enums, oversized text, unsafe control characters, and invalid types. `sufficient_context=false` or `breaking_change=true` stops automatic publication for manual review. Never use an implicit patch fallback.

The program computes the next version from the verified current release version using integer components:

- `patch`: `0.4.0` -> `0.4.1`; `0.4.9` -> `0.4.10`.
- `minor`: `0.4.9` -> `0.5.0`.
- Do not perform floating-point/decimal addition, let AI supply an arbitrary tag, or auto-bump major.

Validated notes are data: write them to a UTF-8 file, never interpolate them into shell source or multiline workflow outputs. Strip/forbid unsafe active content and unsolicited mentions/links according to a tested notes policy. Only validated simple booleans, SHAs, and semver strings may become workflow outputs.

## 5. Version Preparation, Validation, and Publication

Use `frontend/package.json` as the version authority; update exactly it and the two root-package version mirrors in `frontend/package-lock.json`. Preserve dependency/lock content. An implementation may use `npm version <validated-version> --no-git-tag-version --ignore-scripts`, followed by a structural assertion that only those version values changed; never run an uncontrolled lifecycle hook or update dependencies as part of a release.

The validation job checks out the pinned candidate, applies the new version locally, stages only those two files, and computes the resulting Git tree hash. Run pytest (new release unit/integration/contracts plus the existing full suite), frontend `npm test`, lint, root-base frontend build, and Python formatting/syntax checks against that exact content. A successful gate means the tested versioned source tree is known; no executable ZIP is built or uploaded.

Before writing, the publisher independently enforces publication-mode/opt-in guards and verifies the plan, baseline, source parent, next version, exact allowed changes, and tested tree hash. It fetches remote refs and checks that `main` is still the pinned source, the successful-release baseline has not changed, and the intended tag does not already point elsewhere. A previously evaluated enable flag is not a guaranteed fresh in-flight stop signal; the operations procedure below requires cancellation and state verification.

Create a local commit `chore(release): 发布 <version>` whose parent is the pinned candidate and whose tree equals the validated tree. Store a bounded, strict machine-readable `Release-Plan-V1` envelope in the commit message (not a new tracked state file), containing baseline tag/SHA, source SHA, final tree hash, next version, bump, sanitized rationale/notes, and an integrity digest. Use a message file, not shell interpolation. This preserves the exact approved plan for recovery without embedding prompts, source diffs, or secrets.

Push `main` and the bare version tag in one `git push --atomic` transaction. A competing main change or existing conflicting tag must reject the entire transaction. Do not force-push, rebase automatically, delete refs, bypass branch protection, create a PAT, or change repository settings as a fallback.

After verifying the remote tag resolves to the new commit, create a formal GitHub Release with `gh release create <validated-tag> --verify-tag --notes-file <validated-notes-file>` and an explicit deterministic title. Do not supply custom assets or rely on `gh`'s default automatic tag creation. GitHub generates source ZIP/tar.gz. Build and publish stay in this workflow because `GITHUB_TOKEN`-created events normally do not trigger a second workflow.

## 6. Retry, Concurrency, and Recovery

| State | Required behavior |
| --- | --- |
| No product change | Successful skip; zero AI or publishing calls |
| Disabled schedule | Successful skip before AI/config validation |
| AI/config/scan/test/build failure | Fail with sanitized reason; no remote version commit/tag/release |
| Candidate/main moves before atomic push | Fail as stale; no partial ref push; next run reevaluates |
| Branch protection/token denies atomic push | Fail closed; operator reconciles permissions without bypass |
| Main/tag push succeeds but Release creation fails | Report `pending_release`; retain refs; no deletion or new bump |
| Valid pending tagged release exists | Verify its envelope, tag, version-only diff, parent/source and tree hash; re-run gates on that exact tag and finish the same Release without calling AI or changing main |
| New main commits appear after a pending tag | Resume only the pending tag; do not fold newer code into its notes/tree; later changes remain unreleased |
| Same tag Release already published and matching | Idempotent no-op for that release; inspect newer source changes only as a separate candidate |
| Conflicting tag, manual draft, malformed envelope, multiple pending versions, or changed baseline | Stop for manual reconciliation; never overwrite/delete published history |

Inspect pending tags newer than the successful baseline before asking AI. Recovery is permitted only for a single validated automation-owned version-only commit reachable from `main`; arbitrary manually created tags are not silently published. Failed/ambiguous API responses must be resolved by reading current Release state before retrying mutation. Store no full plan in logs and upload no raw diff artifact.

## 7. Compatibility and Operations

- Preserve three-part bare tags and current source-release behavior. Existing historical tags/releases remain untouched.
- No backend/UI/EXE version display changes, Windows dependency fixes, runtime AI configuration changes, production restarts, or source data migrations.
- Document the release-only Actions exception without reinstating the removed merge CI or PR gate. Trellis/spec updates remain a separate commit from code when the user later authorizes commits.
- Protect publication with job-level permissions; keep checkout credentials unpersisted in AI/validation jobs. Pin official actions and existing gitleaks tool downloads to verified revisions/checksums during implementation.
- First activation is an operator action after local checks and a reviewed manual dry run. A dry run may still send the approved bounded input to the configured AI; explain that it is not an offline mode. Do not enable publication or configure secrets during implementation without the required separate authorization.
- Public schedules can be disabled after inactivity, fork schedules are disabled by default, and jobs may be delayed. Document re-enable/manual-run steps, minimal required branch/token permissions, and where sanitized run summaries appear.
- Emergency stop after authorized operator action: (1) set `WEEKLY_RELEASE_ENABLED=false` or disable the workflow to prevent new runs; (2) cancel **all running and queued weekly/manual release runs**, and verify they have actually stopped; (3) read remote main/tag/Release state to determine whether publication already completed or left a pending release. Changing a variable or disabling a workflow alone does not cancel in-flight work, and cancellation can race an already-sent API request. Do not claim rollback or a complete stop until the run and remote states are verified. Never automatically delete releases/tags or deploy an old version as rollback.
