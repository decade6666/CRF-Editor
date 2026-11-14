# C7 Execution Plan — Not Started

## Gates / Sequence

C2/C3/C4/C6 contracts reviewed/integrated. Separate implementation authorization and final review of private storage, faithful-copy primitive, capture barrier/drain, codec/manifest limits, server-local catch-up/retry and group cleanup before task start. No real data/secret/config/upload reads or backup execution now.

1. Inventory source-only DB/files/managed roots, all write/cleanup/worker/session lifecycles and admin API/UI. Record inclusions/exclusions; preserve existing stripped exchange. Review capture barrier scope with imports/uploads/Agent/history/Logo/background purge.
2. RED faithful-copy/manifest/include-exclude and admin-negative cases using synthetic DB/files. Test users/Agent private state retained in recovery image but absent from exchange; no backup-root/temp/symlink/config-secret traversal.
3. RED→GREEN private run/origin/status/catalog and durable idempotent run identity. Add current-admin policy/manual-run/read/download checks and bounded progress/errors; never store/log raw auth/design payload in catalog output.
4. RED real concurrency capture tests, then implement drained barrier + SQLite consistent copy/matching file stage; release before Word render. Inject cancellation/file/DB/barrier release faults.
5. Reuse frozen C2 engine for all active captured projects, automatic layout and new paired originals. Add metadata to staged recovery image and C3 normalized package reader. Test zero projects, soft-deleted inclusion without regeneration, all-pair completeness/Logo and current-live edits/purge independence.
6. RED→GREEN seal/checksum/DB integrity and atomic complete publication. Fault each step/response loss/restart; no partial complete record, source repair or old-backup eviction. Safe incomplete-run inspection/explicit retry/cleanup, no external queue.
7. Implement server-local 02:00 default schedule with existing disable/worker lifecycle; test DST/missed/repeated local time/clock rollback/timezone migration/startup latest-catch-up and manual/full/recovery overlaps. No public test force-tick endpoint.
8. Implement shared admin 30-day/optional-byte group policy and cleanup preview; manual/protection/latest-good/active/reference-shared exclusions. Test exact boundaries, blocked over-budget warnings, unlink/catalog failures and no live-project purge.
9. Update README zh/en, module docs/index and implemented admin workflow. Review actual diff/security, all affected tests/parity and ≥80% non-decreasing coverage. C8 receives verified sets/catalog; C5 B13–B15 real evidence, not unit clock fixtures.

## Future Commands — Not Executed

```bash
cd backend && <backend-venv-python> -m pytest tests/test_background_jobs_flag.py tests/test_recycle_bin_cleanup.py tests/test_agent_access_exports.py tests/test_test_environment_isolation.py tests/test_export_service.py tests/test_export_acrf.py -q
cd backend && <backend-venv-python> -m pytest --cov=src --cov=main --cov-report=term-missing:skip-covered
cd backend && <backend-venv-python> -m ruff format --check .
cd frontend && npm run test:component
cd frontend && npm test
cd frontend && npm run lint
cd frontend && npm run build
```

Verify actual venv/fixture paths first. These regressions do not replace new backup/manifest/barrier/scheduler/retention/security/component suites; create them RED-first and report actual paths. Compare baseline coverage, no decrease. Existing parity script uses authorized synthetic inputs. Do not claim real compression/storage/Word rendering from schema/arithmetic checks.

## Rollback / Authority

Source rollback preserves private sets/catalog. Provisioning storage, deployment, actual manual/scheduled backup, disposable credentials and destructive cleanup follow separate permissions. No production systemd/8888. C5 uses DevTools only, no dependency/runner/CI changes. No source, file generation or runtime operation is performed by these artifacts.
