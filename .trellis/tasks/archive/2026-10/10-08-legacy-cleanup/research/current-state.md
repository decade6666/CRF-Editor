# Research: Current State at a4431b0 (re-verification of prd.md)

- **Query**: re-verify legacy-cleanup inventory (perf pipeline, shrimp-rules.md, dead code) against main a4431b0
- **Scope**: internal
- **Date**: 2026-10-09
- All `path:line` cite HEAD a4431b0.

## 1. Backend perf references

Definition module: `backend/src/perf.py` (315 lines). APIs: `is_perf_baseline_enabled`:94, `begin_request_metrics`:99, `set_route_template`:124, `finish_request_metrics`:132, `perf_span`:163, `record_counter`:181, `record_payload_size`:190, `get_current_metrics_snapshot`:198, `record_sql_statement`:208, `increment_sqlite_busy_count`:228, `record_sqlite_busy_wait`:236, `sanitize_route_path`:244, `sanitize_sql_shape`:267.

### Production files (all import lines are perf-only; no mixed imports)

| File | Import | `with perf_span` | record_*/other | Notes |
|---|---|---|---|---|
| `src/database.py` | 12–17 (4 names) | — | hook fn 62–91, call 121 | **PRD missed this — see below** |
| `routers/export.py` | 17 | 56, 59, 70, 82, 100 | `record_counter` 87 | arg `os.path.getsize(tmp_path)` (stat; removed with call) |
| `routers/import_docx.py` | 29 | 332, 335, 350, 426, 491, 494, 499, 600 | 352, 353 (`record_payload_size`/`record_counter`), 398, 399 | dead locals 393–397; `:600` is inside `finally:` |
| `routers/projects.py` | 20 | 106, 110, 112, 143, 146, 148, 187, 189, 332, 340 | `record_payload_size` 114/150/191, `record_counter` 119/155 | args are `.stat()` / literals / `len(report.imported)`; no dead locals |
| `routers/visits.py` | 27 | 408, 418 | — | trivial |
| `services/docx_import_service.py` | 43 | 1322, **1457**, 1693, 1717, 1730, 1797, 2037, 2083, 2129 | `record_counter` 1622, 1623–1626 (multi-line arg) | `:1457` block contains `return` at 1461–1462 — keep the returns |
| `services/export_service.py` | 23 | 403, 419, 516, 1572 | `record_counter` 412, 413 | dead locals 410–411 |
| `services/order_service.py` | 17 | 487, 498, 513, 520, **523**, 729, 738, 753, 760, **763** | `record_counter` 494, 736 | `valid_ids` (489–493, 731–735) IS reused in `order_validate` — keep assignment, unwrap only; blocks 523/763 contain early `return` (525/765) |
| `services/project_clone_service.py` | 15 | 171, **208**, 354, 361 | — | `:208` clone_entities block ~145 lines and contains a `try` @292; `:354` assigns `copied_logo_name` INSIDE the with, used after — dedent keeps order |
| `services/project_import_service.py` | 14 | 239, 241, 244, 251, 258, 262, 284, 286, 289, 303, 310, 314 | — | trivial unwraps |
| `main.py` | 25–31 | — | middleware 348–379 | see §2 |
| `app_launcher.py` | — | — | — | **zero** perf references |

Non-trivial pattern audit (AST-verified): no `perf_span(` outside `with`; no with-line combining another context manager; no empty with-bodies. With-blocks containing control flow (keep body, dedent): docx_import_service 1457 (returns), order_service 523+763 (returns), project_clone_service 208 (try). Assignment wrapped by with (keep assignment): order_service 487/729, import_docx 350, project_clone_service 354.

Dead locals that appear only because of perf removal:
- `import_docx.py:393-397` — `forms_count`, `fields_count` (only consumers are `record_counter` 398–399)
- `export_service.py:410-411` — `forms_count`, `fields_count` (same)
- `database.py:5` — `import time` (only `time.perf_counter()` at 71/81, both inside the perf listener)

### database.py hook (PRD-missed) — exact mechanics

`attach_perf_sql_listeners(engine)` (`database.py:62-91`, called from `get_engine()` at `:121`) registers two **SQLAlchemy engine events**: `before_cursor_execute` (:67) pushes `time.perf_counter()` onto `conn.info["crf_perf_started_at"]` when enabled; `after_cursor_execute` (:73) pops it, calls `record_sql_statement` (:83, guarded try/except → debug log) and, if `"busy"` appears in the SQL text, calls `increment_sqlite_busy_count()` + `record_sqlite_busy_wait()` (:87-89). There is **no SQLite busy_handler registration** here — it is pure metric aggregation.

