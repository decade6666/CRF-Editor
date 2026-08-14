import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const src = (p) => readFileSync(path.resolve(currentDir, `../src/${p}`), 'utf8')

const appSource = src('App.vue')
const designerSource = src('components/FormDesignerTab.vue')
const codelistsSource = src('components/CodelistsTab.vue')
const unitsSource = src('components/UnitsTab.vue')
const fieldsSource = src('components/FieldsTab.vue')
const mainCss = src('styles/main.css')

test('App.vue header no longer contains the template import button', () => {
  const headerSection = appSource.match(/<div class="header-right">([\s\S]*?)<\/div>/)?.[1] || ''
  assert.doesNotMatch(headerSection, /导入模板/)
})

test('App.vue wires FormDesignerTab import-template to openImportDialog', () => {
  assert.match(appSource, /<FormDesignerTab[\s\S]*?@import-template="openImportDialog"/)
})

test('FormDesignerTab declares the import-template emit', () => {
  assert.match(designerSource, /defineEmits\(\[['"]import-template['"]\]\)/)
})

test('form list toolbar keeps exact order: new -> search -> import template -> batch delete', () => {
  const listScope = designerSource.match(/<div class="fd-formlist">([\s\S]*?)<\/div>/)?.[1] || ''
  const plus = listScope.indexOf('aria-label="新建表单"')
  const search = listScope.indexOf('搜索表单')
  const importBtn = listScope.indexOf('导入模板')
  const batchDel = listScope.indexOf('aria-label="批量删除表单"')
  assert.ok(plus >= 0 && search > plus && importBtn > search && batchDel > importBtn, listScope.slice(0, 400))
  assert.match(listScope, /type="warning"[\s\S]*?@click="emit\('import-template'\)"/)
})

test('four list pages consume the shared .list-toolbar class', () => {
  assert.match(codelistsSource, /class="list-toolbar"/)
  assert.equal(codelistsSource.match(/class="list-toolbar"/g).length, 2)
  assert.match(unitsSource, /class="list-toolbar"/)
  assert.match(fieldsSource, /class="list-toolbar"/)
  assert.match(designerSource, /class="list-toolbar"/)
})

test('FieldsTab right pane header consumes the shared .pane-tool-slot class', () => {
  assert.match(fieldsSource, /class="pane-tool-slot"/)
})

test('main.css defines the shared toolbar slot contract', () => {
  const block = mainCss.match(/\.list-toolbar,\s*\n\s*\.pane-tool-slot\s*\{([\s\S]*?)\}/)?.[1] || ''
  assert.match(block, /min-height:\s*24px/)
  assert.match(block, /margin-bottom:\s*12px/)
  assert.match(block, /display:\s*flex/)
  assert.match(block, /align-items:\s*center/)
  assert.match(block, /gap:\s*8px/)
  assert.match(block, /flex-shrink:\s*0/)
})

test('FormDesigner canvas header becomes the shared 36px slot with a small switch', () => {
  const headerBlock = designerSource.match(/\.fd-canvas-header\s*\{([\s\S]*?)\}/)?.[1] || ''
  assert.match(headerBlock, /min-height:\s*24px/)
  assert.match(headerBlock, /padding:\s*0 12px/)
  assert.match(headerBlock, /margin-bottom:\s*12px/)
  // 主画布 switch（:3368 区域）必须 small，防止默认 32px 控件重新撑高
  const canvasSwitch = designerSource.match(/<div class="fd-canvas-header">([\s\S]*?)<\/div>\s*<div class="word-preview">/)?.[1] || ''
  assert.match(canvasSwitch, /<el-switch[\s\S]*?size="small"/)
})

test('no negative margins introduced across the five pages and shared css', () => {
  for (const source of [codelistsSource, unitsSource, fieldsSource, designerSource, mainCss]) {
    assert.doesNotMatch(source, /margin(-top|-bottom|-inline|-block)?:\s*-/)
  }
})

test('VisitsTab consumes the shared toolbar contract (visit-flow subtask)', () => {
  const visitsSource = src('components/VisitsTab.vue')
  assert.match(visitsSource, /class="list-toolbar"/)
  assert.match(visitsSource, /class="pane-tool-slot"/)
})
