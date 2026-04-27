## ADDED Requirements

### Requirement: Unified-table preview supports physical-column drag with useColumnResize
The `unified-table` preview in `FormDesignerTab.vue` SHALL support column-width dragging at the physical column level. The drag host SHALL wrap the `<table class="unified-table">` in a `col-resize-host` container and mount `useColumnResize(formIdRef, tableKindRef, defaultsSource)` with `tableKindRef` equal to `unified-<N>` where `N = g.colCount`.

#### Scenario: Unified table renders colgroup with resizer
- **WHEN** `FormDesignerTab` renders a unified group
- **THEN** the table is preceded by a `<colgroup>` containing `<col>` for each of `N` physical columns
- **AND** the container has class `col-resize-host`
- **AND** `N - 1` `.resizer-handle` elements are rendered at column boundaries

#### Scenario: Unified table drag persists to localStorage
- **WHEN** the user drags a unified-table column separator and releases
- **THEN** the resolved ratios are persisted to `localStorage` under key `crf:designer:col-widths:<form_id>:unified-<N>`
- **AND** subsequent reloads apply the stored ratios

#### Scenario: Unified content-driven defaults use per-slot-max aggregation
- **WHEN** a unified table is opened without a localStorage entry
- **THEN** the default fractions come from `planUnifiedColumnFractions(segments, g.colCount)`
- **AND** the aggregation considers only `inline_block` segments

### Requirement: Unified-table colspan semantics remain unaffected by column resize
The `colspan` values computed via `computeMergeSpans(g.colCount, seg.fields.length)` for inline_block rows and `computeLabelValueSpans(g.colCount)` for regular-field rows SHALL be unchanged by the introduction of `useColumnResize`.

#### Scenario: Inline-block rows keep merged colspan
- **WHEN** a unified table renders an `inline_block` segment with `seg.fields.length < g.colCount`
- **THEN** `computeMergeSpans` still distributes the physical columns across the block's cells
- **AND** the `<colgroup>` widths still represent the `g.colCount` physical columns

#### Scenario: Regular-field label/value spans preserved
- **WHEN** a unified table renders a `regular_field` segment
- **THEN** `computeLabelValueSpans(g.colCount)` still computes labelSpan + valueSpan = `g.colCount`
- **AND** the visual label-to-value ratio reflects the sum of the underlying physical column widths

### Requirement: Unified resize interaction parity with normal/inline
Dragging a unified-table column separator SHALL use the same SNAP_ANCHORS (25%, 33%, 50%, 67%, 75%), SNAP_PX (4), MIN_RATIO (0.1), and on-drag-end persistence behavior as normal/inline tables.

#### Scenario: Snap anchors identical to other kinds
- **WHEN** the user drags a unified separator near 25%, 33%, 50%, 67%, or 75%
- **THEN** the separator snaps within the 4px threshold
- **AND** a snap-guide line appears at the snap position
