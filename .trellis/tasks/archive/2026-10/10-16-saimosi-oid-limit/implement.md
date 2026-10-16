# Implementation and Handoff Checklist

## Status, Owner, and Authorization

- Current status: **planning**; this session creates/reviews task artifacts only.
- Requested later executor: **Sonnet**. Do not dispatch implementation or run `task.py start` until the user reviews the artifacts and explicitly asks to execute.
- Worktree: `/home/decade/crf-editor-saimosi-oid-limit`; branch: `task/saimosi-oid-limit`; base: `main`.
- No commits, merges, worktree/branch deletion, or publication are authorized merely by creating this task.

## Planning Task Board

- [x] Read project workflow requirements, isolate the worktree, and create the planning task.
- [x] Capture the user's request in `prd.md` before further research.
- [x] Inspect database-type selection, OID generation/validation, actual save entry points, and relevant tests/specs.
- [x] Finalize the converged PRD, technical design, execution checklist, and curated agent context manifests.
- [x] Verify artifact paths, task status, and the planning-only change inventory; hand off without implementation.

## Required Reading for the Future Executor

1. Curated `implement.jsonl` entries, then `prd.md`, `design.md`, and this file.
2. Root and frontend `.claude/CLAUDE.md`, `.context/prefs/`, and relevant frontend spec sections listed in `research/oid-edit-boundaries.md`.
3. Actual code/tests around the evidence anchors. Read giant component/spec files by ranges; do not load whole files or mistake stale `addField` documentation for a current save path.
4. Confirm worktree/branch identity, current `main`, other sessions/worktrees, and the exact change inventory before writing. The task artifacts are intentionally uncommitted at handoff; preserve them.

## Implementation Task Board (executed 2026-10-16 in the main session after the user's explicit instruction)

- [x] **Gate:** the user issued the execution instruction to this session directly; `task.py start` run; R2–R3 interpretation implemented as approved in the PRD.
- [x] **RED:** `frontend/tests/oidEditLengthPolicy.test.js` — 9 behavior cases (8/9 field, 10/11 form, 其他/blank types, unchanged automatic/copy values, generated-looking edits, revert/trim, missing baseline, empty candidate, unknown kind); confirmed failing before implementation.
- [x] **RED:** `frontend/tests/component/OidEditSave.spec.js` — real mounts for the fields library and all designer surfaces, asserting the warning message plus zero write/reference requests; confirmed failing (6 rejection cases) before implementation.
- [x] **GREEN:** `editedOidLengthError` + constants added to `frontend/src/composables/oidValidation.js`; generic charset helpers untouched; DB-type constant reused from `fieldTypeAvailability.js`.
- [x] **GREEN:** `FieldsTab.vue::save` wired; baseline captured in `resetProp` (single initialization seam: openAdd generated / openEdit row / post-save rehydration).
- [x] **GREEN:** `addForm` + shared `persistFormProps` wired (`newFormBaselineCode`, `editFormBaselineCode` frozen at dialog open, inline pane reads `formPropBaseline.code`).
- [x] **GREEN:** `saveSelectedFieldProp` and `saveDraftField` wired; candidate-rebind baseline = `candidateOid` (same judgment as `buildBindingProfileCommand`), draft baseline = `__labelOidSeed`; 标签/日志行 skipped in the designer.
- [x] **IMPROVE:** edit-dialog save route (AC7), real autocomplete candidate pick then manual fork (AC8), rejected-save input retention (R6), reopen baseline reset (new-field twice), copy-draft untouched save (AC3); existing label/history/quick-edit regressions all green (214-case related set → 223 with the new policy suite).
- [x] **Docs:** README.md / README.en.md feature bullets, root & frontend `.claude/CLAUDE.md`, `.claude/index.json` synchronized. (Spec-contract note deferred to the finish-work spec-update phase; Trellis updates stay out of code commits.)
- [x] **Review:** full diff inspected against scope (self-review; no independent reviewer dispatched): no blanket cap, no prefix bypass, no pre-error writes, both `persistFormProps` callers pass `baselineCode`, missing-`baselineCode` default fails closed.
- [x] **Verify:** node:test 1006 pass; vitest 159 pass (14 new); focused related set 223 pass; lint 0 errors; build OK; backend compat `test_oid_validation.py` + `test_db_type_field_policy.py` + `test_field_profile.py` 125 pass; `task.py validate` + `git diff --check` OK. Frontend coverage: no coverage runner exists in the repo (no c8/istanbul dependency) — not measured, not added (per implement.md constraint). Browser acceptance PASSED after explicit user authorization (2026-10-16, throwaway env on 127.0.0.1:8901, 7 scenarios incl. DB-level zero-write verification; env cleaned up afterwards). One transient full-run 2-fail blip right after cold `npm ci` did not reproduce in 6 reruns.
- [x] **Acceptance:** AC1–AC10 mapped — AC1/2 (8/9, 10/11 policy+mount), AC3 (copy-draft + label-only saves), AC4 (generated-looking edits rejected), AC5 (其他 mounts + policy), AC6 (revert/trim + legacy untouched after save), AC7 (library/create/dialog/inline/field/draft all witnessed), AC8 (candidate pick → pure rebind PUT, then typed fork rejected), AC9 (labels/log rows, quick edit, history suites green), AC10 (zero-request rejections + input retention + reopen reset). Commit/merge/cleanup/push await explicit user authorization.
- [x] **Extension (2026-10-16, user instruction):** entry-level enforcement — conditional `maxlength` on all five OID entry controls via `oidMaxLength(dbType, kind)` (8/10, 赛美斯-only). TDD RED→GREEN (policy +1 case, mount +2 cases); full gates: node:test 1007, vitest 161, lint 0 errors, build OK; docs (README ×2, root/frontend CLAUDE.md) and PRD amendment updated. Real-browser typing-block verification not yet run for this extension (native maxlength cannot be simulated faithfully in happy-dom; attribute wiring is mount-tested).

