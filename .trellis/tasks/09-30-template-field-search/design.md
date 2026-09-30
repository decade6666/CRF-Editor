# Design: Template Field Search

Requirements live in `prd.md`; this file covers boundaries, contracts, data flow, compatibility, and trade-offs. Research evidence: `research/backend-template-library.md`, `research/frontend-shell-and-search.md`.

## 1. Architecture

```
App header icon button (v-if editMode) ───────────────┐
                                                      ├─> App.vue openTemplateFieldSearch()
Fullscreen designer header button (v-if editMode)      │      └─> <TemplateFieldSearchDialog v-model> (single instance,
  └─ FormDesignerTab emit('open-template-field-search')┘          lazy-mounted, append-to-body, non-modal, draggable)
                                                                   │ api.get('/api/template-fields')  (once per session + manual refresh)
                                                                   ▼
backend/src/routers/template_fields.py  (GET /api/template-fields, get_current_user)
  └─> backend/src/services/template_field_index_service.py  build_template_field_index(template_path)
        └─> ImportService._open_template_session(template_path)  (whitelist + exists + compat + PRAGMA query_only)
              └─> template .db (read-only)
Frontend ranking/paging: rankFuzzyMatches(entries, keyword, templateFieldSearchTexts) → slice(page) → cells
Cell click → copyTextToClipboard(text) → ElMessage.success('已复制 …')
```

Layering follows `routers -> services -> template session`; heavy logic stays in the new service module. `import_service.py` (already ~1066 lines) is reused, not extended.

## 2. Backend

### 2.1 Endpoint contract — `GET /api/template-fields`

- Router: new `backend/src/routers/template_fields.py` (`APIRouter(tags=["template-fields"])`), registered in `backend/main.py` next to `import_template` (`backend/main.py:33` import list, `backend/main.py:203` include block) with `prefix="/api"`; add the module to `backend/src/routers/__init__.py` import list.
- Auth: `Depends(get_current_user)` only. No project id, no `verify_project_owner`. Any authenticated user (regular or admin) may call it; the UI entry exists only in the regular-user shell.
- Response models live in the router module (existing convention, `backend/src/routers/import_template.py:38-118`):

```python
class TemplateFieldOption(BaseModel):
    code: Optional[str] = None
    decode: str

class TemplateFieldSource(BaseModel):
    project_name: str
    project_version: Optional[str] = None
    form_name: Optional[str] = None      # None = definition only exists in the project's field library
    display_label: Optional[str] = None  # form-level label_override when it differs from label

class TemplateFieldEntry(BaseModel):
    key: str                             # "<first_project_id>:<first_definition_id>", stable row key
    variable_name: str
    label: str
    field_type: str
    integer_digits: Optional[int] = None
    decimal_digits: Optional[int] = None
    date_format: Optional[str] = None
    checkbox_label: Optional[str] = None
    codelist_name: Optional[str] = None
    options: List[TemplateFieldOption] = []
    unit_symbol: Optional[str] = None
    label_aliases: List[str] = []        # distinct display_label values, first-seen order
    sources: List[TemplateFieldSource]

class TemplateFieldIndexResponse(BaseModel):
    entries: List[TemplateFieldEntry]
```

- Error mapping (messages are user-facing Chinese and must never contain the filesystem path; log path details server-side with `logger.warning`):

| Condition | Status | Body |
| --- | --- | --- |
| `cfg.template_path` empty | 400 | `detail`: 「未配置模板库，请联系管理员在设置中配置模板路径」 |
| `FileNotFoundError` (file missing) | 404 | `detail`: 「模板文件不存在，请联系管理员检查模板路径」 |
| `ValueError` containing 「模板库不兼容」 | 400 | `{"detail": <service message>, "code": "TEMPLATE_INCOMPATIBLE"}` — reuse `_compatibility_error` from `src.routers.import_template` (no duplicate helper) |
| other `ValueError` (non-`.db` suffix, outside whitelist) | 400 | `detail`: 「模板路径无效，请联系管理员检查模板路径」 |
| any other exception | 500 | `detail`: 「读取模板字段失败」 + `logger.exception` |
| missing/invalid token | 401 | existing `get_current_user` behavior |

- No rate limiting (read-only, same class as other GET endpoints; `import_template.py` has none either). No server-side cache: the client loads the index once per session and reuses it (§3.3), so the template is read at most once per user session plus manual refreshes.

### 2.2 Service — `backend/src/services/template_field_index_service.py`

