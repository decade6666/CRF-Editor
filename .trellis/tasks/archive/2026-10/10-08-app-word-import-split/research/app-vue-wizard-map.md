<!-- Source: read-only audit of main @ 6090a81, 2026-10-11. Line numbers refer to that commit. -->

# Word 导入向导结构地图（只读）

范围：已完整读取 `/home/decade/CRF-Editor/frontend/src/App.vue`（1–1913），并读取指定组件/Composable 的相关实现。未修改、创建或删除文件；未运行测试（本任务为只读映射）。

## 高层概述

Word 导入向导目前由 `App.vue` 同时持有状态、上传/解析、AI 复核轮询与建议接受、执行导入、结果展示和预览组件装配；因此它与应用壳的项目选择、全局刷新、标签导航和设计器 ref 有少量明确耦合。Word 预览组件再组合截图证据面板和模拟 CRF；截图使用 `temp_id`，AI 复核状态则使用独立的 `ai_task_id`。

以下分类：**W** = Word 向导专属；**S** = App.vue 中还服务非向导代码（列出其他用户）；**X** = 外部接口/子组件/Composable 契约。组合标记表示二者兼具。

## (a) Script 层符号清单

### Wizard 状态 refs

| 符号（定义行） | 用途、模板/函数引用 | 类 |
|---|---|---|
| `showImportWordDialog`（677） | 弹窗 `v-model`（1356）；打开入口（862–875）；关闭 watcher（714–721）；取消、关闭按钮直接写 `false`（1522–1536）；跳设计器时关闭（980）。 | W |
| `importWordStep`（678） | 1/2/3 步状态；模板步骤分支 1361、1387、1492，底部按钮 1522–1536；上传成功进 2（907），执行成功进 3（961），打开/返回置 1（863、878）。 | W |
| `importWordLoading`（679） | 对话框级 loading 替代全部步骤内容（1357–1359）；上传和执行按钮禁用/加载（1522–1534）；上传/执行回调负责开关。 | W |
| `importedFormsPreview`（680） | 上传预览表单列表；步骤 2 列表和空态（1429–1483）；全选、AI 状态/建议计算；传给 `DocxCompareDialog`（1549）；用于执行 AI overrides（951）。 | W |
| `selectedFormsToImport`（681） | 勾选的 `form.index`；全选按钮/checkbox-group（1431–1447），执行前校验和 payload（938、948）。 | W |
| `tempDocxId`（682） | 上传响应 `temp_id`；执行 payload（947）；上传 action 走项目 ID，预览子组件收到该值（1546）。 | W/X（后端临时导入 ID 契约） |
| `importWordErrorMessage`（683） | 上传、解析和执行失败提示；模板步骤 1、2 alert（1380–1385、1484–1490）；各失败分支设置。 | W |
| `importWordAiTaskId`（684） | 从预览响应取得 `ai_task_id` 并作为轮询任务标识；轮询响应前用于淘汰过期结果（837、847）；reset/关闭时清空。 | W/X（AI 任务 ID 契约） |
| `importWordAiReviewStatus`（685） | `idle/pending/running/done/failed`；步骤 2 状态 alert/tag（1389–1402、1465–1472），CompareDialog prop（1550）；轮询和 reset 更新。 | W |
| `importWordAiReviewError`（686） | AI 失败文本；模板 warning（1401）、CompareDialog prop（1551）；轮询错误分支/重置更新。 | W |
| `aiReviewPollTimer`（687，`let`） | 保存唯一 `setTimeout` 句柄；3 秒重排（823–829）；`stopAiReviewPolling` 清除并置空（723–728）。 | W |
| `showDocxCompare`（689） | CompareDialog `v-model`（1544）；`openDocxCompare` 打开（973–976）；向导关闭/打开/返回时关闭。 | W |
| `compareFormData`（690） | 当前预览表单；设置于 `openDocxCompare`（974）；AI poll 替换预览时按 `index` 同步更新（737–741）；决定 CompareDialog 是否挂载（1542）及 `key`（1543）。 | W |
| `importedResults`（692） | 第 3 步导入结果；执行成功读取 `data.detail`（960）；结果表格数据（1501），按钮用 `row.form_id` 跳设计器（1513）。 | W |
| `acceptedAiOverrides`（693） | `{ [formIndex]: { [fieldIndex]: suggestedType } }` 的唯一接受态；单条/单表单/全部开关更新；poll 后 reconcile；执行时交给 payload builder；向 CompareDialog 传当前表单接受集。 | W/X（`docxAiSuggestionOverrides.js` 契约） |

