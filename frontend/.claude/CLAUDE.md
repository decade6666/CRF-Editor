[Root](../../.claude/CLAUDE.md) > **frontend**

# frontend Module Notes

> Last updated: 2026-06-29

## Module Responsibilities
- Provide the Vue 3 single-page interface for the CRF editor.
- Manage login, projects, visits, forms, fields, units, dictionaries, settings, and admin pages.
- Handle template import, project import, Word import two-column evidence preview, export, theme switching, and sidebar interaction.
- Provide CRF preview rendering, ordering, cache refresh, field instance quick edit, column width / row height dragging, and session countdown experience.

## Key Entry Points
- `frontend/src/main.js`: creates the Vue app, mounts `App.vue`, and registers Element Plus with the full icon set.
- `frontend/src/App.vue`: application shell; manages login state, post-login routing through `/api/auth/me`, regular project workbench, standalone admin workbench, import/export, refresh, theme, settings dialog, and password-change dialog.
- `frontend/src/composables/useApi.js`: unified requests, error parsing, 401 invalidation handling, GET cache, and automatic invalidation.
- `frontend/src/composables/useCRFRenderer.js`: unified field rendering, HTML preview, and content-driven column width planning.
- `frontend/src/composables/formFieldPresentation.js`: presentation-layer rules for field instance display attributes, colors, default values, and related behavior.
- `frontend/src/composables/searchRanking.js`: shared pure helper for user-facing fuzzy search ordering; empty keywords keep source order, exact matches rank first, partial matches rank by shortest matching candidate text length, and equal ranks stay stable.
- `frontend/src/composables/useOrdinalQuickEdit.js`: shared list ordinal quick-edit helper; double-clicking a visible ordinal cell opens direct target-position input, keeps filter-disabled semantics aligned with drag sorting, and reuses existing reorder endpoints with the common restore-on-failure message.
- `frontend/src/composables/useColumnResize.js`: form designer column width dragging and local persistence coordination.
- `frontend/src/composables/useRowResize.js`: Word preview row height dragging, stable row keys, and local persistence.
- `frontend/src/composables/useSessionTimer.js`: JWT `exp` display, near-expiration reminders, and click-to-renew by reusing `/api/auth/me`.
- `frontend/src/composables/formDesignerPreviewModel.js`: derived view-model cache for form designer / template preview, avoiding repeated recalculation for templates.
- `frontend/vite.config.js`: development server, `/api` proxy, and build chunking configuration.

## Core Directories
- `src/components/` (13 Vue components): page components for projects, dictionaries, units, fields, form design, visits, login, admin, session countdown, import preview, simulated CRF rendering, and more.
- `src/composables/` (19 JS modules): shared logic for API, drag ordering, ordinal quick edit, ranked fuzzy search, field-library visibility, delete confirmations, field rendering, form designer property editing, preview view model, export download state, column width / row height dragging, session countdown, designer undo/redo history, visit preview orientation, lazy tab loading, performance baseline, and more.
- `src/styles/`: global styles and theme variables.
- `scripts/` (3 scripts): fixture generation (`generatePlannerFixtures.mjs`), build metric collection (`collectBuildMetrics.mjs`), browser performance baseline (`runBrowserPerfBaseline.mjs`).
- `tests/` (39 files: 38 `.test.js` + `testProperty.js`): frontend regression, contract tests, and property-testing helper utilities based on `node:test`.

## Key Components and Flows
- `components/LoginView.vue`: username + password login form; shows migration hint in development and a generic authentication failure message in production.
- `components/SessionTimer.vue`: top-bar remaining session time display, near-expiration status styling, and click-to-renew entry point.
- `components/AdminView.vue`: standalone admin workbench, responsible for user list, password status display, creating users, password reset, batch project operations, and recycle bin.
- `components/ProjectInfoTab.vue`: project information, metadata, and Logo operations.
- `components/VisitsTab.vue`: visit structure, visit-form matrix, visit preview, left/right Element Plus ordering tables, and visit / visit-form ordinal quick edit.
- `components/FieldsTab.vue`: field library maintenance; the choice-field option row provides inline 新增字典 / 编辑字典 entries (standalone implementation, parity with the designer) that reuse the codelist `create` / `snapshot` / `references` endpoints with impact confirmation and `refreshKey` sync, and the main list supports ordinal quick edit.
- `components/FormDesignerTab.vue`: form design, field instance editing, real-time preview, complete-mode eCRF / aCRF preview switching with field OID / form-domain annotation overlays, column width dragging, quick edit, in-memory undo/redo (Undo/Redo buttons + Ctrl+Z / Ctrl+Y), and ordinal quick edit for the left-side form list.
- `components/TemplatePreviewDialog.vue`: template import preview.
- `components/DocxCompareDialog.vue`: Word import comparison preview and AI suggestion application.
- `components/DocxScreenshotPanel.vue`: Word import screenshot display.
- `components/SimulatedCRFForm.vue`: simulated CRF rendering.
- `App.vue` first fetches `/api/auth/me` after login, then decides whether to enter the admin workbench or regular-user main workbench; it also manages project copy, database import/export, the Word export dropdown (`导出eCRF` / `导出aCRF`), export rate limiting, settings dialog, AI connectivity test, dark mode switching, and regular-user password change.

