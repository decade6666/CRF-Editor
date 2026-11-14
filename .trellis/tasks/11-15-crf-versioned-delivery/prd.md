# CRF Versioned Design, Administrator Backup and Recovery

## Status / Goal

Planning only: one parent and eight children, all `planning`, in `.claude/worktrees/crf-versioned-delivery-plan` on `docs/crf-versioned-delivery-plan` (base `acdff49`). No task start, source implementation, dependency/build/deploy change, real-data/secret inspection, service/browser launch, backup/render/cleanup/restore, commit/merge/push or removal is authorized.

Provide usable design history, formal Word originals, revision explanation, mistake recovery and whole-system backup/recovery, without changing the CRF design tool into a subject-data platform. D8a–D8g supersedes conflicting D2/D7 owner-operated backup, fixed 100-record/100-MB and no-system-recovery boundaries. Administrator-only applies to backup/archive/history management, not normal users' existing project design/edit/export permissions.

## Confirmed Background

| ID | Source evidence | Consequence |
| --- | --- | --- |
| F1 | `frontend/src/composables/useDesignerHistory.js:3`: in-memory 20-step history cleared on refresh. | Undo is not durable history. |
| F2 | `backend/src/services/agent_state_service.py:22`/`:36`: bounded canonical Agent fingerprint. | Do not change its bytes/caps or treat it as a snapshot/file checksum. |
| F3 | `backend/src/routers/forms.py:54`, `backend/src/schemas/form.py:106` versus `backend/src/routers/agent_tools.py:162`. | Reproduce stale browser writes before claiming a confirmed incident; reuse physical transaction patterns. |
| F4 | `backend/src/schemas/form.py:109`; `frontend/src/components/FormDesignerTab.vue:168`/`:627`/`:666`; `formDesignerPropertyEditor.js:113`. | Existing nullable domain is read but omitted by frontend shared save/dirty state; no new model needed. |
| F5 | `frontend/src/composables/useColumnResize.js:75`; `backend/src/routers/export.py:44`; `export_service.py:583`. | Browser widths and live Logo affect rendering. Freeze assets; unattended full runs use automatic layout, not local widths. |
| F6 | `frontend/package.json:12`, `frontend/vitest.config.js:9`. | Existing suites are node:test/vitest; DevTools is separate operator-driven evidence. |
| F7 | `backend/src/services/database_export_service.py:87`/`:108`/`:124`/`:151`. | Product exchange uses SQLite backup but strips Agent private state; it is NOT full-fidelity system backup. |
| F8 | `.trellis/tasks/10-13-cdisc-standard-reference/prd.md:7`/`:20`. | Do not duplicate the existing standards-query task. |
| F9 | `backend/src/repositories/project_repository.py:71`; `backend/src/database.py:958`/`:978`. | Explicit coherent capture; rendering outside live transactions. |
| F10 | `backend/src/dependencies.py:37`/`:46`; `.trellis/spec/backend/auth-security.md:142`. | Admin and ownership are different. New management APIs require current admin; normal owner guards stay intact. |
| F11 | `backend/src/background_jobs.py:26`/`:43`/`:94`/`:104`; `models/field_definition.py:31`, `models/form_field.py:24`. | Existing in-process lifecycle/disable/worker patterns, not existing daily full backup. No size measurements. |
| F12 | `models/agent_access.py:66`/`:95`; `agent_access_service.py:222`; `agent_shared_change_service.py:229`/`:292`. | Project-data restore must avoid definition→operation→audit cascade loss and retire unapplied proposals without breaking applied replay. ABA risk is static inference. |

Source paths abbreviated after their first backend/frontend directory remain relative to the same module. Parent `research/evidence.md` preserves full source anchors, annotation/legacy-table constraints and validation limitations.

## Requirements / Approved Decisions

