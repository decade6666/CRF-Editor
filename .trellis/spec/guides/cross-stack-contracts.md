# Cross-Stack Contracts

> **Purpose**: Index of all cross-stack contracts between backend and frontend.

---

## What is a Cross-Stack Contract?

A cross-stack contract is a **shared agreement** between backend and frontend that must be maintained synchronously. Changes to one side require changes to the other.

**Key Characteristics**:
- Shared fixtures or test data
- Synchronized code changes required
- Breaking changes affect both stacks

---

## Active Cross-Stack Contracts

### 1. Column Width Planning

**Contract ID**: `width-planning`

| Aspect | Backend | Frontend |
|--------|---------|----------|
| **File** | `backend/src/services/width_planning.py` | `frontend/src/composables/useCRFRenderer.js` |
| **Purpose** | Calculate column widths for Word export | Render CRF form preview |
| **Shared Fixture** | `backend/tests/fixtures/planner_cases.json` | `frontend/tests/columnWidthPlanning.test.js` |

**Shared Constants**:

```python
# Backend (width_planning.py)
WEIGHT_CHINESE = 2                              # CJK character weight
WEIGHT_ASCII = 1                                # English/number/punctuation weight
FILL_LINE_WEIGHT = 6                            # Fill-line field weight
INLINE_HEADER_FLOOR = WEIGHT_CHINESE * 4        # = 8, short-header floor for inline columns
AVAILABLE_CM = 14.66                            # Available width for normal tables
```

```javascript
// Frontend (useCRFRenderer.js)
const WEIGHT_CHINESE = 2
const WEIGHT_ASCII = 1
const FILL_LINE_WEIGHT = 6
const INLINE_HEADER_FLOOR = WEIGHT_CHINESE * 4  // = 8
const AVAILABLE_CM = 14.66
```

`INLINE_HEADER_FLOOR` is the **per-column minimum demand for inline tables only**.
It protects ≤4-CJK-char headers (e.g. `未查` / `项目` / `单位`) from being squeezed
to a sub-line width by long sibling columns. Both ends apply it inside the same
`max(label_weight, control_weight, INLINE_HEADER_FLOOR)` chain in
`build_inline_column_demands` (Python) / `buildInlineColumnDemands` (JS) so
preview and export agree on column shares. `normal` and `unified` tables keep
their own protections (`max(weight, WEIGHT_ASCII * 4)`) and are NOT affected.

**Contract Rules**:
1. Any change to weight constants must update both files
2. New test cases must be added to shared fixture (regenerate via `frontend/scripts/generatePlannerFixtures.mjs`)
3. Both backend and frontend tests must pass

**Synchronization Checklist**:
- [ ] Update `width_planning.py` constants
- [ ] Update `useCRFRenderer.js` constants
- [ ] Update `field_rendering.py` (backend) and `useCRFRenderer.js` `buildInlineColumnDemands` (frontend) if the floor semantics change
- [ ] Add test case to `generatePlannerFixtures.mjs` (single source of truth) and regenerate `planner_cases.json`
- [ ] Run `backend/tests/test_width_planning.py`
- [ ] Run `frontend/tests/columnWidthPlanning.test.js`

---

### 2. Two-Phase Ordering Algorithm

**Contract ID**: `ordering-algorithm`

| Aspect | Backend | Frontend |
|--------|---------|----------|
| **File** | `backend/src/services/order_service.py` | `frontend/src/composables/useOrderableList.js` |
| **Purpose** | Reorder items avoiding SQLite conflicts | Trigger reorder API calls |

**Algorithm**:

```python
# Backend (order_service.py)
SAFE_OFFSET = 100000  # Avoids unique constraint conflicts

def reorder_items(items: list[dict], target_id: int, new_index: int):
    """
    Phase 1: Shift all items by SAFE_OFFSET
    Phase 2: Set target item to new position
    """
    # Phase 1: Shift
    for item in items:
        item.order_index += SAFE_OFFSET

    # Phase 2: Position
    items[target_id].order_index = new_index
```

**Contract Rules**:
1. Frontend calls `/reorder` endpoint with item ID and new index
2. Backend handles all collision avoidance
3. Frontend receives updated order on success

**API Contract**:

```typescript
// Request
POST /api/forms/{form_id}/fields/reorder
{
  "field_id": 123,
  "new_index": 0
}

// Response
{
  "success": true,
  "fields": [...]  // Updated field list in new order
}
```

---

### 3. Authentication Token Schema

**Contract ID**: `auth-token`

| Aspect | Backend | Frontend |
|--------|---------|----------|
| **File** | `backend/src/services/auth_service.py`, `backend/src/dependencies.py` | `frontend/src/composables/useApi.js`, `frontend/src/App.vue`, `frontend/src/components/LoginView.vue` |
| **Purpose** | JWT generation/validation and protected-response refresh | Token storage, API attachment, 401 shell reset |

**Token Payload**:

```python
# Backend JWT payload
{
    "sub": "1",            # User ID as string
    "username": "DECADE",  # Username snapshot
    "ver": 5,               # auth_version snapshot
    "exp": 1779265459       # Expiration timestamp
}
```

**Contract Rules**:
1. Frontend stores the access token in `localStorage['crf_token']`
2. Frontend attaches the token as `Authorization: Bearer <token>` via `getAuthHeaders()`
3. Backend validates `sub → user.id`、`username` and `ver → user.auth_version` in `get_current_user()`
4. On any 401, `useApi.js` removes `crf_token` and dispatches `crf:auth-expired`; `App.vue` clears session shell state
5. Successful protected responses may carry `X-Refreshed-Token`; `useApi.js` must overwrite `localStorage['crf_token']` when present
6. Password change or admin password reset still invalidates old tokens by incrementing `auth_version`
7. Frontend MAY decode JWT payload `exp` for display purposes; this decode MUST NOT be treated as authoritative — backend `get_current_user` remains the only authority for token validity.
8. Frontend MAY trigger `GET /api/auth/me` solely to request a fresh `X-Refreshed-Token`; this MUST NOT bypass the standard rate-limit or 401 handling.

