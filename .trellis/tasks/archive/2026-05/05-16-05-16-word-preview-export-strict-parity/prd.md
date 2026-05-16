# Word Preview / Export Strict Table-Field Parity

## Goal

Make the CRF Editor's browser Word preview and exported `.docx` agree on table field content under a strict comparison model: same project forms, same form order, same table row/cell structure, and no unintended field-content differences inside form tables. This follows the user's latest requirement to validate by proportion, verify only table field content, and not ignore content before drawing conclusions.

## What I already know

* User asked to continue after a strict MCP browser check of Word preview vs Word export.
* Previous semantic verification passed for `TEST`: 54/54 forms and 780 semantic preview tokens were present in the export.
* User clarified the desired scope: verify by proportion, only table field content, do not ignore any content, then conclude.
* Strict browser/docx cell comparison for `TEST` found:
  * Forms: 54 preview forms / 54 exported headings.
  * Form order: matched.
  * Table rows: 480 preview / 480 export.
  * Table cells: 1199 preview / 1199 export.
  * Exact matching cells: 905 / 1199 = 75.48%.
  * Exact matching rows: 257 / 480 = 53.54%.
* Row/cell counts match, so most issues are field-content rendering differences rather than missing tables.
* Representative strict differences:
  * Choice spacing: preview `○是 ○否`; export `○ 是 ○ 否`.
  * Numeric placeholders: preview `|__|__|__|.|__|`; export `|__||__||__|.|__|`.
  * Trailing fill spacing: preview spaces around `__FILL__`; export often removes spaces before the next `○`.
  * `身高体重 / BMI / 未查`: preview empty; export `○ 未查`.
  * `12导联心电图`: preview shows the inline item/result/unit table before `综合判定结果`; export places `综合判定结果` and related rows before the inline item/result/unit table.
* Latest exported Word review added four normative requirements scoped across preview/export as follows:
  * Choice markers must touch their labels: `○1.0  ○其他`, not `○ 1.0  ○ 其他`.
  * Choice markers `○` / `□` must consistently use SimSun/宋体 in the exported `.docx`; the browser preview should use the same marker font contract where applicable.
  * Every exported form must end with a section break of type “next page”; this is a Word export-only document-structure requirement and does not need to be represented in the browser preview.
  * Choice labels must touch trailing fill underlines: `其他，请描述______`, not `其他，请描述 ______`.

## Assumptions (temporary)

* The product target is strict preview/export parity under a newly specified rendering contract, not blind conformance to either current renderer.
* Visual-only layout differences are secondary unless they change field content text, row/cell structure, user-visible controls, choice marker font, or exported Word form section boundaries.
* The current `TEST` project is the primary verification fixture for this task.
* Existing cross-stack contracts around Word preview/export should be updated or extended if implementation changes the parity definition.

## Open Questions

* None for brainstorm. Implementation will proceed by child-task decomposition before coding.

## MVP Scope Decision

* The broad parity target will be split into smaller Trellis child tasks before implementation.
* Child tasks should separate strict comparison infrastructure, choice rendering contract fixes, Word section-break/font checks, and remaining ordering/default-control mismatch classes.
* Coding should start only after the child task boundaries are visible and the next child task is activated.

## Requirements (evolving)

* Preserve 54/54 form order parity for `TEST`.
* Preserve 480/480 table row count parity and 1199/1199 table cell count parity unless the intended output changes.
* Compare only form table field content; ignore non-field scaffolding such as cover page, directory, visit distribution, and form headings for the strict content score.
* Do not declare parity based on semantic token presence alone.
* Treat strict per-cell comparison as the acceptance signal for table field content.
* MVP target is exact character-level parity for table field cells, including choice spacing, numeric placeholder strings, trailing fill spacing, and empty-vs-control cells.
* Option choice markers must have no internal space before the label: `○1.0  ○其他` / `□选项`, not `○ 1.0  ○ 其他` / `□ 选项`.
* Option choice markers `○` and `□` must consistently render in SimSun/宋体 in exported Word; browser preview must use the same marker-font contract where the marker is separately styleable.
* Option labels and trailing underline placeholders must have no inserted space: `其他，请描述______`, not `其他，请描述 ______`.
* Exported Word must add a section break of type “next page” after every form; browser preview does not need to represent section breaks or equivalent pagination effects.

## Acceptance Criteria (evolving)

* [ ] A repeatable strict comparison reports 54/54 `TEST` forms in the same order.
* [ ] A repeatable strict comparison reports equal table row and cell counts for every compared form.
* [ ] A repeatable strict comparison reports 1199/1199 exact matching table field cells for `TEST`.
* [ ] Exact cell match ratio reaches 100.00% under the agreed normalization rules for extracting text from DOM and `.docx` tables.
* [ ] Known true differences are fixed rather than classified out of scope.
* [ ] Validation output distinguishes exact content mismatches from non-field document scaffolding.
* [ ] Choice marker/label text has no internal space in both preview and export, while preserving intended spacing between separate options.
* [ ] Exported `.docx` choice markers `○` / `□` consistently use SimSun/宋体, with no mixed Times New Roman marker runs.
* [ ] Labels immediately followed by fill underlines contain no inserted space in both preview and export.
* [ ] Every exported form ends with a next-page section break in the exported `.docx`; no browser preview assertion is required for this section-break behavior.

