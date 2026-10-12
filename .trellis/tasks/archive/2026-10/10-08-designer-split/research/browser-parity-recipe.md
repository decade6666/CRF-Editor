# Research: Browser Preview Parity and Screenshot Verification Recipes

- **Query**: Proven recipes for running `backend/scripts/compare_word_table_parity.py` against live browser preview (DOM extraction, export endpoint, command line, data seeding) and taking designer preview screenshots (main canvas, fullscreen dialog, eCRF/aCRF views, headless browser setup).
- **Scope**: Internal codebase & historical task archives
- **Date**: 2026-10-10

---

## Findings

### Files Found

| File Path | Description |
|---|---|
| `/home/decade/.claude/projects/-home-decade-CRF-Editor/memory/browser-e2e-recipe.md` | Primary memory recipe for headless Chrome shell, throwaway backend env, proxy traps, and CDP etiquette |
| `/home/decade/CRF-Editor/backend/scripts/compare_word_table_parity.py` | Parity comparison CLI entry point |
| `/home/decade/CRF-Editor/backend/src/services/word_table_parity.py` | Implementation of `load_preview_table_fields`, `extract_docx_form_table_fields`, `compare_table_field_forms` |
| `/home/decade/CRF-Editor/backend/src/routers/export.py` | `POST /api/projects/{project_id}/export/word` endpoint |
| `/home/decade/CRF-Editor/.trellis/spec/guides/cross-stack-contracts.md` | §5 Strict Preview/Export Parity contract and §6 aCRF Annotation Geometry contract |
| `/home/decade/CRF-Editor/.trellis/tasks/archive/2026-06/06-30-acrf-annotation-drag/codex-review-result.md` | Evidence confirming no in-tree DOM extraction helper exists and documenting the `.wp-acrf-annotation` filtering trap |
| `/home/decade/CRF-Editor/.trellis/tasks/archive/2026-10/10-08-export-layer-cleanup/research/export_golden_harness.py` | Proven in-memory SQLite fixture seeding all form layouts, controls, and annotations |
| `/home/decade/CRF-Editor/.trellis/tasks/archive/2026-10/10-08-shared-rule-convergence/implement.md` | Word-service directory monkeypatching rules for throwaway backends |
| `/home/decade/CRF-Editor/.trellis/tasks/archive/2026-10/10-09-designer-reference-preservation/implement.md` | Real API-driven seeding recipe and throwaway verification runbook |

---

## 1. Word Table Parity (`compare_word_table_parity.py`)

### DOM Extraction Status

**Explicit Finding**: **No reusable in-tree DOM extraction snippet currently exists in the repository.**
As recorded in `.trellis/tasks/archive/2026-06/06-30-acrf-annotation-drag/codex-review-result.md:15-16`:
> "parity 的‘前端预览 JSON 不混入标注文字’目前只停留在文档契约，没有仓内实现或测试兜底。实际 DOM 里 `.wp-acrf-annotation` 是直接挂在 `<td>` / 标题行内部的，任何基于 `cell.textContent` 的预览 JSON 提取器都会把 OID/domain 一起带进去。"

### Expected JSON Schema & Extraction Rules

`backend/src/services/word_table_parity.py:100-110` expects:
```json
{
  "forms": [
    {
      "name": "表单名称",
      "tables": [
        [
          ["单元格1", "单元格2"],
          ["行2列1", "行2列2"]
        ]
      ]
    }
  ]
}
```

When evaluating in the browser context, an extractor must:
1. Target the preview page: `.word-page` (Visits preview / `VisitsTab.vue`) or `.designer-scaled-word-page` (Designer preview / `FormDesignerTab.vue`).
2. Read form titles from `.wp-form-title` (stripping heading numbering if any, though `FORM_HEADING_RE` in `word_table_parity.py:15` matches `^\s*\d+\.\s*(.+?)\s*$`).
3. Traverse `table` elements, rows (`tr`), and cells (`td`).
4. **Mandatory contract rule**: Per `.trellis/spec/guides/cross-stack-contracts.md` §6, any extractor **MUST ignore `.wp-acrf-annotation` descendants** (cloning cells or omitting elements with class `.wp-acrf-annotation` before extracting text) so that aCRF OID/domain overlays do not pollute cell text.

### Export Endpoint / API

- **HTTP Route**: `POST /api/projects/{project_id}/export/word` (`backend/src/routers/export.py:39-46`)
  - Request body (JSON): `{"annotated": false, "column_width_overrides": null}` (or `annotated: true` for aCRF).
  - Auth: `Authorization: Bearer <token>` in headers.
- **Browser Download Caveat**: Headless Chrome blocks automatic file downloads (`browser-e2e-recipe.md:21`). Call the export API directly from page context or via `httpx` with the stored Bearer token from `localStorage['crf_token']`.
- **Backend Service**: `ExportService(session).export_project_to_word(project_id, target_docx_path, bake_toc_page_numbers=False, annotated=annotated)` (`backend/src/services/export_service.py`).

### CLI Command

```bash
cd backend && env -u http_proxy -u https_proxy -u all_proxy /home/decade/.venvs/crf-editor/bin/python scripts/compare_word_table_parity.py <preview.json> <export.docx>
```
- Exit code is `0` when `exact_cell_ratio == 1.0 and report.form_order_matches == True`; otherwise `1`.
- Optional flags: `--allow-mismatch` (always exits 0), `--max-mismatches 100`.

