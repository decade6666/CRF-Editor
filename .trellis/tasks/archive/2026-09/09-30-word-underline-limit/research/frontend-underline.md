# Research: Frontend Word preview / simulated CRF underline generation and length rules

- **Query**: Frontend Word preview & simulated CRF underline generation, CSS rendering, shared width-planning constants, shared preview paths, tests/fixtures, existing max/floor rules; backend contract comparison
- **Scope**: internal (worktree `/home/decade/CRF-Editor-word-underline-limit`)
- **Date**: 2026-09-30
- All paths relative to the worktree root. Line numbers verified on this worktree's files.

## 1. Single source of underline generation: `useCRFRenderer.js`

Everything renders through `frontend/src/composables/useCRFRenderer.js` (header comment lines 1–12: shared semantic contract with `backend/src/services/width_planning.py`).

### 1.1 Constants (lines 18–37)

| Constant | Value | Line | Meaning |
|---|---|---|---|
| `WEIGHT_CHINESE` / `WEIGHT_ASCII` | 2 / 1 | 19–20 | planner char weights |
| `FILL_LINE_WEIGHT` | 6 | 22 | planner fallback demand for fill-line-only cells |
| `UNDERSCORE_CHAR_CM` | 0.19 | 30 | physical step of one `_` at 10.5pt |
| `CELL_HPAD_CM` | 0.4 | 31 | cell L/R padding reserve |
| `FILL_LINE_SAFETY_CM` | 0.2 | 32 | never-wrap safety reserve |
| `FILL_LINE_MIN_CHARS` | **6** | 33 | **existing floor** (roots of `_`) |
| `FILL_LINE_MAX_CHARS` | **80** | 34 | **existing cap** (roots of `_`) |
| `FILL_LINE_EPSILON` | 1e-9 | 36 | cross-stack ULP absorber |
| `LEGACY_FILL_LINE` | `'________________'` (16) | 37 | fixed 16-underscore fallback (no width) |

### 1.2 Estimator (lines 45–49) — the only length rule today

```js
export function computeFillLineCharCount(columnCm) {
  const usable = columnCm - CELL_HPAD_CM - FILL_LINE_SAFETY_CM
  const count = usable > 0 ? Math.floor(usable / UNDERSCORE_CHAR_CM + FILL_LINE_EPSILON) : 0
  return Math.max(FILL_LINE_MIN_CHARS, Math.min(FILL_LINE_MAX_CHARS, count))
}
```

- Length is **proportional to the planned column width (cm)**, clamped to `[6, 80]` roots.
- Physical span of the cap: 80 × 0.19 cm = **15.2 cm** (portrait content width is 14.66 cm, landscape 23.36 cm — `frontend/src/composables/visitPreviewLandscape.js:3-4`). So the 80 cap is only reachable in landscape / very wide columns; a portrait normal-table control column tops out around ~71 roots (≈13.5 cm).
- Must be "同名同值" with backend `compute_fill_line_char_count` (`backend/src/services/width_planning.py:29-50`), byte-for-byte (see §5).

### 1.3 Character-string → HTML conversion (lines 445–460, 365–370)

- `toHtml(text)` (445–460): escapes HTML, then `escaped.replace(/_{4,}/g, m => buildFillLineHtml(m.length))` (line 451) — **any run of ≥4 underscores** (from `renderCtrl` output *or* from user-typed default values routed through `toHtml`) becomes a border-bottom span.
- `buildFillLineHtml(length, minLength=4)` (365–370): inline `style="min-width:${length*0.5}em"` (e.g. 30 roots → `min-width:15.0em`; 6 roots → `3.0em`). The 0.5em/ch em estimate approximates the physical 0.19 cm at 10.5pt SimSun.

### 1.4 `renderCtrl(field, fillLineChars)` per field type (lines 494–559)

- No `fillLineChars` → `LEGACY_FILL_LINE` 16 roots (line 496).
- 文本 and any unrecognized type → `fillLine + unit` (line 558) — **the only type governed by the adaptive count**.
- 标签 → `''` (line 557); log rows render label text only.
- 数值 / 日期 / 日期时间 / 时间 → `|__|` box runs via `boxes()` (lines 500–551). Counts are fixed by digits/date format (e.g. date = 10 boxes), **NOT governed by `FILL_LINE_MAX_CHARS`** but inherently small.
- 单选/多选/复选 → no underscores.

