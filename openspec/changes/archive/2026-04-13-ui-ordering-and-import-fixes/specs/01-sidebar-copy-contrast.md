## ADDED Requirements

### Requirement: Sidebar project copy action remains readable on dark backgrounds
The system SHALL keep the project copy action readable within the sidebar project list across default, hover, and active states without changing the semantic styling of the delete action.

#### Scenario: Copy action is readable on default sidebar item
- **WHEN** a project row is rendered in the sidebar and the row is not hovered or active
- **THEN** the copy action remains visually distinguishable against `--color-sidebar-bg`
- **AND** the delete action continues to use the existing danger semantic styling

#### Scenario: Copy action is readable on hover and active states
- **WHEN** the user hovers a project row or the row becomes the active project
- **THEN** the copy action remains visually distinguishable against `--color-sidebar-hover` and `--color-sidebar-active`
- **AND** the button remains scoped to the sidebar row rather than changing global link-button styling

#### Scenario: Sidebar-scoped fix does not alter unrelated link buttons
- **WHEN** the application renders link-style buttons outside the sidebar project list
- **THEN** those buttons are not restyled by this change
