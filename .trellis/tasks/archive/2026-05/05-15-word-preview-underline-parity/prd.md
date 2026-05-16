# Align Word Preview Trailing-Underscore Rendering with Export

## Goal

Fix the visual mismatch between the on-screen Word preview and exported `.docx` output for choice options with `trailing_underscore` enabled, then verify adjacent Word preview/export visual contracts so users can trust the preview before exporting.

## What I already know

* User observed that the form Word preview differs from the exported Word file, likely around the option "后加下划线" behavior.
* This project already documents a cross-stack contract named `preview-export-parity` in `.trellis/spec/guides/cross-stack-contracts.md`.
* The backend export is the authoritative target for `.docx` rendering:
  * `backend/src/services/export_service.py:2606` renders vertical trailing options as `label + " " + "_" * 6`.
  * `backend/src/services/export_service.py:2692` renders horizontal trailing options the same way.
  * `backend/src/services/export_service.py:2720` returns `label______` for text-based choice labels when using the simpler render path.
* The frontend preview currently diverges from that contract:
  * `frontend/src/composables/useCRFRenderer.js:337` uses `safeLength * 0.55em`; the documented calibrated value is `0.5em`.
  * `frontend/src/composables/useCRFRenderer.js:409` renders choice trailing fill-line HTML with `buildFillLineHtml(12)`; export uses six underscores.
  * `frontend/src/composables/useCRFRenderer.js:468` renders the plain-text path with 20 underscores; export uses six underscores.
* The preview has two independent frontend render paths that both need parity:
  * `renderCtrlHtml -> renderChoiceHtml`.
  * `renderCtrl -> toHtml`.
* Existing tests cover backend export NBSP + six underscores in `backend/tests/test_export_unified.py:892` and `backend/tests/test_export_unified.py:946`.
* Existing frontend tests cover planner weight, but do not directly lock the preview HTML/text trailing-underscore literal or visual estimator.
* Existing uncommitted documentation already describes the intended contract in `.trellis/spec/frontend/component-guidelines.md` and `.trellis/spec/guides/cross-stack-contracts.md`.

## Assumptions (temporary)

* The backend export behavior is correct and should not be changed for this fix.
* The frontend should be changed to match the backend and the documented contract.
* The planner constant `FILL_LINE_WEIGHT = 6` should remain unchanged because this is a visual rendering mismatch, not a column-demand contract change.
* The consistency check should focus on the existing Word preview/export parity surface rather than attempting a full pixel-perfect Word renderer rewrite.

## Open Questions

* None.

## Decisions

* Scope selected by user: targeted parity fix + adjacent contract sweep. This includes fixing the trailing-underscore mismatch, adding direct frontend tests, running related backend/frontend contract tests, and doing a source-level sweep of existing Word preview/export parity contracts without introducing broad visual baseline tooling.

## Requirements (evolving)

* Align choice option `trailing_underscore` preview rendering with exported `.docx` rendering:
  * HTML render path uses a six-underscore-equivalent fill line.
  * Plain-text render path uses exactly six literal underscores before `toHtml` conversion.
  * Fill-line visual estimator uses the documented `0.5em` per underscore calibration.
* Preserve backend export semantics: NBSP joins label and six underscores as an unbreakable choice atom.
* Preserve planner constants and column width contracts unless a failing test proves a planner mismatch.
* Add or update frontend source-level tests so both preview render paths and the visual estimator are locked.
* Run targeted backend/frontend tests for preview/export parity and adjacent contracts.
* Inspect adjacent Word preview/export visual contracts already documented: title alignment, A4 geometry, table fixed layout, default text fill-line, inline/unified column width planning, and form orientation.

## Acceptance Criteria (evolving)

