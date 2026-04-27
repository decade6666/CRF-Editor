## 1. Backend - Model, Schema, Migration & Template Fix

- [x] 1.1 Add `source: Mapped[str]` column to `Project` model in `backend/src/models/project.py` with `default="manual"`, `server_default="manual"`, `String(32)`, `nullable=False`
- [x] 1.2 Add `source: str = "manual"` field to `ProjectResponse` in `backend/src/schemas/project.py`; confirm `source` is NOT in `ProjectCreate` or `ProjectUpdate`
- [x] 1.3 Add `_migrate_add_project_source(engine)` function to `backend/src/database.py` following existing `_migrate_add_code_columns` pattern; SQL: `ALTER TABLE "project" ADD COLUMN source VARCHAR(32) NOT NULL DEFAULT 'manual'`; call it inside `init_db()` after existing migration calls
- [x] 1.4 Fix `ImportService.get_template_projects` in `backend/src/services/import_service.py` to use column-level select (e.g., `select(Project.id, Project.name, Project.version, ...)`) instead of full entity `select(Project)` to avoid crashes with old template databases that lack the `source` column

## 2. Backend - Import Source Marking

- [x] 2.1 Add `mark_project_imported_if_manual(session, project_id, source)` utility function (can be added to `backend/src/services/import_service.py` or a shared utils module); uses conditional SQL `UPDATE project SET source=:source WHERE id=:id AND source='manual'` to implement first-import-wins semantics
- [x] 2.2 Call `mark_project_imported_if_manual(session, project_id, "word_import")` in `DocxImportService.import_forms` (or the router's `execute_docx_import` endpoint) after a successful import in `backend/src/services/docx_import_service.py` (or `backend/src/routers/import_docx.py`)
- [x] 2.3 Call `mark_project_imported_if_manual(session, project_id, "template_import")` in `ImportService._do_import` (or the router's `execute_import` endpoint) after a successful import in `backend/src/services/import_service.py` (or `backend/src/routers/import_template.py`)

## 3. Backend - Lock Guard Infrastructure

- [x] 3.1 Create `backend/src/routers/_project_guard.py` with guard functions: `ensure_project_design_writable_by_id(session, project_id)`, `ensure_form_design_writable(session, form)`, `ensure_form_field_design_writable(session, form_field)`, `ensure_field_definition_design_writable(session, fd)`, `ensure_unit_design_writable(session, unit)`, `ensure_codelist_design_writable(session, codelist)`; each raises `HTTPException(403, "该项目为导入项目，不允许修改字段/表单设计")` when `project.source != "manual"`

## 4. Backend - Apply Guards to forms.py

- [x] 4.1 Add lock guard to `create_form` in `backend/src/routers/forms.py` (call after project existence check)
- [x] 4.2 Add lock guard to `update_form` (call after loading form, before business validation)
- [x] 4.3 Add lock guard to `delete_form` (call after loading form, before reference check)
- [x] 4.4 Add lock guard to `batch_delete_forms`
- [x] 4.5 Add lock guard to `reorder_forms`
- [x] 4.6 Add lock guard to `copy_form`
- [x] 4.7 Add lock guard to `add_form_field` (resolve project_id from form_id first)
- [x] 4.8 Add lock guard to `update_form_field`, `delete_form_field`, `update_inline_mark` (resolve via form_field.form.project_id)
- [x] 4.9 Add lock guard to `reorder_form_fields`, `batch_delete_form_fields`

## 5. Backend - Apply Guards to fields.py

- [x] 5.1 Add lock guard to `create_field_definition` in `backend/src/routers/fields.py`
- [x] 5.2 Add lock guard to `update_field_definition`
- [x] 5.3 Add lock guard to `delete_field_definition`
- [x] 5.4 Add lock guard to `batch_delete_field_definitions`
- [x] 5.5 Add lock guard to `reorder_field_definitions`
- [x] 5.6 Add lock guard to `copy_field_definition`

## 6. Backend - Apply Guards to codelists.py

- [x] 6.1 Add lock guard to `create_codelist` in `backend/src/routers/codelists.py`
- [x] 6.2 Add lock guard to `update_codelist`
- [x] 6.3 Add lock guard to `delete_codelist`
- [x] 6.4 Add lock guard to `batch_delete_codelists`
- [x] 6.5 Add lock guard to `reorder_codelists`
- [x] 6.6 Add lock guard to all codelist option write endpoints (`add_option`, `update_option`, `delete_option`, `batch_delete_options`, `reorder_options`)

## 7. Backend - Apply Guards to units.py

- [x] 7.1 Add lock guard to `create_unit` in `backend/src/routers/units.py`
- [x] 7.2 Add lock guard to `update_unit`
- [x] 7.3 Add lock guard to `delete_unit`
- [x] 7.4 Add lock guard to `batch_delete_units`
- [x] 7.5 Add lock guard to `reorder_units`

## 8. Frontend - isLocked State & Tab Control

- [x] 8.1 Add `isLocked` computed property to `App.vue`: `const isLocked = computed(() => !!selectedProject.value && selectedProject.value.source !== 'manual')`
- [x] 8.2 Wrap codelists, units, fields, and designer tab panes with `v-if="!isLocked"` in `App.vue`
- [x] 8.3 Add `watch(selectedProject, ...)` in `App.vue`: when switching to a locked project, if `activeTab` is one of `['codelists', 'units', 'fields', 'designer']`, reset `activeTab` to `'info'`

## 9. Frontend - Lock UI Indicators

- [x] 9.1 Add lock icon + tooltip to locked project entries in the project sidebar list: show `<el-icon><Lock /></el-icon>` with `<el-tooltip>` next to project name when `project.source !== 'manual'`
- [x] 9.2 Add `<el-alert>` lock banner inside the project info tab area in `App.vue`: visible only when `isLocked` is true; text explains the project is imported and structural changes must be made via re-import

## 10. Tests

- [x] 10.1 Test `_migrate_add_project_source`: create DB without `source` column, run migration, verify column exists and all rows have `source = 'manual'`
- [x] 10.2 Test migration idempotency: run `_migrate_add_project_source` twice, verify no error
- [x] 10.3 Test template library compatibility: call `ImportService.get_template_projects` against an old template DB without `source` column, verify no exception
- [x] 10.4 Test source marking on Word import: `project.source` is `"manual"` → after `execute_docx_import` succeeds → `project.source == "word_import"`
- [x] 10.5 Test source marking on template import: `project.source` is `"manual"` → after `execute_import` succeeds → `project.source == "template_import"`
- [x] 10.6 Test first-import-wins: `project.source` is `"word_import"` → run template import → `project.source` remains `"word_import"`
- [x] 10.7 Test 403 matrix: for a locked project, verify that representative write endpoints for forms, field_definitions, codelists, and units return `HTTP 403`
- [x] 10.8 Test allow matrix: for a locked project, verify that visit CRUD, project metadata update, export, and import endpoints return non-403
- [x] 10.9 Test `source` not writable via `PUT /projects/{id}`: send `source: "manual"` in update payload for a locked project, verify `source` is unchanged
