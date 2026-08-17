# 技术设计：管理端与编辑器交互重构

> 父任务仅负责总体契约、交付顺序与最终集成审查；实际代码由四个子任务分别实施。未经用户审阅批准，不启动任何子任务。

## 1. 交付分解与边界

| 子任务 | 交付面 | 主要写入范围 | 依赖 |
| --- | --- | --- | --- |
| `08-13-admin-organization-management` | 管理员双入口、机构管理页面化、Logo 缩略图/预览、错误 Logo URL 修复 | `App.vue` 管理员分支、`AdminView.vue`、新机构组件、管理员测试 | 无 |
| `08-13-toolbar-pane-alignment` | 模板入口迁移、共享工具栏、双栏顶部槽 | `App.vue` 普通用户分支、`main.css`、Codelists/Units/Fields/FormDesigner、测试 | admin 完成后再写 `App.vue` |
| `08-13-visit-flow-workspace` | 默认纯访视列表、页面内流程矩阵、单访视表单视图 | `VisitsTab.vue` 与访视测试 | toolbar 先提供共享 CSS 契约 |
| `08-13-designer-panel-draft-fix` | 三面板单线、草稿共享定义保存、影响确认、原子历史 | `FormDesignerTab.vue`、`formDesignerPropertyEditor.js`、设计器测试 | toolbar 先完成 `FormDesignerTab.vue` 顶部槽改造 |

父任务没有独立业务代码写入；四个子任务在同一任务 worktree / 集成分支上**串行**完成，最终形成一个集成 PR。固定顺序：

1. admin
2. toolbar
3. visit-flow
4. designer

该顺序把两个共享接口先落地：toolbar 产出 `.list-toolbar` / `.pane-tool-slot`，visit-flow 消费；toolbar 先完成 `FormDesignerTab.vue` 顶部槽，designer 后续不得回退。

## 2. 管理员工作区与机构页面

### 2.1 页面边界

`App.vue` 管理员分支持有内存态 `activeAdminPage: 'users' | 'orgs'`，通过顶部 `el-radio-group` / `el-radio-button` 切换：

- `users`：现有 `AdminView`，继续使用半宽 `.admin-shell`。
- `orgs`：新增 `OrganizationManagementView`，使用最大 1200px 的宽壳 `.admin-org-shell`。

`AdminView` 只移除机构预设弹窗入口与挂载；用户、密码、项目批量操作、回收站和清理策略不改。机构组件自包含列表、草稿、Logo 与请求状态；原 `OrganizationPresetsDialog.vue` 在能力迁移后删除。

### 2.2 机构编辑与 Logo 数据流

- 管理员 CRUD 继续走 `/api/admin/organization-presets*`；普通候选接口保持 `id/data_management_unit/has_logo` 脱敏。
- Logo 读取统一为 `/api/organization-presets/{id}/logo`，修复旧的不存在路径 `/api/admin/organization-presets/{id}/logo`。
- CRUD 优先走 `useApi.js`；multipart / Blob 必须直接 fetch 时统一使用 `apiUrl()` + `getAuthHeaders()`，保证子路径部署可用；非 2xx 必须显示可观察错误。
- 每个 `URL.createObjectURL()` 有唯一释放责任点：替换、清除、切换编辑项、删除成功、保存后列表刷新、组件卸载均 revoke；同一预设的并发 Logo 请求去重。
- 表格 Logo 列使用带鉴权取得的 Blob URL；`el-image` 提供内置放大预览。外层可聚焦并支持 Enter/Space，保留 `aria-label`。

桌面端为列表 + 右侧编辑区；≤900px 上下堆叠。未编辑时右侧显示占位，不通过弹窗切换主流程。

## 3. 模板入口与共享布局契约

### 3.1 模板入口所有权

导入状态、预览、执行与成功后的 `refreshKey++` 继续只由 `App.vue` 持有。`FormDesignerTab.vue` 只声明 `emit('import-template')`，App 挂载点接到 `openImportDialog()`，不复制业务逻辑或刷新通道。

表单列表工具栏顺序固定为：

`新建 → 搜索框 → 导入模板 → 批量删除`

全局顶栏不再渲染「导入模板」。

### 3.2 共享工具栏与顶部槽

`main.css` 提供两个语义类：

- `.list-toolbar`：有操作的列表工具栏。
- `.pane-tool-slot`：标题行或无操作侧的结构性顶部槽。

共同规则：`display:flex`、`align-items:center`、`gap:8px`、`min-height:24px`、`margin-bottom:12px`、`flex-shrink:0`。无边框槽总高 36px；带 1px 底边框的标题槽允许 37px，浏览器验收偏差上限 1px。禁止页面私有负 margin、重复 gap 或底距补丁。

应用位置：字典/选项、单位、字段、表单，以及后续 visit-flow。`FormDesignerTab` 的 `.fd-canvas-header` 改为同等槽位，并把其中默认 32px 的主画布 switch 改为 `size="small"`，否则标题仍会撑高。

## 4. 访视流程页面状态机

`VisitsTab.vue` 使用局部状态：

```text
workspaceMode: list | flow       默认 list
flowView:      matrix | single   默认 matrix
```

### 4.1 模式语义

