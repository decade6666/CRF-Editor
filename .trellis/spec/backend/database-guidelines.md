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