* [ ] `renderChoiceHtml` emits a trailing fill-line equivalent to six underscores for options with `trailing_underscore`.
* [ ] `renderCtrl` emits `${option.text}______` for options with `trailing_underscore`.
* [ ] `buildFillLineHtml(6)` computes `min-width:3.0em` under the `0.5em` estimator.
* [ ] Backend export tests still assert `label ______` for horizontal and vertical choice options.
* [ ] Frontend tests lock the two preview render paths and fill-line estimator.
* [ ] Adjacent parity tests pass: column width planning, Word page geometry, field presentation, and backend export regressions.
* [ ] Any manual or browser-based visual check that cannot be performed is reported explicitly.

## Definition of Done (team quality bar)

* Tests added/updated where behavior changes.
* Targeted backend `pytest` checks pass.
* Targeted frontend `node --test` checks pass.
* UI preview path is manually verified if the local environment supports running the frontend and opening the page.
* No unrelated refactor or new abstraction.
* Docs/spec updates only if implementation reveals the current documented contract is incomplete or wrong.

## Expansion Sweep

### Future evolution

* The preview/export parity surface may need fixture-driven visual examples if users continue to report subtle Word mismatches.
* A future browser or screenshot-based comparison could become useful, but it is heavier than the immediate fix.

### Related scenarios

* Choice options appear in designer preview, visit preview, simulated CRF rendering, and template preview paths; both render pipelines must stay aligned.
* Existing contracts for A4 geometry, title alignment, table layout, column widths, and form orientation should remain green while fixing trailing underscores.

### Failure and edge cases

* Fixing only `renderChoiceHtml` leaves `renderCtrl -> toHtml` still too wide in inline table paths.
* Changing `FILL_LINE_WEIGHT` or backend export literals would expand the contract unnecessarily and risk column width regressions.
* A source-level test can lock string/HTML semantics, but pixel-perfect Word comparison may still require manual side-by-side validation.

## Proposed MVP Scope

**Recommended**: targeted parity fix + adjacent contract sweep.

* Fix the three frontend divergences identified above.
* Add frontend tests for the two preview render paths and estimator.
* Run existing backend export tests and frontend Word/field/column tests.
* Inspect related preview/export code paths for obvious drift without broad redesign.

## Out of Scope (explicit)

* Rewriting Word preview rendering architecture.
* Changing exported `.docx` semantics unless a regression test proves backend behavior is wrong.
* Introducing pixel-diff infrastructure or screenshot baseline tooling in this task.
* Broad UI redesign unrelated to Word preview/export parity.

## Technical Notes

* Relevant frontend source: `frontend/src/composables/useCRFRenderer.js`.
* Relevant backend source: `backend/src/services/export_service.py`.
* Relevant tests: `frontend/tests/columnWidthPlanning.test.js`, `frontend/tests/formFieldPresentation.test.js`, `frontend/tests/wordPageGeometry.test.js`, `backend/tests/test_export_unified.py`, `backend/tests/test_width_planning.py`, `backend/tests/test_export_paper_orientation.py`.
* Relevant docs/specs: `.trellis/spec/guides/cross-stack-contracts.md`, `.trellis/spec/frontend/component-guidelines.md`.

## Implementation Plan (after confirmation)

1. Add failing frontend tests for trailing-underscore preview parity in both render paths and for `0.5em` fill-line calibration.
2. Apply the minimal frontend fix in `useCRFRenderer.js`.
3. Run targeted frontend tests, then backend export/width/orientation tests.
4. Do a final source-level sweep of adjacent preview/export contracts and report any unverified manual visual checks.

## Screenshot Differential Analysis

### Evidence

* Preview screenshot: `image/word预览-2026-05-16_133855.png`.
* Export screenshot: `image/word导出-2026-05-16_133859.png`.
* The remaining visual difference is broader than the trailing-underscore count. The screenshots show differences in page structure, row height, pagination, and at least one table column width.

### Observed differences