## Activation Command — Only After Later Authorization

```bash
cd /home/decade/crf-editor-saimosi-oid-limit && python3 ./.trellis/scripts/task.py start .trellis/tasks/10-16-saimosi-oid-limit
```

If delegated through the installed Trellis implement capability, the dispatch prompt must begin with `Active task: .trellis/tasks/10-16-saimosi-oid-limit`, specify the Sonnet route requested by the user, retain this scope, and forbid autonomous commits. Review/check capability defaults do not authorize broader fixes.

## Candidate File Scope

### Production

1. `frontend/src/composables/oidValidation.js`.
2. `frontend/src/components/FieldsTab.vue`.
3. `frontend/src/components/FormDesignerTab.vue`.
4. `frontend/src/composables/formDesignerPropertyEditor.js` only if a small pure support change is necessary; preserve command contracts.

### Tests

- Proposed new pure-policy suite: `frontend/tests/oidEditLengthPolicy.test.js`.
- Proposed new real save-behavior suite: `frontend/tests/component/OidEditSave.spec.js` (or focused per-host `.spec.js` files if separation is genuinely clearer).
- Reuse/update existing wiring regressions only as required: `oidValidationWiring.test.js`, `formDesignerFormPropertyEditor.test.js`, `formDesignerPropertyEditor.runtime.test.js`, `fieldProfileCommands.test.js`, `designerNewFieldDraft.test.js`, `designerFieldCopy.test.js`, `designerLabelOid.test.js`, `designerHistory.test.js`, and `quickEditBehavior.test.js`.

No backend production change is proposed. A new provenance/API contract, database migration, generator change, dependency, test runner, or build-script change requires separate approval rather than silent scope expansion.

## Future Verification Commands

Run these from the task worktree after implementation; they were **not run** in the planning session. Install only existing lockfile dependencies with `npm ci` if the fresh worktree lacks them. Do not modify scripts or add packages to obtain a test runner.

