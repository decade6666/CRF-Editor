# Research: Frontend shell, editing modes, template import, and search helpers

- **Query**: Feature research for a template-library field search UI (search by label -> variable name/format, or by variable name -> label)
- **Scope**: internal (frontend `frontend/src`, plus backend router for error contract)
- **Date**: 2026-09-30

---

## 1. App.vue shell layout

### Branching (who sees what)

`frontend/src/App.vue` template has four top-level branches:

| Branch | Anchor | Content |
|---|---|---|
| auth checking | `App.vue:1075` | `v-if="isCheckingAuth"` loading spinner |
| login | `App.vue:1079` | `<LoginView v-else-if="!isLoggedIn">` |
| admin | `App.vue:1080` | `<template v-else-if="isAdmin">` — admin shell only |
| regular user | `App.vue:1115` | `<template v-else>` — project workbench |

`isAdmin` comes from `GET /api/auth/me` after login (per `frontend/.claude/CLAUDE.md` Authentication section).

### Top bar — admin branch (`App.vue:1081-1101`)

`.header` with `.header-left`: title `CRF编辑器`, 设置 icon button (`openSettings`, line 1084), theme toggle (`toggleTheme`, 1087-1096). `.header-right-group`: `<SessionTimer />` (1099). No project/export entries.

### Top bar — regular user (`App.vue:1117-1162`)

- `.header-left`: title (collapsible), sidebar expand button, `刷新数据` (`handleRefresh`, 1131), `设置` (`openSettings`, 1134), theme toggle (1137-1146).
- `.header-right-group` (`App.vue:1148-1161`): `导出Word` dropdown (only `v-if="selectedProject"`, commands `ecrf`/`acrf`, 1150-1158) + `<SessionTimer />` (1160).
- Import entries are NOT in the top bar: `导入所有项目/导出当前项目/导入项目/导入Word` live in the settings dialog (`App.vue:1593-1598`); `导入模板` lives in the FormDesignerTab form-list toolbar (`App.vue:1281` `@import-template="openImportDialog"`).

### Admin page switch (precedent for a global page)

`App.vue:1102-1113`: `.admin-shell` (full-width, `max-width:1200px`, defined in App.vue style block; asserted by `frontend/tests/adminViewStructure.test.js`) contains `.admin-nav` `el-radio-group v-model="activeAdminPage"` with `el-radio-button value="users"` `用户管理` and `value="orgs"` `机构管理` (1104-1107). Below, a single `<KeepAlive>` wraps `<AdminView v-if="activeAdminPage === 'users'" @logout="logout" />` / `<OrganizationManagementView v-else />` (1109-1112) so switching pages does not remount. `activeAdminPage` is a plain in-memory `ref('users')` (`App.vue:115`).

### Project workbench tabs (regular user)

- Sidebar: project list, draggable, `新建项目` plus button (1176), per-project `复制项目` / `删除项目` actions (1204-1225).
- Content: `v-if="!selectedProject"` welcome empty state (1243-1250); `v-else` a single `el-tabs class="main-content-tabs" v-model="activeTab"` with `:before-leave="onMainTabBeforeLeave"` (`App.vue:1253-1258`).

Tab panes (`App.vue:1261-1293`):

| Label (Chinese) | name | Component | Gated |
|---|---|---|---|
| 项目信息 | info | `ProjectInfoTab` | always |
| 选项 | codelists | `CodelistsTab` | `v-if="editMode"` |
| 单位 | units | `UnitsTab` | `v-if="editMode"` |
| 字段 | fields | `FieldsTab` | `v-if="editMode"` |
| 表单 | designer | `FormDesignerTab` (emits `import-template`) | always |
| 访视 | visits | `VisitsTab workspace="list"` | always |
| 访视流程 | visitflow | `VisitsTab workspace="flow"` | always |

Lazy loading: `const { activeTab, activateTab, isTabActivated, reset } = createLazyTabState('info')` (`App.vue:131`, `frontend/src/composables/useLazyTabs.js`). Each pane body is `v-if="isTabActivated(name)"` — first-visit lazy mount, then stays mounted (not `v-if` toggled off, not `<KeepAlive>`). Leaving the designer tab goes through `onMainTabBeforeLeave` dirty guard (`App.vue:224-230`). When `editMode` turns off while on an advanced tab, `resetLazyTabs('info')` (`App.vue:191-195`).

### Where a new global entry fits (precedents, not recommendations)