## Dependencies and Scripts
- Tech stack: Vue 3, Vite, Element Plus, vuedraggable, sortablejs.
- Test dependencies: `node:test`, self-developed lightweight property testing utility `tests/testProperty.js`.
- Common commands: `npm run dev`, `npm run build`, `npm run lint`, `npm run format`.
- Test command: `node --test tests/*.test.js`.
- The development server listens on `0.0.0.0:5173` by default, and `/api` proxies to `http://127.0.0.1:8888`.

## Development Conventions
- Put complex reusable logic in `composables/`.
- API requests must go uniformly through `useApi.js`.
- Field preview and HTML rendering must uniformly reuse `useCRFRenderer.js`.
- Field display rules should preferably reuse `formFieldPresentation.js` to avoid repeating presentation-layer concatenation logic in components.
- Ordering interactions should preferably reuse `useOrderableList.js`, `useSortableTable.js`, and `useOrdinalQuickEdit.js`; drag sorting and direct ordinal jumps must keep filter-disabled behavior and the shared `排序保存失败，已恢复` recovery semantics aligned.
- User-facing fuzzy search boxes should reuse `searchRanking.js`; components pass the base ordered list and candidate text extractor, and must preserve legacy concatenated candidates where previous behavior matched combined fields such as unit `code + symbol` or option `code + decode`.
- `FormDesignerTab.vue` design note display has moved from the right-side aside to the canvas header / designer-section-title summary + tooltip path; only VisitsTab still keeps the original aside style.
- `App.vue` provides global `editMode` (persistence key `crf_edit_mode`). Brief mode hides advanced identifiers such as OID / variable names by default, and when leaving full mode resets the current advanced maintenance tab back to project information; in full mode, the lists and add/edit dialogs of `CodelistsTab.vue`, `UnitsTab.vue`, `FieldsTab.vue`, `FormDesignerTab.vue`, and `VisitsTab.vue` uniformly show the corresponding advanced identifiers. `FormDesignerTab.vue` additionally persists a local preview-only `viewMode` (`crf_view_mode`) for the complete-mode eCRF / aCRF annotation toggle, but initialization normalizes back to `eCRF` whenever `editMode` is false.
- New fields are local drafts: clicking "New Field" (`newField`) only constructs a temporary draft object (`id='__draft__'`, `__draft:true`, with a complete local `field_definition`), inserts it into `formFields`, and selects it, without sending a request; only when the top-bar "Save" button (`saveDraftField`) appears and is clicked does it sequentially `POST field-definitions` + `POST forms/{id}/fields` to persist, replace the draft, refresh, and record one "new field" action in the undo stack. In draft state, the property autosave chain short-circuits at the watcher entry to `applyEditorToDraft` local write-back; `removeField` only removes drafts locally and does not call DELETE; only one draft is allowed at a time, and before switching forms / selecting another field / creating another field, `confirmDiscardDraft` (save/discard/cancel) is used; **when switching projects, as long as the designer tab has been activated, it must first go through the `canLeaveProject` guard, avoiding silently clearing drafts while the lazy-loaded component is still mounted**; sorting is disabled while a draft exists, and draft rows do not participate in batch selection or inline quick toggles. `addField`, which drags an existing definition from the field library, keeps immediate persistence unchanged.
- The leave strategy for field property autosave goes uniformly through `resolveFieldPropLeave`: closing the design window (`before-close`), switching forms, and switching projects all try to flush first; errors such as `missing_codelist` (single/multiple choice without dictionary selected), which cannot be autosaved but can be abandoned, use `confirmDiscardFieldPropChanges` to provide "continue editing / discard and leave" exits; network/server errors block leaving and show the reason. Discarding unsaved field property changes only clears the local autosave queue and editor state, without extra reload, to avoid introducing a new network failure surface during leaving.
- Designer undo/redo uses pure in-memory dual stacks (`useDesignerHistory.js`, limit 20, cleared on refresh, no backend persistence). It covers six action types: property editing, ordering, adding (including log rows), new field, delete, and batch delete; inverse operations for delete/batch delete rebuild from pre-delete snapshots according to the original `order_index` and write new ids back through `remapId`; undoing new field symmetrically deletes the automatically created field definition (if referenced by other forms and returning 409, it degrades by keeping it and showing a prompt). Switching forms clears history; other quick-edit paths such as `toggleInline` are not currently recorded in the stack.
- Form orientation (`paper_orientation`) should primarily use `selectedFormPaperOrientation` + `resolveLandscape`; first load migrates `localStorage['crf_forceLandscape']` once to per-form settings, and no longer relies on the old global switch after migration.
- Frontend tests are concentrated in `frontend/tests/`, mainly covering the application shell, settings, import feedback, ordering, designer, field display, theme, sidebar, and port conventions.
- Global Element Plus table headers uniformly use `--color-primary-subtle` fill, `--color-text-primary` text color, and center alignment; fixed column headers need to override the white-background fallback of `.el-table-fixed-column--left/right` and `.el-table__fixed-right-patch`. Option lists and the VisitsTab visit-form list should stay on bordered `el-table` headers instead of custom handwritten header rows so styling does not drift.

