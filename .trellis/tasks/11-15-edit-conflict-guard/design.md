# C4 Design — Project Revision Preconditions

## Proposed Approach for Review

Introduce an online-only per-project monotonic design revision, separate from business version fields and the existing Agent fingerprint. Recommend a `project_design_state` record and migration-managed SQLite triggers for invalidation on all relevant design-table mutations. This avoids full-project fingerprint scans/caps on every browser write and missed invalidation by raw SQL/import/copy writers. It is a proposed storage/API change requiring final review, not implemented schema.

Counter increments may occur per changed row; clients compare equality, never infer operation counts. Manual/automatic/protection history, restore-review/replay and credential/approval/result/audit bookkeeping do not increment it. Project metadata, definitions/instances, dictionary/options, units, forms, visits and links are design state; ownership/recycle changes remain independently reauthorized. New/cascaded/moved rows need correct old/new project invalidation. Triggers are installed only on the online DB, never source templates. C6 restoration is an actual design write, so it advances state monotonically rather than restoring the old revision; automatic capture alone does not.

Existing `compute_project_fingerprint` bytes, bounds and Agent DTOs remain unchanged. Agent writes naturally invalidate browser state in their transaction; browser changes remain visible to existing Agent fingerprint checks.

## Coherent Reads and Atomic Writes

Read the editable representation and revision under a real SQLite read transaction; carry a proposed `X-CRF-Design-Revision` response header together with cached body metadata through an additive `useApi.js` method. When an editor combines multiple reads, accept them only if all revisions agree; bounded reread failure shows a reload/error without destroying existing input. Never query a fresh token afterward and attach it to stale data.

Proposed browser precondition: `If-Match` with an opaque project/revision tag. Missing precondition on covered writes returns 428 with `PRECONDITION_REQUIRED`; mismatched state returns 409 with `STALE_STATE` and a safe authorized description, not raw private rows. Keep legacy non-stale validation/status semantics elsewhere. CORS/header exposure, 204 responses and cached reads must preserve the token where applicable; verify actual same-origin/subpath behavior rather than adding unused CORS settings.

Use the same physical-transaction ownership pattern as `backend/src/routers/agent_tools.py:162`: connection-level `BEGIN IMMEDIATE` before current authorization/precondition/business reads, one Session controlling it, then response validation and commit. Do not begin a second writer inside `get_session()` or compute the check on a different connection. Revalidate active project/owner inside the transaction. Increment/trigger effects roll back with failed writes. Return committed state metadata, including for 204 operations.

## Covered Writer Matrix

| Surface | Required behavior |
| --- | --- |
| Form create, PUT/PATCH including domain/notes/annotation, reorder/delete/batch delete | Revision precondition and atomic existing guards. |
| Field-definition create/update/reorder/delete/batch delete; designer profile/binding, instance create/delete/reorder/restore/batch delete | Revision precondition; authoritative before/after images for history; preserve shared-reference and inline guards. |
| Saved regular-field copy draft and immediate log-row copy | Follow the protected writer actually used; local unsaved drafts issue no write. |
| Undo/redo | Use protected existing atomic profile/restore paths. For genuinely multi-request history commands, introduce only the minimal closed, allowlisted atomic replay operation necessary; no generic remote mutation DSL or unreported partial prefix. |
| Reference/preflight POST reads | No write precondition merely because the HTTP verb is POST; preserve read authorization. |
| Dictionary/unit/visit/relations/import/whole-form/project copy | Invalidation-only unless already part of a covered compound command; do not claim stale rejection for all these management entry points. |
| C6 automatic capture/history/protection/review records | No design invalidation or Agent fingerprint change from bookkeeping; no automatic draft submission. |
| C6 confirmed project-design repair | Current-admin/current-state/preview-bound atomic write via this foundation; old editors reject stale commands, IDs do not redirect, undo reset success-only. Ordinary owner editing/Agent approval is unchanged. |
| C7 capture / C8 system recovery | C7 maintenance capture gates/drains writes without altering business design. C8 DB rewind requires external auth/recovery generation and fresh reload/login; old revisions/tokens must not resurrect. These are separate owning tasks, not extra ordinary-editor mutations. |
| Agent tools/owner approval | Existing fingerprint/approval/replay protocols; no new browser header requirement or force flag. |

The implementation must expand this family matrix into concrete endpoints and retained tests before GREEN; enumeration is a gate, not permission to widen product scope.

## Conflict and Confirmed Overwrite

Keep editor input and command intent. Fetch latest authorized state without overwriting the local editor; show old/local/latest values and affected shared references. Cancel writes nothing. Confirmation reapplies only the reviewed command against that exact latest revision, recomputing current business/reference checks. If another update occurs, return to conflict review. Deleted/rebound targets cannot be silently recreated or redirected.

Record an accepted command once with the actual pre-commit before-image so undo reverses the overwrite correctly. Rejected attempts do not advance history, remap IDs or retry automatically. Composite replay must be atomic or explicitly reported failed without a hidden committed prefix. Session/project switch, logout and late responses cannot restore stale drafts in a new context.

## Migration, Exchange and Compatibility

Initialize existing projects safely, install trigger definitions idempotently, test all old/new project and cascade cases. Strip revision triggers and state records from every exported copy before VACUUM; imports/copies start with fresh online state and never execute source-file triggers. Raw backups and application rollback are operationally separate. Update only affected helpers/routes and preserve source-template query-only behavior.

The parent proposes rejecting missing-precondition old browsers with an update notice. Review this explicit compatibility change before start; do not opt out silently to make old tests pass. Test fixtures must supply state deliberately, not auto-fetch the latest token for every request. Backend/frontend must deploy together; rollback cannot assume old application code enforces new preconditions.

## Scope / Verification

Planned areas: `backend/src/database.py`, new focused revision/mutation service/model/schema, covered form/field routes/services, private export stripping, `frontend/src/composables/useApi.js`, editor/history and field-library hosts. Reuse profiles/restore services; no global route rewrite. Real two-connection concurrency, migration/invalidation/exchange, Agent regression, safe-error/session-cache, component/history and DevTools tests are mandatory. See child implementation plan for commands and gates.
