# Implement — 日期时间/时间字段支持仅到小时格式

Read `prd.md` (D1–D3, F1–F9), then `design.md` (§1–§6 and the placeholder table), before editing anything.

## 0. Setup

- Branch `feat/date-time-hour-format` from the latest `main`. Follow the global git rule (dedicated worktree). This task directory is untracked, so run the Trellis commands from the checkout that contains it, then record the branch with `python3 ./.trellis/scripts/task.py set-branch .trellis/tasks/09-30-date-time-hour-format feat/date-time-hour-format`.
- Backend interpreter: `~/.venvs/crf-editor/bin/python`. The system `python3` lacks backend dependencies such as pydantic.
- This machine exports `http_proxy` / `https_proxy` / `all_proxy`, and the venv has no `socksio`. Run backend suites with the proxies unset, or `test_ai_review_service` fails for environmental reasons:
  `env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY <command>`
- Baselines before any edit: frontend `cd frontend && node --test tests/*.test.js`; backend `cd backend && <env -u …> ~/.venvs/crf-editor/bin/python -m pytest -q`. Record the pass counts.

## 1. RED — write failing tests first

Run each file after writing it and confirm the new cases fail for the expected reason.

1. New `frontend/tests/dateTimeHourFormat.test.js`:
   - `DATE_FORMAT_OPTIONS` from `../src/composables/dateFormatOptions.js` equals the lists in `design.md` §1, in that order; `DEFAULT_DATE_FORMATS` is unchanged.
   - Source guard: `FieldsTab.vue` and `FormDesignerTab.vue` import `DATE_FORMAT_OPTIONS` and `DEFAULT_DATE_FORMATS` from `../composables/dateFormatOptions.js`, and neither declares `const DATE_FORMAT_OPTIONS` or `const DEFAULT_DATE_FORMATS`.
   - `normalizeDateFormat` with the shared options keeps `yyyy-MM-dd HH` (日期时间), `HH` and `hh AP` (时间).
   - `renderCtrl`: every row of both placeholder tables in `design.md`.
   - `computeFieldControlWeight`: 时间 `HH` → 9; 日期时间 `yyyy-MM-dd HH` → 44.
2. New `backend/tests/test_date_time_placeholder.py`:
   - `resolve_time_precision`: every row of the precision table (`design.md` §3), including `None`, `''`, and legacy `YYYY-MM-DD HH`.
   - `render_date_time_placeholder`: new and existing formats; `None` for other field types.
   - `ExportService(session)._render_field_control(field_def)` (pattern: `test_export_service.py:312-325`): 日期时间 `yyyy-MM-dd HH`, 时间 `HH`, 时间 `hh AP` (no AP), seconds formats, and `None`.
   - `build_field_control_weight`: 日期 33; 日期时间 `yyyy-MM-dd HH` 44, `HH:mm` 53, `HH:mm:ss` 62; 时间 `HH` 9, `HH:mm` 18, `HH:mm:ss` 27.
3. `backend/tests/test_date_format_migration.py`: rewrite `test_canonical_map_covers_frontend_option_lists` to parse the JS module (`design.md` §5); add the `YYYY-MM-DD HH` → `yyyy-MM-dd HH` case and idempotence for `HH` / `hh AP`.
4. `backend/tests/test_docx_import_rules.py`: `…日  |__|__|时` → 日期时间 `yyyy-MM-dd HH`; `|__|__|时` → 时间 `HH`; `|__|__|小时` → 数值 (unchanged); vertical-layout date + hour → 日期 `yyyy-MM-dd`; existing cases at `:180-200` untouched.

## 2. GREEN — implement in this order

1. `frontend/src/composables/dateFormatOptions.js` (new); swap the local constants in `FieldsTab.vue:37-42` and `FormDesignerTab.vue:2116-2121` for the import. Touch nothing else in `FormDesignerTab.vue`.
2. `frontend/src/composables/useCRFRenderer.js` `renderPart` trailing-label fix (`design.md` §2).
3. `backend/src/services/field_rendering.py`: helper, precision regex (`import re`), weight change; remove `CONTROL_PLACEHOLDER_WEIGHTS`.
4. `backend/src/services/export_service.py` `_render_field_control`: date branches → helper.
5. `backend/src/database.py` `_DATE_FORMAT_CANONICALS` entries and comment.
6. `backend/src/services/docx_import_service.py` `_detect_field_type` (`design.md` §6).
7. `frontend/scripts/generatePlannerFixtures.mjs` new cases, then `cd frontend && node scripts/generatePlannerFixtures.mjs`. Check `git diff backend/tests/fixtures/planner_cases.json`: only added cases. If an existing expected fraction moved, stop and find out why before going on.

Rollback points: steps 1–2 (frontend only), steps 3–4 (export and width), step 5, step 6, and step 7 can each be reverted on their own. If step 3 is reverted, redo step 7, because the fixture encodes the weights.

## 3. Validation

- Frontend: `cd frontend && node --test tests/*.test.js`, `npm run lint` (0 errors; existing prettier warnings are tolerated), `npm run build`.
- Backend: full suite with proxies unset (see §0), plus the targeted files `test_date_time_placeholder.py test_date_format_migration.py test_docx_import_rules.py test_width_planning.py test_export_service.py`.
- Cross-stack: both fixture consumers pass (`frontend/tests/columnWidthPlanning.test.js`, `backend/tests/test_width_planning.py`).
- Browser check (UI change), on a development build with a throwaway database:
  1. The field library and designer dropdowns list `yyyy-MM-dd HH` for 日期时间 and `HH` / `hh AP` for 时间.
  2. The designer preview shows the placeholder-table text.
  3. A Word export prints the same text (no AP).
  4. Re-importing that `.docx` through Word import detects 日期时间 `yyyy-MM-dd HH` and 时间 `HH`.
  If the browser is blocked, report the blocker and what was verified instead.

## 4. Review gates

- `trellis-check` after implementation, covering the width-planning contract checklist in `.trellis/spec/guides/cross-stack-contracts.md` §1.
- Confirm the diff stays within the files listed in §2, the new test files, and the docs in §5.

## 5. Docs and spec (Phase 3.3)

- `.trellis/spec/guides/cross-stack-contracts.md`:
  - §1: 日期 / 日期时间 / 时间 control weights come from the rendered placeholder text on both sides (`render_date_time_placeholder` ↔ `renderCtrl`).
  - New §12 "Date/Time Format Options": `dateFormatOptions.js` ↔ `_DATE_FORMAT_CANONICALS` ↔ export placeholder ↔ Word import detection, plus the accepted AP gap.
- Root `.claude/CLAUDE.md`: changelog entry; the Cross-Stack Contracts bullet; the mermaid and module-index counts (frontend composables 26 → 27, test file counts).
- `frontend/.claude/CLAUDE.md`, `backend/.claude/CLAUDE.md`: changelog lines.
- `.claude/index.json`: add `frontend/src/composables/dateFormatOptions.js`, `frontend/tests/dateTimeHourFormat.test.js`, `backend/tests/test_date_time_placeholder.py`.
- `README.md` / `README.en.md`: in the 表单设计 / Form Designer bullet, note that 日期时间 / 时间 fields support hour-only formats.