| Area | Preview screenshot | Export screenshot | Likely cause |
| --- | --- | --- | --- |
| Form title | No `9. 生命体征` title visible | Word heading `9. 生命体征` visible | Full-screen designer preview path does not render `.wp-form-title`; export always calls `doc.add_heading(...)`. |
| Pagination | Six data rows appear in one preview page | Four rows on page 1 and two rows on the next page | Frontend preview is a scrollable CSS page; Word export uses real section/page/footer layout and available page height. |
| Row height | Main table data rows are visually shorter | Main table data rows are taller | Frontend uses CSS cell padding; export uses Word paragraph spacing `space_before=5.25pt`, `space_after=5.25pt`, `line_spacing=1.0`. |
| Main table column width | The `结果` column is visibly wider | The `结果` column is narrower | Preview may be using persisted designer column ratios while export may be using planner defaults or missing the same `column_width_overrides`. |
| Formatting marks | Not shown | Word/WPS paragraph marks are visible | Viewer setting in Word/WPS, not actual document content. |
| Trailing underscore | Six-underscore-equivalent line after the recent fix | Six literal `_` characters in Word | Count is now aligned, but CSS border rendering and Word glyph rendering can still differ slightly. |

### Screenshot measurement notes

* Main table column ratios measured from the screenshots:
  * Preview: `[0.128, 0.116, 0.139, 0.093, 0.186, 0.094, 0.244]`.
  * Export: `[0.134, 0.122, 0.098, 0.098, 0.195, 0.098, 0.256]`.
* The largest measured column drift is the `结果` column: preview is about `13.9%`, export about `9.8%`.
* Data row height is also different: preview rows are roughly shorter than exported Word rows, matching the CSS-vs-Word paragraph spacing mismatch.

## Confirmed Follow-up Modification Items

### P0 - Structural parity fixes

1. Add the form title to the full-screen designer Word preview.
   * Files to modify:
     * `frontend/src/components/FormDesignerTab.vue`
     * `frontend/tests/formFieldPresentation.test.js` or `frontend/tests/wordPageGeometry.test.js`
   * Expected behavior:
     * The full-screen designer preview renders `.wp-form-title` when `selectedForm` exists.
     * The preview title remains left-aligned, matching Word export Heading-1 default alignment.
   * Validation:
     * Add a source-level frontend test that locks the title in the full-screen designer preview path.

2. Record that true Word pagination is not currently simulated by the frontend preview.
   * Files to modify:
     * This PRD and, if promoted to a stable contract, `.trellis/spec/guides/cross-stack-contracts.md`.
   * Expected behavior:
     * The current task does not claim pixel-perfect page breaking.
     * Browser A4/landscape preview vs Word 100% visual comparison remains a manual validation step.

### P1 - Visual density and column-width parity fixes

3. Align frontend Word preview row height with exported Word paragraph spacing.
   * Files to inspect or modify:
     * `frontend/src/styles/main.css`
     * `frontend/tests/wordPageGeometry.test.js`
   * Backend reference:
     * `backend/src/services/export_service.py` sets Word paragraph spacing around table cell content with `space_before=5.25pt`, `space_after=5.25pt`, and `line_spacing=1.0`.
   * Expected behavior:
     * Preview table rows become closer to exported Word row height.
     * The adjustment should be source-level tested so the row-height contract does not drift silently.
   * Risk:
     * This affects all Word preview tables and must be checked against title alignment, A4 geometry, field presentation, and column width tests.

4. Verify and, if needed, fix the persisted column-width override path used by export.
   * Files to inspect or modify:
     * `frontend/src/App.vue`
     * `frontend/src/components/FormDesignerTab.vue`
     * `frontend/tests/columnWidthPlanning.test.js`
     * `backend/tests/test_export_column_width_override.py`
   * Expected behavior:
     * Ratios saved as `crf:designer:col-widths:<form_id>:<kind>:fieldIds=<ordered-field-ids>` are sent to `POST /api/projects/{project_id}/export/word` as `column_width_overrides`.
     * Backend export applies the same ratios via `_get_column_width_override_by_instance_id`.
   * Validation:
     * Add or update tests proving the new key format is collected by export and accepted by backend export.
   * Risk:
     * If the export button is used while `FormDesignerTab` is not mounted or has no forms loaded, `collectColumnWidthOverrides(forms)` may not include the current form's persisted ratios. This should be confirmed before changing behavior.

