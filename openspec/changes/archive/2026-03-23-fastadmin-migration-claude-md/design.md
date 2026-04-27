# Design: FastAdmin Migration — CLAUDE.md Rewrite

## Architecture Decision: Document Structure

### CLAUDE.md Target Outline (18 Sections)

```
1.  Project Overview (with target-state declaration)
2.  Business Domain Vocabulary (CRF concepts glossary)
3.  Tech Stack Snapshot
4.  Target Architecture Overview
5.  Directory Structure
6.  Controller Conventions
7.  Model Conventions
8.  Validator & Service Class Conventions
9.  Frontend JS Module Conventions
10. CRUD Generator Workflow & Applicability
11. Database Design Specification
12. Entity Relationship Diagram (text-based)
13. Migration Mapping Table (old -> new with CRUD mode)
14. Non-CRUD Modules (export, import, AI review, screenshots)
15. Non-Database State (files, config, temp artifacts)
16. Development, Running & Deployment
17. AI Assistant Work Rules
18. Glossary (unified terminology)
```

### Rationale
- Sections 1-2: Establish context and prevent AI confusion about current vs target state
- Sections 3-9: Define "how to write code" in this project — the core conventions
- Section 10: Critical for preventing CRUD generator misuse
- Sections 11-12: Database is the foundation; FastAdmin is schema-driven
- Section 13: Bridge for AI to understand what maps where
- Sections 14-15: Non-standard modules that can't be auto-generated
- Section 16: Practical "how to run it"
- Sections 17-18: AI-specific guidance and terminology alignment

## Design: Database Schema Section

### Format: Global Rules + Entity Matrix + Relationship Matrix

**Entity Matrix columns:**
| Column | Purpose |
|--------|---------|
| Target Table | `fa_` prefixed name |
| Purpose | One-line description |
| CRUD Mode | Generate / Generate+Customize / Hand-write |
| Primary Key | Always `id` int auto-increment |
| Foreign Keys | With ON DELETE behavior |
| Unique Constraints | Scoped uniqueness rules |
| Sort Field | `weigh` if applicable |
| Audit Fields | createtime, updatetime |
| Soft Delete | deletetime if applicable |
| Key Business Fields | Domain-specific columns |
| Comment Requirements | Field suffix conventions, enum formats |

**Relationship Matrix format:**
```
Project -1:N-> Visit
Project -1:N-> Form
Project -1:N-> FieldDefinition
Project -1:N-> Codelist
Project -1:N-> Unit
Visit <-M:N-> Form  (via fa_visit_form with weigh)
Form -1:N-> FormField
FormField -N:1-> FieldDefinition (nullable, log rows)
FieldDefinition -N:1-> Codelist (nullable, SET NULL)
FieldDefinition -N:1-> Unit (nullable, SET NULL)
Codelist -1:N-> CodelistOption
```

## Design: Controller Convention Documentation

### Standard Controller Template (to document, not implement)
```php
<?php
namespace app\admin\controller;

use app\common\controller\Backend;

class Example extends Backend
{
    protected $model = null;
    protected $noNeedLogin = [];
    protected $noNeedRight = [];
    protected $dataLimit = false;        // 'personal' | 'auth' | false
    protected $dataLimitField = 'admin_id';
    protected $relationSearch = false;
    protected $modelValidate = false;    // true | string (validator class)

    public function _initialize()
    {
        parent::_initialize();
        $this->model = new \app\common\model\Example;
        // Inject view variables, prepare dropdown data
    }
}
```

### Properties to Document
| Property | Type | Purpose |
|----------|------|---------|
| `$model` | Model | Bound ORM model instance |
| `$noNeedLogin` | array | Actions exempt from login check |
| `$noNeedRight` | array | Actions exempt from RBAC |
| `$dataLimit` | bool/string | Data ownership scope |
| `$dataLimitField` | string | Field for data ownership |
| `$relationSearch` | bool | Enable relation-based search |
| `$modelValidate` | bool/string | Auto-validate on save |
| `$searchFields` | string | Default search fields |
| `$importFile` | string | Import template path |

### Standard Actions
| Action | Method | Purpose | Override Needed |
|--------|--------|---------|-----------------|
| index | GET | List with pagination | Rarely |
| add | GET/POST | Create form + save | Often (custom fields) |
| edit | GET/POST | Edit form + save | Often |
| del | POST | Delete (soft/hard) | Sometimes (ref check) |
| multi | POST | Batch operations | Rarely |
| recyclebin | GET | Recycle bin list | Never (auto) |
| restore | POST | Restore from recycle | Never (auto) |
| destroy | POST | Permanent delete | Never (auto) |
| selectpage | GET | Ajax select dropdown | Rarely |
| import | POST | Excel/CSV import | Sometimes |

## Design: Frontend JS Convention Documentation

### Standard JS Module Template (to document, not implement)
```javascript
define(['jquery', 'bootstrap', 'backend', 'table', 'form'],
    function ($, undefined, Backend, Table, Form) {
    var Controller = {
        index: function () {
            Table.api.init({
                url: 'example/index',
                columns: [[
                    {checkbox: true},
                    {field: 'id', title: 'ID', sortable: true},
                    {field: 'name', title: __('Name')},
                    {field: 'createtime', title: __('Createtime'), formatter: Table.api.formatter.datetime, operate: 'RANGE', addclass: 'datetimerange'},
                    {field: 'operate', title: __('Operate'), table: table, events: Table.api.events.operate, formatter: Table.api.formatter.operate}
                ]]
            });
        },
        add: function () { Controller.api.bindevent(); },
        edit: function () { Controller.api.bindevent(); },
        api: {
            bindevent: function () {
                Form.api.bindevent($("form[role=form]"));
            }
        }
    };
    return Controller;
});
```

### Key Patterns to Document
| Pattern | API | Purpose |
|---------|-----|---------|
| Table init | `Table.api.init()` | Bootstrap-table with server-side pagination |
| Form binding | `Form.api.bindevent()` | Auto AJAX submit + validation |
| Modal dialog | `Fast.api.open()` / `Layer.open()` | Open add/edit in modal |
| Selectpage | `data-source="example/selectpage"` | Searchable dropdown |
| Drag sort | `dragsort_url: 'example/weigh'` | Native drag-sort via weigh |
| Notifications | `Toastr.success()` | User feedback |
| Date formatters | `Table.api.formatter.datetime` | Unix timestamp display |

## Design: .context/ Updates

### coding-style.md Changes
- Remove: Python (PEP 8, black, ruff, dataclasses, Pydantic) section
- Remove: JavaScript/TypeScript (Vue 3, Composition API, Zod) section
- Add: PHP (PSR-12, ThinkPHP conventions, type declarations) section
- Add: JavaScript (RequireJS, jQuery patterns, no global vars, Backend.api) section
- Preserve: General rules, Git Commits, Testing principles, Security rules

### workflow.md Changes
- Update feat flow: Add "Design schema with comments" before coding
- Update feat flow: Add "Run php think crud" step where applicable
- Update feat flow: Add "Verify CRUD output, customize as needed" step
- Update fix flow: Replace pytest references with PHP testing
- Preserve: Context Logging format (still useful for FastAdmin)
- Add: "Check CRUD applicability matrix before starting" as step 0
