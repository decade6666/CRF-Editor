# Planning Evidence and Review Index

## Scope / Method

Planning base: local `main` at `acdff49`; all code references below were read/searched in the isolated planning worktree. No app/test/build/browser, database access or production configuration inspection was performed. The parent PRD F1–F12 is the authoritative current-fact set; this file records supplementary navigation and verification limitations rather than duplicating those facts.

## Implementation Navigation

| Question | Existing evidence to inspect before implementation |
| --- | --- |
| Domain dirty/save completeness | `frontend/src/composables/formDesignerPropertyEditor.js:113`/`:121`; `frontend/src/components/FormDesignerTab.vue:608`/`:627`/`:666`; `backend/src/models/form.py:31`; `backend/src/schemas/form.py:93`/`:109`/`:128`. |
| Rendering from frozen state/assets | `backend/src/repositories/project_repository.py:71`; `backend/src/services/export_service.py:261`/`:294`/`:583`/`:1508`; `backend/src/services/logo_storage_service.py:60` generates distinct file identities; project profile commits before old-file removal. |
| Physical transaction ownership | `backend/src/database.py:958`/`:966`/`:978`; Agent example `backend/src/routers/agent_tools.py:137`/`:162`; cross-stack contract §16 requires real BEGIN/BEGIN IMMEDIATE, not only ORM logical autobegin. |
| Exchange and cleanup safety | `backend/src/services/database_export_service.py:87`/`:108`/`:124`/`:151`; `backend/src/services/project_purge_service.py:16`; backend database guide's commit-before-unlink contract. Inspect all purge callers before changing its signature. |
| Browser API/cache/error metadata | `frontend/src/composables/useApi.js` centralizes fetch/status/cache; extend it rather than adding bare fetch or attaching a token from a separate newer read. |
| Existing test isolation | `backend/tests/conftest.py:15`/`:29`/`:49` redirect state before main import; no real data is needed. Verify the actual Python environment at execution time. |
| Same-project identity caveat | Existing restore creates/remaps instance IDs; inspect `backend/src/services/field_restore_service.py` and designer history remapping. Neither numeric IDs nor OIDs alone prove uninterrupted entity identity across delete/recreate. |
| Data-only job lifecycle | `backend/src/background_jobs.py:26`/`:32`/`:43`/`:94`/`:104` and `.trellis/spec/backend/database-guidelines.md:30` require disable-aware jobs, blocking-I/O handoff and worker-owned sessions. Cancellation must drain in-flight worker work; current code is a pattern, not proof the proposed new job is safe. |
| Existing job/isolation regressions | `backend/tests/test_background_jobs_flag.py`, `test_recycle_bin_cleanup.py` and `test_test_environment_isolation.py` were located for C6; no tests were executed. |

## Browser Tool Decision

D6 is Chrome DevTools, not Playwright. The current `new_page` tool schema was inspected (not invoked): it has `isolatedContext`, and differently named contexts isolate cookies/storage. Live server connection, browser availability and actual isolation are not verified by reading the schema; future execution must check them. No new dependency/runner/test script is planned.

An earlier generic Playwright documentation lookup used only public framework terms, before the user selected DevTools. Its examples do not authorize or require Playwright; no package/config was changed.

## Existing Test Paths Verified During Planning

- Backend: `test_form_annotation_positions.py`, `test_export_acrf.py`, `test_export_service.py`, `test_export_column_width_override.py`, `test_export_word_errors.py`, `test_word_table_parity.py`, `test_field_profile.py`, `test_field_restore.py`, `test_inline_table_guard.py`, `test_agent_access_concurrency.py`, `test_agent_access_exports.py`, `test_project_copy.py`, `test_project_import.py`, `test_test_environment_isolation.py` under `backend/tests/`.
- Frontend: `formDesignerFormPropertyEditor.test.js`, `formDesignerPropertyEditor.runtime.test.js`, `designerHistory.test.js`, `acrfViewToggle.test.js`, `basePathDeployment.test.js` under `frontend/tests/`, plus the existing `tests/component/` infrastructure.
- New baseline/revision/diff/component suites named conceptually in the plans do not exist yet. They must be written RED-first; planning must not report them run or passing.

