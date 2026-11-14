# C6 Execution Plan — Not Started

## Preconditions

Planning only. C4 state/transaction contract, C2 typed serialization/private registry and C3 pure capability-aware diff/history host must be reviewed/integrated first. User reviews storage/codec/byte/expanded-data bounds, restoration field/reference/ID policy, proposal invalidation, review/replay defaults and separate execution authorization before `task.py start`. Reconcile current main/active peers. No real DB/config/upload/credentials, migrations, files, scheduler, retention or restore during planning.

## Ordered Checklist

1. Inventory every persisted design column/reference, including legacy `field` rows omitted by current loaders. Separate restorable business/persisted layout from Project identity/list position/auth/lifecycle/file/private state. Retain the completed source review in parent evidence: definition→operation→audit cascades, OID-keyed annotations, owner rejection's narrow guard and preview `status=done` versus applied `after_fingerprint` are explicit facts. Review only reusable import/clone/field-restore primitives; no blanket import replay. Enumerate order/unique/FK/reference constraints and historical views with detached operation pointers before start.
2. RED serializer/codec/capability/dedup tests: complete graph/unplaced entries, exact legacy/null/identifier values, persisted annotation/orientation, unavailable local layout/assets, corrupt/unsupported payload and bounded expansion. Use C2's shared registry; reject unapproved bounds rather than silently truncating/MCP-cap changes.
3. RED→GREEN capture and administrator-configured automatic retention atomically. Test initial/changed/no-change/ABA, seven-day exact age, optional byte limit and combined rules, equal timestamps, concurrent capture and insert/commit faults. Size rule initially off; no count/100MB default. Assert zero file/render calls, no old-history loss or manual/protection eviction. Test independent age cleanup without invoking recycled-project purge.
4. Add the default-on five-minute job using existing lifespan/disable flag, worker-owned Session/thread handoff and one-project boundaries. RED→GREEN no overlapping runs, startup/restart/due/no-catch-up, owner/recycle/purge recheck, per-project failure isolation, last-check/success/error and thread draining on cancellation. Use synthetic clock tests without slowing the whole suite; do not introduce public force-tick endpoints.
5. Add current-admin-only data history/policy/status/compare/cleanup-preview/repair controls through useApi and the admin host. Non-admin/Agent/role-revoked requests and late UI responses disclose nothing. Admin may manage other-owned projects via dedicated routes; no change to normal owner guards. C7 extends the common policy/host sequentially. Tests include capture errors, no fake originals, seven-day/default size-off, local draft retention and lifecycle binding.
6. RED→GREEN restore preview and bounded review identity. Use coherent current capture plus C3 normalized diff, current file/private exclusions and replacement/protection/quota warning. Integrate dirty/busy/save-discard-cancel guards; save or concurrent changes require new review. Preview/cancel cannot create a durable snapshot, mutate design or erase input.
7. RED real-two-connection restore races and failure probes before implementing mutation: preview→third write/target eviction/owner transfer/recycle/expiry, apply versus Agent, double confirmation, request identity mismatch, uncertain response replay, malformed references/order/annotation maps and over-budget protection. Confirm design/history/private/files unchanged on every rejected path.
8. Implement one physical writer transaction: current auth/review/state/target validation, actual protected manual-action pre-state capture (excluded from scheduled cleanup), dependency-safe design reconciliation, reviewed nullable back-pointer detachment before definition removal, final validation, monotonic invalidation, narrow pending/approved-unapplied restore rejection plus accurate audit, automatic-only retention and success/replay, one commit. Never rely on `status != done` or call current owner rejection unchanged. Preserve Project row/list position/files, existing operation/audit IDs, immutable commands/digests/results and applied replay states. No FK disabling, private-row delete/reinsert, historical-pointer retargeting, purge/import SQL, generic DSL or authoring normalization. Inject faults between every phase and prove pointer/proposal/audit/graph/eviction changes all roll back.
9. Implement success-only cache/session-generation invalidation, reload and in-memory undo reset. Cancel/failure/ambiguous response preserves editor input/history until outcome is resolved. Verify stale independent editor commands reject and protection-record restoration works while retained; no whole-project restore masquerades as ordinary field undo.
10. Register auto/protection/review/replay/status state in every product export/import/copy and final-purge path. RED tests prove source DB untouched, fresh copied history, recycle preservation and current files/manual archives unaffected. Keep all source templates read-only.
11. Update actual README zh/en, module docs, `.claude/index.json` and operator capacity/disable/restore limitations when implemented. Separate any Trellis spec/journal commit from product code. Inspect actual diff, self/security review, affected regressions and ≥80% non-decreasing coverage. Hand B10–B12 and B9 integration to C5, not a new browser runner.

## Validation Commands — Future Only

Verify actual interpreter/venv and hermetic test guards before use. Existing regression paths below were located during planning; new dedicated capture/retention/restore/scheduler/codec/API/component suites must be written RED-first and added with their real paths after creation.

```bash
cd backend && <backend-venv-python> -m pytest tests/test_background_jobs_flag.py tests/test_recycle_bin_cleanup.py tests/test_test_environment_isolation.py tests/test_field_restore.py tests/test_project_import.py tests/test_project_copy.py tests/test_agent_access_concurrency.py tests/test_agent_shared_changes.py tests/test_agent_access_exports.py -q
cd backend && <backend-venv-python> -m pytest --cov=src --cov=main --cov-report=term-missing:skip-covered
cd backend && <backend-venv-python> -m ruff format --check .
cd frontend && node --test tests/designerHistory.test.js tests/designerNewFieldDraft.test.js tests/useApiSessionRace.test.js tests/basePathDeployment.test.js
cd frontend && npm run test:component
cd frontend && npm test
cd frontend && npm run lint
cd frontend && npm run build
```

Capture comparable pre/post coverage (≥80%, no decrease), synthetic stored/expanded byte counts, retained count/payload totals and real transaction/no-file assertions. No real-data size/compression claims. Existing tests alone cannot establish the new feature. Adapter suite is needed if its contract is touched; backend tests do not prove adapter behavior. Parity uses synthetic inputs and the existing comparison script if rendering contracts are affected.

C5 runs real DevTools desktop/390px/subpath and at least one real due-time capture with permitted disposable resources; API clock/quota fixtures remain separately labeled evidence. Restoration/cleanup and temporary credentials require their applicable permissions. No Word/WPS visual claim without that runtime.

## Gates / Rollback

- G1: complete versioned design/capability/restore allowlist; exact file/private/identity exclusions and finite expanded-data bounds reviewed.
- G2: atomic capture/dedup/both automatic limits and no old-history loss on failure; no manual files or unlimited protective copy.
- G3: disabled/isolated/drained scheduler plus safe observable status, without new dependencies or production access.
- G4: preview binding, actual pre-state protection and full restore/retention/replay atomically validated by real races/fault injection; proposal ABA and identity remapping explicitly tested.
- G5: UI cancel/failure/input/cache/undo safety, exchange/purge isolation, actual security/diff/coverage and C5 evidence.

Source rollback preserves data history and manual archives; never drop history or run global VACUUM as a convenience. Before any actual project replacement/deletion, ensure approved recoverable task-local setup. Schema rollback, deployment, cleanup, commit and push require their separate authorization. This plan performs none of them.
