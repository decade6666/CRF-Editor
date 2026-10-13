# Bounded Source Excerpt — Preview Geometry and aCRF Offsets

> Context-injection snapshot from `.trellis/spec/guides/cross-stack-contracts.md` at planning base `20e8ee5`, 2026-10-13. The original file is ~92KB and is truncated by the 32KB injection limit. This bounded research excerpt is not a new spec: the original remains authoritative. Read the cited original ranges if it changes or a needed rule is missing; refresh this snapshot after relevant spec updates. New fill opacity is specified by the current task PRD/design, not by altering this baseline excerpt.

## §5 Relevant Constraints — Original Lines 431–461

- Structure/log-row shading remains solid. The existing structure-row style must not acquire an alpha suffix; default gray applies only to log rows, not label rows.
- `.wp-form-title` stays left-aligned; Word Heading-1 uses left alignment. Preview table cells keep the existing 5.25pt / 1.0 rhythm.
- Merged-cell extraction collapses duplicate `cell._tc` aliases; logical cells, not aliases, determine denominators.
- Body/field rendering changes require corresponding frontend/backend renderer tests and strict parity. This task must not change those renderers or width planners just to add appearance/metadata.
- Relevant validation: backend export/unified/width/parity tests and frontend `wordPageGeometry`, `formFieldPresentation`, `designerPreviewSplit`, `visitPreviewSplit`, `DesignerWordPreview`/`VisitFormPreviewDialog` mount tests. Real preview/Word A4 100% side-by-side checks are separate from source tests.
- Any existing fixture mismatch must be baselined by actual execution; do not present the spec's historical fixture expectation as measured current evidence.

## §6 Exact Normative Baseline — Original Lines 498–579

### 6. aCRF Annotation Geometry

**Contract ID**: `acrf-annotation-geometry`

| Aspect | Backend | Frontend |
|--------|---------|----------|
| **Files** | `backend/src/services/export_service.py`, `backend/src/schemas/form.py` | `frontend/src/composables/acrfAnnotationGeometry.js`, `frontend/src/composables/useAcrfAnnotationDrag.js`, `frontend/src/components/FormDesignerTab.vue` (annotation state, drag gate, persistence owner), `frontend/src/components/DesignerAcrfAnnotation.vue` (per-marker markup + styles; presentational, no target prop; since `visits-preview-split` 2026-10-12 the single owner of the annotation marker CSS — the VisitsTab copy was deleted), `frontend/src/components/DesignerWordPreview.vue` (designer annotation call sites), `frontend/src/components/VisitFormPreviewDialog.vue` (visits preview host: annotation call sites + own `useAcrfAnnotationDrag` instance, mounted by the bridge-only `VisitsTab.vue`), `frontend/src/composables/useVisitPreviewAnnotation.js` (visits-side annotation glue: target construction, styles, drag gate, flush/dispose) |
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
defaultVerticalOffset = -26940 EMU
posOffset = defaultVerticalOffset + deltaY01cm * 3600
+deltaY means moving the annotation downward
```

- Default vertical offset centers the `0.7cm` box on the cell's single text line: `-(Cm(0.7)=252000 - Pt(15.6)=198120)/2 = -26940 EMU` (updated 2026-07-14 from the previous `-120000`; no migration of stored `annotation_positions.y` — already-customized offsets shift with the new baseline).

- The export-side `wp:positionV/@posOffset` MUST use `default + Δy`, not `default - Δy`.
- The preview-side `top` CSS value MUST derive from the same formula after EMU→cm conversion.
- Frontend drag math uses the CSS absolute-unit identity `96 px = 1in`; do not replace it with device-pixel or zoom-dependent heuristics.

**Shared frontend/backend constants** (2026-10-13 R1 execution refreshed: added background fill opacity):

- Visual constants that must evolve together: font size `8pt`, box height `0.7cm`, X padding `22860 EMU`, Y padding `18000 EMU`, border width `12700 EMU`, max width `4.6cm`, default vertical offset `-26940 EMU`, background fill opacity `0.25` (`ACRF_ANNOTATION_BACKGROUND_OPACITY`; Word writes `<a:alpha val="25000"/>` — opacity × 100000 — beneath the annotation shape fill color only; annotation text and border, and the reset control's own state opacities, stay unchanged).
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
- [ ] Keep `FormDesignerTab.vue` (drag gate, target resolution, PATCH) and `VisitFormPreviewDialog.vue` + `useVisitPreviewAnnotation.js` (visits-side drag gate, target resolution, PATCH — extracted from `VisitsTab.vue` in `visits-preview-split`) on the same `annotation_positions` storage shape and drag gate rules; `DesignerAcrfAnnotation.vue` stays presentational and never computes offsets, and is the single owner of the annotation marker CSS (do not re-add a copy in a host component)
- [ ] Run `backend/tests/test_export_acrf.py`, `backend/tests/test_export_service.py`, `backend/tests/test_export_unified.py`, `backend/tests/test_word_table_parity.py`
- [ ] Run `backend/tests/test_acrf_offset_consistency.py`: the frontend-exported `ACRF_ANNOTATION_DEFAULT_VERTICAL_OFFSET_EMU` must equal the backend constant; changing either side alone must fail this test.
- [ ] Run `frontend/tests/acrfAnnotationGeometry.test.js`, `frontend/tests/acrfAnnotationPersistence.test.js`, `frontend/tests/acrfViewToggle.test.js`, `frontend/tests/component/DesignerAcrfAnnotation.spec.js`, `frontend/tests/visitPreviewSplit.test.js`, `frontend/tests/component/VisitFormPreviewDialog.spec.js`
