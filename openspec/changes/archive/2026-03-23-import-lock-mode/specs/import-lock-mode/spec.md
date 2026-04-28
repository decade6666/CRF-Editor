## ADDED Requirements

### Requirement: Project source tracking
The system SHALL record the creation source of each project via a `source` field with values `manual | word_import | template_import`. New projects default to `manual`. The `source` field SHALL NOT be writable via `ProjectCreate` or `ProjectUpdate` API endpoints.

#### Scenario: New project defaults to manual
- **WHEN** a project is created via `POST /projects`
- **THEN** `project.source` is set to `"manual"`

#### Scenario: source not writable via update
- **WHEN** a `PUT /projects/{id}` request includes a `source` field
- **THEN** the `source` field is ignored and the existing value is preserved

#### Scenario: source exposed in project response
- **WHEN** any endpoint returns a `ProjectResponse`
- **THEN** the response includes the `source` field with the correct value

---

### Requirement: Import source marking
After a successful import, the system SHALL mark the project's `source` to reflect the import type. The first import wins: if `source` is already non-`manual`, subsequent imports SHALL NOT overwrite it.

#### Scenario: Word import marks source
- **WHEN** `POST /import-docx/execute/{project_id}` completes successfully
- **THEN** if `project.source == "manual"`, it is updated to `"word_import"`

#### Scenario: Template import marks source
- **WHEN** `POST /import-template/execute/{project_id}` completes successfully
- **THEN** if `project.source == "manual"`, it is updated to `"template_import"`

#### Scenario: Re-import does not overwrite source
- **WHEN** a project with `source == "word_import"` undergoes another successful import
- **THEN** `project.source` remains `"word_import"` (unchanged)

#### Scenario: Failed import does not mark source
- **WHEN** an import operation fails or is rolled back
- **THEN** `project.source` is not changed

---

### Requirement: Design lock enforcement (backend)
The system SHALL return `HTTP 403 Forbidden` for design-write operations on locked projects (`source != "manual"`). The 403 response SHALL be returned before any business validation logic executes.

Locked operations (SHALL be blocked):
- `POST/PUT/DELETE` on forms (create, update, delete, batch-delete, reorder, copy, form-field add/update/delete/reorder)
- `POST/PUT/DELETE` on field definitions (create, update, delete, batch-delete, reorder, copy)
- `POST/PUT/DELETE` on codelists and options (create, update, delete, batch-delete, reorder)
- `POST/PUT/DELETE` on units (create, update, delete, batch-delete, reorder)

Permitted operations (SHALL NOT be blocked regardless of source):
- All visit CRUD, reorder, copy
- Visit-form association add/remove/reorder
- Project metadata update (`PUT /projects/{id}`)
- Logo upload
- All export endpoints
- All import (docx/template) endpoints
- All read/list/reference endpoints

#### Scenario: Locked project blocks form creation
- **WHEN** `POST /forms` is called for a project with `source != "manual"`
- **THEN** the response is `HTTP 403` with message `"该项目为导入项目，不允许修改字段/表单设计"`

#### Scenario: Locked project blocks field definition creation
- **WHEN** `POST /field-definitions` is called for a locked project
- **THEN** the response is `HTTP 403`

#### Scenario: Locked project blocks codelist creation
- **WHEN** `POST /codelists` is called for a locked project
- **THEN** the response is `HTTP 403`

#### Scenario: Locked project blocks unit creation
- **WHEN** `POST /units` is called for a locked project
- **THEN** the response is `HTTP 403`

#### Scenario: Locked project allows visit operations
- **WHEN** any visit CRUD endpoint is called for a locked project
- **THEN** the response is `HTTP 200/201/204` (not blocked)

#### Scenario: Locked project allows metadata update
- **WHEN** `PUT /projects/{id}` is called for a locked project
- **THEN** the response is `HTTP 200` (not blocked)

#### Scenario: Locked project allows re-import
- **WHEN** an import endpoint is called for a locked project
- **THEN** the response is not `HTTP 403` (import proceeds normally)

#### Scenario: Locked project allows export
- **WHEN** any export endpoint is called for a locked project
- **THEN** the response is not `HTTP 403`

---

### Requirement: Database migration compatibility
The system SHALL automatically migrate existing databases to add the `source` column on startup. Existing projects SHALL default to `"manual"` after migration.

#### Scenario: Old database gains source column on startup
- **WHEN** the application starts with an existing database lacking the `source` column
- **THEN** `source VARCHAR(32) NOT NULL DEFAULT 'manual'` is added to the `project` table
- **AND** all existing project rows have `source = 'manual'`

#### Scenario: Migration is idempotent
- **WHEN** the migration runs on a database that already has the `source` column
- **THEN** no error is raised and no data is modified

---

### Requirement: Template library query compatibility
The system SHALL query template project libraries using column-level selection (not full entity load) to remain compatible with template databases that predate the `source` column.

#### Scenario: Template preview works with old template database
- **WHEN** `GET /import-template/preview/{project_id}` is called
- **AND** the template database does not have a `source` column
- **THEN** the response is `HTTP 200` with valid template data (no crash)

---

### Requirement: Frontend lock state UI
The frontend SHALL hide design-related tabs for locked projects and display a clear lock indicator. The hidden tabs are: codelists, units, fields, designer.

#### Scenario: Locked project hides design tabs
- **WHEN** a project with `source != "manual"` is selected
- **THEN** the codelists, units, fields, and designer tabs are not visible

#### Scenario: Unlocked project shows all tabs
- **WHEN** a project with `source == "manual"` is selected
- **THEN** all tabs including codelists, units, fields, and designer are visible

#### Scenario: Lock indicator shown in sidebar
- **WHEN** a locked project is displayed in the project list
- **THEN** a lock icon with tooltip is shown next to the project name

#### Scenario: Lock banner shown in project info tab
- **WHEN** a locked project is selected and the info tab is active
- **THEN** an explanatory banner (el-alert) is displayed stating the project is locked due to import

#### Scenario: Active tab resets on switching to locked project
- **WHEN** the user switches from any project to a locked project
- **AND** the current activeTab is one of the hidden tabs (codelists, units, fields, designer)
- **THEN** activeTab is automatically reset to "info"

#### Scenario: No project selected does not trigger lock
- **WHEN** no project is selected (selectedProject is null)
- **THEN** isLocked is false (design tabs remain visible if they would otherwise be shown)

#### Scenario: Import button remains available for locked projects
- **WHEN** a locked project is selected
- **THEN** the import (Word/template) buttons remain visible and enabled
