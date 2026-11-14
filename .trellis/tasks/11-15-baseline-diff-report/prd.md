# C3 — Historical Differences and Word Revision Summary

## Goal and Allocation

Explain revisions between two usable history records of the same local project, including manual/automatic pairs. Own parent R2 and the comparison/report side of R3/R12; inherit R7/R8. Planning only; source requirements are in `../11-15-crf-versioned-delivery/prd.md`.

## Requirements

- C3-R1: Provide additions/removals/attribute changes/moves grouped by form, plus project/visit/library summaries. Distinguish semantic/layout changes and unchanged state.
- C3-R2: Attribute shared definition, dictionary/option and unit changes to affected design elements without dropping dependencies or double-counting totals.
- C3-R3: Explicit same-project identity policy: numeric IDs/OIDs do not prove uninterrupted identity across delete/recreate/import/restore. Show matching basis and uncertainty; never silently guess a rename/merge.
- C3-R4: Current-admin-only read-only bounded comparison/download, rechecked per request; normal owners/Agent tokens get no history access. Both records belong to the same captured project and supported schema: data-only quick readiness versus complete formal pair (manual OR scheduled C7). C7 package reader must expose validated normalized snapshots without requiring that the live project still exists; no full-package project restore is introduced.
- C3-R5: UI summary/filter/detail and explicit Word revision-summary download use one normalized diff. Identify pair/direction/content hashes and available original-file checksums distinctly. Do not modify originals, create history, or claim regulatory/binary equivalence from design hashes.
- C3-R6: Capture capabilities are separate from manual/scheduled origin. Quick DATA snapshots lack files/browser-local layout; those areas are unavailable, not removed/corrupt, with no fake original download. C7 daily/manual full-run FORMAL records contain original pairs and automatic-layout provenance. Explicit admin Word summary is separate; quick scheduler/repair never renders it.
- C3-R7: Expose pure comparison of validated captured design inputs for C6 restore preview, including its ephemeral coherent current-state capture. C6 owns preview authorization/binding and all mutations; no general live-edit/merge API is introduced here.

## Acceptance Criteria

| ID | Outcome |
| --- | --- |
| C3-AC1 | Synthetic cases verify every category, no-change pairs and reversed direction. |
| C3-AC2 | One insertion/move does not mark every following item edited; relative order is preserved. |
| C3-AC3 | Renamed/blank OIDs, duplicate-looking rows, remapped/reused IDs and ambiguous matches follow the visible documented policy. |
| C3-AC4 | Shared edits include affected references without duplicate counts; library-only changes and visit links remain visible. |
| C3-AC5 | UI/Word agree on pair/counts/details and filter scope; user text is safely rendered, foreign access discloses nothing. |
| C3-AC6 | Results are deterministic and write-free; schema/bounds/download/legacy/parity cases pass. |
| C3-AC7 | Quick/quick, manual-formal/scheduled-formal and mixed capability/source pairs compare common same-project data. Missing quick layout/files are unavailable; C7 formal originals remain available/unchanged. Non-admin/role-loss/wrong-project/set-reader cases reject without leakage. |
| C3-AC8 | C6 can obtain the same pure normalized result for current-versus-target review, without C3 capturing durable history, modifying current design or implementing a restore endpoint. |

## Dependencies

C2 supplies stable versioned data/capability/read contracts; C4 supplies state identifiers; C1 domain is ordinary metadata. C3 tests synthetic automatic inputs before C6 implements scheduling/restore, avoiding circular task dependencies. C6 reuses the diff and extends history actions sequentially; C5 verifies integration. Matching follows real restore/import behavior without an assumed identity migration.

## Out of Scope

Cross-project/upload matching, general live-edit/merge tools, restoration mutations (C6-owned), standards scoring, EDC adapters, general audit retention and Word tracked changes/redlining of originals. No real-data comparison/report generation or offline script is executed during planning.
