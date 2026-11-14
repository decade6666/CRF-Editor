# C3 Execution Plan — Not Started

## Preconditions

C2 snapshot/list/read contract and C4 state foundation integrated, C1 domain included. Review identity limitations and proposed report/API/UI defaults before starting this child. Use synthetic retained snapshots only unless sanitized real inputs are separately authorized.

## Ordered Checklist

1. RED normalized-diff unit cases for every change category, reversed/identical pair, null/blank/rename, shared impact and library/visit-only changes.
2. GREEN pure schema-aware comparison and relative-order logic. Keep same-project matching conservative and display ambiguity/row-key limits instead of introducing an identity migration.
3. RED→GREEN current-admin-only usable-pair API/report, role-loss/non-admin/Agent/no-disclosure, schema/bounds/no-write. Synthetic quick/manual-formal/scheduled-formal/full-set readers cover capabilities independently from origin; no fake missing-original claim for scheduled formal files. Expose pure C6 preview and C7 package-reader interfaces without requiring producers first or adding project extraction.
4. Implement UI selection/summary/filter/detail through `useApi`, with late-response/session isolation; real mounted tests verify visible before/after values and filter counts.
5. Generate independent Word revision summary from the same service result using existing python-docx; test document structure/content, safe downloads/text and unchanged archived originals.
6. Update actual README zh/en/module/index docs. Inspect diff, run security and coverage checks plus affected regressions; C5 captures the full comparison/download acceptance journey.

## Validation Commands — Future Only

```bash
cd backend && <backend-venv-python> -m pytest tests/test_field_restore.py tests/test_word_table_parity.py tests/test_export_word_errors.py tests/test_agent_shared_changes.py -q
cd backend && <backend-venv-python> -m pytest --cov=src --cov=main --cov-report=term-missing:skip-covered
cd backend && <backend-venv-python> -m ruff format --check .
cd frontend && npm run test:component
cd frontend && npm test
cd frontend && npm run lint
cd frontend && npm run build
```

Existing regressions alone do not test the new feature: add dedicated diff/API/Word-report and component suites when created, then include their actual paths in the execution report. Verify interpreter/test isolation and coverage baseline (at least 80%, no decrease). Inspect generated Word content in tests; actual Word/WPS rendering is separate from Chrome evidence and must be marked unrun if unavailable.

## Gates / Rollback

G1: matching limitations are explicit, including reused IDs and restore remapping. G2: one insertion is not an edit flood; counts are not duplicated across shared forms. G3: UI/report consume one normalized result; export/current-live mutations are absent. G4: foreign/incomplete/unsupported/oversized pairs fail truthfully and original checksums remain unchanged.

Source rollback must preserve C2 baseline history and files. No DB repair, snapshot rewrite, cross-project import, runtime script or real report generation occurs in this planning session. No commit/merge/deploy without separate authorization.
