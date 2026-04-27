## ADDED Requirements

### Requirement: Designer dialog shows live Word preview
The system SHALL show a live Word-style preview inside the form design dialog while the user edits the current form. The dialog preview SHALL reuse the same rendering semantics as the existing designer preview, including `renderGroups`, `renderCellHtml`, and `getInlineRows` driven output.

#### Scenario: Dialog preview is visible during form editing
- **WHEN** the user opens the form design dialog for a form
- **THEN** the dialog displays a Word-style preview area for the current form without requiring the user to close the dialog

#### Scenario: Dialog preview reuses existing rendering semantics
- **WHEN** the same form is shown in the main preview and the design dialog preview
- **THEN** both previews use the same front-end rendering rules for field grouping, inline rows, and control rendering

#### Scenario: Dialog preview updates after editable field changes
- **WHEN** the user changes field properties that affect preview output and saves them inside the dialog
- **THEN** the dialog preview reflects the updated field state without requiring a full page refresh

---

### Requirement: Preview shows form design notes
The system SHALL display `design_notes` in the front-end Word preview for the selected form, including the preview shown in the form design dialog.

#### Scenario: Preview shows notes when design_notes exists
- **WHEN** the selected form has a non-empty `design_notes`
- **THEN** the front-end Word preview displays the note content in the preview layout

#### Scenario: Preview hides notes section when design_notes is empty
- **WHEN** the selected form has empty or null `design_notes`
- **THEN** the front-end Word preview does not render an empty notes placeholder block

#### Scenario: Updated notes are reflected in preview
- **WHEN** the user saves updated `design_notes` for the current form
- **THEN** the front-end Word preview shows the latest saved note content

---

### Requirement: Option trailing underscores remain visually aligned in preview
The system SHALL render option labels with `trailing_underscore` so that the visible fill line aligns with sibling options in the same option group, including vertical radio and vertical checkbox layouts.

#### Scenario: Vertical option group keeps alignment
- **WHEN** a radio or checkbox field contains one or more options with `trailing_underscore`
- **THEN** the preview renders those options with fill lines visually aligned with the rest of the option group

#### Scenario: Alignment fix does not change option text or order
- **WHEN** the preview renders an option group with and without `trailing_underscore`
- **THEN** the option text content and option ordering remain unchanged, and only the fill-line presentation differs

#### Scenario: Repeated rendering is stable
- **WHEN** the same option group is rendered multiple times without data changes
- **THEN** the resulting option layout remains semantically identical across renders

---

### Requirement: Default value override is limited to supported non-table fields
The system SHALL expose a single-value default value override input only for supported non-table field types. The system SHALL NOT expose this input for option fields, labels, logs, table/inline contexts, or any non-supported field type.

#### Scenario: Supported field shows default value input
- **WHEN** the user edits a supported non-table field in the form design dialog
- **THEN** the property panel shows a default value input for that field

#### Scenario: Unsupported field type hides default value input
- **WHEN** the user edits an option field, label field, log field, table field, or inline field context
- **THEN** the property panel does not show the default value input

#### Scenario: Saved default value is a single string value
- **WHEN** the user saves a default value override for a supported field
- **THEN** the saved value is represented as a single string value and not as an array, template, or rule object

#### Scenario: Reopening the same supported field is idempotent
- **WHEN** the user opens, closes, and reopens the same supported field without changing its data
- **THEN** the visibility and value of the default value input remain unchanged

---

### Requirement: Preview applies default value override only within the supported scope
The front-end preview SHALL apply the saved default value override for supported non-table fields, and SHALL NOT apply this override to unsupported field categories.

#### Scenario: Supported field preview shows saved default value
- **WHEN** a supported non-table field has a saved default value override
- **THEN** the front-end preview displays the saved override in the field's preview output

#### Scenario: Unsupported field preview ignores default value override path
- **WHEN** a field belongs to an unsupported category for this feature
- **THEN** the front-end preview does not expose or apply the new default value override behavior for that field category

#### Scenario: Preview semantics remain stable across repeated renders
- **WHEN** the same supported field with the same saved default value is rendered multiple times
- **THEN** the preview output remains semantically identical across renders

---

### Requirement: Choice field validation covers all supported choice field types
The system SHALL enforce the same codelist-required validation rule for all four choice field types: `单选`, `多选`, `单选（纵向）`, and `多选（纵向）`.

#### Scenario: Vertical multi-select requires codelist before save
- **WHEN** the user edits a `多选（纵向）` field without selecting a codelist and attempts to save
- **THEN** the designer blocks the save with the same validation semantics used for other choice fields

#### Scenario: Choice validation remains uniform across all four field types
- **WHEN** the user switches between the four supported choice field types
- **THEN** the codelist-required validation rule remains consistent and does not exclude any one choice subtype
