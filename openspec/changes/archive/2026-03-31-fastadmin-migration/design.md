# Design: FastAdmin Migration

> CRF-Editor full-stack migration — zero-decision executable design

## 1. Architecture Overview

```
[Browser] --> [Nginx] --> [PHP-FPM (ThinkPHP 5.1 + FastAdmin 1.x)]
                                    |
                              [MySQL 5.6+]
                                    |
                         [runtime/cache/export/]
                         [runtime/queue/]       (async workers)
```

### Directory Structure (FastAdmin Standard)

```
application/
  admin/
    controller/          # 11 Controllers
      Project.php        # Generate+Customize
      Visit.php          # Generate+Customize
      Form.php           # Hand-write
      Field.php          # Generate (read-only legacy)
      Fielddefinition.php # Generate+Customize
      Codelist.php       # Generate+Customize
      Unit.php           # Generate
      Visitform.php      # Hand-write
      Export.php          # Hand-write
      Import.php         # Hand-write (DOCX + Template)
      Aireview.php       # Hand-write
      Settings.php       # Hand-write
    validate/            # 7 Validators
    view/                # 14+ View templates
    lang/zh-cn/          # Chinese language packs
  common/
    model/               # 10 Models (MUST be here, not admin/model/)
    library/             # Service classes
      WeighService.php
      ExportService.php
      ImportService.php
      ImportTemplateService.php
      AiReviewService.php
      ReferenceCheckService.php
      ScreenshotWorker.php
public/
  assets/js/backend/     # 11+ JS modules (1:1 with Controllers)
```

## 2. Database Design

### 2.1 Table Inventory (10 tables, all with `fa_` prefix)

| Table | Soft Delete | Weigh Sort | Audit Fields |
|-------|------------|------------|--------------|
| fa_project | YES (deletetime) | NO | createtime, updatetime, deletetime |
| fa_visit | YES (deletetime) | YES | createtime, updatetime, deletetime |
| fa_form | YES (deletetime) | NO | createtime, updatetime, deletetime |
| fa_visit_form | NO | YES | createtime, updatetime |
| fa_field | NO | NO | createtime, updatetime |
| fa_field_definition | YES (deletetime) | YES | createtime, updatetime, deletetime |
| fa_form_field | NO | YES | createtime, updatetime |
| fa_codelist | NO | YES | createtime, updatetime |
| fa_codelist_option | NO | YES | createtime, updatetime |
| fa_unit | NO | YES | createtime, updatetime |

### 2.2 Timestamp Convention

All timestamp fields: `int(10) unsigned NOT NULL DEFAULT 0`
Managed by ThinkPHP Model `autoWriteTimestamp = 'int'`.

### 2.3 Uniqueness Strategy

**Soft-delete tables (4)**: Application-layer uniqueness on active records (WHERE deletetime IS NULL). Database uses normal indexes (not UNIQUE) to support recyclebin restore + re-creation.

**Non-soft-delete tables (6)**: Database-level UNIQUE indexes enforced directly.

**Special case**: `fa_form_field` uses `UNIQUE(form_id, field_definition_id)` — MySQL NULL semantics allow multiple log rows (field_definition_id IS NULL).

### 2.4 Weigh Sort (8 tables)

All sorted tables use `weigh int(10) NOT NULL DEFAULT 0`.
- `fa_form_field`: `UNIQUE(form_id, weigh)` — database enforced
- Other weigh tables: `UNIQUE(scope_id, weigh)` where scope_id is the parent FK
- All reordering goes through `WeighService` in transactions

### 2.5 Foreign Key Strategy

| FK Pattern | Tables | Action |
|-----------|--------|--------|
| CASCADE | visit->project, form->project, visit_form->visit, field->form | Parent delete cascades |
| RESTRICT | form_field->field_definition, visit_form->form | Block delete if referenced |
| SET NULL | field_definition->codelist, field_definition->unit, field->codelist, field->unit | Nullify on delete |

### 2.6 Key Table Schemas

