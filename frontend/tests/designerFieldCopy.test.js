import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { useDesignerHistory } from '../src/composables/useDesignerHistory.js'
import { buildCopyVariableName } from '../src/composables/fieldDefinitionAutocomplete.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.resolve(currentDir, '../src/components/FormDesignerTab.vue'), 'utf8')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

function functionBody(name) {
  const start = source.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `should locate ${name}`)
  const bodyStart = source.indexOf('{', start)
  let depth = 0
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') depth -= 1
    if (depth === 0) return source.slice(bodyStart + 1, index)
  }
  assert.fail(`${name} should have a complete body`)
}

function buildFormFieldCreatePayloadForTest(ff) {
  return {
    field_definition_id: ff.field_definition_id ?? null,
    is_log_row: ff.is_log_row ?? 0,
    order_index: ff.order_index ?? null,
    required: ff.required ?? 0,
    label_override: ff.label_override ?? null,
    help_text: ff.help_text ?? null,
    default_value: ff.default_value ?? null,
    inline_mark: ff.inline_mark ?? 0,
    bg_color: ff.bg_color ?? null,
    text_color: ff.text_color ?? null,
    label_bold: ff.label_bold ?? 1,
    label_font_size: ff.label_font_size ?? null,
  }
}

function buildCopyDraftFromSource(ff, definitions, formId) {
  const buildCopyDraft = new Function(
    'ff',
    'definitions',
    'formId',
    'DRAFT_FIELD_ID',
    'buildCopyVariableName',
    'buildFormFieldCreatePayload',
    functionBody('buildCopyDraft'),
  )
  return buildCopyDraft(
    ff,
    definitions,
    formId,
    '__draft__',
    buildCopyVariableName,
    buildFormFieldCreatePayloadForTest,
  )
}

function createRuntime({ api, fields = [], fieldDefs = [], hasDraft = false, confirmDiscardDraft, isReordering = false } = {}) {
  api = { invalidateCache: () => {}, ...api }
  const recordHistory = useDesignerHistory()
  const formFields = { value: fields }
  const fieldDefinitions = { value: fieldDefs }
  const calls = {
    reloads: [],
    selected: [],
    errors: [],
    warnings: [],
    confirms: 0,
    membershipBegins: 0,
    membershipEnds: 0,
  }
  const resolveDraftConfirmation =
    confirmDiscardDraft ||
    (async () => {
      calls.confirms += 1
      return true
    })
  const copyFormField = new AsyncFunction(
    'ff',
    'isDraftField',
    'hasDraftRef',
    'confirmDiscardDraft',
    'copyingFieldIds',
    'isReordering',
    'resolveFieldPropLeave',
    'selectedFieldId',
    'resolveFormPropLeave',
    'captureDesignerHistoryContext',
    'isCurrentDesignerHistoryContext',
    'fieldDefs',
    'buildCopyDraft',
    'formFields',
    'selectField',
    'buildFormFieldCreatePayload',
    'api',
    'reloadAfterReplay',
    'beginFieldMembershipMutation',
    'endFieldMembershipMutation',
    'recordDesignerHistory',
    'designerHistory',
    'ElMessage',
    functionBody('copyFormField').replaceAll('hasDraft.value', 'hasDraftRef.value'),
  )
  assert.equal(copyFormField.length, 23, 'runtime copy function should receive its full dependency context')
  const copyingFieldIds = { value: new Set() }
  const context = [
    (ff) => ff?.__draft === true || ff?.id === '__draft__',
    { value: hasDraft },
    resolveDraftConfirmation,
    copyingFieldIds,
    { value: isReordering },
    async () => true,
    { value: 20 },
    async () => true,
    () => ({ formId: 8, sessionId: 0 }),
    (historyContext) => historyContext?.formId === 8 && historyContext?.sessionId === 0,
    fieldDefinitions,
    (ff, definitions, formId) => buildCopyDraftFromSource(ff, definitions, formId),
    formFields,
    (field) => calls.selected.push(field.id),
    buildFormFieldCreatePayloadForTest,
    api,
    async (formId, options) => {
      calls.reloads.push([formId, options])
      if (api.createdFormField) formFields.value = [api.createdFormField]
    },
    () => {
      calls.membershipBegins += 1
    },
    () => {
      calls.membershipEnds += 1
    },
    (historyContext, entry) => (historyContext?.formId === 8 ? recordHistory.record(entry) : false),
    recordHistory,
    {
      error: (message) => calls.errors.push(message),
      warning: (message) => calls.warnings.push(message),
    },
  ]

  return {
    calls,
    formFields,
    copyingFieldIds,
    history: recordHistory,
    run: (ff) => copyFormField(ff, ...context),
  }
}

