# Tasks: FastAdmin Migration [ARCHIVED]

> **Status**: Archived (2026-03-23) — All tasks pending, implementation deferred.
> Zero-decision executable tasks. All architecture decisions resolved in design.md.
> Implementation order: Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5.

## Phase 1: Foundation

- [x] 1.1 Create MySQL database and configure FastAdmin DB connection in `application/database.php`
- [x] 1.2 Write MySQL migration SQL for all 10 tables per `specs/database.md` schema definitions
- [x] 1.3 Execute migration SQL and verify all tables created with correct indexes and FK constraints
- [x] 1.4 Create `app/common/library/WeighService.php` with insert/move/remove/batchReorder/compress methods using two-phase algorithm and transactions
- [x] 1.5 Create `app/common/library/ReferenceCheckService.php` covering all FK paths in coverage matrix
- [x] 1.6 Create base Model files: `Project.php`, `Visit.php`, `Form.php`, `Field.php`, `Fielddefinition.php`, `Formfield.php`, `Visitform.php`, `Codelist.php`, `CodelistOption.php`, `Unit.php` in `app/common/model/` with relations per `specs/models.md`
- [x] 1.7 Configure FastAdmin menu entries for all 11 controllers via admin panel or SQL insert into `fa_auth_rule`
- [x] 1.8 Add Chinese language pack files `application/admin/lang/zh-cn/*.php` for all modules

## Phase 2: Simple CRUD Modules

- [x] 2.1 Run `php think crud -t fa_project -c Project` and verify generated Controller/View/JS/Lang artifacts
- [x] 2.2 Customize `Project` controller: add active-data uniqueness check on name/code, enable logo upload, add weigh sort, enable recyclebin
- [x] 2.3 Customize `project/index.html` view: add logo image column, description column, action buttons
- [x] 2.4 Run `php think crud -t fa_visit -c Visit` and verify artifacts
- [x] 2.5 Customize `Visit` controller: scope to project_id, active-data uniqueness, add `copy()` method (duplicate with `_copy` suffix), weigh sort
- [x] 2.6 Run `php think crud -t fa_unit -c Unit` and verify artifacts
- [x] 2.7 Customize `Unit` controller: add ReferenceCheckService.check() call in `del()` and `multi()` (batch delete); block with 409 if referenced
- [x] 2.8 Customize `unit/index.html`: scope display to project, add weigh sort drag handle
- [x] 2.9 Run `php think crud -t fa_field -c Field` and verify artifacts
- [x] 2.10 Customize `Field` controller: override `add()`, `edit()`, `del()` to return error JSON "此模块为只读兼容层"; keep `index()` as list-only

## Phase 3: Complex CRUD Modules

- [x] 3.1 Run `php think crud -t fa_codelist -c Codelist` and verify artifacts
- [x] 3.2 Customize `Codelist` controller: add ReferenceCheckService in del/batch-del, add `optionIndex/optionAdd/optionEdit/optionDel/optionSort` methods for inline option management
- [x] 3.3 Create `codelist/index.html` view with embedded sub-table for CodelistOption (Bootstrap table nested, jQuery event delegation)
- [x] 3.4 Create `public/assets/js/backend/codelist.js` RequireJS module: handle parent CRUD + option sub-table with Sortable.js drag-sort
- [x] 3.5 Run `php think crud -t fa_field_definition -c Fielddefinition` and verify artifacts
- [x] 3.6 Customize `Fielddefinition` controller: active-data uniqueness for variable_name, add `copy()` method (variable_name + `_copy`), ReferenceCheckService in del/batch-del, selectpage support for Form Designer search
- [x] 3.7 Customize `fielddefinition/index.html` and JS: add field_type display, codelist/unit SelectPage, conditional field visibility by field_type
- [x] 3.8 Hand-write `app/admin/controller/Form.php`: index(), add(), edit(), del() (with 409 block), saveDesign(), preview(), copy()
- [x] 3.9 Create `view/form/index.html`: list with field count, project scope
- [x] 3.10 Create `view/form/design.html`: Form Designer UI with Field Library (SelectPage), drag-drop canvas (Sortable.js), property panel
- [x] 3.11 Create `view/form/preview.html`: server-rendered CRF HTML, read-only, applies trailing_underscore to rendered text
- [x] 3.12 Create `public/assets/js/backend/form.js` RequireJS module: Form Designer logic (Sortable library + canvas, property panel, Ajax save to saveDesign endpoint)
- [x] 3.13 Hand-write `app/admin/controller/Visitform.php`: matrix(), toggle(), reorder(), reorderVisit()
- [x] 3.14 Create `view/visitform/index.html`: visit-form checkbox grid matrix, drag handles for row/column reordering
- [x] 3.15 Create `public/assets/js/backend/visitform.js`: checkbox toggle Ajax, WeighService-backed reorder

