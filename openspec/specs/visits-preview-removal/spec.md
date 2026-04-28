# visits-preview-removal Specification

## Purpose
TBD - created by archiving change ui-ordinal-readonly-preview-columns. Update Purpose after archive.
## Requirements
### Requirement: Visit-Forms toolbar has no preview button
The Visit-Forms list toolbar SHALL NOT expose a preview button. The associated `showVisitPreview` state, dialog, and any computeds/watchers that exclusively served it SHALL be removed. Form-level preview remains available through the per-row preview link and through the Form Designer.

#### Scenario: No preview button in Visit-Forms toolbar
- **WHEN** a user opens the Visits tab and selects a visit
- **THEN** the right-side Visit-Forms panel toolbar does not render a preview button
- **AND** no `showVisitPreview` dialog can be opened from this panel

#### Scenario: Per-row form preview link is preserved
- **WHEN** a user hovers over a form row in the Visit-Forms list
- **THEN** the per-row "预览" link (`openFormPreview`) remains available
- **AND** it opens the form-content preview dialog (`showPreview`) as before

#### Scenario: Preview-only computeds are cleaned up
- **WHEN** the change is complete
- **THEN** `previewRenderGroups`, `previewNeedsLandscape`, `previewLandscapeMode`, `formPreviewTitle` — if they exclusively served the removed visit-preview dialog — are removed
- **AND** any that are also used by the per-row form preview dialog are retained

