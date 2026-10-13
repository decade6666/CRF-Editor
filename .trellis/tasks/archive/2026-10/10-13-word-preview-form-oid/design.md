# Design — Form OID in Paper-Preview Titles

## Boundary and Data Flow

Use the already-loaded authoritative `form.code`; no API/database changes. Designer uses `selectedForm.code`; visits uses its resolved `formPreviewForm.code`, not the incoming visits row. The title OID is independent of aCRF mode and appears only in full editing mode.

Production edit points:

1. Add a small presentational `frontend/src/components/FormPreviewOid.vue` used by both paper-title hosts.
2. `DesignerWordPreview.vue` adds a Boolean `showFormOid` mode prop and the shared OID element beside its existing name element.
3. `FormDesignerTab.vue` passes the full-mode gate to **both** existing preview tags, outside the unchanged 14-function `previewHandlers` object.
4. `VisitFormPreviewDialog.vue` inserts the same OID component beside the existing paper-name element, gated by its injected edit-mode value.
5. Shared title-row flow/spacing is placed in the existing Word-preview section of `main.css`; do not duplicate a second annotation-style system in either host.

No Word-export title/TOC change, toolbar duplication, template/import-screenshot change, or new title-state owner.

## Small Presentation Primitive

`FormPreviewOid.vue` accepts the code (nullable/empty allowed), derives a trimmed display value without mutating it, renders nothing for absent/blank input, and displays `OID: <code>` using normal Vue text interpolation. It has no API access, storage, cache, emits, drag, editing or domain inference.

Keep it small and feature-specific. Do not introduce a generic title framework or color/identifier validation layer. The API already validates the code; this component only formats a nullable display value. HTML-like synthetic test input must remain literal text.

## DOM and Layout Contract

- Keep `<div class="wp-form-title">original form name</div>` and its left-aligned 14pt/bold/black typography unchanged.
- Add the OID as a **sibling** in `.wp-form-title-row`, not inside the raw name's text. This preserves identity capture for `.wp-form-title` and strict table-field parity.
- Make the left portion of the existing title row a baseline-aligned wrapping flow with a small named/CSS spacing value. Preserve its relative positioning, minimum height, and right 4.8cm domain-marker reserve. The existing domain float remains out of flow and keeps its anchor.
- Short names/codes appear next to each other; long content wraps within the available left area and never paints into the reserved domain area. Do not use table-width shrinkage, heading centering or absolute-positioned OID text.
- The OID remains dark on white paper in both application themes. Use a paper-specific CSS color variable for its text, not a theme text color that becomes light on the white sheet. Inherit the Word-preview typeface; do not add fonts/dependencies.
- Do not apply R1's float alpha to title OID text; this is normal paper metadata, not a variable/domain float.
- Preserve no-form/loading/error title behavior and every existing annotation call site/resizer/handler.

## Mode Matrix

| Editing/view mode | Paper title OID | Existing aCRF floats |
| --- | --- | --- |
| Full + eCRF | Yes, when code exists | No |
| Full + aCRF | Yes, when code exists | Existing gate, with R1 fill if integrated |
| Brief | No | Existing normalization to eCRF; no floats |
| Code absent/blank | No OID element | Existing domain/field behavior unchanged |

The stateless designer's explicit data/mode-prop contract gains one Boolean (6→7), while all 14 parent-owned function props and both scopes remain unchanged. Update the relevant extraction-spec signature/count and source guard together during the documentation phase.

## Test Design

- New `frontend/tests/component/FormPreviewOid.spec.js`: normal code, null/undefined/empty/whitespace omission, trimming, safe literal HTML-like text, and long-code structure, all under the existing Vue-warning gate.
- `DesignerWordPreview.spec.js`: both `main`/`designer` scopes; independent `showFormOid` versus `showAcrfAnnotations` combinations; different `code`/`domain`/field variable; unchanged raw name text and existing no-form/marker cases.
- `VisitFormPreviewDialog.spec.js`: authoritative response code is used at first open and after reopen; full-mode eCRF/aCRF and brief-mode gates; existing loading/errors/PATCH/close paths unchanged. Mock external API only, not the presentation code under test.
- `designerPreviewSplit.test.js`: each actual parent tag passes the new full-mode prop. Keep two scopes, 14 handlers, 8 marker sites and no moved parent state.
- `visitPreviewSplit.test.js` and `wordPageGeometry.test.js`: retain parent/dialog ownership, title typography/alignment, page/table geometry and marker-style single ownership. Add a narrow shared-row layout rule assertion if useful; source tests cannot prove real layout.

## Real-Browser Integration

Use authorized synthetic fixtures or an authorized app session; do not generate hidden credentials or use clinical data. Check main/fullscreen/visits with short/long names/codes, missing code, code different from domain, both orientations, both full view modes, brief mode and dark/light theme. At normal A4 zoom inspect actual bounding rectangles/wrapping and the domain-marker reserve, then verify table content/widths and drag/reset remain unchanged with R1 applied.

A browser-mounted fixture proves that component rendering path, not a complete authenticated E2E flow. If login/viewer/permissions block verification, report the exact blocked scope. No real-browser validation has occurred during planning.

## Rollback Shape

A scoped reversal removes the OID component references/new mode prop/shared-row flow and restores the prior preview title; no data migration or exported-Word rollback is needed. Preserve unrelated work and recoverable backups; no destructive reset/clean or unconfirmed removal of evidence/worktrees.
