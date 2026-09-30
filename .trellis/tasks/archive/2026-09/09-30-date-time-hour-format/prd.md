# 日期时间/时间字段支持仅到小时格式

## Goal

Let users pick an hour-only format for 日期时间 fields (date + hour, no minutes/seconds) and for 时间 fields (hour only), with the preview, the Word export, column-width planning, and Word import all agreeing on the result.

Source requests (user, 2026-09-30):

1. 日期时间格式的字段，允许设置为仅有年月日时没有分秒的格式。
2. 时间格式的字段，允许仅有时没有分秒的格式。

Both requests share the same code paths, so they are one task.

## Background (code facts)

- F1 The option lists are duplicated in `frontend/src/components/FieldsTab.vue:37-42` and `frontend/src/components/FormDesignerTab.vue:2116-2121` (`DATE_FORMAT_OPTIONS` / `DEFAULT_DATE_FORMATS`). 日期时间: `yyyy-MM-dd HH:mm:ss`, `yyyy-MM-dd HH:mm`, `yyyy/MM/dd HH:mm:ss`, `dd/MM/yyyy HH:mm:ss`. 时间: `HH:mm:ss`, `HH:mm`, `hh:mm:ss AP`, `hh:mm AP`. Defaults: 日期时间 `yyyy-MM-dd HH:mm`, 时间 `HH:mm`.
- F2 `normalizeDateFormat` (`frontend/src/composables/formDesignerPropertyEditor.js:11-16`) replaces any value missing from the option list with the type default, so a format only works in the editors once it is in the list.
- F3 Preview `renderCtrl` → `renderDateFmt` (`frontend/src/composables/useCRFRenderer.js:511-547`) appends the trailing time label only when the time part had a separator (`:536-537`). Today `HH` renders `|__|__|`, `yyyy-MM-dd HH` renders `…日  |__|__|`, and `hh AP` renders `|__|__|  AP`: the 「时」 label is missing.
- F4 Word export (`backend/src/services/export_service.py:3401-3423`) picks seconds when `"ss" in fmt.lower()` and hour + minute otherwise, so an hour-only format would still print 「分」 boxes.
- F5 Width planning: the backend `CONTROL_PLACEHOLDER_WEIGHTS` (`backend/src/services/field_rendering.py:15-19`, used by `build_field_control_weight` at `:157`) holds one constant per type and ignores `date_format` (日期 33, 日期时间 53, 时间 18). The frontend `computeControlPlaceholderWeight` (`useCRFRenderer.js:413-418`) weighs the rendered text of the actual format. The two already disagree for seconds formats (日期时间 62 vs 53, 时间 27 vs 18). The shared fixture `backend/tests/fixtures/planner_cases.json` has a single date case (`日期 yyyy-MM-dd`), so it never caught this. The backend fixture adapter already passes `date_format` (`backend/tests/test_width_planning.py:468`) and reads only `normal` and `unified` cases (`:533`, `:592`).
- F6 The startup migration map `_DATE_FORMAT_CANONICALS` (`backend/src/database.py:1284-1305`) mirrors the frontend option lists (lowercase key → canonical spelling). `test_canonical_map_covers_frontend_option_lists` (`backend/tests/test_date_format_migration.py:89-100`) checks it against a hardcoded copy of the frontend lists. The offline script `backend/scripts/normalize_date_formats.py` reuses the map.
- F7 Word import `_detect_field_type` (`backend/src/services/docx_import_service.py:448`) only recognizes time when it sees a colon or both 「时」 and 「分」. An exported `…日  |__|__|时` comes back as 日期 `yyyy-MM-dd` (hour lost), and `|__|__|时` as 数值 with 2 integer digits. An AI suggestion can only change the type; the format then falls back to the default `HH:mm`.
- F8 Project copy, project `.db` import, template import, and field copy pass `date_format` through verbatim (`project_clone_service.py:268`, `project_import_service.py:42`, `import_service.py:1055`, `routers/fields.py:505`).
- F9 Existing preview/export text gaps that are not about hour precision: the preview prints `  AP` for 12-hour formats and the export does not; the export always prints 年月日 order whatever the date pattern.

## Decisions (user, 2026-09-30)

- D1 New options: 日期时间 `yyyy-MM-dd HH`; 时间 `HH` and `hh AP`. No slash or day-first hour-only variants. `hh AP` follows the existing 12-hour behavior: the preview prints `|__|__|时  AP`, the Word export prints `|__|__|时` (same accepted gap as `hh:mm AP`, F9).
- D2 Word import recognizes the hour-only placeholders strictly, only when the control text matches what this tool exports: `…日  |__|__|时` → 日期时间 `yyyy-MM-dd HH`; a cell that is exactly `|__|__|时` → 时间 `HH` (12-hour cannot be told apart because the export omits AP). `|__|__|小时` stays 数值. Accepted risk: a 2-digit numeric field whose unit is literally 「时」 imports as 时间; the user can fix it in the import preview.
- D3 Backend width weights for 日期 / 日期时间 / 时间 follow the exact placeholder text the Word export prints, for every format, as the preview already does. Accepted consequence: Word exports of existing seconds-precision fields get slightly wider control columns. 12-hour formats keep a gap equal to the `  AP` text (`hh AP`: preview 13, export 9).

