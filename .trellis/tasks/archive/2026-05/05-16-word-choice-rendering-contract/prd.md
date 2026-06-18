# fix contract: choice rendering preview export parity

## Parent

`05-16-05-16-word-preview-export-strict-parity`

## Goal

Align the shared frontend/backend choice rendering contract so browser preview and exported `.docx` produce the same table-field text for reviewed choice mismatch classes.

## Requirements

* Choice markers must touch labels: `○是`, `□选项`, `○1.0`, not `○ 是`, `□ 选项`, or `○ 1.0`.
* Separate options should still be separated by the intended inter-option spacing.
* Choice labels with trailing fill underlines must touch the underline: `其他，请描述______`, not `其他，请描述 ______` or `其他，请描述 ______`.
* Frontend updates must cover both `renderCtrlHtml` and `renderCtrl` in `frontend/src/composables/useCRFRenderer.js`.
* Backend updates must cover string helpers and run-based paths in `backend/src/services/export_service.py`.
* Existing tests that encode old spacing should be updated to the new contract.

## Acceptance Criteria

* [ ] Frontend plain-text path renders choices without marker-label internal spaces.
* [ ] Frontend HTML path renders marker, label, and trailing fill without inserted marker-label or label-fill gaps in extracted text.
* [ ] Backend exported `.docx` cell text renders choices without marker-label internal spaces.
* [ ] Backend trailing choice labels and fill underlines extract as adjacent text.
* [ ] Relevant frontend and backend contract tests pass.

## Definition of Done

* Tests are updated before or alongside implementation.
* Both frontend choice render paths remain synchronized.
* Cross-stack `preview-export-parity` contract notes are updated if literals change.

## Out of Scope

* Word marker font run assertions; handled by the section/font child task.
* Remaining non-choice parity classes such as field ordering and empty/default-control differences.

## Technical Notes

* Current frontend `renderCtrl` emits examples like `○ 有尾线______  ○ 无尾线`.
* Current backend `_render_choice_field` and `_render_vertical_choices` add `symbol + " "` and use NBSP before trailing fill underlines.
