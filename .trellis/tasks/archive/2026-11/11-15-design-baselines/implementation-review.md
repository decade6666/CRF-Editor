# C2 Implementation Review Proposal — 2026-11-20

Status: TECHNICAL CHOICES APPROVED through formal AskUserQuestion on2026-11-20: the user selected the proposed private persistence/admin interface and service-internal standard-library renderer/resource budgets. The user subsequently approved the scoped C2 prerequisite disposition while leaving archived C4 AC2 unchecked. After artifact validation, `task.py start` selected only C2 (`in_progress`). No real-data migration, production rendering/service or deployment is authorized. Parent D8 remains authoritative; administrator-only access, immutable paired originals, manual-history protection and product-exchange privacy are unchanged.

## 1. Private Persistence and Files

Recommend three system-local private tables: immutable completed snapshot/provenance (`design_baseline`), fixed-kind file metadata (`design_baseline_artifact`), and bounded capture-request/replay/tombstone state (`design_baseline_capture`). Store canonical versioned JSON in SQLite; do not store Word files as database BLOBs. Keep source entity IDs/order/nulls/case; never substitute the Agent fingerprint for the design/layout/asset hashes.

Recommend a new optional `CRF_STORAGE_DESIGN_HISTORY_PATH`; absent an override, use `Path(config.db_path).parent / "design_history"`. This is a private managed root, not frontend assets, Logo storage, imports, screenshots or temporary export output. Resolve/validate the root, reject unsafe overlap/links, use only server-generated opaque directory/file identities, and never accept raw paths through an API. Tests must redirect it below their own fresh temporary root before app import. Operator documentation and Git exclusions accompany implemented behavior, not production changes.

Publish only after both frozen originals validate and checksums/byte sizes are recorded. Keep capture identity bound to project/current actor/canonical explicit request. A reused identity with different input conflicts; deleted requests remain tombstoned so a lost response cannot recreate an explicitly deleted archive. Incomplete/failed/interrupted work is not a completed/downloadable pair. Manual retry is explicit; no mutation auto-retry or durable work queue.

## 2. Dedicated Admin API and Host

Recommend `/api/admin/projects/{project_id}/design-baselines` list/create, a coherent capture-context read, per-baseline detail, fixed `ecrf|acrf` downloads and explicitly confirmed whole-pair deletion. Paginated lists default to 20/max100. Closed DTOs carry request identity, label/remark, layout and the exact source revision; no server paths or credential values enter responses. Every read/replay/download/publication/delete rechecks current browser auth, admin role, project lifecycle and resource membership. These routes do not join or widen the existing nineteen strict owner writers, general owner helpers or Agent tools.

Add a Backup and Archive entry to the existing admin shell, not an ordinary-user Versions entry or an admin design editor. A read-only capture preview may submit explicit layout overrides against its exact paired design revision; absent overrides, layout is automatic. Another user's unsaved drafts or browser widths are never fetched or inferred. In-host pending preview/layout work is resolved before submission. The ordinary editor/export path stays unchanged and gains no automatic history.

The current admin/ordinary workspace separation is verified at `frontend/src/App.vue:755-790`; original Word export collects widths from the ordinary designer at `:302-316`. Therefore do not claim the admin host can flush another browser's pending annotation queue. Standalone capture records the committed design/annotations it actually read; an intervening write yields a visible stale-state refusal/review, not silent draft submission. C7 always chooses automatic layout independently of a browser.

## 3. Shared Frozen Contract and Rendering

C2 owns an allowlisted complete persisted-design registry/closure, versioned data-only DTO/hash and explicit capabilities. Capability (`data_only`/`formal_pair`), origin (`manual`/`scheduled`/`restore_protection`) and storage source (`live_history`/`full_set`) remain separate. C3/C6 use the pure data layer; C7 calls the frozen pair engine with its already captured graph/assets. No live restore/import API is introduced.

Capture authorized state and graph under one short physical SQLite snapshot, including unplaced definitions/dictionaries/units and legacy `field` rows. Classify legacy rows explicitly: preserve supported rows in the snapshot; if their nonempty state cannot be faithfully rendered, reject formal publication with a visible compatibility failure rather than drop/repair data. Validate in-project forward/reverse links and model/renderer field coverage.

Freeze safe bounded Logo bytes with file-identity/change checks during capture. Render outside the live transaction in a disposable internal SQLite/ORM context, without app startup, bootstrap/migrations, live config swaps or imported schema/triggers. Add a narrow optional frozen-Logo resolver to ExportService; ordinary export keeps its current default behavior. Both documents use the same context/layout/TOC inputs. Recheck current admin/project lifecycle before standalone publication, but do not reject merely because normal design edits continued after capture.

For an enforceable render deadline, recommend a service-internal standard-library subprocess running only the frozen renderer. It is not a new test runner, CLI command, external dependency or queue. It receives bounded validated frozen input, not a live database/config path. On deadline/failure, publish no completed record and do not delete prior archives. This internal isolation choice also requires approval before implementation.

## 4. Proposed First-Version Safety Budgets

These are proposed finite safety limits, NOT measured production capacity or retention guarantees. Measure synthetic boundary behavior during authorized implementation; any required increase or broader worker design is reviewed rather than silently adopted. Existing Agent bounds remain unchanged and independently named.

| Boundary | Proposed limit |
| --- | --- |
| Capture request JSON | 256 KiB; label100/remark2000 Unicode characters; at most4096 total explicit width entries |
| Design graph | 50,000 cumulative rows; canonical snapshot32 MiB uncompressed |
| Frozen Logo | Existing validated bitmap contract, at most5 MiB |
| Original files | 64 MiB per DOCX, 128 MiB pair; expanded validation256 MiB per DOCX |
| Rendering | 300 seconds per complete pair; one admitted render per application process, busy refusal rather than an unbounded queue |
| Disk preflight | At least1 GiB free at the managed staging volume; enforce actual write limits too, fail visibly without pre-cleaning old history |

These limits constrain a single new operation, never silently evict manual records or impose the retired100-record/100-MB history policy. Layout/manifest/file validation refuses over-limit complete operations; no truncation followed by successful publication.

## 5. Lifecycle and Exchange

Register all three history/capture tables as private product-exchange state. Strip them from exported copies before pruning/VACUUM and prove source state is unchanged. Existing explicit import/clone graphs never ingest history or private file references. C7 faithful backups intentionally use a separate inclusion boundary, not the stripping export helper.

Recycle retains history. For final live-project purge or explicit whole-pair deletion, database commit precedes unlink; DB failure preserves usable originals, post-commit unlink failure remains observable. Active reads/captures and shared/package references block unsafe removal. C7 self-contained sealed copies are never removed by live-project purge. No C6/C7 schedule, retention engine or restoration is implemented in C2.

## Approval and Verification Gates

1. Establish an explicit C2 prerequisite disposition from actual evidence/fresh tests, while preserving the archived broader C4 AC2 status.
2. Confirm sections1–4 (private schema/root, admin API/manual-layout host, internal render isolation and finite budgets).
3. Update existing task design/implementation artifacts and only then start C2 with `task.py start`.
4. RED first for frozen completeness/races/privacy/partial pair/replay/faults; minimal GREEN; actual-diff/security/parity and comparable >=80% non-decreasing coverage.
5. Browser launch/temporary browser credentials and any destructive isolated operation still require their own applicable approval. No production/8888 or real-data use.
