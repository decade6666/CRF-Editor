# Post-merge verification (lead, 2026-10-10)

After fixing the reviewer findings (test-file wording, xfail convention, residue-scope claims), committing in three logical commits (`09c784c` docs, `76d8b54` spec, `d0aa4ae` tests/annotations), merging main `f08e104` into the branch (`509ac90`, two changelog conflicts resolved keeping both entries), and merging the branch into main with `--no-ff` (`18e6699`):

| Gate (run on merged `main`, main checkout) | Result |
|---|---|
| Full backend suite | **1098 passed, 0 xfailed** |
| Coverage (`--cov=src --cov=main`) | TOTAL **85%**; `export_service.py` 88%, `field_rendering.py` 89%, `database_export_service.py` 94% (measured on the identical tree in the worktree pre-merge) |
| `ruff format --check .` | 149 files already formatted |
| `git diff --check` | clean (worktree and main) |
| `git grep unified_landscape -- backend` | zero hits |
| Golden compare vs Step 0 `before/` | fresh post-merge export: **82 entries, 0 differences** (plain + annotated) |
| Parity CLI (plain + annotated) | exact_cell_ratio 1.0, exact_row_ratio 1.0, 0 mismatches, 6 forms, order matches |
| `test_word_table_parity.py` | 4 passed |
| Frontend `npm test` (in worktree, node_modules symlinked from main checkout, link removed after) | node:test **893 passed / 0 failed**; vitest **11 passed (4 files)** |
| `frontend/tests/columnWidthPlanning.test.js` (on main) | 49 passed / 0 failed |
| `.claude/index.json` | JSON valid, backend services 28 |

