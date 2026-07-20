import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildFormPropState, sameFormPropState } from '../src/composables/formDesignerPropertyEditor.js'

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

test('buildFormPropState defaults empty form fields and orientation', () => {
  assert.deepEqual(buildFormPropState(null), { name: '', code: '', paper_orientation: 'auto' })
  assert.deepEqual(buildFormPropState({ name: '禁食记录', code: 'FAST', paper_orientation: 'landscape' }), {
    name: '禁食记录',
    code: 'FAST',
    paper_orientation: 'landscape',
  })
  assert.deepEqual(buildFormPropState({ name: 'X', code: null }), {
    name: 'X',
    code: '',
    paper_orientation: 'auto',
  })
})

test('sameFormPropState compares the three editable form fields', () => {
  const a = { name: 'A', code: 'C1', paper_orientation: 'auto' }
  assert.equal(sameFormPropState(a, { ...a }), true)
  assert.equal(sameFormPropState(a, { ...a, name: 'B' }), false)
  assert.equal(sameFormPropState(a, { ...a, code: 'C2' }), false)
  assert.equal(sameFormPropState(a, { ...a, paper_orientation: 'portrait' }), false)
  assert.equal(sameFormPropState(null, a), false)
})

test('designer header exposes a controlled form-switch select bound to filteredForms', () => {
  assert.match(
    formDesignerSource,
    /data-test="designer-form-switch"[\s\S]*:model-value="selectedForm\?\.id(?: \?\? undefined)?"[\s\S]*@change="onSwitchFormFromDropdown"/,
  )
  assert.match(formDesignerSource, /v-for="f in orderedForms"[\s\S]*:value="f\.id"/)
  assert.match(formDesignerSource, /设计：/)
  assert.doesNotMatch(
    formDesignerSource,
    /designer-dialog-title">设计：\{\{ selectedForm\?\.name/,
  )
  // 全屏下拉必须用全量有序列表，不能复用左侧 searchForm 过滤结果
  assert.doesNotMatch(
    formDesignerSource,
    /data-test="designer-form-switch"[\s\S]*v-for="f in filteredForms"/,
  )
})

test('onSwitchFormFromDropdown routes through selectForm and resyncs the left table', () => {
  const body = functionBody('onSwitchFormFromDropdown')
  // 兼容 el-select 抛出 string id
  assert.match(body, /Number\(formId\)|typeof formId === 'number'/)
  assert.match(body, /forms\.value\.find/)
  assert.match(body, /await selectForm\(next\)/)
  assert.match(body, /formsTableRef\.value\?\.setCurrentRow/)
  assert.doesNotMatch(body, /selectedForm\.value\s*=/)
})

test('onFormsTableCurrentChange filters null and same-id el-table echoes before selectForm', () => {
  // el-table @current-change 在 filteredForms 重算 / setCurrentRow 后会以「当前已选行」回显，
  // 若直接透传 selectForm，同 id 分支的 formSelectionAttempt++ 会作废在途的下拉切换，
  // 导致「选项没有变化，也无法切换表单」。wrapper 必须过滤 null 与同 id 回显。
  assert.match(formDesignerSource, /@current-change="onFormsTableCurrentChange"/)
  assert.doesNotMatch(formDesignerSource, /@current-change="selectForm"/)
  const body = functionBody('onFormsTableCurrentChange')
  assert.match(body, /if \(!row\) return/)
  assert.match(body, /\(row\.id \?\? null\) === \(selectedForm\.value\?\.id \?\? null\)[\s\S]*return/)
  assert.match(body, /return selectForm\(row\)/)
})