### Wizard 函数、computed 与 watcher

| 符号（行） | 作用及引用关系 | 类 |
|---|---|---|
| `getFormAiSuggestions(form)`（695–697） | 将无效/缺省建议归一为空数组；被 `hasAnyAiSuggestions`、单表单/全表单接受逻辑使用。 | W |
| `resetAcceptedAiOverrides()`（699–701） | 清空所有接受态；打开、返回、成功上传、关闭 watcher、全取消路径使用（720、800、873、886、902、820）。 | W |
| `hasAnyAiSuggestions`（703–705） | 是否存在建议；全局接受 checkbox 的 disabled（1412）。 | W |
| `allAiSuggestionsAccepted`（706） | 调 `isAllAccepted`；全局 checkbox `model-value`（1410）。 | W/X |
| `allAiSuggestionsIndeterminate`（707–709） | 调 `isAllIndeterminate`；全局 checkbox `indeterminate`（1411）。 | W/X |
| `compareFormAcceptedSuggestions`（710–712） | 根据当前 compare 表单和总接受态调用 `getAcceptedSuggestionsForForm`；传给 CompareDialog（1552）。 | W/X |
| `watch(showImportWordDialog, …)`（714–721） | 唯一直接监视 Word 向导显隐的 watcher。变为 false 时停止轮询、清空 task ID、关闭/卸载 compare（`compareFormData=null`）、清空 AI 接受态；**不**清 `tempDocxId`、步骤、预览、结果、错误或 AI status/error。 | W |
| `stopAiReviewPolling()`（723–728） | 有 timer 时 `clearTimeout` 并置空。由 unmount、关向导、reset、schedule 重排、完成/失败分支调用（180、716、731、824、842、848）。 | W |
| `resetImportWordAiReview()`（730–735） | 停 timer，清 task ID，status→`idle`、error→空；打开、返回、无 AI task 的上传成功、上传失败、执行开始、启动新任务均调用（856、869、883、911、921、942）。 | W |
| `replaceImportedFormsPreview(forms)`（737–741） | 替换列表；若 compare 正开着，用相同 `index` 的新表单替换当前对象，否则置 null。上传成功和 AI poll merge 调用（903、753）。 | W |
| `mergeAiSuggestions(suggestionsByForm)`（743–755） | 按数字化后的表单 index 合并新建议，保持其他表单对象不变；替换列表并用 `reconcileAcceptedOverrides` 去除已失效接受项。由 poll（840）调用。 | W/X |
| `toggleAiSuggestionAcceptance(...)`（757–776） | 校验 form/field/type；不可变地克隆 map，写入或删除单字段接受值并清理空表单项。CompareDialog `toggle-suggestion` 事件（1553）回调。 | W/X |
| `toggleAiSuggestionsForForm(...)`（778–796） | 按某个 form index 接受全部建议，或删除该表单的接受项；CompareDialog `toggle-form` 事件（1554）回调。 | W/X |
| `toggleAiSuggestionsForAll(accepted)`（798–817） | 全部接受时遍历每个有建议的表单并构建嵌套 map；取消时清空。步骤 2 全局 checkbox 的 `change`（1413）。 | W |
| `clearAllAiSuggestions()`（819–821） | 仅转调 reset；步骤 2 “全取消”按钮（1421）。 | W |
| `scheduleAiReviewPoll(taskId)`（823–829） | 先清旧 timeout；仅当 task ID 存在且弹窗打开时，3 秒后调用 poll。 | W |
| `pollAiReview(taskId)`（831–853） | 先检查 task/project/弹窗；`api.get` 轮询状态。响应回来再核对 task ID 和弹窗，更新 status/error、merge suggestions；`done/failed` 停止，否则再排 3 秒。异常时若仍为当前任务，停轮询并标 failed；404 显示“任务已中断”。 | W/X |
| `startAiReviewPolling(taskId)`（855–860） | reset 后记录 task ID、status→pending、安排首次 poll。预览成功且有 `response.ai_task_id` 时调用（908–910）。 | W |
| `openImportWordDialog()`（862–875） | 每次打开完整初始化：步骤/loading、预览/选择、temp ID、错误、轮询、compare、结果、接受态，然后显隐置 true。唯一 UI 入口调用（1583）。 | W |
| `goBackToImportWordStep1()`（877–887） | 回步骤 1，清预览/选择/temp/error/AI/compare/接受态；模板“上一步”（1525）。**不显式清 `importedResults`**，正常流程打开时已清过。 | W |
| `beforeDocxUpload(file)`（889–897） | 大于 `10 * 1024 * 1024` bytes 时 toast 并拒绝；否则清错误、设置 loading。绑定 `before-upload`（1370）。 | W |
| `handleDocxUploadSuccess(response)`（899–917） | loading 关闭；仅当有 `forms` 且有 `temp_id` 时，清接受态、保存预览/temp、清选中、进步骤 2，并按是否有 task ID 启动/重置 AI；格式不符时写错误并 toast。绑定 `on-success`（1368）。 | W/X |
| `handleDocxUploadError(error)`（919–931） | loading 关闭、重置 AI；组装上传错误，尝试从 JSON `message.detail` 取后端 detail；设置错误并 toast。绑定 `on-error`（1369）。 | W |
| `toggleSelectAllImportWordForms()`（933–935） | 调外部 `toggleSelectAll(importedFormsPreview, selectedFormsToImport, f => f.index)`；绑定全选按钮（1431）。 | W/X |
| `executeImportWord()`（937–970） | 校验至少选择一表单且有 temp ID；先停止 AI review，再 loading。构造 `{temp_id, form_indices}`，只在 builder 返回非空时加 `ai_overrides`；POST execute。成功 toast、保留 `detail` 作为结果、进第 3 步、清全局 API cache 并 `refreshKey++`；失败显示错误；finally 关 loading。绑定确认导入（1533）。 | W/X |
| `openDocxCompare(form)`（973–977） | 保存当前表单、打开 compare；每个表单“预览”按钮（1473）。 | W |
| `openDesignerForImportedForm(formId)`（979–992） | 先关向导，激活并设置 `designer` tab，`await nextTick()`；最多 20 次检查 `formDesignerTabRef.selectFormById`，ref 未就绪时 `setTimeout(r,50)`；找到方法后 await 一次并立即 return。最多约 1 秒；超时无提示，调用/加载异常无本函数 catch。被结果行按钮调用（1513）。 | W（但强耦合 App 导航/设计器 ref） |

