# Proposal: 设置细节优化、导入入口重排、筛选号格式持久化与 Word 访视分布图对齐

## Change ID
`settings-export-import-metadata-polish`

## 目标

围绕当前已确认的 7 项细节改动，产出一组可直接进入 `/ccg:spec-plan` 的研究结论与约束集合，避免在后续规划阶段重复做边界判断：

1. **编辑模式显示语义调整**：关闭编辑模式时仍显示表单设计按钮；设置中的编辑模式切换器改为与主题模式一致的 inline-prompt 形式，关闭显示“简要”，开启显示“完全”。
2. **主界面导入入口重排与样式统一**：右上角“导入模板”改成与“导出Word”一致的样式；右上角“导入Word”移除，并挪到设置中的“导入项目”下面，样式与“导入项目”一致。
3. **设置面板分组简化**：删除“数据导出”文字标题，仅保留横向分隔，不改变原有导出/导入能力。
4. **项目封面页元数据扩展**：在“项目信息”→“封面页信息”中，于“方案编号”下新增“筛选号格式”文本框，默认值为 `S|__|__||__|__|__|`。
5. **Word 导出结构修正**：`表单访视分布图` 所在页改为横向；目录末尾分页符改为“分节符（下一页）”；访视分布图末尾也使用“分节符（下一页）”。
6. **持久化与导出同步**：新增的“筛选号格式”不是纯前端字段，而是项目级持久化元数据，并同步用于 Word 封面页导出。
7. **测试边界明确**：本次变更需同步覆盖前端壳层设置/入口布局、项目元数据保存链路、Word 导出 section/orientation 与现有访视分布图标记语义三条回归链路。

## 用户已确认的范围约束

1. 新增的“筛选号格式”字段**必须同步用于替换** Word 封面页当前固定写死的“筛选号”内容。
2. “导入Word”移动到设置后，**右上角原入口移除**，不做双入口并存。
3. 本次新增字段入口限定在 **`项目信息` 页面**，不是新建项目弹窗重构。
4. 本次是**现有功能细节修正与语义对齐**，不是新的导入导出流程设计或全局 UI 重构。

---

## 技术边界

- 保持现有前后端分层：`routers -> repositories/services -> models/schemas`。
- 前端设置与入口调整优先在现有 `frontend/src/App.vue` 和现有组件结构内完成，不新增全局状态层。
- 编辑模式仍继续控制“选项 / 单位 / 字段”等高级标签页的显示；本次只放宽“设计表单”按钮的可见性，不把整个应用切回完全编辑态。
- `editMode` 仍沿用当前本地持久化机制；切换器只是交互与文案语义调整，不引入新配置源。
- Word 导出仍以 `backend/src/services/export_service.py` 为单一导出主链路，不拆新导出服务。
- `表单访视分布图` 本次仅调整 section/orientation 相关结构，不改变现有 `×` 标记语义。
- 目录页与访视分布图页之间必须是“下一页分节”，以便单独控制分布图页的横向纸张方向。
- 访视分布图页结束后也必须是“下一页分节”，以便后续表单内容恢复到正常 section 设置并继续沿用页眉页脚逻辑。
- 封面页与目录页仍需保持现有“前两个表分别是封面表和访视分布图表”的导入前提，不破坏 `docx_import_service.py` 当前“跳过前两个表”的假设。
- 新增“筛选号格式”字段不能只改前端；必须同步覆盖：
  - `Project` ORM 模型
  - `ProjectCreate / ProjectUpdate / ProjectResponse`
  - 项目 CRUD 返回
  - 老 SQLite 数据库升级迁移
  - 项目复制
  - 项目 `.db` 导入/导出兼容链路
  - Word 封面页渲染
- 设置中的“数据导出”文字标题删除后，只允许改变视觉分组方式，不改变“导出所有项目 / 导出当前项目 / 导入项目 / 导入Word”这些动作的现有职责边界。

---

## Scope

### In Scope
- `frontend/src/App.vue` 中头部按钮区与设置弹窗的布局、按钮样式、按钮位置调整。
- `frontend/src/components/FormDesignerTab.vue` 中“设计表单”按钮的显示条件调整。
- `frontend/src/components/ProjectInfoTab.vue` 中新增“筛选号格式”输入项及默认值回填语义。
- 后端项目元数据链路新增一个用于保存“筛选号格式”的项目字段，并完成数据库迁移与序列化。
- `backend/src/services/export_service.py` 中封面页“筛选号”渲染改为读取项目字段。
- `backend/src/services/export_service.py` 中目录页尾 / 访视分布图页尾 section 结构调整。
- `backend/src/services/export_service.py` 中访视分布图的页面方向与 section 结构调整，并保持现有 `×` 标记语义。
- 与上述行为直接相关的前后端回归测试更新或新增。

### Out of Scope
- 不重构编辑模式的整体权限模型，不放宽“选项 / 单位 / 字段”标签页的显示条件。
- 不新增“导入Word”第二套执行流程，只移动现有入口。
- 不重构项目创建弹窗，不要求在“新建项目”时就录入“筛选号格式”。
- 不扩展封面页新增更多元数据字段；本次只覆盖“筛选号格式”这一项新增持久化字段。
- 不改变 docx 导入“跳过前两个表”的基本策略。
- 不把本次变更扩展为通用文档 section 模板引擎或通用项目元数据框架改造。

---

## 发现的关键约束与风险

