# Verification Record — reference-delete-guard

All numbers below were produced on the task worktree `/home/decade/CRF-Editor-reference-delete-guard` (branch `feat/reference-delete-guard`, base `f68ebe1`) and re-run personally by the lead unless marked otherwise. Evidence files live under `/tmp/rdg/` (session-local).

## Backend

| Item | Result |
|---|---|
| Full suite (lead re-run, `bash /tmp/rdg/pytest.sh`) | **1086 passed / 4 xfailed** (baseline 1042 + 44 new tests; delta accounted exactly) |
| New contract tests | `test_reference_delete_contract.py`: 22 passed; `test_codelist_option_authorization.py`: 22 passed (5 operations × foreign owner / owner behavior / missing dictionary / foreign dictionary; missing-option checks for update/delete) |
| Security RED→GREEN (reference GET) | Foreign user → `200` with victim rows (both modes) before fix; `403 无权访问此项目` with no victim labels/OIDs after; owner `200`; own-project missing dictionary `404 编码字典不存在`; mismatched dictionary `403 无权操作该字典` |
| Security RED→GREEN (option mutations) | Before guards: five operations returned `201` / `200` rather than `403`; after: foreign → 403 and Bob's option state unchanged; valid owner retains POST 201 / PUT 200 / DELETE 204 / batch-delete 200 / reorder 200; missing owned codelist 404; foreign codelist 403 before option lookup |
| Coverage | TOTAL **83.90% → 84.89%** (clean archive at `f68ebe1` vs final; no file dropped); new service **100%** (18/18 stmts) |
| Authz fix scope | `get_codelist_references` gets `verify_project_owner` before membership lookup; five option mutations get the same check before resource lookup. Independent post-fix probe and endpoint regression tests confirm. |
| Other audited routes | `units.py` 8, `fields.py` 17, `visits.py` 12 project/subresource routes all have user-level owner guards; no changes required. |
| Formatting | Three new backend files pass `ruff format --check --line-length 120`; existing routers intentionally left to the pending backend-format integration |

## Frontend

| Item | Result |
|---|---|
| node:test (lead re-run, `npm test`) | **866 passed / 0 fail** (baseline 824 + 42 guard/wiring/follow-up tests) |
| vitest mount tests | 11 passed (4 files, unchanged) |
| Lint | 0 errors (3657 warnings, all pre-existing prettier style class) |
| Build | vite build success |
| Composable coverage (`referenceDeleteGuard.js`) | lines 100% / branch 89.19% / funcs 100% (uncovered branches are defensive `?? ''` fallbacks) |
| Untouched (source-locked) | `updateCl` / `updateOpt` / `saveUnit` / both quick-edit codelists / FieldsTab `save` (byte-identical test), no `include_unplaced` in edit-impact calls — correction (2026-10-10 Opus review): the FieldsTab `quickSaveCodelist` lock was ineffective (unanchored regex) until the follow-up round below |

## Browser (headless Chromium 153 against throwaway-db server on 127.0.0.1:8901, full edit mode)

25/25 scenarios passed, zero console errors/warnings; evidence: `browser-validation-final.json`, screenshots `codelist-mixed-fixed.png`, `codelist-dark-narrow.png`, `unit-mixed-before.png` (pre-fix width defect):

- Single delete blocked for all four types, including library-only referenced codelist/unit (「字段库-…」 rows) and single-form-referenced field; blocked alert shows 知道了 only, **zero delete requests** (fetch capture).
- Unreferenced single delete keeps the original confirm (cancel paths verified; confirm paths DELETE 204).
- Batch all-referenced → single alert, no confirm button, no request. Batch all-unreferenced → original 「确认删除选中的 N 个X？」 (cancel + confirm verified for all four).
- Batch mixed → one dialog, two sections; POST `batch-delete` carried exactly the unreferenced ids (captured bodies `[3,4]` / `[5,6]` / `[14,15]`, all 200); referenced rows kept; partial toast 「已删除 N 个X，M 个被引用的X未删除」; surviving selection/property-card retained.
- Edit-impact prompt unchanged (edit dictionary → plain `/references`, no flag, old copy).
- Dialog measured **520px** at 1500px viewport (pre-fix defect was 1468px) and **368px** (viewport minus margins) at 400px dark mode, `white-space: pre-line` wrapping confirmed; light/dark both readable.

## Independent verification (received)

- Backend reviewer re-verification of the authz fix: **CONFIRMED** — diff minimal (`verify_project_owner` before membership check, existence oracle closed), hermetic probe re-run: foreign default 403 / foreign flagged 403 / foreign+nonexistent 403 / owner 200 correct rows / own-missing 404 / no-token 401; 403 body carries no victim data; targeted 68 passed.
- Frontend Haiku review: **no additional findings** (XSS, snapshots, selection cleanup, formatting, dialog branches, test coverage all pass; the two known issues fixed).

## Security findings — fixed locally, production not deployed

