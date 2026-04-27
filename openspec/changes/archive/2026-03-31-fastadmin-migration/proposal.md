# Proposal: FastAdmin Migration [ARCHIVED]

> CRF-Editor full-stack migration from Python/Vue to PHP/FastAdmin
>
> **Status**: Archived (2026-03-23) — Research & planning complete, implementation deferred.

## Problem Statement

Current CRF-Editor is a desktop-hybrid application built on Python (FastAPI + SQLAlchemy + SQLite) backend with Vue 3 SPA frontend. This architecture has limitations:

1. **Deployment complexity**: Requires Python runtime + Node.js build + desktop wrapper
2. **No RBAC**: No built-in role-based access control or multi-user support
3. **No standard admin framework**: Custom-built CRUD operations lack standardization
4. **SQLite limitations**: Single-file database, no concurrent write support at scale

## Proposed Solution

Migrate to **FastAdmin** (PHP + ThinkPHP 5.1 + Bootstrap 3 + AdminLTE 2) full-stack web application with MySQL backend. This provides:

- Built-in RBAC, auth, menu management
- CRUD code generator for rapid development
- Standard MVC patterns with proven conventions
- Pure web deployment (Nginx + PHP-FPM + MySQL)

## Scope

### In Scope

- **Database migration**: 9 SQLite tables -> 10 MySQL tables (fa_ prefix)
  - Schema redesign: datetime -> int(10) timestamps, sequence/order_index -> weigh
  - Add audit fields: createtime, updatetime, deletetime (4 soft-delete tables)
  - Data migration script for existing SQLite data
- **Backend migration**: Python -> PHP
  - 11 Controllers (7 CRUD-generated + 4 hand-written)
  - 10 Models in app/common/model/
  - Validators in app/admin/validate/
  - 3 Service/Library classes (Export, Import, AIReview)
- **Frontend migration**: Vue 3 SPA -> Server-rendered templates + RequireJS JS
  - 14 View templates (HTML)
  - 11 JS modules (RequireJS)
  - Chinese language packs
- **Non-CRUD modules** (hand-written):
  - Form Designer (drag-and-drop field ordering)
  - Form Preview (CRF rendering)
  - Visit-Form Matrix (many-to-many grid)
  - Word Export (PHPWord)
  - DOCX Import (PHPWord)
  - AI Review (Guzzle HTTP)
  - Settings (system configuration)

### Out of Scope

- Mobile responsive design (AdminLTE 2 default suffices)
- Real-time collaboration features
- Version control / audit trail for CRF changes
- Multi-language support beyond zh-cn

## Technical Constraints

### Hard Constraints

| # | Constraint | Rationale |
|---|-----------|-----------|
| H1 | FastAdmin 1.x + ThinkPHP 5.1 | Framework lock-in per architecture decision |
| H2 | All tables use `fa_` prefix | FastAdmin convention, CRUD generator requirement |
| H3 | Timestamps as int(10) unsigned | FastAdmin Model auto-management |
| H4 | Single PK `id` int auto-increment | CRUD generator hard requirement |
| H5 | Models in `app/common/model/` only | FastAdmin convention, not in admin/model/ |
| H6 | JS 1:1 mapping with Controllers | `public/assets/js/backend/<name>.js` |
| H7 | Sort field unified as `weigh` | Replaces sequence/order_index/sort_order |
| H8 | Soft delete only for 4 tables | project, visit, form, field_definition |
| H9 | RequireJS module pattern | `define(['jquery','bootstrap','backend','table','form'], ...)` |
| H10 | ActiveRecord replaces Repository | No repository layer in ThinkPHP |

### Soft Constraints

| # | Constraint | Rationale |
|---|-----------|-----------|
| S1 | CRUD generator for applicable modules | 6/14 modules can use code generation |
| S2 | Enum comment format in DB columns | `COMMENT '状态:normal=正常,hidden=隐藏'` |
| S3 | Field suffix conventions | _time, _image, _switch trigger auto-components |
| S4 | Validator scene separation | add/edit scenes in ThinkPHP Validate |

## Migration Mapping

### Database (SQLite -> MySQL)

