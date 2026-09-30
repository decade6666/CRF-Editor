# Research: Backend Template Library — read-only field search groundwork

- **Query**: How the template `.db` is opened/read/validated; models for field search; auth options for a non-project endpoint; rate limiting; test fixtures; real data scale; layering conventions.
- **Scope**: internal (codebase) + local config/data inspection
- **Date**: 2026-09-30

---

## 1. `backend/src/services/import_service.py` — template access internals

All template access lives in `ImportService` (class at `import_service.py:52`). Every read path funnels through the same pipeline:

### Path validation
- `_get_allowed_template_dirs` (`import_service.py:59-64`): whitelist = resolved parent dir of `cfg.db_path` + resolved `cfg.upload_path`. Only these two directories may contain templates.
- `_validate_runtime_template_path` (`66-83`): resolves the raw path relative to `_CONFIG_DIR` (the dir holding `config.yaml`, i.e. repo root — `config.py:31,35`), requires suffix `.db` (ValueError otherwise), then `is_safe_path()` against the whitelist (ValueError "模板路径不安全").
- `_resolve_existing_template_path` (`85-91`): validates, then requires `Path.exists()` → `FileNotFoundError` if missing. This is what prevents any implicit DB creation.

### Compatibility + legacy column probing
- `_TEMPLATE_REQUIRED_COLUMNS` (`100-112`): `form.order_index`; `form_field.{order_index,is_log_row,inline_mark,label_bold,label_font_size}`; `field_definition.order_index`; `codelist_option.order_index`; `unit.order_index`.
- `_check_template_compatibility` (`114-128`): plain `sqlite3.connect` + `PRAGMA table_info(<table>)` per table; raises `ValueError("模板库不兼容：表 X 缺少列 …")` (this message substring is what the router maps to 400 `TEMPLATE_INCOMPATIBLE`).
- Legacy probes, each opens its own short-lived sqlite3 connection:
  - `_has_template_paper_orientation` (`130-148`) and `_has_template_annotation_positions` (`150-168`): check `form` exists in `sqlite_master`, then `PRAGMA table_info(form)`.
  - `_has_template_field_definition_checkbox_label` (`170-181`): `PRAGMA table_info(field_definition)` — the only probe relevant to field search.

### Read-only session
- `_open_template_session` (`211-236`): calls `_resolve_existing_template_path` + `_check_template_compatibility`, then creates a fresh engine with a **creator callback** (`sqlite3.connect(db_path, check_same_thread=False)`) — deliberately not a SQLite URI because SQLAlchemy's URL parser breaks on Chinese paths (`216`). An `event.listens_for(engine, "connect")` hook sets `PRAGMA query_only = ON` (`231-233`) so SQLite itself enforces read-only. Returns `sessionmaker(bind=engine)()`.
- Because the template shares the app schema, ORM models (`FieldDefinition`, `FormField`, …) can be selected against the template session — **but only if every mapped column exists**, which is why ORM selects are gated on probes and fall back to raw SQL.

### Data loading
- `_load_template_field_definitions` (`183-209`): if `checkbox_label` column exists → ORM `select(FieldDefinition).where(id.in_(...))`; else raw SQL over 13 fixed columns (`id, project_id, variable_name, label, field_type, integer_digits, decimal_digits, date_format, codelist_id, unit_id, is_multi_record, table_type, order_index`) returning `SimpleNamespace(..., checkbox_label=None)`. A search feature reading `field_definition` must use the same dual-path pattern (or probe once and branch).
- `get_template_projects` (`239-270`): raw SQL `SELECT id, name, version FROM project ORDER BY id`, then per project `SELECT id, name, domain FROM form WHERE project_id=:pid ORDER BY id`. **No `deleted_at` filter** — soft-deleted projects inside a template `.db` would be listed (templates are normally clean exports; fact, not judgment).
- `get_template_form_fields` (`273-415`): ORM `FormField` by `form_id` ordered by `order_index`; batch-loads field definitions, then batch-loads `CodeListOption` (excluding `复选`, ordered by `codelist_id, order_index, id`, serialized as `{id, code, decode}`) and `Unit.symbol`. Rows: log rows become synthetic entries with `label="日志行"`/`field_type="日志行"` and `field_definition=None` (`341-363`); normal rows prefer `ff.label_override or fd.label` (`370`) and embed a nested `field_definition` dict (`378-389`).
- `get_template_form_paper_orientation` (`418-439`): probes the column, then a single-column raw SELECT, fallback `"auto"`.

