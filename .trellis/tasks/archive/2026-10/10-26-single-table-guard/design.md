# Single horizontal-table edit guard — design

## 1. Approved decisions and boundaries

`prd.md` is authoritative for R1–R9 and AC1–AC9. The user approved the atomic restoration endpoint and then explicitly approved the final planning artifacts, relay implementation, existing locked-dependency installation, tests, and disposable local app/browser validation with temporary test credentials through AskUserQuestion on 2026-10-26. A activates the task before dispatch; production access and Git publication remain unauthorized.

- Model A owns planning, environment preparation, live-browser validation, actual-diff review, acceptance and Git history. The user approved current A (`gpt-6.1-sol[1M]`).
- Relay model B defaults to alias `sonnet`; determine its resolved model from the completion event, not assumptions. Independent reviewer R defaults to `fable` (current environment mapping `claude-opus-5-5[1M]`, still verify the actual event).
- No database migration, global write hook, new dependency, import/whole-copy restriction, renderer regrouping or general history-engine rewrite.

Evidence: `research/table-grouping-and-mutations.md`; runtime/verification prerequisites: `research/validation-environment.md`.

## 2. Policy and ordered field model

Both guard implementations use the same shared fixture at `backend/tests/fixtures/inline_table_block_cases.json`:

1. Count transitions from disabled to enabled markers in the actual field sequence, not marked-field totals or all rendered tables.
2. Accept if `after_count <= max(1, before_count)`; the baseline is the current state for this edit/replay, never an old history exemption.
3. Use the common message `单个表单最多允许一个横向表格，本次操作会新增横向表格，已取消操作` for this business failure. Preserve ordinary network-error wording separately.
4. The frontend helper lives with current grouping in `formFieldPresentation.js`; reuse `buildFormDesignerRenderGroups` rather than a second renderer/grouping algorithm. Export a small count/policy helper and the message constant; do not build a generic command framework.
5. The backend helper is a small `inline_table_guard.py` service: pure marker-run counting, an ordered `(order_index, id)` marker query, and final-count validation returning/raising the specific HTTP 400 reason consistently with existing profile services. It must not commit/rollback itself or import the Word exporter.
6. Existing schemas accept arbitrary integer markers. Count truthy/nonzero integer markers conservatively on both sides, as the current preview does, so `2`/negative values cannot evade the new guard. Do not rewrite old values or modify schemas/export to fix the pre-existing noncanonical marker rendering difference. Canonical 0/1 cases remain export-group equivalent.

Callers provide the intended logical order. Backend queries use the repository's existing ordering. Frontend uses `sortFormFieldsByOrder` and immutable candidates. Copy drafts already carry fractional `order_index` and `__draftOrderIndex`; retain those semantics. Sort the main preview's field projection too when needed so raw array append order does not create a false second-block preview for a valid adjacent copy. Do not persist a reorder merely to preview a draft.

## 3. Existing backend editing transactions

Keep owner/resource validation and existing error precedence intact. Capture the count before the first definition/instance/order mutation and check the actual flushed final rows before returning from the request transaction:

| Entry | Placement |
|---|---|
| `POST /api/forms/{id}/fields` | After form/definition ownership and duplicate checks, before constructing/inserting the instance; unify the append/explicit-position return path so neither bypasses final validation. |
| `POST /api/forms/{id}/field-profile` | In `create_field_profile`, before definition creation/shared changes; validate after actual type normalization and insertion/flush. |
| `PUT /api/form-fields/{id}/binding-profile` | In `update_binding_profile` upsert, before definition/binding changes; validate actual normalized state and keep cleanup in the same request transaction. The delete branch cannot increase blocks and need not be restricted. |
| `POST /api/forms/{id}/fields/reorder` | After form ownership, before the repository reorder; preserve complete/duplicate/scoped ID checks and two-phase ordering, then validate final ordering. |

`get_session()` already uses `session.begin()`. A raised business error unwinds that transaction, including definitions, binding, cleanup and order shifts. Do not catch it into a success response, add an internal commit, or validate only payloads containing `inline_mark`.