## Decision (ADR-lite)

**Context**: The first strict comparison showed table structure parity but only 905/1199 exact cell matches because spacing, placeholder rendering, empty/default controls, and at least one field ordering case differ between preview and export. Manual review of the exported `.docx` then identified additional Word-output requirements for choice marker spacing, marker font, form section breaks, and label-to-underline spacing.

**Decision**: MVP scope is exact character-level parity for table field cells plus the Word-specific section-break/font requirements listed above. The implementation direction is **shared explicit contract** for the reviewed mismatch classes: browser preview and exported `.docx` must conform to the newly stated contract within each requirement's declared scope, instead of treating either current renderer as automatically authoritative.

**Consequences**: Implementation may need coordinated frontend and backend changes. Frontend preview must match the agreed text spacing; backend export must update choice marker spacing/font runs, label-to-underline spacing, and per-form next-page section breaks. Browser preview does not need to represent section breaks or equivalent pagination effects. For remaining unreviewed mismatch classes, the tie-breaker can still be decided during implementation based on evidence.

## Technical Approach

* Treat the updated preview/export contract in this PRD as canonical for the reviewed mismatch classes.
* Adjust frontend preview rendering in `frontend/src/components/FormDesignerTab.vue`, `frontend/src/composables/useCRFRenderer.js`, and possibly `frontend/src/composables/formFieldPresentation.js` to match the agreed strings exactly.
* Adjust backend Word export in `backend/src/services/export_service.py` and related field-rendering helpers where required for the agreed strings, marker font runs, and per-form section breaks.
* Prioritize known mismatch classes:
  * choice spacing (`○ 是` vs `○是`), including trailing-underscore options;
  * choice marker font consistency (`○` / `□` in SimSun/宋体, no mixed Times New Roman marker runs in export);
  * label-to-underline spacing (`其他，请描述______`, not `其他，请描述 ______`);
  * numeric placeholder composition (`|__||__|` style emitted by export);
  * empty/default-control differences such as `BMI / 未查`;
  * field ordering/grouping differences such as `12导联心电图`;
  * per-form next-page section boundaries in Word export only.
* Add or update a repeatable strict table-field comparison so future validation reports exact row/cell counts, exact match ratio, choice marker spacing, label-to-underline spacing, and marker font consistency.
* Keep non-table scaffolding outside this task's strict content score, while still validating Word section breaks as a document-structure requirement.

## Auto-Context Findings (2026-05-16)

* Existing cross-stack contract `preview-export-parity` already covers shared fill-line literals, frontend dual render paths, page font, table-cell vertical rhythm, and form-title alignment; it needs extension for no marker-label internal space, marker font consistency, label-to-fill spacing, and per-form Word section breaks.
* Frontend `frontend/src/composables/useCRFRenderer.js` has two choice render paths that must change together:
  * `renderChoiceHtml` builds an inline-flex option atom with `gap:0.2em` between marker, label, and suffix fill-line.
  * `renderCtrl` emits plain strings such as `○ 有尾线______  ○ 无尾线` and default `○ 是  ○ 否`.
* Backend `backend/src/services/export_service.py` has both string and run-based choice paths:
  * `_render_single_choice` / `_render_multi_choice` emit `○ {opt}` / `□ {opt}`.
  * `_render_choice_field` / `_render_vertical_choices` use `symbol + " "` and currently join trailing labels to underscores with NBSP.
* Backend form separation currently mixes `doc.add_page_break()` and `_switch_section(... WD_SECTION.NEW_PAGE ...)`; the new requirement needs an explicit next-page section break after every exported form, including portrait forms that currently only add a page break.
* Existing tests already cover some adjacent contracts but expect old behavior: `frontend/tests/columnWidthPlanning.test.js` expects marker-label spacing in `renderCtrl`, and `backend/tests/test_export_unified.py` asserts NBSP between trailing choice labels and fill underscores.

## Implementation Plan (child-task slices)

* Child 1: Build or formalize repeatable strict table-field comparison and baseline reporting for `TEST`.
* Child 2: Fix shared choice rendering text contract across frontend preview and backend export: marker-label spacing, label-to-fill spacing, and numeric placeholder parity where covered by contract tests.
* Child 3: Enforce Word-specific export structure/font requirements: per-form next-page section breaks and SimSun/宋体 marker runs.
* Child 4: Tackle remaining true parity mismatch classes after strict comparison is repeatable, including default-control empty cells and ordering/grouping differences such as `12导联心电图`.

