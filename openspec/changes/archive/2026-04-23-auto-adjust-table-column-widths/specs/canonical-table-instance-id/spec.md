## ADDED Requirements

### Requirement: Canonical table_instance_id based on field IDs
All table instances in the CRF designer SHALL be identified by a canonical `table_instance_id` of the form `kind:fieldIds=<ordered-field-ids>`, where `kind` is one of `normal`, `inline`, or `unified`, and `<ordered-field-ids>` is a comma-separated list of field IDs in visual order within that table instance.

#### Scenario: Normal table instance ID
- **WHEN** a normal table contains fields with IDs 1, 2, 3
- **THEN** its `table_instance_id` is `normal:fieldIds=1,2,3`

#### Scenario: Inline table instance ID
- **WHEN** an inline block contains fields with IDs 4, 5
- **THEN** its `table_instance_id` is `inline:fieldIds=4,5`

#### Scenario: Unified table instance ID
- **WHEN** a unified table contains fields with IDs 6, 7, 8, 9 across multiple segments
- **THEN** its `table_instance_id` is `unified:fieldIds=6,7,8,9`

#### Scenario: Field reorder preserves identity
- **WHEN** fields within a table instance are reordered (e.g., field 2 moved before field 1)
- **THEN** the `table_instance_id` changes to reflect new order: `normal:fieldIds=2,1,3`
- **AND** localStorage entries with the old ID become orphan data

### Requirement: localStorage key format uses canonical table_instance_id
The `useColumnResize` composable SHALL construct localStorage keys as `crf:designer:col-widths:<form_id>:<table_instance_id>` where `<table_instance_id>` follows the canonical format defined above.

#### Scenario: Key construction
- **WHEN** saving column ratios for a normal table with fieldIds=1,2,3 in form 42
- **THEN** the localStorage key is `crf:designer:col-widths:42:normal:fieldIds=1,2,3`

#### Scenario: Key migration from legacy format
- **WHEN** the application starts and finds a legacy key `crf:designer:col-widths:42:0-normal-2`
- **THEN** the application attempts to migrate it to the new format using current field IDs
- **AND** the legacy key is deleted after successful migration
- **AND** if migration fails (e.g., form structure changed), the legacy key is orphaned

### Requirement: Export API accepts column_width_overrides per table instance
The Word export API SHALL accept a `column_width_overrides` object in the POST body, mapping `table_instance_id` to normalized fraction arrays. The backend SHALL use these overrides in preference to content-driven defaults.

#### Scenario: Export with overrides
- **WHEN** a POST request to `/api/export/word` includes `column_width_overrides: {"normal:fieldIds=1,2,3": [0.4, 0.6]}`
- **THEN** the exported Word document uses 40% width for the label column and 60% for the control column in that table instance

#### Scenario: Export without overrides
- **WHEN** the POST request does not include `column_width_overrides` or it is empty
- **THEN** the backend uses content-driven defaults from `plan_normal_table_width` / `plan_inline_table_width` / `plan_unified_table_width`

#### Scenario: Partial overrides
- **WHEN** `column_width_overrides` contains only some table instances
- **THEN** only those instances use overrides; others use content-driven defaults