Plain single/batch deletion cannot increase runs. Direct shared-definition PUT currently does not normalize all referencing instance markers; leave that behavior unchanged. Import/clone/whole-form copy do not pass through this new edit guard.

## 4. Approved atomic field-restoration API

### Contract

- `POST /api/forms/{form_id}/fields/restore-batch`
- Authentication and form ownership are required exactly as for other form-field edits.
- Request: `{ "items": [{ "form_field": <FormFieldCreate>, "field_definition": <FieldDefinitionCreate or null> }, ...] }`.
- `items`: 1–500 entries; new envelope/item models reject unknown sibling keys. Reuse existing nested field payload validation rather than duplicating color/OID/presentation rules. This endpoint accepts restoration snapshots, not arbitrary profile updates.
- `form_field` carries the old insertion position and full instance attributes. A null definition is allowed for log rows. A regular field requires an existing definition; an optional `field_definition` snapshot is a **label-only fallback**, matching the existing delete-undo snapshot behavior. It is not permission to create/update arbitrary shared definitions.
- Response: HTTP 201 with a `List[FormFieldResponse]` in **request item order**, even if insertion work is sorted by original position internally. Returned IDs are newly created IDs; frontend history remapping occurs only after the whole request succeeds.
- Schema/shape/list-bound errors: 422. Ownership: existing 403/404 conventions. Missing regular definition: 404; duplicate binding/OID/identity conflict: 409. New block-limit violation: 400 with the common Chinese message.

### Execution

Implement a focused `field_restore_service.py`, called by a thin route. Use the caller's existing request session; no commits inside the service.

1. Verify the target form/project and every referenced existing definition belongs to the authorized project. Never use a label fallback to bypass a foreign definition's ownership check.
2. Reuse valid existing definitions without modifying them. For a deleted label definition, validate the label-only snapshot and its codelist/unit links with the same project checks as existing definition creation, then recreate it with existing ordering routines. Do not overwrite/rebind an unrelated existing definition on stale ID/OID collision; fail safely with a conflict.
3. Capture the current block count before any writes. Recreate instances at the captured positions with `OrderService.insert_at`/existing append semantics; preserve the snapshot's instance attributes, including legacy markers, rather than silently normalizing imported historical layouts.
4. Check the final actual ordered layout once for the entire restoration. Any error rolls back all instances, newly created labels, and ordering shifts.
5. Return the created instances in request order, not execution-sort order.

Do not expose an exemption/bypass flag or apply the old snapshot count as the baseline. The endpoint is not a general transaction API and is never used by import/whole-copy paths.

### Frontend restore wiring

Replace the existing multi-request missing-label fallback in `recreateFieldFromSnapshot` with the restore endpoint for a one-item list. Batch-delete undo submits **all** snapshots in one request. Reuse one small host helper for both. Remove the replaced per-row POST/fallback cleanup branch, not unrelated history code.

Do not mutate snapshot IDs or call `remapId` while requests are pending or after failure. On full success, map returned instances to input snapshots and update history IDs, then reload using existing session/cache guards. Backend atomicity, not frontend prediction alone, guarantees no partial restoration if another client changes the form before the request.

Other history operations continue using their current atomic create/profile/reorder API; the same current-state guard applies. The existing `useDesignerHistory` stack behavior is retained. Pre-existing multi-request shared-definition-PUT then profile-delete undo remains outside a general history transaction redesign; deletion cannot introduce the new block failure.

## 5. Immediate frontend guard and narrow rollback

Evaluate a prospective effective state **before** committing a grouping-changing local operation. Preserve the selected field/form/session and unrelated editor values. Reuse existing normalization/type support helpers; do not count a field as inline if this operation's final type normalization turns its marker off.

