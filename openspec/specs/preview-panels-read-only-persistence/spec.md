## ADDED Requirements

### Requirement: TemplatePreviewDialog and SimulatedCRFForm compute column widths from planners without drag interaction
`frontend/src/components/TemplatePreviewDialog.vue` and `frontend/src/components/SimulatedCRFForm.vue` SHALL render their tables using content-driven column fractions from the planner functions (`planNormalColumnFractions`, `planInlineColumnFractions`, `planUnifiedColumnFractions`). Neither component SHALL mount `useColumnResize` nor expose any drag handle, snap guide, or resize UI.

#### Scenario: Tables use colgroup with computed fractions
- **WHEN** `TemplatePreviewDialog` or `SimulatedCRFForm` renders a `normal`, `inline`, or `unified` table
- **THEN** the table contains a `<colgroup>` with `<col>` elements whose `width` style is `{fraction * 100}%`
- **AND** the fractions are computed by the corresponding planner function

#### Scenario: No drag handle is mounted
- **WHEN** the user hovers over a column separator in `TemplatePreviewDialog` or `SimulatedCRFForm`
- **THEN** no `col-resize` cursor appears
- **AND** no `resizer-handle` DOM element exists
- **AND** no `snap-guide` DOM element exists

#### Scenario: SimulatedCRFForm removes fixed 30% label width
- **WHEN** `SimulatedCRFForm.vue` renders
- **THEN** the CSS rule `.crf-label-cell { width: 30% }` and any equivalent fixed-width CSS SHALL NOT determine the column widths
- **AND** column widths come exclusively from the `<colgroup>` computed via `planNormalColumnFractions(fields)`

### Requirement: Preview panels share designer-saved ratios read-only when formId is known
When `TemplatePreviewDialog` or `SimulatedCRFForm` has a defined `formId` prop (or equivalent form context), and `localStorage.getItem('crf:designer:col-widths:<form_id>:<table_kind>')` returns a valid ratio array matching the current column count, the component SHALL apply those saved ratios. The component SHALL NEVER write to localStorage.

#### Scenario: Saved ratios apply to preview when formId is known
- **WHEN** `TemplatePreviewDialog` is opened with `formId=42`
- **AND** the designer previously saved `[0.45, 0.55]` to key `crf:designer:col-widths:42:normal-2`
- **THEN** the dialog's `normal` table renders with label column at `45%` and control column at `55%`

#### Scenario: Invalid or missing stored ratios fall back to planner output
- **WHEN** `SimulatedCRFForm` renders with `formId=undefined` OR localStorage has no valid entry for the current key
- **THEN** column widths come from the planner function directly
- **AND** no error is logged

#### Scenario: Preview panels never write to localStorage
- **WHEN** `TemplatePreviewDialog` or `SimulatedCRFForm` renders, re-renders, or is unmounted
- **THEN** no call to `localStorage.setItem` for any `crf:designer:col-widths:*` key originates from these components

### Requirement: Dead import of planInlineColumnFractions is removed or activated
`TemplatePreviewDialog.vue` and `FormDesignerTab.vue` SHALL NOT retain any imports of planner functions that are not actually called. Current dead imports MUST be either (a) activated by real call sites that consume the planner output, or (b) removed.

#### Scenario: No dead imports
- **WHEN** `frontend/src/components/TemplatePreviewDialog.vue` is inspected
- **THEN** every imported identifier from `./useCRFRenderer` appears in at least one call expression or template reference
- **AND** `planInlineColumnFractions` is genuinely consumed
