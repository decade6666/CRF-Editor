[Root](../../.claude/CLAUDE.md) > **backend**

# backend Module Notes

> Last updated: 2026-06-29

## Module Responsibilities
- Provide REST APIs and the frontend static resource entry point.
- Manage SQLite data models, lightweight migrations, and connection configuration such as WAL / foreign keys.
- Execute template `.db` import, project `.db` import / full-database merge, Word `.docx` import, Word export (eCRF / aCRF), and database export.
- Provide user authentication, admin APIs, regular-user password change, project isolation, and the desktop release entry point.

## Key Entry Points
- `backend/main.py`: creates the FastAPI app, registers routers, configures exception handling and security headers, validates configuration at startup, creates upload directories, and initializes the database.
- `backend/app_launcher.py`: PyInstaller desktop entry point, injects the packaged static directory, starts Uvicorn, opens the local browser, and manages the system tray.
- `backend/src/config.py`: configuration loading, caching, and atomic updates; `config.yaml` is located in the project root, and production prefers `CRF_*` environment variables.
- `backend/src/database.py`: database engine, SQLite PRAGMA, Session, and column-level lightweight migrations.
- `backend/src/dependencies.py`: dependencies for authentication, database sessions, project permissions, and admin permissions.
- `backend/src/rate_limit.py`: single-node in-memory rate limiting, used for login, password change, and high-cost import endpoints.
- `backend/src/perf.py`: performance baseline middleware and metric collection.
- `backend/src/utils.py`: common utility functions such as path safety validation.

## Core Directories
- `src/routers/` (12 router modules): APIs for authentication, admin, projects, visits, forms, fields, dictionaries, units, import/export, and settings.
- `src/services/` (14 service modules): heavy logic for authentication, user management, import, export, ordering, project cloning, project import, AI review, Docx screenshot cache, column width planning, field rendering, Word table parity comparison, Word table-of-contents page number pre-calculation, and more.
- `src/models/` (10 ORM model files, including 11 model classes): Project, Visit, Form, VisitForm, FieldDefinition, Field, FormField, CodeList, CodeListOption, Unit, User.
- `src/schemas/` (6 Pydantic modules): request/response structures for projects, visits, forms, fields, dictionaries, units, and related resources.
- `src/repositories/` (5 repository modules): database access wrappers for base repository, projects, field definitions, field instances, form fields, and related entities.
- `tests/` (39 test files): pytest cases for authentication, admin, permissions, project isolation, batch-delete isolation, import/export, ordering, configuration, WAL, rate limiting, column width planning, performance baseline, performance FK indexes, form orientation, Word import contract, Docx screenshot failure semantics, Word table parity, and more.
- `scripts/` (4 scripts): template database migration, performance fixture generation, performance baseline run, and preview/export table field parity comparison.

## Router Overview
- `routers/auth.py`: login, current user, regular-user password change, and authentication error semantics.
- `routers/admin.py`: admin user management, password reset, batch project operations, and recycle bin.
- `routers/projects.py`: project CRUD, project copy, Logo upload/read/delete, database import/export.
- `routers/visits.py`, `routers/forms.py`, `routers/fields.py`: CRF structure maintenance.
- `routers/codelists.py`, `routers/units.py`: dictionary and unit maintenance.
- `routers/import_template.py`, `routers/import_docx.py`: template library and Word import preview/application.
- `routers/export.py`: Word export.
- `routers/settings.py`: configuration read/save and AI connectivity tests.

## Service Overview
- `auth_service.py`, `user_admin_service.py`: password hashing, JWT version invalidation, reserved admin account, and user management.
- `import_service.py`, `project_import_service.py`, `docx_import_service.py`: template, project library, and Word import.
- `export_service.py`: Word document rendering and export.
- `width_planning.py`: backend column width planning, sharing the fixture contract with frontend `useCRFRenderer.js`.
- `word_table_parity.py`: reads browser preview JSON and exported `.docx` table text to generate strict parity reports.
- `toc_pagination.py`: optionally invokes LibreOffice headless rendering to export documents and uses `pypdf` to read PDF outline page numbers; when unavailable or failed, returns an empty result while `export_service.py` keeps non-empty fallback page-number text and relies on Word field update for correction.
- `order_service.py`: ordering write logic for visits, forms, fields, and related entities.
- `project_clone_service.py`: project deep copy and Logo linkage.
- `docx_screenshot_service.py`: Word import screenshot cache lifecycle and failure state for unsupported runtimes.
- `ai_review_service.py`: AI import suggestion/review calls.
- `field_rendering.py`: field rendering helper logic.

