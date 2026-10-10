# CRF Editor

**English** | [中文](./README.md)

## Introduction

CRF (Case Report Form) Editor is a form design and management tool for clinical research. The system supports creating, editing, and managing various forms in clinical research projects, and can export forms to standard Word document format.

### Key Features

- **Project and Access Management**: Create and manage clinical research projects with account-password login, admin user management, project isolation, and a dedicated admin workspace
- **Visit Management**: Define and manage research visit workflows, support visit sequences and form associations, and maintain visit-form mappings through an in-page visit-flow workspace with matrix / single-visit views
- **Form Designer**: Full-screen visual form designer supporting multiple field types (text, numeric, date, radio, multi-select, single checkbox, etc.), drag sorting, and design notes; date-time / time fields support hour-only formats (date-time `yyyy-MM-dd HH`, time `HH` / `hh AP`)
- **Live Preview & Quick Edit**: The designer provides a live preview and supports double-clicking previewed fields to quickly edit instance properties such as labels, colors, inline layout, and default values; copying a regular field first creates a local draft that is persisted only after Save, while log-row copies remain immediate because log rows are not field-library definitions; in complete mode, both the designer and the visits form preview can switch between eCRF / aCRF views, and the aCRF field OID / form-domain annotations support vertical dragging, persisted positions, and export-matched styling
- **Field Library / Code Lists / Units**: Centralized management of reusable field definitions, option dictionaries, and measurement units; in the field library, single-/multi-choice fields can add or edit the referenced option dictionary inline without switching to the code-list page; a single checkbox is codelist-free, can define checkbox text (defaulting to `✔` when empty), and renders as `field label | □checkbox text` in previews and Word exports
- **List Ordering and Ordinal Quick Edit**: Code lists, options, units, fields, visits, visit-form relations, and the form list in the designer all support drag ordering; double-clicking the ordinal cell opens direct target-position input backed by the existing reorder endpoints
- **Simple / Complete Edit Modes**: Hide advanced identifiers such as OIDs and variable names by default, and expose them consistently in complete edit mode; form / field / codelist OIDs are restricted at edit time to letters, digits, `-`, `_`, `.` only — invalid characters are blocked immediately without rewriting existing data, while codelist option codes are free-form like labels
- **Import Flows**: Supports template `.db` import, project database import / full-database merge import, and Word `.docx` compare-based import preview with an original-document screenshot evidence panel; Word import AI review suggestions can be accepted selectively at three levels (per suggestion / per form / all, default off), and the "import effect" preview reflects accepted field types in real time; unfinished Word-import uploads and project-database import temp files left by an interrupted process are automatically cleaned up after 24 hours by default
- **Template Field Search**: In complete edit mode, a read-only non-modal draggable "Template Field Search" dialog cross-references all usable template-library fields by OID / label / source-form OID (label-type fields, log rows, and soft-deleted projects are excluded automatically); results rank in four groups (field exact/substring > form-OID exact/substring > field fuzzy > form-OID fuzzy) reusing the shared fuzzy rules, the source column shows inline multi-line "form OID + form name" (name only when the OID is missing, "library only" for library-only definitions); sources are read-only, while clicking a populated cell in any other column copies its content
- **Export Flows**: Supports Word export (eCRF / aCRF) and database export; Word export includes a short-term rate limit and width-adaptive fill lines, pre-rendered table-of-contents entries with real page numbers when LibreOffice is available, and aCRF floating OID / domain annotation boxes that do not disturb eCRF table text; preview and export share the same annotation geometry and red visual style, and a strict preview/export table-field parity comparator is included
- **Project Copy and Logo Handling**: Supports deep project copy and runtime logo upload / copy / delete coordination
- **Form Preview**: Preview form field layout directly from the visits management panel, reuse the Word-preview row-height resize experience, and show export-matched persistent annotations in aCRF view; the visits preview and the designer preview now share a fixed A4 page, and aCRF red annotation boxes default to vertical-center alignment within the cell
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
- **Testing Framework**: node:test + a lightweight property-test helper (testProperty.js); vitest + @vue/test-utils + happy-dom component mount tests (`tests/component/`)
- **Optional Runtime**: LibreOffice — required by the Word-import original-document screenshot panel on Linux/macOS, and also used for server-side Word table-of-contents page-number precomputation; missing LibreOffice keeps the screenshot panel unavailable and non-empty fallback page numbers with Word field correction

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
│   ├── tests/               # node:test regression checks + tests/component/ vitest mount tests
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
- Node.js: building the frontend alone needs `^20.19.0 || >=22.12.0` (required by Vite 7); full frontend development including the vitest 5 component mount tests needs `^22.12.0 || ^24.0.0 || >=26.0.0`
- LibreOffice (required by the Word-import original-document screenshot evidence panel on Linux/macOS, e.g. `sudo apt install libreoffice-writer-nogui` on Ubuntu/Debian; also used for server-side real page numbers in Word table-of-contents entries — without it the screenshot panel is unavailable and exported files keep non-empty fallback page numbers that Word/WPS can correct by updating fields)
- Windows + MS Word (optional, the Windows render backend of the Word-import screenshot evidence panel; requires additionally installing `pywin32` and `docx2pdf`, or LibreOffice can be used instead)

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
recycle_bin:
  interval_minutes: 60                 # Cleanup polling interval in minutes, 1-1440, default 60
  min_retain_hours: 24                 # Minimum retain window for size cleanup in hours, 0 disables the guard
  age:
    enabled: false                     # Enable age-based cleanup, default false
    value: 30                          # Threshold, >=1, default 30
    unit: day                          # day / month / year; month=30 days, year=365 days
  size:
    enabled: false                     # Enable recycle-bin total estimated-size cleanup, default false
    value: 500                         # Threshold, >=1, default 500
    unit: MB                           # MB / GB; size is estimated, not the real DB-file delta
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

