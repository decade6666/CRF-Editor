## ADDED Requirements

### Requirement: Horizontal tables use content-driven deterministic width planning
The system SHALL assign widths for horizontal tables using a deterministic content-driven width plan instead of equal-width distribution. This rule SHALL apply to both legacy inline tables and `unified_landscape` tables.

#### Scenario: Legacy inline table uses planned widths
- **WHEN** the export pipeline renders an inline table through the legacy horizontal path
- **THEN** the table widths are derived from content demand rather than `available_width / column_count`
- **AND** the final sum of all column widths does not exceed the available page width

#### Scenario: Unified landscape table uses planned widths
- **WHEN** the export pipeline renders a form through the `unified_landscape` path
- **THEN** the unified table widths are derived from one deterministic table-level width plan
- **AND** the final sum of all column widths does not exceed the available page width

#### Scenario: Equal width is only produced by equal demand
- **WHEN** all columns have the same effective content demand
- **THEN** the resulting width plan may produce equal widths
- **BUT** the system SHALL NOT use equal width as the default strategy for non-equal demand inputs

---

### Requirement: Width planning uses a shared table-level scope in unified layout
The system SHALL treat one `unified_landscape` table as one width-planning scope. Multiple inline blocks inside the same unified table SHALL share the same width semantics.

#### Scenario: Multiple inline blocks share one width plan
- **WHEN** one unified table contains more than one inline block
- **THEN** all inline blocks in that table consume the same table-level width semantics
- **AND** no block defines an independent conflicting width plan

#### Scenario: Narrow block maps into the shared grid
- **WHEN** an inline block has fewer visible columns than the unified table grid
- **THEN** the block is mapped into the shared grid by merge/span rules
- **AND** the block does not create a second independent width-planning scope

---

### Requirement: Width demand uses deterministic weighted character metrics
The system SHALL compute content demand with deterministic weighted character metrics.

#### Scenario: Chinese characters carry greater width demand
- **WHEN** one candidate content string differs only in that one version contains more Chinese characters than another
- **THEN** the width demand of the Chinese-heavier string is greater under the same remaining conditions

#### Scenario: Mixed-language input is reproducible
- **WHEN** the same mixed Chinese, English, digit, and punctuation content is planned multiple times
- **THEN** the resulting width demand is identical across runs

#### Scenario: Width demand is independent of runtime environment
- **WHEN** the same table content is planned on different machines or repeated runs
- **THEN** the width demand remains deterministic and does not depend on browser font measurement or Word auto layout

---

### Requirement: Width overflow falls back by proportional scaling
When the raw width demand exceeds the available page width, the system SHALL preserve the width ratio by scaling all planned widths proportionally to fit.

#### Scenario: Oversized width demand scales to fit page width
- **WHEN** the planned total width is greater than the page width budget
- **THEN** all planned column widths are proportionally scaled down
- **AND** the final width total fits within the page budget

#### Scenario: Proportional fallback preserves ordering
- **WHEN** one column has greater width demand than another before fallback scaling
- **THEN** the wider-demand column remains at least as wide as the smaller-demand column after fallback scaling

#### Scenario: Fallback does not collapse to equal width
- **WHEN** overflow fallback is applied to a non-equal demand table
- **THEN** the system preserves relative width differences
- **AND** does not collapse the result into an equal-width table

---

### Requirement: Preview and export share the same horizontal width semantics
The front-end HTML Word-style preview and the back-end Word export SHALL follow the same semantic rules for horizontal width planning, even though they may use different implementations.

#### Scenario: Same form yields same width tendency in preview and export
- **WHEN** the same horizontal form structure is rendered in preview and export
- **THEN** columns with greater content demand are wider in both outputs
- **AND** columns with smaller content demand are narrower in both outputs

#### Scenario: Preview does not depend on DOCX screenshot path
- **WHEN** the designer preview renders a horizontal form
- **THEN** it uses the existing HTML simulation path
- **AND** it still follows the same width semantics as export

---

### Requirement: Choice option with trailing underscore is rendered as an atomic token
For choice fields, an option label with `trailing_underscore` SHALL be rendered as one atomic token together with its trailing fill line. The option label and the trailing fill line SHALL NOT be split across lines.

#### Scenario: Horizontal choice keeps label and fill line together
- **WHEN** a horizontal radio or checkbox option has `trailing_underscore`
- **THEN** the option label and its trailing fill line remain together as one atomic token
- **AND** line breaks may occur only before or after the atomic token

#### Scenario: Vertical choice keeps label and fill line together
- **WHEN** a vertical radio or checkbox option has `trailing_underscore`
- **THEN** the option label and its trailing fill line remain together within the same rendered option row

#### Scenario: Atomic rendering does not alter option meaning
- **WHEN** an option with `trailing_underscore` is rendered
- **THEN** the rendered option preserves the original option text and trailing-underscore business meaning
- **AND** the feature only changes wrap behavior, not business semantics

---

### Requirement: Choice option ordering follows business order_index
Choice option ordering SHALL use `order_index` as the primary semantic sort key.

#### Scenario: Business order is preserved when ids differ
- **WHEN** multiple options have stable `order_index` values but different database ids
- **THEN** preview and export both render the options in `order_index` order

#### Scenario: Stable fallback ordering exists when order_index is missing
- **WHEN** one or more options do not define `order_index`
- **THEN** the system still produces a stable deterministic order
- **AND** the fallback does not override `order_index` when `order_index` is present

---

## Properties

### Property: Width budget safety
For any horizontal table input, the final planned width total is less than or equal to the available page width.

### Property: Width monotonicity
If column A has greater intrinsic demand than column B before fallback scaling, column A remains at least as wide as column B after fallback scaling.

### Property: Unified scope consistency
For any single unified table, all inline blocks within that table are governed by one shared width-planning scope.

### Property: Atomic trailing token integrity
For any option with `trailing_underscore`, no valid rendered output separates the label from its trailing fill line.

### Property: Order stability
For any fixed set of choice options, perturbing database ids alone does not change rendered order when `order_index` values are present.

### Property: Planning idempotence
Running the width planner repeatedly with the same semantic input produces the same width plan.