### Wizard 用到的 imports、宿主依赖和外部边界

| 符号（行） | 作用/其他用户 | 类 |
|---|---|---|
| Vue `ref`、`computed`、`watch`（2–7） | 用于以上状态/computed/关闭 watcher；三者也供 App 其他设置、标签和布局逻辑使用。 | S |
| `onBeforeUnmount`（7–8） | App 的统一卸载 hook（178–181）里移除 auth 事件并调用 `stopAiReviewPolling`；不是一个 Wizard 独立生命周期。 | S |
| `nextTick`（11） | Wizard 跳设计器（983）；非向导还用于模板字段查询重新打开（588–590）。 | S |
| `ElMessage`（13） | 上传、校验、执行 toast；App 的导入/导出/设置/项目操作也使用。 | S |
| `Loading`（19） | Wizard spinner/AI 处理中 icon（1358、1469）；模板导入也用（1303），共享。 | S |
| `UploadFilled`（28） | Word 上传拖拽图标（1373）。 | W |
| `api`（31） | Wizard 轮询 GET、execute POST、成功后全局 cache clear；App 其他 API 流程广泛使用。真正 URL 前缀、鉴权、响应错误由 `useApi.js` 实现。 | S/X |
| `toggleSelectAll`（31） | Wizard 按 `form.index` 全选；定义于 `useApi.js` 的通用 helper。 | X |
| `getAuthHeaders`、`apiUrl`（31） | Word `el-upload` 用于 preview URL 和 auth headers（1364–1366）；二者还被 App 的 `_blobDownload`/项目数据库导入等使用（见 e）。 | S/X |
| `buildAiOverridesPayload`、`getAcceptedSuggestionsForForm`、`isAllAccepted`、`isAllIndeterminate`、`reconcileAcceptedOverrides`（32–38） | AI 接受与 payload/reconcile 的纯 helper，只有 Word 流程使用；实现位于 `/home/decade/CRF-Editor/frontend/src/composables/docxAiSuggestionOverrides.js`（39–59、61–101、103–149）。 | X |
| `defineAsyncComponent`（10）、`DocxCompareDialog`（55） | CompareDialog 动态加载；`defineAsyncComponent` 还用于其他 tabs/dialogs。 | S/X（组件本身由 Wizard 使用） |
| `FormDesignerTab`（51） | 异步设计器组件；App 标签挂载、导出取 forms、离页/切项目守卫和导入后选表单都依赖它。 | S/X |

