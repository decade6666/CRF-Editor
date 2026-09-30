# Design — 日期时间/时间字段支持仅到小时格式

Decisions D1–D3 and facts F1–F9 are defined in `prd.md`.

## Placeholder Table (source of truth for tests)

New formats:

| field_type | date_format | Preview (`renderCtrl`) | Word export (`_render_field_control`) |
|---|---|---|---|
| 日期时间 | `yyyy-MM-dd HH` | `\|__\|__\|__\|__\|年\|__\|__\|月\|__\|__\|日  \|__\|__\|时` | same |
| 时间 | `HH` | `\|__\|__\|时` | same |
| 时间 | `hh AP` | `\|__\|__\|时  AP` | `\|__\|__\|时` (AP not printed, F9) |

Existing formats must render exactly as today (regression anchors):

| field_type | date_format | Preview | Export |
|---|---|---|---|
| 日期时间 | `yyyy-MM-dd HH:mm` | `…日  \|__\|__\|时\|__\|__\|分` | same |
| 日期时间 | `yyyy-MM-dd HH:mm:ss` | `…日  \|__\|__\|时\|__\|__\|分\|__\|__\|秒` | same |
| 时间 | `HH:mm` / `HH:mm:ss` | `\|__\|__\|时\|__\|__\|分` / `…分\|__\|__\|秒` | same |
| 时间 | `hh:mm AP` | `\|__\|__\|时\|__\|__\|分  AP` | `\|__\|__\|时\|__\|__\|分` |
| 日期时间 / 时间 | `null` or `''` | defaults `yyyy-MM-dd HH:mm` / `HH:mm` | minute precision |

(`…日` stands for `|__|__|__|__|年|__|__|月|__|__|日`, two spaces before the time part.)

## 1. Shared frontend option list

New pure module `frontend/src/composables/dateFormatOptions.js` (stateless helper modules in `composables/` may use domain names, see `.trellis/spec/frontend/hook-guidelines.md`):

```js
export const DATE_FORMAT_OPTIONS = {
  日期: ['yyyy-MM-dd', 'MM/dd/yyyy', 'dd/MMM/yyyy', 'dd-MMM-yyyy', 'yyyy/MM/dd'],
  日期时间: ['yyyy-MM-dd HH:mm:ss', 'yyyy-MM-dd HH:mm', 'yyyy-MM-dd HH', 'yyyy/MM/dd HH:mm:ss', 'dd/MM/yyyy HH:mm:ss'],
  时间: ['HH:mm:ss', 'HH:mm', 'HH', 'hh:mm:ss AP', 'hh:mm AP', 'hh AP'],
}
export const DEFAULT_DATE_FORMATS = { 日期: 'yyyy-MM-dd', 日期时间: 'yyyy-MM-dd HH:mm', 时间: 'HH:mm' }
```

- `FieldsTab.vue:37-42` and `FormDesignerTab.vue:2116-2121` drop their local copies and import both names unchanged. Source-level tests match these identifiers (`quickEditBehavior.test.js:114,124`, `checkboxFieldType.test.js:97`, `formDesignerPropertyEditor.runtime.test.js:129-130,175-228`), so keep the names and the call sites as they are.
- Keep the literal in the plain `key: ['…', …]` shape (no `Object.freeze`, no computed values): the backend contract test reads it with a regex (§5).
- Defaults, `normalizeDateFormat`, and `syncFieldTypeSpecificProps` stay unchanged.

Rejected: adding the options to both inline copies. The backend map comment already names the frontend list as its source, and three hand-kept copies drift.

## 2. Preview fix (frontend)

`useCRFRenderer.js` `renderDateFmt` → `renderPart` (`:518-542`) appends the trailing time label only when `sepCount > 0` (`:536-537`). Track `hasBox` (set when a box character is consumed) and change the condition to `!isDate && (sepCount > 0 || hasBox)`. Update the comment to `HH→时，HH:mm→分，HH:mm:ss→秒`.

Effects: `HH` → `|__|__|时`; `yyyy-MM-dd HH` → `…日  |__|__|时`; `hh AP` → `|__|__|时  AP`. Parts without boxes (the `AP` token) still get no label, so every existing output is unchanged.

## 3. Backend placeholder helper (export + width)

In `backend/src/services/field_rendering.py`, the module that holds rendering logic shared by preview-parity and export, replace `CONTROL_PLACEHOLDER_WEIGHTS` (`:15-19`) with:

```python
DATE_PLACEHOLDER = "|__|__|__|__|年|__|__|月|__|__|日"
TIME_PLACEHOLDERS = {
    "hour": "|__|__|时",
    "minute": "|__|__|时|__|__|分",
    "second": "|__|__|时|__|__|分|__|__|秒",
}
_HOUR_ONLY_RE = re.compile(r"(?:^|\s)h{1,2}(?:\s|$)")


def resolve_time_precision(date_format: Optional[str]) -> str:
    """按 date_format 的时间部分返回 hour / minute / second；无法识别时沿用 minute。"""
    fmt = (date_format or "").lower()
    if "ss" in fmt:
        return "second"
    if _HOUR_ONLY_RE.search(fmt):
        return "hour"
    return "minute"


def render_date_time_placeholder(field_type: str, date_format: Optional[str]) -> Optional[str]:
    """日期 / 日期时间 / 时间 控件占位文本（Word 导出与列宽共用）；其他类型返回 None。"""
    if field_type == "日期":
        return DATE_PLACEHOLDER
    if field_type == "日期时间":
        return f"{DATE_PLACEHOLDER}  {TIME_PLACEHOLDERS[resolve_time_precision(date_format)]}"
    if field_type == "时间":
        return TIME_PLACEHOLDERS[resolve_time_precision(date_format)]
    return None
```

