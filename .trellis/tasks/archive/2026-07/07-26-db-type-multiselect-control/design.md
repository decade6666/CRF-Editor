# Design: db_type + multiselect control

## Architecture

```
Project.db_type ──API──► selectedProject ──provide/inject──► FieldsTab / FormDesignerTab
       │                                                      buildFieldTypeOptions(...)
       │
       ├── field CRUD (routers/fields.py) → field_type_policy.allows_multiselect
       │
       └── DOCX parse_full(allow_multiselect=...) → _split_multiselect_fields
                └── AI start_ai_review(allow_multiselect=...) → filtered types + optional suggested_fields
```

## Data model

- Column: `project.db_type VARCHAR(20) NOT NULL DEFAULT '其他'`
- Values: `"赛美斯"` | `"其他"` (Chinese literals, consistent with field_type family)
- Three defaults: SQL server_default, ORM default, Pydantic default
- Migration: `_migrate_add_project_db_type` in `database.py` (blank-line style)
- Clone / import snapshot / `_REQUIRED_COLUMNS` + legacy patch + discard must all carry or default the column

## Frontend state

- `App.vue`: `projectDbType = computed(() => selectedProject.value?.db_type || '其他'); provide('projectDbType', projectDbType)`
- Consumers inject with default `ref('其他')` for standalone tests
- New composable `fieldTypeAvailability.js`: `allowsMultiselect`, `isMultiselectFieldType`, `buildFieldTypeOptions`
- Keep three type arrays separate; only filter via `buildFieldTypeOptions`
- Replace FieldsTab inline choice arrays with shared `isChoiceField`

## Backend validation

- New `services/field_type_policy.py`
- Router-level reject on create; update only when `data.field_type is not None and data.field_type != fd.field_type`
- Copy endpoint: no reject (product decision)
- Clone/import/template: no reject (migration semantics)
- HTTP 400, Chinese detail

## DOCX split

- Pure deterministic transform inside `parse_full(..., allow_multiselect=True)`
- `import_forms` resolves flag from target project; preview/screenshot routes pass flag from `verify_project_owner`
- Vertical: label + N 复选 without options/checkbox_label
- Inline: N 复选 with `原标签-选项` (truncate 255), keep inline_mark
- Empty options fallback; no silent field drop
- Fix 1-arg parse_full monkeypatches in tests

## AI one-to-many

- Keep `VALID_FIELD_TYPES` 9-item lock intact
- Add `VALID_FIELD_TYPES_NO_MULTISELECT` project-scoped filter
- Suggestion may carry optional `suggested_fields: list[{label, field_type}]`
- `field_overrides` becomes `Dict[int, str | list[dict]]`
- Apply overrides by collecting first, then rebuild field sequence (never insert mid-walk)
- Prompt suffix under 其他 mode; `_extract_valid_diffs` filters by allowed types
- execute rejects multiselect overrides under 其他

## Trade-offs

- Chinese literals for db_type: matches field_type family; no mapping layer
- Parse-time split: WYSIWYG preview + shared indices; AI never sees raw 多选 under 其他
- One-to-many AI: largest risk surface; staged after stages 1–3
- Template import hole accepted for this task

## Rollback

- Stage 1 column is additive and defaulted; safe to leave if later stages roll back
- Stages 2–4 are behavior gates; revert code + leave column