### P2 - Trailing-underscore rendering fine tuning

5. Decide whether preview trailing fill-lines should remain CSS border spans or switch to literal `_` glyphs.
   * Current state:
     * Frontend HTML path renders `buildFillLineHtml(6)`.
     * Frontend plain-text path renders six literal underscores before `toHtml` conversion.
     * Backend export renders six literal `_` characters joined to the label with NBSP.
   * Options:
     * Keep CSS border spans: cleaner continuous line in browser, but not identical to Word glyph rendering.
     * Use literal `_` glyphs in preview: closer to Word export glyph behavior, but browser rendering may show broken or uneven underline characters.
   * Recommendation:
     * Defer this until P0/P1 are fixed and new screenshots are captured. The current evidence suggests structure, row height, and column-width drift are larger than the remaining underscore glyph difference.

## User-Confirmed Follow-up Scope

Confirmed on 2026-05-16:

1. P0 structural scope: only record the current pagination/footer limitation. Do not implement full-screen designer preview title parity in this slice.
2. P1 row-height scope: test first, then make a narrow CSS adjustment if the test proves the current preview row-height contract is too far from Word export spacing.
3. P1 column-width scope: trace the localStorage → export payload → backend override chain before changing behavior.
4. P2 trailing-underscore scope: defer glyph-vs-border tuning until P0/P1 differences are reduced and screenshots are re-captured.

## Follow-up Implementation Order

1. Record the pagination/footer limitation so this task does not claim pixel-perfect Word page breaking.
2. Add a source-level row-height contract test, then tune `.word-page td` only if needed.
3. Trace one concrete persisted column-width key through export payload collection and backend override application before changing code.
4. Re-capture preview/export screenshots after P1 changes.
5. Re-evaluate the underscore glyph-vs-border decision only after the above structural differences are removed.

## Column-Width Override Chain Trace

### Confirmed chain segments

* Designer persistence writes new-format keys through `useColumnResize`: `crf:designer:col-widths:<form_id>:<kind>:fieldIds=<ordered-field-ids>`.
* `frontend/src/App.vue` collects matching keys into request body shape `{ column_width_overrides: { "kind:fieldIds=...": [...] } }`.
* `backend/src/routers/export.py` accepts `column_width_overrides` from the POST body and passes it to `ExportService.export_project_to_word(...)`.
* `backend/src/services/export_service.py` resolves new-format keys through `_get_column_width_override_by_instance_id` and applies them to normal / inline / unified table builders.
* Backend validation run: `python3 -m pytest tests/test_export_column_width_override.py -q` -> `7 passed, 1 xfailed`.

### Potential frontend gap to verify before fixing

* `App.vue` currently collects overrides from `formDesignerTabRef.value?.getForms?.() || []`.
* `FormDesignerTab` is lazy-mounted only after the `designer` tab is activated.
* If the user exports while the `designer` tab has never been activated, `getForms()` can be unavailable and `collectColumnWidthOverrides(forms)` receives an empty list, so persisted ratios in localStorage are ignored.
* This gap can explain a preview/export column drift when the preview uses a persisted ratio but the export request falls back to planner defaults.

### Recommended next action for this gap

Before changing behavior, capture or test the concrete UI path:

1. Save a column ratio under `crf:designer:col-widths:<form_id>:inline:fieldIds=...`.
2. Export once after opening the designer tab and once without activating the designer tab.
3. Compare the request payload and exported table grid widths.
4. If the no-designer-tab export omits overrides, add a narrow frontend fallback that loads the project form list before collecting persisted ratios.