- `list`：全宽访视列表；保留新增、复制、编辑、删除、批删、搜索、拖拽、序号快编；无右侧访视内表单区、无批量编辑。
- `flow/matrix`：页面内直接渲染既有访视—表单矩阵；单元格增删关系和删除确认不变。
- `flow/single`：左侧只读选择已有访视；不渲染访视 CRUD、选择列、拖拽把手或序号快编。右侧保留表单添加、排序、快编、预览与移除。

常驻入口工具栏使用 `.list-toolbar`；流程标题/单访视标题使用 `.pane-tool-slot`；添加表单行使用 `.list-toolbar`。流程标题内的二态 switch 使用 `size="small"`，根容器不声明会与槽位底距叠加的私有 `gap`；仅允许正向 `margin-left:auto` spacer 推右，不写负 margin。

### 4.2 生命周期

- 每次从 list 进入 flow，默认回到 matrix，并清空访视/访视表单的快编态。
- matrix ↔ single 不 reload；`visits`、`matrixData`、`allForms`、`selectedVisit` 保持。
- 项目切换复位 list/matrix、选中访视与预览，继续走现有 flush/reset/load 顺序。
- 条件挂载后重建两套 Sortable；single 左表重挂后调用 `setCurrentRow(selectedVisit)` 恢复高亮。
- 表单内容预览弹窗独立于视图切换，eCRF/aCRF、注记拖拽、行列尺寸契约不改。

## 5. 草稿字段共享更新与历史

### 5.1 命令构建

候选链接成立且 OID 保持候选值时，比较以下 9 个定义级键：

`variable_name, label, field_type, checkbox_label, integer_digits, decimal_digits, date_format, codelist_id, unit_id`

- 无差异：保持 `binding: existing + instance.upsert`，不写共享定义。
- 有差异：增加 `definition_operation.update_shared`，目标为候选定义。
- OID 改动：保持现有 `create_or_restore + binding: operation_result` 分叉。

差异只看 9 键，避免候选 legacy 字段造成零编辑假阳性；共享更新载荷使用 `buildDefinitionPayload({ ...candidateSnapshot, ...editorState })`，保留未暴露在草稿编辑器中的 `is_multi_record` / `table_type`。

### 5.2 影响确认时序

`saveDraftField` 在 OID 等本地校验完成后构造命令；仅当命令实际包含 `update_shared` 时，从命令派生目标并调用 `confirmFieldReferenceImpact`。确认必须发生在：

- `savingDraft = true` 之前；
- `beginFieldMembershipMutation()` 之前；
- 首个 POST 之前。

取消/关闭返回 false：不发请求、不进入 busy/mutation、不丢弃草稿。

### 5.3 Undo / Redo

保存仍只记录一条「新建字段」历史：

- undo：若共享定义被修改，先通过既有 PUT 恢复候选保存前快照并立即失效字段定义缓存，再删除新增实例。仅本次真正新建的定义可传 `cleanup_definition_id`；共享候选永不清理。
- redo：链接路径原样重放捕获的前向命令（从而重新应用 `update_shared`）；分叉路径继续 `create_or_restore + preferred_definition_id`。
- 回放失败沿用现有 history 机制：命令与 id 快照留栈，可重试。恢复先行避免先删实例后恢复失败导致永久无法重试。

这是撤销栈层面的逻辑原子动作；不新增后端事务接口。若 undo 后候选被外部删除，redo 按既有错误路径失败并留栈，不静默创建语义不同的共享定义。

## 6. 三面板单线

只改 `.designer-fields-panel`、`.designer-editor-card`、`.designer-preview-pane` 与两条 6px resizer：

- 面板移除朝向相邻区域的内缘边框；外缘、圆角、阴影保留。
- resizer 保持 6px 命中区，以居中 `::before` 绘制 1px 分隔线；hover/拖拽高亮与 ARIA 不变。
- ≤1100px 堆叠时 h-resizer 隐藏，必须恢复 fields/editor 右外缘和 preview 左外缘；editor↔preview 只保留 editor 的底边。
- 新媒体规则放在面板规则之后，避免被 scoped 级联覆盖。
- `.ff-item` / `.ff-selected` 等字段条目样式零改动。

## 7. 后端、安全与兼容边界

- 计划为前端零后端变更：已有机构 CRUD/Logo、访视关系、字段 profile、references 与字段定义 PUT 足够。
- 若实现验证发现接口缺口，停止对应子任务并返回规划，不擅自扩大后端契约。
- 权限、项目隔离、机构候选脱敏、位图白名单/魔数/路径校验、子路径部署、预览/export/aCRF 契约均保持。
- 不新增依赖、迁移、localStorage 键或路由框架。

## 8. 文档、验证与回滚

每个子任务先 RED 后 GREEN，并运行定向测试；父级完成最终集成门禁：

- 前端全量 `node --test tests/*.test.js`
- `npm run lint`（0 errors；禁止 `npm run format`）
- `npm run build`
- 后端全量 `python -m pytest`，证明零后端回归
- 浏览器明暗主题、宽/窄屏、键盘、拖拽、访视三态、Logo 预览、草稿保存与 Undo/Redo

同步 README 中英、根/frontend `CLAUDE.md`、`.claude/index.json`、`.trellis/spec/frontend/component-guidelines.md`。纯前端回滚按子任务文件边界 revert；无数据迁移。提交、推送与 PR 仍需遵循显式授权和仓库 PR 流程。
