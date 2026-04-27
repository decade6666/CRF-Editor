## ADDED Requirements

### Requirement: Frontend collects column width overrides from localStorage on export
The `App.vue` function `collectColumnWidthOverrides()` SHALL iterate over actual localStorage keys matching the pattern `crf:designer:col-widths:<form_id>:*` and collect valid ratio arrays into a `column_width_overrides` object keyed by `table_instance_id`.

#### Scenario: Collect overrides for current form
- **WHEN** `collectColumnWidthOverrides(formId)` is called for form 42
- **THEN** it iterates all localStorage keys matching `crf:designer:col-widths:42:*`
- **AND** it parses each key to extract `table_instance_id`
- **AND** it validates the stored ratio array (length matches expected columns, values in [0.1, 0.9], sum ≈ 1)
- **AND** it returns `{table_instance_id: ratios}` for all valid entries

#### Scenario: Handle legacy key format
- **WHEN** a legacy key `crf:designer:col-widths:42:0-normal-2` is found
- **THEN** the function attempts to resolve it using current form structure
- **AND** if resolved, maps it to the new `table_instance_id` format
- **AND** if unresolvable, skips the entry (logs a warning in development mode)

#### Scenario: Skip invalid entries
- **WHEN** a localStorage entry has invalid ratios (e.g., [0.05, 0.95] violating MIN_RATIO)
- **THEN** the entry is skipped
- **AND** no error is thrown
- **AND** the invalid entry is NOT automatically corrected

### Requirement: Export API request body includes column_width_overrides
The Word export POST request SHALL include a `column_width_overrides` field in the request body, containing all collected overrides for the forms being exported.

#### Scenario: Single form export with overrides
- **WHEN** exporting form 42 that has saved column widths
- **THEN** the POST body includes:
  ```json
  {
    "form_id": 42,
    "column_width_overrides": {
      "normal:fieldIds=1,2,3": [0.4, 0.6],
      "inline:fieldIds=4,5": [0.3, 0.35, 0.35]
    }
  }
  ```

#### Scenario: Multiple form export
- **WHEN** exporting forms 42 and 43 together
- **THEN** `column_width_overrides` contains entries for both forms, keyed by `table_instance_id` with form context

### Requirement: Backend reads column_width_overrides from request body
The backend `export_service.py` SHALL read `column_width_overrides` from the request body and apply them during Word generation.

#### Scenario: Apply override to normal table
- **WHEN** `_build_form_table` is called for a normal table with `table_instance_id="normal:fieldIds=1,2,3"`
- **AND** `column_width_overrides` contains `{"normal:fieldIds=1,2,3": [0.4, 0.6]}`
- **THEN** the table columns use widths `0.4 * available_cm` and `0.6 * available_cm`
- **AND** content-driven planning is bypassed for this table

#### Scenario: Override not found
- **WHEN** `column_width_overrides` does not contain an entry for the current `table_instance_id`
- **THEN** the backend falls back to content-driven planning via `plan_normal_table_width` / `plan_inline_table_width` / `plan_unified_table_width`

### Requirement: Backend validates override ratios
The backend SHALL validate that override ratios meet the same constraints as frontend (values in [0.1, 0.9], sum ≈ 1) before applying them.

#### Scenario: Invalid override is rejected
- **WHEN** `column_width_overrides` contains `[0.01, 0.99]` (violates MIN_RATIO)
- **THEN** the override is ignored
- **AND** content-driven defaults are used instead
- **AND** a warning is logged in development mode