- The original codelist single-reference GET disclosure is **fixed on this branch** and independently verified (see above).
- The five pre-existing codelist option-subresource gaps (add/update/delete/batch-delete/reorder options) are **fixed on this branch** with RED/GREEN tests and lead full-suite verification; reviewer found no findings. The five write operations return 403 before data access for a foreign project, and option state stays unchanged.
- Expanded read-only audit of `units.py` (8 routes), `fields.py` (17 routes), and `visits.py` (12 routes): all enforce a user-level owner guard; no additional gaps found.

## Not run / pending

- Production deployment: **not performed**. User explicitly chose to deploy personally after local-main merge; do not deploy or represent production as fixed.
- Post-sync browser re-run: not performed. The 25/25 browser pass predates the main sync; the sync was verified format-only for `codelists.py` / `units.py` via AST comparison, and the only post-sync code change (batch toast count) is covered by runtime tests, so browser scenarios were not repeated.
- Full backend suite post-count-fix: not re-run (fix touched frontend only). The full-suite gate (1071 passed / 4 xfailed, TOTAL 85%) ran on the merged tree whose backend code is byte-identical to the final tree; targeted backend regressions (95 passed) and `ruff format --check .` (148 files formatted) re-ran on the final tree.
- `/trellis:finish-work` (task archival) not yet run; task remains `in_progress` for the user to close out.
- Feature/docs commits and merge into local `main`: done — merge commit `0f2ad99` (2026-10-10).

## Post-sync final gates (branch tree == final merged content, 2026-10-10)

| Item | Result |
|---|---|
| Backend full suite (on merged tree, backend code identical to final) | 1071 passed / 4 xfailed; TOTAL coverage 85% |
| Backend targeted on final tree (`reference_delete_contract` + `codelist_option_authorization` + `permission_guards` + `codelists_router`) | 95 passed |
| `ruff format --check .` on final tree | 148 files already formatted |
| Frontend node:test on final tree | 864 passed / 0 fail (860 + 4 new batch-count runtime cases) |
| Frontend vitest mount tests | 11 passed |
| Lint / build | 0 errors (pre-existing style warnings); vite build success |
| Batch toast count fix (reviewer finding) | RED confirmed (toast said 2, backend deleted 1) → all four handlers now use the `{ deleted }` response; runtime tests lock the backend count with the preflight blocked count kept as `items.length - toDelete.length` |

## Integration record

- Branch commits (oldest→newest): `bd1acc7` security → `0b2dad6` feature → `02d9471` format alignment → `20d6296` docs → `2b261e9` spec → `466049f` merge(main `0bb61d6`) → `729fc74` toast-count fix → `04be193` merge(main `e9b0c0b`).
- Merge-conflict policy: `codelists.py` / `units.py` resolved to the feature version after `ast.dump` proved main's delta (f68ebe1→main) was format-only; docs took main's base and re-applied task counts (backend 65 test files / 27 services; frontend 32 composables / 77 test-support files); `.claude/index.json` rebuilt from the actual tree and validated (all paths exist, unique, counts match).

## Follow-up round (Opus review, 2026-10-10)

Worktree `/home/decade/CRF-Editor-rdg-followup`, branch `fix/reference-delete-followup` (base main `0f2ad99`). Three parallel Sonnet slices with exclusive file scopes (FE tests / BE / docs-spec); the lead read every diff and re-ran every gate below on the final tree.

| Item | Result |
|---|---|
| R7 RED→GREEN (batch-delete reference oracle, AC11) | Before the fix the new isolation cases returned `409` for foreign ids (12 RED); after: foreign referenced and unreferenced ids both → `200 {"deleted": 0}` with victim rows intact, own-unreferenced + foreign-referenced mix deletes only the own row (`{"deleted": 1}`), own referenced ids still `409` with the existing detail text — all four kinds |
| Backend full suite (`bash /tmp/rdgf-pytest.sh`) | **1098 passed / 4 xfailed** (1071 + 27: `test_batch_delete_isolation.py` 2→18, `test_reference_delete_contract.py` 22→26, `test_codelist_option_authorization.py` 22→29) |
| Backend coverage | TOTAL 85% (9705 stmts / 1474 miss) |
| `ruff format --check .` | 148 files already formatted |
| Frontend node:test | **893 passed / 0 fail** (864 + 29) |
| Vitest mount tests | 11 passed (4 files) |
| Lint / build | 0 errors (3654 warnings, same total as main; lint covers `src/` only) / vite build success |
| Mutation proofs by the slice agents (scratch copies, AC12) | FE M-A…M-G and BE owner-before-existence, per-id placed/unplaced 409, option-belongs-to-codelist and R7 mutations each killed by the new tests |
| Lead independent mutation spot checks | FE M-A (mixed-dialog cancel still deletes) → 2 failures, M-B (all-blocked batch still posts) → 5, M-C (unreferenced single delete blocked) → 1 — all three passed 864/0 on the original suite; BE reference GET owner check moved below the codelist lookup → 2 failures (passed 1071/0 before); R7 reverted in `forms.py` → 3 failures |
| Haiku read-only frontend review | No findings |
| Inventory | 19 files = 15 slice files + 4 lead change-log docs; no unexpected edits |

Not run: browser re-run (frontend change is test-only; the backend scoping change is covered by API tests). Production deployment: not performed — the R7 fix exists only in local `main` until the user deploys.
