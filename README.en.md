# CRF Editor

**English** | [中文](./README.md)

## Introduction

CRF (Case Report Form) Editor is a form design and management tool for clinical research. The system supports creating, editing, and managing various forms in clinical research projects, and can export forms to standard Word document format.

### Key Features

- **Project and Access Management**: Create and manage clinical research projects with account-password login, admin user management, project isolation, and a dedicated admin workspace
- **Visit Management**: Define and manage research visit workflows, support visit sequences and form associations, and batch-edit visit-form mappings in matrix form
- **Form Designer**: Full-screen visual form designer supporting multiple field types (text, numeric, date, radio, multi-select, single checkbox, etc.), drag sorting, and design notes
- **Live Preview & Quick Edit**: The designer provides a live preview at the bottom and supports double-clicking previewed fields to quickly edit instance properties such as labels, colors, inline layout, and default values; in complete mode, both the designer and the visits form preview can switch between eCRF / aCRF views, and the aCRF field OID / form-domain annotations support vertical dragging, persisted positions, and export-matched styling
- **Field Library / Code Lists / Units**: Centralized management of reusable field definitions, option dictionaries, and measurement units; in the field library, single-/multi-choice fields can add or edit the referenced option dictionary inline without switching to the code-list page; a single checkbox is codelist-free, can define checkbox text (falling back to its field label when empty), and renders as `field label | □checkbox text` in previews and Word exports
- **List Ordering and Ordinal Quick Edit**: Code lists, options, units, fields, visits, visit-form relations, and the form list in the designer all support drag ordering; double-clicking the ordinal cell opens direct target-position input backed by the existing reorder endpoints
- **Simple / Complete Edit Modes**: Hide advanced identifiers such as OIDs and variable names by default, and expose them consistently in complete edit mode
- **Import Flows**: Supports template `.db` import, project database import / full-database merge import, and Word `.docx` compare-based import preview with an original-document screenshot evidence panel; Word import AI review suggestions can be accepted selectively at three levels (per suggestion / per form / all, default off), and the "import effect" preview reflects accepted field types in real time
- **Export Flows**: Supports Word export (eCRF / aCRF) and database export; Word export includes a short-term rate limit, width-adaptive fill lines and choice trailing underscores, pre-rendered table-of-contents entries with real page numbers when LibreOffice is available, and aCRF floating OID / domain annotation boxes that do not disturb eCRF table text; preview and export share the same annotation geometry and red visual style, and a strict preview/export table-field parity comparator is included
- **Project Copy and Logo Handling**: Supports deep project copy and runtime logo upload / copy / delete coordination
- **Form Preview**: Preview form field layout directly from the visits management panel, reuse the Word-preview row-height resize experience, and show export-matched persistent annotations in aCRF view
- **Session Management**: Shows remaining JWT session lifetime in the header, warns near expiry, and supports click-to-refresh
- **AI and Settings**: Supports AI endpoint configuration, connectivity testing, and import / export related settings
- **Global Fuzzy Search and Dark Mode**: Built-in search boxes in all five tabs (Projects, Visits, Forms, Fields, Code Lists), ranking exact matches first and partial matches by matched text length, plus light / dark theme switching
- **Desktop Distribution**: Supports PyInstaller packaging, auto-opening the browser, and running from a system tray icon

## Technical Architecture

### Technology Stack

**Backend**

- **Backend Framework**: FastAPI + Uvicorn
- **Database**: SQLAlchemy ORM + SQLite
- **Data Validation**: Pydantic v2
- **Configuration**: PyYAML
- **Document Export**: python-docx
- **Testing Framework**: pytest + hypothesis

**Frontend**

- **Framework**: Vue 3 + Vite
- **Component Library**: Element Plus
- **Drag Ordering**: vuedraggable + sortablejs
- **Testing Framework**: node:test + a lightweight property-test helper (testProperty.js)
- **Optional Runtime**: LibreOffice for server-side Word table-of-contents page-number precomputation; missing LibreOffice keeps non-empty fallback page numbers and Word field correction

### Project Structure

