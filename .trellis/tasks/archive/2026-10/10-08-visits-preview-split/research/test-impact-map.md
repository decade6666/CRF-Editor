# 测试影响图（preview split: VisitsTab → VisitFormPreviewDialog.vue + useVisitFormPreview.js）

> Source: read-only audit, `main` @ `0d111a1`, 2026-10-12。
> 基准文件：`/home/decade/CRF-Editor/frontend/src/components/VisitsTab.vue`（1545 行）。
> 行号均指该提交下的实际行号（已逐条 grep/Read 复核，非估算）。
> 分类：`MOVE` = 断言应重指向新组件/新 composable；`DELETE/REPLACE` = 断言对象将彻底消失，需替换行为断言；`STAYS` = 读取 VisitsTab 源码但断言仍有效。

搬迁边界（核对结论）：

| 区段 | 行号 | 处理 |
|---|---|---|
| script：viewMode 助手 | 62–91 | MOVE |
| script：注解文本助手 | 93–102 | MOVE |
| script：预览状态块 | 115–135 | MOVE（`showFormPreview` 是否留作桥接见 §5-1） |
| `writeStoredViewMode(viewMode.value)` 初始化 | 129 | MOVE |
| `load()` 内预览刷新块 | 202–210 | 改写（单表单状态由弹窗自持） |
| `onBeforeUnmount`（仅 `annotationDrag.dispose()`） | 214–216 | MOVE |
| projectId watcher 内预览清理 | 224–226 | MOVE（清理动作改由弹窗 `@closed`/组件卸载承担） |
| viewMode / editMode 两个 watcher | 232–247 | MOVE |
| `toRendererField` / `escapePreviewText` | 400–420 | MOVE |
| `createPreviewCellRenderers` 适配器 | 426–433 | MOVE |
| 列宽/填写线助手 | 440–459、587–623 | MOVE |
| `mergeFormIntoState` / `getFormStateById` | 461–501 | DELETE/改写 |
| 注解位置助手 | 503–585 | MOVE |
| 行高助手 | 625–639 | MOVE |
| 渲染组 / 视图模型 / 横竖版 | 641–668 | MOVE |
| `openFormPreview` / `resetFormPreviewState` | 670–710 | MOVE |
| 预览弹窗模板 | 988（注释）–1451（`</el-dialog>`），`</template>` 1452 | MOVE |
| `<style scoped>` 整块 | 1454–1545 | MOVE |
| 预览按钮（保留） | 967 | STAYS |

---

## Section 1 — 测试文件映射

命中文件共 18 个（`grep -rln 'VisitsTab' frontend/tests/`）；`tests/component/` 下无任何文件引用 VisitsTab（已全量 grep 确认）。

### 1. acrfViewToggle.test.js（读源：L11、L21 `visitsTabSource`）

