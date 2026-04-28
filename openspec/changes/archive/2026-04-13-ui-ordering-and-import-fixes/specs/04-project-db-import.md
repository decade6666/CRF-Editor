## ADDED Requirements

### Requirement: Project DB import resolves same-name conflicts with `_导入` suffixes
The system SHALL allow project `.db` import to succeed when the current user already has a project with the same name by assigning a deterministic `_导入` suffix.

#### Scenario: First conflict uses `_导入`
- **WHEN** the imported project's original name already exists among the current user's non-deleted projects
- **THEN** the imported project is renamed to `原名_导入`

#### Scenario: Subsequent conflicts increment deterministically
- **WHEN** `原名_导入` already exists among the current user's non-deleted projects
- **THEN** the imported project is renamed to `原名_导入2`, then `原名_导入3`, and so on

#### Scenario: Deleted projects do not reserve names for import
- **WHEN** the only conflicting project names are in the recycle-bin state for the same owner
- **THEN** those deleted projects do not block reuse of the original name or its `_导入` suffix sequence for import

#### Scenario: Single-project import and database-merge import share the same naming rule
- **WHEN** the application resolves project-name conflicts for either `/import/project-db` or `/import/database-merge`
- **THEN** both routes apply the same `_导入` naming algorithm for the same owner scope

### Requirement: Project DB import errors are always returned as stable JSON
The system SHALL return JSON error bodies for project `.db` import failures on all application-handled paths, with a stable machine-readable contract.

#### Scenario: Known validation failures return `detail` and `code`
- **WHEN** project `.db` import fails because the file is not a valid SQLite database, exceeds the size limit, lacks required tables, or has an incompatible schema
- **THEN** the route returns a JSON error body containing `detail` and `code`

#### Scenario: Unknown import failures return `detail` and `code`
- **WHEN** an unexpected exception occurs during project `.db` import or database-merge import
- **THEN** the route logs the exception
- **AND** it returns a JSON error body containing stable `detail` and `code` fields instead of a plain-text `Internal Server Error`

### Requirement: Failed import leaves no partial project residue
The system SHALL preserve request-level import atomicity so that failed project `.db` imports leave no partial projects or orphaned child resources.

#### Scenario: Failure during clone or flush rolls back the import
- **WHEN** import fails after naming has been resolved but before the request transaction commits
- **THEN** no partially imported project or child resources remain in the database
- **AND** no import name is left reserved by partial state

#### Scenario: Repeating the same failing import is idempotent
- **WHEN** the same input deterministically fails multiple times
- **THEN** repeating the import does not accumulate partial data, orphaned rows, or reserved names

### Requirement: New exports preserve `FormField` identity semantics for re-import
The system SHALL preserve the database invariants needed for exported project `.db` files to be re-imported after the host application upgrades legacy databases.

#### Scenario: Legacy `form_field` migration preserves identity and ordering semantics
- **WHEN** the host application upgrades a database that still contains legacy `form_field.sort_order` data
- **THEN** the resulting `form_field` table preserves an ORM-recognizable `id` primary key
- **AND** it preserves the required non-null / uniqueness semantics for `id`
- **AND** it preserves the runtime `order_index` column used by the current application
- **AND** it preserves the required relationship semantics for `form_id` and `field_definition_id`

#### Scenario: Newly exported project database can be imported back
- **WHEN** a project is exported from a host database after the legacy `form_field` migration has been applied correctly
- **THEN** importing that exported project through `/import/project-db` does not fail with `FormField NULL identity key`

### Requirement: Historical incompatible project exports fail deterministically
The system SHALL not silently attempt online repair of already-exported incompatible project `.db` files outside the supported compatibility window.

#### Scenario: Historical bad export is rejected before unstable clone failure
- **WHEN** the user imports a previously exported project `.db` whose `form_field` structure does not satisfy the current import compatibility contract
- **THEN** the backend rejects the file with a stable JSON error body containing `detail` and `code`
- **AND** it does not fall through to an unstructured clone / flush failure
- **AND** it does not create any partial project state