## Database and Compatibility
- SQLite connections enable `foreign_keys=ON`, `journal_mode=WAL`, `busy_timeout=5000`, and `synchronous=NORMAL`.
- `src/database.py` handles compatibility migrations for historical databases, including backfilling `code`, `order_index`, `design_notes`, `annotation_positions`, color markers, `owner_id`, soft delete, ordering fields, and user password-related fields.
- The `form_field` structure uses a canonical column-set rebuild strategy to ensure field instance structures are consistent after old databases are upgraded.
- `form.annotation_positions` is stored as JSON text and must keep one shared validation contract across CRUD, form copy, project clone, project `.db` import, **template library import**, and aCRF export; external `.db` input with invalid JSON / invalid reserved keys must fail closed instead of being silently accepted. Mixed-column legacy templates (e.g. with `paper_orientation` but missing `annotation_positions`) must stay read-only compatible — probe the column and fall back to raw SQL single-column reads rather than ORM whole-row SELECT.
- The main entry point uniformly converts common validation errors, unique constraint conflicts, import errors, and export errors into stable JSON responses.

## Security Behavior
- In production, `/docs`, `/redoc`, and `/openapi.json` are disabled, and `CRF_AUTH_SECRET_KEY` is required.
- In production, JWT TTL must not exceed 60 minutes.
- Login, password-change, and high-cost import endpoints use single-node in-memory rate limiting.
- In production, if no available reserved admin exists, startup automatically repairs or creates one based on `admin.bootstrap_password` / `CRF_ADMIN_BOOTSTRAP_PASSWORD`; if missing, startup fails fast.
- Admin-created users must be assigned an initial password at creation; password reset invalidates old JWTs immediately through `auth_version`.
- Logo files are managed under `upload_path/logos`; only safe bitmap formats are allowed, and project copy / hard delete synchronously handles the corresponding files.
- `template_path` must be located within a whitelisted directory and be a `.db` file; the template library import path (`src/services/import_service.py`) only allows read-only access. Old templates missing `form.paper_orientation` fall back to `auto` through read-only probing; adding columns, running migrations, or implicitly creating databases on the source template library is forbidden.

