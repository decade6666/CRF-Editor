## ADDED Requirements

### Requirement: Template preview uses form-designer-compatible render semantics
The system SHALL expose a template preview payload that is sufficient to render the left pane with the same structural semantics as `FormDesignerTab.vue`.

#### Scenario: Preview payload includes designer render semantics
- **WHEN** the frontend requests template preview data for a template form
- **THEN** the response includes each selectable import item's source `form_field.id`, `form_id`, `source_project_id`, `order_index`, `is_log_row`, `label_override`, `help_text`, `default_value`, `inline_mark`, `bg_color`, and `text_color`
- **AND** it includes nested field-definition render data needed by the designer preview, including field type, label, numeric/date formatting, codelist options, and unit symbol

#### Scenario: Preview preserves structural rows
- **WHEN** the source template form contains label rows, log rows, or other structural form-field rows
- **THEN** the preview response includes those rows as explicit importable items rather than silently omitting them

### Requirement: Template preview dialog is dual-pane and selection-driven
The system SHALL render the template preview dialog as a dual-pane view where the left pane previews the selected import items and the right pane lists all importable items for checkbox selection.

#### Scenario: Left pane reflects the same selected import items as the right pane
- **WHEN** the user checks or unchecks items in the right pane
- **THEN** the left pane updates to preview exactly that selected set using the form-designer-compatible render semantics

#### Scenario: Structural rows are visible and selectable
- **WHEN** the source template contains label rows or log rows
- **THEN** those rows appear in both the right-side selectable list and the left-side preview
- **AND** the user can explicitly include or exclude them through the same checkbox interaction used for regular fields

#### Scenario: Right pane uses source form-field IDs as selection values
- **WHEN** the user selects importable items in the right pane
- **THEN** the selection values correspond to source template `form_field.id` values
- **AND** the frontend does not substitute `field_definition.id` values for this flow

### Requirement: Execute import preserves preview semantics for the selected set
The system SHALL import exactly the selected template items and preserve the render-affecting form-field properties used by the preview.

#### Scenario: Execute import validates selected IDs
- **WHEN** the frontend submits `field_ids` for template import execution
- **THEN** the backend treats them as source template `form_field.id` values
- **AND** the set must be duplicate-free and wholly contained within the selected `form_ids`
- **AND** invalid or out-of-scope IDs are rejected

#### Scenario: Execute import copies render-affecting form-field properties
- **WHEN** the backend creates target `FormField` rows for selected template items
- **THEN** it preserves render-affecting properties used by the left-pane preview, including `is_log_row`, `label_override`, `help_text`, `default_value`, `inline_mark`, `bg_color`, and `text_color`

#### Scenario: Imported order matches preview order
- **WHEN** a selected item set is previewed and then imported
- **THEN** the imported target form preserves the same relative order for the selected items as the previewed order

### Requirement: Runtime template access is strictly read-only
The system SHALL treat template preview and template import as read-only operations against the user-provided source `.db` file.

#### Scenario: Preview does not mutate the source template database
- **WHEN** the backend opens a template database for preview
- **THEN** it does not execute schema-altering statements against the user-provided source file
- **AND** it does not persist compatibility repairs back into that file

#### Scenario: Import does not mutate the source template database
- **WHEN** the backend imports forms from a template database
- **THEN** it reads from the source template database without altering its schema or row data

### Requirement: Legacy template compatibility is explicit and out-of-band
The system SHALL handle incompatible legacy template databases through a separate conversion step, not through runtime mutation during preview or import.

#### Scenario: Incompatible legacy template database is rejected with a stable JSON error
- **WHEN** template preview or template import receives a legacy template database that does not satisfy the runtime compatibility contract
- **THEN** the backend returns a JSON error body containing `detail` and `code`
- **AND** the response does not fall through as a plain-text or HTML error
- **AND** the error clearly indicates that the template database must be converted before use

#### Scenario: Template conversion script writes a new compatible database file
- **WHEN** the operator runs the dedicated legacy-template conversion script on an old template `.db`
- **THEN** the script writes a new compatible `.db` file
- **AND** it does not overwrite or modify the original input file
- **AND** the converted file can be used by runtime preview and import without requiring runtime schema mutation