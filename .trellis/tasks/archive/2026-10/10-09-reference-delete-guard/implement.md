# Implement — reference-delete-guard

Worktree: `/home/decade/CRF-Editor-reference-delete-guard` (branch `feat/reference-delete-guard` from `main` `f68ebe1`). Every command embeds an explicit `cd <worktree>/…` — the Bash cwd resets to the main checkout between calls. Implementers never commit.

## Environment

```bash
# backend runner (works inside and outside EnterWorktree sessions)
mkdir -p /tmp/rdg && cat > /tmp/rdg/pytest.sh <<'EOF'
cd /home/decade/CRF-Editor-reference-delete-guard/backend
unset http_proxy https_proxy all_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY
export CRF_DISABLE_BACKGROUND_JOBS=1
exec ~/.venvs/crf-editor/bin/python -m pytest "$@"
EOF
bash /tmp/rdg/pytest.sh -q                       # full backend suite
bash /tmp/rdg/pytest.sh tests/test_reference_delete_contract.py -q

# frontend (fresh worktree has no node_modules)
cd /home/decade/CRF-Editor-reference-delete-guard/frontend && npm ci
cd /home/decade/CRF-Editor-reference-delete-guard/frontend && npm test          # node --test + vitest
cd /home/decade/CRF-Editor-reference-delete-guard/frontend && npm run lint
cd /home/decade/CRF-Editor-reference-delete-guard/frontend && npm run build
```

## Slices (parallel, disjoint file scopes, one writer each)

### Slice B — backend (Sonnet)

Files: `backend/src/services/field_definition_reference_service.py` (new), `backend/src/routers/codelists.py`, `backend/src/routers/units.py`, `backend/tests/test_reference_delete_contract.py` (new). Nothing else.

1. Baseline: full backend suite; record passed / xfailed counts.
2. RED: write `test_reference_delete_contract.py`:
   - codelist + unit: unplaced definition → default `references` / `batch-references` omit it; `?include_unplaced=true` returns one row `{form_name: None, form_code: None, field_label, field_var}`; single `DELETE` → 409; `batch-delete` → 409.
   - codelist + unit: definition placed in 2 forms → 2 rows in both modes, no null row with the flag; a mix (placed + unplaced definitions on the same target) → flag returns placed rows + one null row.
   - default-mode regression: rows (sorted) for a placed reference equal today's shape exactly (keys and values).
   - partition contract for all four entities (codelist / unit with the flag; field / form default endpoints): create referenced + unreferenced items in one project → `set(batch_references.keys()) == {str(id) of referenced}`; `batch-delete` of the unreferenced ids → 200 with `deleted == len`; `batch-delete` including a referenced id → 409 and nothing deleted.
   - cross-project: the flag does not leak another project's codelist / unit references (batch endpoint returns `{}` for foreign ids).
   Run it; confirm the new-behavior cases fail for the right reason.
3. GREEN: implement the service per design §2.3; route the 4 reference endpoints through it with `include_unplaced: bool = False`; keep delete guards / `valid_ids` untouched. Security follow-up: the codelist single reference route also gets the owner check before membership lookup.
4. Targeted + full suite; existing `test_permission_guards.py` must pass unchanged.
5. Report: files changed, RED evidence (failing test names + reason), GREEN counts, full-suite counts vs baseline, statement coverage of the new service (`bash /tmp/rdg/pytest.sh --cov=src --cov-report=term-missing:skip-covered tests/test_reference_delete_contract.py tests/test_permission_guards.py -q` — report the service line).
6. Authorized security follow-up (user chose to fix on this branch; not production deployment): write tests first for all five option subresource routes in design §2.4; assert foreign user 403 + no mutation, owner success/status parity, own missing codelist 404 and mismatched codelist 403. Verify tests fail before change.
7. Add `verify_project_owner(project_id, current_user, session)` at the start of each of the five handlers, before dictionary/option lookup. Keep request data, response payload, and valid-owner behavior unchanged.
8. Run targeted and full suites; send parent RED/GREEN evidence and stop. Do not commit or merge.

