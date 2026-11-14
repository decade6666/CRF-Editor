# Parent Design — Administrator History, Full Backup and Recovery

## Review / Sequence

D8a–D8g in `prd.md` supersedes earlier owner-operated archive/restore and 100-record/100-MB defaults. Designs remain proposals, no implementation/runtime authority. Keep SQLite/FastAPI/Vue, useApi and existing renderer/jobs; no dependency, external queue, CI/deploy/service redesign by default.

Order C1 → C4 → C2 → C3 → C6 → C7 → C8 → C5. Shared editor/admin/history/DB/jobs files are sequential one-writer slices. C2 supplies frozen design/render capabilities; C3 pure diffs accepts synthetic producer inputs to avoid dependency cycles; C6 handles quick project repair, C7 whole sets, C8 system recovery, C5 actual browser acceptance.

## Three Record Classes

| Class | Capture / content | Recovery / retention |
| --- | --- | --- |
| Quick snapshot | Every five minutes, changed committed project design only; persisted annotations/orientation, no file/browser-local input. | Admin project-design repair, current files/private state preserved. Default automatic age 7 days; capacity initially off. |
| Standalone formal archive | Explicit admin project capture; frozen data/layout/Logo + actual eCRF/aCRF originals. Ordinary export creates none. | Exact downloads/admin comparisons. Manual, not auto-cleaned. |
| Full system set | Daily server-local 02:00 or manual same engine. Captured full DB/private state + managed files/existing archives + fresh automatic-layout formal pair for every captured active project. | Admin whole-system recovery only, no package project extraction. Automatic group age 30 days; manual sets protected. |

Origin (`scheduled`, `manual`, `restore_protection`), schema/app/renderer version, capture/complete times, content identities, exact-file hashes and capture capabilities are explicit. Business CRF version/date is not machine revision. File checksum, design hash, C4 monotonic revision and unchanged Agent fingerprint have separate meanings. A quick record's absent file/layout capability is unavailable, not deletion or corruption.

## Administrator Boundary

Propose a dedicated admin Backup and Archive management area and closed `/api/admin/...` APIs: policy/status/catalog, full-run request, whole-system preview/confirm, project histories/formal pairs and comparison. Revalidate current admin for every request/download/replay, not merely at UI entry. Do not replace `verify_project_owner` globally, widen ordinary editing, or add Agent backup/force tools. Admin may operate other-owned project histories through the new scoped routes. Non-admin access, resource mismatches, revoked role/auth and stale late responses fail closed/no-store; logs redact all sensitive payloads/headers.

Admin means executor/manager, not that capture waits for a logged-in browser. Schedulers follow stored configuration and existing disable flag. Project comparison remains same-project; full-system sets are not compared as if one design project.

## Consistency, Storage and Publication

C4 proposes online project revision/triggers and coherent payload-token caching, physical precondition checks and reviewed overwrite/actual-before-image undo. Preserve Agent DTO/fingerprint/replay contracts. History/control bookkeeping does not increment design revision. Source template DBs remain read-only and product exchange strips new private state.

C2 freezes complete schema-versioned design/dependencies plus explicit submitted/manual or automatic layout and safe Logo bytes; render outside the live transaction through a disposable internal context without bootstrap/migrations/global-config swapping. Complete paired originals are immutable and downloaded, not re-rendered. Include or explicitly reject unsupported legacy `field` data rather than trust incomplete loaders. Relative-order diff avoids insertion edit floods; OID/row-key ambiguity and validated OID-keyed annotation semantics are preserved.

C7 proposes a self-contained sealed system set in a private configured backup root OUTSIDE restored DB/uploads and excluded from backup traversal. It contains a consistent SQLite copy (not the stripping exchange helper), allowlisted managed files, generated originals/snapshots and manifest. Do not blindly copy config.yaml, follow links, include external paths/secrets/temp, recurse backup output or publish files. Maintain catalog/recovery control outside the restored tree. DB/file inventory must be source-verified and approved before implementation.

