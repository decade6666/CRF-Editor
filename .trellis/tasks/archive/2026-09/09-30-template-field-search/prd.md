# Template Field Search Page

## Goal

Add a lookup page for fields in the configured template library: type a field label to see the variable name (OID) and format the template uses, or type an OID to see its label. The value is consistent field naming and formatting across projects that follow the standard template library.

> User request (verbatim): 增加一个界面，能够搜索模板中的字段，比如填写标签给出变量格式，填写变量名显示标签等等。

## Background (confirmed facts)

Evidence: `research/backend-template-library.md`, `research/frontend-shell-and-search.md`; technical design: `design.md`.

- The template library is one global `.db` configured through `template.template_path` / `CRF_TEMPLATE_PATH`; only admins can read or change the path (`backend/src/config.py:23`, `backend/src/config.py:111`, `backend/src/routers/settings.py:126-128`, `backend/src/routers/settings.py:156-158`).
- Template reads go through a read-only pipeline: whitelist + `.db` validation, existence check without implicit creation, schema compatibility check, `PRAGMA query_only = ON` (`backend/src/services/import_service.py:59-128`, `backend/src/services/import_service.py:211-236`). Legacy templates may lack optional columns such as `field_definition.checkbox_label` (`backend/src/services/import_service.py:170-209`).
- All existing template endpoints are project-scoped import previews (`backend/src/routers/import_template.py:123-216`); nothing searches fields across the template, and nothing reads the template without a project id.
- Searchable data: `FieldDefinition.variable_name` (unique per project), `label`, `field_type`, digits, `date_format`, `checkbox_label`, codelist options, unit symbol (`backend/src/models/field_definition.py:20-105`); usage through `FormField` (with per-form `label_override`) → `Form` → `Project` (`backend/src/models/form_field.py:16-78`). `project.deleted_at` is the only soft-delete flag (`backend/src/models/project.py:37-40`).
- `标签` fields carry system placeholder OIDs `^FIELD_\d{14}_[A-Z0-9]{6}` (`backend/src/database.py:1004`) and are hidden from the field library together with log rows (`frontend/src/composables/fieldDefinitionVisibility.js:3`).
- The fullscreen form designer is a fullscreen `el-dialog` that covers the app header (`frontend/src/components/FormDesignerTab.vue:4043-4049`).
- Brief mode (`editMode=false`) hides every OID; the user-facing term for `variable_name` is 「OID」 (`frontend/src/App.vue:189-195`, `frontend/src/components/FieldsTab.vue:435`).
- `rankFuzzyMatches` already supports multi-candidate label↔OID ranking (`frontend/src/composables/searchRanking.js:115`); there is no clipboard helper and no compact format-summary helper in `frontend/src`.
- The default nginx example serves plain HTTP (`deploy/nginx/crf-editor.conf.example:12`), where the browser clipboard API is unavailable.
- No template is configured in this checkout, so template size is unknown; the design assumes at most ~20k field definitions.

## Requirements

- **R1 Result content** (Q1: full information). Each result row shows OID, 标签, 类型, 格式, 单位, 来源:
  - 格式: 数值 → 「整数n位 小数m位」; 日期/日期时间/时间 → `date_format` or the renderer default; 复选 → 「□」 + checkbox text (default `✔`); 单选/多选/单选（纵向）/多选（纵向） → 「字典名：code=decode, …」; others → empty.
  - 来源: count of template forms using the definition, with the full list 「项目 版本 / 表单」 (plus the form-level display label when it differs); definitions not placed on any form show 「仅字段库」.
