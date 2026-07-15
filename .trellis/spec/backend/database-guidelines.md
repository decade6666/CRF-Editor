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

### Scenario: Adding a New `form_field` Column

#### 1. Scope / Trigger

- Trigger: adding, renaming, deleting, or changing the default/enum semantics of any persisted `form_field` column.
- This requires code-spec depth because `form_field` is not updated in one place: the table can be rebuilt from canonical DDL, external project DBs are schema-validated before import, and both project copy and form copy rebuild `FormField(...)` rows manually.

#### 2. Signatures

```python
# backend/src/database.py
_FORM_FIELD_CANONICAL_COLUMNS = (
    ("id", None),
    ("form_id", None),
    # ... every persisted form_field column must appear here
)

def _rebuild_form_field_table(conn, *, log_message: str) -> None: ...
def _ensure_form_field_rowid_compatibility(engine) -> None: ...

# backend/src/services/project_import_service.py
_REQUIRED_COLUMNS["form_field"] = frozenset({...})
def _patch_legacy_project_schema(file_path: str) -> None: ...

# backend/src/services/project_clone_service.py
session.add(FormField(...))

# backend/src/routers/forms.py
@router.post("/forms/{form_id}/copy")
def copy_form(...): ...
```

#### 3. Contracts

- **Canonical rebuild contract**: every persisted `form_field` column must exist in both `_FORM_FIELD_CANONICAL_COLUMNS` and the `CREATE TABLE form_field_new` DDL inside `_rebuild_form_field_table()`. If old rows may not have the value, provide an explicit default expression or fail loudly.
- **Import contract**: `_REQUIRED_COLUMNS["form_field"]` is the accepted external schema for project DB import. If older `.db` files should remain importable, `_patch_legacy_project_schema()` must patch the temporary copy before `_validate_schema()` / ORM loading touches the table.
- **Project clone contract**: `ProjectCloneService.clone_from_graph()` manually reconstructs `FormField(...)`. A new column is **not** carried automatically by SQLAlchemy — copy it explicitly or intentionally default it.
- **Form copy contract**: `backend/src/routers/forms.py::copy_form()` also rebuilds `FormField(...)` manually. Same-project duplication must be reviewed whenever a new `form_field` attribute is added.
- **Host legacy contract**: startup repair paths such as `_rebuild_form_field_table()` and `_ensure_form_field_rowid_compatibility()` must preserve the new column, its constraints, and its data.

#### 4. Validation & Error Matrix

| Condition | Expected behavior |
| --- | --- |
| New column missing from `_FORM_FIELD_CANONICAL_COLUMNS` or `form_field_new` DDL | Rebuild / startup heal is incomplete; the new value can be dropped or the rebuild can fail. Treat as a release blocker. |
| New column missing from `_REQUIRED_COLUMNS["form_field"]` | Import validation no longer reflects the real contract; compatibility becomes implicit instead of explicit. Update the validator together with the schema change. |
| Legacy `.db` files should still import, but `_patch_legacy_project_schema()` is not updated | Import fails on old files with `form_field 缺少列 ...` or equivalent schema incompatibility. |
| `ProjectCloneService.clone_from_graph()` not updated | Project copy and project-db import lose the value on cloned `FormField` rows. |
| `forms.py::copy_form()` not updated | `/api/forms/{form_id}/copy` resets or drops the value during same-project duplication. |
| New column is non-nullable but no default/backfill exists | Existing DBs, rebuilds, or imports fail once legacy rows are touched. |

#### 5. Good / Base / Bad Cases

- **Good**: add the column to canonical rebuild DDL, import validator, legacy patch/default path, project clone, and form copy in one change; then assert it survives create → copy → export/import → startup rebuild.
- **Base**: if the field is intentionally defaulted on legacy inputs, document the exact default (`NULL`, `0`, `'auto'`, etc.) and add a regression test proving the defaulted value after import/rebuild.
- **Bad**: update only the ORM model / API schema and assume the value will flow automatically. `form_field` currently has multiple hand-written pass-through sites, so partial updates silently lose data.

#### 6. Tests Required

- **Migration / rebuild**: extend the `form_field` rebuild coverage in `backend/tests/test_project_import.py` so the new column survives `_rebuild_form_field_table()` with the expected PK/FK/NOT NULL/default semantics.
- **Form copy**: add or extend `/api/forms/{form_id}/copy` coverage so the copied form preserves the new `form_field` value.
- **Project copy**: extend `backend/tests/test_project_copy.py::test_copy_project_clones_full_graph` to assert cloned `FormField` rows preserve the new value.
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

# Missing: canonical rebuild, import validator, legacy patch, project copy, form copy
```

**Correct**

```python
# Search all manual pass-through sites first
rg -n "_FORM_FIELD_CANONICAL_COLUMNS|form_field_new|_REQUIRED_COLUMNS|_patch_legacy_project_schema|FormField\(|copy_form" backend/

# Then update the schema change as one unit:
# 1. canonical rebuild DDL/defaults
# 2. import validator + legacy patch/default path
# 3. project clone FormField(...) mapping
# 4. form copy FormField(...) mapping
# 5. regression tests for rebuild/copy/import
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
