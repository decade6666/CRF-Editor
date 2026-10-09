# Database Guidelines

> Database patterns and conventions for this project.

---

## Overview

- **Database**: SQLite with WAL mode for concurrent access
- **ORM**: SQLAlchemy 2.x with declarative models
- **Migrations**: Lightweight in-code migrations in `database.py`
- **Session Management**: Dependency injection with FastAPI

---

## SQLite Configuration

```python
# src/database.py
PRAGMA foreign_keys = ON        # Enforce FK constraints
PRAGMA journal_mode = WAL       # Write-Ahead Logging for concurrency
PRAGMA busy_timeout = 5000      # 5 second timeout for locks
PRAGMA synchronous = NORMAL     # Balance safety and performance
```

---

## Session Patterns

### Background Jobs Must Not Reuse Request-Scoped Dependencies

Background jobs (for example the recycle-bin cleanup loop) must create their own SQLAlchemy session from `Session(get_engine())` inside the worker thread / task. Do **not** call FastAPI request-scoped dependencies such as `get_session()` / `get_read_session()` from a background task.

Why:

- request-scoped dependencies are designed for HTTP lifecycle management, not long-lived loops
- `TestClient(app)` executes `lifespan`, so an accidentally started background job can reach the real configured database during tests
- background tasks should control their own transaction boundaries explicitly (for example one recycled project per transaction during hard-delete cleanup)

Rules:

1. Background loops create their own session inside the execution function.
2. Blocking SQLite I/O should run via `asyncio.to_thread(...)` (or equivalent) so the event loop stays responsive.
3. Tests must provide an env/flag guard to disable background jobs before importing `main`.

### `deleted_at` Time Semantics

`project.deleted_at` is written with `datetime.now()` (naive local wall-clock time). Cleanup cutoffs that compare against `deleted_at` must use the same naive-local convention.

Do **not** compare `deleted_at` to `datetime.now(timezone.utc)` or any aware datetime; SQLite `DateTime` storage in this project discards tzinfo, and mixing aware/naive values will shift the effective cutoff by the local UTC offset.

### Scenario: Hard Delete Ordering — Commit Before Unlinking the Logo

#### 1. Scope / Trigger

- Trigger: any code path that permanently deletes a recycled project — the recycle-bin cleanup loop (`recycle_bin_cleanup_service.run_recycle_bin_cleanup`, one recycled project per transaction) and the admin route `routers/admin.py::hard_delete_project`.
- Why ordered: the DB row is the source of truth. Unlinking the Logo file before the commit can return the project to the recycle bin pointing at a file that no longer exists.

#### 2. Signatures

```python
# backend/src/services/project_purge_service.py
def purge_project(session: Session, project: Project) -> Optional[str]: ...
#   delete + flush only; touches no files; returns the Logo relative file name (None when unset)

# backend/src/services/logo_storage_service.py  (the single Logo file policy, shared with org presets)
def delete_file(namespace: str, rel_name: str) -> bool: ...
#   safe_resolve (rejects absolute / traversal / nested / backslash names) + unlink;
#   missing or unresolvable name → False; any failure → logger.warning; never raises

# backend/src/database.py
def get_session():        # 预开事务；请求内 commit 后继续用会抛 InvalidRequestError
def get_plain_session():  # 裸 Session，供需要显式提交的服务使用
```

#### 3. Contracts

- Per-project order is fixed: re-check `deleted_at IS NOT NULL` → `logo_rel = purge_project(session, project)` → `session.commit()` → `if logo_rel: delete_file(PROJECT_NAMESPACE, logo_rel)`.
- `purge_project()` must not unlink: it returns the relative name so the caller can compensate after the commit. File removal goes through `logo_storage_service.delete_file` — the one Logo deletion policy shared with `project_profile_service` / `organization_preset_service` (path validation, `PROJECT_NAMESPACE`, warning-only failures). Do not introduce a second bespoke Logo-unlink helper.
- Failure scope: a failed DB delete / `commit()` rolls back — the project stays in the recycle bin and the Logo file is still in place, because it is deleted strictly after the commit. An error after a successful commit cannot roll that commit back; the worst residual state there is an orphan file, which is acceptable.
- `routers/admin.py::hard_delete_project` depends on `get_plain_session`, not `get_session`, because it must commit explicitly before unlinking (the same shape as the other composite-write services). A `get_session` request opens an outer `session.begin()`, and calling `commit()` inside it makes any later session use raise `InvalidRequestError` (see the `get_plain_session` docstring in `database.py`). The 404 (project missing) / 400 (not in the recycle bin) guards run before any write.
- The loop keeps one project per transaction, which bounds WAL write-lock windows and prevents a half-deleted graph if the process dies mid-loop.

