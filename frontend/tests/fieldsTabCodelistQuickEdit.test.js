import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.resolve(currentDir, '../src/components/FieldsTab.vue'), 'utf8')

/**
 * 字段库内联编辑引用字典：在 FieldsTab 的选项行补齐「新增字典 / 编辑字典」入口，
 * 与表单设计器对齐，但为字段库内独立实现（不依赖 FormDesignerTab）。
 */

test('FieldsTab imports the add/edit icons for inline codelist editing', () => {
  assert.match(source, /import \{ Plus, EditPen \} from ['"]@element-plus\/icons-vue['"]/)
})

test('choice option row exposes add and edit codelist buttons with correct wiring', () => {
  // 新增字典：始终可用
  assert.match(source, /:icon="Plus"[\s\S]*?@click="openQuickAddCodelist"/)
  // 编辑字典：未选字典时禁用
  assert.match(source, /:icon="EditPen"[\s\S]*?:disabled="!editProp\.codelist_id"[\s\S]*?@click="openQuickEditCodelist"/)
})

test('quick add codelist posts to the create endpoint and selects the new codelist', () => {
  assert.match(source, /async function quickAddCodelist\(\)/)
  assert.match(source, /api\.post\(`\/api\/projects\/\$\{props\.projectId\}\/codelists`/)
  assert.match(source, /editProp\.codelist_id = created\.id/)
})

test('quick edit codelist warns on references then saves via snapshot endpoint', () => {
  assert.match(source, /async function quickSaveCodelist\(\)/)
  assert.match(source, /\/codelists\/\$\{quickEditCodelistId\.value\}\/references/)
  assert.match(source, /修改将影响以下字段/)
  assert.match(source, /api\.put\(`\/api\/projects\/\$\{props\.projectId\}\/codelists\/\$\{quickEditCodelistId\.value\}\/snapshot`/)
})

test('codelist writes invalidate caches and bump the global refreshKey', () => {
  assert.match(source, /async function reloadAfterCodelistChange\(\)/)
  assert.match(source, /api\.invalidateCache\(`\/api\/projects\/\$\{props\.projectId\}\/codelists`\)/)
  assert.match(source, /api\.invalidateCache\(`\/api\/projects\/\$\{props\.projectId\}\/field-definitions`\)/)
  assert.match(source, /refreshKey\.value\+\+/)
})

test('quick edit failure refreshes to latest codelist data and reports the error', () => {
  assert.match(source, /已刷新为最新字典数据/)
})

test('add and edit dialogs render trailing-underscore toggle wired to toggleTrailingLine', () => {
  assert.match(source, /v-model="showQuickAddCodelist"/)
  assert.match(source, /v-model="showQuickEditCodelist"/)
  assert.match(source, /function toggleTrailingLine\(row\)/)
  const toggleMatches = source.match(/@change="\(\) => toggleTrailingLine\(row\)"/g) || []
  assert.equal(toggleMatches.length, 2)
})
