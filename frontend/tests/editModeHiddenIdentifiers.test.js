import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const readSource = (relativePath) => readFileSync(path.resolve(currentDir, relativePath), 'utf8')

const codelistsSource = readSource('../src/components/CodelistsTab.vue')
const unitsSource = readSource('../src/components/UnitsTab.vue')
const fieldsSource = readSource('../src/components/FieldsTab.vue')
const formDesignerSource = readSource('../src/components/FormDesignerTab.vue')
const visitsSource = readSource('../src/components/VisitsTab.vue')

function assertInOrder(source, patterns, message) {
  let cursor = 0
  for (const pattern of patterns) {
    const match = pattern.exec(source.slice(cursor))
    assert.ok(match, message || `missing ordered pattern: ${pattern}`)
    cursor += match.index + match[0].length
  }
}

test('codelist and option OID controls are visible only in complete edit mode', () => {
  assert.match(codelistsSource, /const editMode = inject\('editMode', ref\(false\)\)/)
  assertInOrder(codelistsSource, [
    /<el-table-column label="序号" width="100">/,
    /<el-table-column v-if="editMode" prop="code" label="OID"/,
    /<el-table-column prop="name" label="字典名称"/,
  ], 'dictionary OID column should sit immediately after ordinal column')
  assertInOrder(codelistsSource, [
    /<span class="option-order-header">序号<\/span>/,
    /<span v-if="editMode" class="option-code-header">OID<\/span>/,
    /<span class="option-label-header">标签<\/span>/,
  ], 'option OID column should sit immediately after ordinal column')
  assert.match(codelistsSource, /<span v-if="editMode"[^>]*>\{\{ element\.code \}\}<\/span>/)
  assert.match(codelistsSource, /<el-form-item v-if="editMode" label="OID">[\s\S]*v-model="clForm\.code"/)
  assert.match(codelistsSource, /<el-form-item v-if="editMode" label="OID">[\s\S]*v-model="optForm\.code"/)
  assert.match(codelistsSource, /<el-form-item v-if="editMode" label="OID">[\s\S]*v-model="editClForm\.code"/)
  assert.match(codelistsSource, /<el-form-item v-if="editMode" label="OID">[\s\S]*v-model="editOptForm\.code"/)
  assert.doesNotMatch(codelistsSource, /字典OID|选项OID/)
  assert.doesNotMatch(codelistsSource, /v-show="false"/)
  assert.doesNotMatch(codelistsSource, /display:none/)
})

test('unit OID and symbol use the same table style as other management tabs', () => {
  assert.match(unitsSource, /const editMode = inject\('editMode', ref\(false\)\)/)
  assert.match(unitsSource, /<el-table ref="unitsTableRef" :data="visibleUnits" size="small" border height="100%" row-key="id"/)
  assertInOrder(unitsSource, [
    /<el-table-column label="序号" width="100">/,
    /<el-table-column v-if="editMode" prop="code" label="OID"/,
    /<el-table-column prop="symbol" label="单位符号"/,
  ], 'unit OID should sit between ordinal and symbol columns')
  assert.match(unitsSource, /<el-table-column v-if="editMode" prop="code" label="OID" min-width="110" show-overflow-tooltip \/>/)
  assert.match(unitsSource, /<el-table-column prop="symbol" label="单位符号" min-width="120" show-overflow-tooltip \/>/)
  assert.match(unitsSource, /<el-form-item v-if="editMode" label="OID">[\s\S]*v-model="unitCode"/)
  assert.match(unitsSource, /<el-form-item v-if="editMode" label="OID">[\s\S]*v-model="editUnitCode"/)
  assert.doesNotMatch(unitsSource, /unit-col|unit-symbol|unit-oid/)
  assert.doesNotMatch(unitsSource, /<draggable|from 'vuedraggable'|useOrderableList/)
  assert.doesNotMatch(unitsSource, /单位符号OID/)
  assert.doesNotMatch(unitsSource, /v-show="false"/)
  assert.doesNotMatch(unitsSource, /display:none/)
})

test('field variable OID controls are visible only in complete edit mode after ordinal', () => {
  assert.match(fieldsSource, /const editMode = inject\('editMode', ref\(false\)\)/)
  assertInOrder(fieldsSource, [
    /<el-table-column label="序号" width="100">/,
    /<el-table-column v-if="editMode" prop="variable_name" label="OID\(变量名\)"/,
    /<el-table-column prop="label" label="标签"/,
  ], 'field OID column should sit immediately after ordinal column')
  assert.match(fieldsSource, /<el-form-item v-if="editMode && !\['标签'\]\.includes\(editProp\.field_type\)" label="OID\(变量名\)">[\s\S]*v-model="editProp\.variable_name"/)
  assert.doesNotMatch(fieldsSource, /label="变量名"/)
  assert.doesNotMatch(fieldsSource, /v-show="false"/)
})

test('form OID and designer field variable OID controls are visible only in complete edit mode after ordinal', () => {
  assert.match(formDesignerSource, /const editMode = inject\('editMode', ref\(false\)\)/)
  assertInOrder(formDesignerSource, [
    /<el-table-column label="序号" width="100">/,
    /<el-table-column v-if="editMode" prop="code" label="OID"/,
    /<el-table-column prop="name" label="表单名称"/,
  ], 'form OID column should sit immediately after ordinal column')
  assert.match(formDesignerSource, /<el-form-item v-if="editMode" label="OID">[\s\S]*v-model="newFormCode"/)
  assert.match(formDesignerSource, /<el-form-item v-if="editMode" label="OID">[\s\S]*v-model="editFormCode"/)
  assert.match(formDesignerSource, /<el-form-item v-if="editMode && !\['标签', '日志行'\]\.includes\(editProp\.field_type\)" label="OID\(变量名\)"/)
  assert.doesNotMatch(formDesignerSource, /表单OID|label="变量名"/)
  assert.doesNotMatch(formDesignerSource, /v-show="false"/)
})

test('visit OID controls are visible only in complete edit mode after ordinal', () => {
  assert.match(visitsSource, /const editMode = inject\('editMode', ref\(false\)\)/)
  assertInOrder(visitsSource, [
    /<el-table-column label="序号" width="100">/,
    /<el-table-column v-if="editMode" prop="code" label="OID"/,
    /<el-table-column prop="name" label="访视名称"/,
  ], 'visit OID column should sit immediately after ordinal column')
  assert.match(visitsSource, /<el-form-item v-if="editMode" label="OID">[\s\S]*v-model="form\.code"/)
  assert.match(visitsSource, /<el-form-item v-if="editMode" label="OID">[\s\S]*v-model="editForm\.code"/)
  assert.doesNotMatch(visitsSource, /访视OID/)
  assert.doesNotMatch(visitsSource, /v-show="false"/)
})