Public entry: `build_template_field_index(template_path: str) -> list[dict]` (dicts match `TemplateFieldEntry`). Keep every function < 50 lines; split into a loader and a builder.

1. Open: `session = ImportService._open_template_session(template_path)` (static helper, `backend/src/services/import_service.py:211-236`) — it already validates the whitelist and `.db` suffix, requires the file to exist, checks compatibility, and sets `PRAGMA query_only = ON`. Close in `finally` (`session.close()`), same as `get_template_projects` (`backend/src/services/import_service.py:239-270`).
2. Probe optional columns once through the same session with a local helper `_table_columns(session, table) -> set[str]` (`PRAGMA table_info(<table>)`): `project.deleted_at`, `form_field.label_override`, `field_definition.checkbox_label`. Legacy templates may lack any of them; missing → treat as NULL / not deleted. Never ALTER or migrate the template.
3. Read whole tables with raw `text()` SQL (no ORM selects, no `IN (...)` parameter lists), then filter in Python by the active project id set:
   - `project`: `id, name, version` (+ `deleted_at` when present) ordered by `id`; active = `deleted_at IS NULL` (all rows when the column is missing).
   - `form`: `id, project_id, name` ordered by `project_id, order_index, id`.
   - `form_field`: `form_id, field_definition_id, is_log_row` (+ `label_override`) ordered by `form_id, order_index, id`.
   - `field_definition`: `id, project_id, variable_name, label, field_type, integer_digits, decimal_digits, date_format, codelist_id, unit_id, order_index` (+ `checkbox_label`) ordered by `project_id, order_index, id`.
   - `codelist`: `id, name`; `codelist_option`: `codelist_id, code, decode` ordered by `codelist_id, order_index, id`; `unit`: `id, symbol`.
4. Build entries in template order:
   - Pass 1 (form usage): for each active project (id order) → each form (`order_index, id`) → each form_field (`order_index, id`): skip rows with `is_log_row` truthy or `field_definition_id` NULL; skip unknown definitions, definitions from another project, and `field_type == '标签'`; add a source `{project_name, project_version, form_name, display_label}`.
   - Pass 2 (library-only): for each active project → each of its definitions (`order_index, id`) not referenced by any of that project's forms, excluding `标签`: add a source with `form_name=None, display_label=None`.
   - Merge key (all displayed attributes): `(variable_name, label, field_type, integer_digits, decimal_digits, date_format, checkbox_label, codelist_name, tuple((code, decode) for options), unit_symbol)`. Same key → one entry with appended sources; any difference → separate entry, so naming/format variants stay visible.
   - `display_label` = `label_override` stripped when non-empty and different from `label`, else `None`; `label_aliases` = distinct non-None `display_label` values in first-seen order.
   - `checkbox_label`: empty/whitespace → `None` (the frontend renders the `✔` fallback). Options come from the definition's codelist (empty list when no codelist); `codelist_name`/`unit_symbol` are `None` when unset or dangling.
   - `key` = `f"{project_id}:{definition_id}"` of the first definition that created the entry.

### 2.3 Compatibility and safety

- Read-only is enforced twice: path/compat validation inside `_open_template_session`, and SQLite `query_only`. Tests assert the template file bytes are unchanged after a call.
- Mixed/legacy schemas are handled by the §2.2 step 2 probes; required columns are already guaranteed by `_check_template_compatibility` (`backend/src/services/import_service.py:100-128`).
- The existing project-scoped import endpoints and `get_template_projects` behavior (including its lack of a `deleted_at` filter) stay unchanged — out of scope.

## 3. Frontend

### 3.1 Pure helpers — `frontend/src/composables/templateFieldSearch.js`

- `templateFieldSearchTexts(entry)` → `[entry.variable_name, entry.label, ...entry.label_aliases]` (candidate extractor for `rankFuzzyMatches`, same shape as `frontend/src/composables/fieldDefinitionAutocomplete.js:21-23`).
- `formatTemplateFieldFormat(entry)` → display/copy text of the 格式 column:
  - `数值`: 「整数{n}位 小数{m}位」, omit the part whose value is null; both null → `''`.
  - `日期` / `日期时间` / `时间`: `date_format || DEFAULT_DATE_FORMATS[field_type]`.
  - `复选`: `□` + (`checkbox_label || CHECKBOX_DEFAULT_TEXT`) (`frontend/src/composables/useCRFRenderer.js:21`).
  - `isChoiceField(field_type)` (`frontend/src/composables/useCRFRenderer.js:403`): 「{codelist_name}：{code=decode, …}」, option without code → `decode` only; no codelist → 「未设置字典」.
  - anything else (e.g. `文本`): `''`.
