# A-Owned Acceptance Checklist

A owns this acceptance checklist. Final post-round2 A results are in `verification.md`; `a-review-round1.md` preserves historical pre-fix/browser evidence. Both fresh read-only review passes returned, and A verified their scoped file/Git state unchanged. Final requested-opus review returned PASS/no blockers with two open non-blocking test gaps. **Technical acceptance is complete with disclosed limitations; actual Opus routing remains unverified** (reviewer context advertises gpt-6.1-sol[1M]). No review/test work remains pending or automatically queued. Final evidence is in `final-independent-review.md`.

## Execution Board

- [x] S0: user-approved plan/worktree/base alignment, isolated dependencies, baseline and recoverable snapshots.
- [x] S1–S3: same B completed removal and handback; RED is B-reported evidence, not independently recreated by A.
- [x] S4 A: actual diff/new files/security review, three approved spec edits, independent full/focused validation and unchanged-runtime browser critical-flow acceptance.
- [x] Fix round 1 of 2: App strict coverage, active docs/index and new-function annotations resolved and independently verified; no second source writer or unapproved scope expansion.
- [x] First R: fresh requested-fable read-only pass; all 53 file/absence and five git-state comparisons unchanged. Its non-blocking doc findings reopen AC4; this is not final acceptance.
- [x] A additional doc slice: four user-approved ranges corrected, real retained Agent lifecycle references verified, obsolete-name/path and whitespace checks passed.
- [x] Fix round 2 of 2: same B's seven-file repair handback and A actual-delta/full revalidation passed. Residual non-blocking upload-vs-project test-matrix and helper-annotation limits are recorded in `verification.md`, not claimed fully covered/fixed.
- [x] Final R: NEW fresh native invocation explicitly requested opus; PASS/no blockers, two non-blocking findings. All 57 scope records and five pre/post Git-state pairs unchanged. Actual Opus routing unverified, not claimed.
- [x] A technical acceptance and final report artifact recorded with open nits/model-provenance caveat; commit/merge/push/deploy/archive/cleanup remain unauthorized and not performed.


## Diff / Scope / History

- Compare status to `/tmp/crf-remove-ai-review.VVZ78F/pre-dispatch-status.txt`, base `04df78169fcc1ae2e60a1e0c8dc81a3ab07a6668` and `pre-dispatch-project.tar`.
- B writes only the 33 exact paths plus its progress snapshot; compare every new file, not only tracked diff. No commits, changes to release/MCP/runner/dependencies/settings/permissions, or unrelated layout reversion.
- Keep A-only task/spec/decision writes separate from B scope. Required five removals remain recoverable; new comparison spec is inspected directly.

## Security Pass (loaded security-review checklist, project-specific scope)

- Settings read/save remains admin-only; ordinary and unauthorized requests retain existing 401/403 behavior. No new authentication realm, token storage changes or login/session policy changes.
- Project/temp/upload ownership remains first; foreign/missing temp-ID responses remain non-disclosing; removed AI endpoint no longer exposes existence.
- Legacy `ai_overrides` / settings `ai_*` keys rejected on presence, including null/empty, with sanitized 422 and no writes/consumption. Validate using synthetic sentinel values: no raw body/credential echo, validation error context leakage or logger dump.
- New settings response/schema has no key, URL/model or AI metadata; old raw YAML ignored/inert and not sent to any endpoint. Synthetic template-only config update preserves auth/custom/unknown keys and atomic updates.
- Retired external request/test/task surfaces are gone, not merely gated off. `httpx`/weekly-release handling remains unchanged; no live AI endpoint is called by tests/browser.
- Preserve Word extension/10 MiB checks, exclusive 0600 streaming, cancellation draining and owner-bound screenshot/temp cleanup (.docx/.db/sidecars); no real data/config reads or migrations.
- Keep template path whitelist and non-AI URL-independent helpers; no upload/path boundary removal bundled with exclusive helper deletion.
- Deterministic preview retains existing shared escaped renderer and field values as safe text; no new raw HTML/DOM interpolation or unsafe external content added.
- No hardcoded production credentials or secret-bearing logs. Temporary random test credentials were formally approved and must stay in private scratch, never screenshots/tool args or deliverables.
- Run focused permission/rate/streaming/isolation regression and full backend suite; inspect any available static-scan output as findings, not authorization to fix unrelated code.
- This task does not redesign the project's established JWT/localStorage architecture, deploy HTTPS/CORS changes, add dependency updates, or audit unrelated auth modules; do not import generic checklist examples as new requirements.

