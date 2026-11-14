# C4 Execution Plan — Not Started

## Preconditions

C1 integrated; user reviews the proposed revision table/triggers, browser header/status compatibility and minimal atomic replay changes. Start only this child after separate implementation authorization. Reconcile actual main, covered endpoints, existing Agent contracts and active editor/history code first.

## Ordered Checklist

1. RED reproduction: file-backed SQLite, two real connections, competing stale form updates and a browser/Agent supported surface. Retain original-state/no-partial-write assertions.
2. Enumerate concrete read/write endpoints, precondition-gated versus invalidation-only writers, 204/status contracts and history commands. Confirm snapshot/token coherence and all design-table invalidation paths before choosing trigger definitions.
3. RED→GREEN online revision storage/migration/trigger tests, including existing/new projects, option/link cascades, raw imports/copies, no-op writes as documented and private export stripping. Prove synthetic auto/protection/review bookkeeping has no state effect and design replacement does; document the atomic contract C6 will consume. Do not touch Agent fingerprint bytes or bounds.
4. Implement atomic covered writer wrappers and coherent response metadata; add explicit missing/stale/foreign/validation failure tests. Keep one physical transaction per accepted command.
5. Add `useApi` metadata/error support without changing existing callers by default; update protected editor/field-library and history paths to use loaded state tokens, preserving cached payload-token pairs.
6. RED→GREEN conflict UI, cancel, reviewed overwrite, third-write re-conflict, current reference guards, real before-image undo and session/project late-response handling. Make required multi-step history replay atomic with a minimal closed operation, not a broad command framework.
7. Update actual user/module/index docs and new cross-stack contract in a separate spec change at the authorized finish phase. Actual diff/security review, coverage and all affected regressions precede integration into C2.

## Validation Commands — Future Only

```bash
cd backend && <backend-venv-python> -m pytest tests/test_agent_access_concurrency.py tests/test_agent_tools_edit.py tests/test_agent_shared_changes.py tests/test_field_profile.py tests/test_field_restore.py tests/test_inline_table_guard.py tests/test_permission_guards.py tests/test_agent_access_exports.py -q
cd backend && <backend-venv-python> -m pytest --cov=src --cov=main --cov-report=term-missing:skip-covered
cd backend && <backend-venv-python> -m ruff format --check .
cd frontend && node --test tests/designerHistory.test.js tests/useApiSessionRace.test.js tests/designerNewFieldDraft.test.js tests/designerFieldCopy.test.js tests/basePathDeployment.test.js
cd frontend && npm run test:component
cd frontend && npm test
cd frontend && npm run lint
cd frontend && npm run build
```

Verify interpreter/test isolation first. New revision/concurrency/component test filenames are implementation deliverables, not existing commands; append them after creation. Capture pre-change coverage and verify no decrease/at least 80%; if inherited baseline prevents this, report the blocker rather than waive it. Adapter tests are required if its contract is touched, not assumed from backend tests.

## Gates and Rollback

- G1: explicit endpoint/trigger/invalidation matrix; every source/template/exchange path remains safe.
- G2: actual BEGIN IMMEDIATE before auth/token check; real parallel requests cannot both apply stale effects.
- G3: no auto-token refresh/retry, no Agent bypass, no stale before-image undo or partially committed history prefix.
- G4: DevTools proof via C5 with independently established editing states; API tests alone are not browser evidence.
- Rollback: coordinate backend/frontend state enforcement; retain source/db recovery guidance and do not auto-drop revision schema or silently accept old clients. Migration rollback requires separate approval/backup, not an ad hoc destructive command.

No product mutation, credential provisioning, tests or browser are run by this plan itself. No commit/merge/deploy without explicit authorization.