### Recycle-Bin Auto Cleanup

The admin workspace recycle bin now supports configurable auto-cleanup policies (disabled by default; stored under the root `config.yaml` `recycle_bin` section):

- **Age rule**: permanently delete recycled projects whose `deleted_at` is older than N days / months / years (`month=30 days`, `year=365 days`; no calendar-month / leap-year math)
- **Size rule**: when the **total estimated size** of all projects in the recycle bin exceeds N MB / GB, permanently delete the oldest-deleted projects one by one until the total falls back under the threshold
- **Minimum retain window**: the size rule can additionally protect recently deleted projects for a configured number of hours; `0` disables this guard
- **Preview before save**: admins can run a dry preview to see which projects would be removed before enabling or saving a policy

Notes:

- The displayed "size" is an estimate derived from the project graph and logo files; it is **not** the true on-disk SQLite file delta
- Auto cleanup performs **irreversible hard deletes**; use the preview and confirmation flow before enabling it
- The cleanup loop is an **in-process single-instance background task**; like the login/import rate limiter, it is not intended for multi-instance deployments sharing one SQLite database

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

> To deploy the frontend under a subpath (e.g. `/crf/`, sharing a domain with other sites), build with a subpath base instead: `cd frontend && VITE_BASE_PATH=/crf/ npm run build`, and strip the `/crf/` prefix in the Nginx reverse proxy before forwarding to the backend. Default builds only serve root-path `/assets/...`; desktop packaging must use a default build (see the Option 3 warning).

When `CRF_ENV=production` is set, uvicorn automatically disables hot reload (suitable for long-running processes); for background execution with automatic startup on boot, use the "Production Deployment (Linux / systemd)" section below.

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

> ⚠️ Before packaging, build the frontend with the **default root path** (i.e. `cd frontend && npm run build`, without `VITE_BASE_PATH`). The desktop entry serves static files from `http://127.0.0.1:8888/` directly; a subpath build would make the page request `/crf/assets/...` and render blank.

### Login and Admin Migration Notes

- Authentication now uses the existing `username` + password pair through `POST /api/auth/login`.
- Legacy accounts without a password receive a migration hint in development; production returns a generic unauthorized response.
- After an administrator logs in, the app lands on a dedicated admin workspace and does not render the normal project list or CRF editing shell.
- The admin workspace header offers a "User Management / Organization Management" switch: user management keeps users, batch project operations, recycle bin and cleanup policy; organization management maintains org presets in a full-width table with dialog editing, shows an immediate Logo thumbnail after upload, and supports click-to-zoom preview; both pages share the wide shell and switch without re-fetching data or logos thanks to KeepAlive.
- Administrators use that workspace to set initial passwords for new users and reset passwords for legacy accounts during migration.

