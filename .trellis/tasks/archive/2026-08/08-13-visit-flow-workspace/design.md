# 访视流程页面化 — 技术设计

## 1. 总体方案

单文件改造：`frontend/src/components/VisitsTab.vue`（1530 行）内新增两个模式 ref + 模板条件分支 + 三个 watcher 扩展；不提取新组件、不新增依赖、不触碰后端。

理由：
- 预览弹窗（约 500 行：aCRF 标注拖拽、行高 / 列宽持久化、`mergeFormIntoState`、`viewMode`）与 `load()` / 项目切换 watcher 深度耦合；提取需迁移约 600 行并同步 8+ 个锁定内部接线的源码级测试，风险远高于条件分支。
- 矩阵与右侧面板标记都是「移动 + 去弹窗包装」，无逻辑变更。
- 数据已由 `load()` 一次性载入三份（visits / matrixData / allForms），页面内重组不需要新接口。

## 2. 状态机

```
workspaceMode: 'list' | 'flow'       默认 'list'
flowView:      'matrix' | 'single'   默认 'matrix'

| 事件                | 前置 | 动作 |
|---------------------|------|------|
| 点击「访视流程」     | list | workspaceMode='flow'；flowView='matrix'；清空访视/访视表单序号快编态（每次进入复位矩阵默认） |
| 点击（active 态）    | flow | workspaceMode='list' |
| 切换二态控件         | flow | flowView = 'matrix' \| 'single'；不 load / reset / reload |
| 点击访视行           | 任意 | selectedVisit = row（沿用 @current-change，两模式共用） |
| 项目切换             | 任意 | workspaceMode='list'；flowView='matrix'；selectedVisit=null；flush；关预览；reset；load() |
| refreshKey 变化      | 任意 | load()；模式保持 |
| Tab 离开 / 返回      | 任意 | 组件保持挂载，模式保持 |

不变式：
- 访视 CRUD（工具栏 Plus / 批量删除 / 搜索、行内复制 / 编辑 / 删除、选择列、拖拽把手、序号快编、新增 / 编辑弹窗入口）仅 list 模式渲染。
- 表单关系控件（添加 / 排序 / 预览 / 移除）仅 flowView==='single'；矩阵单元格仅 flowView==='matrix'。
- 预览弹窗（showFormPreview）独立于两状态：切换视图 / 模式不关闭；项目切换仍由现有 watcher 关闭。
- 视图 / 模式切换不触发任何网络请求。
```

## 3. 模板结构（改造后骨架）

```
<div root（column;height:calc(100vh - 160px)；不设 gap）>          ← 原双栏根改造
  <div class="list-toolbar">                                 ← 消费 toolbar 子任务共享契约
    <template v-if="workspaceMode === 'list'">[Plus][批量删除][search 180px]</template>
    <div spacer（margin-left:auto）/>
    [访视流程按钮]（toggle；flow 时 active，aria-label「访视流程」）
  </div>
  <template v-if="workspaceMode === 'list'">
    <div（flex:1;min-height:0）>全宽访视表格（原左栏容器，去 width:50%）</div>
  </template>
  <template v-else>   ← 访视流程工作区
    <div class="pane-tool-slot visit-flow-header">
      <b>访视流程</b><span v-if="flowView === 'matrix'" hint>点击单元格可切换关联…</span>
      <div spacer（margin-left:auto）/>
      <el-switch v-model="flowView" size="small" inline-prompt inactive-text="矩阵" active-text="单访视" />
    </div>
    <div v-if="flowView === 'matrix'"（flex:1;min-height:0;overflow:auto）>原弹窗矩阵标记（908-945 行，去 el-dialog）</div>
    <div v-else（flex:1;min-height:0;display:flex;gap:16px）>
      <div（width:50%;min-width:0;display:flex;flex-direction:column）>只读访视选择列表（表格 `height="100%"`，§4 列条件）</div>
      <div v-if="selectedVisit"（width:50%;min-width:0;display:flex;flex-direction:column）>
        <div class="pane-tool-slot">当前访视标题</div>
        <div class="list-toolbar">添加表单控件</div>
        原访视表单表格
      </div>
      <div v-else>「← 点击左侧访视行…」占位（原 903-905 行）</div>
    </div>
  </template>
  新增 / 编辑弹窗（948-971）、表单预览弹窗（974-1436）位置不变
</div>
```

