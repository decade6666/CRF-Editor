# C7 — Administrator Full System Sets and Daily Formal Archives

## Goal / Facts

Own R15/R17 and full-set parts of R3/R9/R10/R13/R16. D8a/c/f/g: daily server-local 02:00, manual equivalent, all application persistent data/files plus NEW eCRF/aCRF for each active project, automatic layout. Planning only, not permission to inspect actual DB/config/files or run a backup.

Evidence: `backend/src/dependencies.py:37` (admin distinct from owner); `database_export_service.py:87`/`:108` (SQLite copy followed by private-table stripping for exchange); `background_jobs.py:26`/`:94`/`:104` (lifecycle/disable); `routers/export.py:44`/`:67` (optional browser width inputs); parent F5/F9 and research evidence (live assets/transaction boundaries). None is an existing full backup subsystem.

## Requirements

| ID | Requirement |
| --- | --- |
| C7-R1 | Full recovery set covers all application users/projects/accounts/permissions/audit, quick/formal history and owned managed files including Logo/existing originals. No private stripping. Exclude program/source/temp, backup output/control itself, external unapproved paths and secret/environment config. Explicit inventory/manifest, no generic recursive upload-root copy. |
| C7-R2 | Every scheduled/manual normal full run additionally generates a fresh frozen formal snapshot and eCRF/aCRF pair for EVERY active captured project using automatic layout and persisted orientation/annotations. Recycled data is backed up but not regenerated. Same captured DB/files/assets for all pairs, no live re-read or business repair. All required outputs succeed before complete status. |
| C7-R3 | Administrator-only settings, catalogs/status, manual execution, downloads, preview/confirmation of manual deletion/cleanup. Current admin required even for other-owned projects; ordinary owner/Agent credentials do not authorize these APIs. Shared project readers expose package-owned formal records for C3 without a project-extraction restore API. |
| C7-R4 | Default daily enabled wall-clock 02:00 SERVER LOCAL timezone, time configurable. Show zone/next-run/outcome. Single durable scheduled due identity, no overlap with manual full runs/restoration; handle restart/missed day, DST/repeated times/timezone/clock changes without silent duplicates or fictitious history. Honor global background disable; browser logout does not disable scheduling. |
| C7-R5 | Manual full runs share engine/content/validation with scheduled runs, but persist manual origin and never auto-clean. Stable request identity/progress handles response loss without duplicate archives/runs; bounded stages, truthful incomplete/failed/cancelled/warning status. No external scheduler/dependency/queue or secret-bearing logs. |
| C7-R6 | Consistent DB+file capture with coordinated write/file-cleanup quiescence and drained workers; rendering outside the live DB writer lock. Sealed self-contained set hashes/schema/file counts verified before publish; partial pairs, disk/DB/asset/permission/cancellation failure preserves old recovery points. |
| C7-R7 | Scheduled sets and their generated archive group default 30-day cleanup, independent age/size switches with size off initially. When both enabled, either triggers oldest eligible groups; manual/protection/latest usable full/active/reference-shared items are protected. No deletion of projects or retained set dependencies. Warn if protected remainder exceeds cap. |
| C7-R8 | Private catalog/root/control outside the restored data tree; backup traversal excludes it, set remains usable after live project purge or source app edits. Product exchange excludes new private/catalog state, full recovery set includes needed private business state. New sets are not operating-system, server-secret or off-host disaster-recovery backups. |

## Acceptance

| ID | Testable result |
| --- | --- |
| C7-AC1 | Synthetic full set retains users/private Agent operations/audit and owned files, whereas existing product export still strips them. Every include/exclude boundary has assertions; no recursion/symlink/path/secret/temp inclusion. |
| C7-AC2 | For N active captured projects exactly N new snapshots and 2N originals derive from one frozen image; layout/Logo/later edits do not drift. Zero active projects still permits a DB/files set. One missing/failed pair prevents completion. |
| C7-AC3 | Daily/local-zone DST/restart/clock/manual-race tests produce at most one successful set per due identity, no overlapping writers or backfilled fake dates. Disable flag and shutdown drain isolate tests. |
| C7-AC4 | Current-admin settings/read/download/run/replay/delete checks and safe errors; non-admin/Agent/role-revoked cases disclose nothing. Manual replay uses one run and correct manual origin. |
| C7-AC5 | Inject DB/file-copy/hash/second-render/publication/commit/cancel/disk failures: no completed partial set, no live business mutation or old-backup deletion. Bounded capture barrier reopens safely after failure. |
| C7-AC6 | 30-day age and exact optional byte boundaries, combined rules, equal timestamps and concurrent cleanup/download/restore protect manual/latest-good/group references. Project final purge does not damage stored system sets. |
| C7-AC7 | Staged recovery image contains corresponding generated archive metadata/files; C3 can read same-project pair via safe normalized readers. Manifest/catalog/app/schema provenance supports C8 preflight, not arbitrary uploaded DB execution. |
| C7-AC8 | Affected unit/API/real-SQLite/job/component/security/parity/coverage pass ≥80% without decrease; C5 B13/B14/B15 has real browser evidence or blockers, distinct from clock/fault unit fixtures. |

## Dependencies / Non-Goals

C2 frozen serialization/render/schema; C3 normalized readers; C4 coherent capture; C6 shared admin policy/history host. C8 consumes sealed sets/control, C5 verifies UI. Sequential writers in jobs/admin/DB/history UI. No full recovery implementation here, no full-package single-project restore, no remote upload, new dependency/runner/CI, production inspection or code execution during planning. Concrete private storage/limits/capture barrier/clock policy require final artifact review.
