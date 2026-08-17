# 实施计划：管理端与编辑器交互重构

> 父任务是集成计划，不直接启动或写业务代码。用户批准后，按 `admin → toolbar → visit-flow → designer` 依次启动拥有交付物的子任务；每个子任务完成检查后才进入下一个。

## 0. 启动前门禁

1. 确认五个任务均保持 `planning`，父子链接正确，四个子任务均有 `prd.md` / `design.md` / `implement.md`。
2. 确认父任务与四个子任务的 `implement.jsonl` / `check.jsonl` 已删除 seed-only 状态并包含真实 spec/research 条目。
3. 记录 worktree `git status`；不得直接在 main 写入。
4. 用户明确批准最终计划后：**不启动父任务**，启动第一个子任务 `08-13-admin-organization-management`；每个子任务实施前加载 `trellis-before-dev`。
5. 不并行修改 `App.vue`、`FormDesignerTab.vue` 或同一文档；每个写入切片只有一个 writer。

## 1. 集成基线

在任何业务代码变化前记录实际基线：

```bash
cd frontend && node --test tests/*.test.js
cd frontend && npm run lint
cd backend && python -m pytest
```

2026-08-14 实跑前端基线为 622 passed；lint 已知参考为 0 errors，后端已知参考约 799 passed / 4 xfailed，均以实施启动时实际运行结果为准。基线失败先确认是否为既有问题，不带病实施。禁止 `npm run format`。

## 2. 子任务一：管理员双入口与机构管理

### RED

- 重写 `adminViewStructure.test.js`：顶部双入口、用户/机构分支、用户页半宽与机构页宽壳；移除弹窗入口旧契约。
- 重写 `adminOrgPresets.test.js`：页面内双栏/窄屏堆叠、正确 Logo URL、可观察错误、Blob/Object URL 全生命周期、内置预览与键盘语义、multipart 与删除确认。
- 运行两个测试并保留失败证据。

### GREEN

- 新增 `OrganizationManagementView.vue`；迁移原弹窗能力，不复制后端逻辑。
- `AdminView.vue` 移除弹窗接线；`App.vue` 管理员分支增加顶部双入口与双壳。
- 修复 Logo 读取 URL；保存/删除/切换/卸载路径释放 Object URL。
- 删除旧 `OrganizationPresetsDialog.vue`。

### Gate

- 定向测试 → 前端全量 → lint → build。
- 浏览器验证双入口、宽/窄屏、明暗主题、Logo 上传/立即缩略图/点击放大/键盘、普通用户不可达。
- 后端机构权限与 Logo 测试在最终父级全量回归中复核。

完成并检查后归档该子任务，再启动 toolbar；不得同时写 `App.vue`。

## 3. 子任务二：模板入口、工具栏与双栏槽

### RED

- 更新 `appSettingsShell.test.js`：全局顶栏无导入按钮。
- 新增 `toolbarPaneAlignment.test.js`：App emit 接线、表单工具栏精确顺序、共享类消费、CSS 契约、FormDesigner 画布头与 small switch、无负 margin。
- 定向运行确认 RED。

### GREEN

- `main.css` 新增 `.list-toolbar` / `.pane-tool-slot`。
- App 删除全局入口，并将 `FormDesignerTab @import-template` 接至 `openImportDialog`。
- 表单工具栏顺序改为新建 → 搜索 → 导入模板 → 批删。
- Codelists/Units/Fields/FormDesigner 套用共享类；FormDesigner 画布头收敛并把默认 switch 改 small。
- 不写 `VisitsTab.vue`；仅落地供下一子任务消费的接口。

### Gate

- 定向测试、前端全量、lint、build。
- 浏览器验证模板导入完整流程与 `refreshKey` 刷新；明暗主题下双栏顶部偏差 ≤1px。
- 更新共享组件规范，禁止用负 margin 回避。

完成并检查后，依次启动 visit-flow，再启动 designer；两者都依赖本阶段结果。

## 4. 子任务三：访视流程页面化

### RED

- 新增 `visitFlowWorkspace.test.js` 十一组契约：list/flow 状态、矩阵页面化、single 只读边界、共享类消费、small switch 与根容器无私有 gap、项目复位、快编清理、Sortable 重挂、高亮恢复、预览保留、零额外网络。
- 同步 `listActionsIconify.test.js`、`orderingStructure.test.js`、`ordinalQuickEditWiring.test.js`；保留 `editingVisitId === row.id` 空格子串及 `:controls="false"` 计数 2。

### GREEN

