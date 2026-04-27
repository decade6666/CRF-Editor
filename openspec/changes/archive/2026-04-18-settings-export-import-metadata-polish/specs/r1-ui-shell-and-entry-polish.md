## MODIFIED Requirements

### Requirement: Edit mode toggle only gates advanced editing surfaces
The system SHALL keep `editMode` as the gate for advanced editing surfaces while allowing the form designer entry to remain visible when a form is selected.

#### Scenario: Advanced tabs remain gated by edit mode
- **WHEN** `editMode` is disabled
- **THEN** the `选项`、`单位`、`字段` tabs remain hidden
- **AND** no additional advanced editing surface becomes visible beyond the approved scope

#### Scenario: Form designer entry remains visible with a selected form
- **WHEN** `editMode` is disabled
- **AND** the user has selected a form in `FormDesignerTab.vue`
- **THEN** the `设计表单` button remains visible
- **AND** entering the designer does not implicitly re-enable the advanced tabs

#### Scenario: Edit mode switch uses inline prompt semantics
- **WHEN** the settings dialog renders the edit mode control
- **THEN** it uses the same inline-prompt switch style family as the theme toggle
- **AND** the inactive text is `简要`
- **AND** the active text is `完全`

### Requirement: Header and settings entry points are rearranged without capability loss
The system SHALL move `导入Word` from the main header into the settings transfer-actions area while preserving its existing execution flow.

#### Scenario: Header keeps only template import and Word export
- **WHEN** a project is selected
- **THEN** the header action area shows `导入模板` and `导出Word`
- **AND** it does not show a separate `导入Word` button

#### Scenario: Settings keeps import Word under import project
- **WHEN** the settings dialog renders the transfer-actions area
- **THEN** `导入Word` appears below `导入项目`
- **AND** it uses the same settings-area button hierarchy as the neighboring transfer actions
- **AND** it reuses the existing import-Word dialog and execution flow

#### Scenario: Data export title text is removed without changing actions
- **WHEN** the settings dialog renders the transfer-actions grouping
- **THEN** the literal title text `数据导出` is not shown
- **AND** the existing export/import actions remain present and keep their current responsibilities

## Properties

### Property: Edit-mode gate monotonicity
For any UI state, disabling `editMode` never reveals more advanced editing surfaces than enabling it.

### Property: Entry-point relocation preserves behavior
Moving `导入Word` from the header to the settings area does not change the dialog flow, selected-project requirement, or import execution endpoint.