## Preview Column Widths (Content-Driven)
- `useCRFRenderer.js` exposes `planInlineColumnFractions` / `planNormalColumnFractions` / `planUnifiedColumnFractions` as the unified planner entry points for the three table types.
- Character weight constants and CJK code point ranges share the same contract with backend `backend/src/services/width_planning.py`; changes on either side require syncing the other side. Shared constants include `WEIGHT_CHINESE=2`, `WEIGHT_ASCII=1`, `FILL_LINE_WEIGHT=6`, `UNDERSCORE_CHAR_CM=0.19`, `CELL_HPAD_CM=0.4`, `FILL_LINE_SAFETY_CM=0.2`, `FILL_LINE_MIN_CHARS=6`, `FILL_LINE_MAX_CHARS=80`, `FILL_LINE_EPSILON=1e-9`, `INLINE_HEADER_FLOOR=WEIGHT_CHINESE*4=8` (applies only to inline tables, protecting short headers of ≤4 characters such as "Unchecked" / "Item" / "Unit" from being squeezed by long neighbors to the point they cannot fit on one line), `AVAILABLE_CM=14.66`; width-aware preview callers pass the computed full-cell underscore count to text fill-lines, while choice trailing underscores subtract marker + label width before rendering the tail line.
- `FormDesignerTab.vue` uses `useColumnResize` to manage column width dragging; default value sources accept arrays / factory functions / Refs, and automatically rehydrate when switching `formId` or `tableKind`.
- `FormDesignerTab.vue` and `VisitsTab.vue` reuse `useRowResize` to manage Word preview row height dragging; row height keys are composed from field id and table instance, and hover / active indicator lines need to cover the whole row.
- localStorage key: `crf:designer:col-widths:<form_id>:<table_kind>`; only the designer writes it, while `TemplatePreviewDialog` / `SimulatedCRFForm` only read it.
- Row height localStorage key: `crf:designer:row-heights:<form_id>:<table_instance_id>`; the designer and visit preview share read/write semantics.
- If reading cached column widths fails (non-array / element out of bounds / sum not equal to 1), fall back to content-driven defaults.
- Cross-stack fixture: `backend/tests/fixtures/planner_cases.json` is loaded by both frontend `columnWidthPlanning.test.js` and backend `test_width_planning.py`; the **single authoritative generator** is `frontend/scripts/generatePlannerFixtures.mjs`, and adding/modifying cases must update and rerun the generator.
- `.wp-form-title` must keep `text-align: left` to align with Word export `add_heading(level=1)` default left alignment; this is locked by `frontend/tests/wordPageGeometry.test.js`, and changing it back to `center` or introducing `margin: 0 auto` that causes block centering is forbidden.