## 2. CSS rendering of the underline

`frontend/src/styles/main.css`:

- `.fill-line` base class (lines 489–495): `display:inline-block; border-bottom:1px solid #333; vertical-align:bottom; min-width:3em`. **Line 488 is a red line: “C-01 红线：.fill-line 类名及其样式逻辑绝对不改（JS 字符串硬编码，v-html 渲染）”** — the class name/style logic is hard-coded in JS and rendered via `v-html`; any change here is contract-breaking.
- Whole-cell flex fill (lines 411–428): inside `.word-page` previews, when a `.fill-line` is the **only child** of its wrapper (`.wp-ctrl` / `.unified-value`), it gets `flex:1 1 0; min-width:0 !important` (lines 418–423, comment line 421: the `!important` deliberately overrides the inline em `min-width`). Consequence: **in `.word-page` previews the browser-visual length of a whole-cell underline equals the full column width, independent of the underscore root count**; the char count only drives the preview-JSON/export text (comment lines 411–413 say exactly this). `vertical-align:bottom` on the wrapper mirrors export `vAlign=BOTTOM` (lines 424–428).

Preview page geometry is fixed A4 (`frontend/tests/wordPageGeometry.test.js`; `.word-page--a4` 21×29.7 cm, landscape flips).

## 3. Which UI preview paths share the rendering (4 consumers)

All four compute `columnCm` → `computeFillLineCharCount` → `renderCtrlHtml(field, fillLineChars)`:

| Path | File:lines | Notes |
|---|---|---|
| Form designer main canvas + fullscreen designer | `frontend/src/components/FormDesignerTab.vue:1359-1372` (renderCtrl wrapper), `1401-1407` (renderCellHtml: no field_definition → bare `<span class="fill-line"></span>`; default value → `toHtml(defaultValue)`; else `renderCtrlHtml`), `1409-1423` (normalColumnCm/normalFillChars via `resolveNormalTableAvailableCm`), `1459-1471` (getInlineColumnCms/getInlineFillChars) | Template call sites: normal rows pass `normalFillChars(gi, gv, scope)` (3868, 4740-4743); unified band rows call `renderCellHtml(seg.fields[0])` with **no** fillLineChars → legacy 16 (3519, 4351; comment 1457-1458 “仅独立 inline 组使用（unified band 不传）”) |
| Visit form preview dialog | `frontend/src/components/VisitsTab.vue:428-437` (renderCellHtml), `464-476` (inline fill chars), `678-692` (normal fill chars) | Uses `previewRenderGroups` + `formPreviewPaperOrientation`; line 745-754 test locks that `renderCtrlHtml(field, fillLineChars)` forwarding is not bypassed |
| Template library import preview | `frontend/src/components/TemplatePreviewDialog.vue:236-248` (inline), `292-299` (renderCellHtml), `301-315` (normalColumnCm/normalFillChars) | Uses the template form's real `paper_orientation` from the `import-template/form-fields` API |
| Word import compare “导入效果” panel | `frontend/src/components/SimulatedCRFForm.vue:66-67`, `136-150` (controlCellHtml: `computeFillLineCharCount(controlFrac * resolvedAvailableCm)` → `renderCtrlHtml`), `80-93` (paperOrientation/availableCm props), mounted by `DocxCompareDialog.vue:74` | **Not** a `.word-page` root (`crf-form-wrap`/`crf-table`, lines 1-6) → the flex-fill override does NOT apply here; em `min-width` is the visual width |

Shared available-width resolver: `frontend/src/composables/visitPreviewLandscape.js:3-4,38-60` (`AVAILABLE_CM_PORTRAIT=14.66`, `AVAILABLE_CM_LANDSCAPE=23.36`, `resolveNormalTableAvailableCm`, `resolveInlineTableAvailableCm` incl. mixed-landscape + >4-col rules) — mirrored from backend `_build_form_table` / `_add_inline_table` width selection.

Column-width fractions come from designer-dragged persisted ratios (`readColumnWidthRatiosWithFallback`, localStorage `crf:designer:col-widths:<form_id>:<table_kind>` — only the designer writes; TemplatePreviewDialog/SimulatedCRFForm only read, `frontend/.claude/CLAUDE.md:88`) falling back to the content-driven planner (`planNormalColumnFractions` / `planInlineColumnFractions` / `planUnifiedColumnFractions`, `useCRFRenderer.js:190-346`).

