import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeHexColorInput, syncFieldTypeSpecificProps } from '../src/composables/formDesignerPropertyEditor.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const formDesignerSource = readFileSync(path.resolve(currentDir, '../src/components/FormDesignerTab.vue'), 'utf8')
const fieldDefinitionPayloadExpression = /const updatedDefinition = await api\.put\(`\/api\/projects\/\$\{projectId\}\/field-definitions\/\$\{ff\.field_definition_id\}`, (\{[\s\S]*?\})\)/.exec(formDesignerSource)?.[1]
const buildFieldDefinitionPayload = fieldDefinitionPayloadExpression
  ? new Function('snapshot', `return (${fieldDefinitionPayloadExpression})`)
  : null

function functionBody(name) {
  const start = formDesignerSource.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `should locate ${name}`)
  const bodyStart = formDesignerSource.indexOf('{', start)
  let depth = 0
  for (let index = bodyStart; index < formDesignerSource.length; index += 1) {
    if (formDesignerSource[index] === '{') depth += 1
    if (formDesignerSource[index] === '}') depth -= 1
    if (depth === 0) return formDesignerSource.slice(bodyStart + 1, index)
  }
  assert.fail(`${name} should have a complete body`)
}

const DATE_FORMAT_OPTIONS = {
  日期: ['yyyy-MM-dd', 'MM/dd/yyyy'],
  日期时间: ['yyyy-MM-dd HH:mm', 'yyyy/MM/dd HH:mm:ss'],
  时间: ['HH:mm:ss', 'HH:mm'],
}

const DEFAULT_DATE_FORMATS = {
  日期: 'yyyy-MM-dd',
  日期时间: 'yyyy-MM-dd HH:mm',
  时间: 'HH:mm',
}

