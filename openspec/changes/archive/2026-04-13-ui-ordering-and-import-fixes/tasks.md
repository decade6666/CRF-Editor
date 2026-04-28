# UI Ordering and Import Fixes — Tasks

- [x] 1.1 在 `frontend/src/App.vue` 与相关样式落点中，仅针对侧边栏项目列表的复制按钮建立默认 / hover / active 三态对比度规则，不影响删除按钮和其他 link 按钮
- [x] 1.2 为侧边栏复制按钮补充最小前端结构 / 样式校验，确保修复作用域仍限定在 `.project-item` / `.project-actions` 上

- [x] 2.1 在 `frontend/src/components/FormDesignerTab.vue` 中让手动序号编辑与 `FieldsTab.vue` 对齐：过滤态下禁用 `el-input-number`，非过滤态下走”本地重排 + reorder + reload”统一路径
- [x] 2.2 统一 `frontend/src/composables/useSortableTable.js`、`frontend/src/components/FieldsTab.vue`、`frontend/src/components/FormDesignerTab.vue` 的排序交互约束，保证拖拽与手动序号都只通过现有 reorder 接口持久化
- [x] 2.3 为排序一致性补充前端结构测试与后端契约验证，覆盖完整列表态、过滤态禁用、非法 reorder 不改状态三类场景

- [x] 3.1 扩展 `backend/src/services/import_service.py:get_template_form_fields()` 与 `backend/src/routers/import_template.py` 的 preview schema，使其返回 `FormDesignerTab.vue` 左侧强一致预览所需的结构行、样式和嵌套 field-definition 数据
- [x] 3.2 调整 `frontend/src/components/TemplatePreviewDialog.vue`，将右侧列表从”普通字段勾选”升级为”可导入项勾选”，左右两边都显示普通字段、标签行和日志行，并统一使用源 `form_field.id` 作为选择值
- [x] 3.3 让模板预览左侧复用设计器语义，而不是继续依赖 `SimulatedCRFForm` 的扁平字段渲染
- [x] 3.4 移除模板预览 / 导入运行时对源模板 `.db` 的写入补列行为，改为严格只读访问；对不兼容旧模板返回稳定 JSON 错误（`detail` + `code`）
- [x] 3.5 新增一个只针对模板库 `.db` 的迁移脚本：输入旧模板库，输出新的兼容 `.db` 文件，原文件保持不变
- [x] 3.6 在 `backend/src/services/import_service.py:_do_import()` 中补齐导入执行对 `bg_color`、`text_color` 等预览相关属性的复制，并保留结构性行的导入能力
- [x] 3.7 为模板预览、执行导入与模板迁移脚本补充测试，覆盖结构行可见且可勾选、`field_ids` 使用源 `form_field.id`、源库只读、旧模板错误码、迁移脚本输出新文件等场景

- [x] 4.1 在 `backend/src/database.py` 中修复 legacy `form_field.sort_order -> order_index` 迁移，禁止使用会丢失主键 / 外键 / 非空 / `order_index` 语义的重建方式
- [x] 4.2 补充”新导出项目 `.db` 可再导入”的根因回归验证：覆盖宿主库迁移完成后的导出 → 单项目导入回环，不再触发 `FormField NULL identity key`
- [x] 4.3 保持 `/api/projects/import/project-db` 与 `/api/projects/import/database-merge` 共用 `原名 → 原名_导入 → 原名_导入2 ...` 命名 helper，且查重范围仅限当前 owner 的未删除项目
- [x] 4.4 在 `backend/src/services/project_import_service.py` / `backend/src/routers/projects.py` 中收敛项目导入错误契约，保证已知兼容失败和未知异常都返回稳定 JSON（至少 `detail` + `code`）
- [x] 4.5 对历史坏项目导出 `.db` 明确执行”稳定拒绝而非在线修复”：在 clone / flush 前识别不兼容 `form_field` 结构并返回结构化错误
- [x] 4.6 为项目导入补充后端与前端测试，覆盖 `_导入` 递增命名、回收站不占名、未知异常返回 `detail` + `code`、失败零残留、失败重试幂等、历史坏导出稳定拒绝等场景

- [x] 5.1 运行并更新本次变更涉及的前后端测试：`backend/tests/test_project_import.py`、`backend/tests/test_import_service.py`、`backend/tests/test_phase0_ordering_contracts.py`、`frontend/tests/orderingStructure.test.js` 及新增模板预览 / 侧边栏相关测试
- [x] 5.2 在实现完成后执行变更级自检，确认排序、模板预览、模板兼容脚本、项目导入命名、错误体契约与”新导出可再导入”根因修复都与本次 OpenSpec artifacts 保持一致