| ID | Requirement | Owner |
| --- | --- | --- |
| R1 | D1/D2a: immutable whole-project formal history includes metadata, visits/links, forms, placed/unplaced definitions, instances, dictionaries/options, units and rendering dependencies. Live design remains editable; no approval/project-lock/version workflow. | C2 |
| R2 | D3/D7c: administrator UI comparison and explicit separate Word revision summary use one normalized same-project diff, including formal/data-only pairs and form filters. Report semantic/layout/order changes and ambiguous identity; uncaptured files/layout are unavailable, not deletions. Reads create no history or edits. | C3 |
| R3 | D2b–D2d/D8c: every formal archive has one frozen design/layout/assets set and both real eCRF/aCRF Word originals. A pair is complete only if both succeed. Downloads return retained bytes/checksums, never fresh rendering. Ordinary user Word export remains archive-free. | C2, C7 |
| R4 | D5: nullable, case-preserving free-text domain in full mode, normal save/cancel/dirty flows, blank/legacy/import/preview/export consistency. No standards lookup/semantic/OID validation or multi-domain model. | C1 |
| R5 | D4a: atomic stale protection for core form/field create/save/order/delete/undo/redo/restore, including supported browser/Agent mixed writes. Other design writers invalidate state without claiming every management API is precondition-gated. | C4 |
| R6 | D6: existing Chrome DevTools with disposable resources; no Playwright/dependency/runner/command/CI or npm-test change. Rendered evidence is separate from API/component tests. | C5 |
| R7 | Preserve normal ownership/isolation, read-only templates, identifiers/order/undo/inline-table behavior, Agent wire/fingerprint/replay/bounds and preview/export parity. Global admin recovery is explicitly scoped below, not a global permission bypass. | All |
| R8 | Artifact review and separate implementation authorization precede each task start. Proposed storage, maintenance, API/security and bounds are not implemented permissions. | Parent |
| R9 | Product DB full/user/project exchange and copy/import exclude history/private control state; targets have fresh history. In contrast, administrator system backups include full database/private state and managed persistent files. No backup-directory recursion or secrets/environment/program/temp packaging. | C2, C6, C7 |
| R10 | D8d/D8e: cleanup applies only to scheduled records. Manual full backups/standalone formal archives are protected from automatic cleanup and require explicit admin deletion. Quick age default 7 days; scheduled full/formal group age default 30 days. Age/size switches independent per class, size off initially; either enabled condition triggers oldest eligible cleanup. Preserve latest usable full backup and active/protection sources; report unmet limits. No inherited 100-count/100-MB cap. | C6, C7 |
| R11 | D4b: preserve input, display latest changes and allow confirmed overwrite of precisely reviewed state; another write requires new review. No validation/reference/permission bypass/merge/Agent force flag; undo uses actual pre-commit state. | C4 |
| R12 | D7a/D8: default-on five-minute changed-content-only committed design snapshots, no document/asset copies or draft submission. Capture persisted layout but not browser-only widths/heights; no nonexistent original-download claim. Admin manages histories. | C6, C3 |
| R13 | Capacity rules distinguish actual stored payload/package/file bytes from DB/WAL/index/staging/protection/manual space. New-capture failure does not delete old recovery points. Review finite per-operation bounds; no disk/ratio claims from illustrative sizes. | C6, C7, C8 |
| R14 | D8b: admin project-data restoration from a selected quick snapshot uses preview/current-revision/target-hash binding, second confirmation, actual pre-state protection and atomic validation/reconciliation. Preserve current Project identity/list position/owner/auth/lifecycle/files/completed Agent results/audit; safely retire pending/approved unapplied proposals and prevent cascade/ABA loss. Explicit legacy field/OID-annotation compatibility; no generic import replay or file restoration. | C6, C4 |
| R15 | D8a/D8c/D8f: each full run backs up all users/projects/accounts/permissions/audit plus managed persistent files and existing archives, and generates a NEW eCRF/aCRF formal pair for EVERY active project from that same captured system state. Scheduled and admin-manual full runs use the same engine and server automatic layout/persisted orientation/annotations. Missing pair/file/integrity failure cannot be labeled complete. | C7, C2 |
| R16 | D8: all archive/history/full-backup operations, comparisons/downloads, schedule/retention settings, cleanup and restore are current-administrator-only. Background work follows configured policy, not a browser session; ordinary users cannot access these APIs/controls. Admin may manage projects they do not own through dedicated scoped routes, not modified global owner helpers. | C2, C3, C6, C7, C8, C5 |
| R17 | D8g: daily enabled schedule, configurable wall-clock time default 02:00 in SERVER OS LOCAL timezone. Show actual zone/next run; test timezone change, DST/clock rollback, restart, due identity and no overlap/duplicate jobs. Global background disable still isolates tests. | C7 |
| R18 | D8b: admin may select a verified full backup for WHOLE-SYSTEM data/files recovery only, with maintenance warning/window, safe pre-restore protection, compatibility/integrity/space/admin-access preflight, coordinated quiescence, recoverable DB+file switch and durable outcome. No full-package per-project extraction. Old browser/Agent credentials must not regain authorization; restore audit/control survives outside restored data. | C8 |

## Child Map / Dependencies