### Caching
- **None.** Every service call re-resolves the path, re-runs the compatibility check (5 `PRAGMA table_info` roundtrips), creates a new engine + session, and closes it in `finally`. Only `get_config()` is `lru_cache`d (`config.py:334-341`) — that caches the config object, not template reads.

---

## 2. Models relevant to field search

| Model | File | Search-relevant columns |
|---|---|---|
| `FieldDefinition` | `models/field_definition.py:20-105` | `id`, `project_id` (FK CASCADE), `variable_name` String(100) — **unique per project** (`uq_field_def_var_name`, line 24), `label` String(255), `field_type` String(50), `checkbox_label` String(255) nullable, `integer_digits` (CHECK 1-20), `decimal_digits` (CHECK 0-15), `date_format` String(50), `codelist_id` FK SET NULL, `unit_id` FK SET NULL, `is_multi_record`, `table_type` (default 固定行), `order_index`. **No deleted flag.** |
| `FormField` | `models/form_field.py:16-78` | `id`, `form_id` FK, `field_definition_id` **nullable** (log rows), `is_log_row`, `order_index`, `required`, `label_override` String(255) nullable (per-form label override — the "display label"), `help_text`, `default_value`, `inline_mark`, colors/typography. Unique `(form_id, field_definition_id)`. |
| `Form` | `models/form.py:17-48` | `id`, `project_id`, `name` (unique per project), `code` (unique per project), `domain`, `order_index`, `design_notes`, `annotation_positions`, `paper_orientation` (default auto). |
| `Project` | `models/project.py:21-79` | `id`, `name`, `version`, `db_type` (赛美斯/其他), **`deleted_at` nullable DateTime (lines 37-40) — the only soft-delete flag in the schema**, `owner_id` FK user, CRF metadata. |
| `CodeList` | `models/codelist.py:14-37` | `id`, `project_id`, `name`, `code`, `description`, `order_index`. |
| `CodeListOption` | `models/codelist.py:40-57` | `id`, `codelist_id`, `code` nullable, `decode` String(255), `order_index`; unique `(codelist_id, code, decode)`. |
| `Unit` | `models/unit.py:13-29` | `id`, `project_id`, `symbol` String(50), `code`, `order_index`. |

### Field types (Chinese literals)
- UI list (`frontend/src/components/FieldsTab.vue:32`): `['文本', '数值', '日期', '日期时间', '时间', '单选', '多选', '单选（纵向）', '多选（纵向）', '复选']`.
- Designer-only type `标签` (`frontend/src/composables/formDesignerPropertyEditor.js:6` `LABEL_FIELD_TYPE`), persisted in `field_type`.
- Backend multiselect subset `{"多选", "多选（纵向）"}`, only allowed when project `db_type == 赛美斯` (`services/field_type_policy.py:5-19`).
- `复选` is codelist-free (`codelist_id` forced NULL by model validators, `field_definition.py:63-83`).
- Virtual preview-only type `日志行` for log rows (`import_service.py:348`) — no `field_definition` row exists for them.
- Inline-table relevant sets: `NON_INLINE_DEFAULT_VALUE_FIELD_TYPES = {"文本", "数值"}` (`services/field_rendering.py:22`), choice types `["单选", "多选", "单选（纵向）", "多选（纵向）"]` (`field_rendering.py:148`).

### 标签 system placeholder OID rule
- Backend: `_LABEL_PLACEHOLDER_RE = re.compile(r"^FIELD_\d{14}_[A-Z0-9]{6}")` (`src/database.py:1004`); minted via `generate_code("FIELD")` → `FIELD_YYYYMMDDHHmmss_XXXXXX` (`src/utils.py:12-21`); `init_db()` re-casts legacy label OIDs to this pattern (`database.py:1015-1065`).
- Frontend twin: `SYSTEM_FIELD_VARIABLE_NAME_RE = /^FIELD_\d{14}_[A-Z0-9]{6}/` (`formDesignerPropertyEditor.js:9`). Cross-stack contract: `.trellis/spec/guides/cross-stack-contracts.md` §10.
- Consequence for search: `标签` rows carry machine-generated `variable_name`; searching by variable name will not meaningfully match them (fact).

---

## 3. Auth / permissions for a non-project-scoped endpoint