test('applyFieldPropState replays colors for both log rows and normal fields', () => {
  // 撤销/恢复颜色对日志行与普通字段都需回放：颜色 PATCH 必须在 if/else 之外无条件执行
  const body = /async function applyFieldPropState\(ctx, state\) \{([\s\S]*?)\n\}/.exec(formDesignerSource)?.[1]
  assert.ok(body, 'should locate applyFieldPropState body')
  const colorPatches = body.match(/api\.patch\(`\/api\/form-fields\/\$\{ffId\}\/colors`/g) || []
  assert.equal(colorPatches.length, 1, 'colors should be patched exactly once')
  const elseBlock = /\} else \{([\s\S]*?)\n {2}\}/.exec(body)?.[1] || ''
  assert.doesNotMatch(elseBlock, /\/colors`/, 'colors patch must not be confined to the non-log-row branch')
})

test('syncFieldTypeSpecificProps clears stale choice and unit references when type changes', () => {
  const next = syncFieldTypeSpecificProps({
    field_type: '单选',
    codelist_id: 12,
    unit_id: 9,
    integer_digits: 4,
    decimal_digits: 2,
    date_format: 'yyyy-MM-dd',
  }, '日期', DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS)

  assert.equal(next.codelist_id, null)
  assert.equal(next.unit_id, null)
  assert.equal(next.integer_digits, null)
  assert.equal(next.decimal_digits, null)
  assert.equal(next.date_format, 'yyyy-MM-dd')
})

test('syncFieldTypeSpecificProps preserves compatible references for numeric fields', () => {
  const next = syncFieldTypeSpecificProps({
    field_type: '文本',
    codelist_id: null,
    unit_id: 5,
    integer_digits: 6,
    decimal_digits: 1,
    date_format: 'HH:mm',
  }, '数值', DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS)

  assert.equal(next.unit_id, 5)
  assert.equal(next.integer_digits, 6)
  assert.equal(next.decimal_digits, 1)
  assert.equal(next.date_format, null)
})

test('syncFieldTypeSpecificProps assigns default date format when current one is incompatible', () => {
  const next = syncFieldTypeSpecificProps({
    field_type: '文本',
    codelist_id: null,
    unit_id: null,
    integer_digits: null,
    decimal_digits: null,
    date_format: 'HH:mm',
  }, '日期时间', DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS)

  assert.equal(next.date_format, 'yyyy-MM-dd HH:mm')
})

test('field definition payload keeps cleared unit as null', () => {
  assert.ok(buildFieldDefinitionPayload, 'should extract field definition payload builder from FormDesignerTab.vue')

  const clearedPayload = buildFieldDefinitionPayload({
    label: '体温',
    variable_name: 'TEMP',
    field_type: '文本',
    integer_digits: null,
    decimal_digits: null,
    date_format: null,
    checkbox_label: undefined,
    codelist_id: null,
    unit_id: undefined,
  })
  const selectedPayload = buildFieldDefinitionPayload({
    label: '体温',
    variable_name: 'TEMP',
    field_type: '文本',
    integer_digits: null,
    decimal_digits: null,
    date_format: null,
    checkbox_label: '已确认',
    codelist_id: null,
    unit_id: 12,
  })

  assert.equal(Object.hasOwn(clearedPayload, 'unit_id'), true)
  assert.equal(clearedPayload.unit_id, null)
  assert.equal(clearedPayload.checkbox_label, null)
  assert.equal(selectedPayload.unit_id, 12)
  assert.equal(selectedPayload.checkbox_label, '已确认')
})

test('property editor exposes explicit dirty state helpers and keeps drafts clean', () => {
  assert.match(formDesignerSource, /const fieldPropBaseline = ref\(null\)/)
  assert.match(formDesignerSource, /function currentEditorPropState\(\) \{[\s\S]*label_override: isLogRow \? \(labelOverride \?\? null\) : \(ff\.label_override \?\? null\)/)
  assert.match(formDesignerSource, /function syncFieldPropBaselineFromEditor\(\) \{[\s\S]*fieldPropBaseline\.value = selectedFieldId\.value === DRAFT_FIELD_ID \? null : currentEditorPropState\(\)/)
  assert.match(formDesignerSource, /const isFieldPropDirty = computed\(\(\) => \{[\s\S]*selectedFieldId\.value === DRAFT_FIELD_ID[\s\S]*!sameFieldPropState\(fieldPropBaseline\.value, currentState\)/)
  assert.match(formDesignerSource, /syncFieldPropBaselineFromEditor\(\)/)
})

test('property editor baseline normalization keeps stale type-specific values clean on hydration', () => {
  const currentEditorPropState = new Function(
    'getSelectedFormField',
    'selectedFieldId',
    'DRAFT_FIELD_ID',
    'editProp',
    'DATE_FORMAT_OPTIONS',
    'isChoiceField',
    'normalizeEditorDefaultValue',
    `${functionBody('currentEditorPropState')}`,
  )
  const DRAFT_FIELD_ID = '__draft__'
  const ff = {
    id: 7,
    is_log_row: 0,
    label_override: null,
    default_value: '',
    bg_color: null,
    text_color: null,
    label_bold: 1,
    label_font_size: null,
  }
  const editProp = {
    label: '体温',
    variable_name: 'TEMP',
    field_type: '文本',
    integer_digits: 6,
    decimal_digits: 2,
    date_format: null,
    checkbox_label: null,
    codelist_id: null,
    unit_id: 3,
    default_value: '',
    inline_mark: 0,
    bg_color: null,
    text_color: null,
    label_bold: 1,
    label_font_size: 'default',
  }
  const selectedFieldId = { value: ff.id }
  const getSelectedFormField = () => ff
  const normalizeEditorDefaultValue = () => null
  const state = currentEditorPropState(
    getSelectedFormField,
    selectedFieldId,
    DRAFT_FIELD_ID,
    editProp,
    DATE_FORMAT_OPTIONS,
    (fieldType) => ['单选', '多选', '单选（纵向）', '多选（纵向）'].includes(fieldType),
    normalizeEditorDefaultValue,
  )
  const staleBaseline = {
    ...state,
    fd: {
      ...state.fd,
      integer_digits: 6,
      decimal_digits: 2,
    },
  }

  assert.equal(state.fd.integer_digits, null)
  assert.equal(state.fd.decimal_digits, null)
  assert.equal(state.fd.unit_id, 3)
  assert.equal(JSON.stringify(staleBaseline) === JSON.stringify(state), false)
  assert.equal(JSON.stringify(state) === JSON.stringify(state), true)
  assert.match(formDesignerSource, /syncFieldPropBaselineFromEditor\(\)/)
})

test('property editor no longer schedules persistent autosave', () => {
  assert.doesNotMatch(formDesignerSource, /fieldPropSaveTimer\s*=\s*setTimeout/)
  assert.doesNotMatch(formDesignerSource, /flushPendingFieldPropSave/)
  assert.doesNotMatch(formDesignerSource, /pendingFieldPropSnapshots/)
  assert.match(formDesignerSource, /watch\(currentFieldPropDraftKey,[\s\S]*selectedFieldId\.value === DRAFT_FIELD_ID[\s\S]*applyEditorToDraft\(\)/)
})

test('property editor save validates, warns on multi-form references, and updates baseline', () => {
  const body = /async function saveSelectedFieldProp\(\) \{([\s\S]*?)\n\}/.exec(formDesignerSource)?.[1]
  assert.ok(body, 'should locate saveSelectedFieldProp body')
  assert.match(body, /isSavingFieldProp\.value = true/)
  assert.match(body, /isChoiceField\(snapshot\.field_type\) && !snapshot\.codelist_id/)
  assert.match(body, /ElMessage\.warning\('单选\/多选字段必须选择选项字典'\)/)
  assert.match(body, /await confirmFieldReferenceImpact\(ff\)/)
  assert.match(formDesignerSource, /import \{ countDistinctForms, formatFieldImpactMessage \} from '..\/composables\/fieldReferenceImpact'/)
  assert.match(formDesignerSource, /countDistinctForms\(refs\) <= 1/)
  assert.match(formDesignerSource, /formatFieldImpactMessage\(refs, \{ max: 5, sep: '、' \}\)/)
  assert.match(formDesignerSource, /修改将影响以下表单：\\n\$\{msg\}\\n确认修改？/)
  assert.match(body, /await saveFieldProp\(snapshot, sessionId\)/)
  assert.match(body, /if \(selectedFieldId\.value === snapshot\.fieldId\) syncFieldPropBaselineFromEditor\(\)/)
  assert.match(body, /if \(sessionId == null \|\| sessionId === fieldPropSaveSession\) isSavingFieldProp\.value = false/)
  assert.match(body, /return true/)
})

test('property editor cancel restores selected field from baseline without requests', () => {
  const body = /function cancelSelectedFieldProp\(\) \{([\s\S]*?)\n\}/.exec(formDesignerSource)?.[1]
  assert.ok(body, 'should locate cancelSelectedFieldProp body')
  assert.doesNotMatch(body, /api\.(post|put|patch|del|get)\(/)
  assert.match(body, /if \(ff\) selectField\(ff\)/)
})

test('saveFieldProp refreshes the field library only after a field definition update', () => {
  // 修改字段定义（非日志行分支）保存成功后必须 bump refreshKey 触发左侧字段库重载；
  // 日志行分支只改实例 label_override，不改字段定义，不应触发字段库刷新。
  const body = functionBody('saveFieldProp')

  // 定位 `if (ff.is_log_row) { ... } else { ... }`，分别提取两分支
  const ifStart = body.indexOf('if (ff.is_log_row)')
  assert.notEqual(ifStart, -1, 'should locate the log-row branch')
  const ifBraceOpen = body.indexOf('{', ifStart)
  let depth = 0
  let ifBraceClose = -1
  for (let index = ifBraceOpen; index < body.length; index += 1) {
    if (body[index] === '{') depth += 1
    if (body[index] === '}') depth -= 1
    if (depth === 0) {
      ifBraceClose = index
      break
    }
  }
  assert.notEqual(ifBraceClose, -1, 'log-row branch should be balanced')
  const logRowBranch = body.slice(ifBraceOpen + 1, ifBraceClose)

  const elseStart = body.indexOf('else', ifBraceClose)
  const elseBraceOpen = body.indexOf('{', elseStart)
  depth = 0
  let elseBraceClose = -1
  for (let index = elseBraceOpen; index < body.length; index += 1) {
    if (body[index] === '{') depth += 1
    if (body[index] === '}') depth -= 1
    if (depth === 0) {
      elseBraceClose = index
      break
    }
  }
  assert.notEqual(elseBraceClose, -1, 'non-log-row branch should be balanced')
  const definitionBranch = body.slice(elseBraceOpen + 1, elseBraceClose)

  assert.match(definitionBranch, /refreshKey\.value\+\+/, 'field-definition update should bump refreshKey')
  assert.doesNotMatch(logRowBranch, /refreshKey\.value\+\+/, 'log-row branch should not bump refreshKey')
})


test('normalizeHexColorInput accepts and normalizes valid values', () => {
  assert.equal(normalizeHexColorInput('#abc'), 'AABBCC')
  assert.equal(normalizeHexColorInput('a1b2c3'), 'A1B2C3')
})

test('normalizeHexColorInput rejects invalid values', () => {
  assert.equal(normalizeHexColorInput(''), null)
  assert.equal(normalizeHexColorInput('xyz'), null)
  assert.equal(normalizeHexColorInput('fff;display:none'), null)
})

test('FormDesignerTab guards OID charset on form/field/option submit paths', () => {
  // req2：表单 OID / 字段 variable_name / 内联字典选项 code 保存前须做字符集校验并内联报错
  assert.match(
    formDesignerSource,
    /import \{ isValidOptionalOid, isValidRequiredOid, OID_ERROR \} from '..\/composables\/oidValidation'/,
    'should import the shared OID validators',
  )

  const addForm = functionBody('addForm')
  assert.match(addForm, /isValidOptionalOid\(newFormCode\.value\)/)
  assert.match(addForm, /ElMessage\.warning\(OID_ERROR\)/)

  const updateForm = functionBody('updateForm')
  assert.match(updateForm, /isValidOptionalOid\(editFormCode\.value\)/)
  assert.match(updateForm, /ElMessage\.warning\(OID_ERROR\)/)

  const saveProp = functionBody('saveSelectedFieldProp')
  assert.match(saveProp, /!isValidRequiredOid\(snapshot\.variable_name\)/)
  assert.match(saveProp, /ElMessage\.warning\(OID_ERROR\)/)

  const quickAdd = functionBody('quickAddCodelist')
  assert.match(quickAdd, /!isValidOptionalOid\(opt\.code\)/)
  assert.match(quickAdd, /ElMessage\.warning\(OID_ERROR\)/)

  const quickSave = functionBody('quickSaveCodelist')
  assert.match(quickSave, /!isValidOptionalOid\(opt\.code\)/)
  assert.match(quickSave, /ElMessage\.warning\(OID_ERROR\)/)
})
