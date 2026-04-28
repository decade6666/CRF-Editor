## ADDED Requirements

### Requirement: regular_field participates in unified column weight aggregation
The `planUnifiedColumnFractions` function SHALL include `regular_field` segments in its per-slot-max weight aggregation, contributing label weight to slot 0 and control weight to slot 1.

#### Scenario: regular_field contributes to slot weights
- **WHEN** a unified table contains a `regular_field` segment with label "患者姓名" and a text control
- **THEN** the label weight (4 for 2 CJK chars × 2) contributes to `slot_weights[0]`
- **AND** the control weight (typically 6 for FILL_LINE_WEIGHT) contributes to `slot_weights[1]`

#### Scenario: Mixed inline_block and regular_field aggregation
- **WHEN** a unified table has:
  - An `inline_block` with 3 fields contributing weights [8, 6, 4] to slots 0-2
  - A `regular_field` contributing label weight 4 to slot 0 and control weight 6 to slot 1
- **THEN** the aggregated slot weights are [max(8,4), max(6,6), 4] = [8, 6, 4]
- **AND** the resulting column fractions reflect the per-slot-max aggregation

### Requirement: Mixed unified layout alignment uses "visually close" strategy
When a unified table contains both `inline_block` and `regular_field` segments, the column widths SHALL be planned to minimize visual misalignment between the two parts, without enforcing exact pixel alignment.

#### Scenario: Weight-based alignment optimization
- **WHEN** planning column widths for a mixed unified table
- **THEN** the per-slot-max aggregation naturally produces widths that are "visually close"
- **AND** no additional post-processing or forced alignment is applied
- **AND** `colspan` attributes handle merged cells correctly

#### Scenario: Visual verification of mixed layout
- **WHEN** rendering a unified table with inline_block (3 columns) and regular_field (label+value spanning 2 columns)
- **THEN** the label column width is approximately consistent between inline_block cells and regular_field label cells
- **AND** the control/value column width is approximately consistent
- **AND** minor differences (≤5%) are acceptable for visual harmony

### Requirement: Backend plan_unified_table_width includes regular_field
The backend `width_planning.py` function `plan_unified_table_width` SHALL be updated to include `regular_field` segments in weight aggregation, matching the frontend algorithm.

#### Scenario: Backend regular_field aggregation
- **WHEN** `plan_unified_table_width` processes segments including `regular_field`
- **THEN** it computes label weight via `compute_text_weight(field.label)`
- **AND** it computes control weight via `build_inline_column_demands([field])[0].intrinsic_weight`
- **AND** it aggregates these into slot 0 and slot 1 respectively

#### Scenario: Frontend-backend parity for mixed unified
- **WHEN** the same mixed unified table is processed by frontend `planUnifiedColumnFractions` and backend `plan_unified_table_width`
- **THEN** the normalized fractions differ by ≤ 1e-6 after accounting for available width