`backend/src/dependencies.py`:
- `get_current_user` (`15-35`): OAuth2 bearer → decode JWT → load user; 401 on any failure; sets `X-Refreshed-Token` response header. Depends on `get_session` (a DB session is needed even for auth).
- `require_admin` (`38-44`): wraps `get_current_user`, 403 unless `is_admin`.
- `verify_project_owner` (`47-55`): 404 if project missing, 403 if `owner_id != current_user.id`. Used by all three import-template endpoints.
- Variants: `verify_form_owner` (`58-65`), `verify_field_definition_owner` (`68-75`), `verify_form_field_owner` (`78-85`), `verify_project_codelist_owner` (`88-97`), `verify_project_unit_owner` (`100-109`).

- **No existing endpoint reads the template without a project id.** All of `import_template.py` (`preview_import` 123-144, `preview_form_fields` 147-176, `execute_import` 179-216) takes `project_id` and calls `verify_project_owner`.
- Empty `template_path` → 400 "未配置模板路径，请先在设置中配置" (`import_template.py:131-132`, `160-161`, `192-193`).

### `template_path` configuration surface
- Config: `TemplateConfig.template_path` (`config.py:110-111`), property `cfg.template_path` (`248-250`), env override `CRF_TEMPLATE_PATH` (`23`, wins over file).
- Exposed **only** via `GET /api/settings` and `PUT /api/settings`, both `require_admin` (`routers/settings.py:126-128`, `156-158`). PUT validates via `_validate_template_path` (`35-56`): non-empty, `.db` suffix, within whitelist `[db_path parent, upload_path]`.
- Regular users can neither read nor change `template_path` through the API; they only consume template data through the project-scoped import-template endpoints. A new search endpoint would be the first template read that any authenticated (or admin) user can hit without owning a project — the choice between `get_current_user` and `require_admin` is the permission decision point; the template file itself is path-whitelisted regardless.

---

## 4. Rate limiting

- `src/rate_limit.py`: single-node in-memory limiter; active **only in production** (`is_rate_limit_enabled`, lines 52-53). Rules: `AUTH_LOGIN_RULE` 5/60s (`67`), `IMPORT_RULE` 3/60s (`68`). Bucket helper `limit_import_action(request, user_id, scope)` (`87-91`).
- Applied today: `import_docx.py:331` (`docx-preview:{pid}`), `import_docx.py:490` (`docx-execute:{pid}`), `projects.py:107` (`project-db-import`), `projects.py:144` (`database-merge-import`), `projects.py:185` (`auto-import`).
- **Template preview endpoints (`import_template.py`) have NO rate limiting.** A new search endpoint is currently unconstrained; `limit_import_action` with a new scope string is the established pattern if one is wanted.

---

## 5. Tests — reusable fixtures/helpers for a template search test

### `backend/tests/test_import_service.py` (service level)
- `import_service_config` autouse fixture (`27-36`): `monkeypatch.setattr("src.services.import_service.get_config", ...)` returning `SimpleNamespace(db_path=str(tmp_path/"crf_editor.db"), upload_path=str(tmp_path/"uploads"))` — this fixes the path whitelist to `tmp_path`.
- `session` fixture (`39-48`): in-memory SQLAlchemy session with `Base.metadata.create_all`.
- Entity builders (`51-139`): `create_project`, `create_form`, `create_field_definition`, `create_codelist` (with `option_metadata` tuples), `create_form_field`.
- **`build_template_db(tmp_path, *, with_unit, with_choice_options, ...)`** (`156-223`): creates a real `.db` file in `tmp_path` via `Base.metadata.create_all`, seeds project/form/unit/codelist/fields/form_fields, returns `(Path, form_id)`. Supports `paper_orientation`, `field_type`, `checkbox_label`, `form_code`, OID params.
- Path-safety regression examples worth mirroring: `test_open_template_session_rejects_template_path_outside_allowlist` (`413`), `test_resolve_existing_template_path_does_not_create_missing_file` (`427`), `test_open_template_session_allows_template_path_inside_upload_dir` (`437`).