| Key | Task directory | Deliverable |
| --- | --- | --- |
| C1 | `../11-15-form-domain-authoring/` | Existing domain authoring. |
| C2 | `../11-15-design-baselines/` | Admin formal capture/originals, shared frozen serializer/render contract and private-history rules. |
| C3 | `../11-15-baseline-diff-report/` | Admin same-project capability-aware diff/Word summary, reusable pure diff. |
| C4 | `../11-15-edit-conflict-guard/` | Normal core-editor state/conflict/undo safety. |
| C5 | `../11-15-browser-delivery-regression/` | Admin/user negative cases and integrated DevTools evidence. |
| C6 | `../11-15-periodic-design-snapshots/` | Five-minute data history, 7-day/configurable cleanup and admin atomic project-data restore. |
| C7 | `../11-15-system-full-backups/` | Daily/manual full system sets + fresh project formal pairs; admin catalog/settings and 30-day group retention. |
| C8 | `../11-15-system-backup-recovery/` | Admin maintenance-mode whole-system recovery and crash/auth/audit safety. |

Execution: C1 → C4 → C2 → C3 → C6 → C7 → C8 → C5. C3 uses synthetic auto/full-group inputs before their producers exist. Parent-child links are not dependencies; overlapping DB/admin/history/job files have one sequential writer. C5 checklist can be drafted earlier, integrated execution is last.

## Acceptance Criteria

| ID | Testable result | Mapping |
| --- | --- | --- |
| P-AC1 | Every requirement has independent owning ACs, explicit dependencies and validated context. | R1–R18 |
| P-AC2 | Formal snapshots are complete/coherent, editable live design unchanged, private-safe and identifier/legacy-compatible. | R1, R7 |
| P-AC3 | Both originals match frozen state and retain checksums across later edits/downloads; failures never become completed pairs. | R3 |
| P-AC4 | Admin UI/Word agree on pair/counts/direction/filters and disclose weak identity/uncaptured layout, including quick/formal/group inputs. | R2, R12 |
| P-AC5 | Domain save/reopen/cancel/dirty/designer/visits/Word agreement for blank/mixed-case/legacy values. | R4 |
| P-AC6 | Real stale races reject atomically, retain input, support cancel/reviewed overwrite/third-write re-conflict and correct undo; Agent contracts survive. | R5, R11 |
| P-AC7 | Every product exchange excludes histories, whereas full backup retains recovery-private state; project purge cannot erase immutable system sets. File/history lifecycle failures preserve usable records. | R7, R9, R10 |
| P-AC8 | DevTools desktop/390px/subpath plus actual tests/build/lint/parity/security evidence or explicit blockers; coverage ≥80%, no decrease. | R6, R7 |
| P-AC9 | Lossless PRD convergence/final artifact review; planning does not start a task or authorize real operations. | R8 |
| P-AC10 | Quick capture is coherent/change-only/no-file; 7-day/default and optional size rules exclude manual/protection records, preserve old data on failure and honestly report storage. | R10, R12, R13 |
| P-AC11 | Admin quick restore protects actual pre-state, is atomic on races/faults, preserves files/current identity/private history and prevents cascade/ABA loss with exact completed replay. | R14 |
| P-AC12 | Each scheduled/manual full set contains verified DB/files and new paired originals for all captured active projects, with no secret/program/temp/self-backup inclusion or live-repair side effect. | R13, R15 |
| P-AC13 | Non-admin archive/backup/read/download/compare/policy/restore routes all reject without disclosure/write; admin handles other-owned projects only through the new dedicated boundary. | R16 |
| P-AC14 | Server-local daily timing, no duplicate/overlap, failures/restarts/DST and independent age/space group cleanup follow policy; manual/latest-good/active sources remain protected. | R10, R17 |
| P-AC15 | Verified full-set restore switches matching DB/files with crash rollback, external audit/control and safe current/archived session invalidation. Wrong/partial/corrupt/unsupported/insufficient-space/replayed cases do not damage the running system. | R18 |

## Exclusions / Review Boundary

No implementation now; external standards/EDC/regulatory/e-signature/roles/realtime collaboration; generic merge or full-package single-project extraction; backup of entire OS/application binaries/server secrets/temp/external unapproved paths; automatic remote publication/upload; multi-instance/DB-engine/CI/release changes; production operations. Normal user Word export is unchanged. Full recovery deliberately returns business/account/audit database state to its backup time; post-backup activity is not silently merged, and the recovery action/current pre-state must remain recoverable outside the switched database.

D8a–D8g product choices are resolved. Exact private storage/codec/maintenance/auth-epoch/clock/replay/bounds and safe storage layout are reviewable designs, not already approved migrations or executed recovery. Capacity/compression/downtime are unmeasured. Review `design.md` and each child before separately authorizing execution.
