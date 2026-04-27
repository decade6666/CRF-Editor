## REMOVED Features

### Removal: CodelistsTab, UnitsTab, FieldsTab
The system SHALL NOT display CodelistsTab (options), UnitsTab (units), or FieldsTab (field definitions) in the UI. These tabs are completely removed regardless of project lock state.

#### Deleted files
- `frontend/src/components/CodelistsTab.vue`
- `frontend/src/components/UnitsTab.vue`
- `frontend/src/components/FieldsTab.vue`
- `frontend/src/composables/useOrderableList.js`

### Removal: Form CRUD and Field Designer in FormDesignerTab
The system SHALL NOT provide form create/edit/delete/copy functionality or field designer UI. FormDesignerTab is reduced to form list (with order_index adjustment) + read-only Word preview.

#### Deleted capabilities
- Form toolbar buttons (create, batch delete)
- Table checkbox column and action column (edit/delete/copy)
- "Design Form" button in Word preview area
- All 6 el-dialog components (create form, edit form, designer, quick-add codelist, quick-edit codelist, quick-add unit)
- Field designer panel (field library, canvas, property editor, drag-sort)

### Removal: Backend CRUD routes
The following backend route files are completely deleted:
- `backend/src/routers/codelists.py` (13 routes)
- `backend/src/routers/units.py` (8 routes)

The following routes are removed from remaining files:
- `fields.py`: 14 write routes removed, only GET endpoints retained
- `forms.py`: 7 write routes removed, only GET list + PUT update retained

## MODIFIED Requirements

### Requirement: FormDesignerTab retained functionality
The FormDesignerTab SHALL display:
- Form list table with search, order_index adjustment (el-input-number + updateFormOrder)
- Read-only Word-style preview (renderGroups, needsLandscape, renderCellHtml, getInlineRows)

### Requirement: activeTab sanitization
The system SHALL validate activeTab against `['info', 'designer', 'visits']`. Any invalid value SHALL fall back to `'info'`.

### Requirement: LOCKED_TABS scope reduction
LOCKED_TABS is reduced from `['codelists', 'units', 'fields', 'designer']` to `['designer']`.

## PRESERVED (not affected)

- Backend models/, repositories/, services/, schemas/ (import/export dependencies)
- GET /api/projects/{pid}/forms, GET /api/projects/{pid}/field-definitions, GET /api/forms/{fid}/fields
- PUT /api/forms/{fid} (with ensure_form_design_writable guard)
- VisitsTab, ProjectInfoTab, Word export, template/Word import, isLocked mechanism
- import-template and import-docx routes

## Non-functional
- `npm run build` zero errors/warnings (chunkSizeWarningLimit: 1200)
- Backend starts without errors
- No unused imports remain
- No console errors