### `backend/tests/test_phase0_ordering_contracts.py` (router level — best pattern for an HTTP test)
- `template_db_path` fixture (`169-241`): builds a seeded template `.db` (project/form/codelist/options/unit/3 field_definitions/3 form_fields) and returns a `SimpleNamespace(db_path, allowed_template_path, source_project_id, form_id, form_field_ids, ...)`.
- Router test (`244-273`): monkeypatches **two** `get_config` sites: `import_template_router.get_config` → `SimpleNamespace(template_path=...)`, and `import_service_module.get_config` → `SimpleNamespace(db_path=..., upload_path=...)` for the whitelist. Then calls `client.get(f"/api/projects/{pid}/import-template/form-fields?form_id=...", headers=auth_headers(token))`. This dual-patch is required because the router reads the path and the service validates the whitelist separately.

### Shared infra
- `conftest.py`: `engine` fixture (in-memory SQLite, `PRAGMA foreign_keys=ON`, `StaticPool`) (`41-56`); `client` fixture (TestClient with `get_session`/`get_plain_session` overrides + `main.get_config` patched to a `_TEST_CONFIG`, `CRF_DISABLE_BACKGROUND_JOBS=1` set before import, `main.init_db` patched out) (`59-88`).
- `helpers.py`: `seed_user(client, username, is_admin)`, `login_as(client, username) -> token`, `auth_headers(token)`.

---

## 6. Real data scale

- **No `config.yaml` exists at the repo root** (`ls` confirmed; only `config.yaml.example`, whose `template:` section documents the key). `config.yaml` is developer/deployment-local (gitignored).
- **No `.db` files anywhere in the repo** (`find . -name '*.db' -not -path './node_modules/*'` → zero results).
- Therefore no template is configured or present in this checkout: project/form/field counts, distinct `variable_name`/`label`, `标签` row counts, placeholder-OID counts, cross-project duplicate `(variable_name, label)` pairs, and sample rows **cannot be reported from this machine**. Any scale check must run against the deployment host's `config.yaml` → `template.template_path` (open with `sqlite3.connect('file:<path>?mode=ro', uri=True)` only).

---

## 7. Backend layering conventions for a new read-only service + router

- Router registration: `backend/main.py:30` imports routers from `src.routers`; each is mounted with `prefix="/api"` (`main.py:185-208`). A new router module would follow: `router = APIRouter(tags=["..."])` in `src/routers/<name>.py`, then one `app.include_router(..., prefix="/api")` line.
- Response models: Pydantic `BaseModel` classes declared in the router module itself (see `import_template.py:38-118` for `TemplateProjectItem` / `TemplateFieldPreview` / nested `field_definition` preview structure that a search response could reuse or mirror).
- Error conventions: `HTTPException` with Chinese `detail` for user-facing errors; template compatibility errors return `JSONResponse(status_code=400, content={"detail": ..., "code": "TEMPLATE_INCOMPATIBLE"})` via `_compatibility_error` (`import_template.py:27-32`); unexpected execute errors → `logger.exception` + generic 500 (`213-215`). `FileNotFoundError` → 404, other `ValueError` → 400.
- Session dependencies (`src/database.py`): `get_session` (write, begins a transaction, `1393-1401`), `get_plain_session` (`1405-1416`), `get_read_session` (no transaction, for long reads, `1422-1428`). Template-only reads still need a main-DB session because `get_current_user` depends on `get_session`.
- Layering rule: routers stay lightweight; logic goes into `src/services/` (root + backend CLAUDE.md "Development Conventions").

---

## Caveats / Noted facts for the planner

1. `_open_template_session` re-runs path resolution + 5-table compatibility PRAGMA + fresh engine on **every call** — there is no template-read cache (import_service.py:211-236). A per-keystroke search endpoint pays this cost per request unless it batches or caches at the service layer.
2. The template session is ORM-usable only when all mapped columns exist; `checkbox_label` is the one `field_definition` column with an established probe + `SimpleNamespace` raw-SQL fallback (`183-209`) — a search implementation should reuse `_has_template_field_definition_checkbox_label` + `_load_template_field_definitions` rather than plain ORM selects.
3. `get_template_projects` does not filter `project.deleted_at`; if the configured template ever contains soft-deleted rows they will appear (fact; filtering behavior would be a design decision).
4. `标签` field `variable_name` values are system placeholders (`FIELD_\d{14}_[A-Z0-9]{6}`) — variable-name search semantics for that type need a decision.
5. `label` on a search hit is `FieldDefinition.label`; per-form displayed label may differ via `FormField.label_override` — the two tables must be joined to know where a field is used (FormField → form_id → Form.project_id/name).
6. Data-scale questions unanswered (section 6) — nothing to verify against on this machine.