## Import/Export and Column Width Contracts
- Word export table row height uses `FORM_TABLE_ROW_HEIGHT_CM = 1` as the `AT_LEAST` lower bound; cell paragraphs use `SINGLE_LINE_HEIGHT_PT = 15.6` fixed line spacing and `CELL_VPAD_PT` top/bottom spacing to support single-line 1cm rows, while multi-line content grows naturally without clipping.
- Word export table of contents uses a hybrid pre-rendered mode: `_add_toc_placeholder` only writes the "Table of Contents" title (SimSun, 12pt, bold, centered) and records an anchor; `_add_toc_heading` adds a unique `_Toc` bookmark for each heading and collects entries; `_populate_toc` runs after `_add_forms_content` and uses `_build_toc_entry` to generate each entry as a pre-rendered paragraph with bookmark hyperlink + `PAGEREF` field. **The first entry is merged into the TOC field start (`begin → instrText → separate`), and the last entry is merged into the outer `end`**, making all entries the field result between `separate→end` — therefore there is no blank line between the "Table of Contents" title and the first entry, it is visible and clickable with zero clicks, and Word replaces the whole field on update without duplication. Entry text is written in SimSun via `_apply_raw_run_font`; `_ensure_toc_styles` idempotently injects `TOC1/2/3` paragraph styles (the default template only has `TOCHeading`; otherwise dangling `pStyle` falls back to the default font and makes the layout look unlike a table of contents).
- Real table-of-contents page numbers (server side): `export_project_to_word(bake_toc_page_numbers=True)` calls `_bake_toc_page_numbers`→`services/toc_pagination.py` after saving, renders the docx to PDF with LibreOffice headless, reads the PDF outline (generated from Heading 1) to obtain page numbers for each heading, and writes them back into each entry's PAGEREF result text (`_toc_pageref_values` records `w:t` nodes by heading text). Each entry starts with a non-empty fallback page number, so if LibreOffice/pypdf is unavailable, fails, or returns an incomplete outline, the exported document keeps visible fallback page numbers and logs the fallback while retaining PAGEREF fields and `updateFields=true` for Word correction (LibreOffice and Word pagination may differ by one page). Unit tests avoid spawning LibreOffice for each case; the dedicated `test_export_toc_bakes_real_page_numbers_with_libreoffice` validates baked page numbers when LibreOffice is installed, otherwise it skips. Dependencies: `pypdf` (`requirements.txt`) + system LibreOffice (`soffice`, optional).
- `word_table_parity.py` uses `extract_docx_form_table_fields` with `_has_field_codes` to skip paragraphs containing field codes, avoiding TOC entries interfering with form title extraction.
- Vertical single-choice/multiple-choice option paragraphs must write `w:snapToGrid=0` via `export_service._disable_snap_to_grid` (`_render_vertical_choices` calls it for every option paragraph). Under section-level `w:docGrid type=lines linePitch=312` (15.6pt line grid), Word's default `snapToGrid=1` snaps paragraph `space_before=0` for the first option and `VERTICAL_OPTION_GAP_PT=3pt` for the remaining options to the full-line grid, rendering as "the gap from the first item to the second item is too large"; after disabling snapping, exact spacing is preserved and all option gaps are consistent. Any change to `docGrid` / vertical option spacing must synchronize the `snapToGrid` assertions in `test_export_unified.py` and `test_export_paper_orientation.py`. `_render_vertical_choices` also writes a `w:tcMar` top/bottom cell margin (`CELL_VPAD_PT`≈6.37pt → 127 twips) so options do not sit flush against the cell border lines; this is orthogonal to paragraph spacing (option paragraphs keep `space_before=0`/gap, rows still grow with content — see `test_export_vertical_choice_rows_can_expand_without_extra_option_padding`). Choice markers `○`/`□` are forced to SimSun for every run that contains them in `_set_run_font` (covers structured / string / default-value paths); a color-only `_set_run_font` re-color (text_color) no longer resets the run font. Horizontal choice trailing underscores use `width_planning.compute_horizontal_choice_trailing_fill_chars` (remaining column after all options) so multi-option rows do not wrap.
- Word export normal table column widths are content-driven: `export_service._build_form_table` calls `width_planning.plan_normal_table_width(fields, available_cm=14.66)`, width-aware text fill-lines use `compute_fill_line_char_count`, and choice trailing underscores use `compute_choice_trailing_fill_char_count` to subtract the marker + label footprint before writing the tail line.
- `available_cm=14.66` aligns with the original page budget; character weights and CJK extension range coverage share the same contract with frontend `useCRFRenderer.js`.
- Inline table header weight floor `INLINE_HEADER_FLOOR = WEIGHT_CHINESE * 4 = 8` (`width_planning.py`) is written into the max chain by `field_rendering.build_inline_column_demands`, protecting short headers of ≤4 characters (such as "Unchecked" / "Item" / "Unit") from being squeezed by long neighbors to the point they cannot fit on a single line; the constant must have exactly the same name and value as frontend `useCRFRenderer.js`.
- The cross-stack fixture is located at `backend/tests/fixtures/planner_cases.json`; the **single authoritative generator** is `frontend/scripts/generatePlannerFixtures.mjs`. To add/modify cases, update the generator and rerun it, then ensure both `backend/tests/test_width_planning.py` and `frontend/tests/columnWidthPlanning.test.js` pass.
- Strict preview/export parity is closed by `word_table_parity.py` and `scripts/compare_word_table_parity.py`: inputs are the browser preview JSON and exported `.docx`; output includes form order, row count, cell count, exact hit rate, and mismatch list. When modifying the Word preview / export text model, related tests must be updated in sync.

## Common Commands
```bash
cd backend && python main.py
cd backend && python -m pytest
cd backend && python -m pytest tests/test_config.py -q
cd backend && python -m pytest tests/test_auth.py tests/test_user_admin.py -q
cd backend && python scripts/compare_word_table_parity.py <preview.json> <export.docx>
```

## Development Conventions
- Layering: `routers -> repositories/services -> models/schemas`.
- Put heavy logic in `services/`, keeping the interface layer lightweight.
- Data structure evolution is maintained by lightweight migrations in `src/database.py`.
- API responses should primarily be stable JSON; error messages should preferably return Chinese `detail` values that can be displayed directly.
- When adding form `paper_orientation` (`auto/landscape/portrait`), check in sync: `Form` model, Pydantic Schema, `database.py` lightweight migration, `forms.py` copy path, `project_clone_service.py`, `project_import_service.py` old-database compatibility, and `export_service.py` orientation override logic.
- When adding or changing `form.annotation_positions`, check in sync: `Form` model typing, `schemas/form.py` parse + serialize helpers, `forms.py` create/update/copy paths, `project_clone_service.py`, `project_import_service.py` legacy patch + fail-closed validation, `import_service.py` template import passthrough + mixed-column read-only compatibility, `routers/import_template.py` route-level fail-closed JSON, and `export_service.py` annotation offset loading. Tests must cover API round-trip, copy/clone, project `.db` import rejection/preservation, template import preservation/rejection/legacy-fallback, and annotated export.
- When modifying authentication, admin, rate limiting, project isolation, import paths, or Logo handling, security tests need to be supplemented in sync.
- When modifying import/export or column width planning, backend tests, frontend contract tests, and root/module-level documentation need to be updated in sync.

