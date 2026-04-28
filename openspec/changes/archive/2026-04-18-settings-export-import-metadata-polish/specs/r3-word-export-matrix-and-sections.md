## ADDED Requirements

### Requirement: Cover page screening number uses project metadata
The system SHALL render the cover-page `筛选号` value from project metadata with shared fallback semantics.

#### Scenario: Explicit project value overrides the hard-coded default
- **WHEN** a project stores a non-empty `screening_number_format`
- **THEN** the Word cover page renders that exact value in the `筛选号` row
- **AND** the exporter does not use the previous hard-coded constant instead

### Requirement: Visit-flow page uses dedicated landscape section boundaries
The system SHALL isolate the visit-flow page in its own landscape section and restore portrait layout for subsequent form content.

#### Scenario: TOC ends with next-page section break into landscape visit flow
- **WHEN** the table-of-contents placeholder completes
- **THEN** the document transitions via `WD_SECTION.NEW_PAGE` into a landscape visit-flow section

#### Scenario: Visit flow ends with next-page section break back to portrait forms
- **WHEN** the visit-flow section completes
- **THEN** the document transitions via `WD_SECTION.NEW_PAGE` into a portrait section before form content continues

#### Scenario: Header and footer are reapplied across section switches
- **WHEN** the exporter creates the landscape visit-flow section or the restored portrait forms section
- **THEN** it reapplies the existing header/footer setup to the new section

### Requirement: Front-two-table import assumption remains intact
The system SHALL preserve the observable invariant that the first two document tables are the cover table and the visit-flow table.

#### Scenario: Cover table stays first and visit-flow table stays second
- **WHEN** the exporter finishes a successful document
- **THEN** `doc.tables[0]` is still the cover table
- **AND** `doc.tables[1]` is still the visit-flow table
- **AND** section changes do not insert another table before either one

### Requirement: Visit-flow matrix keeps current marker semantics
The system SHALL keep the current visit-flow matrix marker behavior unchanged in this change.

#### Scenario: Associated cells continue to show `×`
- **WHEN** a visit-flow cell represents an existing visit/form association
- **THEN** the exported cell continues to show `×`
- **AND** this change does not switch the cell to `VisitForm.sequence`

## Properties

### Property: Section recovery safety
For any successful export, the section orientation sequence includes a landscape visit-flow section followed by a restored portrait forms section.

### Property: Front-two-table stability
For any successful export, the first two document tables remain the cover table and the visit-flow table in that order.

### Property: Matrix marker stability
For any successful export affected by this change, associated visit-flow cells continue to use the existing `×` marker semantics.
