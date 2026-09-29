# Implementation Plan

Worktree: `/home/decade/CRF-Editor/.claude/worktrees/designer-label-oid`, branch `fix/designer-label-oid` (base `main` at `295844d`). Run every command from the worktree root; never edit the main checkout.

## 0. Preconditions

1. The user has reviewed `prd.md` / `design.md` / this file, then activate the task:
   `python3 ./.trellis/scripts/task.py start .trellis/tasks/09-29-designer-label-oid`
2. Frontend dependencies (the worktree has no `node_modules`): `cd frontend && npm ci`.
3. Backend environment (the system `python3` 3.12 lacks FastAPI; `backend/.venv` is NOT gitignored, so keep the venv outside the repo):

   ```bash
   uv venv ~/.venvs/crf-editor --python 3.10   # CI version; if unavailable use 3.12 and report it
   uv pip install --python ~/.venvs/crf-editor/bin/python -r backend/requirements-dev.txt
   ```

   If a backend test needs a root `config.yaml`, copy the CI template from `.github/workflows/ci.yml` ("Set up test config") into the worktree root. It is gitignored; never commit it.
4. Baseline before editing: `cd frontend && node --test tests/*.test.js` and `cd backend && ~/.venvs/crf-editor/bin/python -m pytest -q`. Record the pass counts (expected around 683 frontend / 916 passed + 4 xfailed backend) so later regressions are attributable.

## 1. Parallel slices (mutually exclusive file scopes)

Slices A and B share no files and may run as two parallel `trellis-implement` sub-agents. Neither may commit. Slice C starts after both pass review.

### Slice A — Frontend (TDD)

Files: `frontend/src/composables/formDesignerPropertyEditor.js`, `frontend/src/components/FormDesignerTab.vue`, new `frontend/tests/designerLabelOid.test.js`.

1. RED: create `frontend/tests/designerLabelOid.test.js` with the helper, command-integration, and source-wiring cases from design.md "Test design". Run `cd frontend && node --test tests/designerLabelOid.test.js` and confirm it fails because the helpers and wiring are missing.
2. GREEN (helpers): add `SYSTEM_FIELD_VARIABLE_NAME_RE`, `isSystemFieldVariableName`, `ensureLabelVariableName`, `buildLabelOidSession`, and `applyLabelOidTransition` to `formDesignerPropertyEditor.js`, importing `isValidRequiredOid` from `./oidValidation.js`. `buildLabelOidSession` seeds only from the loaded definition (a label, or a system-placeholder OID), never from the live editor OID. Re-run until the helper and command cases pass.
3. GREEN (wiring) in `FormDesignerTab.vue`, per design.md "Component wiring":
   - import the three helpers;
   - `let labelOidSession = buildLabelOidSession();` beside `isHydratingFieldProp`;
   - controlled type select (`:model-value` + `@update:model-value="onDesignerFieldTypeChange"`) and the `onDesignerFieldTypeChange` function;
   - one-line session reset at the top of `selectField` and in `resetFieldPropAutoSaveState`;
   - `ensureLabelVariableName` on `editProp` in `saveSelectedFieldProp` before `buildFieldPropSnapshot()`;
   - the non-label OID guard plus `draftVariableName` in `saveDraftField`.
   Do not touch the OID `el-form-item` `v-if`, the existing field-type watcher, or the existing `saveSelectedFieldProp` non-label guard text.
4. Targeted run:

   ```bash
   cd frontend && node --test tests/designerLabelOid.test.js tests/formDesignerPropertyEditor.runtime.test.js \
     tests/fieldProfileCommands.test.js tests/designerNewFieldDraft.test.js tests/designerFieldCopy.test.js \
     tests/editModeHiddenIdentifiers.test.js tests/oidValidationWiring.test.js tests/checkboxFieldType.test.js \
     tests/dbTypeFieldTypeWiring.test.js
   ```

   If an existing assertion breaks, fix the implementation first. Change a test only when it pins behavior this task intentionally changes, and explain why.
5. Review gate A: inspect `git diff -- frontend/`. Confirm the transition runs only from the select handler, the helpers stay pure (no Vue import, no input mutation), no user-typed or candidate OID can reach a label payload, and a placeholder-OID field converts in place without a fork.

### Slice B — Backend startup normalization (TDD)

Files: `backend/src/database.py`, new `backend/tests/test_label_variable_name_migration.py`.

