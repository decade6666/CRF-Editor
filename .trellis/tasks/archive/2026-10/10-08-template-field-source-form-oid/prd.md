# Template Field Search: Inline Sources and Form OID Search

## Goal

Let users identify the forms containing a template field without another click, and find fields by their source form OID while prioritizing field-level strong matches.

## Background

- The current source cell shows a form count and opens a popover (`frontend/src/components/TemplateFieldSearchDialog.vue:186-200`).
- Existing search candidates are field OID, label, and display aliases (`frontend/src/composables/templateFieldSearch.js:15-17`). Shared fuzzy matching ranks exact, substring, ordered subsequence, and bounded typo matches (`frontend/src/composables/searchRanking.js:82-133`).
- Backend sources currently omit form OID (`backend/src/routers/template_fields.py:29-33`; `backend/src/services/template_field_index_service.py:63-67,184-191`). Form OID is stored as `form.code`, which is optional in historical databases.
- The inspected template has 54 forms and 398 usable definitions; a definition can occur in up to 8 forms. This confirms that multi-line sources must remain readable.
- On 2026-10-08 the user selected the requirements below and asked for planning followed by Sonnet execution. Task creation is approved; Git commit/push is not.

## Requirements

- **R1 — Inline sources:** Replace the source-count/popover interaction with immediately visible source lines. Each line shows `表单OID 表单名称`, followed by the existing `（显示为：xx）` suffix when applicable. Omit project name/version from the visible cell, but do not remove them from the API. Keep all sources visible with wrapping, without truncation or a click-to-expand requirement. Source cells remain read-only and are not copy targets.
- **R2 — Missing data:** A form without an OID shows its name only; a library-only definition shows `仅字段库`. Missing optional OID columns in legacy template databases must not prevent search or mutate the database.
- **R3 — Search:** Add source form OIDs as search candidates. Retain field OID, label, and alias search. Do not add form names or project metadata to search in this task.
- **R4 — Priority:** Use four ordered groups: (1) field OID/label/alias exact or substring matches; (2) form OID exact or substring matches; (3) field OID/label/alias fuzzy matches; (4) form OID fuzzy matches. Within each group preserve shared matching strength/quality and stable ordering. Show an entry once in its highest eligible group. Blank input preserves original template order.
- **R5 — Preserve behavior:** Keep full-edit-mode gating, non-modal draggable dialog behavior, close/reopen state, loading/error feedback, 50-row pagination, and other cells' copy behavior. Keep exclusion/merge rules, authorization, whitelist, and read-only template access unchanged.
- **R6 — Delivery:** No new dependencies, migrations, build-script changes, or unrelated refactors. Synchronize current user/module documentation and the cross-stack contract. Use Sonnet for implementation and Haiku for read-only frontend review.

## Acceptance Criteria

- [x] **AC1 (R1):** Opening the dialog displays source OIDs and names without clicking; multiple source lines and long values wrap and are fully accessible. Project/version text and the former source popover/count button are absent from the cell.
- [x] **AC2 (R2):** Form-name-only and `仅字段库` fallbacks work; modern, NULL/blank-OID, and missing-`form.code` legacy templates are covered. Template bytes are unchanged after indexing.
- [x] **AC3 (R3):** Searching a form OID returns fields from all matching source forms, including merged multi-source entries; source metadata not in scope does not create hits.
- [x] **AC4 (R4):** A deterministic fixture verifies all four groups, exact before substring within strong groups, shared fuzzy quality within weak groups, tie stability, case/whitespace normalization, blank search, and no duplicate entries. In particular a field substring beats an exact form match, and an exact form match beats a field subsequence/typo match.
- [x] **AC5 (R5):** Existing backend/frontend regressions pass; the added API field is serialized as `form_code: string | null`, including `null` for library-only sources. Existing merge/exclusion/auth/error semantics remain intact.
- [x] **AC6 (R1/R5):** Browser validation covers direct source visibility, form-OID search and priority, multiple/long sources, light/dark display, a narrow viewport, and preserved copy/pagination behavior. Report environment blockers rather than claiming unperformed checks.
- [x] **AC7 (R6):** README files, module notes, `.claude/index.json`, and the template-search contract describe the new behavior. Targeted tests, full feasible regressions, lint/build, coverage evidence, and reviews are recorded. Code and Trellis changes remain uncommitted until requested.

## Out of Scope

Changing the global fuzzy-matching algorithm, adding form-name search, editing/importing template data, changing field merging, introducing new columns to source databases, altering authentication, deployment, or Git publishing.