Acquire a bounded capture barrier, stop admitting relevant writes/cleanup and drain in-flight requests/workers before copying matched DB/files; release before rendering. All new formal pairs use that captured system image and automatic server layout. Stage associated archive metadata into the recovery image and manifest only, without rolling back/updating live business design. C7/C3 reader contracts expose these immutable package-owned formal records to the admin catalog; live project purge does not break a retained system set. Any missing new pair, file/hash/schema mismatch or failure leaves the run incomplete, preserves previous backups and cannot be labeled full success. Publication and lost-response identity are durable/replay-safe; no long write lock through rendering.

## Cleanup / Protection

Reuse independent age/size configuration patterns, not recycled-project purge. Quick default 7 days, scheduled full/formal groups 30 days, size rules disabled initially; if both enabled, age removal then oldest eligible remaining entries until size target. Classify actual stored payload/package/associated unique file bytes, not misleading estimates or double counts. Never break retained/reference-shared archives, active captures/restores, in-flight downloads, manual/protection records or last usable full set. A protected remainder can exceed budget: warn/fail new work safely rather than delete recovery guarantees.

Admin-triggered pre-restore protection is a separate protected origin, not a scheduled record eligible for rollover. Quick repair protects data only. Whole-system recovery protects complete current DB/files without requiring successful new Word generation of the possibly damaged state; label it internal recovery protection, not a successful normal daily/manual formal-generation run. Finite per-operation bounds/disk preflight still apply. A failed new capture never pre-cleans old recovery points to make room. Row deletion does not imply SQLite/WAL shrink; staging, manual history, recovery copies and backups add physical space.

## Two Restore Contracts

### Quick project-data repair (C6)

Admin preview binds project/current revision/target hash/restore contract and explicit second confirmation. Reauthorize in physical writer transaction; capture actual pre-state protection, reconcile allowlisted graph and preserve Project identity/list position/owner/auth/lifecycle/current files and completed Agent operations/audit. Definition→operation→audit FKs cascade: reviewed nullable back-pointer detachment must precede deletion/autoflush, never retarget historical operations or disable FKs. Retire pending/approved unapplied proposals (including status-done previews without after_fingerprint) with accurate restore audit; existing owner rejection cannot handle this as-is. Preserve applied replay and prevent content A→B→A revival. One commit; rejected/fault paths change nothing. Success invalidates caches/stale generations/undo; other editors preserve input and hit stale checks.

### Whole-system recovery (C8)

Admin selects locally cataloged verified full set, sees all-user/account/file rollback and maintenance warning. Preflight hashes/schema/files/disk/runtime compatibility/recovery admin access. On confirmed maintenance, quiesce requests/jobs/DB sessions/file cleanup, preserve current state, stage matching DB/files, then switch through a crash-recoverable journal outside the replaced state. Never live-overwrite an open SQLite DB, mix current WAL with an old main DB or report atomicity from a normal DB transaction alone. Recovery startup must resume/rollback incomplete switches BEFORE ordinary initialization/bootstrap/jobs.

Account/password/permission/business audit data returns to backup time, not a selective merge. External control/audit records recovery actor/source/checksums/phase/outcome; the protected pre-state preserves post-backup database history. Backup catalog/policy/control and server deployment/secrets are not rolled back. Current and restored old JWT/Agent authorizations must not silently revive: propose a persistent external recovery authentication generation and explicit restored Agent revocation/reissue, with auth-contract review/tests before start. After recovery require fresh login and verified admin recovery access. Completed historical Agent outcomes are historical records, not authorization to act again. System recovery is maintenance, not ordinary field undo or C6 FK reconciliation.

## Review / Verification Gates

Concrete storage, barrier/drain coverage, crash protocol, authentication generation, snapshot/request/expanded/file/time bounds, schedule catch-up and catalog reader shapes need final review before the owning task starts. No source/dependency/CI change is implied by planning.

RED tests own coherent capture, dual-pair failure, non-admin denial, age/size/origin/reference races, real SQLite writers and Agent ABA/replay; C7 source-vs-set DB/file integrity and scheduler/DST; C8 crash injection before/after every switch, auth resurrection prevention and offline admin recovery. Coverage ≥80% without decrease. Actual diff/security/parity plus DevTools desktop/390px/subpath and disposable full recovery evidence are required; API/component checks do not establish browser/Word visual verification. This phase runs only planning checks; no application/data operations.