#### 4. Validation & Error Matrix

| Condition | Expected behavior |
| --- | --- |
| DB delete / `commit()` fails | `rollback()`; the project stays in the recycle bin and the Logo file is untouched |
| Logo file missing, or its stored name is malformed (e.g. NUL) / unsafe (traversal) | Commit stands, request/loop succeeds; `delete_file` skips or warns and never raises (a NUL name is treated as "file missing" — `Path.exists()` swallows the `ValueError`) |
| `company_logo_path` is NULL | `purge_project` returns `None`; no deletion call |
| Project restored between plan and purge | Loop re-checks `deleted_at`, skips it; nothing deleted, nothing unlinked |
| Admin route on a missing / non-recycled project | 404 / 400 before any write |
| Success | Project graph gone, Logo file gone, `purged_count` incremented |

#### 5. Good / Base / Bad Cases

- **Good**: the cleanup purges a recycled project, commits, then deletes its Logo via `delete_file`; an `after_commit` probe observes the file still present at the delete commit and gone afterwards.
- **Base**: a project without a Logo (`company_logo_path` NULL) purges with `None` flowing through — no `delete_file` call.
- **Bad**: unlinking before `session.commit()`; a failed commit then loses the Logo of a project that is still in the recycle bin.

#### 6. Tests Required

- `backend/tests/test_recycle_bin_cleanup.py::test_run_cleanup_purges_graph_and_logo` — the shared `helpers.commit_probe` records `logo_path.exists()` per commit; the first commit that observes the project row gone must still see the file, and it must be absent afterwards.
- `backend/tests/test_recycle_bin_cleanup.py::test_run_cleanup_keeps_logo_when_commit_fails` — monkeypatched failing `commit()`; `purged_count == 0` and the Logo survives.
- `backend/tests/test_recycle_bin_cleanup.py::test_run_cleanup_skips_project_restored_between_plan_and_purge` — the `deleted_at` re-check.
- `backend/tests/test_admin_project_ops.py::test_hard_delete_removes_project_logo_file` — the same probe on the admin route. Assert on the first commit that observes the project row gone: the auth dependency's own `get_session` commits at request teardown, after the unlink.
- `backend/tests/test_admin_project_ops.py::test_hard_delete_tolerates_malformed_logo_path` — a tampered NUL `company_logo_path` deletes cleanly (204, row gone); the unresolvable name is treated as a missing file, never a request failure.
- `backend/tests/test_admin_project_ops.py::test_hard_delete_only_accepts_recycled_projects_and_physically_removes_that_graph` — guards + graph deletion.

#### 7. Wrong vs Correct

**Wrong**

```python
# Delete the file before the commit: a failed commit returns the project to the
# recycle bin with its Logo already gone — and a bespoke unlink bypasses the
# shared safe_resolve / warning policy
path = Path(get_config().upload_path) / "logos" / project.company_logo_path
path.unlink(missing_ok=True)
session.commit()
```

**Correct**

```python
logo_rel = purge_project(session, project)    # delete + flush, returns the rel name
session.commit()                              # DB row is now the source of truth
if logo_rel:
    delete_file(PROJECT_NAMESPACE, logo_rel)  # commit-success compensation
```

### Write Operations (with transaction)

```python
from src.database import get_session

@router.post("/items")
def create_item(data: ItemCreate, session: Session = Depends(get_session)):
    item = Item(**data.model_dump())
    session.add(item)
    session.commit()
    session.refresh(item)
    return item
```

### Read-Only Operations

```python
from src.database import get_read_session

@router.get("/items")
def list_items(session: Session = Depends(get_read_session)):
    return session.scalars(select(Item)).all()
```

**Why two session types?**
- `get_session` - Opens transaction, for writes
- `get_read_session` - No transaction overhead, for reads

### External SQLite Files Must Not Be Mutated During Read Flows