### C1. 编辑模式与设计按钮当前是硬耦合的
- 当前 `FormDesignerTab.vue` 中“设计表单”按钮受 `editMode && selectedForm` 控制。
- 放宽按钮可见性后，设置说明文案也必须同步修正；否则“开启后显示……表单编辑按钮”的提示将变成错误描述。

### C2. 头部按钮与设置按钮的视觉语义已有约定
- 当前头部 `导出Word` 使用 `warning` 样式；`导入模板` 当前是 `primary`。
- 设置中的导入导出操作区当前是统一的普通按钮风格；“导入Word”移入此处后应复用同一视觉等级，避免在设置区引入头部警示样式。

### C3. 访视分布图当前是布尔关联语义
- 当前导出逻辑只构建 `(visit_id, form_id) -> True`，命中时写 `×`。
- 本次变更保持该语义不变，只调整 section/orientation 相关导出结构。

### C4. 页面方向是 section 级能力，不是表格级能力
- 仅把分布图页设为横向，必须通过 section break 拆分目录、分布图、后续表单内容。
- 新 section 之后仍要满足当前页眉页脚补齐逻辑，否则容易出现导出文档中才可见的页眉页脚丢失或方向漂移。

### C5. “筛选号格式”当前并非持久化字段
- 现有封面页里的“筛选号”是 `export_service.py` 中硬编码的默认字符串。
- 一旦改为项目可编辑字段，就必须同时处理数据库迁移、schema、复制、导入和导出链路，否则会出现旧库缺列、复制丢字段或导入静默丢值。

### C6. 旧库兼容不能只依赖 `Base.metadata.create_all`
- 项目使用的是 `backend/src/database.py` 中的手写 SQLite 迁移，不是 Alembic。
- 新增 `project` 表字段后，老数据库不会自动补列；必须有显式迁移逻辑。

### C7. docx 导入链路依赖封面/分布图表结构稳定
- `docx_import_service.py` 当前通过“跳过前两个表”避开封面与访视分布图。
- 本次可以调整 section、方向和单元格内容，但不能把封面表/分布图表的整体表格位置关系打散。

---

## Success Criteria

1. 设置中的“编辑模式”使用与“主题模式”一致的 inline-prompt 开关：关闭显示“简要”，开启显示“完全”。
2. 关闭编辑模式时，表单页在已选中表单的前提下仍可看到“设计表单”按钮。
3. 关闭编辑模式时，`选项 / 单位 / 字段` 等仅编辑态标签页仍保持原有隐藏规则，不发生额外放宽。
4. 主界面右上角保留“导入模板”和“导出Word”，其中“导入模板”样式与“导出Word”一致；右上角不再显示“导入Word”。
5. 设置弹窗中不再显示“数据导出”标题文字，只保留横向分隔；“导入Word”出现在“导入项目”下方，样式与“导入项目”一致。
6. `ProjectInfoTab` 在“方案编号”下方显示“筛选号格式”输入框；当项目当前值为空时，默认显示 `S|__|__||__|__|__|`。
7. 保存项目后，“筛选号格式”能够在重新加载项目、项目复制、项目数据库导入导出回环后继续保留。
8. Word 封面页中的“筛选号”内容来源于项目保存值，而不是固定写死字符串。
9. Word 导出的目录末尾是“下一页分节”，后续 `表单访视分布图` 页面为横向。
10. `表单访视分布图` 末尾也是“下一页分节”，其后的表单内容恢复到正常 section 布局且页眉页脚不丢失。
11. `表单访视分布图` 保持现有 `×` 标记语义不变。
12. docx 导出后仍保持“前两个表分别为封面表和访视分布图表”的可观察结构，不破坏当前 docx 导入前提。
13. 与上述行为相关的前端壳层测试、项目元数据测试、Word 导出测试均能稳定覆盖新语义。

---

## Affected Areas

- 前端壳层与设置：`frontend/src/App.vue`
- 表单设计页：`frontend/src/components/FormDesignerTab.vue`
- 项目信息页：`frontend/src/components/ProjectInfoTab.vue`
- Word 导出：`backend/src/services/export_service.py`
- 项目模型 / schema / 路由：`backend/src/models/project.py`, `backend/src/schemas/project.py`, `backend/src/routers/projects.py`, `backend/src/routers/admin.py`
- 数据库迁移：`backend/src/database.py`
- 项目复制 / 项目导入：`backend/src/services/project_clone_service.py`, `backend/src/services/project_import_service.py`
- 回归测试：`backend/tests/test_export_service.py`, `backend/tests/test_export_unified.py`, `backend/tests/test_project_copy.py`, `backend/tests/test_project_import.py`, `frontend/tests/appSettingsShell.test.js` 及相关前端回归用例

---

## Planning Outcome

后续 `/ccg:spec-plan` 应基于以下结论继续，而不是重新做范围判断：

- **编辑模式链路**：仅调整按钮可见性与开关呈现方式，不改变编辑态整体能力边界。
- **入口布局链路**：`导入模板` 继续保留头部快捷入口但升级样式；`导入Word` 从头部转入设置区，不保留双入口。
- **项目元数据链路**：`筛选号格式` 是项目级持久化字段，不是导出时临时参数。
- **Word 导出链路**：分布图的方向与分页由 section 控制；本次保持现有 `×` 标记语义不变。
- **兼容性链路**：新增项目字段必须同步处理数据库迁移、复制、导入导出与序列化，避免只在 UI 或导出处做半截修改。