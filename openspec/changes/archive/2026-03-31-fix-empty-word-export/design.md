# Technical Design — fix-empty-word-export

## 1. Architecture Overview

```
POST /prepare
  └─ ExportService.export_project_to_word(project_id, output_path)
       ├─ ProjectRepository.get_with_full_tree(project_id)   # selectinload chain
       ├─ _add_cover_page(doc, project)                      # table #1
       ├─ _add_visit_flow_diagram(doc, project)              # table #2
       └─ _add_forms_content(doc, project)                   # table #3..N (≥1)
  └─ ExportService._validate_output(output_path)             # NEW: post-save gate
       ├─ size check: os.path.getsize > 0
       ├─ parse check: Document(output_path) no-throw
       └─ structure check: len(doc.tables) >= 3
  └─ token cache: (tmp_path, filename, expire_time, owner_id)
```

## 2. Critical Fix: Generator-Validator Alignment

### Current (buggy)
```python
def _add_forms_content(self, doc: Document, project) -> None:
    if not project.forms:  # ← early return → only 2 tables → validation fails
        return
    for form in sorted(project.forms, ...):
        self._build_form_table(doc, form.fields)
```

### Target (fixed)
```python
def _add_forms_content(self, doc: Document, project) -> None:
    if not project.forms:
        self._build_form_table(doc, [])  # ← skeleton table, satisfies ≥3 invariant
        return
    for form in sorted(project.forms, ...):
        self._build_form_table(doc, form.fields)
```

**Why**: `_validate_output()` requires `len(doc.tables) >= 3`. Cover + visit-flow = 2. When no forms exist, the generator must still produce a third (skeleton) table to satisfy the validator. This is the only code change needed in `export_service.py` for correctness.

## 3. Observability Fix

### Current (opaque)
```python
except Exception:
    print(f"导出失败: {project_id}")
    traceback.print_exc()
    return False
```

### Target (structured)
```python
except Exception:
    logger.exception("导出失败 project_id=%s", project_id)
    return False
```

**Pre-condition**: `logger = logging.getLogger(__name__)` must be defined at module level. Check if already present; if not, add import + logger definition.

## 4. Router: Post-Save Validation (already in working tree)

The current working tree already contains the correct router implementation:

```python
ok = await ExportService.export_project_to_word(project_id, tmp_path)
if ok:
    valid, reason = ExportService._validate_output(tmp_path)  # post-save gate
    if not valid:
        # cleanup + HTTP 500
```

**No router changes required** — this is already implemented.

## 5. `_validate_output()` Implementation (already in working tree)

```python
@staticmethod
def _validate_output(output_path: str) -> tuple[bool, str]:
    if os.path.getsize(output_path) <= 0:
        return False, "文件为空"
    try:
        doc = Document(output_path)
        if len(doc.tables) < 3:
            return False, f"表格数不足: {len(doc.tables)}"
        return True, ""
    except Exception as e:
        return False, f"无效 docx: {e}"
```

**No changes required** — this is already implemented.

## 6. File Modification Map

| File | Change | Priority |
|------|--------|----------|
| `backend/src/services/export_service.py` | Replace `if not project.forms: return` with skeleton call | Critical |
| `backend/src/services/export_service.py` | Replace `print/traceback` with `logger.exception` | Important |
| `backend/src/routers/export.py` | Already fixed (working tree) | Done |
| `backend/tests/test_export_service.py` | Add `test_export_no_forms_produces_3_tables` | Important |
| `backend/tests/test_export_validation.py` | Already covers validation gate | Done |

## 7. Constraints and Non-Goals

- **Constraint**: Do NOT change `export_project_to_word()` signature (returns `bool`)
- **Constraint**: Do NOT change download API URL patterns
- **Non-goal**: Atomic write via secondary temp path (hardening item, future work)
- **Non-goal**: Splitting `_validate_output()` into file-level + business-level checks (future work)

## 8. Risk Register

| Risk | Severity | Mitigation |
|------|----------|-----------|
| `_build_form_table(doc, [])` signature mismatch | High | Read actual signature before implementing |
| logger not imported in export_service.py | Medium | Check import block; add if missing |
| 3-table threshold rejects future valid 2-table exports | Medium | Document the constraint; threshold is intentional business rule |