For template-library reads, treat the external `.db` as immutable input. Resolve and validate the path first, require the file to already exist, then open it read-only.

```python
# backend/src/services/import_service.py
@staticmethod
def _resolve_existing_template_path(template_path: str) -> str:
    db_path = ImportService._validate_runtime_template_path(template_path)
    if not Path(db_path).exists():
        raise FileNotFoundError(f"模板文件不存在: {template_path}")
    return db_path
```

```python
engine = create_engine(
    "sqlite+pysqlite://",
    creator=lambda: sqlite3.connect(db_path, check_same_thread=False),
)

@event.listens_for(engine, "connect")
def _set_readonly(dbapi_conn, connection_record):
    dbapi_conn.execute("PRAGMA query_only = ON")
```

**Rules**:
1. Never call `sqlite3.connect()` on an unvalidated path in a read flow — SQLite will create a new empty file if it does not exist.
2. Legacy compatibility for read flows must use read-only schema inspection (`PRAGMA table_info`) or read-only fallback queries, not `ALTER TABLE` against the source file.
3. When an optional legacy column is missing, fall back in memory (for example `paper_orientation="auto"`) and leave the external file unchanged.

---

## Migrations

Migrations are handled in `database.py` using SQLAlchemy's inspector:

```python
def run_migrations(engine):
    inspector = inspect(engine)
    existing_columns = {col["name"] for col in inspector.get_columns("users")}

    with engine.connect() as conn:
        if "new_field" not in existing_columns:
            conn.execute(text("ALTER TABLE users ADD COLUMN new_field TEXT"))
            conn.commit()
```

### Migration Pattern

1. Check if change already applied (idempotent)
2. Use `text()` for raw DDL
3. Commit after each migration
4. Run migrations at app startup in `main.py`

### When to Add Migration

- New column on existing table
- New index for performance
- Data backfill for new required fields

### When NOT to Use Migrations

- New table → Define in model, SQLAlchemy creates on startup
- Dropping columns → Not supported by SQLite; create new table and migrate data

### Scenario: Adding Nullable `FieldDefinition.checkbox_label`

#### 1. Scope / Trigger

- Trigger: adding or changing `FieldDefinition.checkbox_label`, the nullable persisted text for `field_type="复选"`.
- This is a migration/import contract: local databases migrate in place; project DB imports may patch their working copy; template-library reads must remain read-only.

#### 2. Signatures

```python
# backend/src/models/field_definition.py
checkbox_label: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

# backend/src/database.py
_migrate_add_field_definition_checkbox_label(engine) -> None
# Adds: field_definition.checkbox_label VARCHAR(255) NULL

# backend/src/services/import_service.py
_has_template_field_definition_checkbox_label(db_path: str) -> bool
_load_template_field_definitions(..., has_checkbox_label: bool) -> list[FieldDefinition | SimpleNamespace]
```

#### 3. Contracts

- The local startup migration is idempotent: probe `field_definition` first, then add nullable `VARCHAR(255)` only when absent; no backfill is required.
- Project DB import compatibility patches its import working copy before schema validation/ORM loading, so a legacy source missing the column imports with `checkbox_label=None`.
- Template preview/import probes `PRAGMA table_info(field_definition)`. If the column is absent, it selects only legacy columns and supplies `SimpleNamespace.checkbox_label=None` in memory; it MUST NOT run `ALTER TABLE` on the external template.
- Current clone, project import, and template import must explicitly copy `checkbox_label`; for `field_type="复选"`, codelist remapping remains `None`.

#### 4. Validation & Error Matrix

| Condition | Expected behavior |
| --- | --- |
| Local `field_definition` lacks `checkbox_label` | Startup adds nullable `VARCHAR(255)` exactly once. |
| Legacy project DB lacks the column | Compatibility patch makes the importable working copy nullable-compatible; imported value is `None`. |
| Legacy external template lacks the column | Preview/import returns or persists `None`; source schema remains unchanged. |
| Current source contains custom text | Clone/project/template paths preserve the exact text. |
| `复选` source carries stale `codelist_id` | Destination field definition keeps `codelist_id=None`; no codelist is merged solely for it. |

#### 5. Good / Base / Bad Cases

