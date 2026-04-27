# Tasks: FastAdmin Migration — CLAUDE.md Rewrite

## Phase 1: CLAUDE.md Core Structure (Sections 1-5)

- [x] 1.1 Write Section 1 "Project Overview" — target-state declaration, CRF editor purpose, explicit statement that this describes FastAdmin target architecture
- [x] 1.2 Write Section 2 "Business Domain Vocabulary" — define: Project, Visit, Form, Field, FieldDefinition, FormField, Codelist, CodelistOption, Unit, LogRow, ReferenceCheck, CopyWithRename
- [x] 1.3 Write Section 3 "Tech Stack Snapshot" — PHP 7.4+/8.0+, ThinkPHP 5.1, FastAdmin 1.x, MySQL 5.6-8.0, Bootstrap 3, AdminLTE 2, RequireJS, jQuery, PHPWord, Nginx+PHP-FPM
- [x] 1.4 Write Section 4 "Target Architecture Overview" — explain FastAdmin app structure: Backend base controller, common models, admin views, JS modules, validators, libraries, addons
- [x] 1.5 Write Section 5 "Directory Structure" — document application/admin/{controller,model,view,validate,lang}, application/common/{controller,model,library}, public/assets/js/backend/, addons/, extend/

## Phase 2: CLAUDE.md Convention Sections (Sections 6-10)

- [x] 2.1 Write Section 6 "Controller Conventions" — base class inheritance, standard properties ($model, $noNeedLogin, $noNeedRight, $dataLimit, $relationSearch, $modelValidate), _initialize() responsibilities, standard CRUD actions and override guidance
- [x] 2.2 Write Section 7 "Model Conventions" — table name binding, primary key, autoWriteTimestamp config (int), soft delete (SoftDelete trait for project/visit/form/field_definition only), weigh field, relationship definitions (hasMany, belongsTo, belongsToMany), accessors/mutators
- [x] 2.3 Write Section 8 "Validator & Service Class Conventions" — ThinkPHP validators in validate/, service/library classes in common/library/ or extend/, separation principle (fat model, thin controller, service for cross-model logic)
- [x] 2.4 Write Section 9 "Frontend JS Module Conventions" — RequireJS define() pattern, 1:1 controller-to-JS mapping, Table.api.init() for lists, Form.api.bindevent() for forms, Fast.api.open()/Layer.open() for modals, Selectpage for dropdowns, dragsort for ordering, Toastr for notifications
- [x] 2.5 Write Section 10 "CRUD Generator Workflow" — prerequisites (single PK, field comments, suffix conventions), command template (php think crud -t table -c controller), output artifacts (controller, model, view, js, lang, menu), post-generation customization checklist, applicability matrix (13 modules: generate/generate+customize/hand-write with reasons)

## Phase 3: CLAUDE.md Database & Domain Sections (Sections 11-13)

- [x] 3.1 Write Section 11 "Database Design Specification" — global rules (fa_ prefix, InnoDB, utf8mb4, int(10) timestamps, single PK), soft-delete strategy (4 tables), weigh strategy (8 tables), field comment requirements (enum format, suffix conventions)
- [x] 3.2 Write Section 11 continued: Entity Matrix — all 10 tables with columns: target table name, purpose, CRUD mode, primary key, foreign keys with ON DELETE, unique constraints, sort field, audit fields, soft delete flag, key business fields, comment requirements
- [x] 3.3 Write Section 11 continued: Constraint Preservation — document all scoped unique constraints, SET NULL rules, reference check requirements, nullable FK rules (form_field.field_definition_id for log rows), cascade behaviors
- [x] 3.4 Write Section 12 "Entity Relationship Diagram" — text-based ERD showing Project->Visit/Form/FieldDefinition/Codelist/Unit, Visit<->Form (M:N via visit_form), Form->FormField->FieldDefinition, FieldDefinition->Codelist/Unit (nullable), Codelist->CodelistOption
- [x] 3.5 Write Section 13 "Migration Mapping Table" — three sub-tables: Database (10 tables old->new with key changes), Backend (12 components Python->PHP with CRUD mode), Frontend (16 components Vue->FastAdmin with notes)

## Phase 4: CLAUDE.md Remaining Sections (Sections 14-18)

- [x] 4.1 Write Section 14 "Non-CRUD Modules" — Export (PHPWord), Import (DOCX reader), AIReview (Guzzle HTTP), FormDesigner (jQuery Sortable + custom JS), FormPreview (server-rendered HTML), VisitFormMatrix (custom controller + view)
- [x] 4.2 Write Section 15 "Non-Database State" — project logo files, DOCX temp files, export cache, AI service config (API keys in .env), uploaded attachments path
- [x] 4.3 Write Section 16 "Development & Deployment" — Composer install, MySQL setup (fa_ prefix config in database.php), PHP built-in server for dev, Nginx+PHP-FPM for production (/public as docroot), environment config (.env)
- [x] 4.4 Write Section 17 "AI Assistant Work Rules" — decision tree: new feature -> check CRUD matrix -> generate or hand-write; never run php think crud on hand-write modules; always design schema+comments before coding; verify CRUD output doesn't overwrite custom code; use -f flag only with explicit user approval
- [x] 4.5 Write Section 18 "Glossary" — unified terminology: FieldDefinition vs FormField vs Field, LogRow, ReferenceCheck, CopyWithRename, BatchReorder, SequenceCompression, VisitFormMatrix, CodelistOption.trailing_underscore

## Phase 5: .context/ Updates

- [x] 5.1 Update .context/prefs/coding-style.md — remove Python (PEP 8, black, ruff) and JS/TS (Vue 3, Composition API, Zod) sections; add PHP (PSR-12, ThinkPHP conventions, type declarations) and JavaScript (RequireJS, jQuery patterns, Backend.api) sections; preserve General, Git Commits, Testing, Security
- [x] 5.2 Update .context/prefs/workflow.md — update feat flow to include Schema-First (design table+comments), CRUD Generation (check matrix, run command, verify output), Customization (override generated files); update fix flow for PHP context; add step 0 "Check CRUD applicability matrix"; preserve Context Logging format

## Phase 6: Verification

- [x] 6.1 Verify S-1: grep CLAUDE.md for Python/Vue active-stack references — must return zero matches
- [x] 6.2 Verify S-2 through S-9: review CLAUDE.md against success criteria checklist — all 9 original criteria met
- [x] 6.3 Verify S-10 through S-11: check .context/ files for consistency with CLAUDE.md tech stack
- [x] 6.4 Verify S-12 through S-15: confirm three-layer field model, non-DB state, business behaviors all documented
- [x] 6.5 Verify P-1 through P-7: run PBT property checks — no active Python refs, table completeness, constraint preservation, CRUD applicability consistency, 1:1 JS mapping, document self-sufficiency, .context/ consistency
