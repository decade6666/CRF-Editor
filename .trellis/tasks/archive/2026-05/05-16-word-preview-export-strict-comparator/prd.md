# strict comparator: word preview export table fields

## Parent

`05-16-05-16-word-preview-export-strict-parity`

## Goal

Create or formalize a repeatable strict comparison for Word preview vs exported `.docx` table field content so future parity work has a reliable pass/fail signal instead of ad-hoc semantic checks.

## Requirements

* Compare only form table field content; exclude cover page, table of contents, visit distribution, form headings, and other non-field scaffolding from the strict content score.
* Report form count, form order, table row count, table cell count, exact cell match count/ratio, and exact row match count/ratio.
* Preserve the current `TEST` baseline evidence as a starting point: 54 forms, 480 rows, 1199 cells, and known 905/1199 exact cells before fixes.
* Do not ignore mismatched cell content; classify mismatches by type where possible.
* Make output suitable for rerunning after each child task.

## Acceptance Criteria

* [ ] The comparison can be rerun deterministically for the `TEST` project.
* [ ] The report distinguishes structural parity from exact text parity.
* [ ] The report lists representative mismatches without dropping any cell from the denominator.
* [ ] The report can verify 1199/1199 exact table field cells once downstream fixes land.

## Definition of Done

* Narrow tests or scripts are added where appropriate.
* The strict report documents pass/fail status and known limitations.
* No renderer behavior changes are made in this child task unless strictly required for extraction.

## Out of Scope

* Fixing choice spacing, marker font, section breaks, default controls, or ordering mismatches.
* Pixel-perfect layout comparison.

## Technical Notes

* Parent PRD contains the latest mismatch baseline and validation artifacts.
* Likely sources: browser DOM table extraction from the Word preview and `.docx` table extraction via `python-docx`.
