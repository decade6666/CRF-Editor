# C8 — Administrator Whole-System Backup Recovery

## Goal / Allocation

Own parent R18 and recovery parts of R7/R13/R16. D8b chooses whole-system restoration from a selected locally cataloged verified full set; no per-project extraction. C6 independently handles admin project-design snapshots without files. Planning only, no permission to stop services or touch actual DB/files/auth.

Evidence: `backend/src/dependencies.py:16`/`:37` validates current auth/admin; `database.py:958`/`:978` and `routers/agent_tools.py:137`/`:162` show session/transaction ownership; `background_jobs.py:94`/`:104` starts/stops background tasks. Product exchange at `database_export_service.py:108` strips private data and cannot recover the system. Current source must be inventoried for actual startup/bootstrap/file/worker barriers before implementation; no existing whole-system recovery is claimed.

## Requirements

| ID | Requirement |
| --- | --- |
| C8-R1 | Current-admin-only catalog selection/preview/confirm/status; closed IDs, no arbitrary uploaded DB/paths/SQL. Restore complete backed-up business/account/permission/audit data and matching managed files, including generated formal originals. Not a selective merge or project extraction. |
| C8-R2 | Clearly warn all users are affected and writes/services require maintenance. Preview source/time/schema/app compatibility, overwritten data/files/account implications, exclusions, disk requirement and protected current state. Bind explicit second confirmation to target integrity and current restore generation; auth revocation/changed target requires new review. |
| C8-R3 | Before destructive switching, verify DB integrity/FKs/schema, full file inventory/hashes/paths, staged compatibility, sufficient storage and a usable post-restore admin access path without inspecting/disclosing secrets. Create and verify a protected pre-restore current DB/files copy; this is internal rollback protection, not a normal full run that requires fresh Word rendering. Failure aborts with old system intact. |
| C8-R4 | Coordinate browser/Agent/management writes, file mutation/cleanup, jobs and in-flight workers/DB sessions before switching. No live main-DB overwrite with open sessions or stale WAL. Restore matching DB/files through a durable crash-recoverable protocol, not a claim that a DB transaction atomically swaps files. Startup resolves interrupted recovery before ordinary migrations/admin bootstrap/jobs. |
| C8-R5 | Recovery control/journal/catalog/policy and action audit live outside restored data and survive rollback/restart; record actor, selected hashes, time/phases/outcome safely, not passwords/tokens/payload. Whole recovery rewinds business audit inside DB to backup time; protected pre-state retains later history. No silent audit merge. |
| C8-R6 | Restored accounts/password/permissions follow backup, but active or archived old JWT/Agent tokens must not revive. Require fresh browser login and safe Agent reissue/revocation, with protected recovery authentication generation/compatible auth design reviewed first. Preserve a viable admin recovery path. No manual environment-secret rotation or auth bypass is silently assumed. |
| C8-R7 | Once-only durable recovery identity/status handles response loss and crashes without repeating a destructive action. Pre-switch failure leaves live state unchanged; post-switch failure either verified rollback or explicit blocked maintenance state, never served as normal success. Only resume jobs/requests after DB/files/auth/readiness checks pass. |
| C8-R8 | Current backup library/manual/protection records and recovery settings are not rolled back or automatically removed; prevent old copied catalog rows from resurrecting absent sets/old cleanup policy. Source/app/OS/deployment/secrets/temp/external files are outside the restore set. No CI/release/production automation changes. |

## Acceptance Criteria

| ID | Testable result |
| --- | --- |
| C8-AC1 | Non-admin/Agent/role-revoked/replayed-invalid calls disclose/write nothing; admin preview/confirm only references verified local sets. |
| C8-AC2 | Corrupt/partial/path-unsafe/unsupported schema/runtime/wrong file/disk-insufficient/missing-admin-path cases abort before destructive change; current bytes remain intact. |
| C8-AC3 | A disposable full set restores all intended DB/private/account/file/formal content; exclusions/control/catalog remain current, no package project extraction or hidden data merge. |
| C8-AC4 | Crash/fault injection before/after protection, quiescence, staging, each DB/file switch, auth generation and finalization proves coherent completion or restart rollback. No old WAL/new DB mix, open-session writes or worker side effects after switch. |
| C8-AC5 | Preexisting and backup-era browser/Agent tokens reject after recovery; fresh authorized admin login/reissue works. Recovery action/status survives business DB rewind and source failure. |
| C8-AC6 | Lost response/concurrent confirmation/restart does not execute twice. UI warns/requires confirmation, reports maintenance/unknown/failure truthfully and never automatic-retries restore. |
| C8-AC7 | Recovered history/read/download references match files; restored automatic policies do not delete the current library. Protected pre-state can support a separately confirmed recovery. |
| C8-AC8 | Isolated subprocess/filesystem/SQLite/API/auth/component/security tests and coverage ≥80% without decrease; C5 B16 documents permitted disposable real-browser recovery or exact blockers. No production/real-secret use. |

## Dependencies / Review

Depends on verified C7 set/control protocol, C4 auth/state compatibility and current bootstrap/source inventory. C5 final acceptance. Separate storage/switch/auth-generation design review and execution approval before task start. No external scheduler, uploaded arbitrary recovery format, full-package project extraction, real host restart or destructive operation is performed by this plan.
