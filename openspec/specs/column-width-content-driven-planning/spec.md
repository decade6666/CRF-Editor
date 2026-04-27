## ADDED Requirements

### Requirement: Frontend exposes content-driven column-width planners reusing shared weight semantics
The frontend SHALL provide pure functions in `frontend/src/composables/useCRFRenderer.js` that compute column-width fractions from field content, sharing weight semantics with `backend/src/services/width_planning.py` (WEIGHT_CHINESE=2, WEIGHT_ASCII=1, FILL_LINE_WEIGHT=6) and the `max(weight, WEIGHT_ASCII*4)` minimum-protection rule.

#### Scenario: planInlineColumnFractions returns normalized fractions matching backend
- **WHEN** `planInlineColumnFractions(fields)` is called with a non-empty fields array
- **THEN** the output is an array whose length equals `fields.length`
- **AND** the sum of the output values is within `1e-9` of 1.0
- **AND** each fraction equals `demand[i] / sum(demands)` after applying minimum protection

#### Scenario: planNormalColumnFractions aggregates label and control per column
- **WHEN** `planNormalColumnFractions(fields)` is called
- **THEN** the output length is exactly 2 (label column + control column)
- **AND** `labelWeight = max(computeTextWeight(ff.label_override || ff.field_definition.label)) for all non-structural ff`
- **AND** `controlWeight = max(buildInlineColumnDemands([ff])[0].weight) for all non-structural ff`
- **AND** both weights are clamped by `max(weight, WEIGHT_ASCII * 4)` before normalization

#### Scenario: planUnifiedColumnFractions uses per-slot-max aggregation
- **WHEN** `planUnifiedColumnFractions(segments, columnCount)` is called
- **THEN** only segments with `type === 'inline_block'` contribute weights
- **AND** for each physical slot `i < columnCount`, the slot weight equals the maximum of `buildInlineColumnDemands(segment.fields)[i].weight` across all inline_block segments
- **AND** `regular_field` and `full_row` segments do NOT participate in slot aggregation
- **AND** the output length equals `columnCount`

#### Scenario: Empty fields produce equal distribution
- **WHEN** any planner is called with empty inputs (empty `fields`, or unified with no inline_blocks)
- **THEN** `planInlineColumnFractions([])` returns `[]`
- **AND** `planNormalColumnFractions([])` returns `[0.5, 0.5]`
- **AND** `planUnifiedColumnFractions([], 0)` returns `[]`
- **AND** `planUnifiedColumnFractions(regular_only, N)` returns `N` equal fractions of `1/N`

#### Scenario: Missing field_definition falls back to fill-line semantics
- **WHEN** a field has `field_definition === undefined` or `null`
- **THEN** its column contributes `{ label: '', weight: FILL_LINE_WEIGHT }` to the demand list
- **AND** no TypeError is thrown

### Requirement: Planner functions are pure and deterministic
Planner functions SHALL be pure (no I/O, no mutation of inputs) and deterministic (same input produces the same output across calls).

#### Scenario: Repeated calls yield identical results
- **WHEN** any planner is called twice with structurally-equal inputs
- **THEN** the two outputs are deeply equal (bit-identical for fractions)

#### Scenario: Input is not mutated
- **WHEN** a planner is called with a fields array
- **THEN** the `fields` array and every field object within it are structurally unchanged after the call

### Requirement: Planners produce non-decreasing fractions when a column's demand increases
Increasing the weight of a single column SHALL NOT decrease that column's fraction in the output.

#### Scenario: Monotonicity under label lengthening
- **WHEN** `planInlineColumnFractions(fields)` yields fraction `f_i` for column `i`
- **AND** the label text of `fields[i]` is extended (weight increases)
- **THEN** `planInlineColumnFractions(fields_mutated)[i]` ≥ `f_i` (within floating-point tolerance)

#### Scenario: Monotonicity in unified per-slot aggregation
- **WHEN** `planUnifiedColumnFractions(segments, N)` yields fraction `f_i` for slot `i`
- **AND** a new inline_block segment is added whose column `i` demand is strictly greater than the existing slot maximum
- **THEN** `planUnifiedColumnFractions(segments_new, N)[i]` > `f_i`
