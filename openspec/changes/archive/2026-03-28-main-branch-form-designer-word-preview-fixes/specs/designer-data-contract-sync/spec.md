## ADDED Requirements

### Requirement: Inline toggle preserves current default value behavior
The system SHALL align the `inline_mark` state transition rule with the current implementation and updated product constraint: changing a field between inline and non-inline states SHALL NOT introduce extra clearing logic beyond the explicitly submitted field data.

#### Scenario: Disabling inline does not implicitly clear stored default value
- **WHEN** a field with `inline_mark = 1` and a non-empty `default_value` is updated to `inline_mark = 0`
- **THEN** the persisted `default_value` is not implicitly cleared solely because `inline_mark` changed

#### Scenario: Repeating the same inline state is idempotent
- **WHEN** the same field is saved multiple times with the same `inline_mark` value and no new default value change
- **THEN** the persisted `default_value` remains stable and does not disappear or mutate unexpectedly

#### Scenario: State transition follows submitted data instead of hidden cleanup
- **WHEN** a field changes between inline and non-inline states
- **THEN** the resulting `default_value` is determined by the submitted payload and stored data, not by hidden cleanup tied only to `inline_mark`

---

### Requirement: Quick-edit codelist rename refreshes dependent designer state
After the user saves a quick-edit codelist rename inside the form design flow, the system SHALL refresh the dependent designer state so that the property panel and preview use the latest codelist name without requiring manual refresh.

#### Scenario: Property panel shows renamed codelist immediately after save
- **WHEN** the user quick-edits and saves a codelist name used by the currently edited field
- **THEN** the field property panel shows the latest saved codelist name without requiring manual refresh

#### Scenario: Preview uses renamed codelist immediately after save
- **WHEN** the user quick-edits and saves a codelist name used by fields in the current form
- **THEN** the related preview reads from refreshed designer state and shows the latest saved codelist name where applicable

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

### Requirement: Template import preserves trailing underscore metadata
If imported template dictionary options contain `trailing_underscore`, the system SHALL preserve that metadata through the import path so that later preview and export behavior remain consistent.

#### Scenario: Imported codelist option keeps trailing underscore flag
- **WHEN** a template dictionary option with `trailing_underscore` is imported into a target project
- **THEN** the corresponding imported option retains the same `trailing_underscore` value

#### Scenario: Imported metadata supports later preview consistency
- **WHEN** the imported project later renders or exports a choice field backed by the imported dictionary
- **THEN** the presence or absence of trailing fill-line semantics matches the imported source metadata

#### Scenario: Re-importing identical metadata is stable
- **WHEN** the same source dictionary metadata is imported repeatedly into isolated test targets
- **THEN** the resulting imported `trailing_underscore` values remain consistent across runs