## Requirements

- R1 Options (D1, F1, F2): the field library and the form designer offer the same date-format lists from one shared source, including 日期时间 `yyyy-MM-dd HH` and 时间 `HH` / `hh AP`. Defaults stay 日期时间 `yyyy-MM-dd HH:mm`, 时间 `HH:mm`. Selecting a new option survives type sync and editor-state normalization.
- R2 Preview (F3): hour-only formats render with the 「时」 label: `yyyy-MM-dd HH` → `|__|__|__|__|年|__|__|月|__|__|日  |__|__|时`, `HH` → `|__|__|时`, `hh AP` → `|__|__|时  AP`. Existing formats render exactly as today.
- R3 Word export (F4, D1): `yyyy-MM-dd HH` and `HH` print the same text as the preview; `hh AP` prints `|__|__|时`. Existing formats and empty formats print exactly as today.
- R4 Width planning (D3, F5): backend control weights for 日期 / 日期时间 / 时间 equal the weight of the exported placeholder text (`yyyy-MM-dd HH` 44, `yyyy-MM-dd HH:mm` 53, `yyyy-MM-dd HH:mm:ss` 62, `HH` 9, `HH:mm` 18, `HH:mm:ss` 27, 日期 33). The shared fixture covers hour-only and seconds formats and still matches both stacks.
- R5 Normalization (F6): the startup canonical map covers every frontend option, including the new ones, and the contract test checks it against the real frontend list instead of a hardcoded copy.
- R6 Word import (D2, F7): strict recognition as stated in D2; every other detection result stays as today.
- R7 Compatibility (F8): no schema change; copy and import paths keep passing `date_format` through; stored values change only through the idempotent case normalization.

## Acceptance Criteria

- [ ] AC1 (R1) A unit test pins the shared option lists and defaults. A source guard proves both editors import them and keep no local copy. `normalizeDateFormat` keeps `yyyy-MM-dd HH`, `HH`, and `hh AP`.
- [ ] AC2 (R2) `renderCtrl` returns the exact strings in the `design.md` placeholder tables for new and existing formats.
- [ ] AC3 (R3) `_render_field_control` returns the exact export strings for `yyyy-MM-dd HH`, `HH`, `hh AP`, the seconds formats, and an empty format.
- [ ] AC4 (R4) `build_field_control_weight` returns the R4 weights. `planner_cases.json` gains `normal` cases for 时间 `HH`, 日期时间 `yyyy-MM-dd HH`, 时间 `HH:mm:ss`, 日期时间 `yyyy-MM-dd HH:mm:ss`, plus one `unified` 日期时间 `yyyy-MM-dd HH` case. Existing expected fractions do not change. `columnWidthPlanning.test.js` and `test_width_planning.py` pass.
- [ ] AC5 (R5) The canonical map holds `yyyy-mm-dd hh`, `hh`, and `hh ap`. The contract test parses `frontend/src/composables/dateFormatOptions.js`. `YYYY-MM-DD HH` normalizes to `yyyy-MM-dd HH`, and the migration stays idempotent.
- [ ] AC6 (R6) Detection tests: date + hour → 日期时间 `yyyy-MM-dd HH`; exact `|__|__|时` → 时间 `HH`; `|__|__|小时` → 数值; vertical-layout date + hour → 日期 `yyyy-MM-dd`; the existing colon cases are unchanged.
- [ ] AC7 Frontend: `node --test tests/*.test.js` passes, `npm run lint` reports 0 errors, `npm run build` succeeds. Backend: the full `pytest` suite passes, run with proxy variables unset (`implement.md` §0).
- [ ] AC8 Browser check on a throwaway database: the dropdowns, preview, Word export, and Word re-import all match R1–R3 and R6. If the browser is blocked, the blocker is reported along with what was verified instead.
- [ ] AC9 The spec and project docs listed in `implement.md` §5 are updated.

## Out of Scope

- F9 gaps: printing AP in the export, and honoring the date order in the export.
- 数值 control width: the preview weighs the rendered boxes (default 10 + 2 digits → 49), the backend uses `FILL_LINE_WEIGHT` = 6 (`field_rendering.py:157`). Pre-existing; candidate for a follow-up task.
- `_cleanup_field_config` (`docx_import_service.py:1219`) keeps `date_format` when an AI suggestion changes a 日期时间 field to 日期 or 时间. Pre-existing.
- Other hour-only variants (`yyyy/MM/dd HH`, `dd/MM/yyyy HH`) and changes to the default formats.