test('form property editor exposes dirty state, save/cancel, and leave guard', () => {
  assert.match(formDesignerSource, /const editFormProp = reactive\(\{[\s\S]*paper_orientation:/)
  assert.match(formDesignerSource, /const formPropBaseline = ref\(null\)/)
  assert.match(formDesignerSource, /const isFormPropDirty = computed/)
  assert.match(formDesignerSource, /function syncFormPropEditor\(/)
  assert.match(formDesignerSource, /async function saveFormProp\(/)
  assert.match(formDesignerSource, /function cancelFormProp\(/)
  assert.match(formDesignerSource, /async function resolveFormPropLeave\(/)
  assert.match(formDesignerSource, /async function persistFormProps\(/)
  assert.match(formDesignerSource, /buildFormPropState|sameFormPropState/)
})

test('side pane renders form properties when no field is selected', () => {
  assert.match(
    formDesignerSource,
    /v-if="!selectedFieldId"[\s\S]*data-test="designer-form-property-form"/,
  )
  assert.match(formDesignerSource, /data-test="designer-form-property-save"/)
  assert.match(formDesignerSource, /data-test="designer-form-property-cancel"/)
  assert.match(formDesignerSource, /data-test="designer-form-paper-orientation"/)
  assert.match(formDesignerSource, /v-model="editFormProp\.name"/)
  assert.match(formDesignerSource, /v-model="editFormProp\.code"/)
  assert.match(formDesignerSource, /v-model="editFormProp\.paper_orientation"/)
  // OID only in full edit mode (parity with edit dialog)
  assert.match(
    formDesignerSource,
    /data-test="designer-form-property-form"[\s\S]*v-if="editMode"[\s\S]*editFormProp\.code/,
  )
  assert.doesNotMatch(
    formDesignerSource,
    /v-if="!selectedFieldId"[\s\S]*← 选择字段/,
  )
})

test('persistFormProps validates OID, warns on orientation, and PUTs three fields', () => {
  const body = functionBody('persistFormProps')
  assert.match(body, /isValidOptionalOid\(/)
  assert.match(body, /ElMessage\.warning\(OID_ERROR\)/)
  assert.match(body, /\/api\/forms\/\$\{[^}]+\}/)
  assert.match(body, /paper_orientation === 'portrait'/)
  assert.match(body, /needsLandscape\.value/)
  assert.match(body, /api\.put\(`\/api\/forms\/\$\{targetForm\.id\}`, \{[\s\S]*name,[\s\S]*code,[\s\S]*paper_orientation,[\s\S]*\}\)/)
  assert.match(body, /reloadForms\(\)/)
})

test('updateForm and saveFormProp share persistFormProps', () => {
  const updateBody = functionBody('updateForm')
  const saveBody = functionBody('saveFormProp')
  assert.match(updateBody, /persistFormProps\(/)
  assert.match(saveBody, /persistFormProps\(/)
  assert.match(saveBody, /editFormProp\.name/)
  assert.match(updateBody, /editFormName\.value/)
})

test('selectForm and resolveDesignerLeave chain form prop leave after field prop leave', () => {
  const selectBody = functionBody('selectForm')
  assert.match(selectBody, /resolveFieldPropLeave\(/)
  assert.match(selectBody, /resolveFormPropLeave\(/)
  // field leave must appear before form leave
  const fieldIdx = selectBody.indexOf('resolveFieldPropLeave')
  const formIdx = selectBody.indexOf('resolveFormPropLeave')
  assert.ok(fieldIdx >= 0 && formIdx > fieldIdx, 'field leave before form leave in selectForm')

  const leaveBody = functionBody('resolveDesignerLeave')
  assert.match(leaveBody, /resolveFieldPropLeave\(/)
  assert.match(leaveBody, /resolveFormPropLeave\(/)
  assert.ok(
    leaveBody.indexOf('resolveFieldPropLeave') < leaveBody.indexOf('resolveFormPropLeave'),
    'field leave before form leave in resolveDesignerLeave',
  )
})

test('handleDesignerBeforeClose also guards dirty form props', () => {
  const body = functionBody('handleDesignerBeforeClose')
  assert.match(body, /resolveFieldPropLeave\(/)
  assert.match(body, /resolveFormPropLeave\(/)
})

test('canvas blank click clears field selection without stopping field-row clicks', () => {
  assert.match(
    formDesignerSource,
    /class="fd-canvas-list designer-field-list"[\s\S]*@click="onCanvasBlankClick"/,
  )
  const body = functionBody('onCanvasBlankClick')
  assert.match(body, /closest\?\.\(['"]\.ff-item['"]\)/)
  assert.match(body, /resolveFieldPropLeave\(/)
  assert.match(body, /selectedFieldId|resetFieldPropAutoSaveState/)
  assert.doesNotMatch(body, /stopPropagation/)
})

test('resolveFormPropLeave uses three-state save/discard/cancel semantics', () => {
  const body = functionBody('resolveFormPropLeave')
  assert.match(body, /isFormPropDirty\.value/)
  assert.match(body, /confirmButtonText:\s*'保存'/)
  assert.match(body, /cancelButtonText:\s*'取消'/)
  assert.match(body, /distinguishCancelAndClose:\s*true/)
  assert.match(body, /saveFormProp\(/)
  assert.match(body, /cancelFormProp\(/)
})

test('newField and copyFormField guard dirty form props before selectField', () => {
  // H1 回归：从表单属性视图新建/复制字段会 selectField，必须先 resolveFormPropLeave
  const newBody = functionBody('newField')
  assert.match(newBody, /resolveFieldPropLeave\(/)
  assert.match(newBody, /resolveFormPropLeave\(/)
  assert.match(newBody, /selectField\(/)
  assert.ok(
    newBody.indexOf('resolveFormPropLeave') < newBody.indexOf('selectField'),
    'form leave before selectField in newField',
  )

  const copyBody = functionBody('copyFormField')
  assert.match(copyBody, /resolveFieldPropLeave\(/)
  assert.match(copyBody, /resolveFormPropLeave\(/)
  assert.match(copyBody, /selectField\(/)
  assert.ok(
    copyBody.indexOf('resolveFormPropLeave') < copyBody.indexOf('selectField'),
    'form leave before selectField in copyFormField',
  )
})

test('projectId watch guards form props after field props', () => {
  // M1：projectId 变更时不能只挡字段属性
  assert.match(
    formDesignerSource,
    /watch\(\s*\(\)\s*=>\s*props\.projectId,[\s\S]*resolveFieldPropLeave\([\s\S]*resolveFormPropLeave\([\s\S]*selectedForm\.value\s*=\s*null/,
  )
  const watchBlock = /watch\(\s*\(\)\s*=>\s*props\.projectId,[\s\S]*?selectedForm\.value\s*=\s*null/.exec(
    formDesignerSource,
  )?.[0]
  assert.ok(watchBlock, 'should locate projectId watch leave block')
  assert.ok(
    watchBlock.indexOf('resolveFieldPropLeave') < watchBlock.indexOf('resolveFormPropLeave'),
    'field leave before form leave in projectId watch',
  )
})

test('saveFormProp is blocked while reordering or draft-saving', () => {
  const body = functionBody('saveFormProp')
  assert.match(body, /isReordering\.value/)
  assert.match(body, /savingDraft\.value/)
})