What must remain after removal: the separate `connect` event listener `_configure_sqlite` (`database.py:109-119`) with `PRAGMA foreign_keys=ON / journal_mode=WAL / busy_timeout=5000 / synchronous=NORMAL` — the real busy behavior (`busy_timeout`). `event` import (:8) and `logger` (used at 191, 741, 747, 792, 944, 998) stay; remove fn 62–91, call :121, import 12–17, `import time` :5. `attach_perf_sql_listeners` external refs: `tests/test_perf_baseline.py:16,58`, `scripts/run_perf_baseline.py:33,108` (all deleted anyway).

## 2. main.py middleware/lifespan

- Perf import: `main.py:25-31` (5 names, perf-only).
- `performance_baseline_middleware`: defined + registered via `@app.middleware("http")` decorator, `main.py:348-379`. Early-returns to `call_next` when disabled; logs via `logging.getLogger("src.perf")` (:376 — logger name dies with it).
- Nothing else in main.py exists only for perf (no Server-Timing/X-Perf headers anywhere in repo; lifespan has no perf calls).

## 3. Tests / scripts beyond the pattern greps

All 8 `backend/tests/test_perf_*.py` exist; only 3 import `src.perf`:
- `test_perf_baseline.py` (src.perf :24 + `attach_perf_sql_listeners` :16,58), `test_perf_busy_wait_metric.py` (:3), `test_perf_redaction.py` (:6).
- The other 4 touch perf only via scripts/env: `test_perf_contracts.py` (CRF_PERF_BASELINE :25,35,59,63), `test_perf_reorder_spans.py` (:45), `test_perf_fixture.py` (imports `scripts.generate_perf_fixture` :10), `test_perf_harness.py` (imports `scripts.run_perf_baseline` :9; `py_compile` of it :112). Pattern-grep AC (perf_span|record_counter|src.perf) will NOT match these 4 — delete by file list; `CRF_PERF_BASELINE` grep covers the env ones.
- `test_perf_fk_indexes.py`: imports only sqlalchemy + `src.database._migrate_add_performance_fk_indexes` + `src.models` — **confirmed zero `src.perf` usage; KEEP**.
- No `Server-Timing` / `X-Perf` / metrics-header hits anywhere in backend.
- `backend/scripts/generate_perf_fixture.py`: imports src.models only (no src.perf); referenced by `test_perf_fixture.py:10` and `run_perf_baseline.py:26` only. `run_perf_baseline.py`: imports `main.app`:25, `scripts.generate_perf_fixture`:26, `src.config`:32, `src.database`:33, `src.models`:34–37; env `CRF_PERF_BASELINE_DIR`:49, sets `CRF_PERF_BASELINE=1`:295; referenced by `test_perf_harness.py:9,112` only. No doc/CI/package references. Generates no committed fixtures (`backend/tests/fixtures/` holds only `field_normalization_cases.json`, `planner_cases.json`).

## 4. Env / config / docs

Switch: env var **`CRF_PERF_BASELINE` == "1"** (`perf.py:95`); helper `CRF_PERF_BASELINE_DIR` only in the two backend/frontend perf scripts + their tests. `backend/src/config.py`: **no** perf mention. `.env.example`, `deploy/`, `.gitignore`, `README.md`, `README.en.md`: **no** perf mentions (README.en.md:210 "performs" is a false positive). Root `.claude/CLAUDE.md`: only `:121` "performance FK indexes" (refers to the KEPT fk test — no edit) and `:144` commit-type `perf` (unrelated).

Live descriptions that MUST be updated:
- `.claude/index.json`: `:21` perf.py, `:91,93` scripts, `:129-136` eight test entries — **remove 7, KEEP `:133` test_perf_fk_indexes.py**, `:218` usePerfBaseline.js, `:233,235` two frontend scripts, `:286` perfBaselineHelpers.test.js, `:418` next_steps sentence.
- `backend/.claude/CLAUDE.md`: `:21` perf.py entry, `:30` tests count ("69 files" → 61) + "performance baseline" phrase, `:31` scripts count ("4 scripts" → 2) + fixture/baseline wording, `:124` infrastructure list.
- `frontend/.claude/CLAUDE.md`: `:35` composables count/description ("performance baseline", 31→30), `:37` scripts ("3 scripts" → 1), `:131` two perf test entries, `:156` file list usePerfBaseline.js.

Historical changelog lines — do NOT edit: `backend/.claude/CLAUDE.md:137` (test_perf_harness / run_perf_baseline adaptation note), `:158` ("perf contract tests"), `:164` ("performance FK index idempotent migration"); `.context/history/commits.md:902` + `commits.jsonl:74` (CRF_PERF_BASELINE decision records); `.trellis/tasks/archive/2026-06/06-30-acrf-annotation-drag/codex-pr2-run.log:62519`. `.trellis/spec/**` and `.context/prefs/**`: zero perf-baseline mentions (only "perf" as commit type in workflow/coding-style/git-convention docs — unrelated).

