# Implementation plan — single horizontal-table editing guard

## Status and relay ownership

The user explicitly approved `prd.md`, `design.md`, this plan, relay implementation, npm ci for existing locked dependencies, test execution, temporary random local test credentials/signing keys, and disposable local app/browser validation through AskUserQuestion on 2026-10-26. A must run `task.py start` before B executes implementation steps; environment/baseline preparation is authorized. Production access, commits and push remain unauthorized.

- Worktree: `/home/decade/crf-editor-single-table-guard`; branch: `feat/single-table-guard`; planning base: `2048df2`.
- A: current `gpt-6.1-sol[1M]`, explicitly approved by the user; owns environment prep, planning artifacts/specs, reviews, browser validation, acceptance and all Git history.
- B: relay alias `sonnet`; stopped after the 60-minute wait timed out and A verified an out-of-scope extra worktree/symlink. No final report or `done` event exists, so resolved model/cost are unknown. Do not resume B.
- A takeover: on 2026-10-26 the user formally chose main-session implementation/review/fixes in the original worktree and the same 25 deliverable paths below. A also retains the already-approved task/spec/log ownership. This supersedes instructions below that would send further fixes to B. No extra dependency changes, commits/push, production access or cleanup were authorized; `/tmp/crf-flake-base` remains retained.
- R: independent read-only review after A accepts the diff, default `fable`; verify resolved model/cost from its completion event.
- Curated context order: `implement.jsonl` → `prd.md` → `design.md` → this file. Requirements and API decisions are closed; report any conflict/uncertainty under Open Questions instead of changing them.

## Exact B write scope

B may create/modify **only** these deliverable files (not every file must change):

### Production

1. `backend/src/services/inline_table_guard.py` (new)
2. `backend/src/services/field_restore_service.py` (new)
3. `backend/src/services/field_profile_service.py`
4. `backend/src/routers/fields.py`
5. `backend/src/schemas/field.py`
6. `frontend/src/composables/formFieldPresentation.js`
7. `frontend/src/components/FormDesignerTab.vue`

### Tests and shared fixture

8. `backend/tests/fixtures/inline_table_block_cases.json` (new)
9. `backend/tests/test_inline_table_guard.py` (new)
10. `backend/tests/test_field_restore.py` (new)
11. `frontend/tests/inlineTableGuard.test.js` (new)
12. `frontend/tests/component/SingleInlineTableGuard.spec.js` (new)
13. `frontend/tests/component/FormDesignerFieldReorder.spec.js`
14. `frontend/tests/designerFieldReorder.test.js`
15. `frontend/tests/designerHistory.test.js`
16. `frontend/tests/designerFieldCopy.test.js`
17. `frontend/tests/designerNewFieldDraft.test.js`
18. `frontend/tests/formDesignerPropertyEditor.runtime.test.js`
19. `frontend/tests/quickEditBehavior.test.js`

Existing test-file changes are limited to new behavior and the smallest real-helper/harness adjustments required by changed call sites. Do not weaken assertions or mock the new code under test to make old tests pass.

### Documentation

20. `README.md`
21. `README.en.md`
22. `.claude/CLAUDE.md`
23. `backend/.claude/CLAUDE.md`
24. `frontend/.claude/CLAUDE.md`
25. `.claude/index.json`

Everything else is read-only for B, **including this entire task directory, all `.trellis/` files, `.context/`, other specs, and `useDesignerHistory.js`**. No migrations, import/clone/copy helper changes, planner/export changes, package/lockfile changes, new runners/configuration, production runtime/config/data access, commits, staging, merge, push or deletion. Do not install dependencies. No deliberate scripts/reports/log artifacts outside the write scope or outside the worktree. Normal derived outputs/temp files of the explicitly authorized existing test/build tools are not deliverables and may be created by those tools; do not modify private/runtime data.

If a directly necessary change lies outside this scope, stop and report it as an Open Question. A decides whether to expand scope.

## A-only prerequisites before dispatch

