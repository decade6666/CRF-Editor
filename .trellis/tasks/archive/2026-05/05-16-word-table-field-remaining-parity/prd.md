# fix parity: remaining table field mismatch classes

## Parent

`05-16-05-16-word-preview-export-strict-parity`

## Goal

Use the repeatable strict comparator to close remaining true table-field content mismatches after the comparator, choice contract, and Word-specific export requirements are in place.

## Requirements

* Use the strict comparator output as the source of truth for remaining mismatch classes.
* Fix numeric placeholder differences such as preview `|__|__|__|.|__|` vs export `|__||__||__|.|__|` under an explicit shared contract.
* Fix empty/default-control differences such as cells that are empty in preview but render `○ 未查` in export, after identifying the intended product behavior.
* Fix field ordering/grouping differences such as `12导联心电图` where preview and export place inline item/result/unit tables differently.
* Preserve form order, row count, and cell count parity unless a deliberately changed contract says otherwise.

## Acceptance Criteria

* [ ] Strict comparison reports 54/54 `TEST` forms in the same order.
* [ ] Strict comparison reports 480/480 rows and 1199/1199 cells unless intentional output changes update the denominator.
* [ ] Strict comparison reaches 1199/1199 exact table field cells under the agreed extraction rules.
* [ ] Known true differences are fixed rather than classified out of scope.
* [ ] Regression tests cover each fixed mismatch class.

## Definition of Done

* Backend and frontend tests relevant to touched render paths pass.
* Browser/docx validation is rerun against `TEST`.
* Docs/spec notes are updated for any shared rendering contract changes.

## Out of Scope

* Non-table scaffolding such as cover, directory, visit distribution, and headings.
* Broad renderer rewrite unless the remaining evidence proves the targeted fixes cannot reach parity safely.

## Technical Notes

* This child should start after the strict comparator child is complete.
* Some decisions here may depend on evidence from the comparator output rather than the current parent PRD baseline alone.
