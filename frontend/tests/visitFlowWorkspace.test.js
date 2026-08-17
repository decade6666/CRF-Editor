import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const visitsSource = readFileSync(path.resolve(currentDir, '../src/components/VisitsTab.vue'), 'utf8')
const appSource = readFileSync(path.resolve(currentDir, '../src/App.vue'), 'utf8')

test('default visit page is a full-width list without batch-edit or right pane', () => {
  assert.doesNotMatch(visitsSource, /showPreview = true/)
  assert.doesNotMatch(visitsSource, /批量编辑/)
  assert.match(visitsSource, /const workspaceMode = ref\(props\.workspace\)/)
  assert.match(visitsSource, /workspace: \{ type: String, default: 'list' \}/)
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
