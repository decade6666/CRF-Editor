# Integration Design — aCRF Appearance and Preview Form OID

## Architecture and Boundaries

The task keeps the current FastAPI/Word export and Vue preview architecture. It adds no dependency, storage/configuration setting, API/database migration, new identifier, rendering engine, or authentication path.

- R1 leaf design: `../10-13-acrf-annotation-space/design.md` — shared float background alpha only, mirrored across browser/Word.
- R2 leaf design: `../10-13-word-preview-form-oid/design.md` — readonly `form.code` beside the existing paper title, full-mode gated and preview-only.

The parent is an integration/planning owner, not the initial code target. Execute children sequentially, with the executing main session owning actual diffs and acceptance. A bounded optional independent review does not authorize duplicate implementation or wider fixes.

## Cross-Child Contracts

| Boundary | Integration rule |
| --- | --- |
| Original name identity | `.wp-form-title` remains the name only; OID is a sibling, and exported Word headings/TOC stay unchanged |
| Title domain marker | Existing reserved right-side area/anchor remains; its background inherits R1, but ordinary OID text does not |
| Field marker geometry | Dimensions, y/anchor units, keys, drag/reset and stored records remain unchanged |
| Mode gates | R1 retains full+aCRF floats; R2 follows full mode in both eCRF/aCRF, never a brief-mode identifier leak |
| Body rendering | No field/option/text/row/column planner change; table-field parity remains strict |
| Opacity | Background only; reset hidden/disabled opacity is existing state behavior, not an R1 change |
| New title flow | Only the approved preview metadata may wrap in its title area; do not ascribe a R2 header change to R1 geometry |

## File Ownership

| Slice | Production scope |
| --- | --- |
| R1 writer | `acrfAnnotationGeometry.js`, `DesignerAcrfAnnotation.vue`, backend `export_service.py` and their targeted tests |
| R2 writer | new `FormPreviewOid.vue`, `DesignerWordPreview.vue`, `FormDesignerTab.vue`, `VisitFormPreviewDialog.vue`, existing `main.css` title-row rules and their targeted tests |
| Final documentation/integration writer | README.md/README.en.md, applicable root/module context, `.claude/index.json`, cross-stack §6 appearance contract and stateless-preview prop signature |

There must not be concurrent writes to shared docs/tests. No source code is edited by the planning/research agents.

## Documentation and Permission Boundary

After code exists and checks pass, document the residual text-overlap limit, the shared 75% fill transparency, preview-only/full-mode OID, and unchanged Word titles. Contract bodies stay in `.trellis/spec/guides/cross-stack-contracts.md`; do not duplicate them into three context documents. Read current archive-pointer conventions before adding any changelog entry; never rebuild a historical timeline.

Trellis artifacts/spec updates and code changes stay in separate commits **if** committing is explicitly requested. This planning task does not grant commit, merge, push, external publication, production access, temporary-evidence deletion, worktree removal, or branch deletion authorization.

## Verification Shape

- Establish deterministic synthetic baseline before R1 code; XML comparison may differ only in the annotation-fill alpha. eCRF/exported Word title behavior remains unchanged.
- Preserve raw preview form identity and exact table-cell text; compare before/after parity, including any baseline mismatches rather than relaxing the comparator.
- Use existing Node/Vitest/pytest/lint/build/format entry points and real-browser/Word gates from the leaf plans. Numeric coverage gaps must be reported and resolved before declaring the applicable 80% gate passed; do not auto-install optional providers.
- Real browser and Word checks use synthetic data or an expressly authorized environment. No silent development-account/secret creation; document denied/blocked scopes and alternatives honestly.

## Rollback and Handoff

Both leaves are display changes without data migration. Preserve a scoped recoverable diff/baseline; reverse only task-owned edits on a failure, never reset/clean unrelated state. Execution may resume in the existing task worktree after user review; recheck current task, branch, main/peer state and current rules first. The parent `implement.md` is the integration task board; `handoff.md` provides the compression-safe entry point.