### Basic Workflow

1. **Admin bootstrap (first production startup)**: ensure `CRF_ADMIN_BOOTSTRAP_PASSWORD` is configured and audit the reserved admin account immediately after go-live
2. **Create Project**: Create a new clinical research project in the normal project workspace
3. **Define Visits**: Add visit nodes and set visit sequences
4. **Design Forms**: Create CRF forms in the form designer and maintain design notes
5. **Add Fields**: Select from the field library or create new fields; copying a regular field creates a local draft in the designer and persists it only after Save, then configure instance-level display properties
6. **Associate Forms**: Link forms to the corresponding visit nodes and preview layouts plus eCRF / aCRF annotations from the visits page
7. **Import Data**: Run template import, project database import, or Word compare-based import when needed
8. **Export Results**: Export the project as a Word document or database template

### Word Document Export Format

The exported Word document contains:

- **Cover Page**: Trial name, version number, protocol number, center number, screening number, etc.
- **Table of Contents**: Pre-rendered entries visible on open with clickable navigation; real page numbers are baked in when exported on a server with LibreOffice, otherwise non-empty fallback numbers are shown and corrected after updating fields in Word
- **Form-Visit Distribution Diagram**: Matrix table showing form-visit associations
- **Form Content**: Detailed form field definitions and controls

## Production Deployment (Linux / systemd)

For long-running Linux servers: the service is managed by systemd — it runs in the background, restarts automatically after crashes, starts automatically on server boot, and all logs go to journald.

> Architecture constraint: the backend uses SQLite (WAL mode) and a single-node in-memory rate limiter, so it **must run as a single process / single instance** and does not support horizontal scaling; do not start multiple instances manually with `python main.py` either, as that causes database write conflicts or port collisions.

### One-time Preparation

```bash
# 1. Build the frontend (the backend serves the frontend/dist static files)
cd frontend
npm ci && npm run build

# 2. Create a virtualenv and install backend dependencies (the script also does this; can be skipped)
cd ..
python3 -m venv backend/.venv-linux
backend/.venv-linux/bin/python -m pip install -r backend/requirements.txt

# 3. Install the document render backend LibreOffice (required by the Word-import screenshot panel; without it the panel is unavailable and TOC page numbers fall back to Word field correction; effective immediately, no service restart needed for screenshots)
sudo apt install -y libreoffice-writer-nogui fonts-noto-cjk   # Ubuntu/Debian; install CJK fonts too when the server has no Windows fonts
```

### One-click Installation

```bash
sudo bash deploy/install-service.sh
```

The first run generates `/etc/crf-editor/crf-editor.env` (filling in a random `CRF_AUTH_SECRET_KEY`) and asks you to edit that file:

```bash
sudo vi /etc/crf-editor/crf-editor.env   # set CRF_ADMIN_BOOTSTRAP_PASSWORD (reserved admin initial password)
sudo bash deploy/install-service.sh      # run again to finish installation
```

The script renders `deploy/crf-editor.service.template` to `/etc/systemd/system/crf-editor.service`, runs `systemctl enable --now`, and prints the service status.

### Manual Installation (without the script)

```bash
# 1. Prepare the env file (must include CRF_ENV=production, CRF_AUTH_SECRET_KEY, CRF_ADMIN_BOOTSTRAP_PASSWORD)
sudo mkdir -p /etc/crf-editor
sudo cp deploy/crf-editor.env.example /etc/crf-editor/crf-editor.env
sudo vi /etc/crf-editor/crf-editor.env

# 2. Render the systemd unit (replace the placeholders with real paths)
APP_DIR="$PWD"
PY="$PWD/backend/.venv-linux/bin/python"
sed -e "s#__APP_DIR__#${APP_DIR}#g" -e "s#__PYTHON_BIN__#${PY}#g" \
    deploy/crf-editor.service.template | sudo tee /etc/systemd/system/crf-editor.service

# 3. Enable and start
sudo systemctl daemon-reload
sudo systemctl enable --now crf-editor
```

