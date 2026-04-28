# Specs: FastAdmin Migration — CLAUDE.md Rewrite

## Change ID
fastadmin-migration-claude-md

## Objective
Rewrite `CLAUDE.md` to describe the FastAdmin (PHP + ThinkPHP + Bootstrap + AdminLTE) target architecture, replacing all Python/Vue 3 references. Simultaneously update `.context/prefs/coding-style.md` and `.context/prefs/workflow.md` to align with PHP/FastAdmin conventions.

**This is a documentation-only change. No source code migration.**

## Scope

### In Scope
- Complete rewrite of `CLAUDE.md` with FastAdmin target-state conventions
- Update `.context/prefs/coding-style.md` to PHP/PSR-12 + FastAdmin JS conventions
- Update `.context/prefs/workflow.md` to Schema-First + CRUD-Generation workflow
- Document all 10 database tables with FastAdmin naming conventions
- Document controller, model, view, JS module, validator conventions
- Document CRUD generator workflow and applicability per module
- Document deployment setup (Nginx + PHP-FPM + MySQL)
- Preserve CRF domain knowledge (visits, forms, fields, codelists, units, export/import)

### Out of Scope
- Actual PHP code migration
- Database migration scripts
- PHPWord implementation
- Server configuration files (nginx.conf, php.ini)
- `.context/history/` updates (auto-generated)

## User Decisions (Confirmed)

| ID | Decision | Choice | Rationale |
|----|----------|--------|-----------|
| UD-1 | Data model | Keep 3 layers: field + field_definition + form_field all migrate | Preserve existing architecture, no structural changes during doc rewrite |
| UD-2 | Timestamp type | int(10) UNIX timestamp (FastAdmin native) | Maximum compatibility with FastAdmin auto-timestamp management |
| UD-3 | Soft delete scope | Main entity tables only: project, visit, form, field_definition | Association tables (visit_form, form_field, codelist_option) use hard delete |
| UD-4 | Document positioning | Direct replacement: CLAUDE.md only describes FastAdmin target state | Old CLAUDE.md recoverable via git history |
| UD-5 | .context/ sync | Update together: PSR-12 + FastAdmin workflow | Keep CLAUDE.md and .context/ consistent |

## Hard Constraints

| ID | Constraint |
|----|-----------|
| HC-1 | PHP 7.4+ required (8.0+ recommended for FastAdmin v1.7.0+) |
| HC-2 | MySQL 5.6-8.0 with InnoDB engine required |
| HC-3 | All controllers must extend `\app\common\controller\Backend` |
| HC-4 | Table prefix must be `fa_` |
| HC-5 | Tables must have `createtime`, `updatetime` as int(10) UNIX timestamps |
| HC-6 | Soft-delete tables require `deletetime` int(10) with NULL default |
| HC-7 | `weigh` field (int) required for drag-sort-enabled tables |
| HC-8 | Field comments mandatory — CRUD generator uses them for language packs and component mapping |
| HC-9 | JS modules must use RequireJS `define()` and map 1:1 to controllers |
| HC-10 | Single primary key per table (composite keys unsupported by CRUD generator) |
| HC-11 | Web server document root must be `/public` directory |
| HC-12 | CLAUDE.md must NOT reference Python/Vue as current stack (target-state only) |
| HC-13 | All three field layers (field, field_definition, form_field) must be documented |

## Soft Constraints

| ID | Constraint |
|----|-----------|
| SC-1 | Controller naming: PascalCase matching file names |
| SC-2 | Field suffix conventions: `_time`, `_image`, `_file`, `_switch`, `_ids`, `_list`, `_data`, `_json`, `_range`, `_tag` |
| SC-3 | Status fields (enum) auto-generate tab filtering |
| SC-4 | Use `$noNeedLogin`, `$noNeedRight`, `$dataLimit` for access control |
| SC-5 | Form validation via `Form.api.bindevent()`, Table via `Table.api.init()` |
| SC-6 | Language files support `"label:0=optionA,1=optionB"` comment format |
| SC-7 | Plugin architecture via `addons/` directory |
| SC-8 | Models should be placed in `application/common/model/` (shared) |
| SC-9 | Validators in `application/admin/validate/` |
| SC-10 | Service/library classes in `application/common/library/` or `extend/` |

## Database Schema Constraints

### Global Rules
- Prefix: `fa_`
- Engine: InnoDB
- Charset: utf8mb4
- Primary key: single-column `id` int auto-increment
- Foreign key naming: `<entity>_id`
- Timestamp type: int(10) unsigned, auto-managed by model

### Soft Delete Strategy
| Table | Soft Delete | Rationale |
|-------|-------------|-----------|
| fa_project | YES | Core entity, needs recycle bin |
| fa_visit | YES | Core entity, needs recycle bin |
| fa_form | YES | Core entity, needs recycle bin |
| fa_field_definition | YES | Core entity, needs recycle bin |
| fa_field | NO | Hard delete |
| fa_visit_form | NO | Association, hard delete with parent |
| fa_form_field | NO | Association, hard delete with parent |
| fa_codelist | NO | Hard delete |
| fa_codelist_option | NO | Hard delete with parent |
| fa_unit | NO | Hard delete |

