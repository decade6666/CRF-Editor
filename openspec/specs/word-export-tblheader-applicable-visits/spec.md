# word-export-tblheader-applicable-visits Specification

## Purpose
TBD - created by archiving change ui-ordinal-readonly-preview-columns. Update Purpose after archive.
## Requirements
### Requirement: Visit-distribution table header row repeats across pages
The exported Word document's "表单访视分布图" table SHALL mark its first row as a header row with the OOXML `w:tblHeader` property set, so that Microsoft Word and compatible processors repeat the header row on every page break.

#### Scenario: Header row has tblHeader property
- **WHEN** the export service writes the visit-distribution table
- **THEN** the first row's `w:trPr` element contains a `w:tblHeader` child
- **AND** its `w:val` attribute is `"true"`

#### Scenario: Header row repeats in multi-page tables
- **WHEN** a user opens an exported document whose distribution table spans multiple pages in Microsoft Word
- **THEN** the first row (访视名称 + visit names) is rendered at the top of every page that the table occupies
- **AND** in the table properties dialog, "Repeat as header row at the top of each page" is selected

#### Scenario: Short distribution tables are unaffected visually
- **WHEN** the table fits on a single page
- **THEN** the header row behaves identically to the previous implementation
- **AND** no visual regression occurs for single-page tables

### Requirement: Each exported form carries an applicable-visits footer
Every form rendered in `_add_forms_content` SHALL emit a trailing paragraph "适用访视：<visit_name_1>、<visit_name_2>…" immediately after its body, listing the names of visits that reference the form, ordered by `Visit.sequence`.

#### Scenario: Form with multiple visits shows all of them
- **WHEN** a form is referenced by visits with names `V1`, `V2`, and `V3` (in sequence order)
- **THEN** a paragraph is written with the literal prefix `适用访视：` followed by `V1、V2、V3`
- **AND** the paragraph appears directly after the form's main table

#### Scenario: Form without visits skips the footer
- **WHEN** a form is not referenced by any visit
- **THEN** no applicable-visits paragraph is emitted for it

#### Scenario: Visit names are taken verbatim from Visit.name
- **WHEN** the system constructs the applicable-visits footer
- **THEN** each visit contribution is `visit.name` without modification
- **AND** window information that is embedded in the visit name (such as `筛选期(D-28~D-1)`) is preserved verbatim

#### Scenario: Footer ordering follows visit sequence
- **WHEN** multiple visits reference the form
- **THEN** the visit names are concatenated in ascending `Visit.sequence` order
- **AND** separator is the Chinese enumeration mark `、`

#### Scenario: Footer paragraph uses standard font setup
- **WHEN** the footer paragraph is emitted
- **THEN** the `适用访视：` prefix is bold
- **AND** the visit names run uses the default non-bold font derived from `_set_run_font`