```text
CRF-Editor/
├── config.yaml.example      # Config example (all optional params); copy to config.yaml
├── backend/
│   ├── main.py              # FastAPI application entry point
│   ├── app_launcher.py      # PyInstaller desktop entry
│   ├── requirements.txt     # Python runtime dependencies
│   ├── requirements-dev.txt # Python dev / test dependencies
│   ├── src/
│   │   ├── models/          # Data model layer (SQLAlchemy ORM)
│   │   ├── repositories/    # Data access layer
│   │   ├── services/        # Business logic (import / export / ordering / cloning)
│   │   ├── routers/         # API routing layer (auth, projects, visits, forms, fields, etc.)
│   │   ├── schemas/         # Request/response schemas (Pydantic)
│   │   ├── config.py        # Config loading and atomic updates
│   │   └── database.py      # SQLite engine, sessions, and lightweight migrations
│   └── tests/               # pytest / hypothesis tests
├── frontend/
│   ├── src/
│   │   ├── components/      # Vue components
│   │   ├── composables/     # Vue composables
│   │   ├── styles/          # Global styles
│   │   └── App.vue          # Root component
│   ├── tests/               # node:test regression checks
│   ├── package.json         # Frontend dependencies and scripts
│   ├── vite.config.js       # Vite configuration
│   └── README.md            # Frontend module guide
└── assets/
    └── logos/
        └── README.md        # Static logo resource notes
```

### AI Collaboration Context

- Root context: `.claude/CLAUDE.md`
- Backend module context: `backend/.claude/CLAUDE.md`
- Frontend module context: `frontend/.claude/CLAUDE.md`
- Structured index: `.claude/index.json`

These documents support AI-assisted development by recording module boundaries, entry points, cross-stack contracts, testing strategy, and deployment security constraints. Update them when features, commands, or test entry points change.

## Installation

### Requirements

- Python 3.10 or higher
- Node.js 18 or higher (for frontend development)
- LibreOffice (optional, for server-side real page numbers in Word table-of-contents entries; without it, exported files keep non-empty fallback page numbers, and Word/WPS can correct them by updating fields)
- Windows + MS Word (optional, only required by the Word-import original-document screenshot evidence panel)

### Installation Steps

1. Clone the repository

```bash
git clone https://github.com/your-username/CRF-Editor.git
cd CRF-Editor
```

2. Create virtual environment

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# Linux / macOS
source .venv/bin/activate
```

3. Install backend dependencies

```bash
pip install -r backend/requirements.txt
```

4. Install frontend dependencies

```bash
cd frontend
npm install
```

5. (Optional) Customize configuration

Copy `config.yaml.example` in the project root to `config.yaml` and adjust as needed (the example lists every optional parameter with its default):

```bash
cp config.yaml.example config.yaml
```

The full set of optional parameters (unset fields fall back to the commented defaults; relative paths resolve against the project root):

```yaml
app:
  title: CRF编辑器                     # App title, default CRF编辑器
database:
  path: ./database/crf_editor.db       # SQLite file path, default ./crf_editor.db
storage:
  upload_path: ./uploads               # Upload directory, default ./uploads
server:
  host: 0.0.0.0                        # Listen address, default 0.0.0.0
  port: 8888                           # Listen port, default 8888
template:
  template_path: ./database/xxx.db     # Template .db path, must stay in allowlist and end with .db, default empty
ai:
  enabled: false                       # Enable AI, default false
  api_url: https://api.example.com/v1  # Endpoint URL, default empty
  api_key: sk-xxx                      # API key, default empty
  model: deepseek-chat                 # Model name, default empty
  api_format: openai                   # openai / anthropic, auto-detected when empty
  timeout: 30                          # Request timeout in seconds, default 30
admin:
  username: admin                      # Reserved admin username, default admin
  bootstrap_password: change-this-before-production  # Reserved admin bootstrap password, default empty
auth:
  secret_key: change-this-dev-only-secret  # JWT secret, dev only; production must use CRF_AUTH_SECRET_KEY
  algorithm: HS256                     # JWT algorithm, default HS256
  access_token_expire_minutes: 60      # Token TTL in minutes, 1-60, default 30
```

For public deployment, prefer the `CRF_*` environment variables listed in the root `.env.example`, especially:

- `CRF_ENV=production`
- `CRF_AUTH_SECRET_KEY=<long random secret>`
- `CRF_AUTH_ACCESS_TOKEN_EXPIRE_MINUTES=60`
- `CRF_ADMIN_BOOTSTRAP_PASSWORD=<reserved admin bootstrap password for production>`

In production mode, the backend now applies the following default hardening:

- `CRF_AUTH_SECRET_KEY` is mandatory; the YAML secret is no longer a production fallback
- `/docs`, `/redoc`, and `/openapi.json` are disabled
- baseline security headers are added to responses
- login and high-cost import endpoints are protected by a single-node in-memory rate limiter
- project logos reject SVG/XML on upload and block historical unsafe logo reads
- `template_path` must stay inside the allowlisted directories and end with `.db`

## Usage

### Start the Application

**Option 1: Production Mode** (build frontend first, then start backend)

```bash
# 1. Build frontend
cd frontend
npm run build