### Proven Test Data Seeding Approaches

1. **API / Throwaway DB Seeding** (`memory/browser-e2e-recipe.md:16-17`, `10-09-designer-reference-preservation/implement.md:61`):
   - Authenticate admin (`POST /api/auth/login`).
   - Create a regular user (`POST /api/admin/users`) and reassign project owner (`UPDATE project SET owner_id = ...`) because admin accounts are restricted to the admin panel (`App.vue isAdmin` branch) with no form designer access.
   - Seed forms via `POST /api/projects/{id}/forms`, definitions via `POST /api/projects/{id}/fields/definitions`, and placed fields via `POST /api/forms/{id}/fields`.
   - Alternatively, use DOCX import chain: `POST /api/projects/{id}/import-docx/preview` -> `POST /api/projects/{id}/import-docx/execute`. Note that `docx_import_service._extract_forms` skips the first 2 tables (cover + visit distribution), so the test docx must contain two scaffolding tables first (see `backend/tests/test_word_table_parity.py::_write_docx_with_forms`).

2. **In-Memory Python Harness Seeding** (`.trellis/tasks/archive/2026-10/10-08-export-layer-cleanup/research/export_golden_harness.py`):
   - Spawns `create_engine("sqlite+pysqlite:///:memory:")` and `Base.metadata.create_all`.
   - Populates complete layout variants (`legacy portrait`, `legacy force_landscape`, `mixed_landscape`, `inline only`, empty form), all control types (radios, checkboxes with and without labels, unit texts/numbers, date/time/hour variants), structure rows (log rows with shading, custom label rows), visit associations (`VisitForm`), and aCRF annotation offsets (`annotation_positions`).

---

## 2. Form Designer Headless Browser & Screenshots

### Headless Browser Launch

```bash
/home/decade/.cache/browsers/chrome-headless-shell/linux-153.0.8010.47/chrome-headless-shell-linux64/chrome-headless-shell \
  --remote-debugging-port=9222 \
  --headless \
  --no-sandbox \
  --disable-gpu \
  --user-data-dir=/tmp/<dir>/chrome-profile \
  about:blank
```
*(No system Chrome/Chromium exists on WSL; always use this installed headless shell path).*

### Throwaway Backend Launch

```bash
cd backend && env -u http_proxy -u https_proxy -u all_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
  CRF_ENV=production \
  CRF_DATABASE_PATH=/tmp/<dir>/crf.db \
  CRF_ADMIN_BOOTSTRAP_PASSWORD='<redacted>' \
  CRF_AUTH_SECRET_KEY='<dev-only>' \
  CRF_SERVER_PORT=8901 \
  CRF_STORAGE_UPLOAD_PATH=/tmp/<dir>/uploads \
  CRF_DISABLE_BACKGROUND_JOBS=1 \
  nohup ~/.venvs/crf-editor/bin/python main.py &
```

**Critical Isolations**:
1. `CRF_ENV=production` prevents Uvicorn file watcher restarts.
2. In multi-task sessions, use dedicated port offsets (e.g. 8901, 8902, 8906).
3. Monkeypatch `DocxScreenshotService.BASE_DIR` and `DocxImportService.TEMP_DIR` in a launch wrapper to `/tmp/<dir>` (`10-08-shared-rule-convergence/implement.md:267-275`) to avoid touching `backend/uploads/`.
4. Build frontend once via `npm run build` in `frontend/`; backend serves `frontend/dist` dynamically without restarts.

### Driving CDP / chrome-devtools MCP

1. **Proxy bypass**: Unset proxy vars before connecting to 9222 (`env -u http_proxy -u https_proxy -u all_proxy`), otherwise WSL curls reach the Windows-side proxy while Node/MCP gets `ECONNREFUSED` (`browser-e2e-recipe.md:20`).
2. **Page identity**: In `/json/list`, match target by `t.id` (not `targetId`), ensuring unique URL prefix (`browser-e2e-recipe.md:23`).
3. **Targeting Preview Surfaces**:
   - **Main Canvas Preview**: Target `.fd-right .designer-scaled-word-page` in `FormDesignerTab.vue`.
   - **Fullscreen Designer Dialog**: Trigger button containing text `全屏设计` / `设计表单` in `.fd-canvas-header`. Target dialog preview container `.el-dialog .designer-scaled-word-page`.
   - **eCRF vs aCRF View Switching**: In canvas header, click the view mode toggle radio group (`eCRF` / `aCRF`), which updates `crf_view_mode`. In `aCRF` mode, `.wp-acrf-annotation` containers become visible and draggable.
4. **Capturing Screenshots**: Use chrome-devtools MCP `take_screenshot` (or CDP `Page.captureScreenshot`), optionally capturing full page or specific element bounding box.

---

## Caveats / Not Found

- **No committed DOM extractor**: An official DOM-to-parity JSON script has never been committed to `frontend/scripts` or `backend/scripts`. Parity validations in CI/regression run via backend unit fixtures (`test_word_table_parity.py`) or decompressed DOCX comparisons (`export_golden_harness.py`).
- **Interactive extraction requirement**: Anyone running `compare_word_table_parity.py` against live DOM must construct an extractor adhering to the rule: exclude elements matching `.wp-acrf-annotation *`.