## D8 Backup Revision — Confirmed Choices / Evidence

D8a: whole-system application data/files, including all accounts/permissions/audit/private records, managed Logo and formal archives. D8b: full-set whole-system restore only, quick project-data repair separate/admin-only. D8c: EVERY daily/manual full run generates fresh eCRF/aCRF formal originals for ALL captured active projects. D8d: scheduled records only auto-clean, manual excluded. D8e: quick age7/full-formal-group age30 days, size independently configurable/off initially, either enabled rule qualifies oldest automatic candidates, latest usable full protected; no old fixed100/count/MB defaults. D8f: server automatic layout/persisted orientation/annotations, no previous width inheritance/browser-local reads. D8g: daily02:00 SERVER OS LOCAL clock, not Asia/Shanghai. These decisions grant planning scope, not execution.

- `backend/src/dependencies.py:37` versus `:46`: admin and ownership are different. D8 new admin management can target other-owned projects only through dedicated scoped APIs, not a global owner-helper bypass. Normal editing/Word export/Agent owner approval retain current permissions.
- `backend/src/services/database_export_service.py:87`–`:110`: copies SQLite, then strips Agent private tables. Reusing it unchanged would lose recovery data. Factor/implement faithful system capture separately while preserving exchange semantics.
- `backend/src/background_jobs.py:26`/`:94`/`:104`: jobs/disable/start-stop exist; no daily full-set/maintenance/whole-recovery implementation is claimed.
- `backend/src/routers/export.py:44`/`:67`: width overrides optional; C7 unattended pairs use captured design/automatic layout. Actual all-project runtime/size/compression has not been measured.
- `backend/src/schemas/admin.py:24`/`:30`/`:36` and `recycle_bin_cleanup_service.py:126`–`:152`: independent age/size structure and age-first/remaining-size planning are reusable patterns. Backup cleanup must NOT call recycled-project purge or modify that policy.

New C7/C8 storage/barrier/catalog/clock/protected-copy/auth-generation proposals are not verified existing features or accepted migrations. Whole-system restoration intentionally rewinds database account/business/audit state and files; current control/audit/protection/backup catalog must remain outside that rewind. No full-package project extraction, secret/env/source/temp/self-backup inclusion or remote publication. Backups remain sensitive even without raw passwords in API output.

### D8 Security / Integrity Review — Planning Only

- Assets: all users' persistent data/credential hashes/audit, originals, backup catalog and live recovery generation. Threats: non-admin download/restore, recursive or symlinked capture, DB/files drift, incomplete new pairs reported complete, deletion of last/manual/active backups, WAL/open-Session mixture, crash midway through DB/files switch and old-token resurrection after rewind.
- Proposed controls: current-admin checks on every operation/replay/download; closed IDs/private roots/no-store/redacted logs; source inventory and drained capture barrier; frozen all-project rendering and sealed verified groups; origin/reference-aware cleanup; recovery journal/catalog outside restore; staged compatible DB/files with protected old generation and startup-before-bootstrap recovery; fresh login/Agent reissue and non-rewound auth generation reviewed before start.
- C6 project repair preserves current private operation/audit identity under the previously reviewed FK controls. C8 whole recovery instead preserves post-backup history in a protected pre-state and records the recovery action externally; do not promise a selective merge of every current audit into the old DB.
- RED evidence: admin/ordinary/Agent/role-loss access matrix, faithful full DB vs stripped export, all-pair generation failure, DST/restart/manual-race identities, group age/byte/manual/latest-good/active exclusions, data/file quiescence, every switch/crash/auth-generation boundary and viable admin login. No runtime tests, production inspection or exploitation performed.

