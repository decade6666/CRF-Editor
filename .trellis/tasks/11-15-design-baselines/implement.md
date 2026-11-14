# C2 Execution Plan — Not Started

## Preconditions / Dependencies

C1 and C4 integrated at reviewed revisions. User reviews snapshot/private-file storage, API/defaults, capacity bounds and frozen rendering adapter before this child starts. Inventory current export/import/copy/purge callers and app test isolation; no production data/credentials may be used. This plan is not implementation authorization.

## Ordered Checklist

1. RED snapshot tests: complete graph and unplaced entries, untouched legacy text/nulls/IDs, coherent C4 revision, cross-project link denial and independent captured layout/Logo. Demonstrate that later live changes cannot affect the staged export input.
2. Implement versioned snapshot DTO/registry and safe capture plus minimal internal render context. Add model/export coverage guards; no source DB migrations/bootstrap in render context. Publish manual/data-only capability descriptors and shared server-design hashing for C3/C6, tested with synthetic automatic records without requiring C6 scheduling/restore. Keep rendering/assets separate from that reusable layer.
3. RED→GREEN baseline/artifact schema and isolated private storage. Review measured row/manifest/file/time budgets and failure messages before exposing capture; no hidden eviction or MCP-cap changes.
4. Render both originals from one frozen state; implement request-identity replay, output/checksum validation, incomplete/failure reporting and publish/file/commit compensation. Inject second-render, authorization-change, disk, cancellation and DB failures.
5. Implement current-admin-only list/create/read/download/delete and admin-host lifecycle through useApi, including non-admin/Agent/role-loss/no-disclosure and legitimate other-owned projects. Resolve local unsaved state explicitly, preserve ordinary user editing/Word export and global owner helpers. Publish capability/origin/package-reader contracts for C7; manual archives excluded from automatic cleanup, scheduled pairs owned by C7 groups.
6. Extend export-private stripping, import/clone exclusions and shared final-purge file cleanup. Prove live source untouched, `.db` carries no history, soft-delete/restore retains it, and commit failure never deletes usable artifacts.
7. Update README zh/en, backend/frontend module docs, `.claude/index.json` and operator private-storage notes only for implemented behavior. Review actual diff, targeted security, parity, coverage and affected regression suites; hand stable contracts to C3/C5.

## Validation Commands — Future Only

```bash
cd backend && <backend-venv-python> -m pytest tests/test_export_service.py tests/test_export_acrf.py tests/test_export_column_width_override.py tests/test_export_word_errors.py tests/test_project_copy.py tests/test_project_import.py tests/test_agent_access_exports.py tests/test_test_environment_isolation.py -q
cd backend && <backend-venv-python> -m pytest --cov=src --cov=main --cov-report=term-missing:skip-covered
cd backend && <backend-venv-python> -m ruff format --check .
cd frontend && node --test tests/basePathDeployment.test.js tests/exportDownloadState.test.js tests/appSettingsShell.test.js
cd frontend && npm run test:component
cd frontend && npm test
cd frontend && npm run lint
cd frontend && npm run build
```

Verify the actual interpreter/environment. New baseline migration/service/API/storage/purge/component suites must be created and added to the targeted run; existing commands are not sufficient alone. Capture coverage baseline and require at least 80% without decrease. For strict parity, use an authorized synthetic preview JSON and archived originals with the existing `backend/scripts/compare_word_table_parity.py`; do not read the real template/production DB as an assumed fixture. Report LibreOffice/Word GUI availability and fallbacks truthfully.

## Gates / Rollback Points

- G1 snapshot closure plus coherent capture/Logo/layout inputs, no private/user leakage.
- G2 same snapshot → both files; no complete record on partial generation, stable checksums and idempotent capture identity.
- G3 database-before-file deletion, explicit post-commit cleanup failure, every purge/export/import/clone path tested.
- G4 UI isolation and DevTools pair-download/cancel/delete acceptance with synthetic data.
- Rollback preserves history and private files; schema rollback/cleanup/deploy requires separate approval and recoverable state. No commits, data deletion, migration execution, file generation or service startup occurs during planning.
