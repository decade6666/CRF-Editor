# Design: retire the perf-baseline pipeline, shrimp-rules.md and dead code

Baseline: `main` at `f68ebe1` (2026-10-09). The line-level inventory lives in `research/current-state.md` (cited at `a4431b0`; `f68ebe1` only changed `frontend/tests/component/*` and docs, so every `backend/**` and `frontend/src/**` reference there is still exact). Re-grep anyway before each edit (RB §5.2).

## Boundaries

- Touch: the perf call sites listed in research §1/§2/§5, the files deleted below, `repositories/field_repository.py` + `repositories/__init__.py`, `schemas/field_profile.py`, `frontend/src/styles/main.css`, `backend/tests/test_export_validation.py`, one new frontend test file, docs.
- Must NOT change (each is an acceptance check):
  - `backend/src/utils.py` (`mask_secret`) and `backend/src/services/ai_review_service.py` (`_mask_api_key`) — moved to `backend-dedup` option (c);
  - `AGENTS.md`, `.trellis/.template-hashes.json`, `.codex/config.toml`;
  - `backend/tests/test_perf_fk_indexes.py` and its `.claude/index.json` entry (it tests FK indexes, not perf);
  - `database.py::_configure_sqlite` and its PRAGMAs (`foreign_keys`, `journal_mode=WAL`, `busy_timeout=5000`, `synchronous`) — real behavior, not perf;
  - historical changelog lines that mention perf (research §4 "do NOT edit" list).
- No behavior change for any user-visible path. Production-code edits are removals of instrumentation only.

## D1 — Backend perf removal

Delete `backend/src/perf.py`. Then, per production file in research §1 (`database.py`, `main.py`, routers `export.py` / `import_docx.py` / `projects.py` / `visits.py`, services `docx_import_service.py` / `export_service.py` / `order_service.py` / `project_clone_service.py` / `project_import_service.py`):

1. Remove the `from src.perf import ...` line(s) (all perf-only; no mixed imports).
2. `with perf_span("..."):` → delete the `with` line and dedent its body one level, statement order unchanged. Bodies containing `return` (docx_import_service 1457, order_service 523/763), `try` (project_clone_service 208), assignments used after the block (order_service 487/729 `valid_ids`, import_docx 350, project_clone_service 354 `copied_logo_name`) or sitting inside `finally:` (import_docx 600) follow the same rule — nothing else moves.
3. Delete every `record_counter(...)` / `record_payload_size(...)` statement, including the multi-line one (docx_import_service 1622-1626) and the `os.path.getsize(tmp_path)` argument (routers/export.py 87).
4. Delete the locals that only fed those calls: `forms_count` / `fields_count` in `import_docx.py` (393-397) and `export_service.py` (410-411). Before deleting, confirm the right-hand side is side-effect-free (len/attribute access). If it is not, keep it and report.
5. `database.py`: delete `attach_perf_sql_listeners` (62-91), its call in `get_engine()` (121), the perf import (12-17) and `import time` (5, only used inside the listener). Keep `event` and `logger` (used elsewhere).
6. `main.py`: delete the perf import (25-31) and the `@app.middleware("http") performance_baseline_middleware` (348-379). Remove any import that becomes unused as a direct result (check `time`, `Request`, `logging` usages before touching them).

Mechanical proof (required, record the output in `verification.md`): a throwaway script under `/tmp/<dir>/` parses each edited production file at `main` and at the branch, applies a "strip perf" transform to the `main` AST — drop `src.perf` imports; splice the body of every `With` whose items are all `perf_span(...)` calls; drop `Expr(Call)` statements to `record_counter` / `record_payload_size`; drop the dead-local `Assign`s from step 4; drop `attach_perf_sql_listeners` (def + call) and `import time` in `database.py`; drop `performance_baseline_middleware` and imports removed in step 6 in `main.py` — and asserts `ast.dump(stripped_main) == ast.dump(branch)` per file. Any mismatch means an unintended edit; fix the edit, not the script.

Unused-name check: `~/.venvs/crf-editor/bin/ruff check --isolated --select F401,F841 <edited files>` at `main` vs branch. The branch may not add a new finding (ruff is used here only as a read-only checker; no lint config is added).

## D2 — Deleted files

