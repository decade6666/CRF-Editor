# Implementation Plan — aCRF Float Translucency

> Plan only: none of the code/tests/rendering steps below has run. Status stays `planning` until explicit execution authorization.

## Ownership and Start Gate

- Single writer: executing main session. Parent coordinates final integration; no concurrent sibling writer or unsolicited fixes.
- Target: `.trellis/tasks/10-13-acrf-annotation-space/`; stable slug is retained, but **no added whitespace** is planned.
- Before execution, review parent/child PRD, design and this checklist; validate both manifests. Reconcile branch/worktree/peer state and read current project rules. Start this child, not the integration-only parent, only after the user explicitly requests execution.
- Use the existing task worktree unless the user changes the isolation approach. Do not modify the original `main` checkout.

## Ordered Checklist

### 1. Baseline and RED

- [ ] Verify the runtime/dependencies without inspecting secrets. Existing venv checked during planning: `/home/decade/.venvs/crf-editor/bin/python` (3.10.21); Node 24.14.1. Recheck if the environment changes.
- [ ] Run existing targeted tests; collect pre-change full backend and existing frontend JS coverage baselines. Fresh worktrees may need `npm ci` using the existing lockfile; do not edit dependencies/scripts or auto-install a coverage provider.
- [ ] Capture deterministic synthetic eCRF/aCRF Word XML baselines outside Git before production edits, including ordinary/header/domain markers, offset records and explicit orientations. Use hermetic tests/direct export fixtures, not the production database/config.
- [ ] Add frontend background-variable/CSS-use tests and backend fill-alpha tests first. Confirm RED because the current style/Word XML is opaque, not because an import/dependency/fixture is broken.
- [ ] Test each marker kind and absence of line/text alpha. Keep existing reset hidden/disabled state assertions, pointer events and offset tests.

### 2. Minimal GREEN

- [ ] Add the mirrored 0.25 opacity constant and one shared CSS background variable in `acrfAnnotationGeometry.js`.
- [ ] Change only the marker background declaration in `DesignerAcrfAnnotation.vue`; no container opacity or changes to text, outline, reset, metrics or pointer behavior.
- [ ] Add only `a:alpha val="25000"` beneath the annotation shape fill color in `export_service.py`.
- [ ] Confirm existing marker callers receive the shared variable; do not rewrite designer/visit glue or add per-host variants.
- [ ] Run targeted tests to GREEN and inspect the actual production diff against the three-file scope.

### 3. Regression, Rendering and Review

- [ ] Compare canonical Word document XML with the controlled baseline after stripping only the new annotation-fill alpha nodes. Original body/geometry/page configuration and eCRF remain unchanged.
- [ ] Run strict table-field parity on synthetic matching preview/export fixtures; preserve raw form names when the R2 sibling is later applied. Existing unrelated fixture mismatches must be compared against baseline, not silently attributed to this change or hidden by loosened assertions.
- [ ] Run a real-browser fixture or authorized app path for all preview surfaces/kinds, both orientations, alpha, unchanged rectangles, existing drag/reset and saved offsets. No invented live credentials or production-data access.
- [ ] Inspect a synthetic DOCX in actual Word and printing/PDF conversion when available. Label Word/WPS/LibreOffice results separately; blocked viewers stay pending and are reported.
- [ ] Run full regression/lint/build/format and coverage gates below. Review actual diff; optional independent review is read-only and bounded, not duplicate implementation. Fix and rerun only task-related findings.
- [ ] Synchronize README.md/README.en.md and module/root context as required, plus cross-stack §6 appearance values and `.claude/index.json` only if its inventory needs change. Leave unrelated stale docs untouched; Trellis updates are committed separately from code only if committing is later authorized.

## Validation Commands

Run from the indicated worktree subdirectory; use the verified project Python or revalidated equivalent. Every nonzero result is a failure to investigate, not an `|| true` success.

```bash
# From <worktree>/frontend; baseline and targeted RED/GREEN:
node --test tests/acrfAnnotationGeometry.test.js tests/acrfAnnotationPersistence.test.js tests/acrfViewToggle.test.js tests/designerPreviewSplit.test.js tests/visitPreviewSplit.test.js
node --test --experimental-test-coverage --test-coverage-include='**/src/composables/acrfAnnotationGeometry.js' --test-coverage-lines=80 tests/acrfAnnotationGeometry.test.js
npm run test:component -- tests/component/DesignerAcrfAnnotation.spec.js tests/component/DesignerWordPreview.spec.js tests/component/VisitFormPreviewDialog.spec.js

# From <worktree>/backend:
/home/decade/.venvs/crf-editor/bin/python -m pytest tests/test_export_acrf.py tests/test_acrf_offset_consistency.py tests/test_export_service.py tests/test_export_unified.py tests/test_export_paper_orientation.py tests/test_word_table_parity.py tests/test_width_planning.py -q
/home/decade/.venvs/crf-editor/bin/python -m ruff format --check .

# Full/backend coverage baseline and post-change comparison:
/home/decade/.venvs/crf-editor/bin/python -m pytest --cov=src --cov=main --cov-report=term-missing:skip-covered

# Full/frontend regression:
npm test
npm run lint
npm run build

# Strict parity, from <worktree>/backend after fixture capture:
/home/decade/.venvs/crf-editor/bin/python scripts/compare_word_table_parity.py <synthetic-preview.json> <synthetic-export.docx>

# From <worktree>:
git diff --check
```

Frontend pure-JS coverage uses the existing Node built-in coverage facility; preserve the same scope/filter before and after. Numeric SFC coverage is not currently provided by the checked-in manifest; do not silently install optional Vitest peers or report unmeasured Vue code as a passed 80% gate. If numerical coverage cannot be established with authorized tooling, stop at that gate and ask for the needed provider/explicit decision. Target coverage is >=80% and not below baseline, not a reason to weaken tests.

## Stop / Rollback Points

- Dependency/RED failures: resolve the real environment issue before touching implementation. Do not change expected results to manufacture GREEN.
- Baseline comparison shows non-alpha XML/geometry changes: isolate and reverse only the scoped accidental edit; no broad reset/clean or unrelated refactor.
- Actual Word does not retain the alpha: preserve the evidence, report client/version and stop for a design decision; do not replace the body with images or change pagination automatically.
- Tests/build or coverage gates unresolved: report the blocker, use incremental troubleshooting and escalate after the third unresolved attempt.
- Do not commit, merge, push, remove evidence/worktrees or delete branches until separately authorized. Retain temporary evidence if cleanup consent is not given.
