# C8 Design — Maintenance Recovery, Durable Control and Authorization

## Proposal Boundary

This is the destructive whole-system path, not C6 project reconciliation, existing import/clone or simple SQLite backup copy. Exact storage/maintenance/auth compatibility is a final-review gate; no code/runtime/deploy change is approved by this document. Reuse local C7 verified sets/control and existing stack only; do not replace host systemd or introduce a runner/recovery daemon by default.

## Control Outside the Restored State

Keep selected-set identity/hash, operator/request/confirmation digest, protected pre-state location, phase transitions and recovery audit in the C7 private control root excluded from restore/auto cleanup. Use durable atomic control updates and a single recovery/full-run exclusion protocol. Restore catalog/current policy remains authoritative; copied business DB rows cannot recreate missing backup directories or revert cleanup settings. Audit contains safe IDs/hashes/phases only, never database payload/password/token values.

Proposed phases: `reviewed → maintenance_requested → quiescent → protection_verified → staged_verified → switching → verifying → completed`, with explicit `aborted_before_switch`/`rolling_back`/`blocked` outcomes. Persist intent before each irreversible boundary. Crash tests, not labels, prove recovery. Exact fsync/rename/platform guarantees and maximum spare space are measured/reviewed in implementation.

## Preflight / Confirmation

Admin API selects known sealed ID, not user path/upload. Revalidate current admin and manifest/file/hash/schema/runtime compatibility, safe paths and required free space for staged plus protected copies; check post-restore admin identity access exists without reading/displaying password hashes. Reject incompatible versions initially, no opportunistic startup migration or secret fallback. Show all-user/account/file rollback, missing server-secret/deployment scope and how to log in afterward. If recovery admin credentials are unknown, stop for a separately authorized operator procedure, not bypass auth.

Propose a short-lived reviewed target/current recovery-generation binding plus request ID. Response-loss result retrieval is outside the switched business DB and still requires current authorization or approved restricted maintenance operator status. Never automatically retry a restore because an HTTP response disappeared. A different operation/current generation or changed/deleted target requires new confirmation.

## Quiescence / Protection / Stage

1. Gate mutating routes, Agent tools, manual backup and jobs at a common maintenance barrier; display maintenance to browsers, preserve local drafts but block writes rather than silently queue them. Inventory ordinary requests, imports/uploads, Logo/Word/temp work, recycle/cleanup, history publication and SQLite background threads.
2. Stop admitting work, signal/cancel loops and drain accepted workers/transactions/render subprocesses. Await cancellation alone does not stop a thread. Block or finish relevant downloads safely; release/dispose DB connections before replacement. Do not touch unrelated services/ports/real data during tests.
3. Take a verified protected current DB/files copy while quiescent. This captures actual current assets/private state without demanding new Word generation; mark internal admin recovery protection/manual-pinned. Do not call project purge or normal full run recursively. If protection/space fails, reopen unchanged old system and report abort.
4. Stage target into new private locations, enforce manifest extraction bounds and path/symlink/hardlink safeguards, verify schema/integrity/FKs and matching file references with network/background writes disabled. No untrusted source SQL/bootstrap/migration. Ordinary DB and files remain untouched until stage verifies.

## Switch / Restart Protocol

A DB transaction cannot atomically replace DB and upload trees. Propose journaled same-filesystem recoverable rename/switch with old generation retained until verification, integrating startup so the marker is handled BEFORE normal `init_db`/reserved-admin repair/background jobs. If current layout spans filesystems or cannot support this guarantee, stop and revise the reviewed approach rather than silently copy-over live paths.

Never pair a staged DB with current WAL/SHM, keep old Sessions alive or let an automatic migration rewrite the target before validation. On crash before complete marker, startup uses persisted intent/validated generations to complete or roll back deterministically; ambiguous/unverifiable state stays in restricted maintenance, not normal service. Post-switch verification checks DB/file/archive references, readiness and admin access. Only then expose fresh sessions/jobs; failure preserves protected/old data and accurate durable outcome. Retained rollback generations are never auto-cleaned as normal scheduled sets.

## Authentication / History Treatment

Full recovery intentionally rewinds account/password/role/business-audit contents to the backup image. Current operator's post-backup account may be absent or password different; preflight and clear recovery-login instructions are mandatory. Pre-state protection preserves post-backup history; external recovery audit records the new action without faking business-audit continuity.

Propose a non-rewound persisted recovery authentication generation checked by browser token issue/validation; rotating only restored auth_version may reuse a historically valid value. After switch advance generation, require fresh login and revoke/reissue restored Agent credentials so archived tokens cannot regain access. This requires a narrow reviewed cross-stack auth contract update, current/source token compatibility and complete auth regression. Do not change Agent ten-tool DTO/fingerprint/replay bytes/caps or rewrite completed results to invalidate tokens. No hidden environment-secret change or auth fallback. If a safe generation mechanism cannot fit current contracts, stop before implementation/recovery and review alternatives.

## API / UI / Rollback Evidence

Admin Backup Management uses useApi for preflight/confirm/status with no-store safe responses. During disconnect/restart it reports reconnect/maintenance/unknown, not false success; no looped apply. Ordinary users see maintenance/fresh-login messaging, never backup contents. Active operator session is not assumed to survive; post-restore access follows restored roles and fresh auth.

RED tests inject termination and faults at every durable phase, including auth-generation update, rollback verification and restart before bootstrap. Synthetic old/new user/role/JWT/Agent states prove no resurrection. Add full DB/file hash/reference assertions, active-write/worker races, non-admin rejection, catalog/auto-policy preservation, admin path and UI component cases. Real C5 B16 requires specifically approved disposable recovery, not production restart. Source rollback retains sets/protection/control and may not delete unknown state. No actual service/DB/file/token operation during planning.
