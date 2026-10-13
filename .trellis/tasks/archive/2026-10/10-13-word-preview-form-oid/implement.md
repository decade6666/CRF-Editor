# Implementation Plan — Paper-Preview Form OID

> Plan only: no production code, tests, build or browser checks below have run. Status remains `planning`.

## Ownership and Start Gate

- One executing writer owns the R2 title files/tests. Do not edit R1 marker/helper files or move designer/visits state.
- Review parent/child PRD, design, this plan and manifests; recheck current rules/worktree state. Start this child only after explicit execution authorization.
- This child has no code dependency on R1. Recommended sequence is R1 then R2 for a simpler combined acceptance walk; do not invent a dependency or activate the parent as the coding target.

## Ordered Checklist

### 1. Baseline and RED

- [ ] Verify dependencies and existing designer/visits/title tests pass. Fresh worktrees use existing-lockfile `npm ci` when needed; no new dependency/script/config or automatic optional coverage-provider installation.
- [ ] Add failing **host behavior tests first**: full-mode code beside raw name in both designer scopes and visits, independent of eCRF/aCRF. RED must be missing OID behavior, not a broken Vue/dependency fixture.
- [ ] Add missing/null/blank code, distinct code/domain/field-variable, unchanged raw-name identity, brief-mode and literal-text assertions. New badge test may initially fail because the requested new component does not yet exist; do not confuse that with a missing package.
- [ ] Add per-tag source assertions that both actual parent preview tags pass the full-mode gate. Preserve the existing 14-handler/8-marker contracts.

### 2. Minimal GREEN

- [ ] Add small readonly `FormPreviewOid.vue` with nullable code formatting, blank omission, safe text interpolation and paper-readable styling; no API, state owner, editing, storage or events.
- [ ] Add optional Boolean `showFormOid` defaulting false to `DesignerWordPreview.vue`; insert the badge as a sibling of unchanged `.wp-form-title`.
- [ ] Pass `:show-form-oid="editMode"` (or the existing equivalent full-mode value) on both `FormDesignerTab.vue` preview tags. Keep it out of `previewHandlers` and independent of `showAcrfAnnotations`.
- [ ] Add the same badge to `VisitFormPreviewDialog.vue` using resolved `formPreviewForm.code`, gated by its existing `editMode`, without an additional request or lifecycle change.
- [ ] Add shared wrapping/baseline title-row rules in `main.css`, preserving the reserved domain area, original name typography and table/page geometry. Do not add per-host floating-OID CSS.
- [ ] Run targeted tests to GREEN; inspect actual diff for only this scope. Existing mode/annotation/cache/close/error tests must remain intact.

### 3. Regression, Browser and Documentation

- [ ] Run full frontend regression/lint/build. Retain title alignment, exact `.wp-form-title` name text, page/table widths and parent/child wiring.
- [ ] Run real-browser synthetic/authorized-app checks across all three surfaces, full eCRF/aCRF/brief, short/long/blank values, both orientations and app themes. Verify actual wrap/rectangles/domain separation; do not call happy-dom source/mount tests browser E2E.
- [ ] After R1 is applied, verify name + OID + translucent domain/field markers together, including drag/reset. No Word-title change is expected; preserve raw name for strict table-field capture.
- [ ] Use existing authorized coverage tools and compare like-for-like baseline. Target >=80% with no decrease; do not declare unmeasured SFC coverage passed or silently add a provider. If measurement is blocked, ask at that gate.
- [ ] Review the actual diff; any optional independent review remains bounded and read-only. Resolve findings incrementally and rerun affected checks.
- [ ] Update README.md/README.en.md, frontend module/root context and `.claude/index.json` for the new component/test inventory as needed. Update the stateless-extraction spec signature/data-prop count (6→7, handlers still 14) separately under Trellis. Respect the latest archive-pointer policy; do not rebuild an old root timeline or fix unrelated stale docs.

## Validation Commands

Run each example from the indicated directory of the task worktree, not the original checkout.

```bash
# From <worktree>/frontend; targeted RED/GREEN:
node --test tests/designerPreviewSplit.test.js tests/visitPreviewSplit.test.js tests/wordPageGeometry.test.js tests/editModeHiddenIdentifiers.test.js
npm run test:component -- tests/component/FormPreviewOid.spec.js tests/component/DesignerWordPreview.spec.js tests/component/VisitFormPreviewDialog.spec.js tests/component/visitsPreviewIntegration.spec.js

# Full frontend:
npm test
npm run lint
npm run build

# From <worktree>/backend; cross-child identity/table regression:
/home/decade/.venvs/crf-editor/bin/python -m pytest tests/test_word_table_parity.py -q

# From <worktree>:
git diff --check
```

A current package manifest has no numeric SFC coverage provider. Existing component assertions must cover all new behavior, but they are not a fabricated coverage percentage. Use parent/R1 coverage guidance; obtain permission before any dependency expansion.

## Stop / Rollback Points

- Code source changes form/API data or exported Word title: stop and restore the intended preview-only boundary; obtain a new product decision rather than broadening silently.
- Metadata appends to raw `.wp-form-title` identity or invades domain reserve: correct the sibling/flow design, not the parity comparator.
- Browser unavailable/blocked: state which surfaces/modes were not exercised; do not claim visual acceptance or create live test credentials unilaterally.
- Test/build failure: inspect the error, make one narrow fix, rerun; escalate after the third unresolved attempt. Do not weaken the warning gate or mode assertions.
- Roll back only R2 files/props/styles with a recoverable scoped method. No reset/clean, unrelated refactoring, commit/merge/push, evidence deletion, worktree removal or branch deletion without authorization.