- [x] User reviewed `prd.md`, `design.md`, this file and authorized implementation. Formal AskUserQuestion approval also covers temporary random local browser-test credentials/signing keys, disposable services and browser E2E.
- [x] Prepared **existing locked dependencies only** with `cd /home/decade/crf-editor-single-table-guard/frontend && npm ci`; manifests/lockfile remain unchanged. Existing audit/engine warnings are recorded in `research/dependency-audit.md`; no Critical audit entry was reported and no dependency fix is authorized.
- [x] Captured clean-source full backend baseline: **1384 passed**, exact coverage **86.75566857385039%** (9438 statements, 1250 missed), JSON/logs under `/tmp/crf-single-table-guard.vOcuj0/`; no production config/database used.
- [x] Captured native frontend helper coverage baseline: **97.78% lines / 90.63% branches / 100% functions**, existing `formFieldPresentation.test.js`, log under the same temporary directory.
- [x] Validated task/context files and ran `task.py start`; status is `in_progress` on `feat/single-table-guard` in the task worktree.
- [ ] Record `git rev-parse HEAD`, `git status --porcelain`, and exact pre-dispatch file inventory. Do not let the worker commit.
- [ ] Create channel `relay-10-26-single-table-guard`; dispatch with `TRELLIS_HOOKS=0`, `--agent implement --model sonnet --cwd /home/decade/crf-editor-single-table-guard --idle-timeout 30m --timeout 2h`; send the brief from an A-owned temp file and wait immediately. Follow `/trellis-relay` timeout/error rules, not transcript polling.

## Ordered B execution checklist

### 1. RED: behavioral counterexamples first

- [ ] Add the shared fixture and new tests before implementation. Include canonical 0/1 cases plus truthy noncanonical integers, both split directions, accepted ordinary sections, legacy comparisons and unchanged-layout operations.
- [ ] Demonstrate at least one existing API currently accepts a prohibited **second horizontal block**, not merely a new helper import failure. Demonstrate mounted invalid toggle/reorder behavior currently fails the requirement.
- [ ] Add atomic-restoration tests first: missing endpoint/behavior, success for regular/label/log, later invalid separator rollback, missing-label fallback rollback, cross-user/project definitions and links, duplicate/conflicting definitions, input bounds/shape, response request-order mapping.
- [ ] Run the focused RED commands; record the actual expected failure and counts in the final Verification Results. Do not implement first or treat a pre-existing environment error as RED.

### 2. GREEN: pure policy and backend boundary

- [ ] Implement the small frontend count/policy helpers beside current grouping and the small backend query/count/guard service; use the common Chinese reason from `design.md`.
- [ ] Guard direct create, normalized create-profile/upsert binding-profile, and reorder in the existing edit transaction. Capture current counts before mutations and validate actual final ordered rows after flush. Preserve ownership/duplicate/incomplete-ID error behavior and transaction ownership.
- [ ] Do not add a rule to deletes, shared-definition PUT, import, whole-copy, or global ORM hooks. No schema range change or legacy data normalization for noncanonical markers.
- [ ] Add the exact `POST /api/forms/{id}/fields/restore-batch` request/response contract in `design.md`, bounded schemas and focused service. It must restore all rows/needed label definitions/order atomically and validate the final batch against its request-time current form baseline. No bypass flag or arbitrary shared-definition creation/update.
- [ ] Run backend focused tests; fix incrementally. If a third unresolved attempt occurs, stop blind retries and report the isolated failure/instrumentation needed.

### 3. GREEN: immediate UI and history wiring

- [ ] Guard toggle/quick-edit/type/candidate/draft entry points before accepting an invalid prospective layout. Revert only the offending operation plus its dependent state, preserving unrelated dirty inputs and existing selection/context.
- [ ] Use intended sorted draft order. Keep current copy insertion semantics and ensure both main/fullscreen previews do not count the raw appended copy as a separated second block.
- [ ] Recheck persisted/draft Save and handle the same backend reason without success/history pollution or whole-editor reset. Keep ordinary validation/network behavior intact.
- [ ] Preserve drag insertion-boundary/end-zone/Ctrl+arrow behavior. Reuse existing rollback and show the specific business failure while retaining the generic warning for unrelated save failures.
- [ ] Route single/batch delete undo through **one** restore-batch request. Remove replaced multi-request label-recreation fallback; only remap returned IDs after complete success. Other create/profile/reorder history replays remain on existing guarded APIs and current baselines.
- [ ] Keep `useDesignerHistory` unchanged; its failure behavior already preserves stacks. Do not broaden history scope, drop session guards, reload over active local state, trigger hydration toasts, or use stale historical layouts as compatibility exemptions.
- [ ] Run new mounted and relevant existing behavior tests. Test both rejection and a subsequent valid retry, previous selection, retained name/color/default content, and unchanged history/ID mappings after failed restoration.

### 4. Documentation and self-review

- [ ] Sync README zh/en, root/module context and index with the horizontal-only policy, legacy compatibility, edit/whole-copy boundary, immediate rollback and additive restore API/tests.
- [ ] Use English in LLM-facing module/rule text; retain the README's established bilingual convention. No narrative Change Log expansion or archive rewriting; A handles the task's historical record later.
- [ ] Correct only directly relevant stale designer `addField`/library-drag wording encountered while updating the affected module paragraphs; do not perform a broad documentation cleanup.
- [ ] Review actual diff/new files against every AC and exact scope. Run the commands below and report failures/skips honestly. No auto-fixes outside scope or hidden commits.

