## ADDED Requirements

### Requirement: Quick-edit codelist rename refreshes dependent designer state
After the user saves a quick-edit codelist rename inside the form design flow, the system SHALL refresh the dependent front-end designer state so that the property panel and preview use the latest codelist name without requiring manual page refresh.

#### Scenario: Property panel shows renamed codelist immediately after save
- **WHEN** the user quick-edits and saves a codelist name used by the currently edited field
- **THEN** the field property panel shows the latest saved codelist name without requiring manual refresh

#### Scenario: Preview uses renamed codelist immediately after save
- **WHEN** the user quick-edits and saves a codelist name used by fields in the current form
- **THEN** the related preview reads from refreshed front-end state and shows the latest saved codelist name where applicable

#### Scenario: Re-saving identical codelist name is idempotent
- **WHEN** the user saves the same codelist name repeatedly without changing any data
- **THEN** the designer state remains stable and does not introduce duplicate refresh side effects

---

### Requirement: Clearing field unit persists as null
The system SHALL persist field unit clearing by explicitly submitting `unit_id: null` and SHALL reflect the cleared state after the save result is read back.

#### Scenario: Clearing selected unit submits null
- **WHEN** the user clears the unit selection for a field and saves the field properties
- **THEN** the update request explicitly includes `unit_id: null`

#### Scenario: Cleared unit remains empty after reload
- **WHEN** the user saves a cleared unit and the field data is reloaded
- **THEN** both `unit_id` and `unit` are empty in the returned field state

#### Scenario: Re-clearing an already empty unit is idempotent
- **WHEN** the user saves a field whose unit is already empty
- **THEN** the persisted result remains empty and no stale unit value reappears

---

### Requirement: Same-name codelists are reused only when option semantics are identical
The system SHALL reuse an existing same-name codelist during template import only when its option semantic signature exactly matches the source codelist. The semantic signature SHALL include option order, `code`, `decode`, and `trailing_underscore`.

#### Scenario: Identical signature allows reuse
- **WHEN** the source codelist name matches a target-project codelist and all option signatures are identical
- **THEN** the import reuses the existing target codelist

#### Scenario: Different trailing underscore blocks reuse
- **WHEN** the source and target codelists have the same name but differ in any option `trailing_underscore` value
- **THEN** the import does not reuse the existing target codelist

#### Scenario: Different code or order blocks reuse
- **WHEN** the source and target codelists have the same name but differ in option order or `code`
- **THEN** the import does not reuse the existing target codelist

---

### Requirement: Conflicting same-name codelists get imported with deterministic suffix naming
When a same-name codelist conflict prevents reuse, the system SHALL create a new imported codelist with a deterministic Chinese suffix naming strategy: `名称（导入）`, `名称（导入2）`, and so on.

#### Scenario: First conflicting import uses 导入 suffix
- **WHEN** the target project already contains a same-name codelist with a different semantic signature
- **THEN** the imported codelist is created as `名称（导入）`

#### Scenario: Repeated conflicts increment suffix number
- **WHEN** one or more imported conflict copies already exist
- **THEN** the next conflicting imported codelist uses the next available suffix number such as `名称（导入2）`

---

### Requirement: Template import preserves trailing underscore metadata
The system SHALL preserve `CodeListOption.trailing_underscore` metadata across template preview and template import execution.

#### Scenario: Template preview returns structured option metadata
- **WHEN** the user previews fields from a template database
- **THEN** each choice option payload includes enough structured metadata to represent `code`, `decode`, and `trailing_underscore`

#### Scenario: Imported template preserves trailing underscore values
- **WHEN** the user executes a template import containing choice options with `trailing_underscore`
- **THEN** the persisted imported codelist options preserve the same `trailing_underscore` values as the source template

#### Scenario: Export after template import preserves source tail-line semantics
- **WHEN** the imported field is later exported to Word
- **THEN** its option tail-line behavior remains consistent with the source template semantics

---

### Requirement: Vertical multi-select semantics are authoritative by field type
The system SHALL treat `field_type` as the authoritative source for `多选（纵向）` semantics across preview, import, persistence, and export.

#### Scenario: Export preserves vertical multi-select layout semantics
- **WHEN** a field is persisted as `多选（纵向）`
- **THEN** the export path renders it using vertical checkbox layout semantics rather than falling back to horizontal multi-select behavior

#### Scenario: Import persistence keeps vertical multi-select field type
- **WHEN** a previewed or imported field is identified as `多选（纵向）`
- **THEN** the persisted field type remains `多选（纵向）` and is not downgraded during save or reload

#### Scenario: Round-trip preserves vertical multi-select type
- **WHEN** a `多选（纵向）` field goes through preview, save, reload, and export
- **THEN** its field type and layout semantics remain stable across the full round-trip

---

### Requirement: DOCX trailing underscores remain literal text by default
The system SHALL treat trailing underscores read from DOCX choice labels as literal text by default and SHALL NOT implicitly convert them into `trailing_underscore` metadata.

#### Scenario: DOCX label suffix remains part of decode text
- **WHEN** a DOCX-imported option label ends with `_`
- **THEN** the imported option keeps the underscore in its `decode` text by default

#### Scenario: DOCX import does not synthesize trailing underscore metadata
- **WHEN** the DOCX parser reads an option label whose only signal is a trailing `_`
- **THEN** the system does not infer `trailing_underscore=1` without an explicit and separate rule

#### Scenario: Literal underscore text survives reload
- **WHEN** a DOCX-imported option label contains a literal trailing underscore
- **THEN** reloading the imported field preserves the same decode text and does not silently rewrite it into metadata