**Validation**:
- Backend: `backend/tests/test_auth.py`
- Frontend: `frontend/tests/appSettingsShell.test.js`

---

### 4. Word Import Screenshot Evidence Preview

**Contract ID**: `docx-screenshot-evidence`

| Aspect | Backend | Frontend |
|--------|---------|----------|
| **File** | `backend/src/routers/import_docx.py`, `backend/src/services/docx_screenshot_service.py` | `frontend/src/components/DocxCompareDialog.vue`, `frontend/src/components/DocxScreenshotPanel.vue` |
| **Purpose** | Start screenshot job, expose status/page payload, fail fast on unsupported runtime | Show left evidence panel, poll status, and react to field clicks |

**Status Payload**:

```json
{
  "status": "starting | running | done | failed",
  "page_count": 0,
  "error": null,
  "page_ranges": {},
  "field_pages": {}
}
```

**Contracts**:
1. `DocxCompareDialog.vue` must render the left screenshot panel together with the right CRF preview panel
2. `DocxScreenshotPanel.vue` starts `/screenshots/start` and polls `/screenshots/status`
3. Field click uses `field_pages[currentFormName][field.index]` as the primary evidence locator
4. If a field has no concrete page mapping, frontend shows a gentle `未定位到原文页` hint and must not force-jump to the form's first page
5. On unsupported runtime (for example missing `pythoncom` / no Windows Word COM), backend task status must transition to `failed` with a user-visible Chinese error message instead of remaining stuck at `starting`

**Validation**:
- Backend: `backend/tests/test_docx_screenshot_service.py`
- Frontend: `frontend/tests/docxBimodalPreview.test.js`
- Browser/manual: open Word import preview and confirm the dialog contains both `原始文档截图` and `导入效果`

#### 1. Scope / Trigger
- Trigger: any change to `backend/src/services/docx_screenshot_service.py`, `/screenshots/start|status|pages` route behavior, form-page detection, field-page evidence mapping, or screenshot-panel polling/cache semantics.
- Trigger: any bug fix where compact index / TOC pages are misclassified as content pages, or repeated panel opens recompute `page_ranges` without form-name changes.

#### 2. Signatures
```python
class ScreenshotStartRequest(BaseModel):
    form_names: List[str] = []
    forms_data: Optional[List[dict]] = None  # full parsed forms including field list

class ScreenshotStartResponse(BaseModel):
    status: str

class ScreenshotStatusResponse(BaseModel):
    status: str  # idle | starting | running | done | failed
    page_count: int = 0
    error: Optional[str] = None
    page_ranges: dict = {}   # {form_name: [start_page, end_page]}
    field_pages: dict = {}   # {form_name: {field_index: page}}
```
- `POST /projects/{project_id}/import-docx/{temp_id}/screenshots/start`
- `GET /projects/{project_id}/import-docx/{temp_id}/screenshots/status`
- `GET /projects/{project_id}/import-docx/{temp_id}/screenshots/pages/{page}`

#### 3. Contracts
- Form-page detection MUST prefer the LibreOffice-rendered PDF outline (`doc.get_toc()`), strip numeric heading prefixes like `1.` / `7.1.` before matching form names, and only fall back to text matching for unresolved forms.
- TOC/index-page detection MUST be driven by independent matched-form count and/or ratio over the full form-name set; it MUST NOT short-circuit on "short page text" alone.
- `page_ranges` caching is process-local and keyed by the sorted form-name signature. Reopening the screenshot panel with the same signature MUST reuse the last ranges/field-pages instead of rerunning detection.
- `field_pages[currentFormName][field.index]` remains the primary frontend evidence locator; `page_ranges[currentFormName]` is the form-level fallback/navigation context.
- Unsupported runtime or render failure still reports `status=failed` with a Chinese user-visible error; the page-detection/cache changes do not weaken this fail-fast contract.

#### 4. Validation & Error Matrix
| Condition | Expected behavior |
|---|---|
| PDF outline contains matching form headings | Use outline page as authoritative `start_page` |
| Outline exists but some forms do not match after prefix stripping | Only unresolved forms fall back to text matching |
| Compact index page contains many form names but short text | Must still be classified as TOC/index and skipped as content |
| Reopen screenshot panel with identical sorted form-name signature | `start()` returns cached task and MUST NOT rerun page detection |
| Reopen screenshot panel with changed sorted form-name signature | `start()` refreshes `page_ranges` / `field_pages` once |
| No screenshot backend / render failure | Status transitions to `failed` with Chinese error message |
| Field has no concrete page mapping | Frontend shows `未定位到原文页` and MUST NOT force-jump |

#### 5. Good / Base / Bad Cases
- **Good**: outline has `1. 知情同意 -> p7`, `2. 访视日期 -> p8`; `page_ranges` starts at 7/8 even if pages 4-6 are compact index pages.
- **Base**: outline is empty, but text pages still locate forms by first non-index occurrence using the ratio-based TOC heuristic.
- **Bad**: a rule like `if len(text) < 400: return False` causes pages with 11-14 matched form names to be treated as content and collapses early forms onto pages 4-6.

#### 6. Tests Required
- Backend pure-function tests MUST cover:
  - compact index page -> `is_toc_page == True`
  - long content page with only 2 cross references -> `is_toc_page == False`
  - substring collision (`体重` vs `身高体重`) -> short name not counted independently
  - outline mapping -> true start pages come from outline, not first text hit
  - signature cache reuse -> unchanged signature skips redetection; changed signature refreshes once