## 5. Frontend perf

`usePerfBaseline.js` exports (line 103): `clearPerfEvents, exportPerfEvents, isPerfBaselineEnabled, markPerfEnd, markPerfStart, recordPerfEvent`. Callers: only App.vue + FormDesignerTab.vue.

`frontend/src/App.vue`:
- `:41` import (4 names) — remove.
- `:74` `clearPerfEvents()` in `resetSessionState` — plain statement.
- `:147`/`:149` `markPerfStart/End('app_project_load', ...)` wrapping `projects.value = await api.get('/api/projects')` — keep the await, drop statements (args inline).
- `:244-249` `recordPerfEvent` inside `if (firstActivation)` in `onMainTabChange` — block becomes empty → `firstActivation` local `:242` becomes dead.

`frontend/src/components/FormDesignerTab.vue`:
- `:105` import (3 names) — remove.
- `:1238-1244` `recordPerfEvent` in `onDrop` — plain statement.
- `:1872` `const eventName = ...` — **dead local** (only `:1873` markPerfStart / `:1909` markPerfEnd); the pair wraps the form-switch guard chain (draft confirm, annotation flush, leave guards) — keep chain.
- `:1928-1934` `recordPerfEvent` in `openQuickEdit`; `:2011-2017` in `toggleInline` — plain statements.
- `:3274`/`:3280`/`:3282-3285` markPerfStart/End in `openDesigner` — try/catch must STAY (catch does `ElMessage.error`).

Frontend tests reading component source and asserting perf: only `frontend/tests/perfBaselineHelpers.test.js` (reads FormDesignerTab.vue :8, App.vue :9, usePerfBaseline.js :10; perf assertions :82-100). **Risk**: lines 13–77 are 5 NON-perf FormDesignerTab designer-auxiliary-data regression tests (`ensureDesignerAuxiliaryDataLoaded` etc.) with no duplicate in any other test file — deleting the whole file loses them. `browserPerfBaselineScript.test.js` reads `scripts/runBrowserPerfBaseline.mjs` (:10) only. `frontend/package.json` scripts: dev/build/preview/lint/format/test/test:component — **no perf entries, confirmed**. Other repo refs to the scripts/composable: only the files themselves, the 2 tests, `.claude/index.json`, `frontend/.claude/CLAUDE.md`, and the archived codex log (leave).

## 6. shrimp-rules.md

- Exists at repo root (2773 B). References across repo (excl. .git): only task docs (`10-08-legacy-cleanup/*`, `10-08-review-remediation/*`), `.context/history/commits.jsonl:45`-area history record. **Zero tooling/config references.** Safe to delete.
- `AGENTS.md` exists (1073 B); referenced by `.trellis/.template-hashes.json` (1 hit) and `.codex/config.toml:9-10` (`project_doc_fallback_filenames = ["AGENTS.md"]`). Keep both files untouched, per PRD.

## 7. Dead code

(a) `FieldRepository`: def `repositories/field_repository.py:13`; re-export `repositories/__init__.py:3,8`; **zero** other refs (every other grep hit is `FormFieldRepository` — different, heavily used class: field_cleanup_service.py:13,85; routers/fields.py:38,317,334,430; tests/test_import_service.py:20,604,628). Dead.

(b) `FieldProfileResult`: def `schemas/field_profile.py:117`; **zero** refs anywhere; NOT re-exported in `schemas/__init__.py` (it only re-exports project/visit/form/field/codelist/unit schemas + `BatchDeleteRequest`). The `field_profile` MODULE is alive (routers/fields.py:58; field_profile_service.py:31 import `FieldProfileCommand`/`FieldProfileResponse`) — only the class is dead.

