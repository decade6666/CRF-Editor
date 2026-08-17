# 实现计划：工具栏与双栏对齐

> TDD：先写测试（RED）→ 最小实现（GREEN）→ 回归 + 文档同步 → 浏览器实机验证。
> 只允许触碰下列文件；不写 `VisitsTab.vue`；不运行 `npm run format`（会重排整个 src 树污染 diff）。

## 步骤 0：基线确认

```bash
cd frontend && node --test tests/*.test.js
```

预期全绿（当前 622 passed）。若基线不绿，先定位既有失败，不得带病开工。

## 步骤 1（RED）：写测试

### 1a. 修改 `frontend/tests/appSettingsShell.test.js`

- 仅改 `:55-67` 的 `header keeps template import and word export only` 用例：`headerSection`（`.header-right` 提取段）改为 `assert.doesNotMatch(headerSection, /导入模板/)`；保留导出Word 下拉的全部既有断言。
- 其余用例（settings、导出、会话、admin 结构等）零改动。

### 1b. 新增 `frontend/tests/toolbarPaneAlignment.test.js`

按 `design.md` §7 契约编写，用例清单：

1. App.vue header-right 不含「导入模板」。
2. App.vue `<FormDesignerTab` 挂载点含 `@import-template="openImportDialog"`。
3. FormDesignerTab 声明 `defineEmits(['import-template'])`。
4. `fd-formlist` 作用域内顺序断言：`搜索表单` < `导入模板` < `批量删除表单`（indexOf 比较）；导入按钮含 `type="warning"` 与 `emit('import-template')`。
5. CodelistsTab 两处工具栏、UnitsTab、FieldsTab 左栏、FormDesignerTab 表单列表均用 `class="list-toolbar"`；FieldsTab 右栏面板头用 `class="pane-tool-slot"`。
6. main.css `.list-toolbar` / `.pane-tool-slot` 契约断言（min-height 24px、margin-bottom 12px、flex、align-items center、gap 8px、flex-shrink 0）。
7. FormDesignerTab scoped `.fd-canvas-header` 断言 `min-height:24px` / `padding:0 12px` / `margin-bottom:12px`，主画布 switch 断言 `size="small"`。
8. 负 margin 守卫：CodelistsTab / UnitsTab / FieldsTab / FormDesignerTab / main.css 均 `doesNotMatch(/margin-(top|bottom):\s*-/)`。
9. 注释说明 VisitsTab 由访视子任务接线，本测试显式不覆盖。

运行（预期失败）：

```bash
cd frontend && node --test tests/appSettingsShell.test.js tests/toolbarPaneAlignment.test.js
```

## 步骤 2（GREEN）：实现

### 2a. `frontend/src/styles/main.css`

在 `.fd-formlist`（`:186`）附近布局区新增 `.list-toolbar` 与 `.pane-tool-slot` 两条规则（内容见 `design.md` §2，含 36px 槽位注释）。

### 2b. `frontend/src/App.vue`（2 处）

1. 删除 `:1139` `<el-button v-if="selectedProject" type="warning" size="small" @click="openImportDialog">导入模板</el-button>`。
2. `:1271` 改为 `<FormDesignerTab ref="formDesignerTabRef" :project-id="selectedProject.id" @import-template="openImportDialog" />`。

导入状态/弹窗/`executeImport` 零改动。

### 2c. `frontend/src/components/FormDesignerTab.vue`（3 处）

1. `:113` 后声明 `const emit = defineEmits(['import-template'])`。
2. `:3292` 工具栏改 `class="list-toolbar"`，顺序 [Plus 新建] [搜索表单 input] [导入模板按钮] [Delete 批量删除]；导入按钮 `<el-button type="warning" size="small" @click="emit('import-template')">导入模板</el-button>`。
3. scoped `:5591` `.fd-canvas-header`：`padding: 8px 12px` → `min-height: 24px; padding: 0 12px; margin-bottom: 12px`（其余属性不动）；主画布 `:3368` 的默认尺寸 `el-switch` 补 `size="small"`，把控件从 32px 收敛到 24px。

### 2d. 工具栏类替换（3 个文件）

- `CodelistsTab.vue:273`、`:343` → `class="list-toolbar"`。
- `UnitsTab.vue:135` → `class="list-toolbar"`。
- `FieldsTab.vue:385` → `class="list-toolbar"`；`:459-462` 右栏面板头 → `class="pane-tool-slot"` 且 `padding: 8px 12px` → `padding: 0 12px`（保留背景/边框/字号）。

定向验证（预期全绿）：

```bash
cd frontend && node --test tests/appSettingsShell.test.js tests/toolbarPaneAlignment.test.js tests/listActionsIconify.test.js tests/searchRankingWiring.test.js tests/formFieldPresentation.test.js tests/acrfViewToggle.test.js
```

## 步骤 3：全量回归与文档同步

```bash
cd frontend && node --test tests/*.test.js   # 预期 622+ 新用例全绿
cd frontend && npm run lint                   # 预期 0 errors（既有 prettier warnings 不计）
cd frontend && npm run build                  # 预期成功
```

文档同步（按 root CLAUDE.md 约定，功能/入口变化必须同步）：

- `README.md`、`README.en.md`：导入模板入口位置描述从「全局顶栏」改为「表单列表工具栏」。
- `frontend/.claude/CLAUDE.md`：新增共享工具栏契约条目（`.list-toolbar` / `.pane-tool-slot`、36–37px 槽位、访视接线归属）。
- 根 `.claude/CLAUDE.md`：追加本交付变更日志。
- `.trellis/spec/frontend/component-guidelines.md`：沉淀共享工具栏/顶部槽、禁止负 margin、FormDesigner 画布头 small 控件契约。
- `.claude/index.json`：如含相关条目则同步。
- 后端零改动，`backend/.claude/CLAUDE.md` 不动；不运行后端测试（无变化），如需复核可 `cd backend && python -m pytest`（可选）。

## 步骤 4：浏览器实机验证

1. `cd backend && python main.py` + `cd frontend && npm run dev`（或构建后由后端托管 dist）。
2. 明暗主题各验证：
   - 顶栏不再有「导入模板」；表单列表工具栏顺序：新建 → 搜索 → 导入模板 → 批量删除。
   - 点击「导入模板」打开导入弹窗，选择表单执行导入，表单列表自动出现新表单（验证 `refreshKey` 链路）。
   - 选项/字段/表单双栏页左右内容区顶部对齐（测量偏差 0–1px），右侧无操作槽位为等高占位。
   - 无 console error。
3. 若环境限制（无浏览器/登录/权限）无法实机验证，明确报告未运行项与替代验证范围（源码级契约测试 + build 产物）。

## 步骤 5：回滚边界

纯前端、无数据迁移。若共享槽位导致不可接受的页面回归，按文件回退 `main.css` 共享类及各组件 class 替换，并把导入入口恢复至 App 顶栏；不得以负 margin 临时补丁绕过回滚。

## 验收出口

- 全部测试通过、lint 0 errors、build OK；实机验证结果（含未运行项）写入完成汇报。
- 与访视子任务、设计器子任务的串行顺序遵守 `design.md` §6；本任务完成后通知父任务协调后续任务开始。