1. RED: write the test file per design.md (minimal SQLite `field_definition` table with `UNIQUE(project_id, variable_name)`). Cover: typed label OIDs re-minted; placeholder / derived labels kept; non-label rows untouched; idempotent second run; collision retry via `monkeypatch.setattr("src.database.generate_code", …)`; missing table no-op; released OID reusable. Run `cd backend && ~/.venvs/crf-editor/bin/python -m pytest tests/test_label_variable_name_migration.py -q` and confirm the import of `_normalize_label_variable_names` fails.
2. GREEN: in `database.py`, add module-level `import re` and `from src.utils import generate_code` (module-level so the test can monkeypatch `src.database.generate_code`; `src/utils.py` imports only stdlib, so there is no cycle). Add `_LABEL_PLACEHOLDER_RE = re.compile(r"^FIELD_\d{14}_[A-Z0-9]{6}")` and `_normalize_label_variable_names(engine) -> None` following the `_normalize_log_row_presentation` style (inspect guard, single `engine.begin()`, `text()` SQL, `logger.info` only when rows changed). Call it in `init_db()` right after `_normalize_log_row_presentation(engine)`. Keep the function under 50 lines; extract a tiny helper for the unique-code draw if needed.
3. Targeted run: `cd backend && ~/.venvs/crf-editor/bin/python -m pytest tests/test_label_variable_name_migration.py tests/test_log_row_presentation_migration.py tests/test_field_profile.py -q`.
4. Review gate B: inspect `git diff -- backend/`. Confirm only label rows are rewritten, uniqueness is enforced per project, the step is idempotent, and no schema, API, or validator changed.

### Slice C — Documentation and specs (after A and B)

- `.trellis/spec/frontend/component-guidelines.md`: add "Scenario: FormDesignerTab Label OID Is System-Managed" (scope, contracts table, validation list), matching the existing scenario format.
- `.trellis/spec/guides/cross-stack-contracts.md` §10: note that `field_definition.variable_name` for `标签` is system-managed (`FIELD_…` placeholder), the frontend never sends user OIDs for labels, and backend startup re-mints non-placeholder label OIDs. Record the shared prefix rule `^FIELD_\d{14}_[A-Z0-9]{6}` (frontend `SYSTEM_FIELD_VARIABLE_NAME_RE` ↔ backend `_LABEL_PLACEHOLDER_RE`) as a two-sided contract with its tests.
- `.trellis/spec/backend/database-guidelines.md` (OID section near line 233): document `_normalize_label_variable_names` and its prefix rule.
- `frontend/.claude/CLAUDE.md`, `backend/.claude/CLAUDE.md`, root `.claude/CLAUDE.md`: change-log entries dated 2026-09-29 (task `designer-label-oid`) with the final test counts; update test-file counts after recounting with `ls`.
- `.claude/index.json`: update only if it tracks the touched test inventories or change entries.
- `README.md` / `README.en.md`: grep for OID / `标签` wording; change only if a sentence now contradicts the new behavior.

## 2. Verification (all must pass before reporting completion)

```bash
cd frontend && node --test tests/*.test.js
cd frontend && npm run lint -- --quiet
cd frontend && npm run build
cd backend && ~/.venvs/crf-editor/bin/python -m pytest -q
```

Do not run `npm run format`; it rewrites unrelated files.

Browser check (when feasible): point a root `config.yaml` at a throwaway database in the worktree (never the user's real database), start the backend and `npm run dev`, and reproduce both reported flows plus the draft variants in full editing mode (OID visible). Confirm no 422 or 409, that `AGE` is reusable after the label save, and that switching `文本 → 标签 → 文本` restores the typed OID. Use a local test account; ask the user if none exists. If login or environment blocks the check, report the blocker and the validation that did run.

## 3. Final review and finish

1. Run `trellis-check` (or code-reviewer) on the full diff, then re-run section 2 after any fix.
2. Check the diff scope: only the four source/test files above, the specs and docs from Slice C, and `.trellis/tasks/09-29-designer-label-oid/`. No `config.yaml`, venv, `node_modules`, or `dist` files.
3. Stop and report results. Commit, push, and PR only when the user explicitly asks:
   - stage specific files (never `git add .`), commit `fix(designer): keep label OIDs system-managed` with the task directory included, as in the previous task;
   - `git push -u origin fix/designer-label-oid`, then open the PR to `main` (summary, test plan, TODO);
   - do not run `gh pr merge`; CI auto-merges owner PRs after checks pass.

## Rollback points

- Slice A and Slice B are independent; either can be reverted alone with `git checkout -- <files>` before commit.
- If the controlled select misbehaves (a `@update:model-value` emission during hydration is not expected, but if observed), fall back to `v-model` + `@change` with an explicit `lastEditorFieldType` tracker that is updated in `selectField`, `resetFieldPropAutoSaveState`, `selectAutocompleteCandidate`, and the change handler. Record the deviation in the task notes.
- After merge, rollback is a revert commit. Label OIDs already re-minted stay placeholders, which is harmless.
