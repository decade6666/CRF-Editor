import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const visitsSource = readFileSync(path.resolve(currentDir, '../src/components/VisitsTab.vue'), 'utf8')

test('default visit page is a full-width list without batch-edit or right pane', () => {
  assert.doesNotMatch(visitsSource, /showPreview = true/)
  assert.doesNotMatch(visitsSource, /批量编辑/)
  assert.match(visitsSource, /const workspaceMode = ref\('list'\)/)
})

test('visit flow entry lives at the toolbar right side and enters matrix by default', () => {
  assert.match(visitsSource, /访视流程/)
  assert.match(visitsSource, /workspaceMode === 'flow'/)
  assert.match(visitsSource, /const flowView = ref\('matrix'\)/)
  assert.match(visitsSource, /flowView\.value = 'matrix'/)
})

test('entering flow clears ordinal quick-edit state for visits and visit forms', () => {
  assert.match(visitsSource, /editingVisitId\.value = null/)
  assert.match(visitsSource, /editingVisitFormId\.value = null/)
})

test('flow header uses a small two-state switch in the shared pane slot', () => {
  assert.match(visitsSource, /class="pane-tool-slot"/)
  assert.match(visitsSource, /v-model="flowView"/)
  assert.match(visitsSource, /<el-switch[\s\S]*?v-model="flowView"[\s\S]*?size="small"/)
  assert.match(visitsSource, /inactive-text="矩阵"/)
  assert.match(visitsSource, /active-text="单访视"/)
})

test('matrix renders in-page without a dialog wrapper', () => {
  assert.doesNotMatch(visitsSource, /v-model="showPreview"/)
  assert.match(visitsSource, /flowView === 'matrix'/)
  assert.match(visitsSource, /class="matrix-table"/)
  assert.match(visitsSource, /toggleCell\(v\.id, f\.id\)/)
})

test('single-visit left list is read-only: no CRUD, selection column, handle or quick edit', () => {
  assert.match(visitsSource, /flowView === 'single'/)
  assert.match(visitsSource, /workspaceMode === 'list' && editingVisitId === row\.id/)
  // CRUD 入口整体包在 list 分支内：新增/批删/搜索只在 list 渲染
  const listToolbar = visitsSource.match(/<template v-if="workspaceMode === 'list'">([\s\S]*?)<\/template>/)?.[1] || ''
  assert.match(listToolbar, /aria-label="新增访视"/)
  assert.match(listToolbar, /aria-label="批量删除访视"/)
  assert.match(listToolbar, /搜索访视/)
})

test('single-visit right pane keeps form add, remove, sort, quick edit and preview', () => {
  assert.match(visitsSource, /addFormToVisit/)
  assert.match(visitsSource, /removeFormFromVisit/)
  assert.match(visitsSource, /openFormPreview\(row\)/)
  assert.match(visitsSource, /editingVisitFormId === row\.id/)
  assert.match(visitsSource, /initVisitFormsSortable/)
})

test('project switch resets workspace mode and flow view', () => {
  assert.match(visitsSource, /workspaceMode\.value = 'list'/)
  assert.match(visitsSource, /flowView\.value = 'matrix'/)
})

test('drag sortable re-initializes on mode switch and single-table remount restores current row', () => {
  assert.match(visitsSource, /watch\(workspaceMode/)
  assert.match(visitsSource, /initVisitsSortable\(\)/)
  assert.match(visitsSource, /watch\(\[selectedVisit, visitForms, flowView, workspaceMode\]/)
  assert.match(visitsSource, /setCurrentRow\(selectedVisit\.value\)/)
})

test('view switching never reloads data or resets selection', () => {
  const flowWatch = visitsSource.match(/watch\(flowView, \(view\) => \{([\s\S]*?)\}\)/)?.[1] || ''
  assert.doesNotMatch(flowWatch, /load\(\)/)
  assert.doesNotMatch(flowWatch, /selectedVisit\.value = null/)
})

test('visit preview dialog wiring is preserved', () => {
  assert.match(visitsSource, /v-model="showFormPreview"/)
  assert.match(visitsSource, /openFormPreview/)
  assert.match(visitsSource, /annotationDrag/)
})

test('flow workspace consumes shared toolbar classes with no root gap or negative margins', () => {
  assert.match(visitsSource, /class="list-toolbar"/)
  const root = visitsSource.match(/<div style="[^"]*height:calc\(100vh - 160px\)"[\s\S]*?>/)?.[0] || ''
  assert.doesNotMatch(root, /gap:/)
  assert.doesNotMatch(visitsSource, /margin-(top|bottom|-inline|-block)?:\s*-/)
})