## Authentication and Admin Interaction
- After login, `App.vue` calls `/api/auth/me` to obtain `username` and `is_admin`, then routes to either the admin workbench or regular project workbench.
- The admin workbench does not render the regular project list, designer, or CRF editing entry points.
- Regular-user password change belongs to the authentication chain and needs to be validated in sync with backend `auth.py`, `auth_service.py`, and `rate_limit.py`.
- 401 invalidation handling is centralized in `useApi.js`; components should not maintain inconsistent authentication error branches individually.
- `SessionTimer.vue` / `useSessionTimer.js` only decode local JWT `exp` for display; real validity still depends on backend authorization. Click-to-renew reuses `GET /api/auth/me` and the `X-Refreshed-Token` write-back path.

## Testing Focus
- `adminViewStructure.test.js`: admin interface structure.
- `appSettingsShell.test.js`, `appCollapse.test.js`, `sidebarCollapseBehavior.test.js`: application shell, settings, and collapse behavior.
- `columnWidthPlanning.test.js`, `columnWidthPlanning.pbt.test.js`: column width planning contract and property tests.
- `formDesignerPropertyEditor.runtime.test.js`, `quickEditBehavior.test.js`, `formFieldPresentation.test.js`: designer property editing, quick edit, and field display.
- `exportDownloadState.test.js`: export download state.
- `portDefaults.test.js`: development port conventions.
- `visitPreviewLandscape.test.js`: visit preview orientation.
- `orderingStructure.test.js`: drag-ordering structure contract and existing reorder wiring invariants.
- `ordinalQuickEditWiring.test.js`: source-level wiring checks for ordinal quick edit across codelists, options, units, fields, visits, visit forms, and the designer form list.
- `useOrdinalQuickEdit.test.js`: pure ordinal quick-edit behavior — commit, cancel, no-op, clamp rejection, render-list semantics, custom order keys, and failure restore.
- `searchRanking.test.js` and `searchRankingWiring.test.js`: exact-first fuzzy search helper behavior and component wiring.
- `fieldsTabCodelistQuickEdit.test.js`: field library inline codelist editing — add/edit button wiring and disabled state, create/snapshot endpoints, references impact confirmation, cache invalidation + `refreshKey` sync, failure refresh, and trailing-underscore toggle.
- `themePalette.test.js`: theme palette.
- `importRenameFeedback.test.js`: import rename feedback.
- `projectInfoMetadata.test.js`: project information metadata.
- `appTabLazyLoad.test.js`: tab lazy loading.
- `sidebarCopyButtonScope.test.js`: sidebar copy button scope.
- `browserPerfBaselineScript.test.js`, `perfBaselineHelpers.test.js`: performance baseline related tests.
- `sessionTimer.test.js`: JWT `exp` decoding, remaining session time display, near-expiration reminders, and click-to-renew.
- `rowHeightResize.test.js`: row height persistence, stable row keys, full-row hover indicator line, and designer / visit preview drag anchors.
- `designerHistory.test.js`: undo/redo dual-stack limit 20, new operations clearing redo, undo/redo stack migration, id remapping after delete undo, array id remapping, keeping stacks on replay failure, and clear semantics.
- `designerNewFieldDraft.test.js`: new field local draft — `newField` does not persist, `saveDraftField` first creates the definition then creates the instance and records history, draft delete does not call DELETE, property autosave short-circuits for drafts, confirmation before switching and sorting/batch-selection guards, save button and draft row template contract.
- `formDesignerPreviewModel.test.js`: derived view model for form designer / template preview and equivalence with pure function output for old templates.
- `docxBimodalPreview.test.js`: Word import two-column screenshot evidence panel, gentle positioning prompt, and debug log cleanup.
- `wordPageGeometry.test.js`: Word preview A4 geometry contract — `.word-page` 21cm×29.7cm, `.word-page.landscape` flips, `--word-page-margin-x/y` variables, `@media print` fallback, `.designer-scaled-word-page` keeps A4 geometry instead of 100% width, and the `table-layout: fixed` + `<colgroup>` contract for `inline-table` / `unified-table`.
- `acrfViewToggle.test.js`: complete-mode-only eCRF / aCRF toggle wiring, persisted `viewMode` normalization, field/domain annotation placement, non-interactive overlay CSS, and the fullscreen designer `#header` accessibility / spacing contract.
- `editModeHiddenIdentifiers.test.js`: show/hide, order, and no-hard-hidden-style contracts for dictionary, unit, field, form, and visit OID / variable-name controls under brief / full editing modes.
- `tableHeaderStyle.test.js`: Element Plus table header and fixed column header theme fill, plus handwritten list header centering contract.
- `testProperty.js`: property testing utility library (seeded random generator, `forAll` runner), providing lightweight infrastructure for contract and property tests as an alternative to fast-check.