## B verification commands

Use explicit cwd on every call. For every backend test command, unset only local test proxy variables and force disabled background jobs in that shell:

```bash
cd /home/decade/crf-editor-single-table-guard/backend && unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY && CRF_DISABLE_BACKGROUND_JOBS=1 /home/decade/.venvs/crf-editor/bin/python -m pytest tests/test_inline_table_guard.py tests/test_field_restore.py -q
```

Run that in RED after tests exist and again in GREEN. Backend integration/security/compatibility regressions:

```bash
cd /home/decade/crf-editor-single-table-guard/backend && unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY && CRF_DISABLE_BACKGROUND_JOBS=1 /home/decade/.venvs/crf-editor/bin/python -m pytest tests/test_inline_table_guard.py tests/test_field_restore.py tests/test_field_profile.py tests/test_fields_router.py tests/test_phase0_ordering_contracts.py tests/test_isolation.py tests/test_subresource_isolation.py tests/test_permission_guards.py tests/test_codelist_option_authorization.py tests/test_test_environment_isolation.py tests/test_form_copy.py tests/test_project_copy.py tests/test_project_import.py -q
```

Frontend behavioral tests (RED may be narrowed to the new test; GREEN runs the full command):

```bash
cd /home/decade/crf-editor-single-table-guard/frontend && node --test tests/inlineTableGuard.test.js tests/formFieldPresentation.test.js tests/formDesignerPreviewModel.test.js tests/designerFieldReorder.test.js tests/designerHistory.test.js tests/designerFieldCopy.test.js tests/designerNewFieldDraft.test.js tests/formDesignerPropertyEditor.runtime.test.js tests/quickEditBehavior.test.js
cd /home/decade/crf-editor-single-table-guard/frontend && npm run test:component -- tests/component/SingleInlineTableGuard.spec.js tests/component/FormDesignerFieldReorder.spec.js tests/component/OidEditSave.spec.js
cd /home/decade/crf-editor-single-table-guard/frontend && node --test --experimental-test-coverage --test-coverage-include=src/composables/formFieldPresentation.js tests/inlineTableGuard.test.js tests/formFieldPresentation.test.js
cd /home/decade/crf-editor-single-table-guard/frontend && npm run lint
cd /home/decade/crf-editor-single-table-guard/frontend && npm run build
```

Backend format/syntax (only changed files; do not format the whole repository):

```bash
cd /home/decade/crf-editor-single-table-guard/backend && /home/decade/.venvs/crf-editor/bin/python -m ruff format --check src/services/inline_table_guard.py src/services/field_restore_service.py src/services/field_profile_service.py src/routers/fields.py src/schemas/field.py tests/test_inline_table_guard.py tests/test_field_restore.py
cd /home/decade/crf-editor-single-table-guard/backend && /home/decade/.venvs/crf-editor/bin/python -m py_compile src/services/inline_table_guard.py src/services/field_restore_service.py src/services/field_profile_service.py src/routers/fields.py src/schemas/field.py tests/test_inline_table_guard.py tests/test_field_restore.py
cd /home/decade/crf-editor-single-table-guard && git diff --check
```

If command/environment guards block an unchanged precondition, report instead of bypassing it. Do not install tools/plugins or change provider configuration. Never use `|| true` to conceal a validation failure.

## A acceptance / independent review

- [x] Compare status to the recorded pre-dispatch inventory and scope; `git log <base>..HEAD` must be empty. Inspect every actual diff and new file; do not rely on B's report or progress transcript.
- [x] Re-run all GREEN validation commands above independently.
- [x] Run the full backend suite after implementation, collecting coverage with the same options as the baseline; compare overall coverage and new modules (target ≥80%, no decrease). Existing project policy is statistics-only: do not add gates to config.

```bash
cd /home/decade/crf-editor-single-table-guard/backend && unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY && CRF_DISABLE_BACKGROUND_JOBS=1 /home/decade/.venvs/crf-editor/bin/python -m pytest --cov=src --cov=main --cov-report=term-missing:skip-covered
cd /home/decade/crf-editor-single-table-guard/frontend && npm test
```

