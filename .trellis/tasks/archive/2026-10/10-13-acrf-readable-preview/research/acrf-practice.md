# Research: Common aCRF Annotation Placement and Current Project Behavior

## Scope and Evidence Level

Read-only research on 2026-10-13, against project baseline `20e8ee5`. No application, real clinical data, exported real document, or credentials were accessed. No browser or Word rendering was performed. Code conclusions below describe implementation, not a visually reproduced bug or proven renderer compatibility.

## Public Sources

1. **FDA, Study Data Technical Conformance Guide, October 2026**, section 4.1.4.6, PDF page 51.
   - https://www.fda.gov/media/153632/download#page=51
   - Landing page: https://www.fda.gov/regulatory-information/search-fda-guidance-documents/study-data-technical-conformance-guide-technical-specifications-document
   - Defines aCRF as a PDF mapping collection fields to SDTM variables/discrete values and recommends the filename `acrf.pdf`.
   - Requires interpreting the guidance as nonbinding recommendations, not a mandated Word implementation.
2. **CDISC German-speaking user-group SDTM annotated CRF Guideline v1.0 (2020)**, PDF pages 26–29.
   - https://wiki.cdisc.org/download/attachments/113589261/aCRF_Guideline_v1-0_20201120_publish.pdf#page=26
   - Page 26: annotations should be searchable text; if possible, they should not obstruct CRF-page text.
   - Page 27: all annotations must be included and readable when printed.
   - Page 29 examples: `SVSTDTC` is beside, not over, the original visit-date filling line; sample-collection annotations use nearby blank space without replacing the original Yes/No choices.
   - This is a user-group guideline referring to older MSG/FDA versions; use its placement principles, not its old styling as a current regulatory mandate.
3. **CDISC 2024 China Interchange, Alice Liu, Do's and Dont's for CRF Mapping**, sections 2 and 3.4.
   - https://www.cdisc.org/sites/default/files/2024-09/China%20CDISC%20Interchange-Do%27s%20and%20Dont%27s%20for%20CRF%20Mapping-Alice%20Liu.pdf
   - Says to avoid covering CRF-page/collection-screen text, keep annotations searchable, and use boxes/arrows/lines to clarify where needed; supplementary references should be limited when unnecessary.
   - The presentation explicitly states that its views are the authors' and do not necessarily represent CDISC policy.
4. **Certara, Formatting Annotated Case Report Forms (aCRFs): Part 1 (2020)**.
   - https://www.certara.com/blog/formatting-annotated-case-report-forms-acrfs-part-1/
   - Industry recommendations favor nearby placement and resort to arrows/pointers/margins when space constraints require them; avoid illegibly small annotation text.
   - Older formatting recommendations differ from later MSG v2.0 presentations (e.g. quotes/color emphasis); no current styling decision should be inferred from this alone.
5. **PHUSE 2022, Do It Yourself: Case Report Form (CRF) Annotation**, Caro Sluijter.
   - https://www.lexjansen.com/phuse/2022/si/PAP_SI07.pdf
   - Explains variable sponsor/CRO approaches, MSG v2.0's less visually crowded text, and reuse of PDF annotations through XFDF. This is PDF authoring practice, not a DOCX API or universal layout algorithm.
6. **Microsoft Support, Wrap text and move pictures in Word**.
   - https://support.microsoft.com/en-us/word/wrap-text-and-move-pictures-in-word
   - Distinguishes inline objects from paragraph-anchored floating objects, positioning and wrapping. Floating placement can preserve text flow but must not be confused with automatic collision avoidance.

### Retrieval Limitations

- The official MSG v2.0 landing page was read: https://www.cdisc.org/standards/foundational/sdtm/sdtm-metadata-submission-guidelines-v2-0 . Its full file download requires sign-in; the direct PDF request returned HTTP 403. Do not claim to have read its complete normative text.
- The local PDF-reader could not resolve one PHUSE-host URL; Exa successfully retrieved the relevant industry-paper content as an alternative. No access control was bypassed.
- The non-obscuring/readable-placement principle is independently supported by the user-group guideline, 2024 presentation, and industry sources. None prescribes a universal right sidebar, automatic whitespace detector, or particular Word layout.

## Applicability to This Task

- Borrow **readable, printable text annotations adjacent to the relevant collection item without hiding original content**.
- Browser-only hover panels or a web sidebar outside the physical paper are insufficient for the user's Word requirement.
- Additional annotation whitespace is a product solution authorized by the user, not a rule imposed by aCRF guidance.
- No regulatory-compliance claim follows from showing local field variable names or the form OID; formal SDTM mapping/submission is out of scope.

