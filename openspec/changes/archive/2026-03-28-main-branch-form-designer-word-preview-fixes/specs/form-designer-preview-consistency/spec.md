## ADDED Requirements

### Requirement: Designer preview uses HTML simulation with stable Word-style semantics
The system SHALL keep the form designer preview on an HTML-simulated Word-style rendering path and SHALL make the designer preview semantics consistent with the committed export-side rules for supported field categories.

#### Scenario: Designer preview remains HTML-simulated
- **WHEN** the user opens or refreshes the form designer preview
- **THEN** the preview is rendered through the existing HTML simulation path and does not depend on Word screenshot, COM automation, or `.docx` round-trip generation

#### Scenario: Choice fields use placeholder semantics when dictionary data is unavailable
- **WHEN** a choice field has no dictionary or no available options
- **THEN** the designer preview displays the underscore placeholder semantics instead of fallback option text

#### Scenario: Repeated rendering is semantically stable
- **WHEN** the same form data is rendered multiple times without data changes
- **THEN** the preview output remains semantically identical across renders

---

### Requirement: Trailing underscores remain aligned without altering option meaning
The system SHALL render option labels with `trailing_underscore` so that fill-line alignment is visually consistent within the same option group, while preserving option text content and ordering.

#### Scenario: Vertical option group keeps aligned fill lines
- **WHEN** a radio or checkbox field contains one or more options with `trailing_underscore`
- **THEN** the preview renders those options with visually aligned trailing fill lines within the same option group

#### Scenario: Alignment fix does not change option text or order
- **WHEN** the preview renders an option group with and without `trailing_underscore`
- **THEN** the option text content and option ordering remain unchanged, and only the fill-line presentation differs

#### Scenario: Export-aligned semantics are preserved
- **WHEN** the same choice field data is used by both designer preview and export rendering
- **THEN** both paths follow the same structural rule for whether a trailing fill line should exist

---

### Requirement: Default value override keeps existing table behavior and limits non-table scope
The system SHALL preserve the existing table / inline behavior where `default_value` can override all field types inside table cells. For non-table contexts, the system SHALL expose and apply a default value override only for supported plain-text fields.

#### Scenario: Supported plain-text field shows default value input
- **WHEN** the user edits a supported non-table plain-text field in the designer
- **THEN** the property panel shows a single-value default value input for that field

#### Scenario: Unsupported non-table field type hides default value input
- **WHEN** the user edits a non-table choice field, label field, log field, or other unsupported non-table field context
- **THEN** the property panel does not show the default value input

#### Scenario: Table and inline behavior remains unchanged
- **WHEN** a field is rendered inside an inline table cell and that field has `default_value`
- **THEN** the table preview continues to let `default_value` override the cell content regardless of field type

#### Scenario: Saved override is represented as a single line string
- **WHEN** the user saves a default value override for a supported field
- **THEN** the persisted value is treated as a single-line string value rather than multi-line inline content, arrays, or rule objects

#### Scenario: Preview applies override within the correct scope
- **WHEN** a supported non-table plain-text field has a saved default value override
- **THEN** the designer preview displays the saved override for that field
- **AND** unsupported non-table field categories continue to ignore this override path

#### Scenario: Table default value continues to override all field types
- **WHEN** an inline table cell field of any type has a saved `default_value`
- **THEN** the preview continues to render that `default_value` as the cell override value

#### Scenario: Reopening the same supported field is idempotent
- **WHEN** the user opens, closes, and reopens the same supported field without changing its data
- **THEN** the visibility and value of the default value input remain unchanged

---

### Requirement: Design notes are shown only in the designer preview sidebar
The system SHALL display `design_notes` in the designer preview as a right-side notes area and SHALL NOT require those notes to appear in the final export document.

#### Scenario: Preview shows notes when design_notes exists
- **WHEN** the selected form has non-empty `design_notes`
- **THEN** the designer preview displays the note content in a right-side notes area while compressing the main content width

#### Scenario: Preview hides notes area when design_notes is empty
- **WHEN** the selected form has empty or null `design_notes`
- **THEN** the preview does not render an empty notes placeholder block

#### Scenario: Updated notes are reflected in preview after save
- **WHEN** the user saves updated `design_notes` for the current form
- **THEN** the designer preview shows the latest saved note content without requiring a full page refresh

#### Scenario: Export scope excludes design notes
- **WHEN** the user later exports the form document
- **THEN** this feature does not require `design_notes` to be injected into the export document by this change
