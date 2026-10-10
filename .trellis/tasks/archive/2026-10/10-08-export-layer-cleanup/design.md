# Design: export-layer cleanup (dead branch, duplicate rendering, DB-export move, big-function split)

Baseline: `main` after `backend-format` merges (formatted with ruff 0.16.10, line-length 120). Facts and line numbers in `research/current-state.md` were taken at `a4431b0`, before formatting — re-anchor everything by function name (RB §5.2).

## Boundaries

- Touch:
  - `backend/src/services/export_service.py`;
  - `backend/src/services/field_rendering.py` (rename one private helper to public);
  - new `backend/src/services/database_export_service.py`;
  - `backend/src/routers/export.py` (imports only);
  - tests: `test_export_unified.py`, `test_export_column_width_override.py`, `test_export_acrf.py`, `test_export_service.py`, `test_phase0_ordering_contracts.py`, `test_import_service.py` (4 call sites), `test_export_validation.py` (import), `test_project_import.py` (one function-level import);
  - docs.
- Must NOT change:
  - `backend/src/services/width_planning.py` (incl. `plan_unified_table_width`) and `backend/tests/fixtures/planner_cases.json`, `test_width_planning.py`, frontend `useCRFRenderer.js` — the shared column-width contract keeps its "unified" kind;
  - `main.py` (`ExportError` stays in `export_service`, so its registration is untouched);
  - the Word import parser, the frontend, and any cross-stack constant.
- Output contract: every `.docx` byte stream produced by the Word export is unchanged (verified per zip entry by the golden harness below). This is a pure refactor; no behavior change is allowed, including in edge cases.

## Step 0 — Golden harness (safety net, written before any production edit)

Write `research/export_golden_harness.py` (kept in the task dir, archived with it; not committed to the repo). It must:

1. Build an in-memory SQLite DB (`sqlite+pysqlite:///:memory:`, `Base.metadata.create_all`) and seed one project whose forms jointly exercise:
   - layouts: `legacy` portrait; `legacy` with `paper_orientation="landscape"` (force_landscape); auto `mixed_landscape` (regular fields + an inline block wider than 4 columns); a legacy form whose inline block is > 4 columns under `auto` (temporary landscape enter/exit) and one under `portrait` (forced portrait); an empty form;
   - rows: log row with and without `label_override`, with `bg_color` / `text_color`; label rows with and without `bg_color` / `text_color`; checkbox `复选` with and without `checkbox_label`;
   - controls: 单选 / 多选 horizontal and 纵向, 下拉框, text with unit, number, date / datetime / time formats (incl. hour-only), multi-line defaults (normal and inline), choice fields with empty options;
   - column-width overrides on a normal table and an inline table; `annotation_positions` on one form; at least two visits mapping forms (visit section text).
2. Export twice per seed — `annotated=False` and `annotated=True` (aCRF) — each with a fresh `ExportService(session)` and `bake_toc_page_numbers=False` (no LibreOffice).
3. Write every zip entry's decompressed bytes to `<out>/<annotated|plain>/<entry-name>` (zip `date_time` is the only nondeterminism; research §5).
4. Print the layout mode each form got from `_classify_form_layout`, so the report proves all paths ran.
5. Usage: `python research/export_golden_harness.py --out /tmp/export-golden/<label>` run from the worktree's `backend/` (imports `src.*`). A `--compare <dirA> <dirB>` mode exits non-zero and lists differing entries.

Capture `before/` on the untouched branch first. After every step: capture `after-<step>/`, compare with `before/`, record the result. Any difference blocks the step; fix the code, never the harness seed.

Use `_classify_form_layout` and existing test seed helpers for orientation (`test_export_service.py` in-memory fixture, `test_export_acrf.py` codelist seeds); research §5 has a working probe as reference.

## Step 1 (R1) — delete the unreachable `unified_landscape` path