- Backend integration test SHOULD be LibreOffice-gated on the real fixture `image/标准eCRF.docx`, asserting no form starts on pages 2-6 and `知情同意` resolves to the real content page.
- Frontend contract tests MUST keep polling/jump semantics unchanged (`frontend/tests/docxBimodalPreview.test.js`).

#### 7. Wrong vs Correct
**Wrong**
```python
if len(text) < 400:
    return False
```
Short compact index pages become false negatives, so many forms map to index pages.

**Correct**
```python
if hit_count >= 5 or (hit_count >= 2 and total_count > 0 and hit_count / total_count >= 0.4):
    return True
if 2 <= hit_count <= 4:
    return len(text) < 500
```
Decide TOC/index status from independent matched-form density, using length only as a gray-zone tiebreaker.

---

### 5. Word Preview / Export Strict Table-Field Parity

**Contract ID**: `preview-export-parity`

| Aspect | Backend (Word export) | Frontend (Word preview) |
|--------|----------------------|-------------------------|
| **Files** | `backend/src/services/export_service.py`, `backend/src/services/width_planning.py`, `backend/src/services/word_table_parity.py`, `backend/scripts/compare_word_table_parity.py` | `frontend/src/composables/useCRFRenderer.js`, `frontend/src/composables/formFieldPresentation.js`, `frontend/src/components/FormDesignerTab.vue`, `frontend/src/components/VisitsTab.vue`, `frontend/src/components/TemplatePreviewDialog.vue`, `frontend/src/styles/main.css` |
| **Purpose** | Render the authoritative `.docx` and expose a strict comparator for exported table fields | Render on-screen table fields with the same form/table/row/cell text model |
| **Shared Constants** | `FILL_LINE_WEIGHT = 6`, width-aware fill-line length for text controls (`compute_fill_line_char_count` / `computeFillLineCharCount`: `UNDERSCORE_CHAR_CM=0.19`, `CELL_HPAD_CM=0.4`, `FILL_LINE_SAFETY_CM=0.2`, min **6** / max **80**), width-aware remaining-length trailing underscores (`compute_choice_trailing_fill_char_count` / `computeChoiceTrailingFillCharCount`: subtract marker + label before writing the tail line), legacy fixed fill-line length **16** for whole-cell no-width callers and **6** for trailing-underscore no-width callers, page font **SimSun 10.5pt**, label font-size tiers `default=10.5pt`, `large=12pt`, `small=9pt`, table-cell vertical rhythm **5.25pt / 1.0**, vertical-choice inter-option gap `VERTICAL_OPTION_GAP_PT = 3` | Same text constants; label font-size tiers map to preview pixels `default=CSS default`, `large=16px`, `small=11px`; vertical gap mirrored by `.choice-group--vertical .choice-atom + .choice-atom { margin-top: 3pt }` |

**Scope / Trigger**: any change to Word preview or Word export table-field text, choice options, fill-lines, numeric/date placeholders, inline grouping, form section pagination, or strict parity extraction.

**Strict comparator signatures**:

```python
@dataclass(frozen=True)
class TableFieldForm:
    name: str
    tables: list[list[list[str]]]

def extract_docx_form_table_fields(docx_path: Path) -> list[TableFieldForm]: ...
def compare_table_field_forms(preview_forms, export_forms, max_mismatches=50) -> TableFieldParityReport: ...
```

**Contracts**:

| Rule | Preview | Export | Required behavior |
|------|---------|--------|-------------------|
| Choice marker-label spacing | `○有尾线`, `□选项1` | same literal text in DOCX runs | No internal space between marker and label. Export forces every DOCX run containing `○`/`□` to SimSun in `_set_run_font` (ascii+hAnsi), so markers render SimSun even when re-colored via `text_color` (color-only `_set_run_font` calls skip the font reset) or when they originate from literal default-value text; preview relies on CSS `font-family: SimSun`. |
| Choice option separator | horizontal choices join with two ASCII spaces | same | The two spaces separate options, not marker and label. |
| Vertical choice option gap | `.choice-group--vertical` blocks with `margin-top: 3pt` between atoms; renderer joins with empty separator (no `<br>`) | each option is its own paragraph; non-first paragraph `space_before = Pt(VERTICAL_OPTION_GAP_PT)` (=3), first stays `Pt(0)`, `line_spacing = 1.0` | Inter-option gap value (3pt) must stay identical on both sides; font 10.5pt + line 1.0 already aligned. |
| Trailing underscore | `label + "_".repeat(computeChoiceTrailingFillCharCount(columnCm, label))` and `buildFillLineHtml(computeChoiceTrailingFillCharCount(columnCm, label))` when a width-derived count is provided; fallback stays 6 `_` without column context | `label + "_" * compute_choice_trailing_fill_char_count(column_cm, label)`; fallback stays `label + "_" * 6` | No NBSP and no extra separator between label and underscores; width-aware **vertical** (one option per line) paths subtract marker + label per option. **Horizontal** choices (multiple options share one row) use `compute_horizontal_choice_trailing_fill_chars(column_cm, option_data)` in the **export** (`_render_choice_field`): the tail fills the column remaining after **all** options' marker+label+separators, split evenly among trailing options, so the whole row never wraps to a second underscore-only line. The frontend preview still renders horizontal tails per-option via `computeChoiceTrailingFillCharCount`; this is an accepted visual divergence (both fit the column, strict text parity unaffected because the preview emits `.fill-line` spans, not literal underscores). |
| Default text fill-line (normal table) | `renderCtrl(field, computeFillLineCharCount(controlFrac * availableCm))` | `_render_field_control(field_def, fill_line_chars=compute_fill_line_char_count(widths[1]))` | Underscore count is derived from the **control column width (cm)** via the shared estimator so it fills the column without wrapping. Both stacks MUST use identical constants `UNDERSCORE_CHAR_CM=0.19`, `CELL_HPAD_CM=0.4`, `FILL_LINE_SAFETY_CM=0.2`, `FILL_LINE_MIN_CHARS=6`, `FILL_LINE_MAX_CHARS=80`, `FILL_LINE_EPSILON=1e-9`, and the same `available_cm` per paper orientation (portrait 14.66 / landscape 23.36). **Rounding MUST be `floor(usable / UNDERSCORE_CHAR_CM + FILL_LINE_EPSILON)`** — backend uses `math.floor` (NOT Python float `//`, which diverges from JS `Math.floor` at boundaries, e.g. `8.77 → 42` vs `43`); the epsilon absorbs ULP-level differences in `fraction × available_cm` between stacks. **`available_cm` for the normal table is 23.36 when EITHER `paper_orientation === 'landscape'` (legacy `force_landscape`) OR the form is `mixed_landscape`; else 14.66.** This mirrors backend exactly: `_classify_form_layout` returns `mixed_landscape` when `has_regular && has_inline && max_inline_block_width > 4 && paper_orientation !== 'portrait'`, and the `mixed_landscape` branch renders BOTH inline AND normal groups at `LANDSCAPE_CONTENT_WIDTH_CM` (so `_add_field_row` fill-lines use 23.36 even under `auto`). The shared frontend resolver is `visitPreviewLandscape.js#resolveNormalTableAvailableCm(renderGroups, paperOrientation)` (with `isMixedLandscape` + exported `AVAILABLE_CM_PORTRAIT/LANDSCAPE` constants — single source for all preview paths). All preview paths that render normal control cells MUST thread the count via this resolver over the WHOLE form's render groups: `FormDesignerTab.vue` (`renderGroups`/`designerRenderGroups` + `selectedFormPaperOrientation`), `VisitsTab.vue` (`previewRenderGroups` + `formPreviewPaperOrientation`), `TemplatePreviewDialog.vue` (`previewRenderGroups` + the template form's real `paper_orientation` — the `import-template/form-fields` API now returns it via `ImportService.get_template_form_paper_orientation`, with `'auto'` fallback for legacy templates missing the column), `SimulatedCRFForm.vue` (`paperOrientation` prop → `buildFormDesignerRenderGroups(displayFields)` → resolver; `availableCm` prop overrides; `DocxCompareDialog.vue` passes `paper-orientation`). |
| Default text fill-line (inline table whole-cell) | `renderCtrl(field, getInlineFillChars(fields)[col])` via `getInlineRows(fields, fillCharsByCol)` | `_render_field_control(field_def, fill_line_chars=compute_fill_line_char_count(col_widths[col_idx]))` in `_add_inline_table` | Each inline column's whole-cell text fill-line adapts to that column's planned cm width. Frontend per-column count = `planInlineColumnFractions(fields)[col] × resolveInlineTableAvailableCm(formGroups, group, paperOrientation)`; backend uses the column's actual `col_widths[col_idx]`. `resolveInlineTableAvailableCm` mirrors backend `_add_inline_table` available_cm: portrait→14.66, landscape→23.36, mixed_landscape→23.36, else per-group `>4 cols → 23.36 (needs_temporary_landscape) / ≤4 → 14.66`. Non-override case only; drag-overridden inline widths use planner fractions (minor gap). Only standalone inline groups; unified inline bands stay 16. |
| Default text fill-line (unified table / no-width caller) | `________________` | `"_" * 16` | Unified tables are NOT width-adapted: backend `_build_unified_table` is currently unreachable (`_classify_form_layout` returns only `legacy`/`mixed_landscape`, and `mixed_landscape` renders separate inline+normal tables), and the frontend `unified` preview only appears for mixed forms whose preview already diverges structurally from the inline+normal export. Empty-choice placeholder also stays here (preview renders default `○是 ○否`, export renders underscores — pre-existing divergence). |
| Numeric placeholder | repeated boxes such as `|__||__||__|.|__|` | same | Each digit uses a standalone `|__|` box. |
| Datetime placeholder | date + two ASCII spaces + time | same | Date/time separator is exactly two spaces. |
| Inline default fallback | repeat full `renderCtrl(field)` when no scoped default exists | same exported control text | Do not collapse fallback controls to six underscores. |
| Inline scoped default | multiline defaults expand rows; missing later rows fall back to full control text | same row text model | Empty trailing default rows are trimmed before row expansion. |
| Group ordering | continuous normal/inline segments preserve `order_index` | `_group_form_fields` preserves the same segments | Never aggregate all normal fields before or after inline blocks. |
| Merged export cells | preview has one logical cell | comparator collapses duplicate `python-docx` merged-cell aliases by `cell._tc` identity | Row/cell denominators must count logical cells. |
| Structure-row shading | `getFormFieldStructurePreviewStyle()` applies default `#D9D9D9` only to log rows; label rows have no default fill; any custom `bg_color` renders as solid `#RRGGBB` with no alpha suffix | `_add_log_row()` uses `bg_color or 'D9D9D9'`; `_add_label_row()` adds no default shading; `_add_unified_full_row()` keeps the same log-vs-label split | Preview must not append `40` alpha to structure-row colors; default gray applies only to log rows, never to labels. |
| Label font-size tiers | `LABEL_FONT_SIZE_PX = { large: '16px', small: '11px' }`; `default` writes no inline `font-size` and keeps the CSS baseline | `DEFAULT_LABEL_FONT_PT = 10.5`; `_LABEL_FONT_SIZE_PT = { 'large': 12.0, 'small': 9.0 }` | Changing any tier must update the counterpart mapping and the frontend/backend label-style tests together. |
| Form section pagination | preview form order matches export form order | portrait forms use next-page section breaks | Do not replace portrait section breaks with plain page breaks. |
| Title and table geometry | `.wp-form-title` left-aligned; `.word-page td` keeps 5.25pt / 1.0 rhythm | `python-docx` Heading-1 default left alignment and matching paragraph spacing | CSS geometry tests lock the visual baseline. |

