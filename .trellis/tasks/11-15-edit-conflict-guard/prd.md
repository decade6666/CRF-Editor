# C4 — Core-Editor Conflicts and Confirmed Overwrite

## Goal and Allocation

Reject stale core-editor writes without losing input, while permitting an explicitly reviewed owner overwrite. Own parent R5/R11; inherit R7/R8 and evidence F3/F9/F10. Planning only: reproduce the scenario before calling it a confirmed defect or incident.

## Requirements

- C4-R1: Retain a failing real two-connection/two-session reproduction. Test browser/browser form properties separately from supported browser/Agent shared surfaces.
- C4-R2: Use a machine state precondition, distinct from business version labels/time fields. Read payload and token coherently; check token, authorization and mutation in one physical transaction.
- C4-R3: Preserve local input on conflict; show reviewed remote state and allow explicit owner-confirmed overwrite of that exact state. Another update requires renewed review. No implicit rebase, automatic merge, deletion-to-upsert, permission/impact/validation bypass or Agent force flag.
- C4-R4: Keep existing Agent fingerprints, DTOs, replay-before-stale ordering, approval digest/expiry, result/audit atomicity and bounds. Existing mixed writes must invalidate browser tokens without weakening Agent gates.
- C4-R5: Protect core form/field create/save/order/delete and undo/redo/restore, including saved field-copy drafts. Distinguish independent dictionary/unit/visit/import/whole-copy entry points: they need not all require preconditions, but any effect on protected state must invalidate old tokens. Publish an endpoint/writer coverage matrix.
- C4-R6: Document compatibility/rollback and refuse missing-precondition browser writes under the proposed final-review policy; no silent unprotected fallback or forced reload discarding input.
- C4-R7: Rejected/cancelled attempts add no history. Accepted overwrite is recorded once and undo restores actual pre-commit state; composite history commands must not partially commit an unreported prefix.
- C4-R8: Provide C6 the atomic state-precondition/invalidation contract for whole-design restoration, not the restore implementation. Auto/protection/review bookkeeping must not invalidate design; restoration must. Keep revisions monotonic and prevent stale undo/commands from being silently redirected after remapping/replacement.

## Acceptance Criteria

| ID | Outcome |
| --- | --- |
| C4-AC1 | Retained RED reproduction becomes GREEN under the new contract; tests exercise actual SQLite connections/transactions. |
| C4-AC2 | Two writes based on one state cannot both apply conflicting effects; stale or failed validation commits nothing. Payload/token reads cannot combine different states. |
| C4-AC3 | Browser input survives rejection; cancel is write-free; confirmation targets reviewed state; a third intervening write re-conflicts; overwrite/undo use correct before-images and Agent cannot force bypass. |
| C4-AC4 | Agent replay/approval/stale/error behavior and supported browser/Agent mixed writes remain correct with no duplicate operation or lost result. |
| C4-AC5 | Existing save/cancel/dirty-leave, inline-table/reference guards, ordering, ID remap/undo/restore and ownership behavior pass; invalidation-only writers are explicitly tested. |
| C4-AC6 | Unit/API/concurrency/component/security/coverage checks pass; C5 supplies real browser evidence or explicit isolation/tool blockers. |
| C4-AC7 | Synthetic bookkeeping writes leave state unchanged, real graph replacement invalidates old tokens monotonically, and C6 has a documented atomic precondition/response contract without changing Agent wire/fingerprint rules. |

## Dependencies

C1 should land first because it changes overlapping form-property code. C4 provides the reviewed state/precondition foundation consumed by C2; C3/C5 use its identifiers/flows. Each implementation has one writer per overlapping file. New online state must not enter product exchange or change Agent content fingerprints.

## Out of Scope

Hard edit locks, real-time collaboration, new roles, automatic merge, globally gated management APIs, generic transaction scripting, and speculative cross-stack rewrites. Concrete revision/transaction/API proposals require final review before this task starts.