## Previous Project-Repair Source Review — Still Applicable to C6, Static Only

A bounded read-only source slice was delegated; the parent inspected the decisive FK/approval/apply/schema ranges before accepting the constraints. This was source research, not independent review of the planning diff or runtime reproduction. No database/test/service/browser was used.

| Verified source fact | Consequence for the proposed design |
| --- | --- |
| `backend/src/models/agent_access.py:30`/`:55`/`:94` declares Project cascades; `:66`–`:67` declares nullable `AgentOperation.definition_id` with `ON DELETE CASCADE`; `:95`–`:96` cascades operation deletion into audit. | Never delete/recreate Project. Deleting definitions can destroy completed operations/audit even though Agent tables are excluded from snapshots. Plain graph delete/rebuild is not a preservation strategy. |
| `backend/src/services/agent_shared_change_service.py:229` creates a preview with `status=done`, pending approval and no `after_fingerprint`; `backend/src/routers/agent_access.py:278` derives applied state from the latter marker. | Unapplied is not `status != done`. Test pending and approved-but-unapplied proposals explicitly. |
| `backend/src/services/agent_access_service.py:222`–`:260` rejects only pending, unexpired, digest/current-fingerprint-matching proposals, setting approval fields and appending audit without rewriting result/command. `agent_shared_change_service.py:292`–`:320` replays already applied proposals before stale/expiry checks and rejects rejected approvals. | Existing `decide_change(False)` is not a restore invalidation primitive. Propose one narrow internal restore transition for pending/approved unapplied proposals, preserving applied results/replay and append-only audit. |
| `backend/src/services/agent_state_service.py:36`–`:46`/`:70`–`:104` uses design-row IDs, project list order and Logo path; `agent_access_service.py:238`–`:243`/`agent_shared_change_service.py:308`–`:316` compare content fingerprints. | Keep Agent bytes unchanged; do not reuse this as the file-excluding snapshot hash. A→B→A may re-enable an unexecuted proposal: static inference, not reproduced incident. Browser revision alone does not invalidate those Agent checks. |
| `backend/src/services/project_import_service.py:270`; `project_clone_service.py:156`/`:241`/`:251`/`:312`/`:327`; `import_service.py:667`/`:781`/`:833`/`:932`; `field_restore_service.py:71`/`:167`. | Import/clone create/merge/remap/normalize and may copy Logo; field undo restores only instances/necessary labels. Reuse reviewed primitives, not any of these entry points as whole-project restore. |
| `backend/src/models/form.py:33`, `backend/src/schemas/form.py:9`/`:35`/`:53`, cross-stack §6 at `cross-stack-contracts.md:574`/`:583`. | Persisted orientation/annotation is server design. Annotation keys are `variable_name` plus `_form`, not numeric row IDs. Do not rename OIDs or remap those keys as IDs. JSON validation/canonicalization is not raw-string preservation or guaranteed key-to-current-field correspondence. |
| `backend/src/models/field.py:25`; `backend/src/models/form.py:37`; `backend/src/services/project_size_service.py:127` retain legacy `field` rows, whereas `ProjectGraphLoader` in `project_clone_service.py:31`/`:51` and Agent fingerprint omit them. | Existing loader alone does not prove complete compatibility capture. Classify/preserve legacy rows explicitly, or fail closed for unsupported nonempty data before any destructive restore. |
| `backend/src/schemas/project.py:35`/`:72`/`:76`; `backend/src/models/project.py:27`; `backend/src/repositories/project_repository.py:21`/`:41`. | Use metadata allowlist, not whole Project copying. Preserve current project-list `order_index` as navigation state, separate from restored form/visit design order. |

### Structured Security / Integrity Pass for the Future Restore

