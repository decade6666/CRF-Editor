import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildFormDesignerRenderGroups,
  buildFormDesignerUnifiedSegments,
  getFormFieldDisplayLabel,
  getFormFieldPreviewStyle,
  getFormFieldTextColorStyle,
} from '../src/composables/formFieldPresentation.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const formDesignerSource = readFileSync(path.resolve(currentDir, '../src/components/FormDesignerTab.vue'), 'utf8')

function createField(overrides = {}) {
  return {
    id: 1,
    order_index: 1,
    inline_mark: 0,
    is_log_row: 0,
    label_override: null,
    bg_color: null,
    text_color: null,
    field_definition: {
      label: '默认标签',
      field_type: '文本',
    },
    ...overrides,
  }
}

test('list and preview labels both prefer label_override', () => {
  const field = createField({ label_override: '快捷编辑标签', text_color: '112233', bg_color: 'FFEEDD' })

  assert.equal(getFormFieldDisplayLabel(field), '快捷编辑标签')
  assert.equal(getFormFieldTextColorStyle(field), 'color:#112233')
  assert.equal(getFormFieldPreviewStyle(field), 'background:#FFEEDD40;color:#112233')
})

test('preview style falls back to default background when no bg_color is set', () => {
  const field = createField({ text_color: '445566' })

  assert.equal(getFormFieldPreviewStyle(field, 'background:#d9d9d9;'), 'background:#d9d9d9;color:#445566')
})

test('preview groups switch to inline when inline_mark changes', () => {
  const groups = buildFormDesignerRenderGroups([
    createField({ id: 1, order_index: 1, inline_mark: 0, label_override: '普通字段' }),
    createField({ id: 2, order_index: 2, inline_mark: 1, label_override: '快捷编辑标签' }),
    createField({ id: 3, order_index: 3, inline_mark: 1, field_definition: { label: '同组字段', field_type: '文本' } }),
  ])

  assert.equal(groups.length, 2)
  assert.equal(groups[0].type, 'normal')
  assert.equal(groups[1].type, 'inline')
  assert.deepEqual(groups[1].fields.map(getFormFieldDisplayLabel), ['快捷编辑标签', '同组字段'])
})

test('export segments keep updated quick edit fields in order', () => {
  const segments = buildFormDesignerUnifiedSegments([
    createField({ id: 2, order_index: 2, inline_mark: 1, label_override: '快捷编辑标签', bg_color: 'FFEEDD', text_color: '112233' }),
    createField({ id: 1, order_index: 1, inline_mark: 0, field_definition: { label: '普通字段', field_type: '文本' } }),
    createField({ id: 3, order_index: 3, inline_mark: 0, field_definition: { label: '尾部字段', field_type: '文本' } }),
  ])

  assert.deepEqual(segments.map(segment => segment.type), ['regular_field', 'inline_block', 'regular_field'])
  assert.equal(getFormFieldDisplayLabel(segments[1].fields[0]), '快捷编辑标签')
  assert.equal(segments[1].fields[0].inline_mark, 1)
  assert.equal(segments[1].fields[0].bg_color, 'FFEEDD')
  assert.equal(segments[1].fields[0].text_color, '112233')
})

test('quick edit fields are subset of form field instance properties', () => {
  assert.match(
    formDesignerSource,
    /Object\.assign\(quickEditProp, \{\s*label: getFormFieldDisplayLabel\(ff\) \|\| '',\s*field_type: ff\.field_definition\?\.field_type \|\| '',\s*bg_color: ff\.bg_color \|\| '',\s*text_color: ff\.text_color \|\| '',\s*inline_mark: !!ff\.inline_mark\s*\}\)/s,
  )
  assert.match(
    formDesignerSource,
    /const payload = \{ label_override: quickEditProp\.label, bg_color: quickEditProp\.bg_color \|\| null, text_color: quickEditProp\.text_color \|\| null, inline_mark: quickEditProp\.inline_mark \? 1 : 0 \}/,
  )
  assert.match(formDesignerSource, /<el-form-item label="变量标签"><el-input v-model="quickEditProp\.label" \/><\/el-form-item>/)
  assert.match(formDesignerSource, /<el-form-item label="底纹颜色">/)
  assert.match(formDesignerSource, /<el-form-item label="文字颜色">/)
  assert.match(
    formDesignerSource,
    /<el-form-item label="布局" v-if="quickEditProp\.field_type !== '标签' && quickEditProp\.field_type !== '日志行'"><el-checkbox v-model="quickEditProp\.inline_mark">横向显示<\/el-checkbox><\/el-form-item>/,
  )
  assert.equal(formDesignerSource.includes('default_value: quickEditProp'), false)
  assert.equal(formDesignerSource.includes('variable_name: quickEditProp'), false)
  assert.equal(formDesignerSource.includes('codelist_id: quickEditProp'), false)
  assert.equal(formDesignerSource.includes('unit_id: quickEditProp'), false)
})
