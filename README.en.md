# CRF Editor

**English** | [中文](./README.md)

## Introduction

CRF (Case Report Form) Editor is a form design and management tool for clinical research. The system supports creating, editing, and managing various forms in clinical research projects, and can export forms to standard Word document format.

### Key Features

- **Project Management**: Create and manage clinical research projects, including trial name, protocol number, version information, etc.
- **Visit Management**: Define and manage research visit workflows, support visit sequences and form associations
- **Form Designer**: Visual form designer supporting multiple field types (text, numeric, date, radio, checkbox, etc.)
- **Field Library**: Centralized field definition management, supporting field reuse and standardization
- **Code Lists**: Manage option lists and coding dictionaries
- **Unit Management**: Centralized management of measurement units and symbols
- **Word Export**: Export forms to compliant Word documents, including cover page, table of contents, visit distribution diagram, and form content

## Technical Architecture

### Technology Stack

- **Backend Framework**: FastAPI + Uvicorn
- **Database**: SQLAlchemy ORM + SQLite
- **Data Validation**: Pydantic v2
- **Configuration**: PyYAML
- **Document Export**: python-docx
- **Testing Framework**: pytest + hypothesis

### Project Structure

```
CRF-Editor/
├── backend/
│   ├── src/
│   │   ├── models/          # Data model layer (SQLAlchemy ORM)
│   │   ├── repositories/    # Data access layer
│   │   ├── services/        # Business logic layer
│   │   │   └── export_service.py  # Word export service
│   │   ├── routers/         # API routing layer (FastAPI)
│   │   │   ├── projects.py  # Projects API
│   │   │   ├── visits.py    # Visits API
│   │   │   ├── forms.py     # Forms API
│   │   │   ├── fields.py    # Fields API
│   │   │   ├── codelists.py # Code lists API
│   │   │   ├── units.py     # Units API
│   │   │   └── export.py    # Export API
│   │   ├── schemas/         # Request/response schemas (Pydantic)
│   │   ├── config.py        # Configuration loader
│   │   └── database.py      # Database session management
│   ├── uploads/             # Uploaded files directory (auto-created)
│   ├── config.yaml          # Application config (optional)
│   ├── requirements.txt     # Python dependencies
│   └── main.py              # FastAPI application entry point
└── frontend/
    ├── src/
    │   ├── components/      # Vue components
    │   ├── composables/     # Vue composables
    │   ├── styles/          # Global styles
    │   └── App.vue          # Root component
    ├── package.json         # Frontend dependencies
    └── vite.config.js       # Vite configuration
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

Copy and edit `backend/src/config.yaml` to configure database path, upload directory, server port, etc.:

```yaml
database:
  path: crf_editor.db
storage:
  upload_path: uploads
server:
  host: 0.0.0.0
  port: 8000
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

After starting, open `http://localhost:8000` in your browser to access the web interface.

**Option 2: Development Mode** (hot reload, run frontend and backend separately)

```bash
# Terminal 1: Start backend
cd backend
python main.py

# Terminal 2: Start frontend dev server
cd frontend
npm run dev
```

Access the frontend at `http://localhost:5173`. API requests are automatically proxied to the backend on port 8000.

API documentation is available at `http://localhost:8000/docs`.

### Basic Workflow

1. **Create Project**: Create a new clinical research project in the project management interface
2. **Define Visits**: Add research visit nodes and set visit sequences
3. **Design Forms**: Create CRF forms using the form designer
4. **Add Fields**: Select from field library or create new fields, configure field properties
5. **Associate Forms**: Link forms to corresponding visit nodes
6. **Export Document**: Export project to Word document

### Word Document Export Format

The exported Word document contains:

- **Cover Page**: Trial name, version number, protocol number, center number, screening number, etc.
- **Table of Contents**: Auto-generated document TOC
- **Form-Visit Distribution Diagram**: Matrix table showing form-visit associations
- **Form Content**: Detailed form field definitions and controls

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
