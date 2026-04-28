# Proposal: FastAdmin Migration — CLAUDE.md Rewrite

## Summary

Rewrite the project's `CLAUDE.md` to reflect a **full-stack migration** from FastAPI + Vue 3 to **FastAdmin** (PHP + ThinkPHP + Bootstrap + AdminLTE). The document must serve as the single source of truth for AI assistants working on this project, encoding all FastAdmin conventions, directory structures, database rules, and migration mapping.

## Motivation

The project owner has decided to migrate the CRF-Editor from the current Python/Vue stack to the FastAdmin PHP ecosystem. The CLAUDE.md must be updated **before** any code migration begins, establishing clear guardrails and conventions.

## User Decisions (Confirmed)

| Decision | Choice |
|----------|--------|
| Migration strategy | Direct full replacement (no transition period) |
| Database | Migrate to MySQL with `fa_` table prefix |
| Frontend | Full replacement to FastAdmin native (Bootstrap + AdminLTE + RequireJS + jQuery) |
| Word export | Use PHPWord to replace python-docx |
| Deployment | Pure Web deployment (Nginx + PHP-FPM), drop PyInstaller desktop packaging |

---

## Discovered Constraints

### Hard Constraints (Non-negotiable)

| ID | Constraint | Source |
|----|-----------|--------|
| HC-1 | PHP 7.4+ required (8.0+ recommended for FastAdmin v1.7.0+) | FastAdmin install docs |
| HC-2 | MySQL 5.6–8.0 with InnoDB engine required | FastAdmin install docs |
| HC-3 | All controllers must extend `\app\common\controller\Backend` | FastAdmin controller docs |
| HC-4 | Table prefix must be `fa_` | FastAdmin database convention |
| HC-5 | Tables must have `createtime`, `updatetime` (bigint/datetime) for auto-tracking | FastAdmin database convention |
| HC-6 | Soft-delete requires `deletetime` field with NULL default | FastAdmin database convention |
| HC-7 | `weigh` field (int) required for drag-sort-enabled tables | FastAdmin database convention |
| HC-8 | Field comments are **mandatory** — CRUD generator uses them for language packs and component mapping | FastAdmin CRUD docs |
| HC-9 | JS modules must use RequireJS `define()` and map 1:1 to controllers | FastAdmin frontend docs |
| HC-10 | Single primary key per table (composite keys unsupported by CRUD generator) | FastAdmin CRUD docs |
| HC-11 | Web server must set document root to `/public` directory | FastAdmin install docs |

### Soft Constraints (Conventions)

| ID | Constraint | Source |
|----|-----------|--------|
| SC-1 | Controller naming: PascalCase, matching file names | FastAdmin controller docs |
| SC-2 | Field suffix conventions trigger auto-components: `_time`, `_image`, `_file`, `_switch`, `_ids`, `_list`, `_data`, `_json`, `_range`, `_tag` | FastAdmin database docs |
| SC-3 | Status fields (enum) auto-generate tab filtering | FastAdmin database docs |
| SC-4 | Use `$noNeedLogin`, `$noNeedRight`, `$dataLimit` for access control | FastAdmin controller docs |
| SC-5 | Form validation via `Form.api.bindevent()`, Table via `Table.api.init()` | FastAdmin frontend docs |
| SC-6 | Language files support `"label:0=optionA,1=optionB"` comment format | FastAdmin database docs |
| SC-7 | Plugin architecture via `addons/` directory with `php think addon` management | FastAdmin addon docs |

### Dependencies (Cross-module)

| ID | Dependency | Impact |
|----|-----------|--------|
| D-1 | `visit_form` (M2M table) → ThinkPHP `belongsToMany` relationship | Requires explicit pivot table config |
| D-2 | `codelist_option` → parent `codelist` → `hasMany` relationship | Natural fit for ThinkPHP relationships |
| D-3 | `form_field` → `field_definition` + `form` (dual FK) | Needs custom CRUD, not auto-generated |
| D-4 | `field.codelist_id` + `field.unit_id` → `belongsTo` with `SET NULL` on delete | ThinkPHP soft-FK handling |
| D-5 | PHPWord integration for DOCX export | Composer dependency, replaces python-docx |
| D-6 | AI Review service (calls external API) | Reimplement in PHP with Guzzle/cURL |

### Risks

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| R-1 | Loss of PyInstaller desktop deployment capability | HIGH | Accept: switch to web-only deployment |
| R-2 | SQLite → MySQL data migration may lose CHECK constraints | MEDIUM | Validate constraints in ThinkPHP validators |
| R-3 | Vue 3 drag-and-drop (vuedraggable) form designer → jQuery alternative | HIGH | Use Bootstrap-table + jQuery Sortable |
| R-4 | python-docx fine-grained DOCX control → PHPWord parity | MEDIUM | Verify PHPWord supports required formatting |
| R-5 | CRF form preview/rendering logic is complex Vue component | HIGH | Rewrite as server-side rendered HTML template |
| R-6 | AI review service (ai_review_service.py) needs PHP rewrite | LOW | Use Guzzle HTTP client for API calls |

---

## Migration Mapping

### Database Tables (SQLite → MySQL)