- Assets: current authorization/credentials, completed request identities/results, existing audit, current files and complete historical design. Threats: FK cascades, stale approval revival, wrong-project remapping and silent compatibility loss.
- Proposed controls (not implemented): preserve/reconcile surviving design rows; before removing a definition, explicitly detach only nullable operation back-pointers that would cascade, within the same authorized transaction. Never disable FKs, delete/reinsert operation/audit rows, retarget old operations to new definitions, or rewrite stored commands/digests/results. Review historical owner projections with detached pointers before start; fail closed if preservation is not proven.
- Proposed proposal control: a narrow restore-only terminal transition for `approval_state in {pending, approved}` with no `after_fingerprint`, including preview rows already marked `status=done`. Append an accurate restore-invalidation audit; preserve applied proposal states/fingerprints and all original replay envelopes. Do not invoke stale/expiry-gated owner rejection in a loop or change Agent wire schemas/fingerprint bytes.
- Required RED evidence: delete-target definition with completed and unapplied operations; exact surviving operation/audit IDs/results; pending/approved A→B→A; applied proposal/ordinary-operation replay; pointer/proposal/graph/retention/commit fault rollback; annotation keys/legacy rows and foreign-project collision checks; real two-connection restore/Agent races.
- Risk classification: these are constraints on an unimplemented restore path and static reachability hypotheses, not evidence of an existing exploited incident. Final user review of the narrow internal transition/back-pointer policy remains an execution gate.

## Pre-D8 Planning Validation — Historical Milestone, Not Current Completion

After adding D7/C6, all seven official `python3 -B .trellis/scripts/task.py validate <task>` invocations passed: 14 manifests, 40 real entries. Validation warns that `database-guidelines.md` (35,841 bytes) and `cross-stack-contracts.md` (132,424 bytes) exceed the 32,768-byte automatic injection budget. Future workers must locate/read owning sections from the originals; passing validation does not prove those full files will be injected. No hook/limit/spec restructuring is authorized to suppress warnings.

`task.py list --mine` shows one parent/six children all planning, plus the unrelated existing standards task. Plain `git status --short --untracked-files=all` shows 43 new task files, no tracked product changes. `git diff --check` passes for tracked differences only. New files received manual content/convergence review, not an aggregate whitespace/size-check claim. The previously refused aggregate checker and its adjusted variant were not retried.

## D8 Final Planning Validation

All nine official `python3 -B .trellis/scripts/task.py validate <task>` commands passed: 18 manifests/56 real entries. Current task list has one parent/eight children, all planning, plus the unrelated existing standards task. Plain `git status --short --untracked-files=all` contains55 task-only additions and no tracked product modifications; `git diff --check` passes for tracked differences, not new-file whitespace. Every final PRD was read top to bottom for lossless convergence; plan review is self-review, not independent review.

Warnings remain: database guidelines35,841 bytes and cross-stack contracts132,424 bytes exceed auto-injection32,768, so implementation/check must locate/read owning original sections. Do not alter hooks/limits or duplicate full specs. The previously refused aggregate checker was not retried/wrapped/delegated; aggregate new-file whitespace/size statistics are not claimed. A short arithmetic-only command confirms7-day five-minute continuous changes gives2016 records and assumed0.1/0.5/1MB gives201.6/1008/2016MB per project; not actual data/compression/space measurement.

No application tests/build/lint/browser/Word render, real backup/cleanup/restore/migration/service/secret/data access, installation, commit/merge/push or deletion occurred. Product choices are resolved; proposed storage/barrier/auth-generation/catch-up/bounds remain final-review and separate implementation gates.

## Review Boundaries

Snapshot/private-file storage, revision triggers and HTTP header/status shapes are proposals for final review, not current features or accepted migrations. Exact finite capture/file budgets require evidence and review before that child starts. Existing MCP schema/fingerprint/bounds and private-table policy are authoritative contracts, not shortcuts for new history.

Prior subagent regulatory/standards claims, historical audit counts and unrerun performance observations are not evidence for implementation requirements here. No independent review or application validation is claimed by this planning record.