**Validation & Error Matrix**:

| Change | Required validation |
|--------|---------------------|
| Choice markers/options/trailing fill-lines | Backend export tests, frontend renderer tests, strict comparator on real fixture |
| Vertical-choice inter-option gap | `backend/tests/test_export_unified.py::test_export_vertical_choice_options_have_inter_option_gap` (asserts first `space_before=0`, others `=VERTICAL_OPTION_GAP_PT`) and `frontend/tests/formFieldPresentation.test.js` vertical block/margin assertions |
| Numeric/date placeholder literals | Backend export tests and `frontend/tests/columnWidthPlanning.test.js` |
| Inline fallback/default row expansion | Component preview source tests plus strict comparator |
| Normal/inline grouping or ordering | `backend/tests/test_export_service.py` and preview grouping tests |
| Merged/log-row table extraction | `backend/tests/test_word_table_parity.py` |
| Structure/log-row shading | `frontend/tests/formFieldPresentation.test.js`, `backend/tests/test_export_unified.py::test_export_unified_preserves_cell_shading`, and manual A4 side-by-side preview vs exported `.docx` at 100% zoom |
| Label font-size tiers | `frontend/tests/formFieldPresentation.test.js` and backend export label-style tests that cover `resolve_label_font_pt` / rendered Word runs |
| Section break or Word geometry | `backend/tests/test_export_service.py`, `frontend/tests/wordPageGeometry.test.js`, manual A4 side-by-side if browser/Word is available |

**Synchronization Checklist**:
- [ ] Update `export_service.py` `_render_choice_field`, `_get_option_labels`, `_group_form_fields`, and section-break logic when export behavior changes
- [ ] Update `useCRFRenderer.js` `renderCtrl` (plain text) and `renderCtrlHtml → renderChoiceHtml` (HTML) together
- [ ] Update all preview table paths: `FormDesignerTab.vue`, `VisitsTab.vue`, and `TemplatePreviewDialog.vue`
- [ ] Keep structure-row shading aligned: `formFieldPresentation.js#getFormFieldStructurePreviewStyle()` must mirror `export_service.py` log-row/label-row defaults and use solid custom `bg_color` (no `40` alpha suffix)
- [ ] If changing planner weight, update both `FILL_LINE_WEIGHT` constants and width-planning tests
- [ ] If changing the width-adaptive fill-line, keep `compute_fill_line_char_count` (`width_planning.py`) and `computeFillLineCharCount` (`useCRFRenderer.js`) byte-for-byte equivalent, sync the underscore constants, and run `backend/tests/test_fill_line_width.py` + the `9.3e/9.3f` cases in `frontend/tests/columnWidthPlanning.test.js`
- [ ] If changing extraction semantics, update `word_table_parity.py` and comparator tests
- [ ] Run `backend/tests/test_export_unified.py`, `backend/tests/test_export_service.py`, `backend/tests/test_width_planning.py`, `backend/tests/test_word_table_parity.py`
- [ ] Run `frontend/tests/columnWidthPlanning.test.js`, `frontend/tests/wordPageGeometry.test.js`, `frontend/tests/formFieldPresentation.test.js`
- [ ] For release evidence, run `backend/scripts/compare_word_table_parity.py` against preview JSON and exported `.docx`; expected strict evidence is 54/54 forms, 480/480 rows, 1181/1181 cells, mismatches 0 for the current fixture
- [ ] Manual: side-by-side A4 zoom 100% preview vs exported `.docx` at Word/WPS 100% zoom when GUI tools are available

**Wrong vs Correct**:

```python
# Wrong
atom_text = label + " " + trailing_fill

# Correct
trailing_fill = "_" * (fill_line_chars or 6)
atom_text = label + trailing_fill
```

```javascript
// Wrong
return options.map(option => `○ ${option.text}`).join('  ')

// Correct
return options.map(option => '○' + option.text).join('  ')
```

```javascript
// Wrong
return { lines: ['______'], repeat: true, fallback: '______' }

// Correct
const ctrl = toHtml(renderCtrl(formField.field_definition))
return { lines: [ctrl], repeat: true, fallback: ctrl }
```

**Common Pitfall** (recorded incidents):
> Updating only `renderChoiceHtml` leaves the plain-text `renderCtrl → toHtml` path stale in Visits/designer inline previews.
> Updating only frontend literals leaves `width_planning.py` and exported `.docx` widths/text out of sync.
> Comparing `python-docx` `row.cells` directly overcounts merged cells unless duplicate `cell._tc` aliases are collapsed.

---

### 6. aCRF Annotation Geometry

**Contract ID**: `acrf-annotation-geometry`

| Aspect | Backend | Frontend |
|--------|---------|----------|
| **Files** | `backend/src/services/export_service.py`, `backend/src/schemas/form.py` | `frontend/src/composables/acrfAnnotationGeometry.js`, `frontend/src/composables/useAcrfAnnotationDrag.js`, `frontend/src/components/FormDesignerTab.vue`, `frontend/src/components/VisitsTab.vue` |
| **Purpose** | Persist validated annotation offsets and convert them into Word floating-box `posOffset` values | Render the same aCRF annotation geometry in browser preview and persist vertical drag offsets back to `Form.annotation_positions` |