# 2. Start backend (serves frontend static files)
cd ../backend
python main.py
```

After starting, open `http://localhost:8888` in your browser to access the web interface.

When `CRF_ENV=production` is set:

- `/docs`, `/redoc`, and `/openapi.json` return 404
- the canonical login endpoint is `POST /api/auth/login`
- if no usable reserved admin exists, startup repairs or creates it from `CRF_ADMIN_BOOTSTRAP_PASSWORD`; startup fails fast when that value is missing
- the login endpoint and the database / Word import endpoints can return a unified 429 JSON response: `{"detail":"操作过于频繁，请稍后重试"}`, with `Retry-After`

**Option 2: Development Mode** (hot reload, run frontend and backend separately)

```bash
# Terminal 1: Start backend
cd backend
python main.py

# Terminal 2: Start frontend dev server
cd frontend
npm run dev
```

Access the frontend at `http://localhost:5173`. API requests are automatically proxied to `http://127.0.0.1:8888`.

API documentation is available at `http://localhost:8888/docs` in development mode; it is disabled in production.

**Option 3: Desktop Entry** (for packaged PyInstaller distribution)

```bash
cd backend
python app_launcher.py
```

The desktop entry launches the local backend, opens the browser automatically, and keeps a tray icon running.

### Login and Admin Migration Notes

- Authentication now uses the existing `username` + password pair through `POST /api/auth/login`.
- Legacy accounts without a password receive a migration hint in development; production returns a generic unauthorized response.
- After an administrator logs in, the app lands on a dedicated admin workspace and does not render the normal project list or CRF editing shell.
- Administrators use that workspace to set initial passwords for new users and reset passwords for legacy accounts during migration.

### Basic Workflow

1. **Admin bootstrap (first production startup)**: ensure `CRF_ADMIN_BOOTSTRAP_PASSWORD` is configured and audit the reserved admin account immediately after go-live
2. **Create Project**: Create a new clinical research project in the normal project workspace
3. **Define Visits**: Add visit nodes and set visit sequences
4. **Design Forms**: Create CRF forms in the form designer and maintain design notes
5. **Add Fields**: Select from the field library or create new fields, then configure instance-level display properties
6. **Associate Forms**: Link forms to the corresponding visit nodes and preview layouts plus eCRF / aCRF annotations from the visits page
7. **Import Data**: Run template import, project database import, or Word compare-based import when needed
8. **Export Results**: Export the project as a Word document or database template

### Word Document Export Format

The exported Word document contains:

- **Cover Page**: Trial name, version number, protocol number, center number, screening number, etc.
- **Table of Contents**: Pre-rendered entries visible on open with clickable navigation; real page numbers are baked in when exported on a server with LibreOffice, otherwise non-empty fallback numbers are shown and corrected after updating fields in Word
- **Form-Visit Distribution Diagram**: Matrix table showing form-visit associations
- **Form Content**: Detailed form field definitions and controls

## Deployment Security Notes

- On the first production startup, or whenever the reserved admin account is unusable, the app creates or repairs that account from `CRF_ADMIN_BOOTSTRAP_PASSWORD`; provide that value only in a controlled environment and rotate/reset it immediately after takeover.
- After go-live, audit the reserved admin account immediately and confirm that access to it remains constrained to controlled conditions.
- Rotate the historical repository `auth.secret_key` before deployment, and inject the new secret only through `CRF_AUTH_SECRET_KEY`.
- If you move to multi-instance deployment, replace the current single-node in-memory rate limiter with a shared-store limiter.

## Testing

### Backend
```bash
cd backend
python -m pytest
```

### Frontend
```bash
cd frontend
node --test tests/*.test.js
```

In the current repository:
- `backend/tests/` currently contains 47 Python test files (45 `test_*.py` modules plus `conftest.py` and `helpers.py`), including some `hypothesis` property tests
- `frontend/tests/` currently contains 47 frontend test files (46 `.test.js` files plus `testProperty.js`), covering source-level contracts including designer / visits aCRF annotation geometry, persistence, drag wiring, field-instance copy, and the checkbox field type
- Strict preview/export table-field parity can be checked with `backend/scripts/compare_word_table_parity.py` against browser preview JSON and the exported `.docx`

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'feat: add some feature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Create Pull Request

## License

This project is licensed under the PolyForm Strict License 1.0.0 for non-commercial use only. See LICENSE file for details.

## Contact

For questions or suggestions, please submit an Issue or Pull Request.
