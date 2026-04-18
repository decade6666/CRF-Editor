import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const codelistsSource = readFileSync(path.resolve(currentDir, '../src/components/CodelistsTab.vue'), 'utf8')
const visitsSource = readFileSync(path.resolve(currentDir, '../src/components/VisitsTab.vue'), 'utf8')
const fieldsSource = readFileSync(path.resolve(currentDir, '../src/components/FieldsTab.vue'), 'utf8')
const formsSource = readFileSync(path.resolve(currentDir, '../src/components/FormDesignerTab.vue'), 'utf8')
const sortableSource = readFileSync(path.resolve(currentDir, '../src/composables/useSortableTable.js'), 'utf8')

test('CodelistsTab wires left list drag sorting through useSortableTable', () => {
  assert.match(codelistsSource, /const codelistsTableRef = ref\(null\)/)
  assert.match(codelistsSource, /const codelistsReorderUrl = computed\(\(\) => `\/api\/projects\/\$\{props\.projectId\}\/codelists\/reorder`\)/)
  assert.match(codelistsSource, /useSortableTable\(/)
  assert.match(codelistsSource, /ref="codelistsTableRef"/)
  assert.match(codelistsSource, /<el-table-column width="32" v-if="!isCodelistsFiltered">/)
})

test('CodelistsTab disables option drag when search filter is active', () => {
  assert.match(codelistsSource, /<draggable v-model="selected\.options" item-key="id" handle="\.drag-handle" :disabled="Boolean\(searchOpt\.trim\(\)\)"/)
})

test('VisitsTab wires visit form drag sorting through useOrderableList', () => {
  assert.match(visitsSource, /import draggable from 'vuedraggable'/)
  assert.match(visitsSource, /const visitFormReorderUrl = computed\(\(\) => selectedVisit\.value \? `\/api\/visits\/\$\{selectedVisit\.value\.id\}\/forms\/reorder` : ''\)/)
  assert.match(visitsSource, /const \{ dragging: draggingVisitForms, handleDragEnd: handleVisitFormDragEnd \} = useOrderableList\(visitFormReorderUrl\)/)
  assert.match(visitsSource, /<draggable v-else v-model="visitForms" item-key="id" handle="\.drag-handle" @start="draggingVisitForms = true" @end="onVisitFormDragEnd">/)
})

// ===== Task 2.3: FieldsTab 排序一致性 =====

test('FieldsTab wires drag sorting through useSortableTable with isFiltered option', () => {
  // 使用 useSortableTable 并传入 isFiltered
  assert.match(fieldsSource, /const isFiltered = computed\(\(\) => searchField\.value\.trim\(\)\.length > 0\)/)
  assert.match(fieldsSource, /const reorderUrl = computed\(\(\) => `\/api\/projects\/\$\{props\.projectId\}\/field-definitions\/reorder`\)/)
  assert.match(fieldsSource, /useSortableTable\(fieldsTableRef, fields, reorderUrl/)
  assert.match(fieldsSource, /isFiltered/)
})

test('FieldsTab drag handle is hidden when filtered', () => {
  // 拖拽手柄列在过滤态下隐藏
  assert.match(fieldsSource, /<el-table-column width="32" v-if="!isFiltered">/)
})

test('FieldsTab keeps field list sorted by order_index after reload', () => {
  assert.match(fieldsSource, /const orderedFields = \[\.\.\.fields\.value\]\.sort\(/)
  assert.match(fieldsSource, /const orderA = a\?\.order_index \?\? Number\.MAX_SAFE_INTEGER/)
  assert.match(fieldsSource, /return \(a\?\.id \?\? 0\) - \(b\?\.id \?\? 0\)/)
  assert.match(fieldsSource, /<el-table ref="fieldsTableRef" :data="visibleFields" size="small" border height="100%" row-key="id"/)
})

test('FieldsTab manual order column renders read-only ordinal cell after R1', () => {
  // R1：el-input-number 被替换为 .ordinal-cell span，手动修改入口从 UI 移除
  assert.match(fieldsSource, /<span class="ordinal-cell">\{\{ row\.order_index \}\}<\/span>/)
  assert.doesNotMatch(fieldsSource, /<el-input-number[^>]*:model-value="row\.order_index"/)
})

test('FieldsTab has no imperative updateOrder handler after R1', () => {
  // R1：updateOrder handler 删除，排序只保留 drag-end 路径
  assert.doesNotMatch(fieldsSource, /async function updateOrder\(row, newValue\)/)
  assert.match(fieldsSource, /\/api\/projects\/\$\{props\.projectId\}\/field-definitions\/reorder/)
})

// ===== Task 2.3: FormDesignerTab 排序一致性 =====

test('FormDesignerTab wires form drag sorting through useSortableTable with isFiltered option', () => {
  // 使用 useSortableTable 并传入 isFormsFiltered（多变量可能合并在一行）
  assert.match(formsSource, /isFormsFiltered = computed\(\(\) => searchForm\.value\.trim\(\)\.length > 0\)/)
  assert.match(formsSource, /formsReorderUrl = computed\(\(\) => `\/api\/projects\/\$\{props\.projectId\}\/forms\/reorder`\)/)
  assert.match(formsSource, /useSortableTable\(formsTableRef, forms, formsReorderUrl/)
  assert.match(formsSource, /isFiltered: isFormsFiltered/)
})

test('FormDesignerTab drag handle is hidden only when filtered after R3 brief-mode unlock', () => {
  // R3：editMode 门禁移除，拖拽把手列仅依赖过滤态
  assert.match(formsSource, /<el-table-column width="32" v-if="!isFormsFiltered">/)
  assert.doesNotMatch(formsSource, /<el-table-column width="32" v-if="editMode && !isFormsFiltered">/)
})

test('FormDesignerTab keeps form list sorted by order_index after reload', () => {
  assert.match(formsSource, /const orderedForms = \[\.\.\.forms\.value\]\.sort\(/)
  assert.match(formsSource, /const selectedFormId = selectedForm\.value\?\.id \?\? null/)
  assert.match(formsSource, /selectedForm\.value = forms\.value\.find\(f => f\.id === selectedFormId\) \|\| null/)
  assert.match(formsSource, /<el-table ref="formsTableRef" :data="filteredForms" size="small" border highlight-current-row row-key="id"/)
})

test('FormDesignerTab form order column renders read-only ordinal cell after R1', () => {
  // R1：el-input-number 被替换为 .ordinal-cell span，无 :disabled 条件
  assert.match(formsSource, /<span class="ordinal-cell">\{\{ row\.order_index \}\}<\/span>/)
  assert.doesNotMatch(formsSource, /<el-input-number[^>]*:model-value="row\.order_index"/)
})

test('FormDesignerTab has no imperative updateFormOrder handler after R1', () => {
  // R1：updateFormOrder handler 删除，排序只保留 drag-end 路径
  assert.doesNotMatch(formsSource, /async function updateFormOrder\(row, newValue\)/)
  assert.match(formsSource, /\/api\/projects\/\$\{props\.projectId\}\/forms\/reorder/)
})

test('FormDesignerTab field reorder invalidates cached form fields in each reorder path', () => {
  // R1 删除了 updateFormFieldOrder 手动路径；仅剩 onDrop + keyboard move 两条路径
  assert.match(formsSource, /async function onDrop\([\s\S]*?api\.post\(`\/api\/forms\/\$\{selectedForm\.value\.id\}\/fields\/reorder`, \{ ordered_ids: normalized\.map\(f => f\.id\) \}\)[\s\S]*?api\.invalidateCache\(`\/api\/forms\/\$\{selectedForm\.value\.id\}\/fields`\)[\s\S]*?await loadFormFields\(\)/)
  assert.match(formsSource, /const move = async \(from, to\) => \{[\s\S]*?api\.post\(`\/api\/forms\/\$\{selectedForm\.value\.id\}\/fields\/reorder`, \{ ordered_ids: normalized\.map\(f => f\.id\) \}\)[\s\S]*?api\.invalidateCache\(`\/api\/forms\/\$\{selectedForm\.value\.id\}\/fields`\)[\s\S]*?await loadFormFields\(\)/)
  assert.doesNotMatch(formsSource, /async function updateFormFieldOrder/)
})

test('FormDesignerTab keeps designer entry visible for selected form outside edit mode gate', () => {
  assert.match(formsSource, /<el-button v-if="selectedForm" size="small" type="primary" @click="showDesigner = true">设计表单<\/el-button>/)
  assert.doesNotMatch(formsSource, /<el-button v-if="editMode && selectedForm" size="small" type="primary" @click="showDesigner = true">设计表单<\/el-button>/)
  // R3：新建表单按钮不再被 editMode 门禁包裹
  assert.match(formsSource, /<el-button type="primary" size="small" @click="openAddForm">新建表单<\/el-button>/)
  assert.doesNotMatch(formsSource, /<el-button v-if="editMode" type="primary" size="small" @click="openAddForm">新建表单<\/el-button>/)
})

test('FormDesignerTab unlocks all editing surfaces after R3 brief-mode unlock', () => {
  // R3：以下门禁全部移除，简要模式也可用
  assert.doesNotMatch(formsSource, /<el-button v-if="editMode" type="danger" size="small" :disabled="!selForms\.length" @click="batchDelForms"/)
  assert.match(formsSource, /<el-button type="danger" size="small" :disabled="!selForms\.length" @click="batchDelForms">批量删除/)
  assert.doesNotMatch(formsSource, /<el-table-column width="32" v-if="editMode && !isFormsFiltered">/)
  assert.doesNotMatch(formsSource, /<el-table-column type="selection" width="40" v-if="editMode" \/>/)
  assert.doesNotMatch(formsSource, /<el-table-column v-if="editMode" label="操作" width="150" fixed="right">/)
  assert.doesNotMatch(formsSource, /designer-shell--readonly/)
  assert.doesNotMatch(formsSource, /<div v-if="editMode" class="fd-library designer-library-pane"/)
  assert.match(formsSource, /<div class="fd-library designer-library-pane"/)
  assert.doesNotMatch(formsSource, /<div v-if="editMode" class="fd-panel-resizer"/)
  assert.match(formsSource, /<div class="fd-panel-resizer" @mousedown="startLibResize"><\/div>/)
  assert.doesNotMatch(formsSource, /:draggable="editMode"/)
  assert.match(formsSource, /:draggable="true"/)
  assert.doesNotMatch(formsSource, /<el-checkbox v-if="editMode" v-model="selectedIds"/)
  assert.doesNotMatch(formsSource, /<el-tooltip v-if="editMode && canToggleInline\(ff\)"/)
  assert.match(formsSource, /<el-tooltip v-if="canToggleInline\(ff\)"/)
  assert.doesNotMatch(formsSource, /<el-button v-if="editMode" type="danger" size="small" link @click\.stop="removeField\(ff\)"/)
  assert.match(formsSource, /<el-button type="danger" size="small" link @click\.stop="removeField\(ff\)">删除<\/el-button>/)
  assert.doesNotMatch(formsSource, /<div v-else-if="!editMode" class="designer-empty-state">简要模式下仅支持预览/)
  assert.doesNotMatch(formsSource, /<div v-if="!editMode" class="designer-notes-readonly">/)
  // 脚本端：所有函数首行的 !editMode.value 守卫清零
  assert.doesNotMatch(formsSource, /if \(!editMode\.value\) return/)
  assert.doesNotMatch(formsSource, /if \(!editMode\.value \|\|/)
})

test('FormDesignerTab designer dialog uses center-bottom preview and right-side notes layout', () => {
  assert.match(formsSource, /const designerVisibleFields = computed\(\(\) => \{/)
  assert.match(formsSource, /_displayOrder: index \+ 1/)
  assert.match(formsSource, /v-for="\(ff, idx\) in designerVisibleFields"/)
  // R1：_displayOrder 由 ordinal-cell span 展示
  assert.match(formsSource, /<span class="ordinal-cell"[\s\S]*>\{\{ ff\._displayOrder \}\}<\/span>/)
  assert.match(formsSource, /<el-dialog v-model="showDesigner" :title="'设计：' \+ \(selectedForm\?\.name \|\| ''\)" fullscreen class="designer-dialog">/)
  assert.match(formsSource, /class="designer-shell"/)
  assert.match(formsSource, /class="designer-workspace"/)
  assert.match(formsSource, /class="designer-workspace-top"/)
  assert.match(formsSource, /class="designer-workspace-bottom"/)
  assert.match(formsSource, /class="designer-preview-pane"/)
  assert.match(formsSource, /class="designer-side-pane"/)
  assert.match(formsSource, /class="designer-editor-card"/)
  assert.match(formsSource, /class="designer-notes-card"/)
  assert.match(formsSource, /class="designer-side-pane" :style="\{ width: propWidth \+ 'px' \}"/)
  assert.match(formsSource, /class="designer-workspace"[\s\S]*class="designer-workspace-top"[\s\S]*class="designer-workspace-bottom"[\s\S]*class="designer-preview-pane"/)
  assert.match(formsSource, /class="designer-side-pane"[\s\S]*class="designer-editor-card"[\s\S]*class="designer-notes-card"/)
  assert.doesNotMatch(formsSource, /class="designer-side-pane"[\s\S]*class="designer-preview-pane"/)
  assert.doesNotMatch(formsSource, /designer-editor-stack/)
  assert.match(formsSource, /const designerHasPreviewNotes = computed\(\(\) => false\)/)
  assert.match(formsSource, /const previewPaneWidth = 460/)
  assert.match(formsSource, /<style>[\s\S]*\.designer-dialog \.el-dialog__body \{[\s\S]*height: calc\(100vh - 54px\);[\s\S]*overflow: hidden;[\s\S]*<\/style>/)
  assert.doesNotMatch(formsSource, /\.designer-dialog :deep\(\.el-dialog__body\)/)
  assert.match(formsSource, /grid-template-columns: auto 4px minmax\(320px, 1fr\) 460px;/)
  assert.match(formsSource, /\.designer-shell \{[\s\S]*grid-template-rows: minmax\(0, 1fr\);[\s\S]*overflow: hidden;/)
  assert.match(formsSource, /\.designer-library-pane \{[\s\S]*min-height: 0;[\s\S]*height: 100%;[\s\S]*overflow: hidden;/)
  assert.match(formsSource, /\.fd-library \{[\s\S]*height: 100%;[\s\S]*min-height: 0;[\s\S]*overflow: hidden;/)
  assert.match(formsSource, /\.fd-library-list \{[\s\S]*min-height: 0;[\s\S]*overflow-y: auto;/)
  assert.match(formsSource, /\.designer-workspace \{[\s\S]*grid-template-rows: minmax\(0, 2fr\) minmax\(260px, 1fr\);/)
  assert.match(formsSource, /\.designer-workspace-bottom \{[\s\S]*display: flex;[\s\S]*overflow: hidden;/)
  assert.match(formsSource, /\.designer-side-pane \{[\s\S]*grid-template-rows: minmax\(0, 1fr\) minmax\(180px, 1fr\);/)
  assert.match(formsSource, /style="width:56px;margin-left:2px"/)
  assert.match(formsSource, /\.ff-item \{ display: flex; align-items: center; gap: 6px; padding: 4px 6px; border: 1px solid var\(--color-border\); margin-bottom: 2px; background: var\(--color-bg-card\); cursor: pointer; \}/)
  assert.doesNotMatch(formsSource, /@mousedown="startPropResize"/)
  assert.doesNotMatch(formsSource, /function startPropResize\(/)
})

// ===== useSortableTable 契约验证 =====

test('useSortableTable disables Sortable when isFiltered is true', () => {
  // Sortable 初始化时禁用态基于 isFiltered
  assert.match(sortableSource, /disabled: unref\(isFiltered\) || false/)
})

test('useSortableTable watches isFiltered to toggle disabled state', () => {
  // 监听 isFiltered 变化动态切换禁用态
  assert.match(sortableSource, /watch\(\(\) => unref\(isFiltered\)/)
  assert.match(sortableSource, /instance\.option\('disabled', disabled\)/)
})

test('useSortableTable onEnd posts to reorder API', () => {
  // 拖拽结束提交 reorder
  assert.match(sortableSource, /await api\.post\(unref\(reorderUrl\)/)
})

test('useSortableTable recalculates order_index after drag', () => {
  // 拖拽后重算连续序号 - 注意实际代码格式
  assert.match(sortableSource, /arr\.forEach\(\(it, i\) => \{ it\.order_index = i \+ 1 \}\)/)
})

test('useSortableTable reloads after reorder to align with backend truth', () => {
  // reorder 后 reload 对齐后端真值
  assert.match(sortableSource, /if \(reloadFn\) await reloadFn/)
})