要点：
- 工具栏与标题/添加行消费 toolbar 子任务提供的 `.list-toolbar` / `.pane-tool-slot`（8px gap、36–37px 槽位）；根容器不再声明 `gap`，由共享槽的 12px 底距统一控制相邻间距，避免叠加成 24px；不重复声明页面私有 gap/底距，不使用负 margin；仅允许 spacer 使用正向 `margin-left:auto`。
- 流程标题槽内的二态 `el-switch` 使用 `size="small"`，使内容高保持 24px，不把共享槽重新撑至 44px。
- 工具栏全宽常驻一行；「访视流程」经 spacer 推到最右侧。
- 列表模式表格全宽；single 视图左列表 50%，保留 `min-width:0;display:flex;flex-direction:column`，使内部 `height="100%"` 表格继续占满。
- 二态控件样式对齐 App.vue 编辑模式 `el-switch`（inline-prompt + 中文文案）。

## 4. 共用访视表格的列条件（list 与 flow/single 同一张表）

同一张 `visitsTableRef` / `filteredVisits` / `selectedVisit`，仅按模式隐藏列，避免第二套列表与第二份 Sortable 实例：

| 列 | list 模式 | flow/single 视图 |
|----|-----------|------------------|
| 拖拽把手（32px） | `v-if="!isFiltered"` | 不渲染（条件并入 `workspaceMode==='list'`） |
| 选择列 | 渲染 | 不渲染 |
| 序号 | 快编输入 / dblclick 按钮（原样） | 静态 `<span class="ordinal-cell">` |
| OID（`v-if="editMode"`） | 不变 | 不变（紧随序号，保持 editMode 断言顺序） |
| 访视名称 | 不变 | 不变 |
| 操作（复制 / 编辑 / 删除，fixed=right） | 渲染 | 不渲染 |

- `@current-change` 两模式共用（flow 中点击行选中访视复用现有 handler）。
- 序号快编输入条件改 `v-if="workspaceMode === 'list' && editingVisitId === row.id"`、按钮改 `v-else-if="workspaceMode === 'list'"`——保留 `editingVisitId === row.id` 的原空格写法，使既有源码级正则继续子串匹配；不得新增第三个 `:controls="false"` 输入。
- 访视 CRUD 函数与新增 / 编辑弹窗零改动，仅入口按钮进入 list 分支（flow 下不可达，满足禁止 CRUD）。

## 5. 数据流改动点

- 新增：`workspaceMode = ref('list')`、`flowView = ref('matrix')`。
- 删除：`showPreview = ref(false)`（109 行）及全部引用（766 行按钮、908 行弹窗 v-model）；矩阵标记移入 flow/matrix 分支。
- `load()` 零改动；项目切换 watcher（157-167 行）追加 `workspaceMode='list'`、`flowView='matrix'` 复位。
- `syncVisitForms` / `availableForms` / `reloadVisitForms` / `toggleCell` / 表单增删 / 预览函数零改动。
- `.matrix-table` 系列样式已在 `main.css` 全局（276 行起，sticky 表头 / 首列，CSS 变量承载明暗主题），页面内直接复用，无需新增样式。

## 6. 拖拽重新初始化

`useSortableTable.initSortable()` 幂等：先 `instance.destroy()` 再重建，目标 DOM 缺失早退（`useSortableTable.js:24-30`）。

- 访视列表：新增 `watch(workspaceMode, () => { if (workspaceMode.value === 'list') nextTick(() => initVisitsSortable()) })`——flow 卸载表格后 Sortable 实例持有已脱离 tbody，返回必须重建；list→flow 方向无需显式销毁。
- 访视表单：现有 `watch([selectedVisit, visitForms], …)`（734-736 行）扩展为 `watch([selectedVisit, visitForms, flowView, workspaceMode], () => nextTick(() => initVisitFormsSortable()))`——matrix→single 切换时 `visitForms` 数据未变原 watcher 不触发，表格重挂后拖拽失效；matrix 下表格不存在，init 早退 no-op。
- single 左表重挂后在同一 `nextTick` 中调用 `visitsTableRef.value?.setCurrentRow(selectedVisit.value)`，恢复 `highlight-current-row` 的视觉选中态；仅同步 UI，不改 `selectedVisit` 或发请求。

