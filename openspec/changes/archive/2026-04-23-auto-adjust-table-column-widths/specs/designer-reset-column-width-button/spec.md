## ADDED Requirements

### Requirement: Reset column width button in FormDesignerTab toolbar
`FormDesignerTab.vue` SHALL provide a "重置列宽" (Reset Column Widths) button in the toolbar, positioned immediately to the right of the "批量删除" (Batch Delete) button. The button SHALL reset column widths for selected form(s) to content-driven defaults.

#### Scenario: Button placement
- **WHEN** the FormDesignerTab toolbar renders
- **THEN** a button with label "重置列宽" or a reset icon appears
- **AND** the button is positioned immediately after "批量删除"
- **AND** the button has a tooltip explaining its function

#### Scenario: Single form selection reset
- **WHEN** exactly one form is selected in the designer
- **AND** the user clicks "重置列宽"
- **THEN** all table instances in that form have their localStorage entries removed
- **AND** column widths immediately revert to content-driven defaults

#### Scenario: Multiple form selection reset
- **WHEN** multiple forms are selected in the designer
- **AND** the user clicks "重置列宽"
- **THEN** all table instances across all selected forms have their localStorage entries removed
- **AND** all selected forms revert to content-driven defaults

#### Scenario: No selection disables button
- **WHEN** no form is selected in the designer
- **THEN** the "重置列宽" button is disabled (grayed out)
- **AND** clicking the button has no effect

### Requirement: Reset button triggers resetToEven for all table instances
The reset button's click handler SHALL call `resetToEven()` (or equivalent localStorage clearing logic) for every `useColumnResize` instance associated with the selected form(s).

#### Scenario: Reset clears all localStorage keys for form
- **WHEN** form 42 has saved column widths for:
  - `normal:fieldIds=1,2,3` → [0.4, 0.6]
  - `inline:fieldIds=4,5` → [0.3, 0.3, 0.4]
- **AND** the user clicks "重置列宽" for form 42
- **THEN** both localStorage entries are removed
- **AND** the designer re-renders with content-driven default widths

### Requirement: Visual feedback on reset
The reset button SHALL provide visual feedback to the user indicating the action was successful.

#### Scenario: Success feedback
- **WHEN** the user clicks "重置列宽" and the reset completes
- **THEN** a brief success message or toast notification appears
- **OR** the column widths visibly change immediately (providing implicit feedback)
