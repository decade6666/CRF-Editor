# Spec 02 — 前端 quick wins 与浏览器基线

## 目标

在不改变 UI 框架、不改变 API 公共调用方式、不拆分 `FormDesignerTab.vue` 大组件的前提下，完成第一批前端低风险性能改动，并为 heavy-1600 样本建立 Chromium 严测基线。

---

## 1. 允许改动范围

### 1.1 允许

| 类型 | 文件 | 约束 |
|------|------|------|
| 图标按需 | `frontend/src/main.js`、`frontend/src/App.vue` | 禁止继续全量注册 Element Plus icons |
| async component | `frontend/src/App.vue` | 只 lazy 非首屏 tab 与大对话框 |
| lazy tab mount | `frontend/src/App.vue`、`frontend/src/composables/useLazyTabs.js` | 非激活 tab 首次点击前不得 mount |
| 设计器辅助数据延迟加载 | `frontend/src/components/FormDesignerTab.vue` | 首次 mount 只加载 forms，首次打开全屏设计器再加载 fieldDefs/codelists/units |
| 前端 perf hook | `frontend/src/composables/usePerfBaseline.js` | 仅在 `?perf=1` 或 `localStorage.crf_perf_baseline=1` 时启用 |
| build metrics | `frontend/scripts/collectBuildMetrics.mjs` | 只使用 Node 标准库 |

### 1.2 禁止

- 禁止替换 Element Plus / Vue / Vite
- 禁止新增 runtime 或 dev dependency
- 禁止改变 `frontend/src/composables/useApi.js` 的公共 API
- 禁止把 `FormDesignerTab.vue` 大规模拆分成新组件（净迁移代码 > 200 行）
- 禁止改变 `useCRFRenderer.js` 的 HTML 语义和列宽 planner 语义
- 禁止为了性能基线改变用户可见文案、表单顺序、字段顺序或权限分支

---

## 2. 图标按需注册

### 2.1 `frontend/src/main.js`

必须移除：

```js
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}
```

`main.js` 只保留：
- `createApp`
- `ElementPlus`
- CSS imports
- `App`
- `main.css`
- `app.use(ElementPlus)`
- `app.mount('#app')`

### 2.2 `frontend/src/App.vue`

`App.vue` 必须显式导入模板中使用的 icons：

```js
import {
  Delete,
  DocumentCopy,
  Expand,
  Files,
  Loading,
  Monitor,
  Moon,
  Plus,
  Rank,
  RefreshRight,
  Setting,
  Sunny,
  UploadFilled,
} from '@element-plus/icons-vue'
```

`FormDesignerTab.vue` 与 `TemplatePreviewDialog.vue` 已有局部 icon import，不得回退到全局注册。

---

## 3. async component 与 lazy tab mount

### 3.1 async components

`App.vue` 必须从 `vue` 导入 `defineAsyncComponent`，并将以下组件改为 async import：

```js
const CodelistsTab = defineAsyncComponent(() => import('./components/CodelistsTab.vue'))
const UnitsTab = defineAsyncComponent(() => import('./components/UnitsTab.vue'))
const FieldsTab = defineAsyncComponent(() => import('./components/FieldsTab.vue'))
const FormDesignerTab = defineAsyncComponent(() => import('./components/FormDesignerTab.vue'))
const VisitsTab = defineAsyncComponent(() => import('./components/VisitsTab.vue'))
const DocxCompareDialog = defineAsyncComponent(() => import('./components/DocxCompareDialog.vue'))
const TemplatePreviewDialog = defineAsyncComponent(() => import('./components/TemplatePreviewDialog.vue'))
```

以下组件保持静态 import：
- `ProjectInfoTab`
- `LoginView`
- `AdminView`

### 3.2 `useLazyTabs.js`

新增 `frontend/src/composables/useLazyTabs.js`，导出：

```js
export function createLazyTabState(initialTab = 'info')
```

返回对象固定包含：
- `activeTab`
- `activatedTabs`
- `activateTab(name)`
- `isTabActivated(name)`
- `reset(initial = 'info')`

约束：
- `activatedTabs` 必须是新对象/新 Set，不得就地修改原对象
- 默认只激活 `info`
- 切换 tab 时，目标 tab 被永久标记为 activated，直到 `reset()`
- 切换项目、退出登录、auth expired 时必须调用 `reset('info')`

### 3.3 模板挂载规则

`App.vue` 中非 info tab 必须同时满足：
- tab 当前可见（如 `editMode`）
- `isTabActivated(name) === true`

示例：

```vue
<el-tab-pane v-if="editMode" label="字段" name="fields">
  <div v-if="isTabActivated('fields')" class="content-inner">
    <FieldsTab :project-id="selectedProject.id" />
  </div>
</el-tab-pane>
```

`DocxCompareDialog` 与 `TemplatePreviewDialog` 必须只在对应 `v-model` 首次为 true 后挂载。

---

## 4. FormDesignerTab 延迟加载

### 4.1 首次 mount 行为

`FormDesignerTab.vue` 当前 `onMounted` 会并行加载：
- forms
- fieldDefs
- codelists
- units

第一批必须改为：
- mount 时只执行 `loadForms()` 与 `initFormsSortable()`
- 首次选择 form 时加载该 form 的 fields
- 首次打开全屏设计器时执行 `ensureDesignerAuxiliaryDataLoaded()`，并行加载：
  - `loadFieldDefs()`
  - `loadCodelists()`
  - `loadUnits()`

### 4.2 状态约束

