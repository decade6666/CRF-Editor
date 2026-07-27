# Implement: db_type + multiselect control

## Stage 1 — column + Project Info UI

1. Model/schema/migration for `project.db_type`
2. Clone + project-import required columns / legacy patch / snapshot
3. ProjectInfoTab radio under 版本号; App.vue default + provide `projectDbType`
4. Tests: migration, API default/round-trip, project copy, legacy import

**Validate:** backend project metadata / copy / import tests green

## Stage 2 — picker filter + backend reject

1. Add `field_type_policy.py` + `fieldTypeAvailability.js`
2. Wire FieldsTab / FormDesignerTab inject + disabled options
3. Replace FieldsTab inline choice arrays with `isChoiceField`
4. Router create/update guards (update only on type change)
5. Tests: policy, idempotent PUT, create reject, wiring, availability

**Validate:** field CRUD tests + frontend availability/wiring tests

## Stage 3 — DOCX split

1. `_split_multiselect_field(s)` + `parse_full(allow_multiselect=...)`
2. Thread flag from import_docx preview / execute / screenshot
3. Fix monkeypatch lambdas
4. Tests: vertical/inline/log_row/determinism/index alignment/override reject

**Validate:** docx import rules + contract tests

## Stage 4 — AI one-to-many

1. Prompt suffix + allowed_types filter
2. Protocol: optional `suggested_fields`; override application rebuild
3. Frontend payload/preview/dialog support
4. Document NO_MULTISELECT subset in cross-stack contracts
5. Tests: prompt, extract filter, one-to-many apply; keep byte-lock green

**Validate:** ai_review + docxAiSuggestionAcceptance

## Final

- Full backend pytest + frontend node:test + lint
- No `npm run format`
- Update module CLAUDE.md / root changelog if inventory changes
- PR via task branch → main (auto-merge)

## Risky files

- `FormDesignerTab.vue` — surgical only
- `docx_import_service.py` — parse_full signature + create path
- `ai_review_service.py` + frontend AI helpers — protocol expansion

## Rollback points

After each stage: commit on task branch so stages can be reverted independently.