| 测试（行号） | 断言行 | 内容 | 分类 |
|---|---|---|---|
| `VisitsTab preview shares the same persisted viewMode and reuses the annotation drag wiring` (138) | 139–146 | `compileFunction` 从 visitsTabSource 编译 `normalizeStoredViewMode` / `resolveInitialViewMode` / `getFieldOidAnnotationText` / `getFormDomainAnnotationText` 并断言返回值 | MOVE |
| | 161 | `const VIEW_MODE_STORAGE_KEY = 'crf_view_mode'` | MOVE |
| | 162–165 | `const viewMode = ref(resolveInitialViewMode(editMode.value, readStoredViewMode()))` | MOVE |
| | 166–169 | viewMode watcher 写 `writeStoredViewMode(normalizedMode)` | MOVE |
| | 170–173 | editMode watcher 走 `resolveInitialViewMode(enabled, viewMode.value)` | MOVE |
| | 174–177 | `showAcrfAnnotations = computed(() => editMode.value && viewMode.value === 'aCRF')` | MOVE |
| | 178 | `const annotationDrag = useAcrfAnnotationDrag(` | MOVE |
| | 179–183 | `getCurrentPositions` / `applyOptimisticPositions` 绑定 | MOVE |
| | 184–187 | projectId watcher 串：`flushAnnotationPositionSave({cancelActiveDrag:true})` → `showFormPreview.value = false` → `resetFormPreviewState({ skipAnnotationCleanup: true })` → `load()` | MOVE |
| | 188–191 | `resetFormPreviewState` 函数体（cancelActiveDrag + flush，skip 分支） | MOVE |
| | 193–195 | 预览弹窗内 eCRF/aCRF switch 计数 `=== 1` | MOVE |
| | 196–199 | `<template #header>` 内 `<el-switch v-if="editMode" v-model="viewMode">` | MOVE |
| `VisitsTab aCRF annotations stay inside the preview word page and keep the same anchor strategy` (242) | 243–247 | `'wp-acrf-annotation--form'` 计数 `=== 1` | MOVE |
| | 248 | `class="wp-form-title-row"` 计数 `=== 1` | MOVE |
| | 249–252 | 标题行内 `{{ formPreviewTitle }}` + `getAnnotationStyle(...ANNOTATION_KIND_FORM)` | MOVE |
| | 253–256 | unified-value 单元格字段注解（`v-if="showAcrfAnnotations && getFieldOidAnnotationText(seg.fields[0])"`） | MOVE |
| | 257–260 | 内联表头注解（`ANNOTATION_KIND_INLINE_HEADER`） | MOVE |
| | 261–268 | 负向：inlineRows 内不得逐格渲染 OID 注解（`gv.inlineRows` / `seg.inlineRows`） | MOVE |
| | 269–271 | `onAnnotationPointerDown` / `resetAnnotationPosition` / `class="wp-acrf-annotation-reset"` | MOVE |
| `VisitsTab preview annotation styles stay absolute and draggable without entering table text geometry` (329) | 330–339 | `.wp-acrf-annotation` 规则体（absolute/top/width/height/border/背景/颜色/无 pointer-events:none） | MOVE |
| | 341–343 | `.wp-acrf-annotation--interactive { cursor: ns-resize }` | MOVE |
| | 345–348 | `.wp-form-title-row { position: relative; padding-right: 4.8cm }` | MOVE |
| | 350–353 | `.wp-acrf-annotation-reset` 规则体 | MOVE |
| `aCRF reset button stays hidden while disabled until hover/focus-within reveals its muted state` (356) | 357–381 循环中 `['VisitsTab.vue', visitsTabSource]` 分支 | 三条规则体断言（disabled 无 opacity / disabled reveal 0.45 / base reveal 1），对应源 1533–1540 | MOVE（循环另一支 DesignerAcrfAnnotation 保留） |
| `VisitsTab mergeFormIntoState preserves per-collection fields like sequence on aCRF drag save` (405) | 410–414 | `visitForms.value.map(item => … { ...item, ...updatedForm })` | **DELETE/REPLACE** |
| | 415–419 | `allForms.value` 同形合并 | DELETE/REPLACE |
| | 420–424 | `matrixData.value.forms` 同形合并 | DELETE/REPLACE |
| | 426–430 | 负向：不得用 `nextForm` 覆盖 visitForms | DELETE/REPLACE |
| | 432–436 | `formPreviewForm.value = { ...formPreviewForm.value, ...updatedForm }` | DELETE/REPLACE |

> 其余 5 个测试（78/105/202/274/286/384）只读 FormDesignerTab / DesignerAcrfAnnotation / DesignerWordPreview，不受影响。

**DELETE/REPLACE 替换建议**：被删断言保护的真实行为是「aCRF 拖动保存回写 `{id, annotation_positions}` 后，右侧访视表单列表的 `sequence` 不被覆盖」。拆分后弹窗自持单表单状态、不再写回 VisitsTab 集合，该风险消失，但需要补两条：①`onPersisted` 后仍失效 `\`/api/projects/{pid}/forms\`` 与 `\`/api/forms/{id}/fields\`` 缓存并重载（现断言在 526–534 无测试覆盖，建议新增）；②VisitsTab 侧行为断言「预览打开/保存期间 `visitForms` 的 sequence 不变」（可用组件挂载或纯函数测试替代源码正则）。

### 2. appTabLazyLoad.test.js — STAYS（无预览关联）

| 测试（行号） | 断言行 | 内容 | 分类 |
|---|---|---|---|
| `non-activated tabs do not mount…` (54) / `activated tabs stay activated…` (87) / `dialog async component loads…` (125) | 45、67、100、138 | 用本地 `createAsyncTab('VisitsTab', …)` **桩件**渲染，不读 VisitsTab 源码 | STAYS |

### 3. checkboxFieldType.test.js（读源：L22）

| 测试（行号） | 断言行 | 内容 | 分类 |
|---|---|---|---|
| `all preview paths retain renderer data required for checkbox text` (113) | 118–121 | `function toRendererField(fd) { … label: fd.label, … checkbox_label: fd.checkbox_label` | MOVE（`toRendererField` 随预览迁出） |

> 同测试其余断言（114–117 设计器、122–127 模板预览、128–143 行为、146–149 生成器）不受影响。

### 4. columnWidthPlanning.test.js（读源：L43–46）

