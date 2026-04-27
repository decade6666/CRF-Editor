# simplified-mode-unlock Specification

## Purpose
TBD - created by archiving change ui-ordinal-readonly-preview-columns. Update Purpose after archive.
## Requirements
### Requirement: Form Designer behavior is identical in simplified and full edit modes
The Form Designer (`FormDesignerTab.vue`) SHALL expose the same interactive capabilities regardless of the global `editMode` toggle. Previous gating logic that disabled form creation, deletion, drag reorder, field-library interaction, property editing, and design-notes editing under simplified mode SHALL be removed.

#### Scenario: Form list is editable in simplified mode
- **WHEN** the user disables the global "完整 / 简要" switch (editMode = false)
- **AND** opens the Form Designer tab
- **THEN** the user can still create new forms
- **AND** can still batch-delete forms
- **AND** can still drag rows to reorder them
- **AND** can still access per-row action buttons (delete, etc.)

#### Scenario: Field library panel is visible in simplified mode
- **WHEN** the user is in simplified mode in the Form Designer
- **THEN** the field library panel is rendered and draggable into the current form
- **AND** the panel resizer is interactive

#### Scenario: Field instance list is editable in simplified mode
- **WHEN** the user is in simplified mode with a selected form
- **THEN** each field row exposes its drag handle, inline toggle (where applicable), and delete button
- **AND** the batch-delete action and field-count badge remain active

#### Scenario: Property editor is editable in simplified mode
- **WHEN** the user selects a field instance in simplified mode
- **THEN** the right-side property editor renders the editable form
- **AND** no "简要模式下仅支持预览" empty-state is shown

#### Scenario: Design-notes editor is editable in simplified mode
- **WHEN** the user opens the design-notes editor in simplified mode
- **THEN** the textarea is interactive and saves changes as in full mode
- **AND** no "简要模式下仅支持预览" empty-state is shown

#### Scenario: App-level tab visibility is unchanged
- **WHEN** the user toggles the global "完整 / 简要" switch
- **THEN** the top-level tab visibility in App.vue (Codelists, Units, Fields tabs gated by `v-if="editMode"`) remains governed by the existing App.vue logic
- **AND** this change does not relax or tighten App.vue-level tab gating

#### Scenario: Drag-drop failure recovery is preserved
- **WHEN** a drag reorder in simplified mode fails (network or server error)
- **THEN** the list reverts to the prior order using the existing `useOrderableList` snapshot mechanism
- **AND** an error message is surfaced to the user

