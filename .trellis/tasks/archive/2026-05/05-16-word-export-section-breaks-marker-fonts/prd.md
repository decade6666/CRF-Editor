# fix export: form section breaks and marker fonts

## Parent

`05-16-05-16-word-preview-export-strict-parity`

## Goal

Enforce Word-export-only document structure and font requirements that are not represented by the browser preview but are required for the exported `.docx` contract.

## Requirements

* Every exported form must end with a section break of type `next page`.
* The implementation must avoid creating unintended blank trailing pages while still satisfying the per-form section boundary contract.
* Choice markers `○` and `□` must consistently use SimSun/宋体 in exported Word runs.
* Marker font assertions must cover horizontal and vertical choice rendering paths where markers are emitted as separate runs.
* Browser preview does not need to model section breaks.

## Acceptance Criteria

* [ ] Exported `.docx` XML shows a next-page section boundary after every form.
* [ ] Existing orientation behavior for portrait/landscape forms remains correct.
* [ ] Choice marker runs use SimSun/宋体 for ascii, hAnsi, and eastAsia font slots where applicable.
* [ ] Backend export tests cover section boundaries and marker font consistency.

## Definition of Done

* Backend tests pass for export service, unified export, and paper orientation behavior.
* No frontend changes are made unless required by shared documentation.
* Cross-stack contract notes distinguish Word-only section requirements from preview parity.

## Out of Scope

* Changing choice text spacing; handled by the choice rendering child task.
* Pixel-perfect Word layout tuning.

## Technical Notes

* Current `_switch_section` uses `doc.add_section(WD_SECTION.NEW_PAGE)`.
* Current `_add_forms_content` still uses `doc.add_page_break()` for some portrait non-last forms, which does not satisfy the new section-break requirement.
