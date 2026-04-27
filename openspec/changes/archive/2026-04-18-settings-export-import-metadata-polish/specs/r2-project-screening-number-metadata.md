## ADDED Requirements

### Requirement: Project stores screening number format as first-class metadata
The system SHALL store the cover-page screening number format as explicit project metadata rather than as global settings or transient export input.

#### Scenario: Project response exposes the field
- **WHEN** the client reads a project through the existing project list, detail, update, copy, or admin recycle-bin response paths
- **THEN** the response includes `screening_number_format`

#### Scenario: Project update persists explicit non-empty values
- **WHEN** the client submits a non-empty `screening_number_format`
- **THEN** the project persists that exact normalized value
- **AND** later reads return the same persisted value

#### Scenario: Empty input preserves empty storage semantics
- **WHEN** the client submits an empty string or whitespace-only `screening_number_format`
- **THEN** the backend normalizes it to empty storage semantics
- **AND** it does not persist a literal whitespace payload

### Requirement: Screening number format uses shared fallback semantics
The system SHALL treat an empty stored `screening_number_format` as a signal to use the default template string `S|__|__||__|__|__|` at read/display and Word-export time.

#### Scenario: Project info UI displays the default when storage is empty
- **WHEN** a project has empty storage semantics for `screening_number_format`
- **THEN** `ProjectInfoTab.vue` displays `S|__|__||__|__|__|` as the editable default value

#### Scenario: Word cover page uses the same default when storage is empty
- **WHEN** a project has empty storage semantics for `screening_number_format`
- **THEN** the Word cover-page `筛选号` value is `S|__|__||__|__|__|`

### Requirement: Screening number format input is validated at the project API boundary
The system SHALL validate `screening_number_format` as bounded single-line text.

#### Scenario: Overlength input is rejected
- **WHEN** the client submits a `screening_number_format` longer than 100 characters
- **THEN** the request fails validation
- **AND** the project is not updated with the invalid value

#### Scenario: Multiline or control-character input is rejected
- **WHEN** the client submits a `screening_number_format` containing a newline or control character
- **THEN** the request fails validation
- **AND** the invalid value is not persisted

### Requirement: Metadata survives project copy and project-db round-trip
The system SHALL preserve `screening_number_format` through copy and project database import/export flows.

#### Scenario: Copy preserves explicit value
- **WHEN** a project with a non-empty `screening_number_format` is copied
- **THEN** the copied project retains the same `screening_number_format`

#### Scenario: New export and re-import preserve explicit value
- **WHEN** a project database containing a non-empty `screening_number_format` is exported and re-imported through the supported project `.db` flow
- **THEN** the imported project retains the same `screening_number_format`

### Requirement: Legacy project-db import remains compatible when the new column is absent
The system SHALL allow old project `.db` files that lack `screening_number_format` to import successfully.

#### Scenario: Legacy import without the new column succeeds
- **WHEN** an imported external `project` table lacks the `screening_number_format` column
- **THEN** project import continues without schema-incompatible failure
- **AND** the imported project uses empty storage semantics for `screening_number_format`

## Properties

### Property: Metadata round-trip consistency
For any valid non-empty `screening_number_format`, project write/read round-trips preserve the same normalized value.

### Property: Shared fallback consistency
For any project with empty storage semantics, all approved readers of `screening_number_format` produce the same default string `S|__|__||__|__|__|`.

### Property: Legacy import compatibility
For any legacy project database that is otherwise import-compatible, the absence of `screening_number_format` alone does not make the import fail.
