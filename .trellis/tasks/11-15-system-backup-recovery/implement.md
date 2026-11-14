# C8 Execution Plan — Not Started

## Start Gates

C7 verified sets/control and admin management integrated. User reviews maintenance/switch layout, startup interception, external audit/generation, auth reissue compatibility and finite staging/protection limits; separate authorization before start. Inventory current source only, never real config/password/DB/upload values. No systemd/8888 or host restore testing.

1. Load current auth/session/admin/Agent/DB/bootstrap/jobs/file contracts. Inspect at least auth.py/admin.py/auth_service.py/user_admin_service.py/rate_limit.py and App.vue/AdminView.vue in sync if auth generation changes; retain existing token/session write-back/401 and separate Agent realm. Explicitly enumerate every writable/worker/session barrier, no presumed global drain.
2. RED admin preview/confirmation, manifest/path/schema/runtime/disk/admin-access and no-switch-on-failure tests with synthetic sets. Design durable external phase/control/auth-generation record before GREEN.
3. RED→GREEN single recovery request identity/status/audit outside replaced DB and restricted maintenance lifecycle; bind current reviewed target/generation and protect active sets from C7 cleanup.
4. Implement drained admission barrier and worker/session/connection disposal, with timeout/cancellation/failure tests. Never overwrite open SQLite main or inherit old WAL. Fail closed if background work cannot stop safely.
5. Implement verified current-state protection and staged target verification; fault every I/O/commit/space boundary. Do not recursively call normal full backup or require Word rendering for safety copy.
6. RED subprocess crash-at-every-phase tests, then minimal journaled DB/files switch and startup resume/rollback BEFORE migrations/admin bootstrap/jobs. Test both same-filesystem guarantees and unsupported-layout rejection; no false DB-only atomicity claim.
7. Implement reviewed non-rewound auth generation/fresh login and restored Agent revocation/reissue. Test tokens from current and earlier backup generations, user/admin disappearance/role changes, applied-operation replay records unchanged and safe recovery-admin access. No secret display, automatic password reset or Agent force bypass.
8. Implement admin progress/disconnect/status/unknown-outcome UI through useApi; component cases include cancel/no-write, lost response/once-only outcome, maintenance, fresh-login and blocked recovery. Old ordinary editors retain unsent input but cannot submit under old sessions/state.
9. Verify full target DB/files/formal references, external catalog/current policy/manual/protection preservation and recorded rollback outcomes. No package project extraction. Only reopen traffic/jobs after complete readiness, otherwise remain restricted with accurate logs.
10. Update actual README zh/en/module/index and operator recovery requirements. Actual diff/security/auth regression and ≥80% non-decreasing coverage precede integration; C5 B16 uses only explicitly permitted disposable resources.

## Future Validation — Not Run

```bash
cd backend && <backend-venv-python> -m pytest tests/test_auth.py tests/test_user_admin.py tests/test_permission_guards.py tests/test_background_jobs_flag.py tests/test_agent_shared_changes.py tests/test_agent_access_exports.py tests/test_test_environment_isolation.py -q
cd backend && <backend-venv-python> -m pytest --cov=src --cov=main --cov-report=term-missing:skip-covered
cd backend && <backend-venv-python> -m ruff format --check .
cd frontend && node --test tests/useApiSessionRace.test.js tests/basePathDeployment.test.js
cd frontend && npm run test:component
cd frontend && npm test
cd frontend && npm run lint
cd frontend && npm run build
```

Verify runtime/hermetic isolation first. Add new real recovery/subprocess/crash/auth-generation/admin API/component suites with actual paths after RED creation; old regressions cannot prove new behavior. Adapter tests are required if auth interaction affects it, using its verified SDK/backend environment. Capture baseline/current coverage, no waiver of failures. Chrome evidence is not Word/WPS or filesystem crash evidence.

## Authority / Rollback

No source change, real backup/protection/restore, service stop/restart, credential generation, migration, installation, commit/merge/push or deletion during planning. Deployment/storage/switch changes and destructive disposable tests need their own permission. A recovery tool must stop rather than guess when verified rollback/admin access is unavailable. Preserve all protected generations/control until specifically approved cleanup.