| 测试（行号） | 断言行 | 内容 | 分类 |
|---|---|---|---|
| `9.3f5 inline 多行默认值回退同样走 renderCtrlTextHtml…` (196) | 227 | `visitsSource` 内 `renderFallback: renderCtrlTextHtml,` | MOVE（源在 L430） |
| | 229 | 负向 `fallback: toHtml(renderCtrl` | MOVE |
| `16.1.5h preview hot paths require precomputed segments…` (797) | 803–807 | 负向 `group.segments \|\| buildFormDesignerUnifiedSegments` | MOVE |
| `16.1.5i visits inline column fractions reuse the resolved ratios once` (810) | 811–815 | 负向 `resolveInlineColRatios(group.fields).length … ? resolveInlineColRatios(group.fields)`（单次调用形状，源 L600–604） | MOVE |
| `16.1.5j visits normal choice preview preserves fillLineChars forwarding` (818) | 848–852 | `renderCellHtml(ff, normalFillChars(gv, gi))`（模板硬接线，源 L1327） | MOVE |
| | 823–846 | 行为断言（共享模块 + `renderCtrlTextHtml` 输出） | STAYS |
| `16.2.5i 列宽键拼装/解析/校验/迁移只存在于 useColumnResize（接线守卫）` (1096) | 1098 | 负向 `function readPersistedColRatios`（源无） | MOVE |
| | 1099 | `readColumnWidthRatios(`（源 L444/454/590） | MOVE |
| | 1100–1102 | `buildTableInstanceId('inline'/**'normal'**'unified', …)` 三种调用形状（源 L444/454/590） | MOVE |

### 5. editModeHiddenIdentifiers.test.js（读源：L14）— STAYS

| 测试（行号） | 断言行 | 内容 | 分类 |
|---|---|---|---|
| `visit OID controls are visible only in complete edit mode…` (92) | 93–104 | 访视 OID 列顺序、属性卡 OID/名称、三个负向 | STAYS（全在列表/属性卡；负向 `v-show="false"` 为全文扫描仍有效） |

### 6. formDesignerPreviewModel.test.js（读源：L28–31）

| 测试（行号） | 断言行 | 内容 | 分类 |
|---|---|---|---|
| `visits tab form preview derives a view model and stops calling pure fns in template` (262) | 263 | `import { buildPreviewGroupViewModels }` | MOVE |
| | 264–267 | `const previewGroupsView = computed(() => buildPreviewGroupViewModels(previewRenderGroups.value, previewModelHelpers)` | MOVE |
| | 268–275 | 模板 `v-for="(gv, gi) in previewGroupsView"`、`seg.mergeSpans[idx]/[ci]`、`labelValueSpans.labelSpan/valueSpan`、`seg.inlineRows` / `gv.inlineRows` | MOVE |
| | 276–280 | 四条负向（不得在模板内直调 `buildFormDesignerUnifiedSegments` / `computeMergeSpans` / `computeLabelValueSpans` / `getInlineRows`） | MOVE |

> 建议随迁改名（“visits tab form preview” → 新组件名），并保留模板级负向守卫。

### 7. formFieldPresentation.test.js（读源：L35–38）

| 测试（行号） | 断言行 | 内容 | 分类 |
|---|---|---|---|
| `preview structural colors are unified across designer and template preview paths` (315) | 328 | `visitsSource` 含 `getFormFieldLabelPreviewStyle` | MOVE |
| | 331 | 负向 `'font-weight:bold;' + getFormFieldStructurePreviewStyle` | MOVE |
| `designer and visits Word previews both expose row height resize handles` (403) | 405–410 | `useRowResize` / `function getPreviewRowResizer` / `wp-ctrl row-resize-anchor` / `row-resizer-handle` / `onResizeStart(getNormalRowKey(ff)` / `onResizeStart(getUnifiedRegularRowKey(seg.fields[0])` | MOVE |
| `designer preview uses full-width static layout without scale logic` (423) | 443 | `<div class="wp-form-title">{{ formPreviewTitle }}</div>` | MOVE |

### 8. listActionsIconify.test.js（读源：L28 映射、L68、L90）

| 测试（行号） | 断言行 | 内容 | 分类 |
|---|---|---|---|
| `src/components/VisitsTab.vue toolbar uses icon add and always-visible batch delete buttons`（43 生成，条目在 28） | 46–52 | `:icon="Plus" aria-label="新增访视"`、`:icon="Delete" aria-label="批量删除访视"…:disabled="!sel`、tooltip、负向批量删除计数 | STAYS |
| `action columns use semantic icon buttons with tooltips and aria-labels` (63) | 71、77、80、81、84、86 | 复制/删除图标、`View`→预览、`CircleClose`→移除、负向 EditPen 导入 | STAYS（预览按钮 967 留在 VisitsTab） |
| `visit flow moved to a top-level tab…` (89) | 90、94、97–98 | 负向 `>访视流程</el-button>`、`/showPreview/`、`/批量编辑/` | STAYS（注意 §5-3 的命名陷阱） |

### 9. orderingStructure.test.js（读源：L10）

| 测试（行号） | 断言行 | 内容 | 分类 |
|---|---|---|---|
| `VisitsTab wires visit form drag sorting through useSortableTable` (71) | 72–91 | vuedraggable 负向、`visitFormsTableRef`、reorderUrl、`useSortableTable(…)`、watcher、表格属性 | STAYS |

### 10. ordinalQuickEditWiring.test.js（读源：L11）