## Definition of Done (team quality bar)

* Tests added/updated where appropriate for shared preview/export contracts.
* Relevant backend and frontend tests pass.
* Browser MCP validation rerun against `http://0.0.0.0:8888` for the agreed target project/forms.
* Docs/spec notes updated if the preview/export contract changes.
* Rollback risk considered; no unrelated refactors.

## Research Notes

### What comparable rendering systems usually do

* Document preview/export parity is usually maintained by sharing a rendering contract or a single intermediate table model, then adapting that model to DOM and `.docx` output.
* Character-exact parity is fragile when each renderer independently decides whitespace, placeholders, and choice layout; shared literals and extraction-based regression tests reduce drift.
* When exported Word is the deliverable, teams often choose one canonical representation and make the other renderer conform, instead of letting both evolve independently.

### Constraints from this repo/project

* The project already has a cross-stack `preview-export-parity` contract in `.trellis/spec/guides/cross-stack-contracts.md`.
* Frontend currently has two render paths in `frontend/src/composables/useCRFRenderer.js`: string path `renderCtrl → toHtml` and HTML path `renderCtrlHtml → renderChoiceHtml`.
* Backend export has separate normal, inline, and unified rendering paths in `backend/src/services/export_service.py` plus inline helpers in `backend/src/services/field_rendering.py`.
* Strict baseline shows table structure parity already exists; most remaining work is field-content string parity and a small number of ordering/default-control differences.

### Feasible approaches here

**Approach A: Export matches preview**

* How it works: adjust backend Word export strings/order/default-control behavior to match the existing browser preview exactly.
* Pros: user's visible preview remains the source of truth; fewer frontend UI changes; likely intuitive because users trust the preview.
* Cons: may require backend changes across normal/unified/inline rendering paths; exported Word text may adopt preview's compact spacing like `○是`.

**Approach B: Preview matches export** (Recommended if `.docx` deliverable is authoritative)

* How it works: adjust frontend preview strings/order/default-control behavior to match current exported Word output exactly.
* Pros: protects the actual delivered Word document; many strict mismatches are spacing/placeholder presentation in preview; likely less backend regression risk.
* Cons: visible preview changes for users; still must handle true ordering/default-control cases like `12导联心电图` and `BMI / 未查`.

**Approach C: Shared table-field snapshot contract**

* How it works: introduce/extend a shared snapshot fixture or comparator that both preview and export must satisfy, then update both sides to that contract.
* Pros: strongest long-term guard against drift; fits existing cross-stack fixture style.
* Cons: larger initial scope; may require more test infrastructure before fixing visible mismatches.

## Out of Scope (explicit)

* Comparing cover page, table of contents, visit distribution table, or `适用访视` text unless the user explicitly brings them into scope.
* Pixel-perfect Word layout matching unless the user expands the scope beyond table field content.
* Changing project data or user credentials.
* Broad redesign of the CRF rendering system.

## Technical Notes

* Project stack: FastAPI + SQLAlchemy + SQLite backend, Vue 3 + Vite + Element Plus frontend.
* Frontend preview path:
  * `frontend/src/components/FormDesignerTab.vue` renders the selected form preview table (`.fd-right .word-page`) and designer preview.
  * `FormDesignerTab.vue` uses `renderCtrl`, `renderCtrlHtml`, `toHtml`, and group builders from `frontend/src/composables/useCRFRenderer.js`.
  * `frontend/src/composables/formFieldPresentation.js` controls displayed labels/styles/default values used by the designer preview.
* Backend export path:
  * `backend/src/services/export_service.py::_add_forms_content` sorts forms by `(order_index, id)` and renders each form.
  * `backend/src/services/export_service.py::_build_form_table` renders normal two-column tables.
  * `backend/src/services/export_service.py::_add_unified_landscape_table` renders unified landscape tables and processes regular/full-row/inline segments.
  * `backend/src/services/field_rendering.py` provides inline table model helpers shared conceptually with frontend grouping.
* Relevant contract documentation:
  * `.trellis/spec/guides/cross-stack-contracts.md` includes `preview-export-parity` and `width-planning` contracts.
  * The existing `preview-export-parity` contract already notes two frontend render paths (`renderCtrlHtml → renderChoiceHtml` and `renderCtrl → toHtml`) and shared literals for fill lines.
* Guideline constraints:
  * Frontend changes should follow Vue Composition API, Element Plus, scoped/CSS-variable conventions, and node:test-based contract tests.
  * Backend changes should keep business logic in services, use type annotations, avoid silent exception swallowing, and preserve existing security boundaries.
* Validation artifacts from this session:
  * `/tmp/crf-editor-test-word-export.docx`
  * `/tmp/crf-editor-test-word-export-pandoc.txt`
* Current strict baseline for `TEST`:
  * Exact cell match ratio: 75.48%.
  * Exact row match ratio: 53.54%.
  * Table structure counts already align globally.
