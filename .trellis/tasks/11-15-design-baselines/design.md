# C2 Design — Coherent Snapshots and Dual Originals

## Proposed Persistence / Review Boundary

Recommend system-local `design_baseline`/artifact metadata and versioned design/layout schema with safe private originals/frozen Logo. No large Word BLOBs or unrelated account data inside a project archive. D8 makes capture/history/download/delete administrator-only and adds C7 faithful full-system sets; this C2 model is not a stripped exchange or full-server backup. Storage/migration remains a final-review proposal.

Completed baseline content/metadata is immutable. Proposed metadata includes ID, project/creator, creation label/time/remark, source revision, snapshot schema/content hash, rendering/app version and ready/failure state. Artifact metadata includes fixed kind, internal relative name, bytes and checksum; paths are not public response fields. New timestamps use an explicit UTC convention without rewriting legacy recycle timestamps. Label defaults are in the parent PRD.

## Capture Boundary

The snapshot registry allowlists Project design values, visits/links, forms, definitions/instances, dictionaries/options and units, including unplaced library entries. Preserve source IDs/order/nulls/legacy text and validate in-project cross-links. Compare registry coverage with model/export reads, not only `ProjectGraphLoader`/Agent fingerprint: those omit the still-registered legacy `field` table. Explicitly classify/capture its compatibility rows or reject unsupported nonempty data, never silently drop them. Exclude accounts, credential hashes, Agent operations/audit and unrelated project/admin state. Capture persisted annotation/orientation semantics without repair: annotation keys are `variable_name`/`_form`, not numeric IDs, and validated JSON need not retain original whitespace bytes.

Save Baseline first resolves active local draft/property dirty state using existing save/discard/cancel guards and flushes queued persisted annotations. It then sends a coherent C4 project revision with the current export-width inputs. Unsaved drafts are not silently included; cancelled resolution stops capture. Persist only export-affecting parameters as such: browser-only preview row heights may be recorded as preview metadata but must not be falsely described as Word rendering inputs.

Within one real short read snapshot, authorize current admin and active project/lifecycle/membership, check the revision, read the whole graph and capture canonical metadata. Freeze Logo bytes via safe project storage resolution and the referenced immutable file identity; if it vanishes/changes during capture, fail/retry visibly. Do not render the two Word files against a later live Logo or different live DB state. Hash design, layout and captured assets separately from artifact bytes. Release the live transaction before rendering.

## Shared Data-Only Contract for C3/C6

C2 owns persisted-design/closure/capability and frozen-render contracts, not C6 quick scheduling/repair or C7 full scheduling/packaging. Model capability (`data_only`/`formal_pair`) separately from origin (`manual`/`scheduled`/`restore_protection`) and storage source (`live_history`/`full_set`): automatic C7 formal pairs have files, automatic C6 quick records do not. Every formal pair requires both validated originals; uncaptured is not deletion. C3 tests synthetic quick/full-set readers before producers exist. C7 uses frozen full DB/assets/automatic layout and stages package-owned metadata; no current-live design mutation or browser width inheritance.

Keep a server-design content hash separate from manual layout/assets hashes and history-record ID/capture provenance. Preserve source entity/reference keys in the versioned representation; any ID normalization must be explicit and tested, not guessed by OID. C6 can use the shared contract for deduplication and bounded protection snapshots without invoking render/storage adapters. Register all history/protection/review/replay bookkeeping as private online state for export/import/copy/purge. C6 must not add its rows to automatic design invalidation or Agent fingerprint inputs. Restoration remains a separate C6 write path; the disposable render-context materializer is not a live database replacement API.

## Rendering and Publication

Reuse `ProjectRepository.get_with_full_tree` and ExportService semantics by materializing the allowed snapshot into an internal disposable SQLite/ORM render context. This is an implementation-local adapter, not a new public exchange format or a source migration. Do not run app startup/bootstrap, import untrusted tables/triggers, swap global config or depend on live files. A narrowly scoped optional Logo resolver/bytes injection into ExportService may be needed; keep ordinary export's default path behavior unchanged.

Generate eCRF and aCRF sequentially from that one context with identical layout/TOC settings; preserve existing optional LibreOffice fallback warnings. Stage files under opaque server-generated names, validate output, compute checksums and only then publish a completed pair. Recheck current admin/project lifecycle before standalone publication. Live design edits during rendering do not alter the captured state and do not require project locking.

Use a stable capture request identity and unique project/actor binding to avoid duplicate completed baselines after an uncertain response. An incomplete/failed preparation may be visible as such but cannot be downloaded/compared as completed; no new durable worker queue or automatic mutation retry. Pending work after interruption is reported incomplete and can be explicitly retried/removed under the approved policy, never fabricated as successful. Exact finite row/manifest/file/time budgets require measurement and review before start; existing MCP caps are untouched.

## Proposed Administrator API / UI

Propose dedicated `/api/admin/projects/{project_id}/design-baselines` list/create/read/fixed-kind-download/confirmed-delete, with closed bounded ID/kind DTOs and no raw paths. Creation supplies label/remark/request identity/layout/C4 precondition. Current admin may manage other-owned projects through explicit scoped routes; never modify general ownership helpers. Admin Backup and Archive host replaces the ordinary-user project Versions entry, while normal Settings/Agent/export controls remain unchanged.

Every request/replay and post-render publication rechecks current admin, project lifecycle and resource membership; owner JWT alone is insufficient. Standalone normal capture requires active project, historical full-set readers use C7 catalog lifecycle. Downloads are no-store, integrity-checked exact bytes and safe filenames; missing files fail, not re-rendered replacements.

## Retention, Purge and Exchange

Admin deletion requires explicit whole-pair loss warning. Standalone/manual archives are never auto-cleaned; C7 scheduled archives are group-owned with default 30-day/optional-size automatic-only policy and reference protection. DB commit precedes unlink; commit failure retains usable files, unlink failure leaves observable private orphan. Recycle retains current project history; shared final-purge cleans current local files only after commit, preserving Logo callers. Retained self-contained full sets survive live project purge. Every delete/cleanup rechecks active readers/captures/recovery references; no shared artifact removed while retained elsewhere.

All product full/user/project export copies strip artifact/baseline metadata and online state/triggers before VACUUM; source is unchanged. Existing import/clone allowlists must reject/ignore new private tables and file references, with fresh history in the target. C7 full-system backups deliberately retain private tables/histories/files through a distinct faithful capture; never use product-export stripping there. C8 owns whole recovery.

## Planned Areas and Verification

New focused baseline model/schema/router/services and Vue dialog/composable; registration/migration in `backend/src/database.py`; the minimal frozen-input export adapter; database exchange/private stripping; shared purge and its callers; project UI entry and API/cache lifecycles. Review all `project_purge_service.purge_project` callers before signature changes.

Tests cover coherent capture versus concurrent edits, Logo/width freeze, unplaced dependencies, schema drift/legacy data, dual-output failure, repeated request identity, staging/commit/unlink faults, lost authorization, private export/import/clone, recycle/purge, checksum-stable downloads and safe paths/errors. Security/parity and no decrease in coverage are required; C5 supplies actual UI evidence.

## Rollback

Source rollback must preserve archived private files/data until an approved recovery decision; never drop history as a convenience. Schema version rejects unsupported reads rather than silently rewriting history. Document private storage in operator backup guidance, but do not implement a new backup service or deployment change in this child.
