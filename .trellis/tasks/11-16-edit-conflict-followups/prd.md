# C4 Follow-ups — Own-Write Continuity and Verification Debt

## Status / Authorization

Planning-only backlog, created at the user's request on 2026-11-16 while closing C4. Do not activate or implement this task as part of C4 closeout. No API/schema/test-runner/dependency change is approved by creating this record. Before execution, reproduce the remaining symptoms, prepare `design.md` / `implement.md`, obtain confirmation for high-impact choices, and start this task in its own worktree.

Source task: `.trellis/tasks/archive/2026-11/11-15-edit-conflict-guard/`. Parent initiative reference only: `.trellis/tasks/11-15-crf-versioned-delivery/`; this backlog does not change the approved C1–C8 allocation or start another child.

## Goal

Remove avoidable reviews caused by a page's own writes without blessing unseen external state, and close the explicitly reported C4 verification gaps. C4 was closed at the user's request with these items outstanding; its coverage acceptance criterion was NOT fully met.

## Issue Register / Evidence

| ID | Evidence classification | Current symptom / boundary | Owning files and reproduction |
| --- | --- | --- | --- |
| F1 | Confirmed in C4 disposable-browser acceptance | Quick-add dictionary/unit or whole-form copy is invalidation-only and carries no pre-write revision. The page's next protected save reviews once; confirming saves normally. | `frontend/src/components/FieldsTab.vue`, `FormDesignerTab.vue`, `CodelistQuickEditDialog.vue`, `frontend/src/composables/designRevision.js`; backend codelist/unit/form writers. Load an editor, perform the local management action, then save the untouched-context form/field editor. Preserve an intervening external-write counterexample. |
| F2 | Conservative limitation from code review; reproduce separately before calling it a confirmed UI defect | Notes saved after conflict review cannot extend an older host snapshot across the external-state gap. A subsequent form-level save may ask for another review even without another external write. Never fix this by assigning the reviewed tag to an old buffer. | `frontend/src/components/DesignNotesDialog.vue`, `FormDesignerTab.vue`, `frontend/src/composables/designRevision.js`; two pages: external edit, notes overwrite through review, then local property save. |
| F3 | Measured, unmet acceptance criterion | Whole frontend coverage improved but statements/branches remain below 80%. Latest serial result: statements 79.74%, branches 70.89%, functions 84.44%, lines 84.41%; baseline 76.87/67.90/82.02/81.41. | `frontend/vitest.config.js` defines the existing collection scope. Use `./node_modules/.bin/vitest run --maxWorkers=1 --coverage` with the same reporters/scope as C4. Do not hide uncovered files or reduce coverage scope. Backend coverage is already 89.24%. |
| F4 | Reproduced in coverage and normal default-parallel runs; root cause unresolved | C4 default-parallel coverage had seven 5000 ms timeouts twice. On the merged 0.7.0 tree, normal `npm test` had three timeouts alongside backend pytest, then nine timeouts after backend ended, so backend contention alone is not the cause. Node tests passed 1109/1109 both times; the unchanged complete component suite passed 596/596 with `npm run test:component -- --maxWorkers=1` (188.52 s), and lint/build then passed. No timeout/runner setting was edited. | Three suites: `CoreEditorConflict.spec.js` (before-image, stale/committed undo and deleted/rebound targets), `SingleInlineTableGuard.spec.js` (type/save/copy guards and batch-restore failure), `TemplateImportSelection.spec.js` (refresh preserves draft; discard draft and switch after import). Investigate scheduling, clock and instrumentation/concurrency; retain default-parallel failures separately from serial success. |
| F5 | Measured, nonblocking lint debt | `npm run lint`: 0 errors, 2919 warnings. Task-touched source files have net +112 warnings against pre-C4 HEAD, all formatting. | Limit cleanup to C4-added/modified lines in `FieldsTab.vue`, `FormDesignerTab.vue`, `formDesignerPropertyEditor.js`, `useSortableTable.js`; do not whole-file-format the designer or refactor unrelated code. |
| F6 | Tool unavailable in C4; not a passed check | `bandit` was not installed, so that static security scan did not run. Targeted security tests, structured review and gitleaks did run. | Before future security-sensitive implementation, check approved tooling; installing a dependency requires confirmation. No production or private-data scan is authorized. |

C4 retained automated evidence: `frontend/tests/designRevision.test.js`, `tests/component/CoreEditorConflict.spec.js`, `tests/component/designServerFixture.js`, `backend/tests/test_design_revision*.py`. Browser screenshots were local disposable evidence; cleanup was authorized at closeout, so do not depend on their temporary paths for reproduction or read disposed credential files.

## Requirements / Decision Gates

- F1-R1: Propose a concrete proof of the write's actual pre-state for invalidation-only actions (for example, an additive pre-write revision response header or optional `If-Match`). This is a proposal, not an approved API contract. Confirm scope, legacy-client behavior, coherent transaction timing, and response metadata before implementation.
- F1-R2: A page's own proven transition may advance only matching exact snapshots and compatible frozen baselines; external/Agent/interleaved writes must still require explicit review. Do not fetch a current tag before writing, infer revision arithmetic, auto-retry writes, or widen the nineteen strict writer registry without confirmation.
- F2-R1: Reproduce notes → reviewed accept → next save and retain a failing test before any fix. Preserve local unsaved buffers and current reference/identity checks. Unknown state continues to fail closed.
- F3-R1: Raise same-scope frontend coverage to at least 80% without lowering any existing metric; report statements/branches/functions/lines individually. Add behavior tests rather than weakening collection, excluding code, or claiming improved-but-sub-80% coverage meets acceptance.
- F4-R1: Isolate the seven timeout cases and document instrumentation/concurrency evidence. Runner settings, timeout increases, new scripts, and dependency additions require separate approval; do not mask failures with retries or disable warning gates.
- F5-R1: Remove task-introduced warnings only where safely separable from established formatting. Preserve source-contract, mount, history and conflict behavior.
- Preserve cross-stack contract §17, C6 restoration handoff, current Agent DTO/fingerprint/approval/replay behavior, project isolation and export stripping.

## Acceptance Criteria

- [ ] F1/F2 reproductions and counterexamples distinguish own writes from external writes, including an intervening third write; tests are RED before implementation.
- [ ] Approved own-write continuity eliminates avoidable review without fresh-token/stale-buffer pairing, automatic mutation retries, stale history replay or loss of local input.
- [ ] Same-scope frontend coverage is at least 80% and no metric decreases; backend coverage stays at least 80% and does not regress.
- [ ] Normal node:test and vitest suites pass; coverage-mode timeout cases have an evidenced resolution or remain explicitly blocked (never silently waived).
- [ ] Lint has no errors and no C4-attributable warning increase under a documented comparison; build and affected security/Agent regressions pass.
- [ ] Real isolated-browser desktop/narrow-screen evidence establishes own sequential saves and external-review preservation. Any new temporary credentials and destructive cleanup receive their required confirmation.
- [ ] README (zh/en), module docs, index and executable cross-stack spec reflect the approved result and remaining limitations.

## Constraints / Non-goals

No real database, secrets, uploads, production service or port 8888 access. No deployment, new CI/runner, dependency expansion or destructive restore. No real-time collaboration, hard project locks, generic replay DSL, persistent entity identity, or broader management-API gating. The accepted same-project ID/OID/binding recreation limitation and pre-existing network-failure drag discard are not newly approved features. Raw-JSON review presentation is a UX observation only, not authorization to redesign the dialog.