- **Good**: a current template with `checkbox_label="受试者已确认"` previews and imports the same value; a legacy template produces `None` without any source-file write.
- **Base**: `checkbox_label=None` is valid persisted data and the renderer later falls back to the default character `✔`.
- **Bad**: execute `ALTER TABLE` against a template file, or ORM-select a missing column and let legacy preview/import fail with `OperationalError`.

#### 6. Tests Required

- Migration test: legacy local `field_definition` gains one nullable `checkbox_label` column and preserves existing rows.
- Project import test: current and missing-column sources preserve custom text or produce `None`, respectively.
- Template test: `backend/tests/test_import_service.py::test_template_preview_and_import_preserve_checkbox_label` asserts preview/import fidelity and `codelist_id is None`.
- Template legacy test: `test_template_preview_and_import_default_checkbox_label_when_legacy_column_is_missing` asserts `None` fallback and verifies the external source still lacks the column.
- Clone test: `backend/tests/test_project_copy.py::test_copy_project_clones_full_graph` asserts custom text and null codelist are retained.

#### 7. Wrong vs Correct

**Wrong**

```python
# Missing-column template: mutate caller-owned input to satisfy the ORM.
conn.execute("ALTER TABLE field_definition ADD COLUMN checkbox_label VARCHAR(255)")
```

**Correct**

```python
has_checkbox_label = _has_template_field_definition_checkbox_label(db_path)
source_defs = _load_template_field_definitions(
    tmpl, field_definition_ids, has_checkbox_label=has_checkbox_label,
)
# Legacy fallback supplies checkbox_label=None in memory; template stays immutable.
```

### Scenario: OID (`code`) Copy Contract

#### 1. Scope / Trigger

- The OID surface is `form.code`, `field_definition.variable_name`, `codelist.code`, `codelist_option.code`, `unit.code` (plus `visit.code`). `Form` / `CodeList` / `Unit` all carry `UniqueConstraint("project_id", "code")`; `FieldDefinition` carries `UniqueConstraint("project_id", "variable_name")`.
- Copy paths that must preserve OIDs verbatim: project clone (`project_clone_service.py`), project `.db` import / merge (delegates to clone), and **template library import** (`import_service.py`).
- Routers mint a fresh OID only when the caller supplies none: `if not dump.get("code"): dump["code"] = generate_code(PREFIX)` (`routers/forms.py`, `routers/codelists.py`, `routers/units.py`, `routers/visits.py`).

#### 2. Signatures

```python
# backend/src/utils.py
generate_code(prefix: str) -> str
# Returns f"{prefix}_{YYYYMMDDHHmmss}_{6 random A-Z0-9}"

# backend/src/services/import_service.py
_make_unique_code(existing: set[str], base: str) -> str
# base_IMP → base_IMP2 → ... (same ladder as _make_unique_var, independently evolved)

_resolve_import_code(existing_codes: set[str], source_code: Optional[str], prefix: str) -> str
# Non-empty source → strip and copy verbatim; empty/whitespace → mint; collision → _IMP ladder.
```

#### 3. Contracts

