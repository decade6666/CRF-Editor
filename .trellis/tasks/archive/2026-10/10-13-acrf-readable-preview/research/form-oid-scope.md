# Research: Form OID on Paper-Preview Titles

## Scope Interpretation

The user's second request explicitly names the Word-preview interface. The plan therefore adds OID only to the paper titles in the existing designer canvas, fullscreen designer, and visits preview, not to Word export/TOC, toolbars, imported screenshots, or template-import previews. Full editing mode is the existing policy for advanced identifiers; both eCRF and aCRF can show the title OID. This default was stated to the user; it is not a claim of separate authorization to expand the exported Word title.

## Direct Code Evidence

- Actual code is nullable `FormResponse.code`, separate from `domain`: `backend/src/schemas/form.py:123-132`.
- Shared designer paper title currently renders only `selectedForm.name` in `.wp-form-title`; the domain marker is a separate sibling: `frontend/src/components/DesignerWordPreview.vue:70-87`.
- Parent renders this child twice and already sends a view-mode boolean; add a separate full-mode OID gate to **both** tags rather than reusing the aCRF-only gate: `frontend/src/components/FormDesignerTab.vue:3196-3204,3432-3440`.
- Visits already resolves the authoritative form response and its title is `formPreviewForm.name`; use that response's `code`, not the incoming visit row's partial object: `frontend/src/components/VisitFormPreviewDialog.vue:123-141,434-451`.
- Both title-row hosts reserve the rightmost 4.8cm for the domain marker: `frontend/src/components/DesignerWordPreview.vue:520-528`; `frontend/src/components/VisitFormPreviewDialog.vue:791-795`.
- Paper title is 14pt, bold, black and left-aligned while paper/body geometry is fixed/shared: `frontend/src/styles/main.css:345-367`; `.trellis/spec/guides/cross-stack-contracts.md:434-461`.
- Parity input accepts a raw `name`/`title` separate from tables (`backend/src/services/word_table_parity.py:180-193`). Preserve `.wp-form-title` as the raw form-name text and make OID a sibling to avoid a changed display string contaminating identity capture. Table-cell extraction and Word titles need no change.
- The designer remains a stateless presentational child: its explicit mode/data props are separate from 14 parent-owned handlers; adding an OID gate is not permission to move caches or inject global state into the child: `.trellis/spec/frontend/component-guidelines.md:778-848`.

## Proposed Minimal Presentation Boundary

- A small shared `FormPreviewOid.vue` handles nullable/blank code display and text-only interpolation, with no network, storage, events or mutable state. It is actually reused by the two paper-title hosts; it is not a new generic title framework.
- Hosts insert it beside the unchanged `.wp-form-title`, in the title row's available left area; short values share a line, long values may wrap within that area and never invade the reserved domain-marker region.
- Shared row flow/spacing belongs to the existing Word-preview rules in `main.css`; per-OID text styling belongs to the small component. Preserve the original name's black 14pt left-aligned style. OID must remain dark on white paper even in dark application theme; use an explicit paper-metadata CSS variable rather than an application-text color that becomes light on white paper.

## Existing Test Seams

- `frontend/tests/component/DesignerWordPreview.spec.js`: fixtures at lines 138–169 and cases for both scopes, empty forms, eCRF/aCRF markers.
- `frontend/tests/component/VisitFormPreviewDialog.spec.js`: `authoritativeForm`, `mountDialog` and stored view/edit-mode fixtures; open-time authority at 197, orientation cases 235–263, mode gates 434–447. Extend fixtures with a code that differs from domain/field variable name.
- `frontend/tests/designerPreviewSplit.test.js`: per-tag declared-prop checks; add the new mode gate to both tag expectations while retaining exactly two scopes and all 14 handlers.
- `frontend/tests/visitPreviewSplit.test.js`: visits parent remains a switch bridge and the dialog remains the rendering owner.
- `frontend/tests/wordPageGeometry.test.js`: preserve title alignment/font/black color and fixed page/table geometry.
- Add a mounted `FormPreviewOid.spec.js` for code, null/empty/whitespace, escaped text and long-code structure; actual browser rectangles, not happy-dom alone, must verify title wrapping/domain separation.

## Test/Environment Caveats

- `frontend/package.json:6-13` defines existing dev/build/lint/test/component commands. Use them without adding a script runner or package.
- The lockfile mentions coverage providers only as Vitest optional peers, not resolved provider packages; the package manifest has no provider. Do not silently install a coverage dependency or claim measured SFC coverage. Use existing Node coverage for pure JS and ask for permission if a numerical SFC coverage gate needs a provider.
- Frontend quality-guide overview mentions fast-check, but current package/module instructions use the existing lightweight property utility and node:test/Vitest. Do not add fast-check based on that stale overview.
- No UI, tests, coverage measurement, or real Word rendering was run during this planning research.