- Backend: `backend/scripts/generate_perf_fixture.py`, `backend/scripts/run_perf_baseline.py`; tests `test_perf_baseline.py`, `test_perf_busy_wait_metric.py`, `test_perf_contracts.py`, `test_perf_fixture.py`, `test_perf_harness.py`, `test_perf_redaction.py`, `test_perf_reorder_spans.py` (7 files; only 3 mention `src.perf`, so delete by this list, not by grep).
- Coverage-preserving ports (added 2026-10-09 after the lead's base-vs-branch coverage comparison; same rule as the frontend move in D3). Two deleted perf tests were the only tests exercising real, non-perf code:
  - `test_perf_fixture.py` parsed a synthetic Word document (preface tables + form tables containing every field type) with `DocxImportService.parse_full` and asserted table / form / field counts and the parsed field-type counts. Without it, `docx_import_service.py` drops from 266 to 447 missed statements. Port that docx part into a new non-perf test `backend/tests/test_docx_import_synthetic_tables.py`: the document builder (`_build_docx_fixture`, `_add_preface_table`, `_docx_label_for`, `_docx_value_for`, the field-type sequence and table counts, taken from `generate_perf_fixture.py` at `main`) plus the parse assertions. The `PERF_` data prefix may become `SYN_`. The form count may shrink if coverage stays equal. Do not port the DB-fixture determinism parts (they exercise no service code).
  - `test_perf_reorder_spans.py` was the only caller of `POST /api/projects/{project_id}/forms/reorder` (`routers/forms.py::reorder_forms`, 3 statements). Add an endpoint-behavior test (create forms, reorder, assert the response and the resulting `order_index` order) to `backend/tests/test_phase0_ordering_contracts.py`, next to the other endpoint-level reorder checks.
  - Gate: on the branch, missed statements of `docx_import_service.py` ≤ 266 and of `routers/forms.py` ≤ 22 (base `f68ebe1` numbers, `--cov=src --cov=main`). Every other file keeps its base missed-statement count; the percentage may dip only because covered perf lines were deleted.
- Frontend: `src/composables/usePerfBaseline.js`, `scripts/collectBuildMetrics.mjs`, `scripts/runBrowserPerfBaseline.mjs`, `tests/browserPerfBaselineScript.test.js`, `tests/perfBaselineHelpers.test.js` (see D3 for the 5 tests that move out first).

## D3 — Frontend perf removal

- `App.vue`: remove the import (41), `clearPerfEvents()` (74), the `markPerfStart/End('app_project_load', ...)` pair around the project load (147/149, keep the `await api.get('/api/projects')` statement), and the `if (firstActivation) { recordPerfEvent(...) }` block (243-249) together with `const firstActivation = !isTabActivated(name)` (241) once it is dead. If `isTabActivated` (or anything else) becomes unreferenced as a result, keep it and report — do not cascade.
- `FormDesignerTab.vue`: remove the import (105), the `recordPerfEvent(...)` statements in `onDrop` (1238-1244), `openQuickEdit` (1928-1934) and `toggleInline` (2011-2017), the `const eventName` + `markPerfStart` / `markPerfEnd` pair around the form-switch guard chain (1872/1873/1909; keep the chain), and the pair in `openDesigner` (3274/3280/3282-3285; the `try/catch` with `ElMessage.error` stays).
- Coverage-preserving move (decision; PRD R2 said "delete both perf test files"): the first five tests of `perfBaselineHelpers.test.js` (13-77: `FormDesignerTab delays auxiliary datasets…`, `…refreshes field definitions cache…`, `…resets auxiliary loaded state…`, `…guards in-flight designer auxiliary loads…`, `…reports auxiliary loading failures…`) are FormDesignerTab regressions unrelated to perf and duplicated nowhere. Move them verbatim into a new `frontend/tests/formDesignerAuxiliaryData.test.js` with only the source reads they use, then delete the old file with its three perf tests (82-115). Net node:test change: −3 perf tests in that file, −all tests of `browserPerfBaselineScript.test.js`; the moved five still pass.

## D4 — `shrimp-rules.md`

Delete it (zero tooling references, research §6). Leave `AGENTS.md` and its two referrers untouched.

## D5 — Dead code

- `backend/src/repositories/field_repository.py` (class `FieldRepository`) and its re-export lines in `repositories/__init__.py` (import + `__all__` entry). Do not confuse with the live `FormFieldRepository`.
- `FieldProfileResult` (`schemas/field_profile.py:117`) only; the module stays (`FieldProfileCommand` / `FieldProfileResponse` are live). Remove an import only if this deletion made it unused.
- `frontend/src/styles/main.css` — delete after re-grepping each selector in `frontend/src/**` (templates, `:class`, string-built names, `classList`, `querySelector`) and `frontend/tests/**`:
  - `.project-item .del-btn` and `.project-item:hover .del-btn` (169-170);
  - `.ff-item .ff-type` (252);
  - the retired field-library panel family (232-239): `.fd-library`, `.fd-library:hover`, `.fd-library-header`, `.fd-library-list`, `.fd-panel-resizer`, `.fd-panel-resizer:hover, .fd-panel-resizer.dragging`, `.fd-item`, `.fd-item:hover`;
  - every other `.fd-item` occurrence inside shared selector lists (e.g. the SortableJS group at 257-264): remove only the `.fd-item` entry, keep the rule for the remaining selectors.
  - Not dead despite zero source hits — do not touch: `.el-*`, `.sortable-ghost/chosen/drag`, `.hover-row` (runtime-applied).
  - The review counted "5 groups"; the field-library family is our own identification (research §7c), so record the grep evidence per selector in `verification.md`.
- "重复的默认值支持规则": not locatable (research §7c). Record "not located, not deleted" in `verification.md`; delete nothing for it.
- `backend/tests/test_export_validation.py` (PRD R7): delete `from tests.helpers import auth_headers, login_as` (21), the `session` fixture (24-33), `create_project` (53-57) and the `sessionmaker` import (8). The `engine` fixture (36-50) is the control and stays. This commit touches only that file.

## D6 — Docs (RB §7)

- `.claude/index.json`: remove `backend/src/perf.py`, the two backend scripts, the seven deleted perf tests (keep `test_perf_fk_indexes.py`), `usePerfBaseline.js`, the two frontend scripts, the two deleted frontend tests; add `formDesignerAuxiliaryData.test.js`; drop the perf sentence in `next_steps`; fix any counts.
- `backend/.claude/CLAUDE.md`: infrastructure list (`src/perf.py`), test-file count and "performance baseline" wording, scripts count/wording; module Change Log line. Historical changelog lines stay.
- `frontend/.claude/CLAUDE.md`: composables count/description, scripts count, test entries, file list; module Change Log line.
- Root `.claude/CLAUDE.md`: mermaid/module-index counts (backend tests 69 → 62 files / 67 → 60 `test_*.py`; frontend composables 32 → 31; frontend tests 76 → 75, node:test files 69 → 68), one Change Log line; full narrative appended to `.context/history/archives/claudemd-changelog.md`.
- README.md / README.en.md: no perf mentions; update only file/test counts they state, kept semantically identical.
- `.trellis/spec/**`: no perf mentions; no spec commit expected.

## Commits (one logical change each; the lead commits, staging explicit paths)

1. `refactor(backend): 删除退役的性能埋点与基线脚本` — D1 + backend part of D2.
2. `refactor(frontend): 删除退役的性能基线埋点与脚本` — D3 + frontend part of D2 (incl. the test move).
3. `chore: 删除 shrimp-rules.md` — D4.
4. `refactor(backend): 删除无引用的 FieldRepository 与 FieldProfileResult` — D5 backend.
5. `refactor(frontend): 删除 main.css 中无引用的选择器` — D5 CSS (`style` is not an allowed commit type).
6. `test(backend): 删除 test_export_validation 中无人使用的夹具与导入` — R7.
7. `docs: 同步性能埋点与死代码删除后的文档` — D6.

8. `docs(spec): 同步清理后的仓储目录树` — only `.trellis/spec/backend/directory-structure.md`; separate from project code/docs commits. Added after code-review located a lowercase file-path reference missed by the initial class-name grep.

## Interaction with sibling tasks

- Wave C (`temp-resource-lifecycle`, `shared-rule-convergence`) edits `routers/projects.py`, `routers/import_docx.py`, `services/docx_import_service.py`, `App.vue`, `FormDesignerTab.vue`. Start this task only after the user's ordering decision has been relayed (peer session `crf-editor-ad`); never have both in flight on those files.
- `backend-format` runs right after this task merges (fewer lines to format).
- `designer-split` (Wave E) starts from the post-cleanup `FormDesignerTab.vue`.

## Rollback

Every commit is independent; revert the offending one. The perf pipeline was already off by default (`CRF_PERF_BASELINE` unset), so reverting restores dead code only.