- Proof of unreachability: research §1 (exhaustive branches of `_classify_form_layout`: only `legacy` / `mixed_landscape`). Re-confirm on the formatted code.
- Delete: the `elif layout.mode == "unified_landscape":` branch in `_add_forms_content`; `_build_unified_segments`, `_build_unified_table`, `_add_unified_regular_row`, `_add_unified_full_row`, `_add_unified_inline_band`, `_compute_merge_spans`; the `plan_unified_table_width` import in `export_service.py` (the function stays in `width_planning.py`); narrow the `LayoutDecision.mode` comment to `legacy | mixed_landscape`.
- Tests — convert BEFORE deleting the functions, so the suite never goes falsely red:
  - `test_phase0_ordering_contracts.py` (3 sites using `_build_unified_segments` as a pure segmentation utility): assert the same ordering / segmentation intent on the live `_group_form_fields`. If an assertion only makes sense for unified segments (e.g. log/label as full-row segments), restate it on the live path's equivalent. If no equivalent exists, delete that assertion only and justify it in `verification.md`.
  - `test_export_acrf.py` (`_build_unified_fixture`, `_save_unified_doc`, `test_unified_annotation_helpers_only_emit_boxes_for_annotated_output`): rewrite to export a `mixed_landscape` form through `export_project_to_word` with `annotated=True` / `False`, and assert annotation boxes appear only in the annotated document. Keep the test's intent. Wave C (`shared-rule-convergence`) adds one independent test to this file; do not touch it if it is already there.
  - `test_export_service.py::test_build_unified_table_sets_all_rows_to_at_least_one_centimeter`: assert the same ≥ 1 cm `AT_LEAST` row-height rule on a live `mixed_landscape` export. If the live path does not apply that rule, the property was unified-only: delete the test and record why.
  - Delete the four xfail tests: `test_export_unified_field_order_matches_order_index`, `test_export_unified_full_row_span_equals_N`, `test_export_unified_multi_blocks_share_table_level_width` (`test_export_unified.py`) and `test_export_unified_table_column_width_override` (`test_export_column_width_override.py`). Their behaviors are covered on live paths (research §1 table).
  - Keep `test_export_unified.py`'s filename and its 23 passing tests' names. "unified" stays a width-planning term (`plan_unified_table_width`, planner fixtures), and the spec references the filename.
- AC1 grep: `git grep -n unified_landscape -- backend` → no hits (historical changelog lines in docs may remain; list them).

## Step 2 (R3) — one option-label implementation

- `field_rendering._get_option_labels_for_width` and `export_service._get_option_data` / `_get_option_labels` are semantically identical (research §2b: same guards, sort key `(order_index or inf, id or 0)`, `decode`-only values, same `复选` behavior).
- Rename the `field_rendering` helper to public `get_option_labels(field_def) -> list[str]` and update `build_field_control_weight`.
- In `export_service`, delete `_get_option_data` / `_get_option_labels` and call `get_option_labels` at every former call site (`_render_choice_field`, `_render_vertical_choices`, `_render_single_choice`, `_render_single_choice_vertical`, `_render_multi_choice`, `_render_multi_choice_vertical` — re-grep).
- Update the four `ExportService(session)._get_option_labels(...)` calls in `test_import_service.py` to `get_option_labels(...)`; assertions unchanged.
- `test_width_planning.py` must stay green. `frontend/tests/columnWidthPlanning.test.js` is unaffected (no constant or fixture changes); run it anyway as the contract check.

## Step 3 (R2) — one structure-row renderer

- After R1, row-kind detection lives only in `_build_form_table` (`is_log_row or 日志行` → log, `标签` → label, else field).
- `_add_log_row` and `_add_label_row` share:
  - the text run (log: `label_override or "以下为log行"`);
  - label font size and bold (`resolve_label_font_pt` / `resolve_label_bold`);
  - `_apply_cell_paragraph_metrics`, LEFT alignment, vertical centering, and the annotation box.
- They differ only in log-only styling: the `bg_color or "D9D9D9"` shading and the `text_color` recolor. Extract the shared part into one helper (e.g. `_fill_structure_row_cell(cell, form_field, *, is_log: bool, annotated: bool)`). Each caller keeps only row acquisition and merging.
- Label rows must stay without shading or recolor: this is the live export semantics and the documented contract (`cross-stack-contracts.md` §5, "Structure-row shading"). The deleted unified copy did shade labels; do not reintroduce that.
- Note for the report (out of scope): the preview renders a custom `bg_color` on label rows, while the export ignores it. This divergence existed before this task.

## Step 4 (R4) — one control-dispatch ladder

- After R1, two live sites remain: `_add_field_row` (normal tables) and `_add_inline_table` (inline tables).
- Extract the identical ladder into one helper. When the cell has no value or default:
  - `单选（纵向）` / `多选（纵向）` → `_render_vertical_choices(cell, …)`;
  - `单选` / `多选` → `_render_choice_field(paragraph, …)`;
  - anything else → `_render_field_control(field_def, fill_line_chars)` + `_set_run_font(run, 10.5)`.
- Callers keep their own concerns:
  - default-value rendering: multi-run lines with `add_break()` in field rows; the single-run `row_values` in inline tables;
  - `fill_line_chars`: from `widths[1]` in field rows, `col_widths[col_idx]` (or `None`) in inline tables;
  - vertical alignment: BOTTOM for plain text / label fill-lines in field rows, CENTER in inline tables;
  - paragraph spacing.
- Keep every branch of `_render_field_control`, including `下拉框` (only rendered there) and its internally unreachable choice branches. Removing defensive branches is out of scope.
- Byte equality covers the final OOXML, so a different write order of the same final properties is fine. The golden harness is the judge.

## Step 5 (R5) — database export moves out of the Word module