## Test / Coverage Gates

- RED evidence expresses removed behavior before deletion; GREEN verifies new absence + retained flows, not weakened tests/mocks.
- A reruns planned pytest / node / real component / lint / build commands. Full serial component coverage uses unchanged deadlines and scratch report directories; original pre-change parallel timeout evidence remains.
- Backend >=88.31431079894645%; changed frontend modules >=80% lines/statements and >=their higher baseline; overall comparable component lines/statements >=67.38%/63.14%. Removed helper coverage alone is not evidence of surviving path quality.
- No default-runner change or artificial coverage exclusions. No claim that component-only report covers the node:test suite or whole frontend >=80%.

## Live Browser (A-owned after source handback)

The following task-only environment was actually launched and driven through settings -> upload -> screenshot/effect comparison -> import -> designer, then stopped. Details and inspected screenshots are in `a-review-round1.md`. Round 1 changes no frontend production source and adds only backend annotations, so this browser evidence remains applicable to the unchanged runtime flow; it is not a claim that the browser was rerun after those test/docs-only repairs.

- `/tmp/crf-remove-ai-review.VVZ78F/launch-browser-backend.py`: redirects config before app import, all state to scratch, loopback port 8907, production-mode reload off and background cleanup disabled.
- `seed-browser-fixture.py`: fresh synthetic regular user/project and DOCX with cover/visit scaffolds, no credential/token printing.
- `login-isolated-page.mjs`: private credential transport over task-owned CDP page only; actual LoginView inputs and submit, boolean-only output. Other interactions use available chrome-devtools MCP. `chromium-cli`/system chrome were unavailable; verified headless-shell executable exists.
- Check task-owned browser/server listeners before launch; capture exact PID and unique page origin, never touch peer pages or 8888.
- Admin settings: real render has template/global card but no AI fields/test; new layout/theme/close access remains.
- Logout via UI, login as synthetic regular user: settings cards and selected-project Agent entry remain; do not issue a live credential as part of this removal acceptance.
- Upload generated DOCX via actual input, select form, open actual compare, verify evidence/effect panels and parsed fields, close then confirm import, open resulting designer.
- Observe request names/counts/payload keys without headers/token/credential values: no AI status/test URL and execute keys only `temp_id, form_indices`.
- Capture and inspect masked/nonsecret screenshots, check console errors; screenshot renderer failure (e.g. no LibreOffice) must be reported as environment-blocked without losing the screenshot panel/error semantics.
- Stop only this task's exact captured processes after verification under the granted lifecycle approval; do not delete audit/scratch resources unless separately allowed.

## Independent Reviews

First requested-fable native review completed; A verified its 53-record/five-Git-state audit unchanged. The user approved its active-doc corrections and last same-B repair round, then explicitly changed final review to opus. After A's post-round2 no-blocker verification, A froze/snapshotted again and launched a NEW native requested-opus fresh read-only reviewer. It returned PASS/no blockers; A verified 57 records and five Git-state pairs unchanged before authoring the final report. Neither reviewer had progress/cache/git write permission. The delivered final context advertises gpt-6.1-sol[1M], so actual Opus routing remains unverified and no verified-Opus claim is made. Two non-blocking test gaps and annotation nits remain recorded without a third round. Full reports, backend/handle/model/usage limits and audit evidence are in `independent-review.md`, `final-independent-review.md` and `relay-state.md`.