| Current Table | Target Table | Key Changes |
|--------------|-------------|-------------|
| project | fa_project | +createtime/updatetime/deletetime; created_at->createtime |
| visit | fa_visit | +createtime/updatetime/deletetime; sequence->weigh |
| form | fa_form | +createtime/updatetime/deletetime; order_index->weigh |
| visit_form | fa_visit_form | sequence->weigh; no audit fields |
| field | fa_field | +createtime/updatetime; field_type enum comments |
| field_definition | fa_field_definition | +deletetime; order_index->weigh; created_at/updated_at->createtime/updatetime |
| form_field | fa_form_field | sort_order->weigh; created_at/updated_at->createtime/updatetime |
| codelist | fa_codelist | +createtime/updatetime; order_index->weigh |
| codelist_option | fa_codelist_option | +createtime/updatetime; order_index->weigh |
| unit | fa_unit | +createtime/updatetime; order_index->weigh |

### Backend (Python -> PHP)

| Python Module | PHP Target | CRUD Mode |
|--------------|-----------|-----------|
| routers/projects.py | controller/Project.php | Generate + Customize |
| routers/visits.py | controller/Visit.php | Generate + Customize |
| routers/forms.py | controller/Form.php | Hand-write |
| routers/fields.py | controller/Field.php | Generate |
| - | controller/Fielddefinition.php | Generate + Customize |
| routers/codelists.py | controller/Codelist.php | Generate + Customize |
| routers/units.py | controller/Unit.php | Generate |
| routers/export.py | controller/Export.php | Hand-write |
| routers/import_docx.py | controller/Import.php | Hand-write |
| routers/settings.py | controller/Settings.php | Hand-write |
| - | controller/Aireview.php | Hand-write |
| repositories/* | Model direct queries | ActiveRecord replaces Repository |
| schemas/* | validate/*.php | ThinkPHP Validate replaces Pydantic |
| services/export_service.py | library/ExportService.php | PHPWord |
| services/ai_review_service.py | library/AiReviewService.php | Guzzle HTTP |
| services/field_rendering.py | View templates + JS formatters | Server-side rendering |

### Frontend (Vue 3 -> FastAdmin)

| Vue Component | FastAdmin Target | Complexity |
|--------------|-----------------|-----------|
| App.vue | AdminLTE layout (built-in) | N/A |
| ProjectInfoTab.vue | view/project/index.html | Simple |
| VisitsTab.vue | view/visit/index.html | Simple |
| FormDesignerTab.vue | view/form/design.html + form.js | Complex |
| FieldsTab.vue | view/field/index.html | Simple |
| CodelistsTab.vue | view/codelist/index.html | Medium |
| UnitsTab.vue | view/unit/index.html | Simple |
| SimulatedCRFForm.vue | view/form/preview.html | Medium |
| TemplatePreviewDialog.vue | Layer.js modal | Simple |
| DocxCompareDialog.vue | Layer.js modal | Medium |
| BatchEditMatrixDialog.vue | view/visitform/index.html | Medium |
| FormPreviewDialog.vue | view/form/preview.html | Medium |
| useApi.js | $.ajax / Backend.api | Simple |
| useOrderableList.js | Bootstrap-table + jQuery Sortable | Medium |
| useCRFRenderer.js | PHP View templates | Medium |

## Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| FormDesigner drag-and-drop complexity | HIGH | Phase: CRUD tables first, designer last |
| Vue reactive state -> jQuery DOM | HIGH | Server-side rendering + targeted Ajax |
| Data migration integrity | MEDIUM | Write migration script with rollback |
| PHPWord API differences from python-docx | MEDIUM | Function-by-function migration |
| No PHP dev environment set up | MEDIUM | Document setup steps, test incrementally |

## Success Criteria

1. All 10 MySQL tables created with correct schema, constraints, and indexes
2. AdminLTE backend accessible at localhost:8000 with sidebar menu
3. Full CRUD operations for all 7 standard modules
4. Form Designer: drag-and-drop field ordering, add/remove fields
5. Visit-Form Matrix: checkbox toggle, drag reorder
6. Word Export: .docx output equivalent to current system
7. DOCX Import: parse uploaded files into forms/fields
8. AI Review: external API call and result display
9. Form Preview: HTML rendering equivalent to SimulatedCRFForm.vue

## Implementation Phases (suggested)

1. **Phase 1 - Foundation**: FastAdmin project setup, MySQL schema, CRUD generation for simple modules (Project, Visit, Field, Unit)
2. **Phase 2 - Core CRUD**: FieldDefinition, Codelist with nested options, reference checks
3. **Phase 3 - Complex UI**: Form Designer, Visit-Form Matrix, Form Preview
4. **Phase 4 - Services**: Word Export (PHPWord), DOCX Import, AI Review
5. **Phase 5 - Polish**: Settings, data migration script, testing, documentation
