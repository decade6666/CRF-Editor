# 导入的 log 行在设计器字段列表显示为空

## Goal

通过 Word（`.docx`）导入含「以下为log行」的表单后，设计器左侧字段列表应立即显示该行文本，与右侧预览一致；现有受影响表单也无需删除、重建或重新导入。

## Background

- 用户截图中，左侧字段列表第 1 行文本为空，右侧预览显示「以下为log行」；用户确认来源是 Word 导入，删除该行再添加后才在列表显示。
- DOCX 解析把该文字识别为 log 行标记（`backend/src/services/docx_import_service.py:637-643`），导入时创建 `is_log_row=1`、未写 `label_override` 的实例（同文件 `:1857-1869`）；字段列表 API 直接返回实例（`backend/src/routers/fields.py:311-317`）。后端每次启动会把 log 行的 `label_override` 归一为「以下为log行」（`backend/src/database.py:948-998,1381`），所以仅在重启后复现会掩盖「导入完成至下次重启」的缺陷。
- 设计器左侧只调用 `getFormFieldDisplayLabel(ff)`（`frontend/src/components/FormDesignerTab.vue:4198-4200`），该函数在覆盖标签和字段定义都为空时返回空文本（`frontend/src/composables/formFieldPresentation.js:7-9`）；预览在同一情况下回退为「以下为log行」（`frontend/src/components/FormDesignerTab.vue:4422`）。手动重加则显式写入该文本（同文件 `:2862-2901`）。

## Requirements

- R1：Word 导入完成后，不重启后端即可在设计器左侧看到 log 行的「以下为log行」；已导入且该行标签为空的表单重新打开或刷新也应正确显示。
- R2：已有非空的 log 行文本优先于默认提示；普通字段显示、右侧预览及 log 行只读属性保持原样。
- R3：本次仅修复显示，不回填或迁移数据库，不改变 Word 导入写入、字段 API 或 Word 导出的数据契约。用户已确认此范围。

## Acceptance Criteria

- [ ] AC1（R1）：导入带「以下为log行」的 Word 表单后，在不重启后端的情况下打开设计器，左侧对应行与右侧预览均显示该文本。
- [ ] AC2（R1）：已有 `label_override` 为 `null` 或空字符串的 log 行，在刷新或重新打开同一表单后自动显示默认文本；无需删除重加、重新导入或重启后端。
- [ ] AC3（R2）：非空 log 行标签仍显示其原文；普通字段的空/非空标签规则、预览文本以及 log 行只读属性均无变化。
- [ ] AC4（R3）：上述显示修复不依赖写入或迁移历史记录，且不改变导入/API/导出数据行为。

## Out of Scope

- 扩大到模板库或项目 `.db` 导入数据规范化、统一所有预览/导出文案、开放 log 行属性编辑。
- 修改现有存储、启动归一化逻辑或后端接口；这些路径仅用于理解现象和防止回归。