## Related File List
| Category | Files |
|------|------|
| Entry | `src/main.js`, `src/App.vue` |
| Components | `src/components/AdminView.vue`, `src/components/LoginView.vue`, `src/components/SessionTimer.vue`, `src/components/ProjectInfoTab.vue`, `src/components/CodelistsTab.vue`, `src/components/UnitsTab.vue`, `src/components/FieldsTab.vue`, `src/components/FormDesignerTab.vue`, `src/components/VisitsTab.vue`, `src/components/SimulatedCRFForm.vue`, `src/components/TemplatePreviewDialog.vue`, `src/components/DocxCompareDialog.vue`, `src/components/DocxScreenshotPanel.vue` |
| Composables | `src/composables/useApi.js`, `src/composables/useCRFRenderer.js`, `src/composables/formFieldPresentation.js`, `src/composables/searchRanking.js`, `src/composables/useOrdinalQuickEdit.js`, `src/composables/fieldDefinitionVisibility.js`, `src/composables/projectDeleteConfirmation.js`, `src/composables/formDesignerPreviewModel.js`, `src/composables/useColumnResize.js`, `src/composables/useRowResize.js`, `src/composables/useSessionTimer.js`, `src/composables/useDesignerHistory.js`, `src/composables/useOrderableList.js`, `src/composables/useSortableTable.js`, `src/composables/formDesignerPropertyEditor.js`, `src/composables/exportDownloadState.js`, `src/composables/visitPreviewLandscape.js`, `src/composables/useLazyTabs.js`, `src/composables/usePerfBaseline.js` |
| Styles | `src/styles/main.css` |
| Config | `package.json`, `vite.config.js` |

