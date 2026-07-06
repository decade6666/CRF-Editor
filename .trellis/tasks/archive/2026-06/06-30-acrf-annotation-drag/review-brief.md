# 代码审查任务：aCRF 标注竖直拖动 + 持久化 + 样式/导出统一（未提交改动）

你是独立代码审查员，**只读**，不许改任何文件、不许 git 写操作。仓库根：`/root/github/CRF-Editor`。

## 审查范围
未提交的全部改动（24 个 tracked 文件 +2298/-382，加 5 个新文件）。完整补丁见：`.trellis/tasks/06-30-acrf-annotation-drag/review-scope.patch`。**请结合仓库中相关文件全文上下文审查，不要只看 diff。** 需求背景见 `.trellis/tasks/06-30-acrf-annotation-drag/prd.md`。

核心文件：
- 后端：`backend/src/models/form.py`、`database.py`、`schemas/form.py`、`routers/forms.py`、`services/export_service.py`、`project_clone_service.py`、`project_import_service.py`
- 前端：`frontend/src/composables/acrfAnnotationGeometry.js`、`useAcrfAnnotationDrag.js`、`useApi.js`、`components/FormDesignerTab.vue`、`components/VisitsTab.vue`
- 契约文档：`.trellis/spec/guides/cross-stack-contracts.md` §6

## 重点审查项（请逐项给结论）
1. **跨栈同源正确性**：后端导出 `posOffset = -120000 + Δy×3600 EMU`（+Δy 向下）与前端 `resolveAnnotationTopCm`/`emuToCm` 是否**同公式、同符号、同单位**？EMU↔px/pt/cm 换算（1in=914400 EMU=96px=72pt，0.01cm=3600 EMU）是否正确？预览默认位置 == 导出默认位置（Δy=0）是否成立？
2. **schema fail-closed 一致性**：`schemas/form.py` 的 clamp[-200,200]、`StrictInt` 拒绝非整数、`_form` 保留 key、非法 JSON/结构错误拒绝——是否在**所有写入/读取入口**（PATCH、create、`project_import` legacy 补列、`export_service._load_annotation_offsets`）行为一致？导出层遇坏数据是否 fail-safe（不崩、不把非法值写进 OOXML）？
3. **透传完整性**：`annotation_positions` 是否在 `copy_form`、`project_clone_service`、`project_import_service`（`_REQUIRED_COLUMNS` + legacy `ALTER TABLE`）、`database.py` 迁移全部覆盖？有无遗漏的表单构造/复制路径导致丢列或旧库 select 崩溃？
4. **前端拖动竞态/泄漏**：`useAcrfAnnotationDrag.js` 的防抖合并、串行化 PATCH（savePromise）、乐观更新、空→null、缓存失效、reset=删 key、dispose/flush——有无竞态、内存泄漏、丢更新、或组件卸载/切表单时的悬挂定时器？拖动门控（aCRF + editMode + 有 formId + 有持久化 key）是否严谨？
5. **VisitsTab 同源一致性**：`VisitsTab.vue` 的 `mergeFormIntoState` 是否正确把持久化结果同步回 `allForms`/`visitForms`/`matrixData.forms`/`formPreviewForm`，与 FormDesignerTab 读写**同一** `Form.annotation_positions`？有无 stale 视图或双写冲突？
6. **parity 安全**：aCRF 标注是浮动框（`w:drawing/wp:anchor`），是否确实不进入 `word_table_parity` 的表格文本比对？前端预览 JSON 提取是否会把标注文字混入 cell text？
7. **安全**：新增 `PATCH /api/forms/{id}` 路由的 ownership/auth 隔离是否有测试覆盖（`test_permission_guards.py`）？`annotation_positions` 作为外部 `.db` 导入输入，非法内容是否 fail-closed？
8. **代码质量**：是否有 CRLF↔LF 或整文件格式化 churn、无关重构、复杂度过高、重复逻辑、命名问题？

## 输出格式（务必分级，每条含 位置/问题/建议）
```
## Critical（必须修复）
1. [file:line] — 问题
   建议: ...
## Warning（建议修复）
1. [file:line] — 问题
   建议: ...
## Info（供参考）
1. [file:line] — 观察/建议
---
总计: N Critical, M Warning, K Info
一句话总体结论 + 是否可提交（PASS / REQUEST_CHANGES / NEEDS_IMPROVEMENT）+ 评分(0-100)
```
如无发现，明确写「未发现问题」，不要笼统含糊。用**中文**输出。
