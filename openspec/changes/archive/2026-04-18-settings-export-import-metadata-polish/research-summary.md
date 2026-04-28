## Research Summary for OPSX

**Discovered Constraints**:
- 编辑模式当前通过 `App.vue` 的全局状态控制多个标签页显示，同时 `FormDesignerTab.vue` 里的“设计表单”按钮也被 `editMode && selectedForm` 硬绑定。
- 设置中的“主题模式”已经使用 `inline-prompt` + `active-text/inactive-text` 形式，可作为“编辑模式”切换器的现有视觉参照。
- 头部右侧当前只有 `导入Word`、`导入模板`、`导出Word` 三个快捷操作；设置区当前有“导出所有项目 / 导出当前项目 / 导入项目”动作区。
- 设置中的“数据导出”是带标题的 `el-divider`；用户要求仅保留横向分隔，不再显示该标题文字。
- `ProjectInfoTab.vue` 当前只编辑 `protocol_number` 等已有字段；“筛选号格式”尚无前后端持久化字段。
- Word 封面页中的“筛选号”目前是 `backend/src/services/export_service.py` 中硬编码的 `S|__|__||__|__|__|`，不是项目字段。
- 项目新增字段必须同步覆盖 `Project` ORM、Pydantic schema、项目 CRUD、管理员响应模型、项目复制、项目导入兼容和 SQLite 手写迁移。
- 访视分布图当前是布尔关联语义，单元格写 `×`；本次变更要求保持该标记语义不变。
- 页面方向是 section 级别控制；当前目录末尾是 `page break`，访视分布图尾部是 `NEW_PAGE section`。若要让分布图单独横向，必须把目录末尾也改成新的 section 边界。
- 当前导出文档结构被测试和 docx 导入链路默认约束为：`doc.tables[0]` 是封面表，`doc.tables[1]` 是访视分布图表；不能破坏这一点。

**Dependencies**:
- 前端：`frontend/src/App.vue`, `frontend/src/components/FormDesignerTab.vue`, `frontend/src/components/ProjectInfoTab.vue`
- 后端导出：`backend/src/services/export_service.py`
- 后端项目元数据：`backend/src/models/project.py`, `backend/src/schemas/project.py`, `backend/src/routers/projects.py`, `backend/src/routers/admin.py`
- 兼容链路：`backend/src/database.py`, `backend/src/services/project_clone_service.py`, `backend/src/services/project_import_service.py`
- 测试：`backend/tests/test_export_service.py`, `backend/tests/test_export_unified.py`, `backend/tests/test_project_copy.py`, `backend/tests/test_project_import.py`, `frontend/tests/appSettingsShell.test.js`

**Risks & Mitigations**:
- Risk: 分布图横向 section 调整后，页眉页脚或后续页面方向可能漂移。  
  Mitigation: 后续实现必须把 section 拆分与现有 `_apply_header_to_section/_apply_footer_to_section` 逻辑一起规划和验证。
- Risk: 新增 `project` 字段若只改 ORM/schema，不补 SQLite 迁移，会在旧库上失败。  
  Mitigation: 后续规划必须包含 `backend/src/database.py` 的显式补列迁移。
- Risk: 新增字段若漏改复制/导入显式字段列表，会出现静默丢值。  
  Mitigation: 后续规划必须把 `project_clone_service.py` 和 `project_import_service.py` 视为必改点而非参考点。
- Risk: 移动 `导入Word` 入口后用户可能误以为功能被删除。  
  Mitigation: 通过设置区同层级入口保留能力，并在头部仅移除按钮，不改对话框和执行逻辑本身。

**Success Criteria**:
- 编辑模式关闭时，“设计表单”按钮仍可见，但高级编辑标签页仍按原规则隐藏。
- 设置中的编辑模式切换器以 `简要/完全` 呈现，交互样式与主题模式一致。
- 右上角仅保留 `导入模板` 与 `导出Word`；`导入模板` 样式与 `导出Word` 对齐；`导入Word` 迁移至设置区“导入项目”下方。
- 设置区不再显示“数据导出”标题，仅保留横向分隔。
- `ProjectInfoTab` 新增“筛选号格式”字段，默认值为 `S|__|__||__|__|__|`，保存后可持久化。
- Word 封面页“筛选号”读取项目保存值。
- Word 目录末尾与访视分布图末尾均为“下一页分节”，访视分布图页为横向。
- Word 访视分布图中的关联单元格继续显示 `×`，不改为数字序号。
- 现有 docx 导入“跳过前两个表”的结构前提不被破坏。

**User Confirmations**:
- “筛选号格式”必须同步用于替换 Word 封面页当前固定的“筛选号”内容。
- “导入Word”移到设置里后，主界面右上角原按钮移除。
- 访视分布图继续保持现有 `×` 标记语义，不在本次 change 中切换为数字。