- **Global top-bar dialog**: the 设置 dialog (`showSettings`, opened by `openSettings` `App.vue:555`) is a truly global (project-independent) `el-dialog` reachable from both headers — this is the only existing project-independent dialog. All other root-level dialogs (`导入模板` `showImport` at 1318, project import, Word import, `TemplatePreviewDialog` mounted at `App.vue:1362-1368`) are project-scoped (they use `selectedProject.value.id`).
- **Global in-shell page**: the admin `activeAdminPage` radio + `<KeepAlive>` pattern (`App.vue:1102-1113`) is the existing "standalone page inside one shell" precedent (users/orgs).

---

## 2. Brief / full editing modes

- Storage: `const editMode = ref(localStorage.getItem('crf_edit_mode') === 'true')` (`App.vue:189`), persisted to `crf_edit_mode` by a watcher (191-192), injected app-wide via `provide('editMode', editMode)` (195). Child components use `inject('editMode', ref(false))` (asserted in `frontend/tests/editModeHiddenIdentifiers.test.js`).
- Toggle: settings dialog `el-switch v-model="editMode" active-text="完全" inactive-text="简要"` (`App.vue:1583`), rendered only `v-if="!isAdmin"` (1582). Hint text: 「关闭时保留基础浏览与设计入口，开启后显示完整编辑能力」(1584-1586).
- What brief mode hides:
  - Whole tabs 选项/单位/字段 (`App.vue:1264,1269,1274`).
  - All OID / variable-name table columns and form inputs: `v-if="editMode"` on `prop="code" label="OID"` and `prop="variable_name" label="OID"` (e.g. `FieldsTab.vue:435,467`; `FormDesignerTab.vue:3387,4969,5003,5363,5373`). So **variable names/OIDs are hidden in brief mode**; the contract test `editModeHiddenIdentifiers.test.js` additionally forbids hiding via `v-show="false"` / `display:none` and forbids the wording 「字典OID/选项OID/单位符号OID」.
- UI label text for `variable_name` is **「OID」**, not 「变量名」: `FieldsTab.vue:435` `<el-table-column v-if="editMode" prop="variable_name" label="OID" min-width="100" />`; `FieldsTab.vue:467` form item `label="OID"`; same in FormDesignerTab (above) and CodelistsTab (`prop="code" label="OID"`). 「变量名」 appears only in code identifiers/comments, not as user-facing labels.

---

## 3. Template import UI

### Flow and API paths

- Entry: FormDesignerTab form-list toolbar emits `import-template`; App.vue binds `@import-template="openImportDialog"` (`App.vue:1281`).
- `openImportDialog()` (`App.vue:647-664`): `api.post('/api/projects/${selectedProject.value.id}/import-template')` (no body) -> `{ projects: [{ id, name, version, forms: [{ id, name, domain }] }] }` (backend schema `backend/src/routers/import_template.py:35-46`). Builds `el-tree` data via `buildImportTreeData` (630-644). Failure: `ElMessage.error('加载模板失败: ' + e.message)` and dialog closes (659-660). Uses plain `api.post`, so **no client caching**.
- Import dialog (`App.vue:1318-1357`): tree of template projects/forms; empty state 「模板库中没有项目」 (1349). `executeImport()` (687-706): `POST /api/projects/{pid}/import-template/execute` with `{ source_project_id, form_ids }` (693-696); success toast `导入成功：N个表单`, then `api.clearAllCache()` + `refreshKey.value++` (697-700).
- `TemplatePreviewDialog.vue` (`frontend/src/components/TemplatePreviewDialog.vue`): props `{ modelValue, projectId (required), formId, formName }` (154-159); mounted lazily in App.vue with `v-if="hasOpenedTemplatePreview"` (`App.vue:1362-1368`). Loads fields with `api.get('/api/projects/${props.projectId}/import-template/form-fields?form_id=${props.formId}')` (330-332) returning `{ fields: [...], paper_orientation }`. Layout: left = Word-like CRF preview reusing `formFieldPresentation` + `useCRFRenderer` + `formDesignerPreviewModel`; right = checklist of importable fields (checkbox + label + type `el-tag`) using `getFieldTagType` (标签→warning, 日志行→info, else default) and `getFieldTagText` (is_log_row → 「日志行」 else `field_type`) (374-384).
- Template field shape (backend preview schema, `backend/src/routers/import_template.py:70-90`): `TemplateFieldDefinitionPreview` includes `id, project_id, variable_name, ...` nested under each field; list rows carry `label`, `field_type`, `is_log_row`, `bg_color/text_color`, `default_value`, and `field_definition` — so a template-field search UI can read `variable_name`/`label`/`field_type` from the same payload family.