**Storage schema**:

```json
{
  "_form": { "y": -18 },
  "LBTESTCD": { "y": 25 }
}
```

- `annotation_positions` lives on the **Form** record as JSON / JSON-string content.
- The reserved key `_form` stores the form `domain` annotation offset.
- Every field annotation key is the field definition `variable_name`.
- Each value stores a single vertical offset `y`; Phase 1 does **not** persist horizontal movement.

**Units and clamp**:

```python
# backend/src/schemas/form.py / export_service.py
offset_y_01cm: int                     # signed integer in 0.01cm units
ANNOTATION_POSITION_MIN_Y = -200       # -2.00cm
ANNOTATION_POSITION_MAX_Y = 200        # +2.00cm
```

```javascript
// frontend/src/composables/acrfAnnotationGeometry.js
export const ANNOTATION_POSITION_MIN_Y = -200
export const ANNOTATION_POSITION_MAX_Y = 200
export const ACRF_ANNOTATION_EMU_PER_01CM = 3600
```

- `offset_y` MUST be a finite integer in **0.01cm** units.
- Backend schema validation and backend export both clamp to `[-200, 200]`.
- Frontend drag conversion must round to the nearest integer `0.01cm` unit before PATCH.

**Geometry / sign contract**:

```text
1in = 914400 EMU = 96 CSS px = 72 pt
1cm = 360000 EMU
0.01cm = 3600 EMU
defaultVerticalOffset = -120000 EMU
posOffset = defaultVerticalOffset + deltaY01cm * 3600
+deltaY means moving the annotation downward
```

- The export-side `wp:positionV/@posOffset` MUST use `default + Δy`, not `default - Δy`.
- The preview-side `top` CSS value MUST derive from the same formula after EMU→cm conversion.
- Frontend drag math uses the CSS absolute-unit identity `96 px = 1in`; do not replace it with device-pixel or zoom-dependent heuristics.

**Shared frontend/backend constants**:

- Visual constants that must evolve together: font size `8pt`, box height `0.7cm`, X padding `22860 EMU`, Y padding `18000 EMU`, border width `12700 EMU`, max width `4.6cm`, default vertical offset `-120000 EMU`.
- Frontend single source: `frontend/src/composables/acrfAnnotationGeometry.js`
- Backend single source: `backend/src/services/export_service.py`
- Validation/storage single source: `backend/src/schemas/form.py`

**Preview / export parity note**:

- Export annotations are floating text boxes (`w:drawing` / `wp:anchor`) and must not enter strict table text.
- `backend/src/services/word_table_parity.py` extracts only `Table.cell.text`; floating annotation text therefore stays outside strict table-field parity.
- Any preview JSON extractor used with `backend/scripts/compare_word_table_parity.py` MUST ignore `.wp-acrf-annotation` descendants and compare only the form / row / cell table text model.

**Synchronization Checklist**:
- [ ] Update `export_service.py` annotation constants and `posOffset` math together
- [ ] Update `schemas/form.py` validation when changing key semantics or clamp limits
- [ ] Update `acrfAnnotationGeometry.js` constants, unit conversions, and `resolveAnnotationTopCm`
- [ ] Keep `FormDesignerTab.vue` and `VisitsTab.vue` on the same `annotation_positions` storage shape and drag gate rules
- [ ] Run `backend/tests/test_export_acrf.py`, `backend/tests/test_export_service.py`, `backend/tests/test_export_unified.py`, `backend/tests/test_word_table_parity.py`
- [ ] Run `frontend/tests/acrfAnnotationGeometry.test.js`, `frontend/tests/acrfAnnotationPersistence.test.js`, `frontend/tests/acrfViewToggle.test.js`

---

### 7. Form Paper Orientation

**Contract ID**: `form-paper-orientation`

| Aspect | Backend | Frontend |
|--------|---------|----------|
| **Files** | `backend/src/models/form.py`, `backend/src/schemas/form.py`, `backend/src/database.py`, `backend/src/routers/forms.py`, `backend/src/services/project_clone_service.py`, `backend/src/services/project_import_service.py`, `backend/src/services/export_service.py` | `frontend/src/components/FormDesignerTab.vue`, `frontend/src/components/VisitsTab.vue` |
| **Purpose** | Persist per-form `paper_orientation`; honor it in Word export | Edit per-form orientation; render designer & visit preview with correct A4 geometry |

**Schema**:

```python
# Backend (models/form.py + schemas/form.py)
paper_orientation: Literal["auto", "landscape", "portrait"] = "auto"
```

- Lightweight migration in `backend/src/database.py` adds the column to legacy DBs with default `"auto"`.
- `project_clone_service.py` and `project_import_service.py` preserve / default the field when copying or importing old `.db` files.
- `export_service.py` consults the value to decide A4 landscape vs portrait per form section.

**Frontend resolution**:

```javascript
// FormDesignerTab.vue  /  VisitsTab.vue
const landscapeMode = resolveLandscape(form.paper_orientation, autoFallbackFlag)
// 'auto'      → fall back to content-driven decision
// 'landscape' → force landscape
// 'portrait'  → force portrait
```

- Designer: `selectedFormPaperOrientation` + `resolveLandscape` drive `.designer-scaled-word-page.landscape`.
- Visits preview: `resolvePreviewLandscape` + `previewLandscapeMode` drive the same CSS class on inline preview.
- Legacy `localStorage['crf_forceLandscape']` is migrated **once** to per-form settings on first load; do not reintroduce reads of the legacy global flag after migration.