- 在 `VisitsTab.vue` 增加 `workspaceMode` / `flowView`，移除 `showPreview` 与矩阵 dialog 包装。
- 默认 list 为全宽访视列表；flow 默认 matrix；single 左表只读、右表维护关系。
- 消费 `.list-toolbar` / `.pane-tool-slot`，流程二态 switch 使用 small，根容器不叠加私有 gap；不修改 `main.css`、不写负 margin。
- 项目切换复位；模式切换重建 Sortable；single 重挂恢复当前行高亮；预览弹窗逻辑不动。

### Gate

- 访视定向测试 + editMode/aCRF/geometry 回归 → 前端全量 → lint → build。
- 浏览器验证三态、关系增删、排序/快编、预览、项目切换、明暗主题与无 console error。

完成并检查后归档，再启动 designer。

## 5. 子任务四：设计器单线与草稿保存

### RED

- `fieldProfileCommands.test.js`：9 键差异、无差异纯绑定、有差异 update_shared、隐藏 legacy 字段保留、OID 分叉。
- `designerNewFieldDraft.test.js` / `designerHistory.test.js`：确认时序与取消保草稿、恢复先行 + 缓存失效 + 删除、链接 redo 原命令、分叉 redo、单历史记录与失败保栈。
- `paneSplit.test.js` 或新测试：三面板内缘移除、两 resizer 的 1px pseudo-line、窄屏恢复 fields/editor/preview 外缘、`.ff-item` 不变。

### GREEN

- 扩展 `buildFieldProfileCommand(candidateDefinitionPayload)`；差异仅比较 9 键，更新载荷由候选快照与编辑态合并。
- `saveDraftField` 在 busy/mutation/POST 之前按命令决定影响确认；取消返回 false。
- 历史 undo 恢复共享定义并立即失效缓存，再删实例；redo 链接路径原命令、分叉路径 preferred id。
- 三面板去内缘，6px resizer 中央绘 1px；媒体规则放在面板规则后并恢复窄屏右外缘。
- 不改后端、不改字段条目样式、不回退 toolbar 的 36–37px 顶部槽。

### Gate

- 设计器定向测试 → 前端全量 → lint → build → 后端最终全量。
- 浏览器覆盖定义级/实例级、多引用取消、OID 分叉、Undo/Redo、失败保栈、宽窄/明暗/拖拽/字段条目。

## 6. 最终父级集成审查

所有子任务完成后，不立即宣称完成。执行：

```bash
cd frontend && node --test tests/*.test.js
cd frontend && npm run lint
cd frontend && npm run build
cd backend && python -m pytest
```

并检查：

1. `git diff` 只包含四个交付面与必要文档，无临时文件、`console.log`、死代码、`frontend/dist` 跟踪内容。
2. `App.vue` 同时保留管理员双入口与 FormDesigner 导入事件接线。
3. `.list-toolbar` / `.pane-tool-slot` 被 Codelists/Units/Fields/FormDesigner/Visits 按契约消费；没有负 margin 补丁。
4. `FormDesignerTab.vue` 顶部槽与三面板边界两类改动均保留。
5. 机构候选脱敏、管理员 403、子路径 `apiUrl()`、aCRF/preview、字段定义权限与项目隔离测试无回归。
6. 浏览器最终巡检：管理员两页、模板入口、五类工具栏、三种访视状态、设计器草稿与历史，明暗主题和目标窄屏。
7. README 中英、根/frontend `CLAUDE.md`、`.claude/index.json`、`component-guidelines.md` 与最终实现一致。

## 7. 失败处理与回滚

- 单个子任务失败：停在该子任务，保留 RED/错误输出，增量修复并复跑定向门禁；第三次仍未解决时进入 build-error/debug flow。
- 发现后端接口缺口、架构变化或超出已确认产品语义：回到 Plan，不擅自扩展。
- 共享文件出现冲突：以已通过测试的前一子任务为基线，重放后一子任务最小 diff，不覆盖两边功能。
- 所有变化均为前端结构/状态，无数据迁移；可按子任务文件边界 revert。
- 浏览器因登录、权限或网络阻塞时，明确列为 not-run，并说明源码测试/build 的替代范围，不声称实机通过。

## 8. Git / PR 出口

- 代码与检查完成后先展示实际 diff、测试结果和未运行项。
- 未收到明确 commit 指令前不提交；收到后只 stage 本任务文件，按 `<type>(<scope>): <description>` 提交。
- 新分支 push 使用 `-u`，创建同仓非 draft PR 到 main；由仓库 CI 自动合并，不手动 `gh pr merge`。
- PR 批准/合并后才按明确请求清理 worktree 与分支。