Precision table (unit-test every row):

| date_format | precision |
|---|---|
| `None`, `''`, formats without an hour token (e.g. `yyyy-MM-dd`) | minute (today's fallback) |
| `yyyy-MM-dd HH`, `HH`, `hh AP`, legacy `YYYY-MM-DD HH` | hour |
| `yyyy-MM-dd HH:mm`, `HH:mm`, `hh:mm AP` | minute |
| anything containing `ss` (case-insensitive) | second (today's rule) |

- `export_service.py` `_render_field_control` (`:3358`): the three branches at `:3401-3423` become one `render_date_time_placeholder(field_type, getattr(field_def, "date_format", None))` call. Unit handling and the other branches stay as they are.
- `build_field_control_weight` (`field_rendering.py:129-157`): for 日期 / 日期时间 / 时间 return `max(compute_text_weight(placeholder), FILL_LINE_WEIGHT)`; every other type keeps `FILL_LINE_WEIGHT`. 日期 stays 33. `CONTROL_PLACEHOLDER_WEIGHTS` has no other reference in `backend/src` or `backend/tests`.

Resulting weights (D3): `yyyy-MM-dd HH` 44, `yyyy-MM-dd HH:mm` 53, `yyyy-MM-dd HH:mm:ss` 62, `HH` 9, `HH:mm` 18, `HH:mm:ss` 27, `hh AP` 9 (preview 13).

## 4. Width-planning contract and fixtures

- `frontend/scripts/generatePlannerFixtures.mjs`: let the `dateField` builder (`:88-99`) take the field type, or add a sibling builder, and add:
  - `normal` cases, one field each: 时间 `HH`; 日期时间 `yyyy-MM-dd HH`; 时间 `HH:mm:ss`; 日期时间 `yyyy-MM-dd HH:mm:ss` (locks D3 for seconds).
  - one `unified` case: `regular_field` with 日期时间 `yyyy-MM-dd HH`, `columnCount: 7`, shaped like `unified_regular_date_control_weight_spans_value_columns` (`:220-232`).
  - no 12-hour cases (AP gap by design); no `inline` cases (the backend reads only `normal` and `unified`, `test_width_planning.py:533,592`).
- Regenerate with `cd frontend && node scripts/generatePlannerFixtures.mjs`. Existing cases must keep their expected fractions: the diff of `backend/tests/fixtures/planner_cases.json` may only add cases. Never hand-edit the fixture.
- The backend fixture tests (`test_width_planning.py:530`, `:586`) need no edits; the adapter already passes `date_format` (`:468`).

## 5. Migration map and contract test

- `_DATE_FORMAT_CANONICALS` (`database.py:1284-1305`): add 日期时间 `"yyyy-mm-dd hh": "yyyy-MM-dd HH"`; 时间 `"hh": "HH"` and `"hh ap": "hh AP"`. Point the comment at `frontend/src/composables/dateFormatOptions.js`.
- `test_canonical_map_covers_frontend_option_lists` (`test_date_format_migration.py:89-100`): read `frontend/src/composables/dateFormatOptions.js` (repo root is `Path(__file__).resolve().parents[2]`). Take the `DATE_FORMAT_OPTIONS` object body, match `['"]?(日期时间|日期|时间)['"]?\s*:\s*\[(.*?)\]` with `re.S` (longest key first), extract quoted strings, assert exactly the three keys with non-empty lists, then keep the existing lowercase-uniqueness and mapping assertions.
- Add migration cases: `YYYY-MM-DD HH` (日期时间) → `yyyy-MM-dd HH`; `HH` and `hh AP` (时间) unchanged and idempotent.
- `backend/scripts/normalize_date_formats.py` imports the map and needs no change.

## 6. Word import detection (D2)

In `_detect_field_type` (`docx_import_service.py:448`), `text` is already stripped:

- `has_date_hour = has_date and not has_time and bool(re.search(r"日\s*\|__\|__\|时$", text))`.
- Widen the combined branch to `if has_date and (has_time or has_date_hour):`. Keep the vertical-layout → 日期 rule first, then return `("日期时间", {"date_format": "yyyy-MM-dd HH"})` when `has_date_hour`, then the existing colon logic.
- After the `has_time` branch and before the ○ / □ / numeric checks: `if text == "|__|__|时": return "时间", {"date_format": "HH"}`.
- Unchanged: `|__|__|小时` (数值), `|__|__|时|__|__|分`, `|__|__|:|__|__|`, and the date + colon cases in `test_docx_import_rules.py:180-200`.
- Update the docstring's detection-order line.

## Compatibility and Rollback

- No schema change (`date_format` is `String(50)`). Stored values change only through the idempotent case normalization at startup.
- Copy, project `.db` import, and template import pass the new values through (F8).
- Export text is unchanged for existing formats. Only the control column width of seconds-precision 日期时间 / 时间 fields changes (D3).
- Rollback is a branch revert. Stored `yyyy-MM-dd HH` / `HH` / `hh AP` values then fall back to the type default in the editors (`normalizeDateFormat`) and to minute precision in the export. No data is lost.

## Known Gaps (not addressed here)

- F9: 12-hour AP is previewed but not exported; the export always prints 年月日 order.
- 数值 control width: the preview weighs the rendered boxes (default 10 + 2 digits → 49), while the backend returns `FILL_LINE_WEIGHT` = 6 (`field_rendering.py:157`). Pre-existing; candidate for a follow-up task.
- `_cleanup_field_config` (`docx_import_service.py:1219`) keeps `date_format` when an AI suggestion turns a 日期时间 field into 日期 or 时间, so the kept format can disagree with the new type. Pre-existing.