- `countTemplateFieldForms(entry)` → number of sources with a `form_name`.
- `formatTemplateFieldSource(source)` → 「{project_name} {project_version} / {form_name}」, plus 「（显示为：{display_label}）」 when set; library-only → 「… / 仅字段库」.
- `buildCopyToastText(text, max = 30)` → 「已复制 {text}」, truncated with 「…」 beyond `max` characters.
- `TEMPLATE_FIELD_PAGE_SIZE = 50`.
- `useCRFRenderer.js` change (behavior-preserving): export `DEFAULT_DATE_FORMATS = { '日期': 'yyyy-MM-dd', '日期时间': 'yyyy-MM-dd HH:mm', '时间': 'HH:mm' }` and use it in `renderCtrl` (`frontend/src/composables/useCRFRenderer.js:549-551`) instead of the three literals.

### 3.2 Clipboard helper — `frontend/src/composables/clipboardCopy.js`

- `copyTextToClipboard(text, env = { navigator: globalThis.navigator, document: globalThis.document, isSecureContext: globalThis.isSecureContext })` → `Promise<boolean>`; `env` is injectable for `node:test`.
- Empty text → `false`. When `isSecureContext` and `navigator.clipboard.writeText` exist, try it and return `true` on success. Otherwise (or when it rejects) fall back to a temporary off-screen `readonly` `<textarea>` + `select()` + `document.execCommand('copy')`, removing the textarea in `finally`; return the command result; any exception → `false`.
- This is the only place in `frontend/src` allowed to touch the clipboard / create the temporary element (the documented exception to the no-direct-DOM rule). Rationale: the default nginx example serves plain HTTP (`deploy/nginx/crf-editor.conf.example:12`), where `navigator.clipboard` is undefined.

### 3.3 Dialog — `frontend/src/components/TemplateFieldSearchDialog.vue`

- `<script setup>`, props `{ modelValue: Boolean }`, emits `update:modelValue`. API only through `useApi.js` (`api.get('/api/template-fields')`, uncached, like `TemplatePreviewDialog.vue:330-332`).
- `el-dialog` attributes: `title="模板字段查询"`, `:model-value` / `@update:model-value`, `:modal="false"`, `modal-penetrable` (Element Plus ≥ 2.10.5; project uses `^2.13.2`), `draggable`, `append-to-body`, `:lock-scroll="false"`, `:close-on-click-modal="false"`, unique `class="template-field-search-dialog"`; width 960px capped at `94vw` through a non-scoped style block (teleported body, same reason as `TemplatePreviewDialog.vue:510-526`). 960px (not wider) leaves room to drag the panel aside and expose the designer's right-side property card; the 格式 column relies on `show-overflow-tooltip` instead of width.
- Loading: `watch(() => props.modelValue, (open) => { if (open && !loaded.value) load() }, { immediate: true })` — `immediate` is mandatory because the component is lazily mounted with `modelValue=true` (spec `.trellis/spec/frontend/component-guidelines.md` lazy-dialog rule, archived task `06-25-import-template-preview-no-trigger`). `load()` sets `loading`, clears `errorMsg`, stores `entries`, sets `loaded=true`; failure → inline error block with `e.message` (keeps the dialog open so the user sees the reason) and entries unchanged.
- Toolbar (`.list-toolbar`): search `el-input` (`clearable`, placeholder 「输入标签或 OID 搜索」, focused on open), result count 「共 {n} 条」, refresh icon button (`aria-label="重新加载模板字段"`, `el-tooltip`) that calls `load()` again.
- Data flow: `ranked = computed(() => rankFuzzyMatches(entries.value, keyword.value, templateFieldSearchTexts))`; `watch(keyword, () => { page.value = 1 })`; `pageRows = ranked.slice((page-1)*size, page*size)`; `el-pagination` (`layout="total, prev, pager, next"`, page size `TEMPLATE_FIELD_PAGE_SIZE`). Empty keyword lists every entry in template order (paginated). No debounce unless profiling shows lag.
- Table (`el-table`, `row-key="key"`, `max-height` ~60vh, `size="small"`): columns OID (`variable_name`), 标签, 类型, 格式 (`show-overflow-tooltip`), 单位, 来源.
  - OID / 标签 / 类型 / 格式 / 单位 cells render a `<button type="button" class="tfs-copy-cell" :aria-label="`复制${列名}：${text}`">` styled as plain text (pointer cursor, hover background from theme tokens, visible focus ring). Click → `copyTextToClipboard(text)` → `ElMessage.success(buildCopyToastText(text))` or `ElMessage.error('复制失败，请手动选择文本复制')`. Empty value → plain `—`, not a button. No action column.
  - 来源 cell: link-style button 「{n} 个表单」 (or 「仅字段库」 when n = 0) opening an `el-popover` (`trigger="click"`) that lists `formatTemplateFieldSource` lines. It is not a copy target.