## 7. 预览弹窗保持

- `showFormPreview` / `openFormPreview` / `formPreview*` / `annotationDrag` / `viewMode`（eCRF/aCRF，持久化 `crf_view_mode`）/ `previewRowResizerCache` / `mergeFormIntoState` 全部零改动。
- 预览入口随右侧面板进入 flow/single 分支，能力不变；模式 / 视图切换不关闭弹窗（overlay 独立于 workspaceMode）；项目切换关闭沿用现有 watcher。
- aCRF 契约（`acrfViewToggle` / `visitPreviewLandscape` / `wordPageGeometry` 测试）零影响。

## 8. 测试影响面

### 新增 `frontend/tests/visitFlowWorkspace.test.js`（源码级，node:test，11 组）

1. 默认 list 模式（无批量编辑 / 无 `showPreview` / 右侧面板默认不渲染）；2. 入口 + 进入即矩阵默认并清空快编态；3. 二态 `el-switch` 使用 `size="small"`；4. 矩阵页面内渲染（无 dialog / `toggleCell` / 空态）；5. single 左列表只读（无 CRUD 触发点 / 选择列 / 把手 / 快编）；6. single 右侧能力保留；7. 项目切换复位两 ref；8. 两处拖拽重初始化 watcher + single 选中行恢复；9. 视图切换零网络 / 零 reset；10. 预览弹窗接线保留；11. 消费 `.list-toolbar` / `.pane-tool-slot`，根容器不声明 `gap`，且 VisitsTab 无负 margin / 页面私有工具栏 gap 与底距。

### 现有测试同步

| 文件 | 锁定内容 | 动作 |
|------|----------|------|
| `listActionsIconify.test.js` | 「批量编辑」文本按钮 `@click="showPreview = true"`（88-89 行） | 断言改为「访视流程」入口 + `doesNotMatch` 无 `showPreview` 残留 |
| `orderingStructure.test.js` | `watch([selectedVisit, visitForms], …)` 精确正则（52-62 行） | 正则同步 4 依赖数组；其余断言因标记原样保留而继续匹配 |
| `ordinalQuickEditWiring.test.js` | 双序号快编接线、`:controls="false"` 计数 2 | 断言主体不动（子串匹配兼容） |
| `editModeHiddenIdentifiers.test.js` | 序号→OID→名称列顺序、弹窗 OID v-if | 不变 |
| `acrfViewToggle` / `visitPreviewLandscape` / `wordPageGeometry` | 预览接线 / A4 几何 | 零改动 |
| `appTabLazyLoad.test.js` | App.vue tab 接线 | 零改动（App.vue 不动） |

### 明确不动的契约

跨栈契约（`cross-stack-contracts.md` §4-§6、§10-§11）：本次不触碰预览渲染、宽度规划、aCRF 几何、访视—表单后端契约。后端测试（799 passed / 4 xfailed 基线）零改动。

## 9. 风险与边界

- 风险 1：`editModeHiddenIdentifiers.test.js` `assertInOrder`（序号→OID→名称）——两模式共用一张表、列顺序与 OID v-if 不变，断言保持。
- 风险 2：`listActionsIconify.test.js` 五类页面图标循环包含 visits——list 分支保留全部图标按钮，断言保持。
- 风险 3：矩阵移出弹窗后高度 / 滚动——容器 `flex:1;min-height:0;overflow:auto` 承担原弹窗滚动，sticky 表头继续生效；浏览器实机覆盖。
- 风险 4：依赖「工具栏与双栏对齐」子任务先落地 `main.css` 共享类——固定串行方向为 **toolbar → visit-flow**，本任务只消费、不修改 `main.css`。