| 测试（行号） | 断言行 | 内容 | 分类 |
|---|---|---|---|
| `VisitsTab wires quick ordinal edit for visits and visit forms` (58) | 59–73 | 导入、`orderKey: 'sequence'`、四个 startEdit/commit/cancel、`v-if="workspaceMode === 'list' && editingVisitId === row.id"`、`countMatches(:controls="false") === 2` | STAYS（预览弹窗无 `:controls`，计数不受搬迁影响） |

### 11. previewCellRender.test.js — STAYS（不读任何 Vue 源码）

全部 12 个测试只 import composable 与 `createPreviewCellRenderers` 适配器；L7/67/85/100/189/198/210/233/240/247/255 为**注释中的 VisitsTab 行号指针**（见 §5-4）。绑定 `vtBound`（342–349）逐字复刻 VisitsTab 的适配器形状——若新 composable 保留同名 `toRendererField`/`escapePreviewText` 与 `getScopedDefaultValue(ff, false)` cell 策略，注释只需更新指针。

### 12. projectDeleteConfirmation.test.js（读源：L19）

| 测试（行号） | 断言行 | 内容 | 分类 |
|---|---|---|---|
| `standard management delete handlers require confirmation…` (127) | 137–138、156–159、170–171 | `del`/`batchDelVisits` 确认先于删除、`removeFormFromVisit` 不二次确认 | STAYS |
| `visit flow matrix removes an unchecked association directly…` (182) | 183–189 | `toggleCell` 直接 DELETE、负向 confirmDelete、负向整文件 `import { confirmDelete }` | STAYS（新增子组件也不得引入 confirmDelete） |

### 13. rowHeightResize.test.js（读源：184–188 数组、202–216 循环）

| 测试（行号） | 断言行 | 内容 | 分类 |
|---|---|---|---|
| `VisitsTab row resize handle covers every cell of a row`（204 生成；条目在 187） | 208–215 | `class="wp-label row-resize-anchor"`、`class="unified-label row-resize-anchor"`、四条负向（“仅末列”旧守卫：`ci === row.length - 1` / `idx === seg.fields.length - 1` 共 4 形态） | MOVE（把 `['VisitsTab', …]` 换成/追加 `VisitFormPreviewDialog.vue`；源在 1056/1319 等） |
| 同文件其余 7 个测试（41/55/99/118/130/157/189） | — | `useRowResize` 行为 + main.css 整行指示线 | STAYS |

### 14. searchRankingWiring.test.js（读源：L18、L41）

| 测试（行号） | 断言行 | 内容 | 分类 |
|---|---|---|---|
| `search components import the shared ranked fuzzy search helper` (21) | 18、24 | VisitsTab 在 `SEARCH_COMPONENTS` 中且导入 `rankFuzzyMatches` | STAYS |
| `search components route filtered lists through rankFuzzyMatches` (35) | 41 | `rankFuzzyMatches(visits.value, searchVisit.value` | STAYS |

### 15. tableHeaderStyle.test.js（读源：L10）

| 测试（行号） | 断言行 | 内容 | 分类 |
|---|---|---|---|
| `VisitsTab visit-form list uses Element Plus bordered table headers` (67) | 68–78 | 访视表单表结构 / 列定义 / **`aria-label="预览" … openFormPreview(row)`** / 移除按钮 / 负向旧表头 | STAYS（L76 是与被搬迁函数的接线契约：`openFormPreview` 必须仍在 VisitsTab 中存在） |

### 16. toolbarPaneAlignment.test.js（读源：L15）

| 测试（行号） | 断言行 | 内容 | 分类 |
|---|---|---|---|
| `VisitsTab list workspace keeps the root gap-free…` (100) | 101–109 | 根容器 / list 分支 / 320px 属性卡结构（不含弹窗） | STAYS |
| `VisitsTab consumes the shared toolbar contract (visit-flow subtask)` (131) | 132–133 | `class="list-toolbar"` / `class="pane-tool-slot"` | STAYS |

### 17. visitFlowWorkspace.test.js（读源：L8）

| 测试（行号） | 断言行 | 内容 | 分类 |
|---|---|---|---|
| `default visit page is a two-pane list workspace without batch-edit` (11) | 12 | 负向 `showPreview = true` | STAYS |
| `matrix renders in-page without a dialog wrapper` (93) | 94 | 负向 `/v-model="showPreview"/` | STAYS |
| `single-visit right pane keeps form add, remove, sort, quick edit and preview` (113) | 116 | `openFormPreview(row)`（预览按钮保留） | STAYS |
| | 114–115、117–118 | addForm/removeForm/ordinal/sort | STAYS |
| `visit preview dialog wiring is preserved` (139) | 140 | `v-model="showFormPreview"` | MOVE（弹窗元素迁出；应改为断言 VisitsTab 渲染 `<VisitFormPreviewDialog v-model="showFormPreview" …>`） |
| | 141 | `openFormPreview` | STAYS（作为打开入口保留），但需与 140 一起重写 |
| | 142 | `annotationDrag` | MOVE（`useAcrfAnnotationDrag` 实例迁入弹窗/composable） |
| 其余 10 个测试 | — | 工作区/list 分支/矩阵/单访视排序复位等 | STAYS |

