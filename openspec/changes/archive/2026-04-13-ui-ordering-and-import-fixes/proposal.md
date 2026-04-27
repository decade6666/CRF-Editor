# Proposal: 修复侧边栏对比度、排序一致性、模板预览兼容与项目 .db 再导入根因

## Change ID
`ui-ordering-and-import-fixes`

## 目标

围绕当前 CRF-Editor 中已确认的 4 个现存问题，产出一组可直接进入 `/ccg:spec-impl` 的规划产物：

1. **侧边栏复制按钮对比度不足**：项目列表中的复制按钮在默认 / hover / active 态下可读性不足。
2. **“字段”与“表单”界面排序交互不一致**：拖拽或手动改序号后，前端显示与后端 `order_index` 真值同步不一致。
3. **模板导入预览能力不足**：模板预览需要升级为真正的双栏结构，左侧预览要与 `FormDesignerTab.vue` 设计器语义强一致，且所有可导入项都可勾选。
4. **项目 `.db` 导出后再导入失败**：问题不再只按“导入命名 / 错误提示”处理，而是要收敛到**根因修复**，但兼容边界限定为**修复后新导出的项目 `.db` 必须可再次导入**。

## 用户已确认的范围约束

1. 本次 change 是**修复现有问题**，不是新功能探索。
2. 第 2 条里的“表单”界面明确指 **表单列表排序**，不包含表单内字段实例排序。
3. 第 4 条问题实际发生在 **单项目导入** 入口，不是整库合并入口。
4. 模板预览右侧勾选范围采用 **全部可勾选**：普通字段、标签行、日志行都应作为可导入项。
5. 第 4 条必须覆盖**根因修复**，但兼容承诺只覆盖**修复后新导出的项目 `.db`**，不承诺自动修复已经历史导出的坏项目库。
6. 模板预览 / 模板导入运行时**不得修改用户提供的源 `.db`**；旧模板库兼容通过**单独的迁移脚本**处理。
7. 旧模板库迁移脚本只覆盖**模板库 `.db`**，并且**输出一个新的兼容文件**，不原地覆盖源文件。
8. 导入相关 API 失败契约要固定为**稳定 JSON**，至少包含 `detail` 和机器可判断的 `code`。

## 技术边界

- 保持现有前后端分层与接口责任：`routers -> repositories/services -> models/schemas`。
- 排序问题优先沿现有 dedicated `/reorder` 接口解决，不把“只更新序号”错误地下沉到通用 PUT 更新语义。
- 模板预览与执行优先复用现有接口，不在运行时通过修改源库来“补齐”旧 schema。
- 项目 `.db` 再导入问题的根因修复应优先落在**宿主数据库迁移 / 导出结果兼容性**，而不是只在导入入口做兜底提示。
- 历史已导出的坏项目 `.db` 不要求自动修复，但必须在导入阶段被**稳定识别并返回可解析 JSON 错误**，不能在 clone / flush 阶段以非结构化异常崩溃。

---

## Scope

### In Scope
- 侧边栏项目列表中复制按钮的可读性修复，且影响面仅限该上下文。
- 字段定义列表与表单列表的拖拽 / 手动改序号交互统一为同一 reorder 契约。
- 模板预览双栏化、设计器语义强一致、结构性行可见可勾选，以及执行导入与预览语义对齐。
- 模板预览 / 导入运行时严格只读；旧模板库兼容改为外部迁移脚本输出新文件。
- 修复宿主数据库中 `form_field` 相关迁移 / 导出根因，确保**修复后新导出的项目 `.db`** 可以通过单项目导入再次导入。
- 项目 `.db` 导入命名规则、稳定 JSON 错误体（`detail` + `code`）、失败零残留与失败重试幂等。

### Out of Scope
- 不新增新的排序 API 形态，不把 reorder 改成返回完整列表。
- 不扩展到“表单内字段实例排序”链路。
- 不自动修复已经历史导出的坏项目 `.db`；这类文件只要求稳定拒绝，不要求自动兼容。
- 不在运行时原地修改用户提供的模板库 `.db`。
- 不把本次变更扩展为全局异常处理中台或通用数据库迁移框架重构。

---

## Success Criteria

1. 侧边栏复制按钮在默认 / hover / active 态下都可读，且不影响删除按钮和其他 link 按钮。
2. 字段定义列表与表单列表在完整列表态下，拖拽与手动改序号都通过统一 reorder 契约持久化；过滤态下两者都被禁用。
3. 模板预览弹窗左侧使用与 `FormDesignerTab.vue` 一致的设计器语义，右侧可勾选项覆盖普通字段、标签行、日志行。
4. 模板导入执行时，`field_ids` 语义固定为源 `form_field.id`，且导入结果与左侧预览的集合与相对顺序一致。
5. 模板预览 / 导入运行时不会修改源模板 `.db`；旧模板库若不兼容，返回稳定 JSON 错误并指向迁移脚本。
6. 提供一个只针对**模板库 `.db`** 的迁移脚本，输入旧模板库，输出新的兼容 `.db` 文件，原文件保持不变。
7. 修复后新导出的项目 `.db` 通过单项目导入再次导入时，不再触发 `FormField NULL identity key`。
8. 历史坏项目 `.db` 如果不兼容，也必须在导入前或导入早期被稳定拒绝，并返回包含 `detail` + `code` 的 JSON 错误体。
9. 项目 `.db` 导入失败时，不产生半成品项目、孤儿子资源或占名残留；同一失败样本重复导入不累积脏数据。

---

## Affected Areas

- 前端：`frontend/src/App.vue`, `frontend/src/components/FieldsTab.vue`, `frontend/src/components/FormDesignerTab.vue`, `frontend/src/components/TemplatePreviewDialog.vue`, `frontend/src/composables/useSortableTable.js`
- 后端排序 / 模板导入：`backend/src/routers/import_template.py`, `backend/src/services/import_service.py`, `backend/src/routers/forms.py`, `backend/src/routers/fields.py`, `backend/src/services/order_service.py`
- 后端项目导入 / 导出根因：`backend/src/services/project_import_service.py`, `backend/src/services/project_clone_service.py`, `backend/src/routers/projects.py`, `backend/src/database.py`, `backend/main.py`
- 测试：`backend/tests/test_import_service.py`, `backend/tests/test_project_import.py`, `backend/tests/test_phase0_ordering_contracts.py`, `frontend/tests/orderingStructure.test.js` 及模板预览 / 侧边栏相关测试

---

## Planning Outcome

后续 `/ccg:spec-impl` 应按以下约束执行，而不是在实现期重新做决策：

- **排序链路**：后端真值不变，问题只在前端统一走 reorder 与显示同步。
- **模板链路**：运行时严格只读；强一致预览靠 DTO/前端语义复用实现，旧模板兼容靠外部迁移脚本，不靠修改源库。
- **项目导入链路**：导入命名与错误体只是表层契约；真正的根因修复是保证宿主数据库迁移后导出的新 `.db` 仍保有 `form_field` 的 identity / 主键语义。
- **历史坏项目导出**：不承诺自动兼容，但必须可被稳定识别并以结构化错误返回。