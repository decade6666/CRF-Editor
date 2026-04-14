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

test('FieldsTab manual order input is disabled when filtered', () => {
  // 手动序号输入在过滤态下禁用 - 匹配属性片段即可
  assert.match(fieldsSource, /:disabled="isFiltered"/)
})

test('FieldsTab updateOrder uses reorder API', () => {
  // 手动改序号走 reorder API
  assert.match(fieldsSource, /async function updateOrder\(row, newValue\)/)
  assert.match(fieldsSource, /api\.post\(`\/api\/projects\/\$\{props\.projectId\}\/field-definitions\/reorder`/)
})

// ===== Task 2.3: FormDesignerTab 排序一致性 =====

test('FormDesignerTab wires form drag sorting through useSortableTable with isFiltered option', () => {
  // 使用 useSortableTable 并传入 isFormsFiltered（多变量可能合并在一行）
  assert.match(formsSource, /isFormsFiltered = computed\(\(\) => searchForm\.value\.trim\(\)\.length > 0\)/)
  assert.match(formsSource, /formsReorderUrl = computed\(\(\) => `\/api\/projects\/\$\{props\.projectId\}\/forms\/reorder`\)/)
  assert.match(formsSource, /useSortableTable\(formsTableRef, forms, formsReorderUrl/)
  assert.match(formsSource, /isFiltered: isFormsFiltered/)
})

test('FormDesignerTab drag handle is hidden when filtered', () => {
  // 拖拽手柄列在过滤态下隐藏
  assert.match(formsSource, /<el-table-column width="32" v-if="!isFormsFiltered">/)
})

test('FormDesignerTab keeps form list sorted by order_index after reload', () => {
  assert.match(formsSource, /const orderedForms = \[\.\.\.forms\.value\]\.sort\(/)
  assert.match(formsSource, /const selectedFormId = selectedForm\.value\?\.id \?\? null/)
  assert.match(formsSource, /selectedForm\.value = forms\.value\.find\(f => f\.id === selectedFormId\) \|\| null/)
  assert.match(formsSource, /<el-table ref="formsTableRef" :data="filteredForms" size="small" border highlight-current-row row-key="id"/)
})

test('FormDesignerTab manual order input is disabled when filtered', () => {
  // 手动序号输入在过滤态下禁用 - 匹配属性片段即可
  assert.match(formsSource, /:disabled="isFormsFiltered"/)
})

test('FormDesignerTab updateFormOrder uses reorder API', () => {
  // 手动改序号走 reorder API
  assert.match(formsSource, /async function updateFormOrder\(row, newValue\)/)
  assert.match(formsSource, /api\.post\(`\/api\/projects\/\$\{props\.projectId\}\/forms\/reorder`/)
})

test('FormDesignerTab field reorder invalidates cached form fields in each reorder path', () => {
  assert.match(formsSource, /async function onDrop\([\s\S]*?api\.post\(`\/api\/forms\/\$\{selectedForm\.value\.id\}\/fields\/reorder`, \{ ordered_ids: normalized\.map\(f => f\.id\) \}\)[\s\S]*?api\.invalidateCache\(`\/api\/forms\/\$\{selectedForm\.value\.id\}\/fields`\)[\s\S]*?await loadFormFields\(\)/)
  assert.match(formsSource, /async function updateFormFieldOrder\([\s\S]*?api\.post\(`\/api\/forms\/\$\{selectedForm\.value\.id\}\/fields\/reorder`, \{ ordered_ids: normalized\.map\(f => f\.id\) \}\)[\s\S]*?api\.invalidateCache\(`\/api\/forms\/\$\{selectedForm\.value\.id\}\/fields`\)[\s\S]*?await loadFormFields\(\)/)
  assert.match(formsSource, /const move = async \(from, to\) => \{[\s\S]*?api\.post\(`\/api\/forms\/\$\{selectedForm\.value\.id\}\/fields\/reorder`, \{ ordered_ids: normalized\.map\(f => f\.id\) \}\)[\s\S]*?api\.invalidateCache\(`\/api\/forms\/\$\{selectedForm\.value\.id\}\/fields`\)[\s\S]*?await loadFormFields\(\)/)
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
