## ADDED Requirements

### Requirement: Backend width_planning.py exposes normal-table content-driven planners
`backend/src/services/width_planning.py` SHALL add two functions for normal (2-column label/control) tables:
- `build_normal_table_demands(fields: List[FormField]) -> List[ColumnDemand]` — returns exactly 2 `ColumnDemand` entries (label column, control column) aggregated via `max` across non-structural fields.
- `plan_normal_table_width(fields: List[FormField], available_cm: float = 14.66) -> List[float]` — returns 2 cm-unit widths whose sum equals `available_cm`.

Both functions SHALL share the existing weight constants (`WEIGHT_CHINESE=2`, `WEIGHT_ASCII=1`, `FILL_LINE_WEIGHT=6`), the minimum-protection rule `max(weight, WEIGHT_ASCII * 4)`, and the equi-scaling fallback semantics already present in `plan_width`.

#### Scenario: build_normal_table_demands returns exactly 2 demands
- **WHEN** `build_normal_table_demands(fields)` is called with any non-empty fields list
- **THEN** the return value has length 2 (index 0 = label column, index 1 = control column)
- **AND** each `ColumnDemand.intrinsic_weight` is `max(collected_weights, WEIGHT_ASCII * 4)`

#### Scenario: Label weight aggregates across non-structural fields
- **WHEN** `build_normal_table_demands(fields)` is called
- **THEN** the label column's weight = `max(compute_text_weight(ff.label_override or ff.field_definition.label)) for ff in non-structural fields`
- **AND** structural fields (field_type in `{"标签", "日志行"}` or `is_log_row`) are excluded from both aggregations

#### Scenario: Control weight reuses inline-column demand semantics
- **WHEN** `build_normal_table_demands(fields)` is called
- **THEN** the control column's weight = `max(build_inline_column_demands([ff])[0].intrinsic_weight) for ff in non-structural fields`
- **AND** choice fields contribute via `compute_choice_atom_weight` with trailing-underscore awareness

#### Scenario: plan_normal_table_width returns cm-unit widths
- **WHEN** `plan_normal_table_width(fields, available_cm=14.66)` is called
- **THEN** the return value has length 2
- **AND** `sum(result) == available_cm` within `1e-6`
- **AND** the ratios `result[i] / available_cm` match `planNormalColumnFractions(fields)` in the frontend within `1e-6`

#### Scenario: Empty or all-structural fields produce equal distribution
- **WHEN** `build_normal_table_demands([])` or `build_normal_table_demands(only_structural_fields)` is called
- **THEN** both demands have `intrinsic_weight = WEIGHT_ASCII * 4`
- **AND** `plan_normal_table_width(...)` returns `[available_cm / 2, available_cm / 2]`

### Requirement: export_service normal table uses plan_normal_table_width
`backend/src/services/export_service.py` SHALL replace the hardcoded normal-table column widths (formerly `7.2 cm` + `7.4 cm`) with values returned by `plan_normal_table_width(fields, available_cm=14.66)`.

#### Scenario: Hardcoded widths removed
- **WHEN** the export_service code is inspected
- **THEN** the string literals `Cm(7.2)` / `Cm(7.4)` (or their equivalent numeric hardcoding for normal tables) are NOT present
- **AND** normal-table column widths are derived from `plan_normal_table_width(fields)`

#### Scenario: Word export normal-table widths match preview
- **WHEN** a form is exported to Word
- **AND** the frontend designer previously computed content-driven ratios `[f0, f1]` for the same form
- **THEN** the exported DOCX normal-table column widths are `[f0 * available_cm, f1 * available_cm]` within `2%` relative error
- **AND** the available_cm respects existing page-budget logic

### Requirement: Backend tests cover normal-table planning parity with frontend
`backend/tests/test_width_planning.py` SHALL add assertions that:
- `build_normal_table_demands` returns exactly 2 demands with correct semantics.
- `plan_normal_table_width` produces numerically equivalent ratios to the frontend `planNormalColumnFractions` for a shared fixture set (JSON file under `backend/tests/fixtures/planner_cases.json` or equivalent).

#### Scenario: Parity fixture assertion
- **WHEN** the test loads a shared fixture with fields metadata
- **AND** invokes `plan_normal_table_width(fields, available_cm=14.66)`
- **THEN** the normalized ratios match the pre-recorded frontend output within `1e-6`