#### fa_form_field
```sql
CREATE TABLE `fa_form_field` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `form_id` int(10) unsigned NOT NULL,
  `field_definition_id` int(10) unsigned DEFAULT NULL COMMENT 'NULL for log rows',
  `label` varchar(255) NOT NULL DEFAULT '',
  `is_log_row` tinyint(1) NOT NULL DEFAULT 0,
  `weigh` int(10) NOT NULL DEFAULT 0,
  `createtime` int(10) unsigned NOT NULL DEFAULT 0,
  `updatetime` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_form_field` (`form_id`, `field_definition_id`),
  UNIQUE KEY `uniq_form_weigh` (`form_id`, `weigh`),
  KEY `idx_field_def` (`field_definition_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### fa_codelist_option
```sql
CREATE TABLE `fa_codelist_option` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `codelist_id` int(10) unsigned NOT NULL,
  `code` varchar(50) NOT NULL DEFAULT '',
  `decode` varchar(255) NOT NULL DEFAULT '',
  `trailing_underscore` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Append underscore to rendered output text',
  `weigh` int(10) NOT NULL DEFAULT 0,
  `createtime` int(10) unsigned NOT NULL DEFAULT 0,
  `updatetime` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_codelist_code_decode` (`codelist_id`, `code`, `decode`),
  UNIQUE KEY `uniq_codelist_weigh` (`codelist_id`, `weigh`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 3. Resolved Constraints (User Decisions)

| # | Constraint | Decision | Implementation |
|---|-----------|----------|----------------|
| D1 | fa_field role | Read-only compatibility layer | Generate CRUD, disable add/edit in Controller, list-only UI |
| D2 | Soft-delete uniqueness | Allow re-creation, active-data unique | App-layer check: `where('deletetime', NULL)->where('name', $name)` |
| D3 | Form deletion | Strict block (409) | Controller `del()` checks visit_form count, returns 409 with association list |
| D4 | Template import | In scope | ImportTemplateService.php reads external .db, maps to FieldDefinition/FormField |
| D5 | DOCX screenshot | Keep, async queue | ScreenshotWorker.php as CLI worker, status polling via Ajax |
| D6 | Export token | File system | `runtime/cache/export/{token}.docx`, cleanup on download or TTL expiry |
| D7 | form_field weigh index | DB unique | `UNIQUE(form_id, weigh)`, WeighService uses two-phase algorithm |
| D8 | trailing_underscore | Render output only | Applied during CRF preview/export rendering, not stored in code/decode |
| D9 | AIReview protocols | Multi-provider | AiReviewService with provider adapter pattern (OpenAI + Anthropic) |
| D10 | Designer validation | Server-side only | Standard Form.api.bindevent + Controller validate, no client-side conflict check |
| D11 | CRF preview | Read-only | Server-rendered HTML, no form inputs, pure layout display |

## 4. Service Layer Design

### 4.1 WeighService (app/common/library/WeighService.php)

Unified ordering service for all 8 weigh-sorted tables.

```
WeighService::insert($model, $scopeField, $scopeValue, $position)
WeighService::move($model, $id, $scopeField, $newPosition)
WeighService::remove($model, $id, $scopeField)
WeighService::batchReorder($model, $scopeField, $scopeValue, $orderedIds)
WeighService::compress($model, $scopeField, $scopeValue)
```

- All operations in MySQL transactions with `SELECT ... FOR UPDATE`
- Two-phase algorithm: offset by SAFE_OFFSET (100000) then compress to 1..n
- Scope field varies: project_id, form_id, codelist_id, visit_id, etc.

### 4.2 ReferenceCheckService (app/common/library/ReferenceCheckService.php)

```
ReferenceCheckService::check($model, $id): array  // returns referencing records
ReferenceCheckService::canDelete($model, $id): bool
```

Coverage matrix:
- Codelist: check FieldDefinition + Field (legacy)
- Unit: check FieldDefinition + Field (legacy)
- FieldDefinition: check FormField
- Form: check VisitForm (strict block)
- Visit: check VisitForm

### 4.3 ExportService (app/common/library/ExportService.php)

PHPWord-based Word export. Two-level acceptance:
1. **Structure equivalence** (Phase 4): sections, tables, field placeholders, page breaks
2. **Layout equivalence** (Phase 5): floating logo, document grid, field codes, East Asian fonts, shading/borders

Token flow: Controller `prepare()` -> ExportService generates .docx -> save to `runtime/cache/export/{token}.docx` -> Controller `download()` streams file and deletes.

### 4.4 AiReviewService (app/common/library/AiReviewService.php)

Provider adapter pattern:
- `OpenAiAdapter`: Guzzle POST to OpenAI-compatible endpoints
- `AnthropicAdapter`: Guzzle POST to Anthropic messages API
- Auto-detection via config `ai.provider` or endpoint URL pattern
- Graceful degradation: import preview continues even if AI fails
- Synchronous in v1, optional Guzzle Pool concurrency in v2

### 4.5 ScreenshotWorker (app/common/library/ScreenshotWorker.php)

Async CLI worker for DOCX screenshot generation:
- Triggered via `php think screenshot:generate {project_id}`
- Status stored in `runtime/cache/screenshot/{project_id}.json`
- Frontend polls status via Ajax endpoint
- Uses LibreOffice headless (replaces Word COM) or external conversion service

## 5. Frontend Design

### 5.1 Module Complexity Classification

**Simple (CRUD table + standard form)**:
- Project, Visit (list), Field (read-only), Unit

**Medium (CRUD + custom features)**:
- Codelist (nested options sub-table)
- VisitForm Matrix (checkbox grid)
- Form Preview (server-rendered CRF)

**Complex (hand-built UI)**:
- Form Designer (drag-drop, field library, property editor)

### 5.2 UI Component Mapping

| Element Plus | FastAdmin Equivalent |
|-------------|---------------------|
| el-table | Bootstrap-table (Table.api.init) |
| el-dialog | Layer.js (Fast.api.open / Layer.open) |
| el-tabs | Bootstrap Tabs |
| el-select (remote) | SelectPage (data-source) |
| el-button | Bootstrap btn classes |
| el-input-number | Standard input + validation |
| vuedraggable | Sortable.js (FastAdmin dragsort) |

### 5.3 Form Designer Architecture (form.js)

```
RequireJS define([
  'jquery', 'bootstrap', 'backend', 'table', 'form',
  'sortablejs'
], function($, undefined, Backend, Table, Form, Sortable) {
  // Field Library: SelectPage + server search
  // Canvas: Sortable.js (reorder mode), Ajax save weigh
  // Property Panel: jQuery DOM population from data-attributes
  // Save: serialize canvas -> POST /admin/form/saveDesign
});
```

### 5.4 CRF Preview Rendering

Server-side PHP rendering in `view/form/preview.html`:
- Controller queries FormField + FieldDefinition + Codelist + CodelistOption + Unit
- PHP template generates HTML table structure
- `trailing_underscore` applied during render: if flag=1, append "_" to option display text
- No JavaScript interactivity (pure read-only)

## 6. Data Migration Strategy

### 6.1 Approach: Offline one-way ETL

1. Freeze source system writes, backup SQLite + uploads + config
2. Create MySQL staging schema with all `fa_` tables
3. ETL script preserves original IDs to minimize FK remapping
4. Transform: datetime -> int(10) UNIX timestamp
5. Transform: sequence/order_index/sort_order -> weigh (compressed 1..n per scope)
6. Normalize: log rows unified to is_log_row=1 + field_definition_id=NULL
7. Clean: 0-based/1-based sort inconsistencies resolved

### 6.2 Validation Checks

- Table row counts match
- Orphan FK scan (no dangling references)
- Active-data uniqueness scan (name/code/variable_name per scope)
- Weigh continuity scan (no gaps or duplicates per scope)
- Sample export/import regression test (compare DOCX output)

### 6.3 Rollback

Keep original Python/Vue + SQLite as complete runnable snapshot. If cutover fails, revert to old app. No reverse sync attempted.

## 7. PBT Properties

### 7.1 Weigh Ordering Invariants

| Property | Definition | Falsification |
|----------|-----------|---------------|
| Continuity | For any scope, weigh values are always 1..n with no gaps | After any insert/move/delete, query scope and verify sequence |
| Uniqueness | No two records in same scope share same weigh | Concurrent inserts to same scope must not produce duplicates |
| Idempotency | compress(scope) called twice yields same result | Run compress, record state, run again, compare |
| Monotonic insert | insert(position=k) shifts all items >= k up by 1 | Insert at position 3 in 5-item list, verify items 3-5 shifted |

### 7.2 Soft Delete Invariants

| Property | Definition | Falsification |
|----------|-----------|---------------|
| Active uniqueness | No two active records (deletetime=NULL) share same name in scope | Create A, soft-delete A, create A again -> must succeed |
| Restore safety | Restoring soft-deleted record with name conflict fails gracefully | Soft-delete A, create B(name=A), restore A -> must error |
| Cascade visibility | Soft-deleted parent's children hidden from default queries | Delete project, query its visits -> must return empty |

### 7.3 Reference Check Invariants

| Property | Definition | Falsification |
|----------|-----------|---------------|
| Block guarantee | Cannot delete referenced record without force | Delete codelist referenced by field_definition -> must 409 |
| Complete coverage | All FK paths are checked | For each FK relationship, attempt delete and verify check |
| Form strict block | Form with visit_form associations never deleted | Attempt delete form with associations -> always 409, no force option |

### 7.4 Data Migration Invariants

| Property | Definition | Falsification |
|----------|-----------|---------------|
| Round-trip count | Source row count == target row count per table | Compare counts after ETL |
| ID preservation | All original IDs preserved in target | Sample check: source.id == target.id |
| Timestamp accuracy | abs(unix_timestamp(source.created_at) - target.createtime) < 2 | Compare converted timestamps |
| Sort normalization | All weigh values in target are continuous 1..n | Query each scope, verify no gaps |

### 7.5 Export/Import Round-trip

| Property | Definition | Falsification |
|----------|-----------|---------------|
| Structure preservation | Export then re-import yields equivalent field structure | Export project, import DOCX, compare field counts/types/order |
| Rendering consistency | Preview HTML matches export DOCX structure | Compare table/row/cell counts between preview and exported document |
