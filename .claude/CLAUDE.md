# CRF Editor -- Project AI Context

> Last updated: 2026-06-23
> Keep the root-level document concise; implementation details should go into module-level documents first.

## Project Overview
- The CRF (Case Report Form) editor is used for designing, maintaining, importing, previewing, and exporting clinical research forms.
- Current architecture: FastAPI + SQLAlchemy + SQLite backend, Vue 3 + Vite + Element Plus frontend.
- The backend can host `frontend/dist` when the frontend build artifacts exist; in development mode Vite proxies `/api` to the backend.
- The desktop release entry point is at `backend/app_launcher.py`, used to start the backend locally, open the browser, and keep a system tray.
- User-facing project documentation: `README.md`, `README.en.md`.
- Detailed module descriptions: `backend/.claude/CLAUDE.md`, `frontend/.claude/CLAUDE.md`.

## Module Navigation
```mermaid
graph TD
    A["(root) CRF-Editor"] --> B["backend"];
    B --> B1["src/routers (12)"];
    B --> B2["src/services (14)"];
    B --> B3["src/models (10)"];
    B --> B4["src/schemas (6)"];
    B --> B5["src/repositories (5)"];
    B --> B6["tests (39)"];
    A --> C["frontend"];
    C --> C1["src/components (13)"];
    C --> C2["src/composables (16)"];
    C --> C3["src/styles"];
    C --> C4["tests (32)"];
    A --> D["assets/logos"];

    click B "./backend/.claude/CLAUDE.md" "View backend module docs"
    click C "./frontend/.claude/CLAUDE.md" "View frontend module docs"
```

## Module Index
| Module | Path | Tech Stack | Responsibilities | Key Entry Points | Tests |
| --- | --- | --- | --- | --- | --- |
| backend | `backend/` | FastAPI, SQLAlchemy, SQLite, Pydantic, PyJWT, passlib, python-docx | API, authentication, admin, project isolation, lightweight migrations, import/export, desktop release entry point, preview/export strict parity comparison, Word table-of-contents page number pre-calculation | `backend/main.py`, `backend/app_launcher.py` | `backend/tests/` (39 files) |
| frontend | `frontend/` | Vue 3, Vite, Element Plus, sortablejs, vuedraggable | Login, session countdown, project workbench, admin workbench, brief/full editing modes, form designer, import/export, theme and preview interaction | `frontend/src/main.js`, `frontend/src/App.vue` | `frontend/tests/` (32 files, including 31 `.test.js`) |
| assets | `assets/logos/` | Static resources | Logo sample resource notes; runtime uploads are not written to this directory | `assets/logos/README.md` | None |

## Core Capabilities
- Management of projects, visits, forms, fields, units, and option dictionaries
- User authentication, admin user management, project isolation, self-service password change for regular users
- Brief / full editing modes; in full mode, advanced identifiers such as OID / variable names are maintained uniformly
- Template library `.db` import, project `.db` import / full-database merge, Word `.docx` import comparison with screenshot evidence panel
- Form designer real-time preview, field instance quick edit, simulated CRF rendering, column width and row height dragging
- Project copy, project Logo management, Word export, database export, preview/export strict table field parity validation
- AI configuration testing, exact-first fuzzy search, session countdown with click-to-renew, theme switching, desktop packaging and release

## Key Entry Points
- Backend development entry: `backend/main.py`
- Desktop release entry: `backend/app_launcher.py`
- Backend configuration: `backend/src/config.py` (reads `config.yaml` from the project root; production prefers `CRF_*` environment variables)
- Backend database: `backend/src/database.py` (SQLite PRAGMA, Session, and lightweight migrations)
- Backend routers: `backend/src/routers/`
- Backend services: `backend/src/services/`
- Backend preview/export comparison: `backend/src/services/word_table_parity.py`, `backend/scripts/compare_word_table_parity.py`
- Backend table-of-contents page number pre-calculation: `backend/src/services/toc_pagination.py` (optional LibreOffice + `pypdf`; failure keeps non-empty fallback page numbers and Word field correction)
- Frontend entry: `frontend/src/main.js`
- Frontend application shell: `frontend/src/App.vue` (login recovery, project workbench, admin routing, global refresh, brief/full editing modes, theme and settings)
- Frontend development configuration: `frontend/vite.config.js`

## Common Commands
```bash
cd backend && python main.py
cd frontend && npm run dev
cd frontend && npm run build
cd frontend && npm run lint
cd frontend && npm run format
cd backend && python -m pytest
cd frontend && node --test tests/*.test.js
```