- New `backend/src/services/database_export_service.py` receives:
  - `export_full_database`, `_vacuum_sqlite_file`, `export_project_database`, `export_user_projects_database`;
  - the helpers only they use: `_validate_form_field_schema` and `_EXPORT_ERROR_CODES` (re-grep that nothing else uses them).
- `ExportError` stays in `export_service.py`: the Word path raises and catches it, and `main.py` registers its handler. The new module imports it from there. There is no cycle: `export_service` never imports the new module.
- Update every import site:
  - `routers/export.py` (one import block);
  - `tests/test_export_validation.py` (module-level import);
  - `tests/test_project_import.py` (the function-level `from src.services.export_service import export_project_database`, which would only fail at runtime).
- No test patches these four functions (research §3), so there are no `patch()` targets to update.
- Remove imports that become unused in `export_service.py` (`sqlite3`, `tempfile`). `ruff check --isolated --select F401,F841` on both modules may not add findings.
- Function bodies move verbatim (a copy-paste move). Error codes, messages, and the VACUUM/temp-file semantics are unchanged.

## Step 6 (R6) — split `_add_forms_content` by layout

- Target: the orchestrator plus helpers, each ≤ 50 lines and cyclomatic complexity ≤ 10 (decision points + 1, measured with a small AST counter kept in `research/`; report before/after numbers for every touched function).
- Suggested shape (research §4):
  - `_add_forms_content` (prologue, form ordering, visit map, per-form loop, annotation-offset load/clear, layout dispatch);
  - `_render_mixed_landscape_form(...)`;
  - `_render_legacy_form(...)` with `_render_legacy_group(...)` for the temporary-landscape enter/exit pair;
  - optionally `_add_form_heading(...)` for the repeated `_add_toc_heading` call.
- Pure move: statement order inside each branch is preserved.
- The legacy tail's two identical `if/else` arms collapse into one (the code is identical, so the bytes are too).
- Instance state (`self._current_annotation_offsets`) keeps its exact set/clear points.

## Parity evidence (R7 / AC6)

- The golden harness proves byte-identical `.docx` output for every step. Strict preview/export parity is a function of the export text, and the frontend is untouched, so parity cannot regress.
- Additionally run `backend/scripts/compare_word_table_parity.py` on the golden project. Use the `before` export's extracted table fields (`extract_docx_form_table_fields` → JSON) as the reference, and compare against the final `after` `.docx`. It must report exact 1.0 with the same form order. Record the output.
- Also run `test_word_table_parity.py`.
- State plainly in the report that no browser-generated preview JSON was used.

## Docs

- `backend/.claude/CLAUDE.md`:
  - the export_service description (no unified path; option labels from `field_rendering.get_option_labels`);
  - the new `database_export_service.py` entry;
  - the module Change Log.
- `.claude/index.json`: the new module.
- Root `.claude/CLAUDE.md`:
  - one Change Log line;
  - the full narrative to `.context/history/archives/claudemd-changelog.md`.
- `.trellis/spec/guides/cross-stack-contracts.md` §5 (standalone `docs(spec)` commit):
  - in the fill-line and structure-row-shading rows, replace the statements about `_build_unified_table` being unreachable and `_add_unified_full_row` with "the unified export path was deleted (export-layer-cleanup)";
  - keep the frontend `unified` preview note and the 16-underscore no-width rule.
  - Leave references to the `test_export_unified.py` filename as they are.

## Commits (lead commits after each step's checkpoint)

1. `refactor(export): 删除不可达的 unified_landscape 导出分支` — step 1 (code + test conversions/deletions).
2. `refactor(export): 选项标签取值收敛到 field_rendering` — step 2.
3. `refactor(export): 日志行与标签行共用结构行渲染` — step 3.
4. `refactor(export): 普通表与内联表共用控件分派` — step 4.
5. `refactor(export): 数据库导出函数移入独立模块` — step 5.
6. `refactor(export): 按版式拆分 _add_forms_content` — step 6.
7. `docs: 同步导出层整理后的文档` — docs except spec.
8. `docs(spec): 更新导出层跨栈契约描述` — `.trellis/spec/guides/cross-stack-contracts.md`.

All new or changed code must pass `ruff format --check` (pinned ruff, `backend/ruff.toml`).

## Interaction with sibling tasks

- Starts after `backend-format` merges.
- Wave C `temp-resource-lifecycle` runs in parallel. Its backend files (`routers/projects.py`, `routers/import_docx.py`, `services/docx_import_service.py`, `services/docx_screenshot_service.py`, a new services module) do not overlap with this task's.
- Wave C `shared-rule-convergence` adds one test to `test_export_acrf.py`: merge main before merging, and keep both changes.
- `backend-dedup` follows this task (or runs in parallel by lead decision). Its only shared files are the docs.

## Rollback

One commit per step. Revert the step whose golden comparison or suite regressed. The harness `before/` snapshot stays valid for the whole branch.
