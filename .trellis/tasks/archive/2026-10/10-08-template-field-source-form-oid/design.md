# Design: Inline Template Sources and Form OID Ranking

## 1. Scope and data flow

Read-only template DB `form.code` -> service `sources[].form_code` -> response schema -> inline source formatting and task-specific search wrapper. No persistence schema changes, endpoint additions, or changes to auth/whitelist/exclusion/merge rules.

Production files:
- `backend/src/services/template_field_index_service.py`
- `backend/src/routers/template_fields.py`
- `frontend/src/composables/templateFieldSearch.js`
- `frontend/src/components/TemplateFieldSearchDialog.vue`

## 2. Backend additive contract

Extend `TemplateFieldSource` with `form_code: Optional[str] = None`. Preserve `project_name`, `project_version`, `form_name`, and `display_label`.

Probe `form.code` in the existing optional-column map, pass the flag to `_load_forms`, and select `code` or SQL `NULL`. Carry the code through `_group_forms` into every form source. Use the existing `_clean_optional` to turn empty/whitespace values into null. Library-only sources explicitly contain `form_code: None`. Do not include this metadata in the field-definition merge key.

Legacy databases remain read-only; never migrate a template to add `code`. Keep session closure in `finally`. Test API serialization separately from service output so the response model cannot silently strip the new field.

## 3. Search composition

Keep `searchRanking.js` and its public API unchanged. Preserve `templateFieldSearchTexts` as the field-level extractor; add a form-OID candidate extractor over `sources` and export a task-specific ranking function, e.g. `rankTemplateFieldMatches`.

Use `rankFuzzyMatches` to compute field matches and form-OID matches. A strong candidate is a non-empty normalized candidate containing the normalized keyword (`normalizeSearchText` is already exported by the shared module). Partition each already-ranked list by that test, concatenate field-strong -> form-strong -> field-weak -> form-weak, then retain each entry only at its first occurrence. The arrays contain original entry references; reference identity deduplication is sufficient and avoids accidental conflation of separate definitions. Local new Sets are acceptable; never mutate the input list, entries, or sources.

Within each group, the shared ranker owns exact/substring/subsequence/typo quality and source-order stability. Blank/whitespace input returns the original ordered list. Field labels and aliases stay in the field candidate group; this is what the user selected, not an additional field-OID-vs-label priority.

Do not add form names, project names, or versions to candidates. Do not duplicate edit-distance or subsequence algorithms, add arbitrary score offsets, alter other search boxes, or invent a global configurable ranking framework.

## 4. Source UI

`formatTemplateFieldSource` returns joined non-empty `form_code` + `form_name`, then the existing display-label suffix. Both absent means `仅字段库`. It no longer includes project/version text.

Replace the source popover/count button with the existing source-list/line structure directly in the cell. Widen only the source column sufficiently (initial target around 230px, tune after browser validation); keep the 960px/94vw dialog unless live evidence requires a minor width adjustment. Use normal wrapping/overflow-wrap, theme variables, and no ellipsis or hidden click expansion in this column. The table may scroll horizontally on narrow screens; the dialog must remain within the viewport. Do not collapse multi-source rows or introduce copy behavior for sources.

Remove the unused source-count helper/tests if no other consumer exists and remove obsolete button/popover styles. Keep all other copy targets and dialog behavior intact. Change the input hint to `输入标签、字段 OID 或表单 OID 搜索` and give it enough responsive width to be useful.

## 5. Tests and compatibility

- Extend existing backend tests for populated codes, merged-source codes, library-only null, blank/null values, missing legacy column, unchanged bytes, and API serialization.
- SQLite cannot directly drop `form.code` in the current fixture because a unique constraint refers to it. Build a legacy `form` table without that column via a test-only table replacement (foreign keys disabled before transaction) or create a minimal legacy schema. Never change a real template fixture file in-place outside `tmp_path`.
- Frontend tests exercise all four buckets and within-bucket quality, deduplication, multi-source form hits, exclusion of form-name/project metadata, normalization, missing sources/codes, empty query, no input mutation, formatting/fallbacks, and dialog wiring.
- Leave shared ranking tests unchanged; run them to prove isolation. Browser validation uses only throwaway data (a read-only source DB may be backed up into a fresh temp directory when needed).

## 6. Decisions and rollback

The user selected strong-match grouping instead of all field fuzzy matches outranking exact form matches, and instead of global exact-first ranking. Grouping is local to template search to avoid changing other components. Inline compact source text replaces project-heavy popovers for immediate readability.

Rollback is code-only: reverting these additive changes restores the previous dialog. No database writes, dependency changes, or deployment steps are needed. The frontend handles old responses lacking form_code; the backend addition is backward-compatible.
