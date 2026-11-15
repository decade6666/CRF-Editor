# C1 — Form Domain Authoring

## Goal and Allocation

Expose the existing form-domain field without changing its model or meaning. Own parent R4; inherit R7/R8 and parent facts F4/F8. Planning only; see `../11-15-crf-versioned-delivery/prd.md` for approved product decisions.

## Requirements

- C1-R1: Extend ordinary form property create/edit/inline save, cancel and dirty-leave handling; no separate autosave.
- C1-R2: Use one nullable free-text value in full mode only. Preserve case; `DM / VS` remains one string, not structured multiple domains. No OID/standard semantic validation or lookup.
- C1-R3: Reuse form responses and existing annotation rendering. Do not rewrite unrelated form attributes or imported/legacy domain values.
- C1-R4: Define save/reopen, clear, cancel, failed-save and form/project/mode-switch behavior using existing property guards.

## Acceptance Criteria

| ID | Outcome |
| --- | --- |
| C1-AC1 | Mixed-case/free-text domain saves, reloads and reopens unchanged; clear follows the agreed null/blank contract. |
| C1-AC2 | Cancel/discard makes no write; failed save preserves input and dirty status with an actionable error. |
| C1-AC3 | Annotated designer/visits preview and Word use the same saved text and blank omission; ordinary eCRF is unchanged. |
| C1-AC4 | OID handling, basic/full mode, orientation, selection and unrelated dirty values remain intact. |
| C1-AC5 | Affected source/behavior and mounted-component tests pass; isolated DevTools acceptance and applicable export/parity checks provide real evidence. |

## Dependencies

No hard dependency on another child. C4 later extends the same save surfaces: execute overlapping edits sequentially with one writer. C2 captures this existing model field; C3 compares it as metadata; C5 consumes the acceptance journey.

## Out of Scope

New domain storage/geometry, validation dictionaries, standards lookup, SDTM mapping or role models. Unexpected need for a model/geometry expansion returns to scope review.
