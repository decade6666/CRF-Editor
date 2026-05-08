# designer-preview-column-resize Specification

## Purpose
TBD - created by archiving change ui-ordinal-readonly-preview-columns. Update Purpose after archive.
## Requirements
### Requirement: Designer preview tables support manual column-width resize
The Form Designer live-preview area SHALL support resizing column widths in the `normal` two-column preview table and the `inline-table` preview table by dragging column separators with the mouse. The system SHALL NOT support row-height resizing.

#### Scenario: Column separator shows resize cursor
- **WHEN** the user hovers between two adjacent columns of a `normal` or `inline-table` preview
- **THEN** the cursor changes to `col-resize`
- **AND** no `row-resize` cursor is exposed anywhere in the preview

#### Scenario: Dragging a separator adjusts both adjacent columns
- **WHEN** the user presses the mouse button on a column separator and drags horizontally
- **THEN** the column to the left expands or shrinks by the drag delta
- **AND** the column to the immediate right shrinks or expands by the equivalent opposite delta
- **AND** other columns retain their widths

#### Scenario: Row height is unaffected by column resize
- **WHEN** the user resizes any column
- **THEN** the table row heights remain unchanged
- **AND** no element in the preview exposes a row-resize handle

### Requirement: Column widths persist per form across sessions
Column widths SHALL persist in `localStorage`, keyed by form identity and table type, and SHALL restore on next visit. Invalid or out-of-bounds stored widths SHALL be discarded in favor of even distribution.

#### Scenario: Widths persist across reloads
- **WHEN** the user resizes a column and then reloads the page
- **THEN** the designer reopens the same form with the saved column widths applied

#### Scenario: Invalid stored widths fall back to even distribution
- **WHEN** the stored widths array is missing, has wrong length, or contains a ratio outside `[0.1, 0.9]`
- **THEN** the designer falls back to equal-width distribution across all columns

#### Scenario: Different forms have independent widths
- **WHEN** the user resizes columns in form A and then switches to form B
- **THEN** form B's widths are loaded from its own storage key
- **AND** changes in form B do not affect form A's stored widths

### Requirement: Column resize supports snap-to-align anchors
While dragging a column separator, the system SHALL offer snap-to-align behavior against a set of common proportional anchors and the current boundaries of other columns within the same table.

#### Scenario: Snap anchors include common proportions
- **WHEN** the user drags a separator near `25%`, `33%`, `50%`, `67%`, or `75%` of the table's available width
- **AND** the pointer is within `4px` of an anchor
- **THEN** the separator snaps to that anchor position
- **AND** a visual guide line is rendered at the anchor while the snap is active

#### Scenario: Snap anchors include other column boundaries
- **WHEN** a table has more than two columns and the dragged separator approaches another column's current boundary position
- **AND** the pointer is within `4px` of that boundary
- **THEN** the separator snaps to that neighboring column boundary
- **AND** a visual guide line is rendered while the snap is active

#### Scenario: Snap guide line disappears after release
- **WHEN** the user releases the mouse button after a snapped drag
- **THEN** the visual guide line disappears
- **AND** the resolved column widths are persisted

### Requirement: Unified-table preview is out of scope for this change
The `unified-table` preview mode, which renders dynamic-column layouts via `computeLabelValueSpans` and `computeMergeSpans`, SHALL retain its existing behavior and SHALL NOT support column-width dragging in this iteration.

#### Scenario: Unified-table remains non-resizable
- **WHEN** the user hovers over a `unified-table` preview
- **THEN** no `col-resize` cursor is shown
- **AND** no snap or guide behavior is triggered