- [x] A performs `trellis-check` as a report-only checklist, plus the required structured security review of the new API/input/transaction boundary. Inspect the actual diff directly even when using a reviewer; no independent-review claim for self-review.
- [x] A launches the task app on disposable local DB/uploads and an unused port, using only formally authorized temporary credentials. Verify allowed first block, rejected separated toggle, rejected disabling-in-middle, invalid drag/Ctrl+arrow, retained unrelated dirty values, valid adjacent copy, legacy progressive repair, and atomic failed batch undo with no persisted partial rows. Use a unique owned browser page; no shared live service/database or peer page access. If blocked, report exact browser/auth/network scope not run.
- [x] After code behavior is verified, A updates only the relevant cross-stack spec: document the new horizontal-block/atomic-restore contract and correct the directly relevant obsolete reorder request/response prose to actual `ordered_ids`/204. Task/spec writes are A-only and go in standalone Trellis commits if later authorized.
- [x] Fix rounds go back to B, at most 2. Snapshot new in-scope files before each round. On scope/history violation, stop and report; do not revert silently.
- [x] After no blocking A findings, run a separate read-only R review per `/trellis-relay`; snapshot/check that files and Git state are unchanged by R. Record alias, resolved model, verdict and completion cost; do not treat it as a second implementation slice.
- [x] Kill implement/review workers at closure; keep channel audit logs. Commits/merge/push/removals require the applicable explicit authorization and are not implied by plan approval.

## A takeover verification board

- [x] Reconcile scope, original task pointer and unchanged Git history; preserve the stopped worker's work and extra tree/link without cleanup.
- [x] Reproduce then fix restore-without-definition acceptance, numeric ID ordering, malformed batch-undo payload, missing immediate type/draft/quick guards, remote narrow rollback and unnecessary history rejection reload.
- [x] Replace constant-allow test harnesses with real guard helpers; add stateful batch undo/redo and adversarial restore-link tests.
- [x] Focused backend 48 passed; focused frontend node tests passed; new mounted guard suite 17 passed (including review-followup regressions).
- [x] Full backend 1432 passed, coverage increased from 86.76% to 86.96%; restore service 98.97%, guard 100%.
- [x] Final `npm test -- --maxWorkers=1`: 1046 node tests and 188 component tests passed. Default parallel full runs are intermittent (one earlier complete 1043 + 182 pass, later 5 failures including 5-second timeouts after the three coverage-only tests were added); an earlier serial run also had one missing-DOM failure. Preserve failed logs; do not claim the default mode is stable or infer a root cause. The unchanged committed frontend snapshot passed all 171 component tests. No unrelated test/config changes or retries were added. Helper coverage improved to 98.11% lines / 92.31% branches / 100% functions.
- [x] Lint (0 errors, 2720 warnings), build, changed-file Python format/syntax passed; dependency audit remains not clean and unchanged.
- [x] Real-browser disposable-state acceptance passed: first/adjacent block, both invalid toggles, native drag/Ctrl+arrow, sorted adjacent copy in both previews, dirty draft type rollback/save/undo, legacy 3→2→1 plus forbidden undo, twice-rejected atomic batch undo with unchanged readback, and post-review live-preview cross-field toggle rejection + type round-trip restoration.
- [x] Sync the six approved product documents and A-owned cross-stack §15 / corrected reorder contract.
- [x] Independent read-only R review returned PASS (0 blocking findings, 6 non-blocking findings); its hash/status/HEAD check confirmed no writes. Review alias `fable`, configured mapping `claude-opus-5-5[1M]` (completion event does not expose resolved model); completion cost estimate $7.4371656, 93 turns, 1691616 ms. A reproduced five additional failures covering reused-ID remapping, existing imported label snapshots, type round-trip and pre-prompt copy preservation; fixed them within scope. A also reproduced and fixed a visible-preview/other-field toggle combination. A rejected the original 标签-candidate scenario because `isVisibleInFieldLibrary` excludes 标签/日志行. Added duplicate-ID/append API coverage.
- [x] Final task/context validation, actual-diff/security review, disposable server/browser stop and user report. Do not commit, merge, push or remove files/worktrees.

## Local 8888 deployment follow-up (2026-10-27)

The user explicitly requested that the tested feature replace the application served on the existing 8888 service. This authorizes a local deployment/restart, not commits, merges, pushes, credential inspection, data replacement or cleanup. Do not create a second task or change the systemd unit/environment.