### Slice F — frontend (Sonnet)

Files: `frontend/src/composables/referenceDeleteGuard.js` (new), `frontend/src/components/CodelistsTab.vue`, `UnitsTab.vue`, `FieldsTab.vue`, `FormDesignerTab.vue` (only the 8 handlers named in design §1 plus one import line each), `frontend/src/styles/main.css` (append at end), `frontend/tests/referenceDeleteGuard.test.js` (new), `frontend/tests/referenceDeleteWiring.test.js` (new), `frontend/tests/projectDeleteConfirmation.test.js`, `frontend/tests/fieldsTabMultirefThreshold.test.js`. Nothing else — in particular do not touch `updateCl`, `updateOpt`, `saveUnit`, `quickSaveCodelist` (either component), `save`, or any `references` call outside the 8 handlers.

1. `npm ci`; baseline `npm test` (record node:test and vitest counts), `npm run lint` (record error count).
2. RED: `referenceDeleteGuard.test.js` (node:test, fake message box recording calls): `formatFieldReference` (OID / no OID / unplaced), `partitionByReferences` (order, string keys, missing / empty / non-array refs, no input mutation), `confirmReferenceAwareBatchDelete` (empty → no dialog; all blocked → one alert with title / button / customClass, no confirm, returns `[]`, alert rejection swallowed; none blocked → confirm with today's exact text, returns all; mixed → one confirm with both sections, `删除 N 个X` button, customClass, returns deletable only; confirm rejection propagates `'cancel'`; > `REFERENCE_LIST_MAX` truncation in both sections), `showReferenceBlockedAlert`, `buildPartialDeleteMessage`. `referenceDeleteWiring.test.js` (source-level): per component, single handler fetches refs (codelist / unit with `include_unplaced=true`), calls `showReferenceBlockedAlert(ElMessageBox` before `ElMessageBox.confirm(` and before `api.del`; batch handler calls `confirmReferenceAwareBatchDelete(ElMessageBox` before `batch-delete` and posts `ids: deleteIds` (not the full selection); codelist / unit batch refs URL carries `include_unplaced=true`; `updateCl` / `updateOpt` / `saveUnit` bodies do NOT contain `include_unplaced`; FieldsTab `del` no longer contains `将同时删除`; FormDesignerTab `delForm` no longer contains `将同时从`; `main.css` contains the `.reference-delete-box` rule with `white-space: pre-line`. Update `projectDeleteConfirmation.test.js` (batch handlers' confirmation call = `confirmReferenceAwareBatchDelete`, still before the batch-delete call; single handlers still confirm before `api.del`) and `fieldsTabMultirefThreshold.test.js` (`del` / `batchDelFields` → new gate contract; the `save` test stays byte-identical). Run; confirm failures are for the right reason.
3. GREEN: implement per design §3.
4. `npm test`, `npm run lint` (0 errors), `npm run build`.
5. Report: files changed, RED evidence, GREEN counts vs baseline, lint / build results, `node --test --experimental-test-coverage tests/referenceDeleteGuard.test.js` line / branch numbers for the composable.

## Lead gates (in order)

1. Inventory: `git -C <wt> status --short` must list only the slice files above (reconcile every path; revert anything unattributable — see the shared-worktree injection lesson).
2. Diff review of both slices against design §2 / §3 (texts, flag scoping, untouched call sites).
3. `trellis-check` (Sonnet) full-scope check; Haiku read-only review of the frontend diff.
4. Lead re-runs: full backend suite, `npm test`, lint, build.
5. Browser check (throwaway db, headless shell per the browser recipe): for each of 字典 / 单位 / 字段 / 表单 — single delete blocked + unblocked, batch mixed (two sections, only unreferenced deleted, partial toast), batch all-blocked (`知道了`, no request), batch none-blocked (old text); codelist / unit referenced only by an unplaced library field; line breaks render; edit-impact prompt for a codelist unchanged.
6. Docs + spec update (Phase 3.3): `.trellis/spec/frontend/component-guidelines.md` delete scenario, `.trellis/spec/guides/cross-stack-contracts.md` new §14, root / backend / frontend `CLAUDE.md` change logs and counts, README zh / en one sentence, `.claude/index.json`.
7. Commit only after the user authorizes: code commit(s) on the branch, Trellis files in a separate commit; merge into `main` locally; remove worktree and branch.