新增状态必须满足：
- `designerAuxiliaryLoaded`
- `designerAuxiliaryLoading`
- `designerAuxiliaryLoadError`

失败行为：
- 若辅助数据加载失败，阻止进入全屏设计器
- 使用现有 `ElMessage.error` 展示错误
- 不影响主表单列表和主预览区域

### 4.3 禁止改变

- 不改变 `canLeaveProject()` 语义
- 不改变 `flushFieldPropSaveBeforeReset()` 语义
- 不改变字段保存、字典快编、单位快增、拖拽排序 API
- 不改变预览 HTML 输出语义

---

## 5. 前端性能基线工具

### 5.1 `usePerfBaseline.js`

新增 `frontend/src/composables/usePerfBaseline.js`，导出：

```js
export function isPerfBaselineEnabled()
export function markPerfStart(scenario)
export function markPerfEnd(token, metrics = {})
export function recordPerfEvent(event)
export function exportPerfEvents()
export function clearPerfEvents()
```

启用条件：
- URL query 包含 `perf=1`
- 或 `localStorage.getItem('crf_perf_baseline') === '1'`

事件 schema：

```json
{
  "timestamp": "ISO-8601 string",
  "scenario": "string",
  "duration_ms": 0.0,
  "metrics": {}
}
```

必须把 `exportPerfEvents` 暴露到：

```js
window.__CRF_PERF_EXPORT__
```

仅在 perf 模式启用时暴露；默认模式不得污染 `window`。

### 5.2 必须记录的前端事件

| 事件 | 位置 | metrics |
|------|------|---------|
| app_project_load | `App.vue` 选择项目后 | project_id hash、network_count |
| tab_designer_first_activate | `App.vue` tab change | chunk_load_count、component_mount_count |
| tab_visits_first_activate | `App.vue` tab change | chunk_load_count、component_mount_count |
| tab_fields_first_activate | `App.vue` tab change | chunk_load_count、component_mount_count |
| tab_codelists_first_activate | `App.vue` tab change | chunk_load_count、component_mount_count |
| tab_units_first_activate | `App.vue` tab change | chunk_load_count、component_mount_count |
| designer_select_form | `FormDesignerTab.vue` | form_id hash、field_count、preview_update_ms |
| designer_switch_form | `FormDesignerTab.vue` | form_id hash、field_count、preview_update_ms |
| designer_open_fullscreen | `FormDesignerTab.vue` | auxiliary_loaded、field_defs_count、codelists_count、units_count |
| designer_edit_label | `FormDesignerTab.vue` | preview_update_ms |
| designer_toggle_inline | `FormDesignerTab.vue` | preview_update_ms |
| designer_reorder_field | `FormDesignerTab.vue` | preview_update_ms、network_count |

hash 只能使用 session-local 短 hash，不得输出真实 ID 原值。

### 5.3 构建指标

新增 `frontend/scripts/collectBuildMetrics.mjs`：
- 读取 `frontend/dist/assets`
- 统计 `.js` 与 `.css` 的 raw bytes 与 gzip bytes
- 分类输出：
  - `index`
  - `vendor-vue`
  - `vendor-ep`
  - `vendor-misc`
  - `async-chunks`
  - `total-js`
  - `total-css`
- 输出到 `openspec/changes/research-performance-constraints/baselines/frontend-build-heavy-1600.json`

不得修改 `frontend/vite.config.js` 的 `chunkSizeWarningLimit=1100` 来掩盖构建告警。

---

## 6. PBT 属性

| 属性 | 不变量 | 反例生成策略 |
|------|--------|--------------|
| icon registration minimality | `main.js` 不得全量遍历注册 `ElementPlusIconsVue` | 扫描 `main.js`，出现 `Object.entries(ElementPlusIconsVue)` 即失败 |
| inactive tab non-mount | 非激活 tab 首次点击前不得 mount、不得发起该 tab 专属 API 请求、不得加载对应 async chunk | 初始化 App 后只选择项目不切 tab，监控 mounted/API/chunk 事件 |
| lazy reset isolation | 切换项目或退出登录后 activated tab 状态必须回到 `info` | 先激活 designer，再切换项目，断言 fields/visits 未 mounted |
| designer auxiliary deferral | `FormDesignerTab` mount 后不得立即加载 fieldDefs/codelists/units | mount 后监控 API 列表，首次打开设计器前不得出现对应请求 |
| preview semantic stability | quick wins 不得改变 HTML 预览语义 | 对同一 fixture 比较优化前后语义树，忽略非语义 whitespace |
| perf hook inert by default | 非 perf 模式下不得暴露 `window.__CRF_PERF_EXPORT__`，不得额外记录事件 | 默认启动页面后检查 window 与事件缓存 |
| cold/warm separation | cold 与 warm 前端事件不得混合 | 注入 mode 错误 record，validator 必须失败 |

---

## 7. 验证条件

| ID | 条件 |
|----|------|
| SC-2.1 | `frontend/src/main.js` 不再全量注册 Element Plus icons |
| SC-2.2 | `App.vue` 中指定重组件与对话框均为 async component |
| SC-2.3 | 非激活 tab 首次点击前不 mount、不请求数据、不加载 chunk |
| SC-2.4 | `FormDesignerTab` mount 时只加载 forms，首次打开全屏设计器才加载辅助数据 |
| SC-2.5 | `frontend/scripts/collectBuildMetrics.mjs` 生成 build metrics JSON |
| SC-2.6 | Chromium 严测生成 front-end cold/warm JSONL，每个 gating interaction 有 5 条 measured record |
| SC-2.7 | `node --test frontend/tests/*.test.js` 通过 |