- [x] Verify that `crf-editor.service` still serves main from `/home/decade/CRF-Editor/backend`, while 8907 serves the task worktree. Main is clean at `2048df2`; no service drop-ins exist.
- [x] Rebuild frontend (`npm run build`, 4.74s), rerun 17 mounted guard tests and 48 backend guard/restore tests, and validate changed Python syntax under the service's Python 3.12.3. The service interpreter has no pytest; focused pytest uses the established isolated test interpreter.
- [x] Stage an exact deployment snapshot of the 7 production source files and 28 frontend artifacts in `/tmp/crf-8888-single-table-guard.2nWNyD/payload`; back up all 18 existing destinations under its `backup/`. Check file/link identities, source/target hashes, clean main and script syntax. Gitleaks scanned the full payload (2.23 MB), with no leaks.
- [x] Prepare `/tmp/crf-8888-single-table-guard.2nWNyD/deploy.sh` and its read-only verifier. The script checks for intervening changes, requests sudo interactively, stops 8888, synchronizes only the snapshot, restarts the unchanged unit and checks served artifact hashes, route registration and authentication. On failure it restores overwritten files and restarts the old code; newly added unused files remain, without deletion.
- [x] The user ran `! bash /tmp/crf-8888-single-table-guard.2nWNyD/deploy.sh` with interactive sudo after the initial password-required blocker. No password was requested or exposed in chat.
- [x] Independently ran `python3 -I /tmp/crf-8888-single-table-guard.2nWNyD/verify.py --postcheck`: 8888 serves the exact new index/designer hashes, the restore-batch route is registered, authentication returns 401 and all 7 installed production sources match the snapshot. Systemd reports active/running, PID 106195, start time 2026-10-27 14:34:03 CST, original working directory and no drop-ins. Main has exactly 5 modified and 2 new production files at unchanged HEAD `2048df2`; no commits/merge/push occurred. This intentional deployment overlay must be reconciled before a later authorized merge. User browser acceptance subsequently passed. Through AskUserQuestion the user explicitly authorized complete closeout: work/spec commits, task archive and journal, safe reconciliation of the main deployment overlay, merge and push to origin/main, stopping the owned 8907 instance and removal of this task's worktree/branch. Backups, verification logs and `/tmp/crf-flake-base` must remain. A second explicit confirmation authorizes copying the shared node_modules dependency to `/tmp/crf-8888-single-table-guard.2nWNyD/retained-node_modules` and retargeting only `/tmp/crf-flake-base/frontend/node_modules` before removing its old target worktree.

## Final closeout verification (2026-10-27)

- Full backend rerun: 1432 passed / 986 warnings, 71.02s, exact coverage 86.95878977569119%; guard 100%, restore 98.96907216494846%.
- Full frontend rerun: `npm test -- --maxWorkers=1`, 1046 node + 188 mounted tests passed; lint 0 errors / 2720 warnings; all 7 changed/new Python files pass format checking. Earlier build/security/browser evidence remains applicable; user manually accepted the deployed 8888 version.
- Remote main was fetched and matches the original base (0 ahead/0 behind). An isolated Git probe confirms that staging only the 7 byte-identical deployed paths permits `git merge --ff-only` without removing or changing their working file contents. Do not reset, clean or stash away running production sources.
- Work commits completed with normal pre-commit hooks: `130fb0c feat(forms): 限制单表单横向表格并原子恢复删除字段` (21 approved production/test/doc paths), `c7727ab docs(context): 记录单横向表格限制验收归档` (narrative archive only), and `c998655 docs(spec): 记录单横向表格与原子恢复契约` (cross-stack spec only). Separate Chinese task-archive and session-journal commits follow. No attribution trailers. The hook's conditional ruff check was skipped because ruff is absent from its PATH; explicit virtualenv ruff checks already passed for all 7 Python files. Main also has the byte-identical context-archive entry, so its matching overlay consists of the 7 deployed source paths plus this one documentation path; reconcile exactly these 8 paths before ff-only merge.
- A parallel uppercase-OID planning session acknowledged the merge window and will not modify main or the shared journal/index. Preserve that worktree, the unrelated Word-numbering worktree and the retained baseline worktree during cleanup.

## B final report (English, maximum 25 lines)

```text
## Files Modified
- <all actual paths, grouping related paths on one line if necessary> - <one line>
## Verification Results
- RED <command(s)> -> expected fail - <behavior, counts>
- GREEN <command(s)> -> pass|fail - <counts or concrete blocker>
- <lint/build/format/syntax/coverage command(s)> -> pass|fail|not-run - <one line>
## Open Questions
- <omit this section if none>
```

No diffs/full logs. List exact commands or clearly identified commands above; distinguish expected RED failure, GREEN failure, not-run and environment-skipped checks. B must not claim browser E2E, full-suite/coverage comparisons, or independent review that only A performs. A's final report additionally records resolved models, fix rounds, cumulative B completion-event cost, fixed/remaining findings, files and independent verification results.