`selectedProject`（131）是 Wizard 的项目上下文：preview action、AI status、execute、CompareDialog 的 `project-id` 都读当前的 `selectedProject.value.id`。它也被 App 项目列表、导出、项目详情等广泛使用，属于 **S**。`activeTab`/`activateTab`/`isTabActivated`（132）供全应用标签状态和 lazy-tab 控制；Wizard 仅在 `openDesignerForImportedForm` 使用前两者。`formDesignerTabRef`（133）由导出 `getForms()`（297）、切项目 `canLeaveProject()`（209）、标签离开 `canLeaveTab()`（230）和 Wizard `selectFormById()`（986）共享，属 **S**。`refreshKey`（184–185）被 provide 给子页；App 自身 `handleRefresh`（200–205）和 `watch(activeTab)`（218–224）也会改它，Wizard execute 成功时再递增，属 **S**。

## (b) Wizard 模板和打开入口

### 主对话框及步骤

Word 弹窗在 `/home/decade/CRF-Editor/frontend/src/App.vue:1355–1538`，位于普通用户主工作区分支中（外层 `v-else` 从 1083 起），**不是 admin 分支**。属性为 `v-model="showImportWordDialog"`、标题 `导入Word`、620px、禁止点遮罩关闭（1356）。没有显式 `append-to-body` 或 `before-close`。

- **全局 loading 区（1357–1359）**：`importWordLoading` 为真时隐藏所有步骤并显示 spinner。
- **Step 1（1361–1386）**：`el-upload`（1362–1378）：
  - `action`: `apiUrl('/api/projects/' + selectedProject.id + '/import-docx/preview')`（1364）
  - `headers`: `getAuthHeaders()`（1365）
  - `show-file-list=false`、`accept=.docx`（1366–1367）
  - `on-success=handleDocxUploadSuccess`、`on-error=handleDocxUploadError`、`before-upload=beforeDocxUpload`（1368–1370）
  - 文件最大 10 MiB 是 `beforeDocxUpload` 做的检查；超过时拒绝上传。错误 alert（1380–1385）。
- **Step 2（1387–1491）**：AI 轮询中/失败 alert（1389–1402）；顶端全局建议“全接受/全取消”（1404–1425）；另一个独立的导入表单全选按钮（1427–1439）；checkbox-group 绑定 `selectedFormsToImport`，迭代 `importedFormsPreview`（1440–1477）；每表单显示字段数、AI建议/状态 tag，以及 `openDocxCompare(f)` 预览按钮（1452–1474）；无表单和错误提示（1478–1490）。
- **Step 3（1492–1519）**：成功数量 alert、`importedResults` 表格；每行 `打开设计页` 用 `row.form_id` 调 `openDesignerForImportedForm`（1513）。
- **Footer（1521–1537）**：步骤 1/2 取消直接将显隐置 false；步骤 2 上一步；步骤 2 确认导入绑定 `executeImportWord`；步骤 3 关闭也置 false。