### Daily Operations

| Action | Command |
| --- | --- |
| Check status | `systemctl status crf-editor` |
| Follow logs | `journalctl -u crf-editor -f` |
| Restart / stop | `systemctl restart crf-editor` / `systemctl stop crf-editor` |
| Log retention | `sudo journalctl --vacuum-time=30d` |

The service uses `Restart=always`, so crashed processes are pulled back up automatically; logs consume disk space by default, so clean them up periodically as shown above.

### Exposing the Service (choose one)

**Option A: expose the port directly**

Keep `CRF_SERVER_HOST=0.0.0.0` in `/etc/crf-editor/crf-editor.env`, allow `CRF_SERVER_PORT` (default 8888) in the firewall, then access `http://<server-ip>:8888`.

**Option B: Nginx reverse proxy (recommended for public access)**

1. Change `CRF_SERVER_HOST` to `127.0.0.1` so the backend listens on loopback only
2. Configure the reverse proxy following `deploy/nginx/crf-editor.conf.example` (includes large upload `client_max_body_size` and long-request timeouts), run `nginx -t`, then `nginx -s reload`
3. If ports 80/443 are already used by a panel such as 1panel / openresty, add the reverse-proxy site through the panel's website feature instead of placing Nginx config files directly

> Note: whichever option you use, stop any manually started instance (`nohup` / `python main.py`) before enabling the service, or you will hit a port conflict.

**Subpath deployment (shared domain, e.g. `/crf/`)**

When the domain root is occupied by another site and CRF must live under a subpath:

1. Build the frontend with the subpath base (lazy-loaded chunks need the `/crf/` prefix, otherwise they fall through to same-named resources on the root-path site):
   ```bash
   cd frontend && VITE_BASE_PATH=/crf/ npm run build
   ```
2. In Nginx, follow the "Subpath deployment" comment block at the end of `deploy/nginx/crf-editor.conf.example`:
   ```nginx
   location = /crf { return 301 /crf/; }          # redirect the bare path to the trailing slash
   location /crf/ {
       proxy_pass http://127.0.0.1:8888/;         # trailing slash required: strips the /crf/ prefix
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       client_max_body_size 100m;
       proxy_read_timeout 600s;
   }
   ```
   All API requests also carry the `/crf/api/...` prefix and reach the backend at `/api/...` after the prefix is stripped — no backend change is needed. Do not also point a root-path `location /` at CRF on the same domain, or resources will cross-talk.

   > Security note: `localStorage` is isolated by origin (scheme + host + port), not by path. Any other site on the same domain root can read CRF's `crf_token` login token. Before subpath deployment, ensure same-domain sites are trusted, or prefer a dedicated subdomain.

### Upgrade Flow

```bash
git pull
cd frontend && npm ci && npm run build   # for subpath deployment: VITE_BASE_PATH=/crf/ npm run build
cd ../backend && <venv-python> -m pip install -r backend/requirements.txt
sudo systemctl restart crf-editor
```

### Backup

State to back up: `database/` (SQLite database), `uploads/` (project logos and other uploads), and `config.yaml` / `/etc/crf-editor/crf-editor.env` (configuration and secrets).

Because SQLite runs in WAL mode, copying `*.db` alone misses unmerged data in the `-wal` / `-shm` files. Either stop the service first (`systemctl stop crf-editor`) and copy the whole `database/` directory, or use `sqlite3 database/crf_editor.db ".backup '/backup/path/crf_editor.db'"` for an online backup without downtime.

### Uninstall

```bash
sudo bash deploy/install-service.sh uninstall
```

The script only stops and removes the service; it **keeps** `/etc/crf-editor/`, `database/`, `uploads/` and other data and configuration so you can reinstall later.

Security hardening items before go-live (reserved admin bootstrap and audit, secret rotation, multi-instance limits, etc.) are covered in "Deployment Security Notes" below.

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

The backend test session is hermetic: database, upload, screenshot, and Word-import temp paths are all redirected to a system temp directory and cleaned up automatically. Config sources are isolated too: the test process never reads the repo-root `config.yaml` and never inherits `CRF_*` config-override variables from the developer shell (except the three conftest forces), so a fresh checkout needs no `config.yaml` or pre-seeded database to run the full backend suite.