- Template import must preserve a non-empty source `code` verbatim (after `strip()`), mint only when empty, and dedupe with the `_IMP` ladder inside the target project — never rely on `IntegrityError` catch to resolve collisions (the route's `except Exception` would surface an opaque 500).
- The caller must add the resolved code to `existing_codes` before/at write so intra-batch collisions (units/codelists are selected without a `project_id` filter, so cross-source-project duplicates are possible) cannot violate the unique constraint.
- The codelist/unit **reuse** branches (symbol match; name + option signature match) must never overwrite the target's existing OID — no new row is constructed there.
- **No charset re-validation on import**: `OID_PATTERN = ^[A-Za-z0-9._-]+$` (`schemas/_common.py`) is enforced only at Create/Update schema boundaries (edit-time only, no migration); clone/project/template import may carry legacy non-conforming OIDs.

#### 4. Validation & Error Matrix

| Condition | Expected behavior |
| --- | --- |
| Source `code` non-empty, target free | Copied verbatim (whitespace stripped). |
| Source `code` empty / whitespace / NULL | New `PREFIX_<ts>_<rand>` minted. |
| Source `code` collides with target | `base_IMP` → `base_IMP2` → …; existing row untouched. |
| Same template imported twice | First pass copies OIDs; second pass reuses units/codelists by signature and suffixes form OID; never raises `IntegrityError`. |
| Legacy source with non-ASCII `code` | Imported as-is (no charset validation on import paths). |

#### 5. Good / Base / Bad Cases

- **Good**: a template with `form.code="DM"`, `unit.code="MG"`, `codelist.code="CL_SEX"` imports those exact values into an empty target project; re-importing suffixes colliding ones with `_IMP`.
- **Base**: source OID is NULL → freshly minted; a target row is reused → its existing OID stays.
- **Bad**: dropping the source OID and always minting (the pre-fix behavior), or letting a `UniqueConstraint` violation surface as an opaque 500.

#### 6. Tests Required

- `backend/tests/test_import_service.py`: OID preservation / empty-mint / `_IMP` ladder for form, unit, codelist; reuse branches keep target OIDs; double-import does not raise; whitespace strip; non-ASCII passthrough; intra-batch dedup across source projects; pure `test_resolve_import_code_ladder`.

### Scenario: Label OID Startup Normalization

#### 1. Scope / Trigger

- Trigger: touching `_normalize_label_variable_names` or `_LABEL_PLACEHOLDER_RE` in `backend/src/database.py`, or changing how labels (`field_type = '标签'`) receive `variable_name`.
- Labels are hidden from the field library but still occupy the project-wide `UniqueConstraint(project_id, variable_name)`, so a user-typed OID left on a label blocks that OID invisibly (409 for later fields).

#### 2. Contracts

- `_normalize_label_variable_names(engine)` runs in `init_db()` right after `_normalize_log_row_presentation(engine)`.
- Placeholder rule `_LABEL_PLACEHOLDER_RE = ^FIELD_\d{14}_[A-Z0-9]{6}` (prefix match) must stay identical to the frontend `SYSTEM_FIELD_VARIABLE_NAME_RE` (cross-stack contract, see cross-stack-contracts §10).
- Only `field_type = '标签'` rows whose `variable_name` is NULL or fails the rule are rewritten; each new name is `generate_code("FIELD")` drawn until unique within its project (the used-set covers all of the project's OIDs and grows per draw); everything happens in one `engine.begin()` transaction.
- Idempotent by construction (placeholders match the rule); guards skip a missing table or missing `id`/`project_id`/`variable_name`/`field_type` columns; logs `已为 %d 条标签字段定义重新生成系统 OID` only when rows changed.
- Labels imported from older templates / project `.db` files keep their source OIDs until the next restart — import paths intentionally do not normalize.
- Residual risk (accepted): a form's `annotation_positions` may keep a key equal to a released OID; a future field reusing that OID inherits only that vertical offset.

#### 3. Tests Required

- `backend/tests/test_label_variable_name_migration.py`: user-typed label OIDs (`AGE`, `标签A`, `''`, lowercase suffix) re-minted; placeholder / `_copy` / `_IMP2` kept; non-label rows untouched; collision retry via monkeypatched `src.database.generate_code`; idempotent second run; missing table / missing column no-ops; released OID reusable in the same project; two projects holding the same label OID are each re-minted and released independently (per-project uniqueness); `init_db()` invokes the normalization on its engine (wiring guard with a spied `_normalize_label_variable_names`).

### Scenario: Adding a New `form_field` Column

#### 1. Scope / Trigger

- Trigger: adding, renaming, deleting, or changing the default/enum semantics of any persisted `form_field` column.
- This requires code-spec depth because `form_field` is not updated in one place: the table can be rebuilt from canonical DDL, external project DBs are schema-validated before import, and three copy paths (project clone, template import, same-project form copy) share one helper.
- Historical cause: `bg_color` / `text_color` / `label_bold` / `label_font_size` were once copied by hand at each site, and `forms.py::copy_form` silently dropped all four. Copy paths now go through `form_field_copy.copy_form_field()`; only create-from-payload paths (`routers/fields.py`, `docx_import_service.py`, `field_profile_service.py`) still construct `FormField(...)` directly.

#### 2. Signatures

```python
# backend/src/services/form_field_copy.py  (single copy contract)
CALLER_SUPPLIED_ATTRS = frozenset({"form_id", "field_definition_id", "order_index"})
NEVER_COPIED_ATTRS = frozenset({"id", "created_at", "updated_at"})
COPIED_ATTRS: tuple[str, ...]   # every other FormField column, derived from __table__.columns

def copy_form_field(
    src: FormField, *, form_id: int,
    field_definition_id: Optional[int], order_index: int,
) -> FormField: ...   # unsaved; all COPIED_ATTRS values taken from src

# backend/src/database.py
_FORM_FIELD_CANONICAL_COLUMNS = (
    ("id", None),
    ("form_id", None),
    # ... every persisted form_field column must appear here
)

def _rebuild_form_field_table(conn, *, log_message: str) -> None: ...
def _ensure_form_field_rowid_compatibility(engine) -> None: ...

# backend/src/services/project_import_service.py  (project .db import)
_REQUIRED_COLUMNS["form_field"] = frozenset({...})
def _patch_legacy_project_schema(file_path: str) -> None: ...

# backend/src/services/import_service.py  (template library; no ALTER TABLE on the source)
_TEMPLATE_REQUIRED_COLUMNS["form_field"] = [
    "order_index", "is_log_row", "inline_mark", "label_bold", "label_font_size",
]
```

#### 3. Contracts

- **Canonical rebuild contract**: every persisted `form_field` column must exist in both `_FORM_FIELD_CANONICAL_COLUMNS` and the `CREATE TABLE form_field_new` DDL inside `_rebuild_form_field_table()`. If old rows may not have the value, provide an explicit default expression or fail loudly.
- **Import contract**: `_REQUIRED_COLUMNS["form_field"]` is the accepted external schema for project DB import. If older `.db` files should remain importable, `_patch_legacy_project_schema()` must patch the temporary copy before `_validate_schema()` / ORM loading touches the table.
- **Template validator contract**: `ImportService._TEMPLATE_REQUIRED_COLUMNS["form_field"]` (current value: `order_index`, `is_log_row`, `inline_mark`, `label_bold`, `label_font_size`) is the column set every importable template must carry; `_check_template_compatibility` rejects a template missing one of them. Removing a name from that list is **not** compatibility support: the read path still selects `FormField` as a whole ORM row, so every model column is emitted and a legacy template missing an optional column fails with `OperationalError` before any in-memory fallback can run. Supporting an optional legacy column requires, on that read path, all three: a `PRAGMA table_info` probe (`_has_template_*`), a projection that avoids the full-row ORM SELECT (see `get_template_form_paper_orientation`, which reads only `paper_orientation` via `text()` for exactly this reason), and an in-memory default (`paper_orientation="auto"`, `SimpleNamespace.checkbox_label=None`). The external template is never `ALTER`ed, and `form_field_copy.copy_form_field` does not replace these boundary adaptations — it only copies what the loaded source row has.
- **Copy contract (shared)**: project clone (`ProjectCloneService.clone_from_graph`, also used by project `.db` import), template import (`ImportService`), and same-project form copy (`routers/forms.py::copy_form`) all call `copy_form_field()` and only decide `form_id`, the remapped `field_definition_id`, and ordering. A new column is copied **by default**; excluding it means adding its name to `NEVER_COPIED_ATTRS` or `CALLER_SUPPLIED_ATTRS` with a comment saying why, plus updating `backend/tests/test_form_copy.py`, which pins both sets.
- **Host legacy contract**: startup repair paths such as `_rebuild_form_field_table()` and `_ensure_form_field_rowid_compatibility()` must preserve the new column, its constraints, and its data.

#### 4. Validation & Error Matrix

| Condition | Expected behavior |
| --- | --- |
| New column missing from `_FORM_FIELD_CANONICAL_COLUMNS` or `form_field_new` DDL | Rebuild / startup heal is incomplete; the new value can be dropped or the rebuild can fail. Treat as a release blocker. |
| New column missing from `_REQUIRED_COLUMNS["form_field"]` | Import validation no longer reflects the real contract; compatibility becomes implicit instead of explicit. Update the validator together with the schema change. |
| Legacy `.db` files should still import, but `_patch_legacy_project_schema()` is not updated | Import fails on old files with `form_field 缺少列 ...` or equivalent schema incompatibility. |
| New column wrongly excluded via `NEVER_COPIED_ATTRS` / `CALLER_SUPPLIED_ATTRS` (or the helper misses it) | Every copy path silently drops it; `test_form_copy.py` fails on its set-equality assertion. |
| A new hand-written `FormField(...)` copy site bypasses `copy_form_field` | That path keeps a private attribute list and will drift again; grep construction sites when adding a copy path. |
| New column is non-nullable but no default/backfill exists | Existing DBs, rebuilds, or imports fail once legacy rows are touched. |

#### 5. Good / Base / Bad Cases

- **Good**: add the column to canonical rebuild DDL, both import validators, and the legacy patch/default path in one change; the three copy paths pick it up automatically via `copy_form_field`. Assert it survives create → form copy → project copy → project `.db` import → startup rebuild.
- **Base**: if the field is intentionally excluded from copies or defaulted on legacy inputs, document the exact default (`NULL`, `0`, `'auto'`, etc.) and add a regression test proving the value after import/rebuild.
- **Bad**: construct `FormField(...)` by hand in a copy path, or add a column to one of the two exclusion sets without a comment and a test. Both re-create the original drift bug.

#### 6. Tests Required

- **Copy list**: `backend/tests/test_form_copy.py::test_should_copy_every_payload_column_of_form_field` asserts `COPIED_ATTRS == all model columns − CALLER_SUPPLIED_ATTRS − NEVER_COPIED_ATTRS`, pins both exclusion sets, and round-trips a type-derived sample value through every copied column.
- **Form copy**: `backend/tests/test_form_copy.py::test_should_keep_field_styles_when_copying_form` — `POST /api/forms/{form_id}/copy` keeps `bg_color` / `text_color` / `label_bold` / `label_font_size`.
- **Project copy**: extend `backend/tests/test_project_copy.py::test_copy_project_clones_full_graph` to assert cloned `FormField` rows preserve the new value.
- **Migration / rebuild**: extend the `form_field` rebuild coverage in `backend/tests/test_project_import.py` so the new column survives `_rebuild_form_field_table()` with the expected PK/FK/NOT NULL/default semantics.
- **Project DB import / merge**: add or extend `backend/tests/test_project_import.py` to cover both current-schema round-trip import and the intended legacy behavior (patched default vs fail-closed rejection).
- **API round-trip**: if the field is user-writable or user-visible, extend `backend/tests/test_fields_router.py` so create / patch / put / list all expose the same value.

**Assertion points**:
- copied rows keep the exact value unless an intentional default is documented;
- legacy import either produces the documented default or fails with a targeted incompatibility message;
- startup rebuild preserves constraints and does not drop data;
- export/import round-trip does not null out the new column.

#### 7. Wrong vs Correct

**Wrong**

```python
# Only update the ORM / API layer
class FormField(Base):
    annotation_offset_x = mapped_column(Integer, default=0)

# Missing: canonical rebuild, import validators, legacy patch

# Wrong - a fourth copy site with its own hand-maintained attribute list
session.add(FormField(
    form_id=new_form.id,
    field_definition_id=ff.field_definition_id,
    order_index=idx,
    is_log_row=ff.is_log_row,
    required=ff.required,
    # ... every display attribute repeated, and eventually forgotten
))
```

**Correct**

```python
# Search all pass-through sites first
rg -n "_FORM_FIELD_CANONICAL_COLUMNS|_REQUIRED_COLUMNS|_TEMPLATE_REQUIRED_COLUMNS|_patch_legacy_project_schema|FormField\(" backend/

# Then update the schema change as one unit:
# 1. canonical rebuild DDL/defaults
# 2. import validators + legacy patch/default path
# 3. confirm copy_form_field carries the column by default (no per-path edit needed)
# 4. regression tests for rebuild / form copy / project copy / import

session.add(copy_form_field(
    ff, form_id=new_form.id, field_definition_id=remapped_id, order_index=idx,
))
```

---

## Query Patterns

### Using Repository Pattern

```python
# In service layer
class ProjectService:
    def __init__(self, session: Session):
        self.repo = ProjectRepository(Project, session)

    def get_project(self, project_id: int) -> Project | None:
        return self.repo.get_by_id(project_id)
```

### Direct SQLAlchemy (for complex queries)

```python
from sqlalchemy import select

def get_forms_with_fields(project_id: int, session: Session):
    stmt = (
        select(Form)
        .where(Form.project_id == project_id)
        .options(selectinload(Form.fields))
        .order_by(Form.order_index)
    )
    return session.scalars(stmt).all()
```

### Batch Operations

```python
def batch_delete(ids: list[int], session: Session):
    session.execute(delete(Field).where(Field.id.in_(ids)))
    session.commit()
```

### Project-Independent Template Read (Read-Only External `.db`)

Reading an external template `.db` (template import, template field search) must go through `ImportService._open_template_session` — it enforces the path whitelist, runs compatibility checks, and enables `PRAGMA query_only` so no statement can mutate the source. Never open a template path with a bare engine/session, and never migrate or add columns to a template library.

- Probe optional legacy columns (`project.deleted_at`, `form.code`, `form_field.label_override`, `field_definition.checkbox_label`) with `PRAGMA table_info(<table>)` and project `NULL` in their place when absent — do not fail and do not migrate.
- Prefer whole-table raw `text()` reads filtered/grouped in Python over ORM models and long `IN (...)` parameter lists; the template schema may lag the live models.
- Close the session in a `finally` block, and keep the filesystem path out of error messages (`routers/template_fields.py` maps failures to 400 未配置模板库 / 404 文件不存在 / 400 路径无效 / 400 `TEMPLATE_INCOMPATIBLE` / 500).
- Reference implementation: `backend/src/services/template_field_index_service.py`.

---

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Tables | snake_case, plural | `users`, `projects`, `form_fields` |
| Columns | snake_case | `created_at`, `project_id` |
| Foreign Keys | `{table}_id` | `project_id`, `form_id` |
| Indexes | `ix_{table}_{column}` | `ix_fields_form_id` |

### Model Definition

```python
class Field(Base):
    __tablename__ = "fields"

    id: Mapped[int] = mapped_column(primary_key=True)
    form_id: Mapped[int] = mapped_column(ForeignKey("forms.id"))
    field_name: Mapped[str] = mapped_column(String(100))
    order_index: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(default=func.now())
```

---

## Common Mistakes

### 1. Forgetting to Commit

```python
# Wrong - no commit
session.add(item)
return item  # Data not persisted!

# Correct
session.add(item)
session.commit()
session.refresh(item)
return item
```

### 2. N+1 Query Problem

```python
# Wrong - N+1 queries
forms = session.scalars(select(Form)).all()
for form in forms:
    print(form.fields)  # Query per form!

# Correct - eager loading
forms = session.scalars(
    select(Form).options(selectinload(Form.fields))
).all()
```

### 3. Not Using Transactions for Multiple Writes

```python
# Wrong - partial failure leaves inconsistent state
session.add(item1)
session.commit()  # Success
session.add(item2)
session.commit()  # Fails - item1 already saved!

# Correct - atomic operation
try:
    session.add(item1)
    session.add(item2)
    session.commit()
except:
    session.rollback()
    raise
```

### 4. SQLite Lock Timeout

```python
# Wrong - long transaction blocks others
with session.begin():
    # ... many operations
    time.sleep(10)  # Holding lock!

# Correct - keep transactions short
with session.begin():
    session.add(item)
    # Commit immediately
```

### 5. Raw `text()` UPDATE on Datetime Columns

When writing raw SQL via `text()` to update a `DateTime`/`DateTime(timezone=True)` column, **always pass a `datetime` object** as the bind parameter — never a pre-serialized ISO string. SQLAlchemy's SQLite dialect serializes `datetime` objects with a **space** separator (`'2026-05-07 12:34:56'`), but `datetime.isoformat()` uses `'T'` (`'2026-05-07T12:34:56'`). Mixing both formats in the same column breaks `ORDER BY <col> DESC` because `'T'` (ASCII 84) > `' '` (ASCII 32) lexically — same-day records sort incorrectly.

```python
# Wrong - ISO string with 'T' separator, breaks chronological sort vs ORM-managed rows
conn.execute(
    text("UPDATE project SET deleted_at = :now WHERE ..."),
    {"now": datetime.now().isoformat()},
)

# Correct - pass datetime object; SQLAlchemy serializes consistently with ORM
conn.execute(
    text("UPDATE project SET deleted_at = :now WHERE ..."),
    {"now": datetime.now()},
)
```

Also prefer using the UPDATE's `result.rowcount` for affected-row logging instead of running a separate `SELECT COUNT(*)` with the same predicate — eliminates the duplicate query and the small race window between count and update.