### CompareDialog 装配

`DocxCompareDialog` 装配在弹窗之后、同一个普通用户模板分支里（1540–1556）：

- `v-if="compareFormData"`，`:key="compareFormData?.index"`，`v-model="showDocxCompare"`（1542–1544）。注意条件不是 `showDocxCompare`；一旦选过预览表单，关闭子弹窗只会把 modelValue 设 false，父级保留 `compareFormData`，组件/截图面板继续挂载，直到切换到无对应表单或关闭 Word 向导清空 compare 数据。
- props：`form-data`、`temp-id`、`project-id`、`all-form-names`、`all-forms-data`、`ai-review-status`、`ai-review-error`、`accepted-suggestions`（1545–1552）。`project-id` 使用当前选择项目，名字/数据取完整预览列表。
- events：`toggle-suggestion` → `toggleAiSuggestionAcceptance`、`toggle-form` → `toggleAiSuggestionsForForm`（1553–1554）；`v-model` 由组件的 `update:modelValue` 同步。

唯一打开 Word 向导的 UI 入口是设置弹窗中的 `导入Word` 按钮（1583），属于 `settings-transfer-actions`（1579–1584），被 `v-if="!isAdmin"` 包住，且 `:disabled="!selectedProject"`。它**没有** `editMode` 限制；简要/完全编辑模式都能用。App 内搜索结果只有 `openImportWordDialog` 定义（862）和这一处模板调用（1583）：没有其它 Word 菜单项或 command handler。设计器的“导入模板”入口（`FormDesignerTab.vue:3095`）触发的是 `import-template`，不是 Word 导入。

设置弹窗没有在点击 Word 按钮时显式关闭（`showSettings` 未写 false）；Word 弹窗由同一 App 分支同时打开。

## (c) Wizard 样式

`App.vue` 的 `<style scoped>` 中明确属于 Wizard 的规则：

| 选择器 | 行范围 | 使用处/是否共享 |
|---|---:|---|
| `.form-select-header` | 1711–1717 | Step 2 选择区头部（1404）；Wizard-only。 |
| `.form-select-meta` | 1719–1724 | prompt + AI 全局操作纵向布局（1405）；Wizard-only。 |
| `.form-select-prompt` | 1726–1728 | Step 2 提示文案（1406）；Wizard-only。 |
| `.docx-ai-global-actions` | 1730–1735 | 全局接受/取消控件（1407）；Wizard-only。 |
| `.docx-ai-global-label` | 1737–1740 | “全部表单”文字（1408）；Wizard-only。 |
| `:deep(.docx-form-checkbox.el-checkbox.is-bordered)` | 1743–1747 | 表单 checkbox 占满宽度、自动高度和 padding；只用于 Step 2 的 `.docx-form-checkbox`（1450）。 |
| `:deep(.docx-form-checkbox .el-checkbox__label)` | 1749–1754 | checkbox label flex 布局；同上。 |
| `.docx-form-item` | 1756–1761 | 每行名称与操作区（1452）；Wizard-only。 |
| `.docx-form-name` | 1763–1769 | 表单名称省略布局（1458）；Wizard-only。 |
| `.docx-form-actions` | 1771–1778 | tag 和预览按钮区域（1460）；Wizard-only。 |

这些选择器没有在 App 的非 Wizard template 中复用。相反，以下样式会被 Wizard 使用但**不是**专属 Wizard，提取时应谨慎留在 App：`.settings-transfer-actions`（1861–1866）容纳设置弹窗内的多个操作；`.settings-transfer-actions :deep(.el-button)`（1868–1871）统一这些按钮；`:deep(.el-dialog)`（1903–1906）及 `:deep(.el-dialog__header)`（1908–1912）作用于 App 中所有弹窗，不只 Word。

