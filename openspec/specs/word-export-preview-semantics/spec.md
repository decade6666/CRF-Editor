# word-export-preview-semantics Specification

## Purpose
TBD - created by archiving change align-word-export-to-preview-widths-and-underlines. Update Purpose after archive.
## Requirements
### Requirement: FormDesigner is the canonical preview baseline
The system SHALL use FormDesigner as the single preview baseline for this change. Width and underline semantics SHALL be aligned to the FormDesigner preview behavior rather than to other pages or historical exported output.

#### Scenario: Preview baseline is uniquely defined
- **WHEN** implementation decisions require a preview reference for width or underline behavior
- **THEN** the reference is the FormDesigner preview
- **AND** no second preview page or historical export result is treated as an equal canonical source

---

### Requirement: Horizontal width planning uses visible-content semantics
The system SHALL derive horizontal table width demand from visible-content semantics rather than from equal-width defaults or from header/value strings alone.

#### Scenario: Legacy inline table uses semantic demand
- **WHEN** the export pipeline renders a legacy inline horizontal table
- **THEN** width demand includes visible label/value semantics and any relevant choice, fill-line, unit, or multiline-default-value demand
- **AND** the resulting widths are not computed as a blind equal split unless effective demand is equal

#### Scenario: Unified table uses semantic demand
- **WHEN** the export pipeline renders a unified horizontal table
- **THEN** width demand is built from the same visible-content semantic categories
- **AND** the resulting widths are normalized within the existing page-width budget

#### Scenario: Equal width only comes from equal demand
- **WHEN** all columns have the same effective semantic demand
- **THEN** the planner may produce equal widths
- **BUT** equal width is not used as the default for non-equal semantic inputs

---

### Requirement: Unified tables use one table-level width scope
The system SHALL treat one unified horizontal table as one width-planning scope.

#### Scenario: Multiple inline blocks share one scope
- **WHEN** one unified table contains multiple inline blocks
- **THEN** all blocks consume one shared table-level width plan
- **AND** no block creates an independent conflicting width scope

#### Scenario: Aggregation uses per-slot maxima
- **WHEN** multiple inline blocks contribute demand to the same unified column slot
- **THEN** the final demand for that slot is the maximum demand observed for that slot across blocks
- **AND** the planner does not concatenate block demand vectors into a longer vector than the physical column count

#### Scenario: Narrower blocks map into the shared grid
- **WHEN** one inline block has fewer visible columns than the unified table grid
- **THEN** the block maps into the shared grid by existing merge/span rules
- **AND** the block still uses the shared table-level width semantics

---

### Requirement: Width planning preserves budget with proportional fallback
The system SHALL keep planned widths within the existing page-width budget while preserving relative width demand.

#### Scenario: Oversized demand scales to fit
- **WHEN** raw width demand exceeds the available page-width budget
- **THEN** the planned widths are proportionally scaled to fit within budget
- **AND** the final total width does not exceed the budget

#### Scenario: Fallback preserves relative ordering
- **WHEN** one column has greater intrinsic demand than another before fallback scaling
- **THEN** the greater-demand column remains at least as wide as the smaller-demand column after fallback scaling

#### Scenario: Fallback does not collapse to equal width
- **WHEN** non-equal demand triggers overflow fallback
- **THEN** the system preserves relative width differences
- **AND** it does not collapse the result into an equal-width table

---

### Requirement: trailing_underscore uses a shared semantic with a compatible renderer
The system SHALL treat `trailing_underscore` as a shared semantic meaning "the option label is followed by a visible fill line", while allowing renderer-specific compatibility details.

#### Scenario: Semantic is stable across preview and export
- **WHEN** a choice option carries `trailing_underscore`
- **THEN** preview and export both interpret it as the same high-level fill-line semantic
- **AND** renderer-specific details do not redefine the business meaning

#### Scenario: Compatibility layer does not leak into the semantic definition
- **WHEN** the export renderer uses a Word-specific compatibility strategy to draw the trailing fill line
- **THEN** that strategy remains an implementation detail
- **AND** the semantic definition is not reduced to a fixed underscore character count

---

### Requirement: Choice label and trailing fill line render as one atomic token
For any choice option with `trailing_underscore`, the label and trailing fill line SHALL render as one atomic visual token.

#### Scenario: Horizontal choice keeps the atomic token together
- **WHEN** a horizontal radio or checkbox option has `trailing_underscore`
- **THEN** the label and trailing fill line remain together as one atomic token
- **AND** line breaks may occur only before or after that token

#### Scenario: Vertical choice keeps the atomic token together
- **WHEN** a vertical radio or checkbox option has `trailing_underscore`
- **THEN** the label and trailing fill line remain together within the same rendered option row

#### Scenario: Atomic rendering covers all choice variants
- **WHEN** the system renders `单选`、`多选`、`单选（纵向）`、or `多选（纵向）`
- **THEN** the same atomic-token rule applies wherever `trailing_underscore` is present

---

### Requirement: Multiline default_value semantics are unified across preview and export
The system SHALL treat multiline `default_value` as multiline in both preview and export.

#### Scenario: Multiline default_value stays multiline in preview and export
- **WHEN** a field default value has multiline semantics
- **THEN** preview renders it with multiline semantics
- **AND** export preserves the same multiline semantic category

#### Scenario: Multiline semantics contribute to visible demand consistently
- **WHEN** multiline `default_value` participates in width or fill-line demand calculation
- **THEN** preview and export derive that demand from the same semantic rule source
- **AND** one side does not simplify it to a single-line semantic while the other keeps it multiline

---

