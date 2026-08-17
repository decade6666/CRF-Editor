# 多模型代码调查汇总

> 调查日期：2026-08-13。三个 Sonnet 只读视角分别覆盖管理员/机构、访视流程、工具栏/双栏/设计器；主模型对关键源码与测试锚点进行了二次核验。Codex 调查在检索阶段超时，Antigravity 因无头环境 MCP 权限未产出，均未重试。

## 1. 管理员与机构管理

- 管理员登录后由 `frontend/src/App.vue:1078-1103` 直接挂载单一 `AdminView`，当前没有管理员级导航或页签。
- 机构预设当前由 `OrganizationPresetsDialog.vue` 弹窗承载；`frontend/tests/adminViewStructure.test.js:11-19` 明确锁定“无页签 + 弹窗入口”的旧结构。
- 机构预设 CRUD 已存在且均受管理员权限保护：`backend/src/routers/organization_presets.py:46-99`。
- 已有 Logo 下载接口为 `/api/organization-presets/{id}/logo`：`backend/src/routers/organization_presets.py:117-137`。现有机构预设编辑代码却请求 `/api/admin/organization-presets/{id}/logo`：`frontend/src/components/OrganizationPresetsDialog.vue:62-72`，该路由不存在；编辑带 Logo 预设时会收到 404，异常又被静默忽略。这是独立于新布局的既有缺陷，应在改造中回归修复。
- 当前 Logo 列仅显示“✓ 有/—”，没有缩略图或放大查看：`frontend/src/components/OrganizationPresetsDialog.vue:179-187`。
- 现有上传草稿、multipart 保存、Object URL 释放和删除确认逻辑可复用：`frontend/src/components/OrganizationPresetsDialog.vue:17-28,78-147`。
- 普通用户候选接口只返回 `id/data_management_unit/has_logo`，不暴露管理员内部名称或存储路径：`backend/src/routers/organization_presets.py:102-114`；页面化不能破坏该脱敏边界。

## 2. 访视与访视流程

- `VisitsTab.vue` 当前同时包含访视列表、右侧访视内表单列表、矩阵弹窗和表单预览；默认布局见 `frontend/src/components/VisitsTab.vue:755-905`。
- “批量编辑”按钮仅将 `showPreview` 设为 true：`frontend/src/components/VisitsTab.vue:759-773`；矩阵主体位于弹窗 `:907-945`，可在前端页面内复用。
- 单访视表单维护能力已完整存在：选择已有访视、添加表单、排序、预览、移除，见 `frontend/src/components/VisitsTab.vue:827-900`；这一块本身没有新增访视入口。
- 访视—表单关系增删仍可复用现有 API 与 `reloadVisitForms()`，预期不需后端改动。
- 页面内模式切换后必须处理拖拽 DOM 重新挂载、项目切换状态复位及现有 source-level 测试接线。

## 3. 模板导入、工具栏与双栏对齐

- “导入模板”目前位于全局顶栏：`frontend/src/App.vue:1137-1149`；表单列表工具栏位于 `frontend/src/components/FormDesignerTab.vue:3289-3300`。导入状态和弹窗仍可由 App 保持，通过子组件事件打开，避免复制业务逻辑。
- 五类页面均有小号新增/删除按钮与 180px 搜索框，但工具栏依赖分散的内联 `display:flex/gap/margin`，缺少共享语义类；FormDesigner 工具栏还缺少 `align-items:center`。统一共享工具栏样式比逐页调像素更稳健。
- 双栏错位并非同一根因：左栏通常有约 36px 工具栏占位，字段右栏没有对应占位，选项右栏使用不同下边距，表单设计画布又有独立标题栏。应统一“顶部工具区槽位”的高度，而不是给每页添加互不相同的负 margin。

## 4. 表单设计器分隔线与草稿保存

- 三块设计区域各自绘制边框/阴影，相邻区域又通过 resize 轨道分隔，形成视觉上的双线或重边；需要用一个共享分隔边界承载相邻边线，而不是简单降低所有边框颜色。
- 草稿丢失根因已经由源码与测试双重确认：
  - `saveDraftField()` 将草稿编辑值交给 `buildFieldProfileCommand()`：`frontend/src/components/FormDesignerTab.vue:2680-2738`。
  - 选择字段库候选时，`buildFieldProfileCommand()` 只发送 `binding: existing` 和实例属性，不发送定义级修改：`frontend/src/composables/formDesignerPropertyEditor.js:149-175`。
  - 现有测试反而锁定“没有 definition_operation”的旧行为：`frontend/tests/fieldProfileCommands.test.js:108-115`。
  - 已持久化字段的候选换绑路径会执行 `update_shared`：`frontend/src/composables/formDesignerPropertyEditor.js:105-123`，因此草稿路径与现有共享字段语义不一致。
- 产品上仍需明确：草稿链接字段库候选后修改定义级属性，是更新共享字段定义并提示影响范围，还是自动创建独立字段定义。两者的数据语义与实现范围不同。

## 建议的交付拆分

1. 管理员导航与机构管理页面（含 Logo 缩略图/预览及现有错误 URL 修复）。
2. 访视列表与页面内访视流程双视图。
3. 列表工具栏、模板导入入口及双栏顶部槽位一致性。
4. 表单设计器单分隔线与草稿字段保存语义修复。

`FormDesignerTab.vue` 为超大共享组件；第 3、4 项必须串行实施与审查，不能并行写同一文件。