- Empty states: loading → `v-loading`; no entries → 「模板库中没有可查询的字段」; no match → 「没有匹配的字段」.
- State (keyword, page, entries, drag position) survives close/reopen because the component stays mounted after the first open.

### 3.4 Entry wiring

- `App.vue` (regular-user branch only):
  - Header icon button after 设置 in the regular-user header (`frontend/src/App.vue:1134-1136` pattern; the admin header's 设置 at `frontend/src/App.vue:1084` gets nothing): `v-if="editMode"`, `class="header-icon-btn" text circle`, `aria-label="模板字段查询"`, `title="模板字段查询"`, icon `<Search />` (globally registered icon set).
  - State: `showTemplateFieldSearch = ref(false)`, `hasOpenedTemplateFieldSearch = ref(false)`; mount `<TemplateFieldSearchDialog v-if="hasOpenedTemplateFieldSearch" v-model="showTemplateFieldSearch" />` next to `TemplatePreviewDialog` (`frontend/src/App.vue:1360-1367`).
  - `openTemplateFieldSearch()`: set `hasOpenedTemplateFieldSearch = true`; if already visible, set `false`, `await nextTick()`, then `true` — re-opening re-acquires the top z-index so the panel comes above a fullscreen designer opened later; otherwise just set `true`.
  - `watch(editMode, (on) => { if (!on) showTemplateFieldSearch.value = false })`.
  - Bind `@open-template-field-search="openTemplateFieldSearch"` on `<FormDesignerTab>` (next to `@import-template`, `frontend/src/App.vue:1281`).
- `FormDesignerTab.vue`:
  - `defineEmits(['import-template', 'open-template-field-search'])` (`frontend/src/components/FormDesignerTab.vue:121`).
  - In the fullscreen designer `#header`, after the eCRF/aCRF switch (`frontend/src/components/FormDesignerTab.vue:4075-4083`): `el-tooltip content="模板字段查询"` + `el-button v-if="editMode" size="small" data-test="designer-template-field-search" aria-label="模板字段查询"` with the `Search` icon, `@click="emit('open-template-field-search')"`. The header's blank-click handler ignores `button` targets (`frontend/src/components/FormDesignerTab.vue:712-715`), so no `.stop` is needed. Keep the header height/spacing contract locked by `frontend/tests/acrfViewToggle.test.js`.

## 4. Trade-offs and decisions

- Client-side ranking over a full index (vs. server-side search): keeps one fuzzy-ranking implementation (`searchRanking.js`, project rule) and gives instant keystroke feedback. Assumes the template holds at most ~20k definitions; a much larger template would need server-side filtering (not planned).
- Project-independent endpoint (vs. project-scoped): the template is global and the fullscreen/header entries have no project context. Exposure is essentially unchanged: any user who owns a project can already read the same template content through the import preview.
- Non-modal penetrable panel (vs. modal dialog): lets the user keep the panel open and paste into the designer. Risk: Element Plus focus trapping may pull focus back into the panel — verified in the browser (implement.md step 7); fallback is a modal dialog (drop `:modal="false"` / `modal-penetrable`), which still keeps keyword/results across reopen.
- Merge-by-all-displayed-attributes: simple, explainable rule; codelist-name-only differences show as separate rows by design.
- Form-level `label_override` is searchable through `label_aliases` so a label seen on a CRF form still finds the definition.

## 5. Rollback

Purely additive: new router/service/component/composables plus small wiring in `main.py`, `routers/__init__.py`, `App.vue`, `FormDesignerTab.vue`, and the `DEFAULT_DATE_FORMATS` export in `useCRFRenderer.js`. Reverting the feature commit restores the previous behavior; no data migration and no template writes.