**Contract Rules**:
1. The string set is closed: only `"auto" | "landscape" | "portrait"`. Adding a new value requires schema + migration + both UI sites + export.
2. Export decision MUST match the frontend `resolveLandscape` semantics for the same value; do not diverge "auto" behavior between preview and export.
3. CSS class is `.word-page.landscape` / `.designer-scaled-word-page.landscape` (see `frontend/src/styles/main.css` and `wordPageGeometry.test.js`). Renaming the class breaks the geometry contract.
4. Project clone / Word-`.docx` import / legacy `.db` import paths must preserve or default the field, never drop it.

**Synchronization Checklist**:
- [ ] Update `Form` model column + Pydantic schema
- [ ] Extend `database.py` lightweight migration for the new value (if expanding the enum)
- [ ] Update `forms.py` create/update routes
- [ ] Update `project_clone_service.py` & `project_import_service.py` field carry-over
- [ ] Update `export_service.py` orientation branch
- [ ] Update `FormDesignerTab.vue` (`selectedFormPaperOrientation`, `resolveLandscape`, edit radio-group)
- [ ] Update `VisitsTab.vue` (`resolvePreviewLandscape`, `previewLandscapeMode`)
- [ ] Run `backend/tests/test_form_paper_orientation.py`, `test_export_paper_orientation.py`, `test_project_copy.py`
- [ ] Run `frontend/tests/visitPreviewLandscape.test.js`, `wordPageGeometry.test.js`

---

### 8. Checkbox Field Type

**Contract ID**: `checkbox-field-type`

| Aspect | Backend | Frontend |
|--------|---------|----------|
| **Files** | `models/field_definition.py`, `schemas/field.py`, `services/field_rendering.py`, `services/export_service.py`, clone/import services | `useCRFRenderer.js`, `formDesignerPropertyEditor.js`, field/designer/preview components |
| **Purpose** | Persist and export a codelist-free single checkbox control | Edit and render the same virtual single checkbox control |

#### 1. Scope / Trigger

- Trigger: changing `field_type="复选"`, `checkbox_label`, checkbox rendering, default-value eligibility, codelist behavior, or its shared planner case.
- The type is a virtual single option with internal OID `1`; it is not a `CodeList` / `CodeListOption` feature and does not create option-level aCRF annotations.

#### 2. Signatures

```python
# Backend persistence / rendering
field_type: str = "复选"
checkbox_label: Optional[str]  # VARCHAR(255), nullable
resolve_checkbox_label(field_def) -> str
is_default_value_supported(form_field) -> bool
# export: "□" + resolve_checkbox_label(field_def)
```

```javascript
// Frontend rendering / layout
renderCtrl({ field_type: '复选', label, checkbox_label }) // `□${checkbox_label || label || ''}`
isChoiceField('复选') // false
isDefaultValueSupported('复选', inlineMark) // false
computeFieldControlWeight(field) // max(computeChoiceAtomWeight(text, false), FILL_LINE_WEIGHT)
```

#### 3. Contracts

- `checkbox_label || label || ''` is the sole text fallback on both stacks. An empty string is equivalent to no custom text; `label_override` never replaces checkbox control text.
- `codelist_id` is always `null`; the type MUST stay outside `isChoiceField()` and choice/default-value UI, validation, option loading, and codelist merge paths.
- A checkbox renders as a normal two-column field (`label | □text`), including preview and eCRF Word export. aCRF remains field-variable annotation only.
- Default values are forbidden even when `inline_mark` is true. The inline shortcut must not override the checkbox exclusion, or preview/export and planner text drift.
- Both planners use the marker-plus-resolved-text choice-atom weight and retain `FILL_LINE_WEIGHT` as the minimum. Add/change shared cases only in `frontend/scripts/generatePlannerFixtures.mjs`, then regenerate `backend/tests/fixtures/planner_cases.json`.
- `复选` is created only in the field library / form designer, never by DOCX import. It MUST stay out of `ai_review_service.VALID_FIELD_TYPES` (9 non-checkbox types), which both filters AI suggestions and validates `ai_overrides` at `routers/import_docx.py`; the frontend `docxAiSuggestionOverrides.js` `VALID_FIELD_TYPES` MUST stay byte-aligned with that list (locked by `frontend/tests/docxAiSuggestionAcceptance.test.js`). A `复选` override therefore fails closed with `400 不支持的字段类型`.
- Type-switch cleanup is enforced on BOTH stacks, not only the editor: the model `@validates("field_type")` clears `codelist_id` when switching to `复选` and clears `checkbox_label` when switching away, mirroring frontend `syncFieldTypeSpecificProps`. A partial `PUT` that changes only `field_type` must not leave stale type-specific data server-side.

#### 4. Validation & Error Matrix

| Condition | Expected behavior |
| --- | --- |
| `checkbox_label` is `null` or `""` | Render `□` plus field-definition `label`; no stored label copy is required. |
| Custom `checkbox_label` is present | Render `□` plus the custom text on preview/export; use that text for planner weight. |
| Create/update/clone/import receives a codelist ID | Persist/remap `None`; do not create, merge, or display codelist options. |
| Checkbox has `default_value`, including an inline field | Ignore it; default-value editor/renderer/weight must remain unavailable. |
| Short checkbox text | Planner demand is at least `FILL_LINE_WEIGHT` on both stacks. |
| Preview/export data adapter omits `label` or `checkbox_label` | Contract violation: fallback text or width becomes incorrect; pass both fields to the renderer. |
| DOCX import `ai_overrides` sends `field_type="复选"` | Fail closed with `400 不支持的字段类型`; `复选` is not a DOCX-admissible type on either stack. |
| `PUT /field-definitions/{id}` switches `复选` → other type | Model validator clears `checkbox_label` server-side even when the payload omits it. |