const regularField = {
  id: 20,
  form_id: 8,
  field_definition_id: 10,
  is_log_row: 0,
  order_index: 4,
  required: 1,
  label_override: '显示名称',
  help_text: '提示',
  default_value: '默认值',
  inline_mark: 1,
  bg_color: 'FFFFFF',
  text_color: '000000',
  label_bold: 0,
  label_font_size: 'small',
  field_definition: {
    id: 10,
    variable_name: 'TEST',
    label: '测试字段',
    field_type: '复选',
    integer_digits: null,
    decimal_digits: null,
    date_format: null,
    checkbox_label: '已确认',
    codelist_id: null,
    unit_id: 7,
    is_multi_record: 1,
    table_type: '动态行',
    codelist: { options: [{ code: 'Y', decode: '是' }] },
    unit: { symbol: 'kg' },
  },
}

const logField = {
  ...regularField,
  id: 21,
  field_definition_id: null,
  is_log_row: 1,
  field_definition: null,
}

test('字段列表复制按钮位于删除左侧，并保留草稿与行级锁保护', () => {
  const copyButtonStart = source.indexOf('v-if="!isDraftField(ff)"', source.indexOf('designer-field-list'))
  const removeButtonStart = source.indexOf('@click.stop="removeField(ff)"', copyButtonStart)
  const copyButton = source.slice(copyButtonStart, removeButtonStart)

  assert.ok(copyButtonStart > -1, 'should render a non-draft copy button')
  assert.ok(removeButtonStart > copyButtonStart, 'copy button should precede delete')
  assert.match(copyButton, /:disabled="copyingFieldIds\.has\(ff\.id\) \|\| designerHistory\.busy\.value"/)
  assert.match(copyButton, /@click\.stop="copyFormField\(ff\)"/)
  assert.match(copyButton, /:aria-label="'复制 ' \+ getFormFieldDisplayLabel\(ff\)"/)
  assert.match(source, /const copyingFieldIds = ref\(new Set\(\)\)/)

  const body = functionBody('copyFormField')
  assert.match(body, /if \(isDraftField\(ff\)\) return;/)
  assert.match(body, /if \(designerHistory\.busy\.value \|\| isReordering\.value\) return;/)
  assert.match(body, /if \(copyingFieldIds\.value\.has\(ff\.id\)\) return;/)
  assert.match(body, /if \(hasDraft\.value\) \{[\s\S]*?await confirmDiscardDraft\(\)/)
  assert.match(body, /if \(!isLogRow\) \{[\s\S]*?buildCopyDraft\(/)
  assert.match(body, /if \(isReordering\.value \|\| !isCurrentDesignerHistoryContext\(historyContext\)\) return;/)
  assert.match(body, /createdFormField = await api\.post\([\s\S]*?field_definition_id: null/)
})

test('buildCopyDraft copies complete definition and instance state while using a local OID', () => {
  const draft = buildCopyDraftFromSource(regularField, [{ variable_name: 'TEST' }], 8)

  assert.equal(draft.id, '__draft__')
  assert.equal(draft.__draft, true)
  assert.equal(draft.__draftOrigin, 'copy')
  assert.equal(draft.__draftOrderIndex, 5)
  assert.equal(draft.order_index, 4.5)
  assert.equal(draft.form_id, 8)
  assert.equal(draft.field_definition_id, null)
  assert.equal(draft.is_log_row, 0)
  assert.equal(draft.required, regularField.required)
  assert.equal(draft.label_override, regularField.label_override)
  assert.equal(draft.default_value, regularField.default_value)
  assert.equal(draft.inline_mark, regularField.inline_mark)
  assert.equal(draft.field_definition.variable_name, 'TEST_copy')
  assert.equal(draft.field_definition.checkbox_label, '已确认')
  assert.equal(draft.field_definition.is_multi_record, 1)
  assert.equal(draft.field_definition.table_type, '动态行')
  assert.deepEqual(draft.field_definition.codelist, regularField.field_definition.codelist)
  assert.notEqual(draft.field_definition, regularField.field_definition)
})

test('复制普通字段只创建本地草稿，不发请求、不入撤销栈，并立即选中草稿', async () => {
  const requests = []
  const runtime = createRuntime({
    fields: [regularField],
    fieldDefs: [
      { variable_name: 'TEST' },
      { variable_name: 'TEST_copy', field_type: '标签' },
    ],
    api: {
      post: async (...args) => {
        requests.push(args)
        throw new Error('regular field copy must stay local')
      },
    },
  })

  await runtime.run(regularField)

  assert.deepEqual(requests, [])
  assert.deepEqual(runtime.calls.reloads, [])
  assert.equal(runtime.calls.membershipBegins, 0)
  assert.equal(runtime.calls.membershipEnds, 0)
  assert.equal(runtime.history.undoStack.value.length, 0)
  assert.deepEqual(runtime.calls.selected, ['__draft__'])
  const draft = runtime.formFields.value.find((field) => field.__draft)
  assert.equal(draft.field_definition.variable_name, 'TEST_copy1')
  assert.equal(draft.order_index, 4.5)
  assert.equal(draft.__draftOrderIndex, 5)
})

test('草稿确认期间的快速双击仍只创建一条本地复制草稿', async () => {
  let releaseDraftConfirmation
  let confirmCalls = 0
  const draftConfirmation = new Promise((resolve) => {
    releaseDraftConfirmation = resolve
  })
  const runtime = createRuntime({
    fields: [regularField],
    fieldDefs: [{ variable_name: 'TEST' }],
    hasDraft: true,
    confirmDiscardDraft: async () => {
      confirmCalls += 1
      return await draftConfirmation
    },
    api: {
      post: async () => {
        throw new Error('regular field copy must stay local')
      },
    },
  })

  const first = runtime.run(regularField)
  await Promise.resolve()
  await runtime.run(regularField)
  assert.equal(confirmCalls, 1)
  assert.equal(runtime.copyingFieldIds.value.size, 1)

  releaseDraftConfirmation(true)
  await first
  assert.equal(runtime.copyingFieldIds.value.size, 0)
  assert.equal(runtime.formFields.value.filter((field) => field.__draft).length, 1)
})

test('字段复制在排序持久化进行中直接返回，不会创建草稿或发请求', async () => {
  const runtime = createRuntime({ fields: [regularField], isReordering: true })

  await runtime.run(regularField)

  assert.deepEqual(runtime.formFields.value, [regularField])
  assert.deepEqual(runtime.calls.reloads, [])
  assert.equal(runtime.history.undoStack.value.length, 0)
})

test('复制日志行仍立即创建实例并记录可撤销历史', async () => {
  const calls = []
  const api = {
    createdFormField: { id: 301 },
    post: async (url, payload) => {
      calls.push([url, payload])
      return api.createdFormField
    },
    del: async (url) => calls.push([url]),
  }
  const runtime = createRuntime({ api, fields: [logField] })

  await runtime.run(logField)

  assert.deepEqual(calls.map(([url]) => url), ['/api/forms/8/fields'])
  assert.equal(calls[0][1].field_definition_id, null)
  assert.deepEqual(runtime.calls.reloads, [[8, { defs: false }]])
  assert.deepEqual(runtime.calls.selected, [301])
  assert.equal(runtime.history.undoStack.value.length, 1)
  assert.equal(runtime.history.undoStack.value[0].label, '复制字段')
  assert.equal(runtime.history.undoStack.value[0].ids.fdId, null)
})

test('日志行复制的行级锁在立即保存请求期间阻止第二次点击', async () => {
  let releasePost
  const pendingPost = new Promise((resolve) => {
    releasePost = resolve
  })
  const calls = []
  const api = {
    post: async (url) => {
      calls.push(url)
      return await pendingPost
    },
    invalidateCache: () => {},
  }
  const runtime = createRuntime({ api, fields: [logField] })
  const first = runtime.run(logField)
  await Promise.resolve()
  await runtime.run(logField)
  assert.deepEqual(calls, ['/api/forms/8/fields'])

  releasePost({ id: 302 })
  await first
  assert.equal(runtime.copyingFieldIds.value.size, 0)
})

test('regular copy branch never calls the field-definition copy endpoint', () => {
  const body = functionBody('copyFormField')
  const regularBranch = body.slice(body.indexOf('if (!isLogRow)'), body.indexOf('const baseInstancePayload'))

  assert.match(regularBranch, /buildCopyDraft\(currentField, fieldDefs\.value, formId\)/)
  assert.match(regularBranch, /formFields\.value = \[\.\.\.formFields\.value, draft\]/)
  assert.match(regularBranch, /selectField\(draft\)/)
  assert.doesNotMatch(regularBranch, /api\.post\(/)
  assert.doesNotMatch(body, /\/api\/field-definitions\/\$\{ff\.field_definition_id\}\/copy/)
})
