# Weekly Release Workflow: Constraints and Security Evidence

Inspected on 2026-10-16. This is planning evidence, not authorization to enable or publish a workflow.

## Repository Evidence

- `.trellis/spec/guides/git-and-tooling-conventions.md:20-35` documents direct local merges into `main`, no routine PR gate, and removal of GitHub Actions on 2026-10-08. The user's new request authorizes planning a release-specific exception; it does not restore unrelated CI or a PR workflow.
- `.context/prefs/workflow.md:34-41` requires real targeted tests and a dedicated security review for secrets and external integrations. `.context/prefs/workflow.md:51-69` defines branch-scoped decision records.
- `backend/src/config.py:111-117` models AI URL, key, model, timeout, and protocol separately. Release configuration must remain independent of application runtime settings and must not read actual `.env` or `config.yaml` values.
- `backend/src/services/ai_review_service.py:227-261` demonstrates an OpenAI-compatible base URL with `/chat/completions` appended. `backend/src/services/ai_review_service.py:275-309` demonstrates an Anthropic-compatible base URL with `/messages` appended. These are protocol evidence only; do not import the application's configuration-loaded service into a standalone release tool merely to reuse an HTTP request.
- `.trellis/workflow.md:323-337` distinguishes task creation from implementation activation; `.trellis/workflow.md:392-455` requires real spec/research manifests and reviewed planning artifacts before a complex delegated task is started.

## Official GitHub Documentation

Retrieved through Context7, library `/websites/github_en_actions`.

1. Scheduled events and default-branch behavior:
   https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
   - Scheduled workflows need to exist on the default branch.
   - Schedules may be delayed under load, particularly at the beginning of the hour. Avoid a round-hour minute and do not promise an exact wall-clock execution time.
   - Use an explicitly documented UTC cron expression so local-time interpretation is unambiguous.
2. Automatic disablement:
   https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows
   - Public-repository scheduled workflows may be disabled after 60 days without repository activity; fork schedules are disabled by default. Document manual re-enablement rather than promising perpetual exact weekly delivery.
3. Configuration variables:
   https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables
   https://docs.github.com/en/actions/concepts/workflows-and-actions/variables
   - Repository/environment Variables are available through `vars`; missing values evaluate to an empty string.
   - Variables are not masked; confidential values belong in Secrets.
4. Encrypted secrets:
   https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
   - Pass secrets through an explicit step environment. Missing secrets evaluate to an empty string, so fail-fast validation is required before an eligible release makes an HTTP request.
5. Injection safety:
   https://docs.github.com/en/actions/concepts/security/script-injections
   https://docs.github.com/en/actions/reference/security/secure-use
   - Commit messages, refs, issue text, and similar strings are untrusted data. AI output has the same trust boundary.
   - Never directly interpolate those strings into shell source. Use a validated data file and argument arrays; release notes should be passed as a body file rather than an inline shell expression.
   - Do not check out and execute an untrusted PR with secrets or privileged workflow events.
6. Token-trigger recursion:
   https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow
   - Operations performed with the default `GITHUB_TOKEN` normally do not trigger downstream workflows. Keep build and publication in the same orchestration rather than relying on a bot-created tag to start a second build workflow.

7. Release creation and safe tag binding:
   https://cli.github.com/manual/gh_release_create
   https://cli.github.com/manual/gh_release_view
   - `gh release create` otherwise creates a missing tag from a default-branch/target ref. Use `--verify-tag` to require the intended tag already exists, and `--notes-file` to keep notes out of shell source.
   - `gh release view` supports read-only inspection of the latest or a named release. Source-only creation requires no uploaded asset arguments.
   - Local `gh release create --help` independently confirmed both flags in installed CLI 2.55.0. Newer online documentation also mentions `--fail-on-no-commits`, which is absent from the inspected local help; do not depend on that newer flag. The task needs its own net-product-diff check anyway.

## Designed Security Boundaries

- Only a scheduled/default-branch or explicitly authorized manual run may reach publication; no `pull_request_target` or arbitrary external ref execution.
- Use `RELEASE_AI_API_URL`, `RELEASE_AI_MODEL`, and an explicit API format as non-secret configuration; use encrypted `RELEASE_AI_API_KEY`. This naming is proposed, not an existing runtime contract.
- Require HTTPS, certificate verification, no credentials embedded in URLs, no automatic cross-host redirects, bounded request/response sizes, explicit timeout, and bounded retries for transient errors.
- AI chooses the constrained `minor`/`patch` enum plus text notes; trusted deterministic code computes the final version. Do not give the model a tool that can execute code, push, tag, or publish.
- Separate the AI planning job from the write-enabled publishing job. Give the AI HTTP step only its own service key; do not persist Git checkout credentials in that job. Use job-level `contents: write` only where needed for Git/Release operations.
- The user selected summaries **plus bounded source diffs**, rather than the initially recommended metadata-only option. The design must filter eligible text source, scan the exact payload before transmission, bound per-file/total bytes, and mark truncation. Author emails, application databases, uploaded forms, screenshots, environment files, actual configuration and secrets remain excluded. This is approval of the proposed payload scope, not a live AI call during planning.
- AI/API failure must stop the release. A `+0.01` fallback would conceal failed review and is not proposed.
- Public visibility follows validation and required artifact completion. Retain an auditable source SHA, baseline SHA, selected increment, and model identifier without logging credentials or raw HTTP error bodies.

## Execution-Time Checks

- Re-check current repository Actions/token settings and any branch protection before activation; do not treat current local authentication as permission for remote writes.
- Select and pin official action revisions at implementation time after verifying the upstream reference. Do not invent commit SHAs in the plan.
- Re-check the configured API protocol/URL semantics. The user has selected semantic minor/patch in the existing three-part version scheme and source-only publication; see `design.md` for the resolved contract.
- No live AI calls, repository settings updates, GitHub releases, uploads, or test publications were performed during this planning research.

## Independent Planning Review Follow-Up

A bounded read-only planning review identified two medium planning gaps, not reproduced implementation vulnerabilities. Both were incorporated into PRD/design/implementation checks before handoff:

1. The entire decoded/serialized release plan, including AI rationale, can become public through recovery metadata. Scan it before persistence/upload/commit/push and again during recovery; a clean notes field alone is not sufficient. Add a rationale-only simulated-secret rejection test.
2. Disabling a schedule/flag does not cancel an already-running publisher. The operator stop procedure must disable new work, cancel and verify running/queued release runs, then inspect remote main/tag/Release state. Cancellation may race an in-flight API call and is not rollback.

The main session verified these as design-boundary issues and revised planning text only. No implementation, real secret access or external mutation was required.
