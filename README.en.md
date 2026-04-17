# CRF Editor

**English** | [中文](./README.md)

## Introduction

CRF (Case Report Form) Editor is a form design and management tool for clinical research. The system supports creating, editing, and managing various forms in clinical research projects, and can export forms to standard Word document format.

### Key Features

- **Project and Access Management**: Create and manage clinical research projects with login, admin user management, and project isolation
- **Visit Management**: Define and manage research visit workflows, support visit sequences and form associations, and batch-edit visit-form mappings in matrix form
- **Form Designer**: Full-screen visual form designer supporting multiple field types (text, numeric, date, radio, checkbox, etc.), drag sorting, and design notes
- **Live Preview & Quick Edit**: The designer provides a live preview at the bottom and supports double-clicking previewed fields to quickly edit instance properties such as labels, colors, inline layout, and default values
- **Field Library / Code Lists / Units**: Centralized management of reusable field definitions, option dictionaries, and measurement units
- **Import Flows**: Supports template `.db` import, project database import / full-database merge import, and Word `.docx` compare-based import preview
- **Export Flows**: Supports Word export and database export; Word export includes a short-term rate limit to prevent repeated triggers
- **Project Copy and Logo Handling**: Supports deep project copy and runtime logo upload / copy / delete coordination
- **Form Preview**: Preview form field layout directly from the visits management panel
- **AI and Settings**: Supports AI endpoint configuration, connectivity testing, and import / export related settings
- **Global Fuzzy Search and Dark Mode**: Built-in search boxes in all five tabs (Projects, Visits, Forms, Fields, Code Lists) plus light / dark theme switching
- **Desktop Distribution**: Supports PyInstaller packaging, auto-opening the browser, and running from a system tray icon

## Technical Architecture

### Technology Stack

- **Backend Framework**: FastAPI + Uvicorn
- **Database**: SQLAlchemy ORM + SQLite
- **Data Validation**: Pydantic v2
- **Configuration**: PyYAML
- **Document Export**: python-docx
- **Testing Framework**: pytest + hypothesis

### Project Structure

```text
CRF-Editor/
├── config.yaml              # Application config (optional, at project root)
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

## Installation

### Requirements

- Python 3.10 or higher
- Node.js 18 or higher (for frontend development)
- Windows OS (for Word export functionality)

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

Edit `config.yaml` in the project root to configure database path, upload directory, server port, etc.:

```yaml
database:
  path: crf_editor.db
storage:
  upload_path: uploads
server:
  host: 0.0.0.0
  port: 8888
```

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

API documentation is available at `http://localhost:8888/docs`.

**Option 3: Desktop Entry** (for packaged PyInstaller distribution)

```bash
cd backend
python app_launcher.py
```

The desktop entry launches the local backend, opens the browser automatically, and keeps a tray icon running.

### Basic Workflow

1. **Create Project**: Create a new clinical research project in the project management interface
2. **Define Visits**: Add visit nodes and set visit sequences
3. **Design Forms**: Create CRF forms in the form designer and maintain design notes
4. **Add Fields**: Select from the field library or create new fields, then configure instance-level display properties
5. **Associate Forms**: Link forms to the corresponding visit nodes and preview layouts from the visits page
6. **Import Data**: Run template import, project database import, or Word compare-based import when needed
7. **Export Results**: Export the project as a Word document or database template

### Word Document Export Format

The exported Word document contains:

- **Cover Page**: Trial name, version number, protocol number, center number, screening number, etc.
- **Table of Contents**: Auto-generated document TOC
- **Form-Visit Distribution Diagram**: Matrix table showing form-visit associations
- **Form Content**: Detailed form field definitions and controls

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
- `backend/tests/` uses `pytest`, including some `hypothesis` property tests
- `frontend/tests/` uses `node:test` for source-level regression checks

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
