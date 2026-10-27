# Single horizontal-table form guard

## Goal

Prevent editing from creating an additional horizontal-table block in a form, with an immediate understandable error and rollback of the offending operation, without losing unrelated edits or rewriting legacy layouts.

## Background

The product decisions below were explicitly approved through AskUserQuestion on 2026-10-26: count only horizontal blocks, retain legacy/import compatibility, roll back only the offending change, and add an atomic field-restoration API so a rejected single/batch-delete undo cannot leave partially restored fields or orphaned definitions. This is an editing constraint, not a redesign of form rendering.

## Requirements

- **R1 — Compliant forms:** A form with zero or one horizontal block must remain at zero or one after an editing operation. Ordinary two-column variable sections are not restricted tables and may coexist before/after the horizontal block.
- **R2 — Count runs, not fields:** A horizontal block is one continuous run of enabled horizontal markers in actual field order. Several consecutive marked fields form one block. Use the current grouping semantics at `frontend/src/composables/formFieldPresentation.js:98-134` and `backend/src/services/export_service.py:1817-1845`; do not rely on the inactive `unified` preview branches or merge tables automatically.
- **R3 — Grouping-changing edits:** Cover marker enable/disable, drag/keyboard ordering, quick edit, persisted-field property/type changes, candidate rebinding, new/copied-field drafts and their save/insertion, direct instance creation, and undo/redo of these actions. Count the actual final normalized instance state, even when a request does not explicitly include the marker. Deletions cannot increase runs, but restoring deleted ordinary separator fields can.
- **R4 — Reject safely:** Show a specific Chinese message when the limit is violated. The rejected operation must not persist definition/binding/instance/order side effects, change the committed field selection, add a successful history entry, or move undo/redo stacks. Backend checks remain inside existing edit transactions, after ownership validation and before commit.
- **R5 — Immediate, narrow local rollback:** Validate a grouping-changing local edit before accepting it into the editor/draft/preview. Restore only that operation's marker/type/candidate/layout changes and any dependent state, preserving earlier unrelated labels, colors, other dirty properties, and draft content. An invalid copy/new insertion leaves the previous selection/state in place. Do not reset the whole editor to its original persisted snapshot. Existing network/other-validation failure behavior is not redefined by this feature.
- **R6 — Legacy compatibility:** Do not migrate or rewrite old data. Accept an edit only when `after_count <= max(1, before_count)`. Existing multi-block forms may retain or reduce their count, supporting progressive repair. Once repaired to at most one block, a later edit may not create a second. Undo/redo uses the current form as its baseline, not the historical snapshot as an exemption. Unrelated edits with no effective grouping change remain allowed.
- **R7 — Excluded entry points:** Template/Word/project imports, whole-form copy, and whole-project copy keep their existing behavior and may preserve multi-block layouts. Do not put this guard into global ORM hooks, shared copy helpers, import migrations, or unrelated shared-definition updates.
- **R8 — Preserve existing contracts:** Do not change rendering/export grouping, field-copy persisted insertion semantics, column-width/row-height behavior, identifier validation, project authorization, draft save gates, history/session isolation, build/release processes, or dependencies beyond the smallest changes necessary to enforce R1–R7 and the approved R9 endpoint.
- **R9 — Atomic restoration:** Add one authenticated, form-scoped batch field-restoration endpoint and use it for both single- and batch-delete undo. Restore instances, order, and any necessary deleted label definitions in the existing request transaction. If the final layout violates R6 or any item fails, restore nothing. Return restored instances in request order and update frontend history ID mappings only after full success. Do not extend this endpoint to import or whole-form/project copying.

## Acceptance Criteria

- [x] **AC1 → R1/R2:** Empty or ordinary-only forms count 0; consecutive marked fields count 1; `N→I→N` is allowed; `I→N→I` counts 2 and is rejected on a previously compliant form. Labels/log rows with marker 0 are ordinary separators. Frontend/backend consume the same behavioral cases.
- [x] **AC2 → R3/R4/R5:** Enabling a separated marker or disabling a marker inside a block errors and restores the previous marker. Adjacent expansion remains allowed. No rejected write, success toast, or history entry occurs.
- [x] **AC3 → R3/R4:** A drag or Ctrl+↑/↓ operation that splits a block restores the exact old order and selection and shows the specific reason; valid reorder/no-op/retry/history behavior remains intact.
- [x] **AC4 → R3/R4/R5:** Quick edit, type normalization, candidate selection and new/copied drafts cannot leave an extra horizontal block in the visible layout or persisted state. Other dirty inputs survive rejection. A copied draft is evaluated at its existing intended persisted insertion position, not a misleading temporary append position.
- [x] **AC5 → R3/R4:** Direct create/profile/reorder APIs return HTTP 400 with the specific reason on a violation. After a rejected atomic command, independent reads show unchanged definitions, binding, instances and order. Final-state normalization is included, including legacy structural types with an enabled stored marker.
- [x] **AC6 → R4/R6/R9:** A rejected undo/redo leaves persisted data, stacks and ID mappings unchanged. Single/batch-delete undo uses one atomic restoration request: when a later ordinary separator violates the limit or another item fails, none of the earlier instances/order shifts/label definitions persist. Valid mixed regular/label/log restoration returns instances in request order with the correct persisted field order, and remaps IDs only after full success.
- [x] **AC7 → R6:** A legacy 3-block form may remain at 3 or reduce to 2/1 but not increase to 4. After reducing to 2, undo to 3 is rejected; after reducing to 1, another block is rejected. Reads and unchanged-layout edits remain usable.
- [x] **AC8 → R7/R8:** Import and whole-form/project copy still preserve existing markers and layouts; no data migration, production data mutation, renderer regrouping, column-planner change, dependency expansion, or broad history rewrite is introduced.
- [x] **AC9 → R1–R9:** Demonstrate RED→GREEN for new behavior, focused unit/API/component regression coverage and unchanged overall coverage (new logic target ≥80%); run lint/build and feasible real-browser flows, explicitly reporting any unrun checks. The new restore API must preserve project ownership checks and reject malformed, empty, oversized, cross-project and cross-user batches without partial writes.

## Out of Scope

- Automatically merging/splitting tables, changing page layout, or treating ordinary variable sections as restricted blocks.
- Repairing existing multi-block forms in bulk or extending the guard to R7's excluded paths.
- General redesign of undo/redo transactions beyond R9, or compensation for pre-existing multi-request replay network failures unrelated to field restoration and this new business-rule rejection.
- Authentication redesign, unrelated cleanup/refactoring, dependency/build/release changes, or production database/config access.
- Commits, merges, pushes, or destructive cleanup without the required authorization.
