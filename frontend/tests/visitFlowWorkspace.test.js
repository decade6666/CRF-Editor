import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const visitsSource = readFileSync(path.resolve(currentDir, '../src/components/VisitsTab.vue'), 'utf8')
const appSource = readFileSync(path.resolve(currentDir, '../src/App.vue'), 'utf8')

test('default visit page is a two-pane list workspace without batch-edit', () => {
  assert.doesNotMatch(visitsSource, /showPreview = true/)
  assert.doesNotMatch(visitsSource, /批量编辑/)
  assert.match(visitsSource, /const workspaceMode = ref\(props\.workspace\)/)
  assert.match(visitsSource, /workspace: \{ type: String, default: 'list' \}/)

  const listBranch = visitsSource.match(/<template v-if="workspaceMode === 'list'">([\s\S]*?)<\/template>\s*<template v-else>/)?.[1] || ''
  assert.match(listBranch, /width:320px;display:flex;flex-direction:column;flex-shrink:0/)
  assert.match(listBranch, /@row-click="onVisitRowClick"/)
  assert.match(listBranch, /@current-change="selectListVisit"/)
})

test('list property card replaces visit dialogs and sends only editable visit fields', () => {
  const listBranch = visitsSource.match(/<template v-if="workspaceMode === 'list'">([\s\S]*?)<\/template>\s*<template v-else>/)?.[1] || ''
  const saveBody = visitsSource.match(/async function saveVisit\(\) \{([\s\S]*?)\n\}/)?.[1] || ''

  assert.match(visitsSource, /const isCreatingVisit = ref\(false\)/)
  assert.match(visitsSource, /const visitEditProp = reactive\(\{ name: '', code: '' \}\)/)
  assert.match(visitsSource, /function selectListVisit\(visit\)/)
  assert.match(visitsSource, /function openAdd\(\) \{\s*resetVisitEditor\(\{ code: genCode\('VISIT'\) \}\)/)
  assert.match(listBranch, /v-model="visitEditProp\.code"/)
  assert.match(listBranch, /v-model="visitEditProp\.name"/)
  assert.doesNotMatch(listBranch, /<el-form-item[^>]*label="序号"/)
  assert.doesNotMatch(visitsSource, /<el-dialog v-model="showAdd"|<el-dialog v-model="showEdit"/)
  assert.doesNotMatch(visitsSource, /const showAdd = ref\(|const showEdit = ref\(|const editForm = reactive\(/)
  assert.match(saveBody, /await api\.post\(`\/api\/projects\/\$\{props\.projectId\}\/visits`, \{ name: visitEditProp\.name, code: visitEditProp\.code \}\)/)
  assert.match(saveBody, /const visitId = selectedVisit\.value\?\.id/)
  assert.match(saveBody, /await api\.put\(`\/api\/projects\/\$\{props\.projectId\}\/visits\/\$\{visitId\}`, \{ name: visitEditProp\.name, code: visitEditProp\.code \}\)/)
  assert.match(saveBody, /await reloadAndSelectVisit\(created\.id\)/)
  assert.match(saveBody, /await reloadAndSelectVisit\(visitId\)/)
  assert.doesNotMatch(saveBody, /sequence|\.\.\.visitEditProp/)
  assert.match(visitsSource, /if \(selectedVisit\.value\?\.id === v\.id\) \{\s*suppressVisitRowSelect = true[\s\S]*clearVisitSelection\(\)/)
  assert.match(visitsSource, /if \(selectedVisit\.value && delIds\.has\(selectedVisit\.value\.id\)\) \{\s*suppressVisitRowSelect = true[\s\S]*clearVisitSelection\(\)/)
})

test('deleting the selected visit keeps the card empty instead of re-selecting another row', () => {
  // 删除选中访视后，el-table 重渲染会触发一次 current-change 自动落到其他行；
  // del / batchDelVisits 必须先置抑制标志再清空选择，避免属性卡被被动切换到其他访视。
  assert.match(visitsSource, /let suppressVisitRowSelect = false/)
  assert.match(visitsSource, /function selectListVisit\(visit\) \{\s*if \(suppressVisitRowSelect\) return/)
  assert.match(visitsSource, /if \(selectedVisit\.value\?\.id === v\.id\) \{\s*suppressVisitRowSelect = true[\s\S]*clearVisitSelection\(\)/)
  assert.match(visitsSource, /if \(selectedVisit\.value && delIds\.has\(selectedVisit\.value\.id\)\) \{\s*suppressVisitRowSelect = true[\s\S]*clearVisitSelection\(\)/)
  // 标志必须在 try/finally 中释放：reload 失败也不能永久吞掉后续行点击
  assert.match(visitsSource, /async function suppressNextVisitRowSelect\(\) \{\s*suppressVisitRowSelect = true\s*try \{[\s\S]*?await reloadVisits\(\)[\s\S]*?\} finally \{[\s\S]*?suppressVisitRowSelect = false[\s\S]*?\n\}/)
  // 用户主动行点击不受抑制窗口影响：onVisitRowClick 取消抑制并立即选中
  assert.match(visitsSource, /function onVisitRowClick\(visit\) \{\s*suppressVisitRowSelect = false\s*selectListVisit\(visit\)\s*\}/)
  // 表格 current row 与卡片选择同步：清除/选中都驱动 setCurrentRow
  assert.match(visitsSource, /function clearVisitSelection\(\) \{[\s\S]*?visitsTableRef\.value\?\.setCurrentRow\(null\)/)
  assert.match(visitsSource, /function selectListVisit\(visit\) \{[\s\S]*?visitsTableRef\.value\?\.setCurrentRow\(visit\)/)
})

test('visit flow becomes a top-level tab: no in-page entry button, prop-driven workspace', () => {
  // 页内入口按钮与 enterFlow 已删除；flow 工作区由 v-else 分支承载
  assert.doesNotMatch(visitsSource, /访视流程<\/el-button>/)
  assert.doesNotMatch(visitsSource, /function enterFlow/)
  assert.match(visitsSource, /<template v-else>\s*<!-- 访视流程工作区 -->/)
  assert.match(visitsSource, /const flowView = ref\('matrix'\)/)
  assert.match(visitsSource, /flowView\.value = 'matrix'/)
  // 顶级标签：访视流程 位于 访视 右侧，分别指定 workspace
  const tabs = appSource.match(/<el-tab-pane label="访视" name="visits">[\s\S]*?<\/el-tab-pane>/)?.[0] || ''
  const flowTabs = appSource.match(/<el-tab-pane label="访视流程" name="visitflow">[\s\S]*?<\/el-tab-pane>/)?.[0] || ''
  assert.ok(tabs && flowTabs, 'both visit tabs should exist')
  assert.match(tabs, /workspace="list"/)
  assert.match(flowTabs, /workspace="flow"/)
})

test('flow instance never renders the list toolbar: add/batch-delete/search are list-only', () => {
  const listBranch = visitsSource.match(/<template v-if="workspaceMode === 'list'">([\s\S]*?)<\/template>\s*<template v-else>/)?.[1] || ''
  assert.match(listBranch, /class="list-toolbar"/)
  assert.match(listBranch, /aria-label="新增访视"/)
  assert.match(listBranch, /aria-label="批量删除访视"/)
  assert.match(listBranch, /搜索访视/)
})

test('flow header uses a small two-state switch in the shared pane slot', () => {
  assert.match(visitsSource, /class="pane-tool-slot"/)
  assert.match(visitsSource, /v-model="flowView"/)
  assert.match(visitsSource, /<el-switch[\s\S]*?v-model="flowView"[\s\S]*?size="small"/)
  assert.match(visitsSource, /inactive-text="矩阵"/)
  assert.match(visitsSource, /active-text="列表"/)
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
  // CRUD 入口整体包在 list 分支内：新增/批删/搜索只在 list 渲染（flow 实例不渲染工具栏）
  const listBranch = visitsSource.match(/<template v-if="workspaceMode === 'list'">([\s\S]*?)<\/template>\s*<template v-else>/)?.[1] || ''
  assert.match(listBranch, /aria-label="新增访视"/)
  assert.match(listBranch, /aria-label="批量删除访视"/)
  assert.match(listBranch, /搜索访视/)
  const singleBranch = visitsSource.match(/<div v-if="flowView === 'single'"([\s\S]*?)<\/div>\s*<\/template>/)?.[1] || ''
  assert.match(singleBranch, /@current-change="selectFlowVisit"/)
  assert.doesNotMatch(singleBranch, /selectListVisit/)
})

test('single-visit right pane keeps form add, remove, sort, quick edit and preview', () => {
  assert.match(visitsSource, /addFormToVisit/)
  assert.match(visitsSource, /removeFormFromVisit/)
  assert.match(visitsSource, /openFormPreview\(row\)/)
  assert.match(visitsSource, /editingVisitFormId === row\.id/)
  assert.match(visitsSource, /initVisitFormsSortable/)
})

test('project switch resets workspace mode (prop-driven) and flow view', () => {
  assert.match(visitsSource, /workspaceMode\.value = props\.workspace/)
  assert.match(visitsSource, /flowView\.value = 'matrix'/)
})

test('sortable re-initialization and current-row restore stay wired', () => {
  assert.match(visitsSource, /initVisitsSortable\(\)/)
  assert.match(visitsSource, /watch\(\[selectedVisit, visitForms, flowView, workspaceMode\]/)
  assert.match(visitsSource, /setCurrentRow\(selectedVisit\.value\)/)
})

test('view switching never reloads data or resets selection', () => {
  const flowWatch = visitsSource.match(/watch\(flowView, \(view\) => \{([\s\S]*?)\}\)/)?.[1] || ''
  assert.ok(flowWatch, 'flowView watcher should exist')
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
  assert.ok(root, 'root flex container should exist')
  assert.doesNotMatch(root, /gap:/)
  assert.doesNotMatch(visitsSource, /margin-(top|bottom|-inline|-block)?:\s*-/)
})
