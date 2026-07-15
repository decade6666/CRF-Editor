import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildNormalColumnDemands,
  computeChoiceAtomWeight,
  computeFieldControlWeight,
  isChoiceField,
  isDefaultValueSupported,
  renderCtrl,
  renderCtrlHtml,
} from '../src/composables/useCRFRenderer.js'
import { syncFieldTypeSpecificProps } from '../src/composables/formDesignerPropertyEditor.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const fieldsTabSource = readFileSync(path.resolve(currentDir, '../src/components/FieldsTab.vue'), 'utf8')
const formDesignerSource = readFileSync(path.resolve(currentDir, '../src/components/FormDesignerTab.vue'), 'utf8')
const visitsSource = readFileSync(path.resolve(currentDir, '../src/components/VisitsTab.vue'), 'utf8')
const simulatedCrfFormSource = readFileSync(path.resolve(currentDir, '../src/components/SimulatedCRFForm.vue'), 'utf8')
const templatePreviewSource = readFileSync(path.resolve(currentDir, '../src/components/TemplatePreviewDialog.vue'), 'utf8')
const generatorSource = readFileSync(path.resolve(currentDir, '../scripts/generatePlannerFixtures.mjs'), 'utf8')

const DATE_FORMAT_OPTIONS = {
  日期: ['yyyy-MM-dd'],
  日期时间: ['yyyy-MM-dd HH:mm'],
  时间: ['HH:mm'],
}

const DEFAULT_DATE_FORMATS = {
  日期: 'yyyy-MM-dd',
  日期时间: 'yyyy-MM-dd HH:mm',
  时间: 'HH:mm',
}

test('checkbox renderer uses custom text or ✔ fallback without choice-field behavior', () => {
  assert.equal(renderCtrl({ field_type: '复选', label: '已确认' }), '□✔')
  assert.equal(
    renderCtrl({ field_type: '复选', label: '字段标签', checkbox_label: '自定义确认' }),
    '□自定义确认',
  )
  assert.match(
    renderCtrlHtml({ field_type: '复选', label: '<默认>', checkbox_label: '<自定义>' }),
    /□&lt;自定义&gt;/,
  )
  assert.equal(isChoiceField('复选'), false)
  assert.equal(isDefaultValueSupported('复选'), false)
  assert.equal(isDefaultValueSupported('复选', true), false)
})

test('checkbox planner uses the marker-and-text atom weight', () => {
  const field = {
    field_definition: {
      field_type: '复选',
      label: '字段标签',
      checkbox_label: '确认研究参与',
    },
  }
  const expectedWeight = computeChoiceAtomWeight('确认研究参与', false)

  assert.equal(computeFieldControlWeight(field), expectedWeight)
  assert.equal(buildNormalColumnDemands([field])[1].weight, expectedWeight)
  assert.equal(
    computeFieldControlWeight({ field_definition: { field_type: '复选', label: '已' } }),
    6,
    'short checkbox controls retain the shared minimum planner width',
  )
})

test('type switching clears stale settings for checkbox and clears checkbox text when leaving it', () => {
  const checkbox = syncFieldTypeSpecificProps({
    field_type: '单选',
    checkbox_label: '已确认',
    codelist_id: 10,
    unit_id: 11,
    integer_digits: 6,
    decimal_digits: 2,
    date_format: 'yyyy-MM-dd',
  }, '复选', DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS)

  assert.equal(checkbox.codelist_id, null)
  assert.equal(checkbox.unit_id, null)
  assert.equal(checkbox.integer_digits, null)
  assert.equal(checkbox.decimal_digits, null)
  assert.equal(checkbox.date_format, null)
  assert.equal(checkbox.checkbox_label, '已确认')

  const text = syncFieldTypeSpecificProps(checkbox, '文本', DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS)
  assert.equal(text.checkbox_label, null)
})

test('field editors expose the checkbox type, text input, and persistence mappings', () => {
  assert.match(fieldsTabSource, /const fieldTypes = \[[\s\S]*?'复选'/)
  assert.match(fieldsTabSource, /checkbox_label: null/)
  assert.match(fieldsTabSource, /syncFieldTypeSpecificProps\(editProp, newType, DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS\)/)
  assert.match(
    fieldsTabSource,
    /<el-form-item v-if="editProp\.field_type === '复选'" label="复选文本"><el-input v-model="editProp\.checkbox_label" placeholder="✔" \/><\/el-form-item>/,
  )

  assert.match(formDesignerSource, /const designerFieldTypes = \[[\s\S]*?'复选'/)
  assert.match(
    formDesignerSource,
    /<el-form-item v-if="editProp\.field_type === '复选'" label="复选文本">[\s\S]*?v-model="editProp\.checkbox_label"[\s\S]*?placeholder="✔"/,
  )
  assert.match(formDesignerSource, /checkbox_label: snapshot\.checkbox_label \?\? null/)
  assert.match(formDesignerSource, /checkbox_label: editProp\.checkbox_label \?\? null/)
})

test('all preview paths retain renderer data required for checkbox text', () => {
  assert.match(
    formDesignerSource,
    /function getPreviewField\(ff\) \{[\s\S]*?label: ff\.field_definition\.label,[\s\S]*?checkbox_label: ff\.field_definition\.checkbox_label/,
  )
  assert.match(
    visitsSource,
    /function toRendererField\(fd\) \{[\s\S]*?label: fd\.label,[\s\S]*?checkbox_label: fd\.checkbox_label/,
  )
  assert.match(simulatedCrfFormSource, /return renderCtrlHtml\(field, fillLineChars, columnCm\)/)
  assert.match(templatePreviewSource, /return renderCtrlHtml\(ff, fillLineChars, columnCm\)/)
})

test('planner fixture generator defines a checkbox case', () => {
  assert.match(generatorSource, /const checkboxField =/)
  assert.match(generatorSource, /name: 'normal_checkbox_custom_text'/)
})
