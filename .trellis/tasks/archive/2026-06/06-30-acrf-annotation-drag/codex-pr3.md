# 任务：PR3 VisitsTab 预览接入 + 文档同步 + parity 复核（aCRF 标注竖直拖动收尾）

你是被委派的执行者。PR1（后端契约）与 PR2（设计器前端拖动）已完成并全量测试通过（后端 546、前端 363），**改动都在工作树中未提交**，你在其基础上叠加。

## 🚫 绝对禁止（违反即视为失败）
- **禁止任何 git 写操作**：不许 `git add` / `git commit` / `git push` / `git stash` / `git reset` / `git restore` / `git checkout -- <file>`。git 由主控 Claude 掌控。
- **禁止改动行尾符**：只编辑你需要改的具体行，**保持每个文件既有的换行风格（LF/CRLF）不变**，不要做全文件 reformat / prettier / 行尾归一化。保持 diff 聚焦，禁止无关格式化 churn。
- **不许碰**：`SimulatedCRFForm.vue`（保持只读）、`TemplatePreviewDialog.vue`；不要修改后端标注逻辑（除非发现真实 parity bug，需先说明再改）。

## 必读
1. `.trellis/tasks/06-30-acrf-annotation-drag/prd.md`
2. `.trellis/tasks/06-30-acrf-annotation-drag/codex-pr2-result.md`（PR2 已建的前端复用件与契约）
3. 复用件（**必须复用，禁止重复实现**）：`frontend/src/composables/acrfAnnotationGeometry.js`、`frontend/src/composables/useAcrfAnnotationDrag.js`；参考 `frontend/src/components/FormDesignerTab.vue` 的 aCRF 标注渲染与拖动接线方式。

## 本 PR 范围
- `frontend/src/components/VisitsTab.vue`（word-page 预览约 L744）
- 文档：`README.md`、`README.en.md`、`.claude/CLAUDE.md`(root)、`frontend/.claude/CLAUDE.md`、`.claude/index.json`（若存在）、`.trellis/spec/guides/cross-stack-contracts.md`
- `frontend/tests/`（VisitsTab aCRF 标注渲染/拖动用例）
- 只读复核（不改）：`backend/src/services/word_table_parity.py`、`backend/scripts/compare_word_table_parity.py`

## 必须实现
1. **VisitsTab word-page 预览接入 aCRF 标注**：在 aCRF 视图下渲染字段 OID / 表单 domain 标注（红色系，复用 `buildAnnotationStyle`），并支持**竖直拖动 + 持久化**，**复用同一 `Form.annotation_positions`**（经 `useAcrfAnnotationDrag` PATCH，key：字段 `variable_name` / 表单 `_form`）。与 FormDesignerTab 两处拖动写入同一存储、互相一致。
2. **拖动门控**：与 FormDesignerTab 一致——仅 aCRF 视图 + editMode + 存在持久化目标（有 form_id 且字段有 variable_name / 表单有 domain）时可拖；仅竖直。
3. **缓存失效**：PATCH 成功后同样失效 `/api/forms/{id}/fields` 与 `/api/projects/{id}/forms`。
4. **文档同步**：
   - `README.md` / `README.en.md`：功能文本加入「aCRF 标注竖直可拖动 + 持久化 + 预览/导出样式统一」。
   - root `.claude/CLAUDE.md`：Change Log 追加本次条目；相关 Cross-Stack Contracts 段补「标注几何契约」引用。
   - `frontend/.claude/CLAUDE.md`：登记新 composable（`acrfAnnotationGeometry.js`、`useAcrfAnnotationDrag.js`）与前端测试文件数变化（38→40 `.test.js`）。
   - `.trellis/spec/guides/cross-stack-contracts.md`：**新增一节「aCRF 标注几何契约」**，写清：`annotation_positions` JSON 结构与 `_form`/`variable_name` key 语义、`offset_y` 单位 `0.01cm` 整数、clamp `[-200,200]`、`posOffset = 默认(-120000 EMU) + Δy×3600`、**+Δy 向下** 的符号约定、EMU↔px/pt/cm 换算（1in=914400 EMU=96px=72pt）、以及前端 `acrfAnnotationGeometry.js` 与后端 `export_service.py`/`schemas/form.py` 常量必须同步演进。
5. **parity 复核**：确认标注是浮动框、不进入表格文本，不破坏 `word_table_parity` 严格一致；VisitsTab 预览 JSON 若含标注元素，不得泄漏进被比对的表格/行/单元格文本。

## 完成后自检（只运行测试，不做 git 操作）
- 前端：`cd frontend && node --test tests/*.test.js`（须全绿，含新用例）。
- 后端 parity 回归：`cd backend && python3 -m pytest -q tests/test_word_table_parity.py tests/test_export_acrf.py tests/test_export_service.py tests/test_export_unified.py`（须全绿）。**本机只有 `python3`，无 `python`。**
- `cd frontend && npm run lint`（无新增 error；若沙箱无网络装不了 eslint，如实说明「未跑」即可，不要伪造结果）。
- 结束用**中文**输出：改了哪些文件、VisitsTab 接线方式（如何复用 PR2 composable）、文档改了哪些段、parity 复核结论、测试结果（通过/失败/未跑分别列清）、未决问题。**再次确认你没有执行任何 git 写操作、没有改任何文件的行尾符。**