## Development Conventions
- Backend layering: `routers -> repositories/services -> models/schemas`.
- Put heavy logic in `backend/src/services/`, keeping the interface layer lightweight.
- Data structure evolution is centralized in the lightweight migration logic of `backend/src/database.py`.
- Put complex reusable frontend logic in `frontend/src/composables/`.
- Frontend reuse constraints: APIs go uniformly through `useApi.js`; field rendering goes uniformly through `useCRFRenderer.js`; field display attributes and preview display logic go uniformly through `formFieldPresentation.js`; user-facing fuzzy search ordering goes uniformly through `searchRanking.js`.
- When features, commands, or test entry points change, synchronously update `README.md`, `README.en.md`, the module-level `CLAUDE.md`, and `.claude/index.json`.

## Security and Deployment Constraints
- Production deployment prefers the `CRF_*` environment variables from the root `.env.example`.
- When `CRF_ENV=production`, docs are disabled, `CRF_AUTH_SECRET_KEY` must be provided, and JWT TTL must not exceed 60 minutes.
- The login, password-change, and high-cost import endpoints enable single-node in-memory rate limiting in production; the current implementation is not suitable for multi-instance deployments.
- Project Logos only allow bitmap formats; reading historical SVG/XML Logos will be rejected.
- `template_path` must be located within a whitelisted directory and be a `.db` file.
- On first startup with an empty database in production, the reserved admin account is automatically created or repaired; after going live, an admin account audit and access-surface review must be completed immediately.

## Cross-Stack Contracts
- Column width planning: the backend `backend/src/services/width_planning.py` and the frontend `frontend/src/composables/useCRFRenderer.js` must evolve in sync. Shared constants `WEIGHT_CHINESE=2`, `WEIGHT_ASCII=1`, `FILL_LINE_WEIGHT=6`, `UNDERSCORE_CHAR_CM=0.19`, `CELL_HPAD_CM=0.4`, `FILL_LINE_SAFETY_CM=0.2`, `FILL_LINE_MIN_CHARS=6`, `FILL_LINE_MAX_CHARS=80`, `FILL_LINE_EPSILON=1e-9`, `INLINE_HEADER_FLOOR=WEIGHT_CHINESE*4=8` (applies only to inline tables, protecting short headers of ≤4 characters from being squeezed by long neighbors to the point they cannot fit on a single line), `AVAILABLE_CM=14.66`. The adaptive underscore count is used directly for whole-cell text fill-lines; choice trailing underscores use the same width-derived count after subtracting the marker + label footprint so the atom stays within the column. Changing either side requires syncing the other and regenerating fixtures via `frontend/scripts/generatePlannerFixtures.mjs`.
- Column width fixtures: `backend/tests/fixtures/planner_cases.json` is output from the generator as a single source of truth, and is used simultaneously by the backend `backend/tests/test_width_planning.py` and the frontend `frontend/tests/columnWidthPlanning.test.js`.
- Ordering contract: the backend `backend/src/services/order_service.py` and the frontend `frontend/src/composables/useOrderableList.js` / `useSortableTable.js` need to keep consistent interface semantics.
- Authentication contract: the backend `backend/src/routers/auth.py`, `backend/src/services/auth_service.py` and the frontend `frontend/src/App.vue`, `frontend/src/components/LoginView.vue`, `frontend/src/components/AdminView.vue` need to be checked in sync.
- Form orientation contract: the backend `backend/src/models/form.py`, `backend/src/schemas/form.py`, `backend/src/database.py`, `backend/src/routers/forms.py`, `backend/src/services/project_clone_service.py`, `backend/src/services/project_import_service.py`, `backend/src/services/export_service.py` need to be synced with the frontend `frontend/src/components/FormDesignerTab.vue`; when `paper_orientation` changes, validate `test_form_paper_orientation.py`, `test_export_paper_orientation.py`, `test_project_copy.py` and the frontend source-level tests in sync.
- Word import screenshot evidence contract: the backend `backend/src/routers/import_docx.py`, `backend/src/services/docx_screenshot_service.py` and the frontend `frontend/src/components/DocxCompareDialog.vue`, `frontend/src/components/DocxScreenshotPanel.vue` need to keep consistent semantics for task status, page positioning, and failure prompts.
- Strict preview/export parity: the frontend `frontend/src/styles/main.css` `.wp-form-title` must keep `text-align: left`; `backend/src/services/word_table_parity.py` and `backend/scripts/compare_word_table_parity.py` are used to compare the form / row / cell text of the browser preview JSON and the exported `.docx`; see `.trellis/spec/guides/cross-stack-contracts.md` §5.