子组件已有自己的 scoped styles，不属于 App 样式搬迁：`DocxCompareDialog.vue:187–348`（compare 双栏、AI review/suggestion、预览纸张、暗色主题等），`DocxScreenshotPanel.vue:275–390`（截图状态、页图、定位高亮）。

## (d) FormDesignerTab 挂载、ready 与选表单

- App 顶层是 `const FormDesignerTab = defineAsyncComponent(() => import(...))`（`App.vue:50–53` 中的 51），不是静态 import。
- 用户工作区 tab 由 `el-tabs v-model="activeTab"` 控制（1231–1237）；designer pane 是 `name="designer"`（1257）。组件位于 `<div v-if="isTabActivated('designer')">` 内（1258），并非 `v-show`，App 没给普通用户 tab 使用 `<KeepAlive>`。`createLazyTabState`（`useLazyTabs.js:3–19`）中 activatedTabs 是累计 Set：第一次 activate 后，切其它 tab 时 designer 内容仍保持挂载（tab pane 自己隐藏非活动内容）；切项目或 session reset 时 `resetLazyTabs('info')` 会把 Set 重置，designer 随之卸载。管理员的 `<KeepAlive>`（App.vue:1077–1080）不涉及它。
- ref `formDesignerTabRef` 绑定在组件上（1260）；传 `project-id="selectedProject.id"`（1261）。
- `/home/decade/CRF-Editor/frontend/src/components/FormDesignerTab.vue:3068–3080` 的 `defineExpose` 暴露：`canLeaveProject`、`canLeaveTab`、`getForms()`、`selectFormById(formId)`。
- `selectFormById`（3072–3079）：null ID 直接 return；先 `await loadForms()`，再以严格 `f.id === formId` 查找；未找到时静默 return；找到时 `formsTableRef.setCurrentRow(target)`，然后 `await selectForm(target)`。因此不要求先由初始 mount 加载完 forms；方法自己会重新 load（实际 `api.cachedGet`，可能命中缓存）。它不返回是否找到/选择成功的标志。
- forms 加载：`loadForms` 用 `api.cachedGet('/api/projects/{projectId}/forms')`（FormDesignerTab.vue:284–286）；`onMounted` await `loadForms()`（2968–2973）；另有 `refreshKey` watcher（432–440）和 `props.projectId` watcher（2978–3008）会刷新/重置并重载 forms。项目变化 watcher 会先走设计器离开/注记保存守卫，然后清理旧表单状态、loadForms。
- 组件 `defineEmits` 只有 `import-template`、`open-template-field-search`（134）；没有 ready/mounted/data-ready emit。App 的 20×50ms ref 等待是目前唯一的父层 readiness 等待。

## (e) App.vue 的 `apiUrl()` 和原始 `fetch`

App 中 `apiUrl` 直接调用共 4 处；原始 `fetch` 语句共 3 处：

| App.vue 行 | 代码/用途 | Wizard? |
|---:|---|---|
| 300 | `fetch(apiUrl('/api/projects/{id}/export/word'))`，Word 导出下载。 | 否（是“导出 Word”，不是导入向导） |
| 341 | `fetch(apiUrl(url), { headers: getAuthHeaders() })`，通用 `_blobDownload`；由全库/当前项目数据库导出调用。 | 否 |
| 412 | `fetch(apiUrl('/api/projects/import/auto'))`，项目 `.db` 导入。 | 否 |
| 1364 | `el-upload :action="apiUrl('/api/projects/' + selectedProject.id + '/import-docx/preview')"`。 | **是**；不是 App 内显式 `fetch`，由 Element Plus upload 发请求 |

所以 App 中**没有** Word preview/execute/AI poll 的 raw `fetch`。preview 用 `el-upload` + `getAuthHeaders()`（1364–1366）；poll/execute 用 `api.get/post`。`apiUrl` 定义在 `/home/decade/CRF-Editor/frontend/src/composables/useApi.js:32–46`，API helper 的 get/cachedGet/post/put/patch/del 在实际 `fetch` 边界统一包 `apiUrl`（151、168、190、201、212、226）。`getAuthHeaders` 在 useApi.js:50–66。