(c) CSS. The review file (`review-2026-10-08.md:103-106`) says only "main.css 里有 5 组失效选择器，外加 .del-btn、.ff-type" — **it never enumerates the 5 groups**; no sub-report list was persisted. Identified items:
- `.del-btn` `main.css:169-170` — zero hits in `frontend/src/**` (templates/`:class`/classList/querySelector) and `frontend/tests/**` → **UNUSED**.
- `.ff-type` `main.css:252` — zero hits anywhere → **UNUSED**.
- My independent scan (118 class tokens in main.css vs `frontend/src`) flags exactly one family of 5 dead rule-groups: **`.fd-library` (232-233), `.fd-library-header` (234), `.fd-library-list` (235), `.fd-panel-resizer` (236-237), `.fd-item` (238-239)** — the old field-library left panel. Used `fd-*` classes are only `fd-right`, `fd-canvas*`, `fd-formlist`, `fd-notes-tooltip*` (FormDesignerTab.vue). Note `.fd-*` also appears in a `SortableJS` selector group at `main.css:257-264` (`\n.fd-item,\n.ff-item`) — the group selector needs editing, not blanket deletion. This is my scan, not the review's list; re-verify each at implementation.
- NOT dead despite zero source hits: `.el-*` classes (Element Plus runtime-applied), `.sortable-ghost/chosen/drag` (sortablejs runtime), `.hover-row` (el-table runtime). `.VERTICAL_OPTION_GAP_PT` was a comment-text artifact of my regex, not a selector.
- "重复的默认值支持规则": the phrase 「默认值支持」 appears **nowhere** in frontend/src, backend, READMEs, or spec. The only source is the single review line `review-2026-10-08.md:106` ("重复的密钥脱敏函数和'默认值支持'规则"). Plausible referents (duplicated default-value fallback in the two save flows, review :93; or VisitsTab multi-line default display, :202) are speculation — **NOT LOCATED, must be recorded as not-deleted**, matching PRD Background.

(d) `backend/tests/test_export_validation.py` — verified via `ast` + `symtable` using `/home/decade/.venvs/crf-editor/bin/python`, script kept at `/tmp/perf-analysis/testfile_verify.py` (read-only analysis; no test run):
- `from tests.helpers import auth_headers, login_as` — `:21`; module-level `referenced=False` both → zero refs. Helpers themselves stay in `helpers.py`.
- `session` fixture — decorator `:24`, `def :25-33`. No test uses it as a parameter; the `session` seen in `test_export_word_returns_docx_file`/`test_export_word_rejects_invalid_docx` is a **local `with Session(engine) as session:` variable** (assigned+referenced inside the test scope, `global_bound=False`), not the fixture; `conftest.py` defines only `test_root`, `_isolate_docx_dirs`, `engine`, `client` — no `session` fixture to inherit. Dead.
- `create_project` — `:53-57`; module-level `referenced=False` → zero refs (its `session` param was the fixture's only nominal consumer).
- `sessionmaker` — `:8` import; referenced only at `:28` inside the session fixture → dead after its removal. `Session` stays (used by tests).
- Control: `engine` fixture — decorator `:36`, `def :37-50`; used as parameter by `test_export_word_returns_docx_file` (`:103`) and `test_export_word_rejects_invalid_docx` (`:158`) → **ALIVE** (module-local fixture shadows the conftest one; irrelevant). PRD line numbers all match exactly.

## 8. Risks / surprises vs PRD

1. **`database.py` perf hook missed by PRD** — `attach_perf_sql_listeners` (62–91) + call (121) + import (12–17) + `import time` (:5). Keep `_configure_sqlite` PRAGMAs (esp. `busy_timeout=5000`) — no separate busy_handler exists, so nothing non-perf is lost.
2. **Only 3 of 8 perf tests reference src.perf tokens** — the pattern-grep AC won't prove deletion of the other 4; delete by explicit file list.
3. **`perfBaselineHelpers.test.js` is misnamed** — 5 of its 8 tests are non-perf designer-auxiliary-data regressions with no duplicate; whole-file deletion loses real coverage. Lead should decide (PRD R2 currently says delete both files).
4. **The review's "5 组失效选择器" is unenumerated** — only `.del-btn`/`.ff-type` are identified; the `.fd-library` family is my candidate list, not the review's.
5. **"默认值支持规则" confirmed unlocatable** — record as not-deleted.
6. With-blocks needing careful dedent (§1 table): docx_import 1457 (returns), order_service 487/523/729/763 (assignments/returns), project_clone 208 (~145-line block with try), project_clone 354 (local escapes the with), import_docx 350 (assignment) and 600 (`finally:` wrapper).
7. Dead locals inventory (§1 + §5): import_docx 393–397, export_service 410–411, database.py:5 `import time`, FormDesignerTab `:1872 eventName`, App.vue `:242 firstActivation`.
8. `.claude/index.json:133` (`test_perf_fk_indexes.py`) must NOT be removed from the tests list.
9. `perf.py` quirk (informational): `perf_span("toc_page_bake")` (`export_service.py:1572`) is absent from `_PHASE_KEYS`, so an enabled baseline would raise `ValueError` there — unreachable in default-off mode, irrelevant post-deletion.
10. Doc surface is smaller than the section-4 checklist assumed: nothing to do in config.py / .env.example / deploy/ / README / .gitignore / .trellis/spec.
