# C6 — Administrator Quick Data History and Project Repair

## Goal / Evidence

Own R12/R14 and quick-history R9/R10/R13/R16; planning only. D8 retains five-minute committed-data history, replaces fixed 100-count/100-MB with default 7-day age/optional capacity, and makes all management/repair administrator-only. C7 full sets include files; C8 restores the system; neither is this project-data path.

Evidence: `models/field_definition.py:31`, `models/form_field.py:24`; `background_jobs.py:26`/`:43`/`:94`/`:104`; database guidelines `:30`; parent F2/F3/F5/F9/F10/F12 and research. Existing import/undo is not whole-design restore; definition→operation→audit cascades and pending/applied distinctions are explicit. No runtime incident/size/ratio was measured.

## Requirements

| ID | Requirement |
| --- | --- |
| C6-R1 | File-free quick capture/repair: no Word/report/Logo/attachment generation, copy or unlink; no current file binding/content rollback. Reference provenance is non-restorable. |
| C6-R2 | Explicit automatic quick versus manual/protection/formal/full kinds/capabilities. Data-only readiness needs no Word; formal pairs still need both originals. Origin controls cleanup eligibility. |
| C6-R3 | Capture complete committed in-project design/unplaced dependencies/persisted orientation/annotations. No draft/shared-edit auto submission or promise of browser-local width/height recovery. |
| C6-R4 | Default-on five-minute changed-content-only capture; default automatic age 7 days, independent optional size rule off initially. Either enabled rule permits oldest eligible cleanup. No inherited count/100MB cap. Manual/pre-repair protection excluded; no physical disk-size guarantee. New-capture failure preserves old history. |
| C6-R5 | Reuse C4 coherence and C2 versioned schema/hash/codec, finite expansion/input bounds, system-local history. Bookkeeping changes neither design revision nor Agent fingerprint. Product exchange excludes it; faithful C7 system backup includes it. Recycle retains histories, final project purge affects current project records but not sealed full sets. |
| C6-R6 | Existing lifespan/disable/thread/independent-session jobs, no overlap or new dependency/queue. Skip inactive/unowned/recycled capture targets, isolate project failures and drain workers on shutdown. Admin sees truthful last-check/success/error; browser logout is unrelated. |
| C6-R7 | Current-admin-only history/read/compare/policy/cleanup-preview/repair-preview/apply; may target another owner's active project through dedicated scoped routes. Admin reauthorization → project lifecycle/membership → validated target. C3 pure current/target diff, second confirmation bound to revision/hash, no silent draft submit/discard. |
| C6-R8 | Capture actual current design as protected manual-action pre-repair data, not a scheduled cleanup candidate. Protection/reconciliation/proposal retirement/replay success and any approved retention commit atomically; failures preserve current design/history. Explicit admin manual deletion only, finite operation/storage preflight. |
| C6-R9 | Restore allowlisted design/compatibility data, preserve Project identity/list position/owner/auth/lifecycle/files/revisions and completed operation/audit identities/results. Definition removal cannot cascade into private history; reviewed nullable-pointer detachment before flush/autoflush, no retarget/FK disable. OID-keyed annotations and legacy field data explicitly preserved/validated or unsupported nonempty state rejected. |
| C6-R10 | Reauthorize/recheck stale/expired/missing/evicted/corrupt/foreign/unsupported/invalid/space-failed targets. Pending and approved unapplied shared proposals (even preview status=done with no after_fingerprint) permanently retire with accurate restore audit; applied replay unchanged, no content ABA revival. Same-request uncertain-response handling applies at most once. Cache/reload/undo reset success-only; cancelled/failed local input survives. |

## Acceptance

| ID | Result |
| --- | --- |
| C6-AC1 | Quick capture/retention/repair makes no document/asset file call; formal C2/C7 still requires dual originals. |
| C6-AC2 | Initial/changed/coherent/no-change/concurrent capture includes unplaced/persisted data and omits drafts/local-layout/file promises. |
| C6-AC3 | Exact age/optional-byte/combined/equal-time/race tests implement 7-day default and manual/protection exclusion; oversize/insert/commit failure loses no old record. No old count cap. |
| C6-AC4 | Disable/startup/tick/restart/cancel/drain/lifecycle/failure status passes; browser logout does not stop jobs. |
| C6-AC5 | Admin auto/formal comparisons label capture limits and offer no nonexistent originals; non-admin read/policy/download/compare/repair fail without leakage. |
| C6-AC6 | Cancel/stale third-write/role-loss/recycle/target-eviction/expiry rejects with no design/history/input loss. Admin role, not project ownership, gates legitimate other-owned project management. |
| C6-AC7 | Successful repair atomically restores allowed graph, keeps exact protected pre-state/current private/files/identity, advances revision and permits later explicit protected-data repair. |
| C6-AC8 | Fault injection across protection/pointer/proposal/graph/cleanup/replay/commit rolls everything back. Concurrent confirmations/replays do not redirect stale IDs or apply twice. |
| C6-AC9 | Every product exchange/copy excludes quick/protection/review/replay state; C7 full image retains it; recycle/purge/foreign-project rules are correct. |
| C6-AC10 | New unit/API/job/real-SQLite/component/security and affected tests pass ≥80% without decrease; C5 B10–B12/B15 real evidence or explicit blockers. |
| C6-AC11 | Restored-away definitions preserve operation/audit IDs/exact replay and detached-pointer historical views. Pending/approved unapplied ABA cannot revive; applied replay unchanged. Legacy field/current list position/OID annotations follow documented policy. |

## Capacity / Dependencies

Net data roughly equals projects × changed captures × stored bytes. Seven days of continuous five-minute changes is 2,016 captures/project, not a promise of actual size; at assumed 0.1/0.5/1 MB that is 201.6/1008/2016 MB per project before DB/WAL/index/protection/manual overhead. Size rules can shorten that age window once enabled. Neither compression nor real payload/disk/performance is measured; no claim a 7-day default stays within old 100 MB. No live VACUUM per tick.

After C4/C2/C3, before C7/C8/C5. C6 supplies common admin quick-history/policy host; C7 extends it sequentially for system groups. No local-draft recovery, file/system restore, full-package project extraction, new Agent tool/role/force flag, dependency or production operation. Concrete codec/expanded bounds/pointer/terminal/review/replay details require final review before separate execution approval.
