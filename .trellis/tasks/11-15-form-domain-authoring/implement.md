# C1 Execution Plan — Not Started

## Preconditions

Review parent and child PRD/design; obtain implementation authorization and start this child in its own task worktree. Recheck main and all form-property call sites before changes. No product work is authorized by this planning file.

## Ordered Checklist

1. RED: extend property-state/equality and create/dialog/inline behavior tests for domain, case/blank and failure/cancel. Confirm the missing wiring fails.
2. GREEN: extend the existing state, full-mode inputs, shared persistence and dirty checks; do not change model/geometry or OID normalization.
3. Verify create/save/reopen/clear and leave paths, visits authoritative reload and Word annotation; fix only demonstrated dependency gaps.
4. Update README zh/en, frontend module notes and `.claude/index.json` for the actual entry; preserve the separate standards task.
5. Inspect actual diff; run required tests/lint/build and targeted export checks, review inherited authorization/parity boundaries, then coordinate DevTools acceptance with C5.

## Validation Commands — Future Execution Only

From the child worktree, with declared dependencies installed:

```bash
cd frontend && node --test tests/formDesignerFormPropertyEditor.test.js tests/formDesignerPropertyEditor.runtime.test.js tests/acrfViewToggle.test.js
cd frontend && npm run test:component
cd frontend && npm test
cd frontend && npm run lint
cd frontend && npm run build
cd backend && <backend-venv-python> -m pytest tests/test_form_annotation_positions.py tests/test_export_acrf.py tests/test_export_word_errors.py -q
```

Replace `<backend-venv-python>` only after verifying the actual interpreter and test isolation. Add the new targeted domain test path once created; do not claim it already exists. Use backend pytest-cov and the existing frontend coverage provider to show applicable coverage is at least 80% and does not decrease. DevTools steps: full-mode domain entry → save/reopen → designer and visits aCRF → matching Word; cancel/error/blank and brief-mode entry absence.

## Review / Rollback Gates

R1: all caller models/dirty baselines updated together. R2: save failure/leave guards preserve input. R3: no identifier or renderer behavior drift. Rollback is source revert only; preserve domain values. C4 cannot edit the same save files concurrently. Record run/not-run/failed/blocked accurately; no commit/merge/deploy without separate authorization.
