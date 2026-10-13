# Design — Background-Only aCRF Translucency

## Boundary

R1 changes fill appearance only. The three production edit points are the shared frontend geometry/style builder, shared marker CSS, and existing Word floating-textbox helper. No API/database/import/copy schema, layout planner, anchor, size, drag range, or persistence semantics change. All current marker kinds use the same value.

## Browser Flow

1. Add an immutable named `ACRF_ANNOTATION_BACKGROUND_OPACITY = 0.25` beside the existing palette in `frontend/src/composables/acrfAnnotationGeometry.js`.
2. Have `buildAnnotationStyle` emit `--acrf-annotation-background` as an RGBA color derived from the existing `ACRF_ANNOTATION_BACKGROUND_COLOR` and that opacity. Reuse any directly applicable existing formatter; do not introduce a generic color/configuration framework for a fixed internal palette.
3. `DesignerAcrfAnnotation.vue` consumes that variable for **background only**. Keep text/outline colors, font, geometry, and pointer/reset CSS unchanged. The caller already uses this builder for designer canvas/fullscreen and visits markers; do not add caller-specific alpha variants.
4. Never set root `opacity: 0.25`: it would fade annotation glyphs, border and controls as well. Existing reset `opacity: 0` while hidden and disabled opacity remain valid; preserving opacity does not mean forcing every control state to 1.

## Word Flow

Mirror the named opacity as 0.25 in `backend/src/services/export_service.py`; compute the positive fixed-percentage value as 25000. Keep the existing DrawingML helper and add a single alpha transform under the **shape-fill color only**:

```xml
<wps:spPr>
  <a:solidFill>
    <a:srgbClr val="FFF2F2">
      <a:alpha val="25000"/>
    </a:srgbClr>
  </a:solidFill>
</wps:spPr>
```

The element must not be added to `a:ln`, text color/runs, other document shapes, or body-cell shading. Keep `wrapNone`, `allowOverlap`, paragraph/column-relative anchoring, font, dimensions, and `default + deltaY` unchanged. No SVG/image substitution or .NET dependency is required.

## Contracts and Compatibility

| Item | Required behavior |
| --- | --- |
| Color/opacity | Existing pale-red color; 25% opacity in browser and Word |
| Form/field/header markers | Same helper/palette, not three implementations |
| Reset/drag | Existing events, visibility, save queue, range and reset semantics |
| Stored offsets | Existing variable-name keys and `_form`, integer 0.01cm y units; no migration or normalization change |
| Body/table/page geometry | Unchanged; no annotation rows, padding expansion, text shrink or width planning change |
| eCRF | No annotation/fill-alpha change |
| Existing structure-row shading | Remains solid under cross-stack §5; alpha applies only to marker fill |

Update cross-stack §6 with the appearance constant and CSS/Word alpha correspondence during the documentation phase, not by restating the full contract in root/module context files.

## Test Design

- Extend `frontend/tests/acrfAnnotationGeometry.test.js` to assert the new named constant/background variable and unchanged box metrics/offsets; retained persistence tests cover unchanged y/reset behavior.
- Extend `frontend/tests/component/DesignerAcrfAnnotation.spec.js` for each marker kind: style-variable passthrough, full-strength text/outline, unchanged pointerdown/reset; add a narrow CSS contract assertion that the background consumes the variable and the root has no whole-element alpha.
- Extend `backend/tests/test_export_acrf.py`: add DrawingML namespace `a` to its XML selectors, require exactly one fill alpha 25000 per generated annotation shape, no line/text alpha, and unchanged annotation text/red glyph color. Retain existing table/offset and eCRF assertions.
- Explicitly set portrait/landscape in fixtures; a test named `mixed_landscape` is not evidence of explicit orientation coverage by itself.
- Preserve a deterministic synthetic before-change export outside Git. Compare canonical `word/document.xml` after removing only the newly introduced annotation-fill alpha nodes. Normalize only formatting whitespace introduced in that fill subtree; preserve visible `w:t` text and `xml:space` semantics. This is stronger geometry evidence than field-text parity alone; avoid ZIP timestamps/core properties as an equality oracle. Keep baseline data, heading names and TOC options deterministic.

## Rendered Validation and Limits

Use synthetic, nonclinical fixtures for short/long names, ordinary/header/domain markers, pre-existing overlaps, saved offsets and both orientations. In a real browser verify computed background alpha and unchanged marker/body rectangles. In desktop Word inspect the same annotation backgrounds, original tables, and print/PDF appearance when available.

Word format support is documented, but no Word/WPS/LibreOffice rendering has been performed in planning. A LibreOffice result is not a Microsoft Word result. If access/credentials/viewer capability blocks verification, report the exact scope not run and keep that visual acceptance item pending; do not silently create live credentials or substitute source assertions as visual proof.

## Rollback Shape

Because data and geometry do not change, a scoped reversal of the appearance edits restores the original fill without migration. During execution use recoverable task-scoped backups/diff reversal; do not reset/clean, discard unrelated edits, remove temporary evidence, or delete branches without the required authorization.