## Testing Strategy
- Backend tests use `pytest`, covering authentication, permissions, import/export, ordering, column width planning, WAL, security response headers, project isolation, batch-delete isolation, performance FK indexes, Docx screenshot failure semantics, Word table parity, and other cases.
- Frontend tests use `node:test` and introduce a self-developed lightweight property testing utility (`testProperty.js`) for property and contract validation; coverage includes the application shell, admin structure, theme, sidebar, designer column width/row height, field display, session countdown, Docx two-column preview, and export status.
- No browser-level E2E suite was found in this scan; the current regression suite is mainly based on API and source-level tests.

## AI Usage Guide
- When touching authentication, JWT, admin permissions, rate limiting, or regular-user password change, check at least these in sync: `backend/src/routers/auth.py`, `backend/src/routers/admin.py`, `backend/src/services/auth_service.py`, `backend/src/services/user_admin_service.py`, `backend/src/rate_limit.py`, `frontend/src/App.vue`, `frontend/src/components/AdminView.vue`.
- When touching import/export or Word preview, check at least these in sync: `backend/src/routers/import_docx.py`, `backend/src/routers/projects.py`, `backend/src/services/import_service.py`, `backend/src/services/project_import_service.py`, `backend/src/services/export_service.py`, `backend/src/services/word_table_parity.py`, `frontend/src/components/TemplatePreviewDialog.vue`, `frontend/src/components/DocxCompareDialog.vue`, `frontend/src/components/DocxScreenshotPanel.vue`, `frontend/src/components/SimulatedCRFForm.vue`.
- When touching column width / preview changes, you must check and update these in sync: `backend/src/services/width_planning.py`, `frontend/src/composables/useCRFRenderer.js`, `backend/tests/test_width_planning.py`, `frontend/tests/columnWidthPlanning.test.js`.
- When touching project isolation or permission boundaries, check first: `backend/src/dependencies.py`, `backend/tests/test_isolation.py`, `backend/tests/test_subresource_isolation.py`, `backend/tests/test_permission_guards.py`.

## .context Project Context

> The project uses `.context/` to manage development decision context.

- Coding standards: `.context/prefs/coding-style.md`
- Workflow rules: `.context/prefs/workflow.md`
- Decision history: `.context/history/commits.md`

**Rule**: Always read prefs/ before modifying code, and log decisions according to the rules in workflow.md when making decisions.

## Git Workflow
- **draft → main must be merged via PR**; directly running `git push origin main` is forbidden.
- Process: complete development on draft → create a PR (draft → main) → review/merge the PR → auto-sync to main.
- The `draft` branch can be pushed directly to remote; the `main` branch only accepts PR merges.

## Change Log
- `2026-06-23`: Frontend search ranking refresh. Frontend composables 15→16 (added `searchRanking.js` for exact-first fuzzy search ranking), frontend test directory 30→32 (31 `.test.js` + `testProperty.js`; added helper and wiring regressions for ranked fuzzy search). Synced README feature text, frontend module context, and code-spec guidance for reusable search ordering.
- `2026-06-18`: Documentation sync refresh. Backend services 13→14 (added and indexed `toc_pagination.py` for optional LibreOffice table-of-contents page number pre-calculation), frontend composables 14→15 (completed the count for `useDesignerHistory.js`), frontend test directory 26→30 (29 `.test.js` + `testProperty.js`; added regressions for designer undo/redo, new field drafts, full-edit-mode identifier show/hide, and header styling). Synced README environment requirements, clarifying that Word export does not strictly depend on Windows; only the Word import source screenshot evidence panel requires Windows + MS Word.
- `2026-06-14`: Documentation sync refresh. Backend services 12→13 (added `word_table_parity.py`), backend tests 37→39 (currently including batch-delete isolation, Docx screenshot failure semantics, performance FK indexes, Word table parity, and other new regressions), scripts 3→4 (added `compare_word_table_parity.py`). Frontend components 12→13 (added `SessionTimer.vue`), composables 11→14 (added `useSessionTimer.js`, `useRowResize.js`, `formDesignerPreviewModel.js`), frontend test directory 22→26 (25 `.test.js` + `testProperty.js`; added regressions related to session countdown, row height dragging, preview view model, and the Docx two-column evidence panel).