Coverage (statistics only, no gate):
```bash
cd backend
python -m pytest --cov=src --cov=main --cov-report=term-missing:skip-covered
```

### Frontend
```bash
cd frontend
npm test                    # node --test tests/*.test.js && vitest run (either failure fails the script)
npm run test:component      # run only the vitest component mount tests
node --test tests/*.test.js # run only the node:test source-level suite
```

The two suites are disjoint and can run independently:
- `tests/*.test.js`: `node --test` source-level regression checks (flat in the `tests/` root)
- `tests/component/**/*.spec.js`: vitest + @vue/test-utils + happy-dom component mount tests (real component rendering with interaction assertions, sharing the `tests/component/setup.js` global registration and mock conventions; includes a Vue-warning gate — any Vue warning during a test, including during unmount, fails that test, implemented in `tests/component/vueWarnGate.js`)

In the current repository:
- `backend/tests/` currently contains 63 Python test files (61 `test_*.py` modules plus `conftest.py` and `helpers.py`), including some `hypothesis` property tests
- `frontend/tests/` currently contains 75 frontend test files (68 node:test `.test.js` files plus `testProperty.js`, plus 6 vitest component-mount test files under `tests/component/` — 4 `.spec.js` files, a shared `setup.js`, and `vueWarnGate.js`), covering source-level contracts including designer / visits aCRF annotation geometry, persistence, drag wiring, field-instance copy, the checkbox field type, OID charset validation wiring, Units/Visits right-side property cards, admin org dialog editing, and the `useApi` session-token race guard
- Strict preview/export table-field parity can be checked with `backend/scripts/compare_word_table_parity.py` against browser preview JSON and the exported `.docx`

### Pre-commit Gate

The repository ships a versioned `.githooks/pre-commit` hook that runs four checks automatically before every `git commit` (target: a few seconds; no test suites or builds):

1. gitleaks staged-secret scan (rules and allowlist live in the repo-root `.gitleaks.toml`; if gitleaks or that config file is missing, the hook fails and blocks the commit);
2. `git diff --cached --check` for whitespace errors and conflict markers;
3. `python3 -m py_compile` syntax check on each staged `.py` file;
4. `ruff format --check` on staged `.py` files when `ruff` is available on PATH (skipped with a one-line notice when absent; enabled automatically once installed).

Enable it (once per development machine):

```bash
git config core.hooksPath .githooks
```

Notes:

- The setting is stored in `.git/config` and is **shared by all worktrees** of this repository — enabling it in one worktree routes commits in every other worktree through the hook as well.
- gitleaks must be installed first: download the single binary for your platform from the [gitleaks GitHub releases](https://github.com/gitleaks/gitleaks/releases) and place it at `~/.local/bin/gitleaks` (make sure `~/.local/bin` is on PATH).
- `git commit --no-verify` can bypass the hook in an emergency, but must not be used routinely; for gitleaks false positives, follow the allowlist process in `.gitleaks.toml`.

### Backend Code Formatting (ruff format)

The backend uses the [ruff](https://docs.astral.sh/ruff/) formatter to keep code style uniform (format only; no lint rules are enabled):

- The version is pinned in `backend/requirements-dev.txt` (`ruff==0.16.10`); configuration lives in `backend/ruff.toml` (line length 120, double quotes).
- Format and check:

```bash
cd backend && python -m ruff format .          # format
cd backend && python -m ruff format --check .  # check only (exit code 1 = files need formatting; other non-zero = runtime/config error)
```

- On 2026-10-09 a single format-only commit (no semantic changes) unified every Python file under `backend/` (134 files, 17 of which also had legacy CRCRLF line endings normalized); that commit is registered in the repo-root `.git-blame-ignore-revs`, and after running the command below `git blame` skips it automatically, keeping line-level history readable:

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

- The pre-commit hook's 4th check requires `ruff` on PATH: it is skipped with a one-line notice when absent and enabled automatically once installed; "would be reformatted" (exit code 1) and runtime errors (any other non-zero) are reported separately.

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
