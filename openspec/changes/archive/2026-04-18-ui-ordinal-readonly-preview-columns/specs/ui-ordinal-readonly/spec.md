## ADDED Requirements

### Requirement: List ordinals render as read-only text
All list UIs SHALL display `order_index` / `sequence` as plain numeric text, without increment/decrement buttons or inline keyboard editing. Drag-and-drop reordering SHALL remain the sole entry point for changing list order.

#### Scenario: Ordinal cell shows plain numeric text
- **WHEN** a user views the Units, Codelists, Codelist-Options, Visits, Visit-Forms, Forms, Form-Fields, or Field-Definitions list
- **THEN** the ordinal column displays the numeric value as plain text
- **AND** no `el-input-number` component is rendered in the ordinal cell
- **AND** no `+` / `-` buttons are available to modify the ordinal

#### Scenario: Drag-and-drop remains the only reorder path
- **WHEN** a user drags a list row by its drag handle
- **THEN** the order change is persisted via the existing `/reorder` endpoint
- **AND** no alternative manual ordinal input is exposed in the list UI

#### Scenario: Ordinal-specific update handlers are unused from UI
- **WHEN** the change is complete
- **THEN** the previously bound `update*Order` / `updateSequence` handlers are either removed (if unused) or invoked only from drag-end callbacks
- **AND** no list UI element calls them via ordinal input `@change`

### Requirement: Visit/Form ordinal dialog inputs are preserved
The create/edit Visit dialog SHALL keep its `sequence` input, because that input is a form-entry field rather than a list ordinal control.

#### Scenario: Create Visit dialog keeps sequence input
- **WHEN** a user opens the "New Visit" or "Edit Visit" dialog
- **THEN** the dialog still contains an `el-input-number` bound to the visit's `sequence` field
- **AND** this behavior is explicitly out of scope of the list-ordinal readonly change
