# C3 Design — One Diff Result, UI and Word Outputs

## Input and Identity Boundary

Current-admin-only compare/download; choose same captured project and supported schema across live history or C7 sealed-set readers, even if the live project was later purged. Quick data readiness needs no files; every formal record (manual or scheduled) needs its pair. No arbitrary uploads/SQL/project extraction/mutation/merge. Capture capability, not automatic origin, determines original availability.

Pure diff accepts validated normalized inputs; C6 uses coherent current-versus-quick repair preview, C7 supplies package-owned same-project readers through a shared interface. C3 tests synthetic quick/formal/full-set fixtures before producer implementation, avoiding cycles. Uncaptured quick layout/assets are unavailable, not null/deleted. Explicit admin Word report may describe any supported pair; quick jobs/repair never call the report renderer. C7 full-run formal originals are real files with automatic-layout provenance.

Use explicit table/attribute descriptors from the snapshot schema. Same-project row keys give a practical comparison basis, not proof of uninterrupted identity: SQLite IDs may be reused after deletion and existing undo/restore can remap IDs. OID equality is supporting evidence, never a silent fallback identity. State this limitation in UI/report metadata. Flag conflicting/weak evidence as an ambiguous pair or additions/removals requiring review; do not invent a full audit trail or add persistent UUID columns by assumption. Test ID reuse/remap/blank/OID rename cases explicitly.

## Proposed Normalized Result

A closed result identifies pair/direction/schema/record kind/capture capabilities, summary counts, project/visit/library changes, form groups, ordered change items and warnings. Each change includes object kind, snapshot keys/OID/label context, category, before/after values and matching basis/confidence. Preserve null versus absent where semantically relevant; uncaptured is distinct from both. Schema-version changes require a deliberate adapter or visible incompatibility.

Classify definition/type/dictionary/option/unit/required/help/default/binding/domain/name/visit-relation edits as semantic metadata, and font/color/bold/paper/orientation/annotation/column-layout changes as layout. Existing required/help values can be compared even though authoring them is out of scope. Pure capture labels/times/actors are provenance, not live design modifications. Original-file hash differences alone are delivery differences, not proof of semantic design changes.

For ordering, compare relative order of matched items (for example an LCS-based sequence analysis) rather than every numeric order_index; report inserted/deleted/moved items and do not cascade one insertion into hundreds of edits. Keep separate source/target order for deterministic display. Shared definitions/dictionaries are changed once with impacted-form references; form filters show relevance without double-counting global totals. Unplaced library and project/visit changes remain visible outside form filters.

## Proposed API and UI

Use closed same-project pair inputs under the dedicated admin resource, with current-admin check on every query/report/read/replay. One service computes the normalized result, consumed by UI and the separate Word summary. Export revalidates authorization and the same immutable pair/contract; request filters are explicit if applied. Bound complete result/Word size or use documented pagination/summary rather than silently truncating a report presented as complete.

UI in administrator Backup and Archive management: select old/new baselines, show counts/warnings and project/library section, filter by form/category and inspect before/after text. Display user values via safe interpolation, not `v-html`. Project/session changes invalidate late requests. No editable merge/rebind controls are added.

Word summary uses existing python-docx dependency and appropriate existing text/style helpers without changing ExportService's archived-form renderer. Include pair labels/times, comparison direction, counts, matching caveats and readable change tables. This is a new report generated from retained snapshots; it is not an original archived eCRF/aCRF and does not claim byte-identical report rendering across app versions. Escape untrusted text/links and use safe temporary-file/download cleanup; do not let report filters or filenames become paths.

## Planned Areas

New focused diff/report service and DTO/router additions; UI/composable for baseline pair, filtering and download integrated with the C2 host. C2 owns snapshot persistence/original files; C3 must not extend baseline lifecycle or create a new audit model. Inspect `backend/src/services/field_restore_service.py` identity behavior and `backend/src/services/agent_shared_change_service.py` semantic-diff concepts before reuse; do not directly generalize a single-definition Agent proposal into a whole-project engine without tests.

## Verification / Rollback

Synthetic snapshots cover unchanged/reversed pair, new/delete/type/name/OID changes, shared references, options/units, one insert/move, library-only/visit edits, layout-only changes, nulls and ambiguous reuse/remap. Assert normalized-result determinism/no writes, UI/Word agreement, safe text, authorized completed pairs, schema/bounds errors and original checksums unchanged. Rollback is source-only while retaining C2 history; never rewrite old snapshots to make a comparison succeed.