附带边界：`el-upload` 和 App 的 raw `fetch` 没经过 `api` 的 `_checkStatus` / refreshed-token / cache invalidation 处理；这与 `api.post/get` 的行为不同。上传明确传入当前 auth header，但上传响应不由 `useApi` 写入 `X-Refreshed-Token`。这不是说上传没有鉴权，而是说它绕过了该 helper 的会话响应处理。

## (f) `temp_id` 数据流

1. `el-upload` 向 `POST /api/projects/{projectId}/import-docx/preview` 上传（App.vue:1364–1370）。有效响应条件是 `response.forms && response.temp_id`（899–905）；把响应 `temp_id` 写入 `tempDocxId`，表单列表写入 preview。可选的 `response.ai_task_id` 另走 `startAiReviewPolling`（908–910）。
2. **执行导入**：`executeImportWord` 的 body 明确带 `temp_id: tempDocxId.value`（947），另带所选 `form_indices`（948），必要时附 `ai_overrides`（950–957）；endpoint 是 `/api/projects/{selectedProject.id}/import-docx/execute`（958）。
3. **AI review 不使用 `temp_id`**：它使用预览响应单独返回的 `ai_task_id`，存于 `importWordAiTaskId`；GET URL 的 ID 是 `encodeURIComponent(taskId)`（835），路径 `/import-docx/{taskId}/ai-review/status`。这一区别很重要。
4. **Compare → Screenshot**：App 将 `tempDocxId || ''` 作为 `temp-id` prop（1546）；`DocxCompareDialog` 再传给 `DocxScreenshotPanel`（`DocxCompareDialog.vue:16–23`）。截图面板监听 `props.tempId`，immediate watcher 在有值时 `kickoff()`（`DocxScreenshotPanel.vue:95–102`、171–199），接着请求：POST `.../{tempId}/screenshots/start`（187）、GET `.../{tempId}/screenshots/status`（224）、GET `.../{encodeURIComponent(tempId)}/screenshots/pages/{page}`（241–250）。因此 temp ID 是截图任务的路径身份，不在截图 start body 中。
5. **重置**：`tempDocxId=null` 只在首次打开初始化（App.vue:867）和“上一步”重置（881）；关向导 watcher、执行成功/失败、关 CompareDialog 都不清 temp ID。关闭步骤 3 后数据仍在 App refs，下一次 `openImportWordDialog()` 才完整清理。

截图组件卸载时会停轮询、清定位提示并 revoke 图片 blob URL（DocxScreenshotPanel.vue:134–138）；`tempId` 变空时 `reset()` 也做类似清理（140–152）。注意 CompareDialog 父节点只按 `compareFormData` 条件挂载，单独关闭 `showDocxCompare` 不一定卸载截图面板。

## (g) 与 App 其他状态/能力的交互