### Template-not-configured / TEMPLATE_INCOMPATIBLE

- Backend helper `_compatibility_error` returns `400 { detail: message, code: "TEMPLATE_INCOMPATIBLE" }` (`backend/src/routers/import_template.py:28-33`).
- The frontend does **not** branch on `code`: `useApi.js` `_parseError` only extracts `detail` (string or Pydantic array) into the Error message (`frontend/src/composables/useApi.js:3-23`); callers show `'加载模板失败: ' + e.message` (`App.vue:659`) or inline `errorMsg` (`TemplatePreviewDialog.vue:341` 「加载失败：…」, and 「该表单暂无可导入项」 at 336). Any `code` handling would be new.

### Template settings (where template_path is configured)

- Admin-only, in the settings dialog: `el-form-item label="模板路径"` with `el-input v-model="settingsForm.template_path"` placeholder 「请输入模板 .db 文件的绝对路径」 (`App.vue:1600-1604`), inside `<template v-if="isAdmin">` (1600-1650). Loaded via `api.get('/api/settings')` in `openSettings` (562-568), saved via `api.put('/api/settings', {...})` in `saveSettings` (580-587); the 保存 button renders only for admins (`App.vue:1672`).

---

## 4. Search helpers

### `frontend/src/composables/searchRanking.js` (133 lines)

- Exports:
  - `normalizeSearchText(value)` (line 1) — `String(value ?? '').trim().toLowerCase()`.
  - `rankFuzzyMatches(items, keyword, getCandidates)` (line 115) — returns a NEW ranked array (does not mutate). `getCandidates(item)` returns an array of candidate strings (a single string also accepted; legacy concatenated candidates preserved). Empty/blank keyword returns items in source order (117).
- Ranking tiers (`computeCandidateRank`, 83-92): 0 exact equality; 1 contiguous substring (quality `[matched-text-length]` — shorter matched text wins); 2 ordered subsequence via `findSubsequence` (quality `[span, start]`); 3 bounded edit-distance window (`bestEditWindow`, `levenshteinBounded`) — enabled by keyword length: 1-2 chars off, 3-5 chars ≤1 edit, ≥6 chars ≤2 edits with similarity floor `distance*10 <= len*3` (`allowedEditDistance` 52-56, `meetsSimilarityFloor` 59-62). Ties keep stable input order (130).
- Multi-key usage: pass an extractor array, e.g. `candidateTexts` in `fieldDefinitionAutocomplete.js:21-23` returns `[definition?.variable_name, definition?.label]` — exactly the label↔OID bidirectional search shape needed.
- Example call sites:
  - `frontend/src/components/FieldsTab.vue:73` — `rankFuzzyMatches(visibleDefinitions, searchField.value, (field) => Object.values(field))` (whole-object candidates).
  - `frontend/src/components/UnitsTab.vue:31` — `rankFuzzyMatches(orderedUnits, searchUnit.value, unitSearchTexts)` (explicit key list).
  - Others: `FormDesignerTab.vue:180`, `VisitsTab.vue:104`, `CodelistsTab.vue:19,29`, `ProjectInfoTab.vue:88`.

### `frontend/src/composables/fieldDefinitionAutocomplete.js` (125 lines)

- Purpose: field-library autocomplete for the designer OID/label inputs. `buildAutocompleteCandidates({ definitions, keyword, currentDefinitionId, formFieldDefinitionIds, excludeOwnFormFieldId })` (25-51) filters empty keywords, ranks via `rankFuzzyMatches(definitions, query, candidateTexts)` (double-candidate OID+label), and returns `{ definition, state: 'current'|'added'|null, selectable, value }` where `value` echoes the raw untrimmed keyword (el-autocomplete contract).
- Other exports: `candidateDisplayText(definition)` → `{ oid, label, fieldType }` (53-59); `hydrateEditorFromCandidate` (66-94); `buildCopyVariableName` (100-110); `findOidConflict` (116-125); `CANDIDATE_STATE_CURRENT` / `CANDIDATE_STATE_ADDED` (18-19).
- Reuse assessment for template fields: the **search core is directly reusable** — `rankFuzzyMatches` + a `[variable_name, label]` candidate extractor covers label→OID and OID→label; template definitions (backend `TemplateFieldDefinitionPreview`) share the `variable_name`/`label`/`field_type` keys. `buildAutocompleteCandidates` itself is coupled to el-autocomplete semantics and current-form instance state (`current`/`added`), which does not apply to a read-only template lookup; the state layer would simply not be used.