### 18. wordPageGeometry.test.js（读源：L161–164）

| 测试（行号） | 断言行 | 内容 | 分类 |
|---|---|---|---|
| `shared A4 page class fixes VisitsTab preview to 21cm/29.7cm (parity with designer)` (147) | 150–159 | main.css `.word-page--a4` / `.landscape` 规则 | STAYS |
| | 165–169 | VisitsTab 源码 `/'word-page',\s*'word-page--a4'/`（源 L1012） | MOVE |

### 分类计数汇总

| 分类 | 文件数 | 受影响的 test 块 |
|---|---|---|
| MOVE | 8：acrfViewToggle、checkboxFieldType、columnWidthPlanning、formDesignerPreviewModel、formFieldPresentation、rowHeightResize、visitFlowWorkspace、wordPageGeometry | 17（acrfViewToggle 138/242/329/356、checkboxFieldType 113、columnWidthPlanning 196/797/810/818/1096、formDesignerPreviewModel 262、formFieldPresentation 315/403/423、rowHeightResize 204、visitFlowWorkspace 139、wordPageGeometry 147） |
| DELETE/REPLACE | 1：acrfViewToggle | 1（测试 405，含 5 条正则） |
| STAYS | 9 个整文件仅 STAYS（appTabLazyLoad、editModeHiddenIdentifiers、listActionsIconify、orderingStructure、ordinalQuickEditWiring、previewCellRender、projectDeleteConfirmation、searchRankingWiring、tableHeaderStyle、toolbarPaneAlignment）+ 混合文件中的保留断言 | — |

（acrfViewToggle、checkboxFieldType、columnWidthPlanning、formDesignerPreviewModel、formFieldPresentation、rowHeightResize、visitFlowWorkspace、wordPageGeometry 含 MOVE；其中 acrfViewToggle 另含 DELETE/REPLACE。appTabLazyLoad 等 10 个文件为纯 STAYS。）

---

## Section 2 — import 归属表

逐 import 的标识符：出现总次数 = import 行 + 使用点；「非预览使用点」列出脚本/模板中的行号与所在函数。

