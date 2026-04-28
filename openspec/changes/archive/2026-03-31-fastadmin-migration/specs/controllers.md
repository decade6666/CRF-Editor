# Spec: Controllers

All controllers extend `\app\common\controller\Backend`.
Namespace: `app\admin\controller`.

## CRUD Matrix

| Controller | Mode | Special Methods |
|-----------|------|-----------------|
| Project | Generate+Customize | logo upload, weigh sort |
| Visit | Generate+Customize | copy, weigh sort, matrix entry |
| Form | Hand-write | saveDesign, preview, weigh sort |
| Field | Generate (list-only) | disable add/edit/del |
| Fielddefinition | Generate+Customize | copy, reference check on del |
| Codelist | Generate+Customize | sub-options embedded, reference check |
| Unit | Generate | reference check on del |
| Visitform | Hand-write | matrix grid, toggle, batch weigh |
| Export | Hand-write | prepare, download, token cleanup |
| Import | Hand-write | docx upload, template import |
| Aireview | Hand-write | review, connection test |
| Settings | Hand-write | read/write config |

## Controller Specifications

### Project

```php
class Project extends Backend {
    // Standard CRUD with recyclebin
    // add/edit: validate uniqueness WHERE deletetime IS NULL
    // del: soft delete, cascade handled by DB FK
    // Customization: logo upload via _upload(), weigh field visible in list
}
```

### Visit

```php
class Visit extends Backend {
    // Standard CRUD with recyclebin, scoped to project_id
    // add/edit: validate name/code unique in project (active only)
    // del: soft delete; no RESTRICT (visit_form cascades)
    // copy($id): duplicate visit record with new name suffix _copy
    // weigh sort: WeighService handles insert/move
}
```

### Form (Hand-write)

```php
class Form extends Backend {
    // index(): list forms in project, with field count
    // add(), edit(): standard form modal
    // del(): check visit_form count; if > 0 return 409 with association list
    // saveDesign(form_id, fields[]): save FormField order/additions via WeighService
    // preview(form_id): render CRF preview (server-side, read-only)
    // copy($id): duplicate form + all form_fields
}
```

### Field (Generate, list-only)

```php
class Field extends Backend {
    // index(): list only, readonly
    // Override add(), edit(), del() to return error "此模块为只读兼容层"
}
```

### Fielddefinition (Generate+Customize)

```php
class Fielddefinition extends Backend {
    // Standard CRUD + recyclebin, scoped to project_id
    // add/edit: validate variable_name unique in project (active only)
    // del: check FormField references via ReferenceCheckService; block if referenced
    // copy($id): duplicate with variable_name + '_copy'
    // selectpage(): support for Form Designer field library search
}
```

### Codelist (Generate+Customize)

```php
class Codelist extends Backend {
    // Standard CRUD, scoped to project_id
    // code: UNIQUE DB index (no soft delete)
    // del/batch-del: ReferenceCheckService checks FieldDefinition + Field; block if referenced
    // options subresource:
    //   optionIndex(codelist_id): list options
    //   optionAdd(codelist_id, code, decode, trailing_underscore, weigh)
    //   optionEdit(id)
    //   optionDel(id): direct delete, WeighService compresses after
    //   optionSort(codelist_id, ids[]): WeighService.batchReorder
}
```

### Unit (Generate)

```php
class Unit extends Backend {
    // Standard CRUD, scoped to project_id
    // code: UNIQUE DB index (no soft delete)
    // del: ReferenceCheckService checks FieldDefinition + Field; block if referenced
}
```

### Visitform (Hand-write)

```php
class Visitform extends Backend {
    // matrix(project_id): render visit-form checkbox grid
    // toggle(visit_id, form_id): add/remove visit_form association
    // reorder(visit_id, form_ids[]): WeighService.batchReorder for forms in visit
    // reorderVisit(project_id, visit_ids[]): update visit weigh order
}
```

### Export (Hand-write)

```php
class Export extends Backend {
    // prepare(project_id): ExportService generates DOCX, saves to
    //   runtime/cache/export/{token}.docx, returns {token, filename}
    // download(token): stream file, delete after send
    // Token cleanup: files older than 1 hour deleted on next prepare() call
    // Error handling: export failure returns JSON error, no partial file left
}
```

### Import (Hand-write)

```php
class Import extends Backend {
    // docxUpload(): receive DOCX file, return upload_id
    // docxParse(upload_id): ImportService.parseDocx() returns preview JSON
    // docxConfirm(upload_id, options): ImportService.importDocx() commits to DB
    // screenshotStatus(project_id): return ScreenshotWorker job status
    // templateUpload(): receive .db file
    // templateParse(upload_id): ImportTemplateService.parse() returns preview
    // templateConfirm(upload_id, options): ImportTemplateService.import() commits
}
```

### Aireview (Hand-write)

```php
class Aireview extends Backend {
    // review(form_id): AiReviewService.reviewForm() returns suggestions JSON
    // connectionTest(): AiReviewService.testConnection() returns ok/error
    // Graceful degradation: AI unavailable returns {success:false, message:...}
}
```

### Settings (Hand-write)

```php
class Settings extends Backend {
    // index(): load current config (ai.*, export.*, import.*)
    // save($data): write to config YAML file, clear config cache
    // Fields: ai_provider, ai_base_url, ai_api_key, ai_model
}
```
