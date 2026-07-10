# Design — 表单设计弹窗界面调整

## 范围与边界
- 单文件为主：`frontend/src/components/FormDesignerTab.vue`（template / `<script setup>` / `<style scoped>` / 顶部无 scoped 的 `.designer-dialog` 块）。
- 新增一个共享 composable：`frontend/src/composables/usePaneSplit.js`（纵向分栏拖拽 + 比例持久化），供 R1、R4 复用（DRY，符合"可复用逻辑入 composables/"约定）。
- 同步前端源级测试。后端零改动。

## R1 + R4：纵向可拖拽分栏（新 composable）
### `usePaneSplit(storageKey, defaultRatio, { min=0.12, max=0.88 })`
- 返回 `{ ratio (ref, 表示"上方 pane"的高度占比 0..1), startResize(event) }`。
- 初值：读 localStorage，非有限值回退 `defaultRatio`；读到值 clamp 到 [min,max]。
- `watch(ratio)` → 写回 localStorage（try/catch 容错）。
- `startResize(event)`：`event.currentTarget.parentElement` 作容器测高 → 记录 `startY/startRatio` → `mousemove` 用 `clamp(startRatio + (clientY-startY)/height)` 更新 → `mouseup` 解绑。与既有 `startLibResize` 同风格（全局 document 监听 + 卸载）。
- 拖拽期间设 `document.body.style.userSelect='none'`（mouseup 恢复），避免文本选中干扰。
- 不依赖 `Date.now/Math.random`；纯 DOM 事件 + localStorage。

### 组件接入
```js
const { ratio: sideRatio, startResize: startSideResize } =
  usePaneSplit('crf:designer:side-split', 0.75);        // 属性:备注 = 3:1
const { ratio: workspaceRatio, startResize: startWorkspaceResize } =
  usePaneSplit('crf:designer:workspace-split', 2 / 3);   // 字段列表:预览 = 2:1
const sideRows = computed(() => `${sideRatio.value}fr 6px ${1 - sideRatio.value}fr`);
const workspaceRows = computed(() => `${workspaceRatio.value}fr 6px ${1 - workspaceRatio.value}fr`);
```
- `.designer-side-pane`：`:style="{ width: propWidth + 'px', gridTemplateRows: sideRows }"`，内部三行 = 属性卡 / `.pane-v-resizer`(@mousedown=startSideResize) / 备注卡。
- `.designer-workspace`：`:style="{ gridTemplateRows: workspaceRows }"`，内部三行 = `designer-workspace-top` / `.pane-v-resizer`(@mousedown=startWorkspaceResize) / `designer-workspace-bottom`。
- CSS：两容器移除固定 `grid-template-rows`，**设 `row-gap:0`**（由 6px resizer 行替代间距，避免 gap+resizer 双间距）。
- 卡片保留 CSS `min-height`：`.designer-notes-card min-height:120px`；`.designer-workspace-bottom min-height:200px`，确保 fr 轨道不收缩到 0。
- `.pane-v-resizer`：`height:6px; cursor:row-resize; background:transparent; hover→--color-primary-subtle`（对齐 `.fd-panel-resizer` 视觉）。无 ARIA/键盘（对齐现有横向 resizer 风格）。

## R2：属性编辑字段顺序（OID 上移）
- 非日志行分支 `<el-form ...>` 内，把 `OID` 的 `el-form-item`（`v-if="editMode && !['标签','日志行'].includes(editProp.field_type)"`）整体移到 `字段标签` `el-form-item` 之前。条件、绑定不变；OID 隐藏时字段标签自然成为首项。

## R3：去除字段列表复选框右侧库 id
- Element Plus 2.13.2 源码验证：
  - `actualValue` = `props.value ?? props.label`；`hasOwnLabel` = `!!slots.default || !isPropAbsent(actualValue)`。
  - 渲染：`hasOwnLabel=true` 时输出 `<span class="el-checkbox__label">`；无 slot 时 fallback 渲染 `toDisplayString(props.label)`（**是 label 而非 value**）。
  - `:value="ff.id"` 且不设 `:label` → `props.label=undefined` → 渲染空字符串。但仍生成空 `<span>` 元素。
- **方案**：`:label` → `:value`，并加**空 slot `<span></span>`** 使 `$slots.default` truthy，彻底避免空 label span。保留 `v-if="!isDraftField(ff)"`、`size`、`@click.stop`。`selectedIds` 语义与批量删除不变；右侧 `ordinal-cell`(`_displayOrder`) 保留。

## R5：aCRF 字段库两行布局
- 左侧 `button.fd-item` 内容按 `showAcrfAnnotations` 分支：
  - aCRF：按钮内加**包裹 div `.fd-item-content`**（解决 button 嵌套 flex-column 的跨浏览器问题），`display:flex; align-items:center`；左 `.fd-item-lines`（`flex:1; min-width:0; flex-direction:column`）含 `.fd-item-oid`(第1行, `variable_name||'—'`) 与 `.fd-item-label`(第2行, `label`)，各自 ellipsis；右 `.fd-item-type`（`flex-shrink:0`，`align-self:center` 使其视觉跨两行居中）。
  - 非 aCRF：保持现单行 = 标签(flex:1, ellipsis) + 类型。
- `@click="addField(fd)"` 不变（点击整项仍加字段）。

## R6：字段库悬停 tooltip（按行分别，复用 el-tooltip）
- 与中间列表 `ff-var-name` 相同范式：el-tooltip 包裹**单一 span 元素**（el-tooltip 不输出包裹 DOM，事件绑定到 slot 根元素），`:content` 为该行完整文本。
  - aCRF：OID 行 tooltip=`variable_name`；标签行 tooltip=`label`。
  - 非 aCRF：单行标签 tooltip=`label`。
- 样式放在 span 上（`display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap`），不放在 el-tooltip 标签上。

## 兼容 / 回滚
- 纯前端布局与本地持久化；无接口/数据结构变更。回滚 = 还原本文件与新 composable、恢复测试断言。
- localStorage 新键 `crf:designer:side-split`、`crf:designer:workspace-split`（全局，不 scope 到 formId）；缺失/损坏时回退默认比例，无副作用。

## 受影响测试
- `tests/orderingStructure.test.js`：L254 `.designer-workspace` grid-rows、L256 `.designer-side-pane` grid-rows 断言改为"inline 驱动 + resizer 存在"式断言；保留 workspace-top/bottom、side-pane 结构与顺序断言。R2 OID 位置交换不影响 `editModeHiddenIdentifiers.test.js`（仅校验条件存在性，不校位置）。
- 新增 `tests/paneSplit.test.js`：`usePaneSplit` 纯行为（默认值、clamp、持久化读写、拖拽增量）+ 组件 wiring（两个 resizer、`gridTemplateRows` 计算、`:value="ff.id"` + 空 slot、OID 先于字段标签、aCRF 两行结构与 `.fd-item-content` 包裹、fd-item tooltip）。
- 复核不破坏：`quickEditBehavior.test.js`、`formFieldPresentation.test.js`、`designerNewFieldDraft.test.js`、`acrfViewToggle.test.js`。

## 交叉审查记录
- **Codex (后端)**：连接超时未返回。后端影响已通过代码检查确认零改动：R3 `selectedIds` 语义不变、R5/R6 数据源 `field-definitions` 已返回所有所需字段、无跨栈合约变更。
- **Antigravity (前端)**：返回 7 项发现，6 项已采纳（见上方标记）；键盘/ARIA 降优先级对齐现有 resizer 风格。关键修正：R3 需加空 slot、R1/R4 需 row-gap:0 + 卡片 min-height、R5 需 button 内包裹 div。