## Related File List
| Category | Files |
|------|------|
| Entry | `main.py`, `app_launcher.py` |
| Infrastructure | `src/config.py`, `src/database.py`, `src/dependencies.py`, `src/rate_limit.py`, `src/perf.py`, `src/utils.py` |
| Routers | `src/routers/auth.py`, `src/routers/admin.py`, `src/routers/projects.py`, `src/routers/visits.py`, `src/routers/forms.py`, `src/routers/fields.py`, `src/routers/codelists.py`, `src/routers/units.py`, `src/routers/export.py`, `src/routers/settings.py`, `src/routers/import_template.py`, `src/routers/import_docx.py` |
| Services | `src/services/auth_service.py`, `src/services/user_admin_service.py`, `src/services/import_service.py`, `src/services/project_import_service.py`, `src/services/docx_import_service.py`, `src/services/export_service.py`, `src/services/width_planning.py`, `src/services/word_table_parity.py`, `src/services/toc_pagination.py`, `src/services/order_service.py`, `src/services/project_clone_service.py`, `src/services/docx_screenshot_service.py`, `src/services/ai_review_service.py`, `src/services/field_rendering.py` |
| Models | `src/models/project.py`, `src/models/visit.py`, `src/models/form.py`, `src/models/visit_form.py`, `src/models/field_definition.py`, `src/models/field.py`, `src/models/form_field.py`, `src/models/codelist.py`, `src/models/unit.py`, `src/models/user.py` |
| Schemas | `src/schemas/project.py`, `src/schemas/visit.py`, `src/schemas/form.py`, `src/schemas/field.py`, `src/schemas/codelist.py`, `src/schemas/unit.py` |
| Repositories | `src/repositories/base_repository.py`, `src/repositories/project_repository.py`, `src/repositories/field_definition_repository.py`, `src/repositories/field_repository.py`, `src/repositories/form_field_repository.py` |
| Tests (new/recent) | `tests/test_batch_delete_isolation.py`, `tests/test_docx_screenshot_service.py`, `tests/test_perf_fk_indexes.py`, `tests/test_word_table_parity.py`, `tests/test_form_paper_orientation.py`, `tests/test_export_paper_orientation.py`, `tests/test_docx_import_contract.py` |