---

## 5. `frontend/src/composables/useApi.js` (255 lines)

- Exports: `api` (`get`, `cachedGet(url, ttl=30000)` with in-memory TTL cache + concurrent-request dedup + cache-generation guard (86-167), `post`, `put`, `patch(url, data, { invalidate })`, `del`, `invalidateCache(urlPrefix)`, `clearAllCache`) (134-209); `apiUrl` / `makeApiUrl` (32-52, subpath-deployment prefix at fetch boundary only); `getAuthHeaders` (47-52); `genFieldVarName` (218); `genCode(prefix)` (226); `truncRefs` (234); `toggleSelectAll` (240).
- Error convention: `_parseError` (3-23) unwraps FastAPI `detail` — plain string returned as-is; Pydantic array mapped to `loc → msg` joined with 「；」. `_checkStatus` (72-83) throws `Error` with `.status` attached: 401 → clears `crf_token`, dispatches `window` event `crf:auth-expired`, message 「登录已过期，请重新登录」; 429 → detail or 「操作过于频繁，请稍后重试」; other non-OK → parsed detail. Non-JSON responses throw 「服务器返回非 JSON 格式…」 (`_safeJsonParse`, 124-131). Components surface errors as `ElMessage.error('前缀: ' + e.message)`. **The `code` key of `{detail, code}` error bodies is currently ignored by the frontend.**
- POST/PUT/PATCH/DELETE auto-invalidate related caches via `_autoInvalidate` (111-121).
- Clipboard: **no shared clipboard helper exists.** `grep navigator.clipboard|writeText` over `frontend/src` returns nothing; every 「复制」 match is an entity-copy action (复制项目 `App.vue:1209-1210`, codelist copy `CodelistsTab.vue:327-328`, designer field copy) — not OS-clipboard copy. A copy-OID button would need a new helper (and `sidebarCopyButtonScope.test.js` exists for sidebar copy-button styling scope, unrelated to clipboard).

---

## 6. Field presentation / format helpers

`frontend/src/composables/formFieldPresentation.js` (130 lines) — presentation styles, no format text:

- `getFormFieldDisplayLabel(formField, fallback)` (8) — `label_override || field_definition.label || fallback`.
- `getFormFieldPreviewStyle` (17), `getFormFieldLabelPreviewStyle(formField, { structure, includeBackground })` (51) — CSS style strings for preview cells.
- `isLogRowField` (25), `normalizePreviewHexColor` (3), label bold/font-size helpers (38-46).
- `buildFormDesignerUnifiedSegments(fields)` (60) and `buildFormDesignerRenderGroups(fields)` (93) — row segmentation (inline blocks / full rows / regular fields).

`frontend/src/composables/useCRFRenderer.js` — renders controls, not summaries:

- `renderCtrlHtml(field, fillLineChars)` (475) — HTML string for `v-html`; requires the FLAT field shape (`{field_type, options, ...}`, contract note at 462-474).
- `renderCtrl(field, fillLineChars)` (494) — **the closest thing to a type/format renderer**, but it renders Word-style underline boxes, not compact text: 数值 → `|__|` boxes from `integer_digits`/`decimal_digits` + `unit_symbol` (505-508); 日期/日期时间/时间 → boxes derived from `date_format` (511-551, defaults `yyyy-MM-dd` / `yyyy-MM-dd HH:mm` / `HH:mm`); 复选 → `□` + `resolveCheckboxText`; 单选/多选(+纵向) → `○/□` + `options` text (553-556); 标签 → `''`; fallback fill-line + unit (558).
- Also: `isChoiceField(fieldType)` (403), `isDefaultValueSupported` (407), `normalizeDefaultValue` (420), `toHtml` (445), `CHECKBOX_DEFAULT_TEXT='✔'` (21), and width planners (`planInlineColumnFractions` 225, `planNormalColumnFractions` 287, `planUnifiedColumnFractions` 317).

**Not found**: there is no existing helper that formats a field into a compact human-readable type/format summary (e.g. 「数值 整数3位.小数2位」/ date format string). Current UI surfaces: `FieldsTab.vue:437` shows bare `field_type` in the 类型 column; `FieldsTab.vue:438-444` shows `row.unit.symbol` or `row.codelist.name` in a 单位/选项 column; digits/date format appear only as edit-form inputs (`FieldsTab.vue:475-479`). `TemplatePreviewDialog.vue:374-384` `getFieldTagType`/`getFieldTagText` is the existing type-badge pattern.