- **项目选择**：上传 action、AI status、execute、CompareDialog `project-id` 都读取当前 `selectedProject`，没有在打开向导时冻结一个 projectId，也没有 watcher 在 project 切换时重置/关闭 Wizard。正常 UI 下模态对话框会遮挡底层项目列表，但代码本身没有跨项目保护；若发生程序化切换，后续请求会用新项目 ID 配旧 `temp_id`。打开按钮本身禁用无项目状态（1583）。
- **活动标签与全局刷新**：打开 Wizard 不改 `activeTab`；执行成功只在向导留在第 3 步时清所有 API cache、递增 `refreshKey`（962–963），使已挂载子页刷新。用户点“打开设计页”才关 Wizard、切到 designer、选表单。App 其他 `handleRefresh`（200–205）及切到 fields/designer watcher（218–224）也会影响同一个 refresh/cache 状态。
- **设计器守卫/ref**：切项目时 App 若 designer 曾激活会调用 `canLeaveProject`（207–215），切离 designer tab 时调用 `canLeaveTab`（226–235）；它们不是 Wizard 自己的逻辑。导入后由 Wizard navigation bridge 调 `selectFormById`。成功时不会自动跳设计器，也不调用 `loadProjects()`；先显示结果列表和成功 toast。
- **认证/会话失效**：App 在 mount 时注册 `crf:auth-expired`（173–176），handler `resetSessionState` 清项目/用户/cache，并重置 lazy tabs（72–83、108–111）；useApi 对同 session 的 401 dispatch 事件（useApi.js:86–97）。Wizard 的 `api.get` poll 和 `api.post` execute 参与此行为；当前 poll 的 catch 会停止 timer 并将状态置 failed（847–852）。直接 `el-upload` 与截图页 blob fetch 用 `getAuthHeaders` + raw transport，不走该 401/refreshed-token 处理。
- **会话重置的清理缺口**：`resetSessionState()` 不将 `showImportWordDialog` 置 false，也不调用 `resetImportWordAiReview`。session 过期导致普通用户模板分支消失时，App 组件本身仍在，故关闭 watcher 不一定因 ref 改变触发；若当时已有轮询，下一次 callback 因 `selectedProject` 已空会直接 return（832），不会继续排轮询，但它不是由 resetSessionState 主动清掉。App 真正 unmount 时才由 178–181 清 timer。下一次显式打开向导会完整 reset。可作为提取时决定把清理绑定到组件 unmount/session transition 的点。
- **主题**：Wizard 不读取 `isDark`；使用 App CSS 变量/全局 dialog 样式（1902–1912），CompareDialog 自己另有暗色全局选择器（DocxCompareDialog.vue:235–242）。主题由 App 的 `setTheme/applyTheme` 更新 root（App.vue:995–1014）。
- **编辑模式**：Wizard 没有读取 `editMode`，入口也不受它限制；只受 `!isAdmin` 的普通用户分支和 `selectedProject` 按钮禁用影响。
- **其他 UI**：Word 向导从设置弹窗操作区打开，打开时不清 `showSettings`；普通 Word 导入链路不会写 `selectedProject`、`activeTab`（除结果页明确跳转）、`editMode` 或 theme。全局 `refreshKey`/cache 是执行成功唯一显著的跨页写入。

## (h) 提取规模估算

按现有行范围粗估（含空行/注释，故是物理行而非有效代码行）：

- `useWordImport.js` 候选：App.vue **676–977，约 302 行**（Wizard refs、AI、上传、执行、比较状态等）。如果把 `openDesignerForImportedForm` 也塞进 composable，再加 **15 行**（978–992），但它直接依赖 App 的 tab/ref，较自然的是留在 App 做事件回调。
- `WordImportDialog.vue` 候选：App.vue **1355–1556，约 202 行**（主 3 步 dialog + CompareDialog mount/props/events）。
- Wizard 专属 App scoped styles：**1711–1778，约 68 行**。
- 所以不含导航 bridge、shared imports/host adapters，直接迁移约 **572 行**；若导航函数整体一并迁走约 **587 行**。还需调整 `UploadFilled`、suggestion helper、`DocxCompareDialog` imports 和 App 的 `导入Word` 按钮（1583）连接，但共享 `api`、`selectedProject`、`refreshKey`、theme/auth 壳、designer navigation/ref 仍属于 App 集成面。通用 `.settings-transfer-actions` 和 dialog deep styles 不应算 Wizard 专属搬迁。

### 验证范围

只读查看了上述文件与 `useLazyTabs.js`、`docxAiSuggestionOverrides.js` 的直接实现；使用 `rg -n` 定位引用并逐段读源码。未运行构建/测试（无代码改动，且本任务要求只读）。

建议下一步：据此将 `WordImportDialog.vue` 管理显示/模板和 compare 子组件，将 `useWordImport.js` 管理上传、AI 轮询及接受态；App 保留 project/refresh/auth 集成和 `openDesignerForImportedForm` 导航桥，并在提取方案中明确 session reset 时的 timer 清理行为。