## Change Log
- `2026-06-29`: `FormDesignerTab.vue` now adds a complete-mode-only eCRF / aCRF preview toggle in both the canvas header and the fullscreen designer `#header`, sharing a persisted local `crf_view_mode` that normalizes back to `eCRF` whenever `editMode` is false. aCRF preview overlays field `variable_name` / form `domain` labels inside the two designer `.word-page` instances only, mirrors the backend inline-header anchoring contract, keeps `pointer-events: none` so resize / quick-edit interactions still work, and increases the frontend test directory from 38→39 files (38 `.test.js` + `testProperty.js`) with the new `acrfViewToggle.test.js` coverage.
- `2026-06-29`: `App.vue` now wires the Word export dropdown to real eCRF / aCRF downloads. `导出aCRF` reuses the existing export path with `annotated: true`, falls back to `_aCRF.docx`, and the source-level shell test now locks the annotated request body / filename branching so the dropdown no longer regresses back to a toast-only placeholder.
- `2026-06-25`: VisitsTab right-side visit-form list now mirrors the left visit list with a bordered `el-table`, reuses `useSortableTable` instead of a handwritten `vuedraggable` list, reinitializes drag handling after visit switches / list reloads, and keeps ordinal quick edit, preview, and remove actions inside table columns. Removed the orphaned `.manual-list-header` / `visit-form-*` header styles and updated the related source-level header/ordering wiring tests.
- `2026-06-24`: Ordinal quick edit for ordered frontend lists. Added `useOrdinalQuickEdit.js` as the shared double-click ordinal input helper for codelists, codelist options, units, fields, visits, visit-form relations, and the left-side form list in `FormDesignerTab.vue`; it reuses existing reorder endpoints, rejects out-of-range ordinal jumps instead of silently clamping them into writes, keeps filter-disabled semantics aligned with drag sorting, restores the previous order on save failure, and focuses the temporary `el-input-number` through a shared input ref. Added `useOrdinalQuickEdit.test.js` and `ordinalQuickEditWiring.test.js`, and expanded `orderingStructure.test.js` to cover the new wiring contract.
- `2026-06-23`: Field library inline codelist editing. `FieldsTab.vue` choice-field option row now offers inline 新增字典 / 编辑字典 (icon buttons + two dialogs), reusing `POST /codelists`, `PUT /codelists/{id}/snapshot`, and `GET /codelists/{id}/references` with impact confirmation, dual cache invalidation (codelists + field-definitions), and global `refreshKey` sync; on save failure it refreshes to the latest codelist data and reports the error. Implemented standalone in FieldsTab (no `FormDesignerTab.vue` changes, backend unchanged); brief mode hides option OID/编码 consistent with `CodelistsTab`. Test directory 32→33 (added `fieldsTabCodelistQuickEdit.test.js`).
- `2026-06-23`: Frontend ranked fuzzy search refresh. Composables 15→16 (added `searchRanking.js`, a pure helper for exact-first fuzzy ordering and shortest partial-match ordering), test directory 30→32 (31 `.test.js` + `testProperty.js`; added `searchRanking.test.js` and `searchRankingWiring.test.js`). `CodelistsTab.vue`, `UnitsTab.vue`, `FieldsTab.vue`, `FormDesignerTab.vue`, and `VisitsTab.vue` now route user-facing search lists through the shared helper; unit and codelist option searches preserve previous concatenated-field matching.
- `2026-06-18`: Documentation sync refresh. Test directory 28→30 (added `editModeHiddenIdentifiers.test.js` and `tableHeaderStyle.test.js`, currently 29 `.test.js` + `testProperty.js`); added global `editMode` brief/full modes, OID/variable-name show/hide contracts, and Element Plus fixed column header plus handwritten list header style conventions.
- `2026-06-15` (task `06-15-designer-new-field-draft`): new fields changed to local draft state. `newField` no longer persists immediately; it constructs a draft with a complete local `field_definition` (`id='__draft__'`, `__draft:true`), inserts it into `formFields`, and selects it; only the top-bar "Save" button (`saveDraftField`) sequentially `POST field-definitions` + `POST forms/{id}/fields` to persist, replace the draft, and record one "new field" action in the undo stack. The property autosave watcher short-circuits drafts to `applyEditorToDraft` local write-back; `removeField`, `openQuickEdit`, and `toggleInline` add function-level guards for drafts; `addField` / `addLogRow` call `confirmDiscardDraft` before persisting to prevent `loadFormFields` from overwriting the draft; switching forms / selecting fields / creating again uniformly goes through `confirmDiscardDraft` (save/discard/cancel); when a draft exists, sorting is disabled and draft rows do not participate in batch selection or inline quick toggles. Dragging an existing definition from the field library through `addField` keeps immediate persistence. Test directory 27→28 (added `designerNewFieldDraft.test.js`, 16 cases), full suite 257 passed.
- `2026-06-15` (task `06-15-designer-undo-redo-20`): added designer in-memory undo/redo. Composables 14→15 (added `useDesignerHistory.js`, undo/redo dual stacks, limit 20, id remapping, busy lock), test directory 26→27 (added `designerHistory.test.js`, 11 cases). `FormDesignerTab.vue` top bar added "Undo" and "Redo" buttons and binds Ctrl+Z / Ctrl+Y (when focus is inside input controls, native undo takes precedence). Six action types (property edit / ordering / add / new field / delete / batch delete) are connected to history; ordering records history through `recordReorderHistory` in both drag and keyboard paths; property replay replays colors for both log rows and regular fields (consistent with forward save); replay failure restores the record id snapshot to prevent stack pollution; backend unchanged, and delete inverse operations reuse existing `POST /forms/{id}/fields` (carrying `order_index` and full attributes).
- `2026-06-14`: Documentation sync refresh. Components 12→13 (added `SessionTimer.vue`), composables 11→14 (added `useSessionTimer.js`, `useRowResize.js`, `formDesignerPreviewModel.js`), test directory 22→26 (25 `.test.js` + `testProperty.js`; added regressions for session countdown, row height dragging, preview view model, and Docx two-column evidence panel); added conventions for session renewal, row height dragging, and preview model caching.
- `2026-05-12 17:42:57`: Incremental scan refresh. Tests 21→22 files (added `wordPageGeometry.test.js`, locking the A4 page geometry and table layout CSS contract for Word preview/export); updated the testing focus list.
- `2026-05-08 18:26:34`: Incremental scan refresh. Tests 20→21 files (added `testProperty.js`); added `scripts/` directory entry and testing utility notes.
- `2026-05-08`: FormDesignerTab note display migrated to top bar/section-title, added per-form `paper_orientation` control and old `forceLandscape` migration; synced frontend tests and styles.
- `2026-04-28 Tuesday 08:31:55 PDT`: Full scan refresh. Source 26 files (components 12, composables 11, styles 1, entries 2), tests 20 files. Added complete testing focus list and file list.
- `2026-04-27 Monday 05:45:45 PDT`: Initial generation.