- **R2 Entry points** (Q2: header + fullscreen designer). One dialog, reachable from an icon button 「模板字段查询」 in the regular-user header (next to 设置) and from a button in the fullscreen designer header. No project selection is needed; the backend adds a project-independent read-only endpoint for any authenticated user, and existing endpoints stay unchanged.
- **R3 Edit-mode gating** (user note: 「编辑模式选择完全时显示」). Both entries render only in 完全 mode; brief mode shows neither and closes an open dialog. The admin shell gets no entry.
- **R4 Click-to-copy** (Q4, user note: 「点击单元格就复制（弹窗提醒已复制），不需要操作列」). Results are read-only. Clicking an OID/标签/类型/格式/单位 cell copies that cell's text and shows a toast 「已复制 …」; there is no action column. Copy must work on plain-HTTP deployments. The 来源 cell opens the source list instead of copying.
- **R5 Search behavior**. One search box matches OID, label, and form-level display labels through the shared `searchRanking.js` tiers (exact > substring > subsequence > bounded typo), so label→OID and OID→label are the same interaction. An empty keyword lists every entry in template order. Results paginate at 50 per page with a total count; changing the keyword returns to page 1.
- **R6 Inclusion and merging**. Exclude `标签` fields, log rows, and definitions that belong only to soft-deleted template projects. Merge definitions whose displayed attributes are all identical into one row with combined sources; keep same-label definitions with a different OID or format as separate rows so variants are visible.
- **R7 Panel behavior**. The dialog is non-modal and draggable, so it can stay open while the user pastes into the designer or field library. Clicking an entry while it is open brings it to the front. Keyword, page, and loaded results persist across close/reopen within the session; a refresh button reloads the template.
- **R8 Errors and safety**. The endpoint never writes to the template. Errors use user-facing Chinese messages shown inline in the dialog: not configured, file missing, invalid path, and incompatible schema (`code=TEMPLATE_INCOMPATIBLE`). No response message reveals the template's filesystem path.

## Acceptance Criteria

- [ ] AC1 (R1) A numeric definition with digits and unit returns `variable_name`, `label`, `field_type`, `integer_digits`, `decimal_digits`, `unit_symbol`; the dialog shows 「整数3位 小数1位」 and 「cm」.
- [ ] AC2 (R1) Choice fields return `codelist_name` and options in option order and render 「字典名：code=decode, …」; date fields show `date_format` or the default; an empty checkbox text renders 「□✔」.
- [ ] AC3 (R1) The 来源 cell shows 「N 个表单」 (or 「仅字段库」) and its popover lists every source line, including display labels.
- [ ] AC4 (R2) `GET /api/template-fields` returns 200 for a logged-in regular user who owns no project and 401 without a token.
- [ ] AC5 (R2, R3) In 完全 mode the header icon button and the fullscreen designer button both open the same dialog; in 简要 mode neither renders; switching to 简要 closes an open dialog; the admin shell has no entry.
- [ ] AC6 (R4) Clicking each copyable cell copies exactly its text and shows 「已复制 …」; unit tests cover the secure-context path, the plain-HTTP fallback, and failure; there is no action column.
- [ ] AC7 (R5) A label query finds its OID and an OID query finds its label with shared ranking tiers; a form-level display label also matches; an empty keyword lists all entries in template order; pagination is 50 per page with a total count and resets to page 1 on keyword change.
- [ ] AC8 (R6) `标签` fields, log rows, and soft-deleted-project definitions never appear; identical definitions from two projects merge with combined sources; same label with a different OID or format stays separate.
- [ ] AC9 (R6, R8) A legacy template lacking `project.deleted_at`, `form_field.label_override`, and `field_definition.checkbox_label` still returns results, and the template file bytes are unchanged after any call.
- [ ] AC10 (R7) With the dialog open over the fullscreen designer, the user can click into the designer OID input and paste; clicking an entry again brings the dialog to the front; keyword and results survive close/reopen; refresh reloads.
- [ ] AC11 (R8) Not configured → 400, missing file → 404, invalid path → 400, incompatible → 400 with `code=TEMPLATE_INCOMPATIBLE`; no message contains the template path; the dialog shows the message inline.
- [ ] AC12 Targeted and full backend suites pass; frontend `node --test tests/*.test.js`, `npm run lint -- --quiet`, and `npm run build` pass; AC5, AC6, AC7, and AC10 are verified in headless Chromium against a throwaway template.
- [ ] AC13 `README.md`, `README.en.md`, root and module `.claude/CLAUDE.md`, `.claude/index.json`, and the affected `.trellis/spec` guides describe the new endpoint, dialog, and helpers.

## Out of Scope

- Write actions: applying a template field to the current designer field, or importing it into the project field library (candidate follow-up tasks).
- Changes to the existing project-scoped import-template endpoints, including their unfiltered soft-deleted projects.
- Server-side search/ranking, template-read caching, and rate limiting.
- Filters by template project/form, and matching on form names, codelist option text, or units; pinyin search.
- An entry in the admin shell.

## Open Questions

- None blocking. The ~20k-definition size assumption needs revisiting only if the real template is much larger.
