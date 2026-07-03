# 任务：PR2 设计器前端（aCRF 标注竖直拖动 + 持久化 + 红色样式 + 三类默认 anchor + 重置）

你是被委派的执行者。PR1（后端契约）已完成并全量测试通过（540 passed），改动在工作树中**未提交**，你在其基础上叠加。先读需求，再严格在**文件范围**内实现。

## 必读
1. `.trellis/tasks/06-30-acrf-annotation-drag/prd.md`（完整需求）
2. `.trellis/tasks/06-30-acrf-annotation-drag/codex-pr1-result.md`（PR1 后端已实现的契约/常量/符号约定）
3. 后端已定义的共享常量与契约（**前端必须镜像这些几何值，保证预览与导出同形同色**）：
   - `backend/src/schemas/form.py`：`AnnotationPosition.y` 为 `0.01cm` 整数，clamp `[-200, 200]`；`_form` 为表单 domain 保留 key，字段用 `variable_name` 为 key；写入即 clamp、`StrictInt` 拒绝非整数。
   - `backend/src/services/export_service.py` 常量：`ACRF_ANNOTATION_FONT_SIZE_PT=8.0`、`HEIGHT_CM=0.7`、`PADDING_X_EMU=22860`、`PADDING_Y_EMU=18000`、`BORDER_WIDTH_EMU=12700`(=1pt)、`BOX_WIDTH_MAX_CM=4.6`、`DEFAULT_VERTICAL_OFFSET_EMU=-120000`(=-0.333cm)、`EMU_PER_01CM=int(Cm(0.01))`；颜色：边框 `C00000`、底 `FFF2F2`、字 `C00000`；契约 **posOffset = 默认 + Δy，+Δy 向下**。

## 本 PR 范围
主体前端；仅在「默认同源」必需时**小改** export_service 的默认偏移常量。禁止碰 `VisitsTab.vue`（属 PR3）、`SimulatedCRFForm.vue`（保持只读）、`TemplatePreviewDialog.vue`。
允许修改/新增：
- `frontend/src/components/FormDesignerTab.vue`（aCRF 标注渲染 L2597+、CSS `.wp-acrf-annotation` L4613-4641）
- `frontend/src/composables/useApi.js`（PATCH `annotation_positions` + 缓存失效）
- `frontend/src/composables/`：可新增一个标注拖动 composable（参考 `useRowResize.js` 的拖动手感，但**持久化走 useApi PATCH，不用 localStorage**）；共享几何常量可新增一个前端常量模块
- `frontend/tests/`（更新 `acrfViewToggle.test.js` + 新增用例）
- **仅当默认同源需要时**：`backend/src/services/export_service.py`（只动三类默认偏移常量，不动其它逻辑）；如动了，backend 全量 `python3 -m pytest -q` 必须仍全绿

## 必须实现
1. **可拖动（仅竖直）**：去掉 `.wp-acrf-annotation` 的 `pointer-events:none`，**仅在 aCRF 视图 + editMode + 存在持久化目标（有 form_id 且字段有 variable_name / 或表单 domain）时**启用上下拖动。水平方向 Phase 1 不做（固定右对齐）。
2. **持久化**：松手后把该 key 的 `y`（`0.01cm` 整数，前端换算并 clamp `[-200,200]`）通过 `useApi` PATCH 写入 `Form.annotation_positions`；带**防抖合并提交**（避免拖动过程狂发请求）。字段用 `variable_name`、表单 domain 用 `_form` 为 key。
3. **三类默认 anchor（同源硬约束）**：normal field / inline header / form-domain 三类默认竖直位置必须**不遮盖字段标签/取值区**，且 **Δy=0 时预览默认位置 == 导出默认位置**。
   - 把每类默认偏移做成**跨栈共享常量**：前端常量与后端 `export_service` 使用的默认偏移一一对应。
   - 若单一 `-120000` 相对各自 anchor 段落已对三类都不遮挡，则保持单常量；若某类（尤其 inline 4.6cm box 跨列压相邻 header）需要不同默认，则引入**分类默认常量**，并**同步修改 `export_service`** 让导出按字段类别取对应默认（此时才允许小改后端）。以「预览默认与导出默认逐类一致」为验收基准。
4. **样式统一（红色系 + 共享几何）**：预览标注改为 边框 `#C00000` + 浅红底 `#FFF2F2` + 红字 `#C00000`，font-size / height / padding / border-width / box-width 估算与后端常量换算一致（EMU↔px/pt/cm 换算写清注释）。
5. **重置**：单个标注提供重置操作，把该 key 的 `y` 置默认（等价删除该 key 或置 0）并 PATCH。
6. **缓存失效**：PATCH 成功后显式失效 `/api/forms/{id}/fields` 与 `/api/projects/{id}/forms` 相关缓存，避免 30s stale。

## 必须更新/新增测试（frontend/tests/，用 node:test）
- 更新 `acrfViewToggle.test.js`：原「`.wp-acrf-annotation` non-interactive」断言改为「aCRF+editMode+有目标时可拖」，并声明契约主动变更。
- 新增：竖直拖动换算与 clamp（px→0.01cm、越界 clamp）、三类默认 anchor 与导出默认一致的常量断言、红色样式/共享几何常量断言、重置行为、PATCH 后缓存失效。

## 完成后自检
- 前端：`cd frontend && node --test tests/*.test.js`（全绿）；`npm run lint`（无新增 error，格式 warning 可）。
- 若动了后端：`cd backend && python3 -m pytest -q`（仍 540+ 全绿）。**注意本机只有 `python3`，没有 `python`。**
- 不要 `git add/commit/push`。
- 不要引入无关格式化 churn（保持与既有代码风格一致，diff 聚焦）。
- 结束用**中文**输出：改了哪些文件、三类默认最终是「单常量」还是「分类常量」及为何、前端与后端默认如何同源、EMU↔px 换算方式、拖动/防抖/缓存失效实现要点、测试结果、未决问题。