| 标识符 | import 行 | 总次数 | 非预览使用点 | 分类 |
|---|---|---|---|---|
| `ref` | 2 | 31 | `visits`106、`searchVisit`105、`workspaceMode`113、`flowView`114、`selectedVisit`137、`isCreatingVisit`138、`addFormId`381、`selVisits`348、`visitsTableRef`250、`visitForms`292、`visitFormsTableRef`293、表内联 refs | STAYS |
| `reactive` | 2 | 2 | `visitEditProp`139 | STAYS |
| `computed` | 2 | 14 | `filteredVisits`106、`isFiltered`251、`reorderUrl`252、`availableForms`308、`visitFormReorderUrl`713 | SHARED（其余 9 处在预览：587/609/641/654/658/666/516 等） |
| `watch` | 2 | 8 | 217（projectId）、230（refreshKey）、231（selectedVisit）、732、736 | SHARED（232/240 两个 viewMode/editMode watcher 属于预览） |
| `onMounted` | 2 | 2 | 213 | STAYS |
| `onBeforeUnmount` | 2 | 2 | 214（**唯一用途是 `annotationDrag.dispose()`**） | MOVE |
| `nextTick` | 2 | 6 | 180、181、213、733、738、740 | STAYS |
| `inject` | 2 | 3 | 60（`refreshKey`）、61（`editMode`） | SHARED（`editMode` 同时驱动预览 117/233/240/516/994） |
| `ElMessage` | 3 | 11 | 330、345、362、371、388、397、755 | SHARED（预览使用点 526、689） |
| `ElMessageBox` | 3 | 3 | 335（`del`）、351（`batchDelVisits`） | STAYS |
| `api` | 4 | 42 | 193–195、254、315–328、337、353、368、682 之外的全部 CRUD/缓存点 | SHARED（预览使用点 519 `apiClient`、528/531 `invalidateCache`、682 `cachedGet('/api/forms/{id}/fields')`、533 `load()`） |
| `genCode` | 4 | 2 | 375（`openAdd`） | STAYS |
| `useSortableTable` | 5 | 4 | 265（访视）、714（访视表单） | STAYS |
| `useOrdinalQuickEdit` | 6 | 4 | 283（访视）、727（访视表单） | STAYS |
| `rankFuzzyMatches` | 7 | 2 | 107 | STAYS |
| `CircleClose` | 8 | 2 | 970（移除按钮） | STAYS |
| `Delete` | 8 | 3 | 770（批删）、824（行删除） | STAYS |
| `DocumentCopy` | 8 | 2 | 821（复制按钮） | STAYS |
| `Plus` | 8 | 2 | 767（新增访视） | STAYS |
| `View` | 8 | 2 | 967（预览按钮） | STAYS |
| `ANNOTATION_FORM_KEY` | 10 | 2 | — | MOVE |
| `ANNOTATION_KIND_FIELD` | 11 | 6（import + 1079/1130/1250/1294/1342） | — | MOVE |
| `ANNOTATION_KIND_FORM` | 12 | 2（1025） | — | MOVE |
| `ANNOTATION_KIND_INLINE_HEADER` | 13 | 3（1179/1399） | — | MOVE |
| `buildAnnotationStyle` | 14 | 2（`getAnnotationStyle` 566） | — | MOVE |
| `hasAnnotationOverride` | 15 | 2（562） | — | MOVE |
| `normalizeAnnotationPositions` | 16 | 3（504/509） | — | MOVE |
| `readAnnotationDelta01Cm` | 17 | 2（569） | — | MOVE |
| `useAcrfAnnotationDrag` | 19 | 3（518 实例、215 dispose） | — | MOVE（连同 `onBeforeUnmount`） |
| `buildFormDesignerRenderGroups` | 21 | 2（641） | — | MOVE |
| `buildFormDesignerUnifiedSegments` | 22 | 2（647） | — | MOVE |
| `getFormFieldDisplayLabel` | 23 | 8（模板 1057/1115/1163/1235/1279/1320/1383） | — | MOVE |
| `getFormFieldPreviewStyle` | 24 | 5（1063/1213/1326/1432） | — | MOVE |
| `getFormFieldLabelPreviewStyle` | 25 | 8（1056/1113/1161/1234/1278/1319/1381） | — | MOVE |
| `buildTableInstanceId` | 28 | 5（444/454/590/627） | — | MOVE |
| `useRowResize` | 29 | 3（631） | — | MOVE |
| `getNormalRowKey` | 30 | 8（模板行高/拖拽锚点） | — | MOVE |
| `getInlineHeaderRowKey` | 31 | 3（1376/1419） | — | MOVE |
| `getInlineDataRowKey` | 32 | 3（1426/1437） | — | MOVE |
| `getUnifiedRegularRowKey` | 33 | 4（1054/1060/1099） | — | MOVE |
| `getUnifiedFullRowKey` | 34 | 3（1105/1150） | — | MOVE |
| `getUnifiedInlineHeaderRowKey` | 35 | 3（1155/1199） | — | MOVE |
| `getUnifiedInlineDataRowKey` | 36 | 3（1206/1218） | — | MOVE |
| `planInlineColumnFractions` | 39 | 3（446） | — | MOVE |
| `planNormalColumnFractions` | 40 | 3（456） | — | MOVE |
| `planUnifiedColumnFractions` | 41 | 2（592） | — | MOVE |
| `renderCtrlTextHtml` | 42 | 2（430 `renderFallback`） | — | MOVE |
| `computeFillLineCharCount` | 43 | 2（622） | — | MOVE |
| `shouldUseLandscapePreview` | 45 | 2（659） | — | MOVE |
| `resolveNormalTableAvailableCm` | 45 | 2（613） | — | MOVE |
| `readColumnWidthRatios` | 46 | 4（444/454/590） | — | MOVE |
| `computeMergeSpans` | 48 | 2（651） | — | MOVE |
| `computeLabelValueSpans` | 49 | 2（652） | — | MOVE |
| `getScopedDefaultValue` | 50 | 3（428/429） | — | MOVE |
| `createPreviewCellRenderers` | 51 | 2（426） | — | MOVE |
| `buildPreviewGroupViewModels` | 53 | 2（655） | — | MOVE |

**结论**：MOVE-only 共 30 个标识符（可整批迁到 `VisitFormPreviewDialog.vue` 或经 `useVisitFormPreview.js` 导出）；SHARED 5 个（`computed`、`watch`、`inject`、`ElMessage`、`api`）；STAYS 14 个。`onBeforeUnmount` 整块随预览迁移是隐藏点：VisitsTab 拆分后如果不再注册任何卸载钩子，可整行删除（§5-5）。

额外风险：模板 1005 行使用 `<Loading />`，但 icons-vue 的 import（第 8 行）**未包含 `Loading`** —— 它依赖 `src/main.js` 的全局图标注册。新组件必须显式 `import { Loading } from '@element-plus/icons-vue'`，或继续依赖全局注册（vitest `tests/component/setup.js` 与 `src/main.js` 注册方式一致，挂载测试可解析）。

---

## Section 3 — 预览块内的用户可见字符串