## 4. Where underline length actually comes from today (summary table)

| Scenario | Preview char count | Export char count | Governing rule |
|---|---|---|---|
| Normal-table 文本 whole-cell control | `computeFillLineCharCount(controlFrac × availableCm)` | `compute_fill_line_char_count(widths[1])` (`backend/src/services/export_service.py:3082-3084`) | adaptive, clamp [6, 80] |
| Standalone inline-table per-column whole-cell | `getInlineFillChars(fields)[col]` | `compute_fill_line_char_count(col_widths[col_idx])` (`export_service.py:3311-3317`) | adaptive, clamp [6, 80] |
| Unified band (inline band + regular rows) | legacy 16 (no fillLineChars passed) | `_render_field_control(field_def)` legacy 16 (`export_service.py:2756`, `2490`) | fixed 16 (both stacks) |
| Any caller without width | legacy 16 (`useCRFRenderer.js:37,496`) | `"________________"` (`export_service.py:3371`) | fixed 16 |
| 数值/日期/日期时间/时间 | `|__|` boxes, fixed per format | same (`export_service.py:3401-3449`) | **no max-char rule applies** |
| Log rows | label text only (`SimulatedCRFForm.vue:16-19`; `FormDesignerTab.vue:1403`) | `_add_log_row` label only (`export_service.py:2911-2930`) | none |
| 标签 fields | label-only merged cell (`FormDesignerTab.vue:3753-3763`; renderer returns `''` at `useCRFRenderer.js:557`) | `_add_label_row` label text only (`export_service.py:2957-2983`) | none (the `标签` branch at `export_service.py:3451` is defensive/unreachable via normal routing) |
| User-typed default values containing ≥4 `_` | `toHtml` → fill-line span, min-width = runs × 0.5em, **unbounded** (`FormDesignerTab.vue:1405`, `useCRFRenderer.js:451`) | verbatim text lines (`export_service.py:3046-3062`) | **no cap exists on this path** |

Backend `renderCtrl` mirror: `_render_field_control` (`export_service.py:3358-3457`), same legacy-16 fallback and same type branches.

## 5. Cross-stack contract and parity constraints

`.trellis/spec/guides/cross-stack-contracts.md`:

- Line 279: shared constants table — `compute_fill_line_char_count` / `computeFillLineCharCount` with `UNDERSCORE_CHAR_CM=0.19`, `CELL_HPAD_CM=0.4`, `FILL_LINE_SAFETY_CM=0.2`, min **6** / max **80**, legacy **16**.
- Line 302 (normal-table row) & 303 (inline row): both stacks MUST keep identical constants and identical `floor(usable / UNDERSCORE_CHAR_CM + FILL_LINE_EPSILON)` rounding (Python `//` would diverge from JS `Math.floor`, e.g. 8.77 → 42 vs 43); `available_cm` per orientation (14.66 / 23.36, mixed-landscape rules) must match; lists every frontend caller that must thread the count.
- Checklist line 335-336: “If changing the width-adaptive fill-line, keep `compute_fill_line_char_count` and `computeFillLineCharCount` byte-for-byte equivalent, sync the underscore constants, and run `backend/tests/test_fill_line_width.py` + the `9.3e/9.3f` cases in `frontend/tests/columnWidthPlanning.test.js`”.
- §5 strict preview/export parity: `backend/src/services/word_table_parity.py` compares preview JSON cell text vs exported `.docx` text exactly; release evidence expectation `54/54 forms, 480/480 rows, 1181/1181 cells, mismatches 0` (spec line ~339). Any count change must keep both stacks identical or parity evidence breaks.

`frontend/.claude/CLAUDE.md`:

- Line 19: `useCRFRenderer.js` is the unified field-rendering entry; line 64: “Field preview and HTML rendering must uniformly reuse `useCRFRenderer.js`”.
- Line 85: repeats the shared constant list including `FILL_LINE_MIN_CHARS=6`, `FILL_LINE_MAX_CHARS=80`, and states width-aware preview callers pass the computed full-cell underscore count to text fill-lines.
- Lines 91: planner fixture single-source generator `frontend/scripts/generatePlannerFixtures.mjs` → `backend/tests/fixtures/planner_cases.json` (fixture includes case `normal_short_label_fill_line`, generator line 104; regenerating is mandatory when planner inputs change).

