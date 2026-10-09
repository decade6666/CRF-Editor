# Planning Evidence and Narrow Spec Pointers

Confirmed by the lead on 2026-10-08 before implementation:

- `TemplateFieldSearchDialog.vue:186-200` renders `countTemplateFieldForms` inside a click popover, with actual source lines hidden until click. Existing source helpers include project/version but not form code.
- `templateFieldSearch.js:15-17` searches field OID, label and aliases. `searchRanking.js` exports `normalizeSearchText` and `rankFuzzyMatches`; ranked items retain their original identities. No shared search API change is needed to compose four priority groups.
- `template_field_index_service.py:63-67,184-191` does not load/emit form.code. `TemplateFieldSource` also omits it. The model has an optional form.code, but ImportService's compatibility-required columns do not require it. A read-only PRAGMA probe is necessary.
- Existing tests live in `frontend/tests/templateFieldSearch.test.js` and `backend/tests/test_template_field_index.py`. Backend fixtures already contain FA1/FA2/FB1 codes and merged multi-project sources. Existing equality and response-key assertions need synchronized updates.
- Attempting `ALTER TABLE form DROP COLUMN code` on an isolated current-model test DB fails because the form unique constraint references code. Use a tmp_path-only legacy table fixture instead.
- The user selected field strong > form strong > field fuzzy > form fuzzy; source lines contain form OID/name without project/version. This is settled, not a question for the implementation agent.

## Narrow component rules

The full `.trellis/spec/frontend/component-guidelines.md` is about 49 KB, above manifest injection limits. Locate and read relevant sections only when needed (search `TemplateFieldSearch`, `non-modal`, `modal-penetrable`, `immediate`, `list-toolbar`). Preserve lazy-open watch `immediate: true`, mounted-once dialog state, non-modal/penetrable/draggable/append-to-body behavior, max-width 94vw, shared list-toolbar, semantic copy buttons and focus outlines, theme-variable colors. Keep API calls in useApi and clipboard access in clipboardCopy. The task does not change App/FormDesigner entry wiring or field rendering.

## Isolation

Main checkout has unrelated untracked tasks and backend.log; do not touch them. The backend suite has known non-hermetic paths until the separate test-isolation task merges. Use only this worktree with throwaway config/database/uploads, the existing `/home/decade/.venvs/crf-editor/bin/python`, and all proxy variables unset. Do not copy real config or point tests at the original database. See implement.md for validation and seed requirements.