## Review follow-ups (authorized within this task)

- Extend frontend test scope to `frontend/tests/toolbarPaneAlignment.test.js`: its existing unit-card clear-selection assertion must use actual `deleteIds`, not the original selected `ids`, so referenced surviving units retain their property card.
- Browser RED: a 1500px viewport produced a 1468px message box because Element Plus `width: 100%` survived overriding its `max-width` cap. Add explicit `width: var(--el-messagebox-width)` while retaining the narrow-screen max-width, and lock it with a source regression plus browser measurement (520px desktop / 368px at 400px viewport).
- Runtime RED: returning the blocked-alert Promise without awaiting it bypassed all four single-handler catches on unexpected errors. Use `return await showReferenceBlockedAlert` and actual-handler runtime tests for error toast and silent cancel/close.
- Security RED: both default and `include_unplaced=true` single-codelist reference queries answered a different user with victim data (200). Add `verify_project_owner` before dictionary/project membership lookup in this route only; add regression tests for both foreign-user403 modes, owner200, missing own dictionary404 and mismatched dictionary403. No deployment or unrelated endpoint fixes authorized.
- Format the two new backend files with ruff at line length120; preserve existing router formatting until the separate backend-format integration is approved.
- Documentation slice assigned to Sonnet (read-only code access; exclusive docs/spec writes); include executable contracts and the authorization correction, without claiming production deployment.

## Rollback points

- Before merge: discard the branch / worktree.
- After merge: `git revert -m 1 <merge>`; no migration to undo.

## Follow-up round (Opus review 2026-10-10; user authorized the R7 security fix and commit + local merge)

Worktree `/home/decade/CRF-Editor-rdg-followup`, branch `fix/reference-delete-followup` (base main `0f2ad99`). Backend runner: `bash /tmp/rdgf-pytest.sh <args>` (`RDGF_BACKEND_DIR` overrides the backend dir). Mutation proofs run only in scratch copies (`tar --exclude=.git --exclude=node_modules`), never in the worktree; `/tmp/rdg/` is protected.

Slices (exclusive file scopes, parallel, Sonnet, no commits):
- FE tests: `frontend/tests/referenceDeleteGuard.test.js`, `frontend/tests/referenceDeleteWiring.test.js`, `frontend/tests/fieldsTabCodelistQuickEdit.test.js`. No production frontend changes.
- BE: `backend/src/routers/{codelists,units,fields,forms}.py`, `backend/src/services/field_definition_reference_service.py` (docstring only), `backend/tests/test_batch_delete_isolation.py` (R7, RED first), `backend/tests/test_reference_delete_contract.py`, `backend/tests/test_codelist_option_authorization.py`. No new test files.
- Docs/spec: `.claude/index.json`, `.trellis/spec/frontend/component-guidelines.md`, `.trellis/spec/guides/cross-stack-contracts.md`, `.trellis/spec/backend/auth-security.md`.
- Lead (Opus): diff review + own mutation spot checks, Haiku read-only frontend review, change-log lines (root / backend / frontend CLAUDE.md + archive), this task's verification.md, final gates, commits.

Commit plan: `fix(security)` routers + `test_batch_delete_isolation.py` (incl. the redundant local-import removal inside the same router functions) → `test(...)` remaining test files + service docstring → `docs(...)` index / CLAUDE.md / archive → `docs(spec)` `.trellis/spec/*` standalone → `--no-ff` merge into local main → remove worktree + branch. No push, no deploy.