### Weigh Strategy
Only tables with backend drag-sort: fa_visit, fa_form, fa_visit_form, fa_form_field, fa_codelist, fa_codelist_option, fa_unit, fa_field_definition.

### Critical Constraints to Preserve
- Scoped unique: `(project_id, name)` on visit/form/codelist/unit
- SET NULL on delete: `field_definition.codelist_id`, `field_definition.unit_id`
- Reference checks before delete: field_definition referenced by form_field, codelist referenced by field_definition
- form_field.field_definition_id nullable (log rows have no field_definition)
- Copy operations with auto-rename rules
- Batch reorder with sequence compression after delete

## CRUD Generator Applicability

| Module | CRUD Mode | Reason |
|--------|-----------|--------|
| Project | Generate + Customize | Standard CRUD + extra fields (logo, sponsor) |
| Visit | Generate + Customize | CRUD + ordering + copy |
| Form | Hand-write | Complex form designer, drag-drop |
| Field | Generate | Simple CRUD table |
| FieldDefinition | Generate + Customize | CRUD + codelist/unit relations |
| FormField | Hand-write | Not standalone CRUD, embedded in form designer |
| Codelist | Generate + Customize | Nested table with options |
| CodelistOption | Hand-write | Nested within codelist, not standalone |
| Unit | Generate | Simple CRUD |
| VisitForm | Hand-write | Matrix view, not standard CRUD |
| Export | Hand-write | PHPWord integration, complex logic |
| Import | Hand-write | DOCX parsing, template matching |
| AIReview | Hand-write | External API integration |

## Success Criteria

| ID | Criterion | Verification |
|----|-----------|-------------|
| S-1 | CLAUDE.md describes only FastAdmin stack, zero Python/Vue active-stack references | grep -c "FastAPI\|Vue 3\|SQLAlchemy\|Pydantic" returns 0 |
| S-2 | All 10 tables documented with fa_ prefix, timestamps, weigh, constraints | Each table has: name, columns, relationships, unique constraints, delete semantics |
| S-3 | Directory structure covers controller/model/view/js/validate/lang/common/addons | At least 8 directories documented |
| S-4 | CRUD generation workflow documented with applicability matrix | 13 modules classified as generate/customize/hand-write |
| S-5 | Controller conventions: base class, properties ($noNeedLogin, $noNeedRight, $dataLimit, $relationSearch, $modelValidate) | All 5 properties documented |
| S-6 | Frontend JS conventions: RequireJS define(), 1:1 mapping, Table/Form API, Layer.js, Selectpage | All 5 patterns documented |
| S-7 | Migration mapping table with generation mode per module | Old->New mapping with generate/hand-write annotation |
| S-8 | Development commands: Composer, /public root, PHP-FPM, Nginx, MySQL prefix | All 5 items in startup section |
| S-9 | CRF domain concepts preserved: visits, forms, fields, field_definition vs form_field distinction, codelists, units, log rows, reference checks | All 8 concepts explained |
| S-10 | .context/prefs/coding-style.md updated to PSR-12 + FastAdmin JS | No Python/Vue references in coding style |
| S-11 | .context/prefs/workflow.md updated with Schema-First + CRUD-Generation steps | Workflow includes schema design and crud generation phases |
| S-12 | Three-layer field model (field, field_definition, form_field) explicitly documented with roles | Each layer's purpose and relationships clear |
| S-13 | Non-database state documented: file uploads, DOCX temp files, AI config, project logo | At least 4 non-DB state items listed |
| S-14 | Business behaviors preserved: copy+rename, batch reorder, reference check, sequence compression | All 4 behaviors documented |
| S-15 | AI assistant work rules section: how to decide CRUD vs custom, avoid ThinkPHP-only patterns | Decision tree or checklist present |

## PBT Properties

| ID | Property | Invariant | Falsification |
|----|----------|-----------|---------------|
| P-1 | No active Python references | grep for FastAPI/Vue/SQLAlchemy/Pydantic in CLAUDE.md returns empty | Single occurrence falsifies |
| P-2 | Table completeness | Every table in migration mapping has corresponding schema documentation | Missing table falsifies |
| P-3 | Constraint preservation | Every scoped-unique/SET NULL/reference-check in current DB is documented in target | Diff current constraints vs documented |
| P-4 | CRUD applicability consistency | Every module marked "Generate" has standard FastAdmin structure; every "Hand-write" has justification | Module without classification falsifies |
| P-5 | 1:1 JS mapping | Every documented controller has corresponding JS module path | Controller without JS path falsifies |
| P-6 | Document self-sufficiency | A new AI session reading only CLAUDE.md can identify: tech stack, directory structure, database schema, development commands | Missing any of the 4 categories falsifies |
| P-7 | .context/ consistency | coding-style.md and workflow.md reference same tech stack as CLAUDE.md | Cross-reference mismatch falsifies |