- **Inline toggle / quick edit:** Build the candidate field list and reject an invalid marker change before a write/impact prompt. Restore the control's previous marker without resetting name/color/default text. Keep quick edit open where appropriate; no success toast on rejection.
- **Type/candidate change:** Preflight the effective marker with the candidate type and existing values. Treat the type/candidate transition plus its dependent marker/default/OID/candidate-session changes as one operation. On rejection retain the previous candidate/type state and all earlier unrelated edits. Do not silently force the marker to a different legal value as a workaround.
- **Draft creation/copy:** Check the intended sorted insertion position before committing a local row/selection change. Valid adjacent inline copies remain allowed even when the raw array appends the draft. Invalid operations create no draft and retain the previous selection. Draft edits use the previous accepted draft/editor layout as the local baseline; rejected changes preserve other draft content.
- **Persisted property save / draft save:** Recheck the final proposed state before dispatch as a backstop. The backend remains authoritative for races. On this specific remote business failure, restore only the operation's layout-affecting values; keep other dirty input and never record success/history. Ordinary network/schema failure behavior is not redefined.
- **Reorder:** Build a candidate without mutating shared rows. Reject before accepting it when possible; if server validation rejects an optimistic order, restore the exact previous array/order and selection. Show the specific table-limit reason; keep the existing `排序保存失败，已恢复` for unrelated failures. Retain no-op, insertion-boundary, end-zone and Ctrl+arrow behavior.
- **History:** Keep current-context checks, busy locks, cache-before-refresh ordering and failure stack retention. Single/batch restoration uses the new atomic endpoint; other increasing actions reach guarded existing endpoints. A business-rule failure must not discard unrelated dirty state via an unnecessary generic reload.
- **Hydration/read/cancel:** Loading an old form, selecting a field, canceling edits back to persisted state, or receiving an unchanged imported form must not trigger unsolicited errors or automatic legacy repair. Avoid watcher loops/repeated toasts when restoring rejected values.

Keep changes local to the domain helper and host component; do not change shared history-engine APIs, add a state-store library, move large component sections, or modify preview markup/layout.

## 6. Verification and security

See `implement.md` for exact commands and ownership. Required cases include:

- Shared canonical/noncanonical marker fixtures, no mutation, run counting, R6 comparisons.
- Both split directions (enable outside a run; disable inside it), normal separators including label/log, valid expansion, unchanged-layout edits and legacy progressive repair.
- Final normalization even when the marker is omitted; definition fork/shared-update/binding/order rollback after the new check actually executes.
- Atomic restore success for regular/label/log fields, correct returned-ID order, missing-label fallback, duplicate/foreign/missing definition failures, malformed/empty/oversized requests, and a later invalid separator causing **zero persisted batch effects**.
- Real component DOM/control tests for marker rollback, precise invalid drag/keyboard order, preserved selection/unrelated dirty text/color, valid copied-draft position in both previews, and failed single/batch undo preserving stacks/IDs.
- Unchanged import and whole-form/project copy behavior, OID/column/preview/history regressions.

A performs a structured security pass for the new endpoint: ownership before mutation, every definition/link project-scoped, bounded input, no bypass flag, atomic failure, no private config/logging. Add adversarial cross-user/cross-project tests. No production configuration/database access.

A runs the app and real browser on disposable local state if explicitly authorized and feasible, distinguishing it from happy-dom component tests. A read-only independent review is required for this complex task after A's own diff review and verification. After B was stopped, the user formally authorized A takeover within the same 25 deliverable paths; A now owns any fixes and R remains read-only.

## 7. Compatibility, rollout and limitations

No migration or data backfill. Existing clients remain compatible; the restore endpoint is additive and the new UI uses it for delete undo. Fresh imports/copies may still carry multiple blocks intentionally; later editing follows R6. The backend guard prevents non-browser API callers from bypassing the limit.

Runtime rollout/commit/merge/push are not authorized by this planning phase. Do not restart or rebuild the shared live service. A browser fixture uses an unused local port and disposable data, with separate formal approval for temporary credentials.

General transport/commit uncertainty and unrelated multi-request history network failures are not solved by this task. Do not claim all history is globally transactional. The newly approved restoration operation itself is one server transaction, including label fallback.