## Change Log
- `2026-06-30`: Form-level `annotation_positions` is now treated as a shared persistence contract rather than an export-only detail. `database.py` adds the lightweight migration, `schemas/form.py` owns the shared parse/serialize helpers (string storage now canonicalized via `serialize_annotation_positions` so copy/clone/project `.db` import/template import all clamp + canonicalize on write), `forms.py` create/update/copy and `project_clone_service.py` / `project_import_service.py` all validate before persistence, `import_service.py` template import now passes through `annotation_positions` via `preserve_annotation_positions_storage` with mixed-column legacy read-only compatibility (column probe + raw SQL single-column fallback, mirroring `paper_orientation`), `routers/import_template.py` converts service `ValueError` into 400 JSON, and `export_service.py` now fails closed on invalid stored annotation JSON instead of silently ignoring it. Added backend contract regressions covering API round-trip, copy/clone, project `.db` import preservation/rejection, template import preservation/rejection/legacy-fallback, mixed-column preview tolerance, route-level fail-closed JSON, permission guards, legacy patching, and annotated export failure semantics.
- `2026-06-29`: aCRF Word export is now implemented on top of the existing eCRF pipeline. `routers/export.py` accepts `annotated` and returns `_aCRF.docx` filenames, while `export_service.py` injects floating DrawingML OID/domain annotation boxes (`w:r > w:drawing > wp:anchor > wps:wsp > wps:txbx`) without polluting `word_table_parity` text extraction. Added `tests/test_export_acrf.py` plus signature sync updates in orientation / validation / perf contract tests; a regression assertion now hard-locks the required `w:drawing` wrapper so malformed OOXML no longer slips through.
- `2026-06-21`: Word export TOC fallback now writes non-empty fallback page numbers when LibreOffice/`pypdf` baking is unavailable, failed, or incomplete; PAGEREF fields and `updateFields=true` remain for Word correction, and fallback logs are emitted without blocking export.
- `2026-06-18`: Documentation sync refresh. Service modules 13→14 (added `toc_pagination.py` to the count and related file list), clarified that Word export table-of-contents page number pre-calculation depends on optional LibreOffice + `pypdf`, and falls back to Word field update on failure; added the historical `Field` model to the model list to avoid inconsistency between 10 model files and the model name list.
- `2026-06-16` (task `06-16-word-export-toc-autofill`): Word export table of contents changed to a hybrid pre-rendered mode. `_add_toc_placeholder` only writes the TOC field shell (`begin → instrText → separate`), new `_add_toc_heading` adds a unique `_Toc` bookmark for headings and collects entries, new `_populate_toc` runs after `_add_forms_content` to generate each heading as a pre-rendered paragraph with bookmark hyperlink + `PAGEREF` field, as the TOC field result (entries are placed between `separate` and `end`, and the outer `end` is appended to the end of the last entry paragraph), ensuring zero-click visibility and preventing duplication when Word updates fields. Added `_enable_update_fields_on_open` to write `w:updateFields=true` into `settings.xml`, used only to refresh the PAGEREF page numbers of pre-rendered entries. `word_table_parity.py` added `_has_field_codes` to skip paragraphs containing field codes and avoid TOC entries interfering with form title extraction. No section/table added; strict parity remains correct. Compared with standard eCRF, TOC appearance was fixed: added `_apply_raw_run_font` to write SimSun to raw entry runs, `_ensure_toc_styles` idempotently injects `TOC1/2/3` paragraph styles, and page number placeholders were changed from `?` to blank (filled with real page numbers after Word updates fields). Subsequent fixes based on the user's three feedback points: ① the "Table of Contents" title remains SimSun 12pt bold (confirmed already satisfied, unchanged); ② removed two blank lines between title and TOC — `_add_toc_placeholder` changed to only write the title + record anchor, added `_build_toc_entry` helper, `_populate_toc` merges the TOC field start into the first entry and the outer `end` into the last entry, so title and first entry are directly adjacent; ③ server-side baked real page numbers — added `services/toc_pagination.py` (LibreOffice headless render docx→PDF, read PDF outline page numbers) and `_bake_toc_page_numbers`, `export_project_to_word(bake_toc_page_numbers=...)` defaults to False (unit-test safe), route layer passes True (enabled in production), failures/missing LibreOffice gracefully fall back to blank + Word field update. Added dependency `pypdf`, with optional system dependency LibreOffice.
- `2026-06-16` (task `06-16-word-vchoice-option-gap`): fixed Word export vertical option "first-to-second item gap too large". Root cause was `docGrid` (15.6pt line grid) + Word default `snapToGrid=1` snapping paragraph `space_before` to a whole-line grid, while the stored paragraph spacing was already consistent. Added `export_service._disable_snap_to_grid` (ordered insertion of `w:snapToGrid=0`, idempotent), called for each option paragraph in `_render_vertical_choices`; `test_export_unified.py` and `test_export_paper_orientation.py` added XML assertions for `snapToGrid=0`. Text and strict parity unchanged.
- `2026-06-14`: Word export table row height changed from fixed `EXACTLY` 1cm to `AT_LEAST` 1cm lower bound, and fixed 15.6pt line spacing plus cell top/bottom spacing are used to guarantee 1cm single-line rows without clipping multi-line content; `test_export_paper_orientation.py` added docx XML regression assertions.
- `2026-06-14`: Documentation sync refresh. Service modules 12→13 (added `word_table_parity.py`), tests 37→39, scripts 3→4 (added `compare_word_table_parity.py`); added notes for batch-delete owner isolation, Docx screenshot unsupported-runtime failure state, performance FK index idempotent migration, and strict preview/export parity.
- `2026-05-08 18:26:34`: Incremental scan refresh. Tests 34→37 files, added `test_form_paper_orientation.py`, `test_export_paper_orientation.py`, `test_docx_import_contract.py`; updated related file list and directory entries.
- `2026-05-08`: Added `form.paper_orientation` field, lightweight migration, copy/import compatibility, and Word export orientation override; added related backend tests.
- `2026-04-28 Tuesday 08:31:55 PDT`: Full scan refresh. Source 53 files (routers 12, services 12, models 10, schemas 6, repositories 5, infrastructure 8), tests 34 files, scripts 4 files. Added infrastructure and service entries.
- `2026-04-27 Monday 05:45:45 PDT`: Initial generation.
