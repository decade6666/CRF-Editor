# Directory Structure

> How backend code is organized in this project.

---

## Overview

The backend follows a layered architecture with clear separation of concerns:
- **Routers** handle HTTP requests/responses and input validation
- **Services** contain business logic and orchestration
- **Repositories** encapsulate database operations
- **Models** define SQLAlchemy ORM entities
- **Schemas** define Pydantic request/response models

---

## Directory Layout

```
backend/
├── main.py                    # FastAPI app entry point
├── app_launcher.py            # Desktop distribution entry point
├── src/
│   ├── config.py              # Configuration management
│   ├── database.py            # SQLite setup, session management, migrations
│   ├── dependencies.py        # FastAPI dependencies (auth, resource ownership)
│   ├── rate_limit.py          # Rate limiting decorators
│   ├── routers/               # API endpoints (13 files)
│   │   ├── __init__.py
│   │   ├── auth.py            # Authentication endpoints
│   │   ├── admin.py           # Admin management
│   │   ├── projects.py        # Project CRUD
│   │   ├── visits.py          # Visit management
│   │   ├── forms.py           # Form management
│   │   ├── fields.py          # Field management
│   │   ├── units.py           # Unit dictionary
│   │   ├── options.py         # Option dictionary
│   │   ├── import_docx.py     # Word import
│   │   ├── export.py          # Export endpoints
│   │   ├── settings.py        # User settings
│   │   └── ai_config.py       # AI configuration
│   ├── services/              # Business logic (13 files)
│   │   ├── auth_service.py    # Authentication logic
│   │   ├── user_admin_service.py
│   │   ├── project_service.py
│   │   ├── visit_service.py
│   │   ├── form_service.py
│   │   ├── field_service.py
│   │   ├── unit_service.py
│   │   ├── option_service.py
│   │   ├── import_service.py
│   │   ├── project_import_service.py
│   │   ├── export_service.py
│   │   ├── order_service.py   # Sorting logic
│   │   └── width_planning.py  # Column width calculation
│   ├── repositories/          # Data access layer (6 files)
│   │   ├── base_repository.py # Generic CRUD base class
│   │   ├── project_repository.py
│   │   ├── visit_repository.py
│   │   ├── form_repository.py
│   │   ├── field_repository.py
│   │   └── option_repository.py
│   ├── models/                # SQLAlchemy ORM models (11 files)
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── project.py
│   │   ├── visit.py
│   │   ├── form.py
│   │   ├── field.py
│   │   ├── unit.py
│   │   ├── option.py
│   │   └── ...
│   └── schemas/               # Pydantic models
│       ├── __init__.py
│       ├── auth.py
│       ├── project.py
│       ├── visit.py
│       ├── form.py
│       ├── field.py
│       └── ...
├── tests/                     # pytest test files
│   ├── test_auth.py
│   ├── test_isolation.py
│   ├── test_width_planning.py
│   └── ...
└── pyproject.toml             # Project configuration
```

---

## Module Organization

### Layering Rules

1. **Routers** → Call services, never repositories directly
2. **Services** → Call repositories and other services
3. **Repositories** → Only database operations via SQLAlchemy models

### Adding a New Feature

1. Create model in `src/models/` if new entity
2. Create schema in `src/schemas/` for request/response
3. Create repository in `src/repositories/` for data access (extend `BaseRepository`)
4. Create service in `src/services/` for business logic
5. Create router in `src/routers/` and register in `main.py`

### When to Create a New Module

- New entity type → Create all layers (model, schema, repository, service, router)
- Cross-cutting concern → Create a service (e.g., `order_service.py` for sorting)
- Shared utilities → Place in appropriate service or create helper module

---

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | snake_case | `auth_service.py` |
| Classes | PascalCase | `AuthService`, `UserRepository` |
| Functions | snake_case | `get_current_user()` |
| Constants | UPPER_SNAKE_CASE | `MIN_PASSWORD_LENGTH` |
| Router files | plural noun | `projects.py`, `forms.py` |
| Service files | noun + `_service.py` | `auth_service.py` |
| Repository files | noun + `_repository.py` | `project_repository.py` |

---

## Examples

### Well-organized Module: Auth

```
src/
├── models/user.py         # User ORM model
├── schemas/auth.py        # LoginRequest, TokenResponse, etc.
├── services/auth_service.py  # Business logic
├── routers/auth.py        # API endpoints
└── dependencies.py        # get_current_user dependency
```

### Generic Repository Pattern

```python
# src/repositories/base_repository.py
from typing import TypeVar, Generic, Type

T = TypeVar("T")

class BaseRepository(Generic[T]):
    def __init__(self, model: Type[T], session: Session):
        self.model = model
        self.session = session

    def get_by_id(self, id: int) -> T | None:
        return self.session.get(self.model, id)

    # ... other CRUD methods
```