Unattributed edits note: `export_service.py` / `field_rendering.py` type annotations appeared in the shared worktree without attribution (implementer, both reviewers, and peer session crf-editor-40 all denied authorship; peer session crf-editor-2c's checker claimed only the `test_export_unified_preserves_cell_shading` shading assertions). The annotations were retained after diff review, `ruff format --check`, and the full suite passing; recorded here per the shared-worktree guard.

---

# Step 7 verification — docs sync (all in worktree `/home/decade/CRF-Editor-export-layer-cleanup`)

Baseline for this step: branch HEAD `c36718d` (lead-committed Step 6; final checks already recorded by the lead: parity CLI exact 1.0 plain+annotated, `test_word_table_parity` 4 passed, `unified_landscape` zero backend hits, coverage export_service 87%→88% / new module 94% / TOTAL 84%→85%).

## Changes (9 files)

- `.claude/CLAUDE.md`: updated the backend service inventory and task index; narrowed the final residue statement to backend source/test references to the removed `unified_landscape` mode.
- `.claude/index.json`: added `backend/src/services/database_export_service.py` to the backend services array; JSON was re-parsed and validated (28 services).
- `.context/history/archives/claudemd-changelog.md`: appended the full R1–R6 implementation narrative and verification evidence.
- `.trellis/spec/guides/cross-stack-contracts.md`: replaced the stale `_get_option_labels` checklist entry with `field_rendering.get_option_labels`; clarified deletion of the whole-form renderer while retaining frontend width-planning terminology and the 16-underscore no-width fallback.
- `.trellis/spec/backend/quality-guidelines.md`: clarified that strict xfail guards apply to intentionally retained inactive code; when reachability analysis proves a path dead and it is removed, retire obsolete xfails after converting reusable assertions to live-path tests and record the disposition.
- `backend/.claude/CLAUDE.md`: updated service inventory, export service descriptions, new database-export module entry, and the task change log; narrowed the retired-layout residue claim to backend source/tests.
- `backend/src/services/export_service.py`: corrected `_classify_form_layout` documentation and added explicit signatures for the refactored orchestration/rendering helpers.
- `backend/src/services/field_rendering.py`: annotated `get_option_labels` input as `Any` to complete its signature.
- `backend/tests/test_export_unified.py`: corrected stale descriptions and local table-variable names to match the live mixed layout and separate inline/normal tables; retained all test names and added the regular-field shading assertion.
- `backend/src/services/export_service.py` and `backend/src/services/field_rendering.py` also contained type-annotation/import updates when the final review resumed; their author could not be attributed despite checking with active task sessions. They were retained after diff review, formatting validation, and the full backend suite passing.
- The mixed-layout shading assertion was added by the concurrent task checker; it confirmed its write scope. It is limited to the regular-field row's expected `w:shd=0070C0`, and the focused test passes.

## Checks

| Check | Result |
|---|---|
| README re-grep first (per instruction) | `README.md` / `README.en.md` hits for `unified|_build_unified|moved DB-export names` are only the unrelated 「统一 429 JSON」 and format-commit wording — **zero README changes**. |
| Counts verified | backend `tests/` = 65 files (63 `test_*.py` + conftest + helpers); `src/services/*.py` = 29 including `__init__.py` → 28 modules. |
| `.claude/index.json` | Re-validated with `json.load`; 28 service entries. |
| `git diff --check` | Clean. |
| Backend residue grep | `git grep -n 'unified_landscape' -- backend` returned no hits. |
| Focused regression | `python -m pytest tests/test_export_unified.py -q`: **23 passed**, 1 existing deprecation warning. |
| Test terminology grep | Remaining `unified` hits are the retained test/file names, fixture identifiers, and output names; no stale whole-form renderer descriptions remain. |
| Scope | Spec edits confined to `.trellis/spec/backend/quality-guidelines.md` and `.trellis/spec/guides/cross-stack-contracts.md`; production-source changes are limited to layout documentation and type annotations; test changes update descriptions/local table names and add a shading assertion. All existing test names remain unchanged. No README or frontend changes. |

Nothing staged or committed at that point; Step 7 documentation and description corrections were subsequently committed (`09c784c`), followed by the spec correction (`76d8b54`) and the test/annotation commit (`d0aa4ae`). See the Post-merge verification section at the top for the full completion record, including the post-merge reviewer-follow-up commits `3ca5771` (stale `unified` comments in `test_export_service.py` / `test_export_column_width_override.py`) and `aeb5047` (narrowed cross-stack no-width fallback wording).

---

# Step 6 verification — R6 `_add_forms_content` split by layout

Baseline for this step: branch HEAD `e06cc12` (lead-committed Step 5). Pure move — statement order inside each branch preserved; the only structural collapse is the legacy tail's two identical `if/else` arms (both called `self._switch_section(doc, WD_ORIENT.PORTRAIT, project)`), which is byte-identical by construction.

## Changes (1 file, +169/−134, `backend/src/services/export_service.py`)

- `_add_forms_content` (was 32 cx / 181 lines) is now the orchestrator: empty-forms fallback, form ordering, `total_forms`, visit-map call, per-form loop with the exact `self._current_annotation_offsets` set (annotated ? `_load_annotation_offsets` : `{}`) and clear points, field ordering, `paper_orientation`, `_classify_form_layout`, `is_last_form`, and the two-way layout dispatch.
- New `_build_form_to_visits(project)`: the visit-map prologue moved verbatim (sorted visits, `form_to_visits.setdefault` loop).
- New `_add_form_heading(doc, idx, form, *, annotated)`: the `_add_toc_heading` call whose arguments were identical in both branches; called at the same position in each helper.
- New `_render_mixed_landscape_form(...)`: the former mixed branch verbatim (switch LANDSCAPE → heading → groups normalize `[[]]`→`[]` → per-group inline/normal tables at LANDSCAPE width → empty-groups fallback → visits paragraph → not-last switch PORTRAIT).
- New `_render_legacy_form(...)`: the former legacy branch — force_landscape switch → heading → groups → per-group `_render_legacy_group` → empty fallback (width by `force_landscape`) → visits paragraph → not-last switch PORTRAIT (collapsed identical arms).
- New `_render_legacy_group(doc, group, form, layout, project, *, annotated)`: the per-group body verbatim — inline groups compute `needs_temporary_landscape` (`len(group) > 4 and not layout.force_portrait`), paired temporary LANDSCAPE enter/exit, width selection; the old `continue` becomes `return` (nothing followed in the loop body); non-inline groups build a normal table at the `force_landscape`-selected width.

One formatting-only compaction inside the new `_render_mixed_landscape_form` (three unchanged call sites reflowed to fewer lines) to meet the ≤ 50-line gate; no statement changed.

## Complexity table (task AST counter, decision points + 1)

| Function | Before | After |
|---|---:|---:|
| `_add_forms_content` | 32 | 7 (44 lines) |
| `_build_form_to_visits` | — | 3 (12 lines) |
| `_add_form_heading` | — | 1 (11 lines) |
| `_render_mixed_landscape_form` | — | 7 (48 lines) |
| `_render_legacy_form` | — | 8 (48 lines) |
| `_render_legacy_group` | — | 9 (48 lines) |
| `_add_field_row` (context, changed in Step 4) | 18 | 16 |
| `_add_inline_table` (context, changed in Step 4) | 27 | 25 |
| `_add_log_row` (context, changed in Step 3) | 7 | 1 |
| `_add_label_row` (context, changed in Step 3) | 6 | 1 |

Every new/changed function: ≤ 50 lines, cx ≤ 10.

## Step 6 gates

| Gate | Result |
|---|---|
| Golden compare vs Step 0 `before` | `/tmp/export-golden-export-layer-cleanup.Jr4eH7bg/after-step6` vs `.../before`: **82 entries, 0 differences**; layout coverage unchanged (all six layout cases exercise the split helpers). |
| Export test files (unified / column-width-override / acrf / service / paper-orientation) | **94 passed** (paper-orientation added this step because it drives the branch order being split). |
| Full backend suite | **1071 passed, 0 xfailed** (baseline unchanged). |
| `ruff format --check .` | 149 files already formatted. |
| `git diff --check` | clean. |
| F401/F841 | `export_service.py`: only the 6 pre-existing findings; no new findings. |

`self._current_annotation_offsets` set/clear points: set at the top of each loop iteration exactly as before, cleared at the bottom of each iteration exactly as before — helpers only read it (via `_annotation_delta_y_for_key` inside the heading/annotation paths). Nothing staged or committed. Step 6 complete — stopping for the lead's final checks (parity CLI, final golden, residue greps) before docs.

---

# Step 5 verification — R5 database export moved to its own module

Baseline for this step: branch HEAD `653452b` (lead-committed Step 4). Copy-paste move; no behavior change intended.

## Design deviation (kept-and-reported)

`design.md` planned to move `_EXPORT_ERROR_CODES` with the DB functions, gated on "re-grep that nothing else uses them". The re-grep disproved exclusivity: `_EXPORT_ERROR_CODES["DATA_INCOMPATIBLE"]` is used by the Word path (`export_service._load_annotation_offsets`, aCRF annotation validation — the code whose 400 passthrough `main.py` registers). Per the no-cycle rule (`export_service` never imports the new module), `_EXPORT_ERROR_CODES` **stays in `export_service.py`** and the new module imports it together with `ExportError` (`from src.services.export_service import ExportError, _EXPORT_ERROR_CODES`). Error codes remain single-sourced; `main.py` untouched.

## Changes (4 modified + 1 new file, +5/−161 plus the new module)

- New `backend/src/services/database_export_service.py`: receives verbatim `export_full_database`, `_vacuum_sqlite_file`, `export_project_database`, `export_user_projects_database`, and their exclusive helper `_validate_form_field_schema` (bodies unchanged; module docstring records the split and the reverse-import rationale).
- `backend/src/services/export_service.py` (−155): the five functions removed; now-unused `sqlite3` / `tempfile` imports removed. `ExportError` and `_EXPORT_ERROR_CODES` stay (Word path + `main.py` handler).
- `backend/src/routers/export.py`: import block split — `ExportService, ExportError` from `export_service`; the three DB functions from `database_export_service`. Call sites unchanged.
- `backend/tests/test_export_validation.py`: module-level import split the same way; assertions unchanged.
- `backend/tests/test_project_import.py:1223`: function-level import switched to `database_export_service` (the latent-runtime-ImportError site called out in the plan); assertions unchanged.

## Step 5 gates

| Gate | Result |
|---|---|
| Targeted tests (`test_export_validation.py`, `test_project_import.py`, `test_export_word_errors.py`) | **46 passed**. |
| Residue grep | `export_full_database|export_project_database|export_user_projects_database|_vacuum_sqlite_file|_validate_form_field_schema` hits only: the new module, `routers/export.py` (import + 3 calls), `test_export_validation.py` (import + 3 calls), `test_project_import.py` (import + 1 call). Zero hits in `export_service.py`. |
| Golden compare vs Step 0 `before` (Word path untouched, run anyway) | `/tmp/export-golden-export-layer-cleanup.2j65Z4rA/after-step5` vs `.../before`: **82 entries, 0 differences**. |
| Full backend suite | **1071 passed, 0 xfailed** (baseline unchanged; guards against any missed import site). |
| `ruff format --check .` | 149 files already formatted (new module included). |
| `git diff --check` | clean. |
| F401/F841 on both modules + updated files | `export_service.py`: exactly the 6 pre-existing findings (line numbers shifted by the deletion); new module and the three updated files: no findings. No new findings. |

No test patched the four moved functions (research §3), so no `patch()` targets needed updating — confirmed by the green suite. Nothing staged or committed. Stopping before Step 6.

---

# Step 4 verification — R4 one control-dispatch ladder

Baseline for this step: branch HEAD `462d0b2` (lead-committed Step 3). Pure refactor — no behavior change intended; existing tests plus the golden harness are the judge.

## Changes (1 file, +27/−28, `backend/src/services/export_service.py`)

- New `_render_control_into_cell(cell, para, field_def, fill_line_chars: int | None)` (16 lines, cx 4): the identical empty-cell ladder both live paths shared — `单选（纵向）/多选（纵向）` → `_render_vertical_choices(cell, …)`; `单选/多选` → `_render_choice_field(para, …)`; anything else → `_render_field_control(field_def, fill_line_chars=…)` + `_set_run_font(run, 10.5)`.
- `_add_field_row` (normal tables): keeps its own default-value rendering (`extract_default_lines` multi-run + `add_break()`), computes `fill_chars = compute_fill_line_char_count(widths[1])` inside the no-default branch as before, and keeps BOTTOM-for-plain-fill-line vertical alignment and its two-step paragraph-metric sequence untouched.
- `_add_inline_table`: keeps single-run `row_values` default rendering, computes `inline_fill_chars` from `col_widths[col_idx]` with the `None` out-of-range fallback inside the empty branch as before, and keeps CENTER alignment plus its `space_before/after` both-bound-to-`not is_vertical_choice` spacing untouched.
- `_render_field_control` untouched: every branch kept, including `下拉框` (only rendered there) and its internally unreachable choice branches.

Call-sequence audit: the helper performs exactly the calls the inlined ladder performed, in the same order; `fill_line_chars` is computed at the same point (inside the empty branch) at both sites, so no evaluation-order or output change is possible.

## Step 4 gates

| Gate | Result |
|---|---|
| Golden compare vs Step 0 `before` | `/tmp/export-golden-export-layer-cleanup.M8F7wZdG/after-step4` vs `/tmp/export-golden-export-layer-cleanup.ThySa7x5/before`: **82 entries, 0 differences**; layout coverage unchanged (seed covers vertical/horizontal single+multi choice, dropdown, fill-line text/unit/number, date family, defaults, overrides). |
| Export test files (`test_export_unified.py`, `test_export_column_width_override.py`, `test_export_acrf.py`, `test_export_service.py`) | **82 passed**. |
| Full backend suite | **1071 passed, 0 xfailed** (baseline unchanged). |
| `ruff format --check .` | 148 files already formatted. |
| `git diff --check` | clean. |
| F401/F841 | `export_service.py`: only the 6 pre-existing findings; no new findings. |
| Complexity | `_render_control_into_cell` cx 4 / 16 lines; `_add_field_row` 18→16, `_add_inline_table` 27→25; both still listed for the Step 6 split table. |

Nothing staged or committed. Stopping before Step 5.

---

# Step 3 verification — R2 one structure-row renderer

Baseline for this step: branch HEAD `0cda92b` (lead-committed Step 2). Pure refactor — no behavior change intended; existing tests plus the golden harness are the safety net (no new tests; per refactor flow the suite was green before the edit: Step 2 full run 1071 passed / 0 xfailed).

## Changes (1 file, +29/−37, `backend/src/services/export_service.py`)

- `_add_log_row` / `_add_label_row` now keep only row acquisition (`table.rows[row_idx]`), `_apply_exact_row_height`, and the `cells[0].merge(cells[1])` merge, then delegate.
- New `_fill_structure_row_cell(cell, form_field, *, is_log: bool, annotated: bool)` (38 lines, complexity ≤ 10 by the task AST counter): shared text run (log fallback `以下为log行`, label fallback `field_def.label` — `getattr` form is semantics-identical for `FieldDefinition | None`), `resolve_label_font_pt` / `resolve_label_bold`, `_apply_cell_paragraph_metrics`, alignment (`LEFT` log / `JUSTIFY` label), vertical centering, and the annotation box.
- Log-only styling preserved in the helper: `bg_color or "D9D9D9"` shading and `text_color` recolor run only when `is_log=True`; label rows keep NO shading and NO recolor (the documented live contract). `FormLabel` paragraph style is set only for label rows, before the run is added, matching the original operation order in both branches byte-for-byte.
- New `_add_structure_row_annotation(para, field_def, *, annotated)` (11 lines) extracts the identical annotation-box block from both callers.

Operation-order audit: for each row kind the sequence of XML mutations (style → run → font → metrics → alignment → vcenter → [shading → recolor] → annotation) is identical to the pre-refactor code.

## Step 3 gates

| Gate | Result |
|---|---|
| Golden compare vs Step 0 `before` | `/tmp/export-golden-export-layer-cleanup.mnH8pjie/after-step3` vs `/tmp/export-golden-export-layer-cleanup.ThySa7x5/before`: **82 entries, 0 differences**; layout coverage unchanged (styled log rows with/without `label_override`, color-carrying label rows, and annotated export are all in the seed). |
| Export test files (`test_export_unified.py`, `test_export_column_width_override.py`, `test_export_acrf.py`, `test_export_service.py`) | **82 passed**. |
| `ruff format --check .` | 148 files already formatted. |
| `git diff --check` | clean. |
| F401/F841 | `export_service.py` shows exactly the 6 pre-existing findings; no new findings. |
| Complexity | `_add_log_row` 34→1, `_add_label_row` 6→1; new helpers ≤ 50 lines, complexity ≤ 10. |

Not run in Step 3: full suite and frontend (untouched this step; full suite runs at Step 4's gate and final). Out-of-scope divergence noted per design: the preview renders a custom `bg_color` on label rows while the export ignores it — pre-existing, unchanged. Nothing staged or committed. Stopping before Step 4.

---

# Step 2 verification — R3 one option-label implementation

Baseline for this step: branch HEAD `8282f37` (lead-committed Step 1 as `b445272`, then merged main `0f2ad99` as `8282f37`; post-merge suite 1071 passed / 0 xfailed — the new baseline).

## RED → GREEN

- RED: after converting the four `test_import_service.py` call sites to `get_option_labels(...)`, collection failed with ImportError (expected RED for a renamed function target).
- GREEN: after renaming `field_rendering._get_option_labels_for_width` → public `get_option_labels`, all four converted tests pass against the changed code, with assertions unchanged (`["男", "女"]` ×2, `["男_", "女"]`, `["男_"]`).

## Changes (3 files, +15/−54)

- `backend/src/services/field_rendering.py`: `_get_option_labels_for_width` renamed to public `get_option_labels(field_def) -> List[str]` (docstring states the shared sort/filter semantics); its one caller `build_field_control_weight` updated. Behavior identical: same guards, same `(order_index or inf, id or 0)` sort key, decode-only filtering.
- `backend/src/services/export_service.py`: deleted `_get_option_labels` + `_get_option_data` (the duplicate implementation); added `get_option_labels` to the `field_rendering` import; six call sites switched — `_render_single_choice`, `_render_single_choice_vertical`, `_render_multi_choice`, `_render_multi_choice_vertical` (former `self._get_option_labels`), `_render_vertical_choices` and `_render_choice_field` (former `self._get_option_data`). `get_option_labels` returns a fresh `List[str]` per call, matching the old `list(_get_option_data(...))` semantics.
- `backend/tests/test_import_service.py`: four `ExportService(session)._get_option_labels(...)` calls → `get_option_labels(...)`; import extended; assertions unchanged.

## Step 2 gates

| Gate | Result |
|---|---|
| Golden compare vs Step 0 `before` | `/tmp/export-golden-export-layer-cleanup.kNHtVZh4/after-step2` vs `/tmp/export-golden-export-layer-cleanup.ThySa7x5/before`: **82 entries, 0 differences**; layout coverage unchanged. |
| `test_width_planning.py` + `test_import_service.py` + export files (`test_export_unified.py`, `test_export_column_width_override.py`, `test_export_acrf.py`, `test_export_service.py`) | **220 passed** together. |
| Frontend contract (main checkout, unchanged test) | `node --test tests/columnWidthPlanning.test.js`: **49 passed, 0 failed**. |
| Full backend suite | **1071 passed, 0 xfailed** (matches the post-merge baseline; peer security tests untouched). |
| `ruff format --check .` | 148 files already formatted. |
| `git diff --check` | clean. |
| F401/F841 delta | Touched files show exactly the pre-existing HEAD findings (`export_service.py`: 5 F401 + `docPr` F841; `test_import_service.py:1385` `valid_ids` F841 — verified against `git show HEAD:` blobs). No new findings. |

Not run in Step 2: browser checks (frontend untouched). Nothing staged or committed. Stopping before Step 3 per plan.

---

# Step 1 verification — R1 deleted the unreachable `unified_landscape` path

## Conversion-first evidence (live-path tests green before any production edit)

Converted tests were run against the untouched production code before the deletion and passed:

- `tests/test_phase0_ordering_contracts.py::test_export_service_reads_same_field_order_after_reorder`
- `tests/test_phase0_ordering_contracts.py::test_import_then_reorder_then_export_consistent_order`
- `tests/test_phase0_ordering_contracts.py::test_quick_edit_updates_list_readback_and_export_consistently`
- `tests/test_export_acrf.py::test_mixed_landscape_annotations_only_emit_boxes_for_annotated_output`
- `tests/test_export_service.py::test_export_live_mixed_layout_tables_keep_minimum_row_height`

First conversion run caught a leftover `segments = ...` line in the quick-edit test (`NameError: groups`); fixed to `groups = ExportService(session)._group_form_fields(ordered_fields)`, then all 5 passed. Production code was untouched at that point.

## Production deletions (`backend/src/services/export_service.py`, −536 lines total in diff)

- `elif layout.mode == "unified_landscape":` branch in `_add_forms_content`.
- `_build_unified_segments`, `_build_unified_table`, `_add_unified_regular_row`, `_add_unified_full_row`, `_add_unified_inline_band`, `_compute_merge_spans`.
- `Segment` dataclass; `LayoutDecision` narrowed to `mode` (`"legacy" | "mixed_landscape"`) + `force_landscape`/`force_portrait`; all six `_classify_form_layout` constructor sites updated to the new field set.
- Removed imports now unused by the deletion: `plan_unified_table_width` (function stays in `width_planning.py`), plus `build_field_control_weight` and `compute_text_weight` from `field_rendering`/`width_planning` (their only users were the deleted unified table builder).

## Test conversions and deletions

| File | Change |
|---|---|
| `tests/test_phase0_ordering_contracts.py` | 3 sites converted from `_build_unified_segments` to the live `_group_form_fields`; ordering/segmentation intent preserved (flat id order ×2; quick-edit site now asserts the target's group is all-inline — equivalent of the old `segment.type == "inline_block"`). No assertion dropped. |
| `tests/test_export_acrf.py` | `_build_unified_fixture`/`_save_unified_doc`/`test_unified_annotation_helpers_only_emit_boxes_for_annotated_output` replaced by `_build_mixed_annotation_fixture` + `test_mixed_landscape_annotations_only_emit_boxes_for_annotated_output`: same expected annotation texts (`QS`, `UNI_REGULAR`, `UNI_INLINE_1..5`, log row and label absent), now through `export_project_to_word` with `annotated=True/False`, plus a new plain-vs-annotated table-text parity assertion. The sibling independent test in this file was not touched. |
| `tests/test_export_service.py` | `test_build_unified_table_sets_all_rows_to_at_least_one_centimeter` converted to `test_export_live_mixed_layout_tables_keep_minimum_row_height`: the ≥1cm `AT_LEAST` rule is asserted on both tables (normal + inline) of a live mixed_landscape `export_project_to_word` export; the live path does apply the rule, so no test was deleted. |
| `tests/test_export_unified.py` | Deleted the two xfail tests `test_export_unified_field_order_matches_order_index` and `test_export_unified_full_row_span_equals_N` (live coverage: ordering via phase0/`_group_form_fields` conversions above; log-row text/shading via `test_export_service.py` log-row tests). One stale docstring mention of `_build_unified_table` reworded. The 23 passing test names were kept. |
| `tests/test_export_column_width_override.py` | Deleted the xfail `test_export_unified_table_column_width_override` (override mechanism covered by live normal/inline tests in the same file). |

Deleted xfail total: 4, matching the plan. One conversion-round fix (the `groups` NameError above) happened before any production edit.

## Step 1 gates

| Gate | Result |
|---|---|
| Golden compare vs Step 0 `before` | `/tmp/export-golden-export-layer-cleanup.hz1EJxTz/after-step1` vs `/tmp/export-golden-export-layer-cleanup.ThySa7x5/before`: **82 entries, 0 differences** (plain + annotated). Layout coverage printout unchanged (all six modes/flags exercised). |
| Touched test files | `test_export_unified.py test_export_column_width_override.py test_export_acrf.py test_export_service.py test_phase0_ordering_contracts.py`: **104 passed**, 0 xfailed. |
| Full backend suite | **1027 passed, 0 xfailed** (was 1027 passed / 4 xfailed; −4 xfail as planned). |
| `ruff format --check .` | 145 files already formatted. |
| AC1 grep | `rg -n "unified_landscape" backend` → no hits (exit 1). |
| `git diff --check` | clean. |
| F401/F841 delta | Worktree `export_service.py` shows exactly the 6 pre-existing baseline findings (`json`/`math`/`Tuple`/`WD_TAB_ALIGNMENT`/`WD_TAB_LEADER` F401 + `docPr` F841, verified against `git show HEAD:` output); no new findings. The only test-file finding introduced by the conversion (`Document` unused in `test_export_acrf.py`) was removed; other test-file F401s pre-date this branch (verified against HEAD blobs). |

Not run in Step 1: frontend tests (frontend untouched), parity CLI (reserved for final check per plan). Nothing staged or committed.

---

# Step 0 verification — export-layer-cleanup

## Baseline identity and environment

- Worktree: `/home/decade/CRF-Editor-export-layer-cleanup`
- Branch: `refactor/export-layer-cleanup`
- HEAD: `bfbd00d068384f2dc73ccb2178d288990fa14514` (`chore(session): 记录后端格式化任务`), matching `/home/decade/CRF-Editor` `main` at the start of Step 0.
- Worktree status was clean: no tracked, staged, or untracked changes. No product source or test files were edited in this checkpoint.
- Python: `3.10.21`; pytest: `7.4.4`; Node: `v24.14.1`; npm: `11.11.0`.
- Proxy variables were unset for both backend test runs. `frontend/node_modules` was absent in the task worktree and present in the main checkout; no packages were installed.

## Baseline test results

| Check | Command / location | Result |
|---|---|---|
| Full backend suite | `cd /home/decade/CRF-Editor-export-layer-cleanup/backend && env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY /home/decade/.venvs/crf-editor/bin/python -m pytest -q` | **1027 passed, 4 xfailed**, 687 warnings, 41.76s |
| Backend coverage | Same worktree and proxy-unset environment; `python -m pytest --cov=src --cov=main --cov-report=term-missing:skip-covered -q` | **1027 passed, 4 xfailed**; total **84%**. `src/services/export_service.py`: **87%** (1559 statements, 196 missed); `src/services/field_rendering.py`: **89%** (112 statements, 12 missed). Coverage run: 50.67s. |
| Frontend width contract | `cd /home/decade/CRF-Editor/frontend && node --test tests/columnWidthPlanning.test.js` | **49 passed, 0 failed, 0 skipped**, 122.5ms. Ran unchanged test against the same baseline commit using existing main-checkout dependencies; `npm ci` was not run. |

The backend warning total includes the existing Starlette `BlockingPortal` deprecation and PyJWT short-test-key warnings; the suite exited successfully.

## Golden harness and determinism

- Harness: `/home/decade/CRF-Editor/.trellis/tasks/10-08-export-layer-cleanup/research/export_golden_harness.py`
- Golden output root: `/tmp/export-golden-export-layer-cleanup.ThySa7x5/`
- Baseline artifacts: `/tmp/export-golden-export-layer-cleanup.ThySa7x5/before/` (`plain.docx`, `annotated.docx`, plus decompressed entry trees under `plain/` and `annotated/`).
- Repeat artifacts: `/tmp/export-golden-export-layer-cleanup.ThySa7x5/repeat/`.
- Each run exported plain and annotated documents with a fresh `ExportService` instance per document and `bake_toc_page_numbers=False`; each document contained **41 decompressed zip entries**.
- The two untouched-worktree runs compared **82 entries with 0 differences**. The final seed also compared identically with the preceding formatted-harness baseline: **82 entries, 0 differences**.
- Comparator failure behavior was checked on a separate temporary copy after appending one newline to `plain/word/document.xml`: `--compare` reported one differing entry and exited with status **1**; baseline files were not altered.
- The harness prints and exercises all seeded layout cases:
  - `legacy portrait`: `legacy`, no force flags;
  - `legacy force_landscape`: `legacy`, `force_landscape=True`;
  - `mixed_landscape`: `mixed_landscape` (regular field plus five-field inline block);
  - `legacy temporary landscape`: `legacy`, auto orientation with a six-field inline-only block (temporary landscape enter/exit path);
  - `legacy force_portrait`: `legacy`, `force_portrait=True` with a six-field inline-only block;
  - `empty legacy`: `legacy`, empty form.
- Other seed coverage includes styled log rows with and without `label_override`; label rows with and without color overrides; checkboxes with and without `checkbox_label`; horizontal/vertical single- and multiple-choice controls, dropdown, text/unit, number, date/datetime/time including hour-only formats, empty choice options, multiline normal and inline defaults, normal and inline column-width overrides, `annotation_positions`, and two visits mapping forms for visit-section text.

## Baseline McCabe complexity

Counter: `/home/decade/CRF-Editor/.trellis/tasks/10-08-export-layer-cleanup/research/export_complexity.py` (stdlib AST decision counter; complexity is one plus branch points, including boolean operators and comprehension branches).

| Function in `export_service.py` | Baseline complexity |
|---|---:|
| `_add_forms_content` | 34 |
| `_add_field_row` | 18 |
| `_add_inline_table` | 27 |
| `_add_log_row` | 7 |
| `_add_label_row` | 6 |

The research scripts pass the backend-pinned `ruff format --check` configuration. No function in either task script exceeds 50 lines after splitting the seed helpers.

## Not run / checkpoint boundary

- No check was blocked in Step 0. The task worktree has no `node_modules`, so the frontend contract was run from the main checkout's already-installed dependencies instead; no install was attempted.
- Browser E2E and the preview/export parity CLI were not run in Step 0. They are outside the Step 0 baseline; the repository has no browser-level E2E suite, and parity verification is reserved for the planned final check.
- Only Step 0 is complete. Steps 1–7 have not started and remain pending the lead's review and explicit go-ahead. No changes were made to `backend/tests/test_export_acrf.py`.