#### 5. Good / Base / Bad Cases

- **Good**: `{field_type: '复选', label: '已签署', checkbox_label: '本人已确认'}` renders `□本人已确认`, has null codelist, and uses that atom's shared planner weight.
- **Base**: `{field_type: '复选', label: '已签署', checkbox_label: null}` renders `□已签署` and uses the same fallback for export and width planning.
- **Bad**: add `复选` to `isChoiceField()` or let `inline_mark` make its default value usable; this routes a virtual control into dictionary/default-value behavior and causes preview/export drift.

#### 6. Tests Required

- Backend: field-definition API rejects/clears a codelist for `复选`, enforces nullable/max-255 `checkbox_label`, and preserves it through copy/import.
- Backend: `test_docx_import_contract.py` asserts a `复选` `ai_overrides` is rejected with `400`, and that legal overrides still map to the real field index after a log row.
- Backend: `test_width_planning.py` asserts fallback/custom choice-atom weight and ignores inline default text; export tests assert literal `□` plus resolved text and no option OID annotation.
- Frontend: `frontend/tests/checkboxFieldType.test.js` asserts rendering/HTML escaping, `isChoiceField === false`, default-value exclusion with `inlineMark=true`, type-switch cleanup, preview adapters, and the fixture generator case.
- Shared planner: regenerate with `node frontend/scripts/generatePlannerFixtures.mjs`; run `backend/tests/test_width_planning.py` and `frontend/tests/columnWidthPlanning.test.js`.

#### 7. Wrong vs Correct

**Wrong**

```javascript
if (inlineMark) return true // makes every inline type default-value capable
if (isChoiceField(fieldType)) return renderChoice(field)
```

**Correct**

```javascript
if (fieldType === '复选') return false // before the inline default-value shortcut
if (fieldType === '复选') return `□${checkboxLabel || label || ''}`
```

---

## How to Maintain Cross-Stack Contracts

### Before Changing Contract Code

1. **Search both stacks**:

```bash
# Search for the constant/function name
grep -r "WEIGHT_CHINESE" backend/ frontend/
grep -r "SAFE_OFFSET" backend/ frontend/
```

2. **Read both implementations**:

```bash
cat backend/src/services/width_planning.py
cat frontend/src/composables/useCRFRenderer.js
```

3. **Run tests on both sides**:

```bash
cd backend && python -m pytest tests/test_width_planning.py
cd frontend && node --test tests/columnWidthPlanning.test.js
```

### After Changing Contract Code

1. **Update shared fixtures** (if applicable)
2. **Run full test suite on both stacks**
3. **Update this index if contract changes**

---

## Adding New Cross-Stack Contracts

When creating a new cross-stack contract:

1. **Create shared fixture** in `backend/tests/fixtures/`
2. **Document in this index** with:
   - Contract ID
   - Backend file
   - Frontend file
   - Shared constants/functions
   - Synchronization checklist
3. **Add tests** that use shared fixture on both sides

---

## Quick Reference

| Contract | Backend File | Frontend File | Shared Fixture |
|----------|--------------|---------------|----------------|
| Width Planning | `services/width_planning.py` | `useCRFRenderer.js` | `planner_cases.json` |
| Ordering | `services/order_service.py` | `useOrderableList.js` | None |
| Auth Token | `services/auth_service.py` | `App.vue` | None |
| Preview / Export Parity | `services/export_service.py`, `services/width_planning.py`, `services/word_table_parity.py` | `useCRFRenderer.js`, `formFieldPresentation.js`, preview components, `styles/main.css` | Strict comparator JSON + exported `.docx` |
| Form Paper Orientation | `models/form.py`, `schemas/form.py`, `database.py`, `routers/forms.py`, `services/export_service.py` (+ clone/import) | `components/FormDesignerTab.vue`, `components/VisitsTab.vue` | None |

---

## Common Mistakes

### 1. Updating Only One Side

```python
# WRONG - Only backend updated
WEIGHT_CHINESE = 3  # Changed in backend only
```

```javascript
// Frontend still has old value
const WEIGHT_CHINESE = 2  // MISMATCH!
```

### 2. Not Running Tests on Both Stacks

```bash
# WRONG - Only backend tests
cd backend && python -m pytest

# CORRECT - Both stacks
cd backend && python -m pytest tests/test_width_planning.py
cd frontend && node --test tests/columnWidthPlanning.test.js
```

### 3. Changing Shared Fixture Format Without Updating Tests

```json
// WRONG - Changed fixture format
{ "name": "case1", "input": [...], "expected": [...] }

// Tests still expect old format
const { fields, expectedFractions } = testCase  // FAILS
```

---

## Tests Required

When modifying cross-stack contracts, run:

| Contract | Backend Test | Frontend Test |
|----------|--------------|---------------|
| Width Planning | `tests/test_width_planning.py` | `tests/columnWidthPlanning.test.js` |
| Ordering | `tests/test_ordering.py` | Manual E2E verification |
| Auth Token | `tests/test_auth.py` | `tests/App.test.js` |
| Preview / Export Parity | `tests/test_export_unified.py`, `tests/test_export_service.py`, `tests/test_width_planning.py`, `tests/test_word_table_parity.py` | `tests/columnWidthPlanning.test.js`, `tests/wordPageGeometry.test.js`, `tests/formFieldPresentation.test.js` + strict comparator + manual A4 side-by-side when available |
| Form Paper Orientation | `tests/test_form_paper_orientation.py`, `tests/test_export_paper_orientation.py`, `tests/test_project_copy.py` | `tests/visitPreviewLandscape.test.js`, `tests/wordPageGeometry.test.js` |
