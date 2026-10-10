import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildDefinitionPayload,
  normalizeDateFormat,
  normalizeHexColorInput,
  syncFieldTypeSpecificProps,
} from '../src/composables/formDesignerPropertyEditor.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const formDesignerSource = readFileSync(path.resolve(currentDir, '../src/components/FormDesignerTab.vue'), 'utf8')

function functionBody(name) {
  const start = formDesignerSource.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `should locate ${name}`)
  // Skip parameter list (which may contain destructuring braces) before finding the body.
  let depth = 0
  let bodyStart = -1
  let inParams = false
  for (let index = start; index < formDesignerSource.length; index += 1) {
    const ch = formDesignerSource[index]
    if (ch === '(') {
      depth += 1
      inParams = true
      continue
    }
    if (ch === ')') {
      depth -= 1
      if (inParams && depth === 0) {
        inParams = false
        bodyStart = formDesignerSource.indexOf('{', index + 1)
        break
      }
    }
  }
  assert.notEqual(bodyStart, -1, `${name} should have a body brace after params`)
  depth = 0
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

test('replayBindingProfile replays definition, binding, instance and cleanup in one request', () => {
  // 撤销/恢复收敛为一次 binding-profile 原子请求（不再逐次 PUT 定义 / PUT 实例 / PATCH 颜色）
  const body = /async function replayBindingProfile\(historyContext, ffId, command, \{ focusFieldId = ffId \} = \{\}\) \{([\s\S]*?)\n\}/.exec(formDesignerSource)?.[1]
  assert.ok(body, 'should locate replayBindingProfile body')
  assert.match(body, /api\.put\(`\/api\/form-fields\/\$\{ffId\}\/binding-profile`, command\)/)
  assert.match(body, /reloadAfterReplay\(historyContext\?\.formId, \{ defs: true, focusFieldId \}\)/)
  assert.doesNotMatch(formDesignerSource, /async function applyFieldPropState/)
  assert.doesNotMatch(formDesignerSource, /api\.patch\(`\/api\/form-fields\/\$\{ffId\}\/colors`/)
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

test('normalizeDateFormat maps legacy uppercase and unknown values to a legal default, preserving explicit clears', () => {
  assert.equal(normalizeDateFormat('日期', 'YYYY-MM-DD', DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS), 'yyyy-MM-dd')
  assert.equal(normalizeDateFormat('日期', 'yyyy-MM-dd', DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS), 'yyyy-MM-dd')
  assert.equal(normalizeDateFormat('日期', 'MM/dd/yyyy', DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS), 'MM/dd/yyyy')
  assert.equal(normalizeDateFormat('日期', null, DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS), 'yyyy-MM-dd')
  assert.equal(normalizeDateFormat('日期', undefined, DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS), 'yyyy-MM-dd')
  assert.equal(normalizeDateFormat('日期', '', DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS), '')
  assert.equal(normalizeDateFormat('文本', 'YYYY-MM-DD', DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS), null)
})

test('currentEditorPropState normalizes date_format the same way as syncFieldTypeSpecificProps', () => {
  // 基线（hydration 后）与当前值口径必须一致，否则异步 field_type watcher 注入默认格式会误报脏态。
  assert.match(formDesignerSource, /normalizeDateFormat\(normalizedFieldType, editProp\.date_format, DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS\)/)
  assert.match(formDesignerSource, /syncFieldTypeSpecificProps\(editProp, editProp\.field_type, DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS\)/)
})

test('field definition payload keeps cleared unit as null', () => {
  const clearedPayload = buildDefinitionPayload({
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
  const selectedPayload = buildDefinitionPayload({
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
  // 结构字段默认值
  assert.equal(clearedPayload.is_multi_record, 0)
  assert.equal(clearedPayload.table_type, '固定行')
})

test('property editor exposes explicit dirty state helpers and keeps drafts clean', () => {
  assert.match(formDesignerSource, /const fieldPropBaseline = ref\(null\)/)
  assert.match(formDesignerSource, /function currentEditorPropState\(\) \{[\s\S]*if \(!ff \|\| ff\.is_log_row \|\| selectedFieldId\.value === DRAFT_FIELD_ID\) return null;/)
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
    'normalizeDateFormat',
    'DEFAULT_DATE_FORMATS',
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
    normalizeDateFormat,
    DEFAULT_DATE_FORMATS,
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
  // DEC3：确认目标派生自与保存命令同一组参数；候选目标按 R5 阈值（仅其他表单）确认
  assert.match(body, /const commandArgs = buildSelectedFieldCommandArgs\(ff, snapshot\)/)
  const targetDeclaration = body.indexOf('const sharedWriteTarget = resolveSharedWriteTarget(commandArgs)')
  const confirmation = body.indexOf('await confirmFieldReferenceImpact(')
  assert.ok(targetDeclaration >= 0 && confirmation > targetDeclaration)
  assert.match(
    body,
    /await confirmFieldReferenceImpact\(sharedWriteTarget, \{\s*includesCurrentForm: sharedWriteTarget === ff\.field_definition_id,\s*\}\)/,
  )
  assert.match(formDesignerSource, /import \{ countDistinctForms, formatFieldImpactMessage \} from '..\/composables\/fieldReferenceImpact'/)
  // 唯一索引 uq_form_field 保证同表单不双绑定：references 行数=去重表单数，按去重表单数计阈值
  assert.match(formDesignerSource, /countDistinctForms\(refs\) <= \(includesCurrentForm \? 1 : 0\)/)
  assert.match(formDesignerSource, /formatFieldImpactMessage\(refs, \{ max: 5, sep: '、' \}\)/)
  assert.match(formDesignerSource, /修改将影响以下表单：\\n\$\{msg\}\\n确认修改？/)
  assert.match(body, /await saveFieldProp\(snapshot, sessionId, commandArgs, candidateBeforePayload\)/)
  assert.match(
    body,
    /if\s*\(\s*selectedFieldId\.value === snapshot\.fieldId\s*&&\s*sameFieldPropState\(buildFieldPropSnapshot\(\), snapshot\)\s*\)\s*\{\s*syncFieldPropBaselineFromEditor\(\)/,
  )
  assert.match(body, /if \(sessionId == null \|\| sessionId === fieldPropSaveSession\) isSavingFieldProp\.value = false/)
  assert.match(body, /return true/)
})

test('property editor cancel restores selected field from baseline without requests', () => {
  const body = /function cancelSelectedFieldProp\(\) \{([\s\S]*?)\n\}/.exec(formDesignerSource)?.[1]
  assert.ok(body, 'should locate cancelSelectedFieldProp body')
  assert.doesNotMatch(body, /api\.(post|put|patch|del|get)\(/)
  assert.match(body, /if \(ff\) selectField\(ff\)/)
})

test('property editor cannot leave while its persistence request is in flight', () => {
  const body = functionBody('resolveFieldPropLeave')
  assert.match(body, /if \(isSavingFieldProp\.value\) return false/)
})

test('selectField cannot reset candidate state while a save is in flight', () => {
  const selectBody = functionBody('selectField')
  const reconcileBody = functionBody('reconcileAfterFieldPropSave')
  assert.match(selectBody, /if \(isSavingFieldProp\.value && !fromSave\) return/)
  assert.match(reconcileBody, /selectField\(fresh, \{ fromSave: true \}\)/)
})

test('post-save reconciliation reloads, falls back to the endpoint row, and rebuilds the editor', () => {
  const body = functionBody('reconcileAfterFieldPropSave')
  assert.match(body, /api\.invalidateCache\(`\/api\/forms\/\$\{formId\}\/fields`\)/)
  assert.match(body, /api\.invalidateCache\(`\/api\/projects\/\$\{projectId\}\/field-definitions`\)/)
  assert.match(body, /refreshKey\.value\+\+/)
  assert.match(body, /if \(!isReordering\.value\) \{[\s\S]*?await loadFormFields\(\);[\s\S]*?\}/)
  assert.match(body, /const savedField = \{ \.\.\.ff, \.\.\.result\.form_field \}/)
  assert.match(body, /candidateBeforeDefinition = null;/)
})

test('impact preflight and request share frozen command args and undo snapshot', () => {
  const saveSelectedBody = functionBody('saveSelectedFieldProp')
  const saveBody = functionBody('saveFieldProp')
  const capturedCandidate = saveSelectedBody.indexOf('const candidateBeforePayload = candidateBeforeDefinition')
  const confirmation = saveSelectedBody.indexOf('await confirmFieldReferenceImpact(')
  assert.ok(capturedCandidate >= 0 && capturedCandidate < confirmation)
  assert.match(saveSelectedBody, /const commandArgs = buildSelectedFieldCommandArgs\(ff, snapshot\)/)
  assert.match(saveSelectedBody, /resolveSharedWriteTarget\(commandArgs\)/)
  assert.match(
    saveSelectedBody,
    /await saveFieldProp\(snapshot, sessionId, commandArgs, candidateBeforePayload\)/,
  )
  assert.match(saveBody, /buildBindingProfileCommand\(\{\s*\.\.\.commandArgs,\s*editorState,\s*\}\)/)
  // 保存函数内不得再读共享 candidate 决策状态；唯一允许的残余是成功后的清空赋值
  const residualReads = saveBody.split('candidateBeforeDefinition = null;').join('')
  assert.doesNotMatch(residualReads, /candidateBeforeDefinition/)
})

test('saveFieldProp saves one atomic binding-profile command and refreshes the field library', () => {
  const body = functionBody('saveFieldProp')

  assert.doesNotMatch(body, /if \(ff\.is_log_row\)/)
  // DEC3：与 saveSelectedFieldProp 的影响确认共用同一组命令参数
  assert.match(body, /const command = buildBindingProfileCommand\(\{\s*\.\.\.commandArgs,\s*editorState,\s*\}\)/)
  assert.match(body, /const result = await api\.put\(`\/api\/form-fields\/\$\{propEditFieldId\}\/binding-profile`, command\)/)
  assert.doesNotMatch(body, /api\.put\(`\/api\/projects\/\$\{projectId\}\/field-definitions/)
  assert.doesNotMatch(body, /api\.patch\(`\/api\/form-fields/)
  assert.match(body, /const settled = await reconcileAfterFieldPropSave\(\{[\s\S]*?result,[\s\S]*?snapshot,[\s\S]*?\}\)/)
  assert.match(body, /if \(!settled\) return;/)
  // 历史条目按操作类型记录：共享更新 / 换绑（含纯引用）/ OID 分叉；
  // definitionUpdated 标记让回放只重建正向保存实际写过的部分（收口在 recordFieldPropSaveHistory）
  const historyBody = functionBody('recordFieldPropSaveHistory')
  assert.match(body, /recordFieldPropSaveHistory\(historyContext, \{[\s\S]*?writtenDefinitionId: result\.final_definition_id \?\? originalDefinitionId,/)
  assert.match(historyBody, /const isRebind = command\.binding\.mode === 'existing'/)
  assert.match(historyBody, /const definitionUpdated = command\.definition_operation\.operation === 'update_shared'/)
  assert.match(historyBody, /buildFieldPropReplayCommand\(\{[\s\S]*?entryType: isFork \? 'fork-undo' : isRebind \? 'rebind-undo' : 'shared',[^\u0000]*?definitionUpdated,/)
  assert.match(historyBody, /buildFieldPropReplayCommand\(\{[\s\S]*?entryType: isFork \? 'fork-redo' : isRebind \? 'rebind-redo' : 'shared',[^\u0000]*?definitionUpdated,/)
  // 回放构造器已收口到 composable（行为可单测），组件不再本地定义
  assert.doesNotMatch(formDesignerSource, /function buildFieldPropReplayCommand\(/)
  assert.match(formDesignerSource, /import \{[\s\S]*?buildFieldPropReplayCommand,[\s\S]*?\} from '\.\.\/composables\/formDesignerPropertyEditor'/)
})

test('field prop history snapshot preserves instance and structural keys for replay', () => {
  const body = functionBody('snapshotFieldPropState')
  assert.match(body, /help_text: ff\.help_text \?\? null/)
  // fd 键集由 DEFINITION_PAYLOAD_KEYS 派生：新增定义键自动进快照，不再被回放默认值重置
  assert.match(body, /fd: Object\.fromEntries\(DEFINITION_PAYLOAD_KEYS\.map\(\(key\) => \[key, fd\[key\] \?\? null\]\)\)/)
  assert.match(formDesignerSource, /import \{[\s\S]*?DEFINITION_PAYLOAD_KEYS,[\s\S]*?\} from '\.\.\/composables\/formDesignerPropertyEditor'/)
})

test('history replay is blocked while property save confirmation is pending', () => {
  const body = functionBody('runHistory')
  assert.match(
    body,
    /if\s*\(\s*designerHistory\.busy\.value\s*\|\|\s*isReordering\.value\s*\|\|\s*savingDraft\.value\s*\|\|\s*isSavingFieldProp\.value\s*\)\s*return/,
  )
})

test('cleared date format normalizes immediately and native swatches follow the save lock', () => {
  // 清空日期格式（Element Plus clearable 发 undefined）必须立即归一为类型默认，
  // 否则快照携带 undefined 与归一化候选快照比较会产生幻影 update_shared（DEC2）
  assert.match(
    formDesignerSource,
    /watch\(\s*\(\) => editProp\.date_format,[\s\S]*?normalizeDateFormat\(editProp\.field_type, value, DATE_FORMAT_OPTIONS, DEFAULT_DATE_FORMATS\)[\s\S]*?editProp\.date_format = normalized;/,
  )
  // 原生色块 <button> 不受 el-form :disabled 约束，保存/草稿请求期间必须单独禁用
  const swatchCount = (formDesignerSource.match(/:disabled="propEditorBusy"/g) || []).length
  assert.equal(swatchCount, 4, `property-form swatch groups must bind propEditorBusy, found ${swatchCount}`)
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

test('FormDesignerTab guards OID charset on form/field submit paths (option codes exempt)', () => {
  // req2：表单 OID / 字段 variable_name 保存前须做字符集校验并内联报错；
  // 内联字典选项 code 为自由文本（与标签一致），不再做字符集校验
  assert.match(
    formDesignerSource,
    /import \{ isValidOptionalOid, isValidRequiredOid, OID_ERROR \} from '..\/composables\/oidValidation'/,
    'should import the shared OID validators',
  )

  const addForm = functionBody('addForm')
  assert.match(addForm, /isValidOptionalOid\(newFormCode\.value\)/)
  assert.match(addForm, /ElMessage\.warning\(OID_ERROR\)/)

  // 表单编辑弹窗与设计器内联卡共用 persistFormProps；OID 校验集中在该共享路径
  const updateForm = functionBody('updateForm')
  assert.match(updateForm, /persistFormProps\(/)
  assert.match(updateForm, /code: editFormCode\.value/)
  const persistFormProps = functionBody('persistFormProps')
  assert.match(persistFormProps, /isValidOptionalOid\(code\)/)
  assert.match(persistFormProps, /ElMessage\.warning\(OID_ERROR\)/)

  const saveProp = functionBody('saveSelectedFieldProp')
  assert.match(saveProp, /!isValidRequiredOid\(snapshot\.variable_name\)/)
  assert.match(saveProp, /ElMessage\.warning\(OID_ERROR\)/)

  // 选项 code 自由文本（无 OID 校验）已随快捷字典弹窗迁入 CodelistQuickEditDialog（R3）；
  // 行为断言见 tests/component/CodelistQuickEditDialog.spec.js（自由编码用例），
  // 此处保留轻量守卫：共享弹窗不引入任何 OID 校验器。
  const quickEditDialogSource = readFileSync(
    path.resolve(currentDir, '../src/components/CodelistQuickEditDialog.vue'),
    'utf8',
  )
  assert.doesNotMatch(quickEditDialogSource, /isValidOptionalOid|isValidRequiredOid/)
})

test('log row property panel renders readonly hint and skips the fixed action bar', () => {
  // log 行只读：无取消/保存；普通字段与草稿共用固定底部动作栏（designer-editor-actions）
  const actionBarCount = (formDesignerSource.match(/class="designer-editor-actions"/g) || []).length
  assert.equal(actionBarCount, 1, 'designer-editor-actions must exist exactly once')

  const fieldEditorSection = formDesignerSource.match(
    /<div v-else class="designer-editor-scroll">([\s\S]*?)^ {12}<\/div>/m,
  )
  assert.ok(fieldEditorSection, 'field editor scroll section should exist')

  const [, fieldEditorBody] = fieldEditorSection
  assert.match(
    fieldEditorBody,
    /data-test="designer-log-property-readonly"/,
    'log row selection should render a readonly hint instead of an editable form',
  )
  assert.match(
    fieldEditorBody,
    /<template v-else>[\s\S]*?<el-form[\s\S]*data-test="designer-field-property-form"/,
    'normal field editor should live in the v-else template next to the log-row hint',
  )
  // log 行分支不渲染取消/保存（v-else-if="editProp.field_type !== '日志行'"）
  assert.match(
    formDesignerSource,
    /<template v-else-if="editProp\.field_type !== '日志行'"[\s\S]*data-test="designer-property-cancel"/,
  )
  assert.match(
    formDesignerSource,
    /data-test="designer-property-cancel"[\s\S]*:disabled="!isFieldPropDirty \|\| designerHistory\.busy\.value \|\| isSavingFieldProp"[\s\S]*@click="cancelSelectedFieldProp"/,
  )
  assert.match(
    formDesignerSource,
    /data-test="designer-property-save"[\s\S]*:loading="isSavingFieldProp"[\s\S]*:disabled="!isFieldPropDirty \|\| designerHistory\.busy\.value"[\s\S]*@click="saveSelectedFieldProp"/,
  )
})