```bash
# New policy RED/GREEN; add the new component suite's exact path to focused vitest runs.
cd /home/decade/crf-editor-saimosi-oid-limit/frontend && node --test tests/oidEditLengthPolicy.test.js
cd /home/decade/crf-editor-saimosi-oid-limit/frontend && npx vitest run tests/component/OidEditSave.spec.js

# Existing related node:test regressions.
cd /home/decade/crf-editor-saimosi-oid-limit/frontend && node --test tests/oidValidationWiring.test.js tests/formDesignerFormPropertyEditor.test.js tests/formDesignerPropertyEditor.runtime.test.js tests/fieldProfileCommands.test.js tests/designerNewFieldDraft.test.js tests/designerFieldCopy.test.js tests/designerLabelOid.test.js tests/designerHistory.test.js tests/quickEditBehavior.test.js

# Full frontend gates.
cd /home/decade/crf-editor-saimosi-oid-limit/frontend && npm test
cd /home/decade/crf-editor-saimosi-oid-limit/frontend && npm run lint
cd /home/decade/crf-editor-saimosi-oid-limit/frontend && npm run build

# Existing backend compatibility contracts; use the project's configured Python environment.
cd /home/decade/crf-editor-saimosi-oid-limit/backend && python3 -m pytest tests/test_oid_validation.py tests/test_db_type_field_policy.py tests/test_field_profile.py -q

# Task context / whitespace checks.
cd /home/decade/crf-editor-saimosi-oid-limit && python3 ./.trellis/scripts/task.py validate .trellis/tasks/10-16-saimosi-oid-limit
cd /home/decade/crf-editor-saimosi-oid-limit && git diff --check
```

Use the existing coverage facilities to demonstrate that changed logic reaches at least 80% and coverage does not decrease. Record the actual coverage command/baseline/results; if the current frontend setup cannot measure the needed scope without adding dependencies, report the limitation and ask before expanding tooling. Do not invent coverage numbers or imply planning-time tests were run.

Browser acceptance must use isolated test data, never live clinical/project records. Exercise at least field-library and designer OID edits, form dialog/inline saves, automatic-default exemption, and a non-赛美斯 project. If app startup, login, credentials, network, permissions, or browser availability block validation, state the blocker and the alternative scope; component tests do not prove real-browser behavior.

## Risk and Rollback Notes

- `FormDesignerTab.vue` is large: keep the diff local; do not restructure it to satisfy a size threshold.
- Mutable draft OIDs and candidate hydration are the main bypass/false-positive risks; preserving their original/candidate evidence is mandatory.
- Do not attach length validation to generic backend schemas or history replay; automatic/legacy identifiers intentionally exceed the limit.
- With no data migration or identifier rewrite, rollback is limited to this task's code/wiring. Preserve user changes and regression tests; do not reset, clean, delete, or alter other sessions' work.

## Planning-Only Verification Record

- **PASS:** `python3 ./.trellis/scripts/task.py validate .trellis/tasks/10-16-saimosi-oid-limit` — 4 real implement-context entries and 3 real check-context entries.
- **PASS:** inline `python3` artifact checker — planning-only metadata, exactly 7 task artifacts, all manifest/relative-link targets, 57 distinct source/path references including line-range bounds, size statistics, and whitespace checks against the actual new-file diffs.
- **PASS:** `git diff --check` and change-inventory review — only the task artifacts are untracked; the task-scoped decision log is ignored; the main checkout remains clean.
- **PASS:** PRD convergence/content review — final PRD read top-to-bottom; requirements and acceptance mappings retain the requested automatic-value exemption and deferred Sonnet handoff.
- **CHECKER FAILURES RESOLVED:** the temporary inline checker first parsed a `.json` path as `.js`; its next version incorrectly required a final newline on tool-generated `task.json`. The matcher and checker convention were corrected, and the complete checker then passed. Neither issue was an application/test failure or required weakening the product criteria.
- **NOT RUN (planning-only scope):** application/unit/component/backend/browser tests, builds/lint, coverage, and implementation code review. No application source was changed and no feature behavior is claimed to be implemented.
- **DEFERRED:** user artifact review, explicit execution approval, task activation, and Sonnet implementation. No commit, merge, cleanup deletion, or push was performed.