## 6. Tests / fixtures covering fill-line length

Frontend `frontend/tests/columnWidthPlanning.test.js`:

- `9.3d` (129-132): `toHtml` underscore→span em mapping (6 roots → `min-width:3.0em`, 16 → `8.0em`).
- `9.3e` (134-141): clamp to [6, 80] (`computeFillLineCharCount(1000) === 80`), monotonic, cross-stack boundary `8.77 → 43`.
- `9.3e2` (143-147): physical width never exceeds column (`count × 0.19 ≤ cm`).
- `9.3f` (149-154): `renderCtrl(field, 30)` → 30 underscores; **no-arg keeps legacy 16** (“向后兼容，不破坏 parity 默认值”).
- `9.3f2` (156-159): `renderCtrlHtml` min-width scales with roots (30 → `15.0em`).
- `16.1.5j` (745-754): source-level guard that VisitsTab forwards `fillLineChars` for all field types.

Backend `backend/tests/test_fill_line_width.py` (mirrors, same boundaries): min for zero/negative width, floor at narrow columns, monotonic growth, `test_count_caps_at_max_chars` (1000 cm → 80), never-wrap physical check, `8.77 → 43` float boundary, and “typical portrait control column > legacy 16”.

Parity tooling: `backend/scripts/compare_word_table_parity.py` (preview JSON vs `.docx`), `backend/tests/test_word_table_parity.py`.

## 7. Confirmed facts (for PRD R1–R3 discussion)

1. The only existing maximum is `FILL_LINE_MAX_CHARS = 80` roots (≈15.2 cm), shared by both stacks and byte-identical by contract; the only floor is 6 roots. There is no cm/em-based product cap.
2. Preview char counts and `.docx` char counts are produced by the same formula from the same constants — preview JSON and export text already match exactly; a new cap must change both sides in lockstep or strict parity breaks.
3. In `.word-page` browser previews, a whole-cell underline's *visual* length is stretched to the full column width by CSS (`main.css:414-423`), deliberately overriding the em min-width — so a char-count cap alone will NOT shorten what the user sees in designer/visit/template previews unless this flex-fill path is also addressed (SimulatedCRFForm, which lacks `.word-page`, does show the em width).
4. Adaptive counts apply only to 文本/unknown-type whole-cell controls in normal + standalone inline tables; unified bands and no-width callers are fixed at 16; 数值/日期 box runs and user default-value underscore runs are outside the current max rule.
5. Red line: `.fill-line` class name and its style logic must not change (`main.css:488`); renderer reuse mandate (`frontend/.claude/CLAUDE.md:64`).

## 8. Unresolved product decisions (open per PRD §Open Questions)

- Scope of “下划线”: whole-cell text fill lines only, or also `|__|` date/numeric boxes and underscore runs inside user default values (the one currently unbounded path)?
- Unit and value of the new maximum: underscore roots (a value < 80), or physical cm/em? Existing clamp semantics already implement “超出上限不再加长” (count stops growing; no wrapping, no truncation of user text), which matches R1/R3 — only the number needs deciding.
- Whether the unified-band legacy-16 lines (fixed, already short) stay as-is.
- Whether `.word-page` CSS flex-fill (visual = column width) must be capped so the preview visibly honors the same rule (R2 “预览与导出一致” is already true at the text level but not at the visual level).
- Behavior beyond cap: current design is fixed-length clamp (safe default given R3); no wrapping/truncation exists anywhere today.

## Caveats / Not Found

- No frontend CSS/JS mechanism found that limits underline length in cm or em besides the 80-root clamp and the `min-width:3em` base style; nothing else “too long”-guarding exists.
- Did not audit DOCX-import expansion (`_expand_underscore_option_fields`) or aCRF annotation geometry — out of scope for length limiting (import-side only, no preview/export underline length involvement found via grep).
- The `标签` branch in backend `_render_field_control` (`export_service.py:3451`) appears unreachable for label rows (routed to `_add_label_row`); flagged as defensive only — verify during implementation if scope touches 标签.