---

## 7. Frontend test conventions (`frontend/tests/`, run with `node --test tests/*.test.js`)

Three observed patterns (no component mounting / no Vue Test Utils anywhere):

1. **Pure-function tests** — import composable modules directly and assert on plain data: `frontend/tests/searchRanking.test.js` imports `{ rankFuzzyMatches, normalizeSearchText }` from `../src/composables/searchRanking.js` and asserts ranked orderings (`node:test` + `node:assert/strict`, one behavior per test).
2. **Pure logic + source guard hybrid** — `frontend/tests/fieldDefinitionAutocomplete.test.js` reads sources with `readFileSync` for regex wiring guards AND imports the module inside tests via `await import(...)` per test (a `loadModule()` helper, lines 20-22); fixtures are plain arrays of `{ id, variable_name, label, field_type }`.
3. **Source-level regex/contract tests** — `frontend/tests/adminViewStructure.test.js` reads `.vue` sources and asserts `assert.match(source, /regex/)` / `assert.doesNotMatch` against template/style fragments (e.g. the admin branch extracted via `appSource.match(/<template v-else-if="isAdmin">[\s\S]*?<\/template>/)`); `frontend/tests/editModeHiddenIdentifiers.test.js` adds an `assertInOrder(source, patterns)` helper to enforce element order; `frontend/tests/searchRankingWiring.test.js` combines a real composable import (`isVisibleInFieldLibrary`) with per-component regex checks that lists route through `rankFuzzyMatches`.

Property tests use the in-repo helper `frontend/tests/testProperty.js` (seeded `forAll`). A new search composable would follow pattern 1/2; a new page/dialog wiring would follow pattern 3.

---

## 8. Shared list/toolbar style contracts and theme variables (`frontend/src/styles/main.css`, 711 lines)

- `.list-toolbar` / `.pane-tool-slot` (187-209): `display:flex; align-items:center; gap:8px; min-height:24px; margin-bottom:12px; flex-shrink:0; flex-wrap:wrap` — the shared 36px toolbar slot (37px allowed for bottom-bordered title rows). Adjacent `el-button` margin is zeroed by the container gap (198-202). Consumers: Codelists both panes, Units, Fields left pane, FormDesigner form list, Visits. Page-local negative margins / private gap patches are forbidden (project convention in `frontend/.claude/CLAUDE.md`).
- `.workspace-header` (211-217): shared admin page header (`space-between`, gap 12px, margin-bottom 12px).
- Theme tokens `:root` (2-100): semantic colors `--color-primary`, `--color-primary-subtle`, `--color-bg-body/subtle/card/hover`, `--color-border`, `--color-text-primary/secondary/muted`, `--color-selected-bg/border` (42-43), status colors + bg/border/text triplets (45-60), shadows (64-72), radii `--radius-sm/md/lg/xl` (75-78), font sizes `--font-xs…--font-lg` (81-86), spacing `--space-xs…--space-2xl` (90-95), transitions (98-99). Element Plus overrides in a second `:root` block (103-115).
- Dark theme: `html[data-theme="dark"]` (610+) overrides the same variables; toggled by `document.documentElement.setAttribute('data-theme', ...)` in `App.vue:1027-1045` (persisted key `crf_theme`).
- Header/shell: `.header` / `.header-left` / `.header-right-group` (131-134); `.admin-shell` lives in `App.vue`'s style block (locked by `adminViewStructure.test.js`: `width:100%; max-width:1200px; margin-inline:auto`).
- Global full-height dialog precedent: `TemplatePreviewDialog.vue:510-526` uses an `append-to-body` dialog + unique class in a non-scoped `<style>` block (`.import-preview-dialog { height:95vh; ... }`) because scoped `:deep()` cannot reach teleported bodies.

---

## Caveats / Not Found

- No `navigator.clipboard` / clipboard-copy helper exists anywhere in `frontend/src` (grep verified); any copy-to-clipboard is net-new.
- No existing template (library) search endpoint: `import_template.py` only exposes project/form list (`POST import-template`), field list (`GET .../form-fields`), and execute; a field-level search API would be new backend work (out of scope here, noted for planning).
- The frontend currently ignores the `code` field of error bodies (`TEMPLATE_INCOMPATIBLE` is surfaced only through its `detail` text).
- 「变量名」 is not used as a UI label anywhere; the established user-facing term for `variable_name` is 「OID」 (brief mode hides these OID columns/inputs entirely).
