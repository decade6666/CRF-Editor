// 大写 OID 录入（任务 10-27-uppercase-oids）
//
// 契约：新写 / 人工改写的 OID 在录入层即时 ASCII 大写归一；仅转换 ASCII a-z，
// 不动空白、数字、标点与非 ASCII（ß 不得膨胀为 SS）；新复制 OID 由
// buildCopyVariableName 按大写源生成，程序化水合（加载/候选选择/回填既有复制
// 草稿种子）不改写。码表选项 code 保持自由文本，不在归一范围。
// 九个录入控件的模板接线见文末源码断言；真实键入/保存载荷见 component/OidUppercase.spec.js。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { toUpperAsciiOid } from '../src/composables/oidValidation.js'
import { buildCopyVariableName } from '../src/composables/fieldDefinitionAutocomplete.js'

const root = resolve(import.meta.dirname, '..')

function readSource(relative) {
  return readFileSync(resolve(root, relative), 'utf8')
}

test('toUpperAsciiOid only converts ASCII letters and preserves everything else', () => {
  assert.equal(toUpperAsciiOid('ae_01.a-b'), 'AE_01.A-B')
  assert.equal(toUpperAsciiOid('Ae01'), 'AE01')
  assert.equal(toUpperAsciiOid('AE_01.A-B'), 'AE_01.A-B') // 幂等
  assert.equal(toUpperAsciiOid('1.2-3_4'), '1.2-3_4') // 数字/标点不动
  assert.equal(toUpperAsciiOid(' a b '), ' A B ') // 空白保留（trim 归保存链）
  assert.equal(toUpperAsciiOid('ß'), 'ß') // 非 ASCII 不膨胀
  assert.equal(toUpperAsciiOid('中文ae'), '中文AE')
  assert.equal(toUpperAsciiOid(''), '')
  assert.equal(toUpperAsciiOid(null), '')
})

test('buildCopyVariableName mints an uppercase _COPY ladder on exact-match lookup', () => {
  assert.equal(buildCopyVariableName([], 'ts01'), 'TS01_COPY')
  assert.equal(buildCopyVariableName([], 'TEST'), 'TEST_COPY')
  assert.equal(buildCopyVariableName(['TEST_COPY'], 'TEST'), 'TEST_COPY1')
  assert.equal(buildCopyVariableName(['TEST_COPY', 'TEST_COPY1', 'TEST_COPY3'], 'TEST'), 'TEST_COPY2')
})

test('buildCopyVariableName does not case-fold or rewrite the existing-name set', () => {
  // 既有小写同形值保持原样、不参与大小写折叠；新 OID 仍用大写基名
  assert.equal(buildCopyVariableName(['test_copy'], 'TEST'), 'TEST_COPY')
  assert.equal(buildCopyVariableName(['TEST_copy'], 'TEST'), 'TEST_COPY')
})

test('buildCopyVariableName preserves non-ASCII sources and tolerates empty ones', () => {
  assert.equal(buildCopyVariableName([], '血样₁'), '血样₁_COPY')
  assert.equal(buildCopyVariableName([], ''), '_COPY')
})

// ---- 九控件源码接线 ----

const fieldsSource = readSource('src/components/FieldsTab.vue')
const codelistsSource = readSource('src/components/CodelistsTab.vue')
const unitsSource = readSource('src/components/UnitsTab.vue')
const visitsSource = readSource('src/components/VisitsTab.vue')
const designerSource = readSource('src/components/FormDesignerTab.vue')

test('all five components import the shared ASCII uppercase helper', () => {
  for (const [name, source] of [
    ['FieldsTab', fieldsSource],
    ['CodelistsTab', codelistsSource],
    ['UnitsTab', unitsSource],
    ['VisitsTab', visitsSource],
    ['FormDesignerTab', designerSource],
  ]) {
    assert.match(
      source,
      /toUpperAsciiOid[^'"]*['"]\.\.\/composables\/oidValidation(\.js)?['"]/,
      `${name} 应从共享 oidValidation 导入录入归一 helper`,
    )
  }
})

test('field-library OID input normalizes user input at entry', () => {
  assert.match(fieldsSource, /v-model="editProp\.variable_name"[\s\S]{0,120}?@input="editProp\.variable_name = toUpperAsciiOid\(\$event\)"/)
})

test('designer field autocomplete normalizes through a controlled model setter', () => {
  // el-autocomplete 的 input 事件先于 update:modelValue，必须用受控 setter 拦截模型写入
  assert.match(designerSource, /:model-value="editProp\.variable_name"/)
  assert.match(designerSource, /@update:model-value="editProp\.variable_name = toUpperAsciiOid\(\$event\)"/)
  assert.doesNotMatch(designerSource, /v-model="editProp\.variable_name"/)
})

test('designer form OID entries normalize user input at entry', () => {
  assert.match(designerSource, /@input="editFormProp\.code = toUpperAsciiOid\(\$event\)"/)
  assert.match(designerSource, /@input="newFormCode = toUpperAsciiOid\(\$event\)"/)
  assert.match(designerSource, /@input="editFormCode = toUpperAsciiOid\(\$event\)"/)
})

test('codelist OID entries normalize but option codes stay free-form', () => {
  assert.match(codelistsSource, /@input="clForm\.code = toUpperAsciiOid\(\$event\)"/)
  assert.match(codelistsSource, /@input="editClForm\.code = toUpperAsciiOid\(\$event\)"/)
  // 选项 code 为自由文本（跨栈 §10）：不归一
  assert.doesNotMatch(codelistsSource, /optForm\.code = toUpperAsciiOid/)
  assert.doesNotMatch(codelistsSource, /editOptForm\.code = toUpperAsciiOid/)
})

test('unit and visit OID entries normalize without touching symbols or names', () => {
  assert.match(unitsSource, /@input="unitEditProp\.code = toUpperAsciiOid\(\$event\)"/)
  assert.doesNotMatch(unitsSource, /unitEditProp\.symbol = toUpperAsciiOid/)
  assert.match(visitsSource, /@input="visitEditProp\.code = toUpperAsciiOid\(\$event\)"/)
  assert.doesNotMatch(visitsSource, /visitEditProp\.name = toUpperAsciiOid/)
})
