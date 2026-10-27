# Required bounded spec reads

These pointers replace whole-file injection entries for two oversized specs. They do **not** replace reading their applicable source sections. Use targeted Read ranges/headings below; keep the rest discoverable on disk.

## Transaction and isolation rules

Source: `.trellis/spec/backend/database-guidelines.md`.

- Read `Session Patterns`, especially background/request session ownership (lines 28–44) and write/read session conventions (132–158).
- Also read `Test Session Isolation` in the already-listed `.trellis/spec/backend/quality-guidelines.md` (275–345).
- Actual code evidence takes precedence over illustrative stale snippets: `backend/src/database.py:958-963` wraps writes in `session.begin()`. This task's services/routes must flush but not commit internally; a raised failure rolls back all operations in that request.
- Trigger: direct create, normalized profile update/create, reorder, and the new atomic restore-batch endpoint. Preserve ownership before reads/mutations and keep all restoration rows/labels/order shifts within the caller's transaction.
- Verification: API tests assert independent readback after a new-rule failure, including a failure after earlier batch items and label creation have already executed. Preserve hermetic test fixtures, force disabled background jobs, and use disposable paths only.

## Ordering and preview/export grouping

Source: `.trellis/spec/guides/cross-stack-contracts.md`.

- Read §2 `Two-Phase Ordering Algorithm` (86–136) and §5 `Word Preview / Export Strict Table-Field Parity` (391–497).
- §2's old illustrative request/response is not the current API contract. Verified code is `POST /api/forms/{form_id}/fields/reorder` with `{ "ordered_ids": [...] }`, HTTP 204 (`backend/src/routers/fields.py:390-400`), preserving complete/duplicate/scoped ID checks and `OrderService`'s existing two-phase algorithm. Do not change production code to match the obsolete example. A will correct this directly relevant spec prose after verification.
- §5 requires preserving continuous normal/inline ordering, strict preview/export text/layout contracts, and existing width/orientation behavior. This task adds edit validation only; it does not merge/re-render tables, alter column planning, or revive inactive unified grouping.
- For canonical 0/1 markers, guard fixtures should agree with current frontend grouping and backend export segments; count inline groups only. Noncanonical truthy integers are conservatively counted by the guard without rewriting legacy data or claiming the old export and preview agree for those values.
- Verification: shared block fixtures, existing presentation/preview/order tests, import/whole-copy compatibility, and full regressions. If a rendering/planner change unexpectedly becomes necessary, stop and report an Open Question rather than broadening scope.

## Other required source context

The remaining manifest entries point directly at the applicable quality/error/auth/frontend specs and project prefs. Read their relevant sections as instructed by the reason text; the guard plan does not authorize skipping ownership checks, warning-gate tests, actual diff review, required commands, or reporting environment constraints.