| 行号 | 字面量 | 位置 | 是否被测试断言 |
|---|---|---|---|
| 526 | `` aCRF 标注位置保存失败：${error.message} `` | `onError` 提示 | 否 |
| 672 | `'表单预览'` | `openFormPreview` 标题兜底 | 否（标题变量名 `formPreviewTitle` 被断言：acrfViewToggle 251、formFieldPresentation 443） |
| 688 | `'加载表单字段失败：'` + `'未知错误'` | 字段加载失败提示（同时 `ElMessage.error`） | 否 |
| 992 | `{{ formPreviewTitle }}` | 弹窗标题 | 间接（变量名被断言，见上） |
| 997 / 998 | `active-text="aCRF"` / `inactive-text="eCRF"` | 头部模式 switch | 是（acrfViewToggle 194、196–199） |
| 1005 | `加载中...` | loading 占位 | 否 |
| 1007 | `:title="formPreviewError"` | el-alert 标题 | 否 |
| 1009 | `暂无字段` | 空字段占位 | 否（同名文案在 `tests/component/DesignerWordPreview.spec.js:210,214` 被断言，但对象是设计器组件） |
| 1036 | `aria-label="重置表单标注位置"` | 表单域注解重置按钮 | 否（设计器同名文案断言在 `DesignerAcrfAnnotation.spec.js:88`、`designerPreviewSplit.test.js:297`） |
| 1090 / 1141 / 1190 / 1261 / 1305 / 1353 / 1410 | `aria-label="重置字段标注位置"` | 7 处字段注解重置按钮 | 否（设计器断言：`DesignerAcrfAnnotation.spec.js:94,95`） |
| 1040 / 1094 / 1145 / 1194 / 1265 / 1309 / 1357 / 1414 | `R`（按钮文本） | 8 处重置按钮 | 否 |
| 1115 / 1279 | `'以下为log行'` | 预览结构行标签兜底 | 否（`formFieldPresentation.test.js:86,92,118` 断的是共享 helper；`DesignerWordPreview.spec.js:230` 是设计器） |
| 1444 | `aria-label="设计备注"` | 备注 aside | 否 |
| 1445 | `设计备注` | 备注标题 | 否（`DesignNotesDialog` 相关断言是另一个组件） |
| 1446 | `v-html="previewDesignNotesHtml"` | 备注正文 | 否 |

> 结论：预览块内**没有任何字符串字面量被现测试直接断言**；被断言的都是变量名与结构类名（`formPreviewTitle`、`wp-form-title`、`wp-acrf-annotation*`、`word-page--a4`）。因此字符串可以原样搬迁，但 §1 中的变量名/类名断言必须同步重指向。

---

## Section 4 — 组件测试清单（`frontend/tests/component/`）

| 文件 | 挂载对象 | 说明 |
|---|---|---|
| `CodelistQuickEditDialog.spec.js` (414 行) | `CodelistQuickEditDialog.vue` | 共享字典快捷增/改弹窗 |
| `DesignNotesDialog.spec.js` (76 行) | `DesignNotesDialog.vue` | 设计备注弹窗（teleport 经 `DOMWrapper(document.body)` 查询） |
| `DesignerAcrfAnnotation.spec.js` (131 行) | `DesignerAcrfAnnotation.vue` | aCRF 注解标记（8 例） |
| `DesignerWordPreview.spec.js` (446 行) | `DesignerWordPreview.vue` | 设计器 word-page 预览（18 例，含 `暂无字段` 与 `以下为log行`） |
| `SessionTimer.spec.js` (75 行) | `SessionTimer.vue` | 会话倒计时 |
| `WordImportDialog.spec.js` (608 行) | `WordImportDialog.vue` | 导入 Word 向导（24 例） |
| `elementPlusEnvironment.spec.js` (54 行) | 内联 smoke 组件 | el-table/el-select/el-tooltip 环境冒烟 |
| `vueWarnGate.spec.js` (26 行) | 内联组件 | 警告门禁自测 |
| `setup.js` / `vueWarnGate.js` | 非 spec | 共享 setup 与警告门禁 helper |

**确认：当前没有任何 component spec 挂载 VisitsTab，也没有任何 spec 读取其预览。** `grep -rn 'VisitsTab' tests/component/` 返回空。若为 `VisitFormPreviewDialog.vue` 新增挂载测试，可直接复用 `setup.js`（全局 Element Plus + 全量图标 + 警告门禁），并参考 `DesignerWordPreview.spec.js` 的 props/回调 spy 风格。

---

## Section 5 — 注意事项与风险

