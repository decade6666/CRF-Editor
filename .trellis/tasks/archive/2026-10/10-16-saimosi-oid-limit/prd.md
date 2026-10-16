# Saimeisi Manual OID Length Limits

## Goal and User Value

Prevent manually edited identifiers from exceeding the target database's limits while preserving the editor's automatically supplied identifiers and existing workflows.

## Authorization and Handoff

- Requested on 2026-10-16: create this task now; **Sonnet** implements it later.
- Current deliverable is task planning only. Keep status `planning`; no business-code changes, `task.py start`, implementation dispatch, commit, merge, or publication in this session.
- Worktree: `/home/decade/crf-editor-saimosi-oid-limit`; branch: `task/saimosi-oid-limit`.
- The user must review the artifacts and authorize execution before implementation begins.

## Confirmed Facts and Technical Notes

- The database type is the existing project `db_type`, whose values are `赛美斯` and `其他` (`backend/src/schemas/project.py:32-57`; `frontend/src/composables/fieldTypeAvailability.js:1-7`). Both OID editor hosts already receive its reactive value (`frontend/src/App.vue:190-192`; `frontend/src/components/FieldsTab.vue:19-22`; `frontend/src/components/FormDesignerTab.vue:126`).
- Field OID means `field_definition.variable_name`; form OID means `form.code` (`backend/src/schemas/field.py:32-70`; `backend/src/schemas/form.py:90-115`). The current validators enforce charset / required-versus-optional rules, not these new limits.
- Automatic field/form identifiers are 27/26 characters (`frontend/src/composables/useApi.js:238-251`; `backend/src/utils.py:13-22`). Draft OIDs can mirror live edits, and library picks are explicit binding operations; a generic dirty flag or generated-looking prefix cannot determine whether a user authored an OID.
- Verified save surfaces, original/candidate snapshot pitfalls, existing tests, and spec anchors are recorded in [research/oid-edit-boundaries.md](research/oid-edit-boundaries.md). The proposed minimal design is in [design.md](design.md); the execution/test checklist is in [implement.md](implement.md).

## Requirements

- **R1 — Conditional limits:** only when the current project's `db_type` is exactly `赛美斯`, a manually changed field OID must contain at most **8 characters**, and a manually changed form OID at most **10 characters**.
- **R2 — Untouched-value exemption:** system-filled OIDs remain exempt while unchanged, including generated defaults for new entries, automatically generated copy defaults, and system-managed label placeholders. No retroactive validation or rewriting of untouched existing/imported OIDs is introduced.
- **R3 — Edit/save semantics:** apply the new length check when saving an effective user change to the OID, including overriding a default on a new/copy draft. Compare stable original/generated values using existing trim semantics. Focus/blur, changing another property, and changing then reverting the OID do not by themselves activate it. Explicit library selection supplies the bound definition's OID; only a subsequent manual OID change activates the limit.
- **R4 — Compatibility:** preserve current charset, uniqueness, optional form-code, required regular-field OID, permission, transaction, fork/rebind, and undo/redo behavior. `其他` and absent/default project-type values retain their existing behavior.
- **R5 — Consistent coverage:** enforce one shared policy in field-library create/edit, designer persisted-field save, designer new/copied-field draft save, form create, form edit dialog, and designer inline form-property save. Existing leave-dialog “Save” actions must use those same validated paths.
- **R6 — Safe feedback and lifecycle:** reject an invalid Save with a clear Chinese message identifying field/form and its maximum, preserve the user's input, and make no write request or history mutation. Do not truncate input or impose a global `maxlength`. Refresh/reset baselines on the correct initialization, entity/project switch, cancel/clear, and successful rehydration events; failed validation/request must not silently grant a new exemption.

R2–R3 define the planning interpretation of “only after modification”: unchanged historical values and pure binding are not newly authored OIDs. This preserves existing compatibility without inventing historical manual/generated provenance; the user may revise that interpretation during artifact review.

> **Amendment (2026-10-16, user instruction during execution):** in addition to the save-time gate, the field/form OID inputs get entry-level enforcement — a conditional `maxlength` (8 for fields / 10 for forms, bound only when `db_type` is 赛美斯) blocks typing/pasting an overlimit character. Programmatic prefill (generated defaults, candidate hydration) is unaffected, preserving the R2 exemption; `其他` projects render no maxlength. This supersedes the “no global maxlength” wording in R6/Out-of-Scope for this conditional, editor-scope case.

## Acceptance Criteria

| ID | Requirement | Testable outcome |
| --- | --- | --- |
| **AC1** | R1 | In a `赛美斯` project, an edited field OID `ABCDEFGH` (8 characters) saves; `ABCDEFGHI` (9) is rejected. Use valid, unique test values so unrelated validation does not mask the result. |
| **AC2** | R1 | In a `赛美斯` project, an edited form OID `ABCDEFGHIJ` (10) saves; `ABCDEFGHIJK` (11) is rejected. |
| **AC3** | R2–R3 | Untouched automatic new/copy defaults longer than their maximum save successfully. Editing only label/name/presentation/orientation while keeping an existing long OID also succeeds. |
| **AC4** | R1–R3 | Changing a generated/default OID to another overlong value is rejected, including a different value that still looks like `FIELD_...` / `FORM_...`. An unchanged regex prefix is not an exemption. |
| **AC5** | R4 | Both over-limit examples retain existing behavior under `其他` / absent-type defaulting. Existing charset and required/optional blank-value rules still apply. |
| **AC6** | R2–R3,R6 | Saving an OID restored to its original value follows unchanged-value behavior; whitespace follows existing normalization. Unchanged legacy/imported long values remain usable, including after changing the project type to `赛美斯`. |
| **AC7** | R5 | Behavior is witnessed across every listed create/edit/draft/form-save surface, including form dialog versus inline save and existing leave-guard “Save” routes. A shared helper alone is not sufficient acceptance. |
| **AC8** | R2–R4 | Explicitly choosing an existing long-OID library candidate and saving it unchanged remains a pure binding/shared-property workflow. Manually entering a new overlong OID afterward is rejected; typing a matching-looking prefix or unrelated existing OID never creates an automatic exemption. |
| **AC9** | R2,R4 | Labels/log rows, instance-only quick edit and inline toggles, immediate system copies, and internal undo/redo replay remain functional without new length gates. Regular designer copy is validated only at its later editable draft Save. |
| **AC10** | R6 | Rejected saves preserve input/baseline and produce zero write/history side effects; valid correction can save. Reopen, switch entity/project, cancel/clear, success, and request-failure cases demonstrate correct baseline lifecycle with no stale or mutable-baseline bypass. |

## Out of Scope

- No global SQL/Pydantic length caps, generator shortening, automatic truncation, identifier/data migrations, bulk cleanup, or retroactive export/import validation.
- No new restriction on dictionary, option, unit, visit, domain, or instance identifiers.
- No new project-type fetch/plumbing, rendering/preview changes, unrelated component refactor, dependency expansion, test runner, or build/release-script changes.
- No new API exemption flags, persisted identifier-provenance fields, or server-enforced provenance contract. A proven need for such a broader contract must be separately reviewed and approved before execution expands scope.

## Planning Review Gate

Repository research is complete; no additional blocking product question was identified under the explicit edit-time interpretation above. Artifacts are ready for review, **not approved for implementation**. Keep the future executor recorded as Sonnet and follow `implement.md` only after the user's execution instruction.