| Current Table | FastAdmin Table | Key Changes |
|--------------|-----------------|-------------|
| `project` | `fa_project` | Add `createtime`, `updatetime`, `deletetime`; rename `created_at` |
| `visit` | `fa_visit` | Add `createtime`, `updatetime`, `weigh` (replaces `sequence`) |
| `form` | `fa_form` | Add `createtime`, `updatetime`, `weigh` (replaces `order_index`) |
| `visit_form` | `fa_visit_form` | Pivot table with `weigh` for ordering |
| `field` | `fa_field` | Add `createtime`, `updatetime`; map `field_type` to comment-based enum |
| `field_definition` | `fa_field_definition` | Add `createtime`, `updatetime` |
| `form_field` | `fa_form_field` | Add `createtime`, `updatetime`; `sort_order` → `weigh` |
| `codelist` | `fa_codelist` | Add `createtime`, `updatetime`, `weigh` |
| `codelist_option` | `fa_codelist_option` | Add `createtime`, `updatetime`, `weigh` |
| `unit` | `fa_unit` | Add `createtime`, `updatetime`, `weigh` |

### Backend Components (Python → PHP)

| Current (Python) | FastAdmin (PHP) | Notes |
|------------------|-----------------|-------|
| `routers/projects.py` | `controller/Project.php` | Extend Backend, CRUD trait |
| `routers/visits.py` | `controller/Visit.php` | With relation to project |
| `routers/forms.py` | `controller/Form.php` | Custom form designer logic |
| `routers/fields.py` | `controller/Field.php` | CRUD + field_type handling |
| `routers/codelists.py` | `controller/Codelist.php` | With nested options |
| `routers/units.py` | `controller/Unit.php` | Simple CRUD |
| `routers/export.py` | `controller/Export.php` | PHPWord integration |
| `routers/import_docx.py` | `controller/Import.php` | PHPWord reader |
| `routers/settings.py` | `controller/Settings.php` | App config management |
| `services/export_service.py` | `library/ExportService.php` | In `extend/` or controller logic |
| `services/ai_review_service.py` | `library/AiReviewService.php` | Guzzle HTTP calls |
| `services/field_rendering.py` | View helpers / JS formatters | Server-side + client-side |
| `repositories/*` | Model direct queries | ThinkPHP ActiveRecord eliminates repository layer |
| `schemas/*` | `validate/*.php` | ThinkPHP validators replace Pydantic |

### Frontend Components (Vue 3 → FastAdmin)

| Current (Vue 3) | FastAdmin | Notes |
|------------------|-----------|-------|
| `App.vue` | Admin layout (AdminLTE) | Built-in sidebar + header |
| `ProjectInfoTab.vue` | `view/project/index.html` | Bootstrap form |
| `VisitsTab.vue` | `view/visit/index.html` | Bootstrap-table + CRUD |
| `FormDesignerTab.vue` | `view/form/design.html` + `js/backend/form.js` | **Most complex** — drag-drop redesign |
| `FieldsTab.vue` | `view/field/index.html` | Bootstrap-table |
| `CodelistsTab.vue` | `view/codelist/index.html` | Nested table (options) |
| `UnitsTab.vue` | `view/unit/index.html` | Simple CRUD table |
| `SimulatedCRFForm.vue` | `view/form/preview.html` | Server-rendered preview |
| `TemplatePreviewDialog.vue` | Layer.js modal | Template preview |
| `DocxCompareDialog.vue` | Layer.js modal | Side-by-side compare |
| `DocxScreenshotPanel.vue` | Removed or server-side | Screenshot via wkhtmltoimage |
| `useApi.js` | `$.ajax` / Backend.api | jQuery AJAX helpers |
| `useOrderableList.js` | Bootstrap-table + jQuery Sortable | Drag-drop reordering |
| `useCRFRenderer.js` | PHP view template | Server-side HTML rendering |

---

## Success Criteria

| ID | Criterion | Verification |
|----|-----------|-------------|
| S-1 | CLAUDE.md accurately describes FastAdmin tech stack | Review: no Python/Vue references in active stack |
| S-2 | All 10 database tables mapped with FastAdmin naming conventions | Review: `fa_` prefix, timestamp fields, `weigh` fields |
| S-3 | Directory structure matches FastAdmin standard | Review: `application/admin/{controller,model,view}` documented |
| S-4 | CRUD generation workflow documented | Review: `php think crud` commands listed |
| S-5 | Controller conventions fully specified | Review: Base class, properties, CRUD trait documented |
| S-6 | Frontend JS module conventions documented | Review: RequireJS pattern, Table/Form APIs documented |
| S-7 | Migration mapping table included | Review: Python→PHP component mapping present |
| S-8 | Development startup commands correct | Review: PHP/MySQL/Nginx commands documented |
| S-9 | Business domain knowledge preserved | Review: CRF concepts (visits, forms, fields, codelists) explained |
| S-10 | AI assistant can work without additional context | Test: new Claude session can understand project from CLAUDE.md alone |

---

## Scope

### In Scope
- Rewrite `CLAUDE.md` with FastAdmin conventions and migration mapping
- Document all database table schemas with FastAdmin naming
- Document controller, model, view, JS module conventions
- Document CRUD generation workflow
- Document deployment setup (Nginx + PHP-FPM + MySQL)

### Out of Scope
- Actual code migration (no PHP files created)
- Database migration scripts
- PHPWord implementation
- Server configuration files