## Phase 4: Services and Hand-write Modules

- [x] 4.1 Create `app/common/library/ExportService.php`: generate DOCX via PHPWord with structure equivalence (sections, tables, field placeholders, page breaks), file token system in `runtime/cache/export/`
- [x] 4.2 Hand-write `app/admin/controller/Export.php`: prepare() generates token, download() streams file + cleanup
- [x] 4.3 Create `public/assets/js/backend/export.js`: prepare call -> poll or direct download, show progress
- [x] 4.4 Create `app/common/library/ImportService.php`: DOCX parser (ZipArchive + DOMXPath on word/document.xml), structure classifier, domain writer using WeighService; handle name/variable_name conflicts with `_IMP` suffix
- [x] 4.5 Create `app/common/library/ImportTemplateService.php`: open SQLite .db via PDO_SQLITE, map template forms to project FieldDefinitions, handle Codelist/Unit creation by code matching
- [x] 4.6 Hand-write `app/admin/controller/Import.php`: docxUpload(), docxParse(), docxConfirm(), templateUpload(), templateParse(), templateConfirm(), screenshotStatus()
- [x] 4.7 Create `view/import/index.html` and `public/assets/js/backend/import.js`: DOCX upload wizard + template import tab
- [x] 4.8 Create `app/common/library/AiReviewService.php`: OpenAiAdapter + AnthropicAdapter (Guzzle), provider auto-detection from config, graceful degradation (never throw), API key masking in logs
- [x] 4.9 Hand-write `app/admin/controller/Aireview.php`: review(), connectionTest()
- [x] 4.10 Create `public/assets/js/backend/aireview.js`: trigger review, display suggestions overlay
- [x] 4.11 Create `app/common/library/ScreenshotWorker.php` and `application/admin/command/ScreenshotGenerate.php` CLI command: LibreOffice headless PDF conversion, status JSON file management
- [x] 4.12 Hand-write `app/admin/controller/Settings.php`: read/write YAML config for AI provider settings
- [x] 4.13 Create `view/settings/index.html` and `public/assets/js/backend/settings.js`: settings form with connection test button

## Phase 5: Data Migration and Polish

- [x] 5.1 Write ETL script `scripts/migrate_sqlite_to_mysql.php`: read source SQLite, transform datetime->int timestamps, unify sequence/order_index/sort_order->weigh (compress to 1..n per scope), normalize log rows (is_log_row=1 + NULL field_definition_id)
- [x] 5.2 Run ETL data audit scans: row count comparison, orphan FK scan, active-data uniqueness scan, weigh continuity scan, 0-based/1-based sort inconsistency detection
- [x] 5.3 Execute ETL migration to staging MySQL and run audit checks; fix any data inconsistencies found
- [x] 5.4 Run sample export/import regression test: export project DOCX, verify structure equivalent to Python version output
- [x] 5.5 Add layout equivalence features to ExportService: floating logo, East Asian font settings, cell shading/borders, header/footer
- [x] 5.6 Write PHPUnit tests for WeighService: continuity, uniqueness, idempotency, monotonic insert invariants
- [x] 5.7 Write PHPUnit tests for ReferenceCheckService: block guarantee, complete coverage, Form strict block invariants
- [x] 5.8 Write PHPUnit tests for ImportService: structure preservation, variable_name conflict handling
- [x] 5.9 Write PHPUnit tests for AiReviewService: graceful degradation, provider adapter switching
- [x] 5.10 Perform cutover rehearsal: dry-run full ETL on production SQLite backup, verify all checks pass
- [x] 5.11 Execute production cutover: freeze source writes, run ETL, smoke-test FastAdmin, confirm all modules functional
- [x] 5.12 Update README with FastAdmin deployment instructions (Nginx + PHP-FPM + MySQL setup)