## Current Frontend Evidence

- Designer canvas and fullscreen share `DesignerWordPreview`; visits use `VisitFormPreviewDialog`. aCRF markers are gated by full editing mode and aCRF view (`frontend/src/components/FormDesignerTab.vue:127-160,1481,3196-3204,3432-3440`; `frontend/src/components/VisitFormPreviewDialog.vue:123-155,426-450`).
- Ordinary field markers are in control cells; horizontal/log-table markers are in column headers, not each data row (`frontend/src/components/DesignerWordPreview.vue:371-388,423-479`).
- The shared marker is absolute/right-aligned with opaque fill, fixed-height geometry, and ellipsis for overflowing browser text (`frontend/src/components/DesignerAcrfAnnotation.vue:49-79,130-132`). Body cells do not reserve a marker lane; the title already reserves right-side space (`frontend/src/styles/main.css:365-418`; `frontend/src/components/DesignerWordPreview.vue:520-525`).
- Current drag measures only `clientY`, persists integer 0.01cm increments, and clamps only to ±2cm; it has no content/neighbor collision check (`frontend/src/composables/useAcrfAnnotationDrag.js:25,78-86,120-184`; `frontend/src/composables/acrfAnnotationGeometry.js:3-4,85-99`).
- Existing tests lock geometry, event/persistence behavior, and mode gates, not real collision-free layout (`frontend/tests/acrfViewToggle.test.js:219-255,303-343`; `frontend/tests/acrfAnnotationGeometry.test.js:30-76`; `frontend/tests/acrfAnnotationPersistence.test.js:48-115`). happy-dom mount assertions are not a Word renderer or real browser geometry test (`frontend/tests/component/VisitFormPreviewDialog.spec.js:166-193`; `frontend/vitest.config.js:8-11`).
- Relevant merged/log-table branches and layout helpers: `frontend/src/components/DesignerWordPreview.vue:160-258,289-356`; `frontend/src/composables/previewCellRender.js:27-38,85-107`. Orientation/fullscreen viewport evidence: `frontend/src/components/FormDesignerTab.vue:1552-1566,4509-4538`.

## Current Word-Export Evidence

- Form-domain and field-variable annotations call the same floating-textbox helper (`backend/src/services/export_service.py:771-776,831-835`).
- `wp:anchor` uses paragraph-relative vertical placement, right alignment relative to a column, `wp:wrapNone`, `behindDoc=0`, `allowOverlap=1`, and `layoutInCell=1` (`backend/src/services/export_service.py:869-887`). This avoids body reflow but explicitly permits overlap.
- Actual annotation text is in `wps:txbx/w:txbxContent/w:t`, with opaque fill and no wrapping, appended as a drawing in an existing anchor paragraph (`backend/src/services/export_service.py:899-940`).
- Width is character-estimated in 0.9–4.6cm; height is 0.7cm. Placement applies the existing relative-y contract without checking occupied body regions, neighbors, cell width, or page bounds (`backend/src/services/export_service.py:790-863`).

## Contracts and Identifier Semantics

- `.trellis/spec/guides/cross-stack-contracts.md:507-569` (§6): `annotation_positions` is form-owned; variable-name keys and reserved `_form` map to relative y offsets. `_form` is the domain marker, not the OID. Do not silently reinterpret old y values as a new region/order system.
- Word-like body/export parity is an existing constraint, not pixel-identical reconstruction of an imported DOCX screenshot (`.trellis/spec/guides/cross-stack-contracts.md:434-459,552-569`; `frontend/src/components/DesignerWordPreview.vue:507-518`). R1 permits specifically approved added annotation whitespace, not arbitrary layout refactoring.
- Actual form OID is nullable `FormResponse.code`, separate from domain (`backend/src/schemas/form.py:123-132`).

## User Decision Already Made

The user first selected **content unchanged, additional whitespace allowed** on 2026-10-13. They then interrupted the placement choice and selected **retain floating boxes, background 75% transparent**, accepting residual text overlap with existing manual drag. This later appearance-only decision is authoritative: no added whitespace, changed body geometry, or position migration is planned. R2 is scoped to existing full-mode paper-preview titles by the original request and project identifier policy, not expanded to Word export. No implementation/commit/merge authorization follows from either appearance answer.
