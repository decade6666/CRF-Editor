# 访视流程页面化 — 实施计划（TDD）

## 0. 边界与红线

- 允许修改：`frontend/src/components/VisitsTab.vue`、`frontend/tests/`（新增 `visitFlowWorkspace.test.js` + 同步受影响断言）、文档（`frontend/.claude/CLAUDE.md`、`.claude/index.json`、README 中英）。
- 红线：零后端改动；不碰 `App.vue`、`useSortableTable.js`、`useOrdinalQuickEdit.js`、`useLazyTabs.js`、`useCRFRenderer.js`、`main.css`；不引入新依赖；不提取新组件。
- 前置依赖：`08-13-toolbar-pane-alignment` 必须先完成并落地 `.list-toolbar` / `.pane-tool-slot`；本任务随后在 `VisitsTab.vue` 消费共享类，不修改 `main.css`。开始前确认不存在并行 writer。实施全程在任务分支 worktree 内，提交走父任务 PR 流程。

## 1. Step 0 — 基线

```bash
cd <worktree>/frontend && node --test tests/*.test.js   # 基线 622 passed（2026-08-14 实跑）
npm run lint                                             # 基线 0 errors
```

若基线不符（其他子任务已合入），以实际为准并更新本计划。

## 2. Step 1 — 新增测试（RED）

新建 `frontend/tests/visitFlowWorkspace.test.js`，按 design.md §8 十一组断言（源码级正则 / 计数 / 顺序）：

默认 list 契约 · 入口/进入即矩阵默认/清空快编态 · 二态 small switch · 矩阵页面内渲染 · single 左列表只读 · single 右侧能力保留 · 项目切换复位 · 两处拖拽重初始化 + 选中行恢复 · 视图切换零网络/零 reset · 预览弹窗接线保留 · `.list-toolbar`/`.pane-tool-slot` 消费、根容器无 `gap` 与无负 margin。

```bash
node --test tests/visitFlowWorkspace.test.js            # 预期失败
```

## 3. Step 2 — 同步既有锁定断言

- `listActionsIconify.test.js`：「批量编辑」用例改为锁定「访视流程」入口 + `doesNotMatch` 无 `showPreview` 残留；其余图标断言不动。
- `orderingStructure.test.js`：visits 用例 `watch([selectedVisit, visitForms], …)` 正则同步 4 依赖数组。
- `ordinalQuickEditWiring.test.js`：保留 `editingVisitId === row.id` 的原空格子串与 `:controls="false"` 计数 2；补 flow 只读守卫时不得改坏既有契约。

```bash
node --test tests/visitFlowWorkspace.test.js tests/listActionsIconify.test.js tests/orderingStructure.test.js tests/ordinalQuickEditWiring.test.js
# 预期：全部失败或部分失败
```

## 4. Step 3 — 实现（GREEN，按 design.md §3-§6）

1. 脚本区：新增 `workspaceMode` / `flowView` ref；删除 `showPreview` ref。
2. 模板重构：根容器移除私有 `gap`（由共享槽的 12px 底距统一控制）→ 全宽 `.list-toolbar`（list 控件 + spacer + 访视流程入口）→ list 全宽表格分支 → flow 工作区（`.pane-tool-slot` 头部 + `size="small"` 二态控件 + matrix 分支 + single 双栏分支）；single 左列保留 `min-width:0;display:flex;flex-direction:column`，右栏标题/添加行分别消费 `.pane-tool-slot` / `.list-toolbar`，不写负 margin 或私有 gap/底距。
3. 访视表格列条件（design.md §4 表）：把手 / 选择列 / 操作列入 list 条件；序号列静态化分支；保留 `editingVisitId === row.id` 的空格写法与两个既有 `:controls="false"`。
4. watcher：项目切换追加两 ref 复位；进入 flow 清空两类快编态；`watch(workspaceMode → initVisitsSortable)`；4 依赖数组 watch → `initVisitFormsSortable`；single 表格重挂后 `setCurrentRow(selectedVisit)` 恢复高亮。
5. 右侧面板与矩阵标记原样迁移；新增 / 编辑弹窗、预览弹窗不动。

每子步立即定向回归（见 Step 2 命令 + `editModeHiddenIdentifiers.test.js`），迭代至全绿；禁止集中大改后统一调试。

## 5. Step 4 — 全量回归 + lint + build

```bash
node --test tests/*.test.js        # 全量（预期 ≥ 622 + 新增，以实际为准）
npm run lint                       # 0 errors；不引入新 prettier warning
npm run build                      # build OK
```

后端零改动，无需跑后端测试；误触则先回滚。

## 6. Step 5 — 浏览器实机验证

前置：`frontend/dist/` 为 gitignore 旧构建、后端直接托管——实机前必须 `npm run build` 并同步 dist（08-12 PR#67 教训）。启动 `backend && python main.py` + `frontend && npm run dev`；账号用 `TEST_ACCOUNTS.local.md`（git 忽略）。

场景（亮 / 暗各过一遍，逐条记录）：

1. 默认访视页：全宽列表；无批量编辑 / 右侧面板；CRUD + 搜索 + 拖拽 + 快编正常。
2. 进入流程 → 页面内矩阵（无弹窗）；单元格切换关联、移除确认、空态、暗色样式。
3. 二态 → 单访视：流程 switch 保持 small、共享标题槽总高 36–37px；左列表只读且已选行高亮恢复；右侧添加 / 移除 / 拖拽排序 / 快编 / 预览正常；共享工具栏/标题槽间距一致且未叠加为 24px、无页面私有补丁；来回切换数据保持。
4. 单访视视图打开表单预览 → 切矩阵：弹窗不关闭；eCRF / aCRF 与标注拖拽正常。
5. 流程模式中切换项目：回列表模式，选中与预览复位。
6. 返回列表后访视拖拽 / 快编仍可用（重初始化验证）；再次进入流程 → 矩阵默认。
7. 全程无 console error。

阻塞项（登录 / 网络 / 权限）须明确报告，不得声称已做 DOM 验证。

## 7. Step 6 — 文档同步

- `frontend/.claude/CLAUDE.md`：变更日志追加；VisitsTab 职责更新为「默认纯全宽列表 + 页面内访视流程矩阵 / 单访视双视图」。
- `.claude/index.json`、`README.md` / `README.en.md`：访视相关描述同步。
- `.trellis/spec`：无跨栈契约变化不修改；实现中发现需沉淀的规范记录到任务 notes 由父任务统一处理。

## 8. Step 7 — 收尾

1. `git diff` 全量复核：仅 VisitsTab.vue、测试、文档；无 `showPreview` 残留、无 `console.log`、无死代码。
2. 提交（仅被明确要求时）：`feat(visits): 访视流程页面化` 风格，走父任务分支与 PR 流程。

## 9. 验证命令汇总

| 阶段 | 命令 | 预期 |
|------|------|------|
| 基线 | `node --test tests/*.test.js` / `npm run lint` | 622 passed / 0 errors |
| RED | `node --test tests/visitFlowWorkspace.test.js` | 失败 |
| GREEN | 定向回归 5 文件（Step 3 命令） | 全绿 |
| 全量 | `node --test tests/*.test.js` | ≥ 基线全绿 |
| 全量 | `npm run lint` / `npm run build` | 0 errors / OK |
| 实机 | 浏览器按 Step 5 场景清单 | 三态 + 明暗 + 无 console error |

未运行项（如浏览器阻塞）必须在本任务完成报告中逐条列出并说明替代验证范围。
