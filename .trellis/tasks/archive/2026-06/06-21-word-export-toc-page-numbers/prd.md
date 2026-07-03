# brainstorm: 导出Word目录页码

## Goal

修复或完善 Word 导出文件中的目录页码显示问题，确保导出的 `.docx` 目录不再缺少页码，方便使用者按目录定位 CRF 内容。

## What I already know

* 用户反馈：导出 Word 文件的目录没有页码。
* 项目已有 Word 导出能力，且项目说明提到存在目录页码预计算服务与导出回退机制。
* 已定位到导出接口 `backend/src/routers/export.py` 会传入 `bake_toc_page_numbers=True`，问题不是路由漏传参数。
* 当前 `ExportService._bake_toc_page_numbers()` 只有在 `toc_pagination.compute_heading_pages()` 返回页码时才把页码写入目录。
* 当前 `toc_pagination.compute_heading_pages()` 依赖 LibreOffice 渲染 PDF，并依赖 `pypdf` 读取 PDF 大纲；任一环节不可用都会返回空 dict。
* 当前回退行为是保留空 PAGEREF 占位并依赖 Word 打开时更新域；`backend/tests/test_export_service.py` 里已有测试固定“无烘焙时页码占位为空”。

## Assumptions (temporary)

* 问题发生在导出的 Word `.docx` 目录（TOC）区域，而不是普通章节标题或页脚页码。
* 期望是目录条目右侧在首次打开文件时就能看到对应页码，而不是要求用户手动更新域。
* 用户当前运行环境可能没有 LibreOffice 或缺少 `pypdf`，导致服务器侧无法写死真实页码。

## Open Questions

* MVP 应优先保证“首次打开就可见页码”，还是保留“只有安装 LibreOffice/pypdf 才写死真实页码”的现有策略？

## Requirements (evolving)

* 导出的 Word 文件目录应显示页码。
* 实现应尽量沿用现有 Word 导出和目录页码预计算机制。
* 采用“不留空页码”策略：LibreOffice/pypdf 可用时写入真实页码；不可用或计算失败时，也要填入非空回退页码。
* 回退页码必须保留现有 `PAGEREF` 域和 `updateFields=true`，让 Word 打开或更新域后仍可校正到真实页码。
* 当页码烘焙依赖缺失或计算失败时，记录清晰日志用于定位，但不阻断导出。

## Acceptance Criteria (evolving)

* [x] 导出 `.docx` 后，每条目录条目右侧页码文本非空。
* [x] LibreOffice/pypdf 可用时，目录条目页码继续使用真实渲染页码。
* [x] LibreOffice/pypdf 不可用或页码计算失败时，目录条目不再显示空白页码。
* [x] 回退结果保留 `PAGEREF` 域、TOC 外层域和 `updateFields=true`。
* [x] 页码烘焙依赖缺失或计算失败时有可定位日志，且导出继续成功。
* [x] 没有破坏现有 Word 导出格式、标题、表格与预览/导出一致性。
* [x] 添加或更新覆盖目录页码行为的后端测试。

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (explicit)

* 暂不改变 Word 导出的整体版式体系。
* 暂不引入新的外部依赖或修改发布流程。

## Research Notes

### Constraints from current repo

* `backend/src/routers/export.py` already enables `bake_toc_page_numbers=True` for the export API.
* `backend/src/services/export_service.py` creates pre-rendered TOC entries with `PAGEREF` fields and empty `w:t` page-number placeholders.
* `backend/src/services/toc_pagination.py` computes real pages only through LibreOffice PDF rendering plus `pypdf` outline parsing.
* If LibreOffice rendering or `pypdf` parsing fails, the exported `.docx` keeps empty page-number placeholders and relies on Word field refresh.
* Existing tests include both the empty-placeholder fallback and a LibreOffice-gated real-page-number test.

### Feasible approaches here

**Approach A: Make dependency failure visible and document/runtime-check it**

* How it works: keep current architecture; ensure deployment includes LibreOffice + `pypdf`; add clearer logs/docs/admin warning if unavailable.
* Pros: least code risk; page numbers remain based on real rendered pagination.
* Cons: still environment-dependent; users without the dependency may continue seeing empty page numbers.

**Approach B: Change fallback so exported files do not contain blank page numbers** (Recommended, selected)

* How it works: when real baking fails, fill a safe fallback page number/result text instead of leaving an empty placeholder, while preserving `PAGEREF` fields and `updateFields=true` so Word can refine later.
* Pros: avoids visibly blank TOC; works without LibreOffice; small code/test change.
* Cons: fallback page numbers may be approximate unless Word updates fields.

**Approach C: Require LibreOffice/pypdf for Word export with TOC pages**

* How it works: export fails or warns hard when page baking cannot run.
* Pros: guarantees no blank page numbers in successful exports.
* Cons: higher operational burden; more disruptive; export may fail in local/desktop environments.

## Decision (ADR-lite)

**Context**: The export API already enables server-side TOC page-number baking, but the baking path depends on LibreOffice plus `pypdf`. When those are unavailable, current code leaves empty page-number placeholders and relies on Word field refresh, causing users to see a directory with no page numbers.

**Decision**: Use the “do not leave blank page numbers” fallback. Keep real LibreOffice-based page baking when available; when it is unavailable or incomplete, write a non-empty fallback page-number result while preserving fields for later correction. Also add clear non-blocking logs for dependency or calculation failures.

**Consequences**: Exported documents no longer show blank TOC page numbers in dependency-limited environments. Fallback numbers may be approximate until Word updates fields, so tests must verify field preservation and non-empty fallback separately from real-page baking. Logs help diagnose why real baking did not happen without disrupting users.

## Technical Approach

* Update `ExportService` TOC page-number fallback so every recorded page-number placeholder receives a non-empty value when real baking cannot fill it.
* Preserve the existing TOC/PAGEREF field structure and `updateFields=true` behavior so Word can still recalculate accurate values.
* Keep the existing LibreOffice + `pypdf` path as the preferred source of true page numbers.
* Add or adjust backend tests in `backend/tests/test_export_service.py` to cover non-empty fallback, real-baking preservation semantics, and field preservation.
* Add clear logs around baking skip/failure/incomplete fallback without making export fail.

## Implementation Plan

* PR1 / test-first: add a failing backend regression for missing TOC page numbers when page baking returns empty or incomplete results.
* PR2 / implementation: fill non-empty fallback page-number text for unfilled TOC entries while preserving PAGEREF and TOC fields; add logs.
* PR3 / verification: run targeted backend tests for Word export/TOC and any lightweight syntax checks needed for changed Python files.

## Technical Notes

* Checked: `backend/src/routers/export.py`
* Checked: `backend/src/services/export_service.py`
* Checked: `backend/src/services/toc_pagination.py`
* Checked: `backend/tests/test_export_service.py`