1. **`showFormPreview` 的所有权是设计决策点，不是纯搬迁。** `visitFlowWorkspace.test.js:140` 与 `acrfViewToggle.test.js:186`（projectId watcher 串）都要求 VisitsTab 仍持有 `showFormPreview` / `resetFormPreviewState`。若把开关完全移入弹窗（`v-model` 由父传 ref 或子组件 `expose(open)`），这两处必须重写；若保留 `showFormPreview` ref + `openFormPreview()` 作为父侧桥（推荐，改动面最小），只需把 `resetFormPreviewState` 的断言改为「弹窗 `@closed` 触发自身重置」。
2. **`compileFunction` 依赖函数的顶层可提取性。** `acrfViewToggle.test.js:28–64` 通过字符串索引 `function <name>(` 抽取函数体再 `new Function` 编译；`normalizeStoredViewMode` / `resolveInitialViewMode` / `getFieldOidAnnotationText` / `getFormDomainAnnotationText` 若下沉为 composable 内的**嵌套函数或箭头函数**，该抽取即失败。建议：在新组件（或 composable 模块）中保持这四个函数的顶层 `function name(...)` 形式，测试只需更换 source 变量。
3. **`listActionsIconify.test.js:97` 的负向 `/showPreview/` 是命名陷阱。** 它扫描整个 VisitsTab 源；只要新子组件的绑定写成 `v-model="showFormPreview"` 就安全，但若有人把本地 ref 命名成 `showPreview` 就会翻红。同理 `visitFlowWorkspace.test.js:94`。
4. **`previewCellRender.test.js` 的注释指针会过期但不会失败**（L85/100/189/198/210/233/240/247/255 均标注“VisitsTab :行号”）。它的 `vtBound`（342–349）逐字复刻 VisitsTab 适配器；只要新 composable 保留 `toRendererField(ff.field_definition)`、`getCellValue: getScopedDefaultValue(ff, false)`、`getInlineValue: getScopedDefaultValue(ff)`、`renderFallback: renderCtrlTextHtml`、`resolveHostGroups`/`getPaperOrientation` 读预览组与纸张方向，等价性测试继续成立。建议同批更新注释行号指向。
5. **`onBeforeUnmount` 整块只有 `annotationDrag.dispose()` 一处用途**（214–216）。`useAcrfAnnotationDrag` 的 `dispose()` 会 `flushPending()`（composable L186–188）——把实例搬进弹窗后，卸载语义（`@closed` 之后弹窗 DOM 仍在，Vue 卸载时 `dispose` 触发 flush）可能变化，需要一条新断言：弹窗销毁时 pending 位置被 flush 而非丢弃。
6. **`mergeFormIntoState` 的删除会连带改变 `allForms` 合并行为**（461–490）。它的非预览副作用（更新 `allForms` / `visitForms` / `matrixData.forms` 三处集合）目前**没有独立测试**，仅被 acrfViewToggle:405 的正则间接锁定。删除后请评估：预览拖动保存成功后是否仍需刷新这三个集合（项目切换/刷新缓存链路 526–534 的 `invalidateCache` + `void load()` 建议保留并补测）。
7. **`rowHeightResize.test.js` 的 `previewComponents` 循环（184–216）会抛 ENOENT**：如果先把数组指向 `VisitFormPreviewDialog.vue` 而文件尚未创建，测试直接报错而非断言失败。RED 阶段建议追加而非替换（先加新路径、确认失败在断言而非读取）。
8. **`formDesignerPreviewModel.test.js:262` 测试名含 “visits tab form preview”**，拆分后应改名并把 263–280 的全部断言重指向新文件（该测试是唯一锁定「预览模板不再逐格重建 segments」的守卫，务必搬迁而非删除）。
9. **`columnWidthPlanning.test.js:1098–1102` 的接线守卫断言 `readColumnWidthRatios(` 与三种 `buildTableInstanceId('<kind>', …)` 调用形状**。这三处调用（444/454/590）都在预览助手内；若它们被移入 composable，断言应对 composable 源或仍渲染这些调用的组件源执行——不要只断言 import。
10. **`acrfViewToggle.test.js:357–381` 的循环把 VisitsTab 与 DesignerAcrfAnnotation 并列断言**（重置按钮禁用态样式）。拆分后 VisitsTab 侧的 `wp-acrf-annotation-reset` 规则应随 `<style scoped>` 迁至新组件——保留该循环并替换路径即可，切勿删除（它是禁用态可见性的唯一守卫）。
11. **`wordPageGeometry.test.js:165–169` 的 `'word-page', 'word-page--a4'` 相邻性断言**要求新组件模板保持同样的 class 数组写法；同时 main.css 侧的 `.word-page--a4` 契约（150–159）不动。
12. **有先例可循**：`designer-split`（2026-10-11）为本项目建立了同型拆分范式——新增源级家长/子级接线守卫（`tests/designerPreviewSplit.test.js`，10 例）+ 组件挂载测试（`DesignerWordPreview.spec.js` 18 例 / `DesignerAcrfAnnotation.spec.js` 8 例），并把 6 个既有读源测试重指向。本次建议对称新增 `tests/visitPreviewSplit.test.js`，并同步 `.claude/CLAUDE.md`（“`FormDesignerTab.vue` 和 `VisitsTab.vue` 共享 `crf_view_mode`”的描述）与 `.trellis/spec/frontend/component-guidelines.md` 的 `Stateless Word-Preview Extraction` 场景（该场景当前的“两次渲染”约定对本拆分不适用，需要新的子场景条目）。
13. **无任何测试 import `VisitsTab.vue` 作为模块**（已 grep 确认），也**没有测试按行数/整文件长度计数**（无 `split('\n')` 类断言）。全部影响面都来自 `readFileSync` 源码正则，因此重指向是机械且低风险的。
