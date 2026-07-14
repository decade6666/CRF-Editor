import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { useDesignerHistory } from '../src/composables/useDesignerHistory.js'

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

function createRuntime({ api, fields = [], hasDraft = false, confirmDiscardDraft } = {}) {
  const recordHistory = useDesignerHistory()
  const formFields = { value: fields }
  const calls = { reloads: [], selected: [], errors: [], warnings: [], confirms: 0 }
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
    'selectedForm',
    'buildFormFieldCreatePayload',
    'api',
    'reloadAfterReplay',
    'formFields',
    'selectField',
    'buildDefinitionSnapshotFromResponse',
    'designerHistory',
    'ElMessage',
    'props',
    functionBody('copyFormField').replaceAll('hasDraft.value', 'hasDraftRef.value'),
  )
  assert.equal(copyFormField.length, 15, 'runtime copy function should receive its full dependency context')
  const snapshotBuilder = new Function('newFd', functionBody('buildDefinitionSnapshotFromResponse'))
  const copyingFieldIds = { value: new Set() }
  const context = [
    (ff) => ff?.__draft === true,
    { value: hasDraft },
    resolveDraftConfirmation,
    copyingFieldIds,
    { value: { id: 8 } },
    (ff) => ({
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
    }),
    api,
    async (formId, options) => {
      calls.reloads.push([formId, options])
      if (api.createdFormField) formFields.value = [api.createdFormField]
    },
    formFields,
    (field) => calls.selected.push(field.id),
    snapshotBuilder,
    recordHistory,
    {
      error: (message) => calls.errors.push(message),
      warning: (message) => calls.warnings.push(message),
    },
    { projectId: 5 },
  ]

  return {
    calls,
    copyingFieldIds,
    history: recordHistory,
    run: (ff) => copyFormField(ff, ...context),
  }
}

const regularField = {
  id: 20,
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
}

const copiedDefinition = {
  id: 101,
  variable_name: 'TEST_copy',
  label: '测试字段',
  field_type: '复选',
  integer_digits: null,
  decimal_digits: null,
  date_format: null,
  checkbox_label: '已确认',
  codelist_id: null,
  unit_id: 7,
  is_multi_record: 0,
  table_type: '固定行',
  order_index: 9,
}

test('字段列表复制按钮位于删除左侧，并连接草稿与行级锁保护', () => {
  const copyButtonStart = source.indexOf("v-if=\"!isDraftField(ff)\"", source.indexOf('designer-field-list'))
  const removeButtonStart = source.indexOf('@click.stop="removeField(ff)"', copyButtonStart)
  const copyButton = source.slice(copyButtonStart, removeButtonStart)

  assert.ok(copyButtonStart > -1, 'should render a non-draft copy button')
  assert.ok(removeButtonStart > copyButtonStart, 'copy button should precede delete')
  assert.match(copyButton, /:disabled="copyingFieldIds\.has\(ff\.id\)"/)
  assert.match(copyButton, /@click\.stop="copyFormField\(ff\)"/)
  assert.match(copyButton, /:aria-label="'复制 ' \+ getFormFieldDisplayLabel\(ff\)"/)
  assert.match(source, /const copyingFieldIds = ref\(new Set\(\)\)/)

  const body = functionBody('copyFormField')
  assert.match(body, /if \(isDraftField\(ff\)\) return;/)
  assert.match(body, /if \(hasDraft\.value\) \{[\s\S]*?await confirmDiscardDraft\(\)/)
  assert.match(body, /copyingFieldIds\.value\.has\(ff\.id\)/)
  assert.match(body, /order_index: \(ff\.order_index \?\? 0\) \+ 1/)
  assert.match(body, /\/api\/field-definitions\/\$\{ff\.field_definition_id\}\/copy/)
  assert.match(body, /designerHistory\.record\([\s\S]*?label: '复制字段'/)
})

test('复制普通字段按定义再实例顺序请求，选中新实例并保留完整定义快照', async () => {
  const calls = []
  const api = {
    createdFormField: { id: 201 },
    post: async (url, payload) => {
      calls.push([url, payload])
      if (url.includes('/copy')) return copiedDefinition
      return api.createdFormField
    },
    del: async () => {},
  }
  const runtime = createRuntime({ api })

  await runtime.run(regularField)

  assert.deepEqual(calls.map(([url]) => url), [
    '/api/field-definitions/10/copy',
    '/api/forms/8/fields',
  ])
  assert.equal(calls[1][1].field_definition_id, 101)
  assert.equal(calls[1][1].order_index, 5)
  assert.deepEqual(runtime.calls.reloads, [[8, { defs: true }]])
  assert.deepEqual(runtime.calls.selected, [201])
  assert.equal(runtime.history.undoStack.value[0].ids.fdId, 101)
  assert.equal(runtime.history.undoStack.value[0].ids.ffId, 201)
  assert.match(source, /function buildDefinitionSnapshotFromResponse\(newFd\) \{[\s\S]*?checkbox_label: newFd\.checkbox_label \?\? null[\s\S]*?order_index: null/)
})

test('草稿确认期间的快速双击仍只运行一条复制链路', async () => {
  let releaseDraftConfirmation
  let confirmCalls = 0
  const draftConfirmation = new Promise((resolve) => {
    releaseDraftConfirmation = resolve
  })
  const calls = []
  const api = {
    createdFormField: { id: 202 },
    post: async (url) => {
      calls.push(url)
      if (url.includes('/copy')) return copiedDefinition
      return api.createdFormField
    },
    del: async () => {},
  }
  const runtime = createRuntime({
    api,
    hasDraft: true,
    confirmDiscardDraft: async () => {
      confirmCalls += 1
      return await draftConfirmation
    },
  })

  const first = runtime.run(regularField)
  await Promise.resolve()
  await runtime.run(regularField)
  assert.equal(confirmCalls, 1)
  assert.equal(runtime.copyingFieldIds.value.size, 1)
  assert.deepEqual(calls, [])

  releaseDraftConfirmation(true)
  await first
  assert.deepEqual(calls, ['/api/field-definitions/10/copy', '/api/forms/8/fields'])
  assert.equal(runtime.copyingFieldIds.value.size, 0)
})

test('复制的撤销重做重建同名快照并映射 id，不会再次调用 copy endpoint', async () => {
  const calls = []
  let createCount = 0
  const api = {
    createdFormField: { id: 201 },
    post: async (url, payload) => {
      calls.push([url, payload])
      if (url.includes('/copy')) return copiedDefinition
      if (url === '/api/projects/5/field-definitions') {
        createCount += 1
        return { id: 101 + createCount, ...payload }
      }
      if (url === '/api/forms/8/fields') {
        api.createdFormField = { id: 201 + createCount }
        return api.createdFormField
      }
      throw new Error(`unexpected POST ${url}`)
    },
    del: async (url) => calls.push([url]),
  }
  const runtime = createRuntime({ api })

  await runtime.run(regularField)
  await runtime.history.undo()
  await runtime.history.redo()
  await runtime.history.undo()
  await runtime.history.redo()

  assert.equal(calls.filter(([url]) => url.includes('/copy')).length, 1)
  const recreatedDefinitions = calls.filter(([url]) => url === '/api/projects/5/field-definitions')
  assert.deepEqual(recreatedDefinitions.map(([, payload]) => payload.variable_name), ['TEST_copy', 'TEST_copy'])
  assert.ok(recreatedDefinitions.every(([, payload]) => payload.checkbox_label === '已确认'))
  assert.equal(runtime.history.undoStack.value[0].ids.fdId, 103)
  assert.equal(runtime.history.undoStack.value[0].ids.ffId, 203)
})

test('复制重做遇到已保留定义的 409 时复用原定义 id', async () => {
  const calls = []
  let formFieldId = 201
  const api = {
    createdFormField: { id: formFieldId },
    post: async (url, payload) => {
      calls.push([url, payload])
      if (url.includes('/copy')) return copiedDefinition
      if (url === '/api/projects/5/field-definitions') throw { status: 409 }
      if (url === '/api/forms/8/fields') {
        api.createdFormField = { id: formFieldId }
        formFieldId += 1
        return api.createdFormField
      }
      throw new Error(`unexpected POST ${url}`)
    },
    del: async (url) => {
      calls.push([url])
      if (url === '/api/field-definitions/101') throw { status: 409 }
    },
  }
  const runtime = createRuntime({ api })

  await runtime.run(regularField)
  await runtime.history.undo()
  await runtime.history.redo()

  assert.deepEqual(runtime.calls.warnings, ['字段定义已被其他表单引用，已保留定义'])
  assert.equal(calls.filter(([url]) => url === '/api/projects/5/field-definitions').length, 1)
  assert.equal(calls.at(-1)[1].field_definition_id, 101)
  assert.equal(runtime.history.undoStack.value[0].ids.fdId, 101)
  assert.equal(runtime.history.undoStack.value[0].ids.ffId, 202)
})

test('复制失败清理孤儿定义；日志行不复制定义；行级锁阻止双击', async () => {
  const failureCalls = []
  const failureApi = {
    post: async (url) => {
      failureCalls.push(url)
      if (url.includes('/copy')) return copiedDefinition
      throw new Error('实例创建失败')
    },
    del: async (url) => failureCalls.push(url),
  }
  const failureRuntime = createRuntime({ api: failureApi })
  await failureRuntime.run(regularField)
  assert.deepEqual(failureCalls, [
    '/api/field-definitions/10/copy',
    '/api/forms/8/fields',
    '/api/field-definitions/101',
  ])
  assert.deepEqual(failureRuntime.calls.errors, ['实例创建失败'])

  const logCalls = []
  const logApi = {
    createdFormField: { id: 301 },
    post: async (url, payload) => {
      logCalls.push([url, payload])
      return logApi.createdFormField
    },
    del: async () => {},
  }
  const logRuntime = createRuntime({ api: logApi })
  await logRuntime.run({ ...regularField, id: 21, field_definition_id: null, is_log_row: 1 })
  assert.deepEqual(logCalls.map(([url]) => url), ['/api/forms/8/fields'])
  assert.equal(logCalls[0][1].field_definition_id, null)

  let releaseCopy
  const pendingCopy = new Promise((resolve) => {
    releaseCopy = resolve
  })
  const debounceCalls = []
  const debounceApi = {
    createdFormField: { id: 401 },
    post: async (url) => {
      debounceCalls.push(url)
      if (url.includes('/copy')) return pendingCopy
      return debounceApi.createdFormField
    },
    del: async () => {},
  }
  const debounceRuntime = createRuntime({ api: debounceApi })
  const first = debounceRuntime.run(regularField)
  await Promise.resolve()
  await debounceRuntime.run(regularField)
  assert.deepEqual(debounceCalls, ['/api/field-definitions/10/copy'])
  releaseCopy(copiedDefinition)
  await first
  assert.equal(debounceRuntime.copyingFieldIds.value.size, 0)
})

test('复制重做在定义重建后建实例失败时清理本次重建的孤儿定义并继续抛错', async () => {
  const calls = []
  const instanceError = new Error('重做实例创建失败')
  let createFieldDefinitionCount = 0
  const api = {
    createdFormField: { id: 201 },
    post: async (url, payload) => {
      calls.push([url, payload])
      if (url.includes('/copy')) return copiedDefinition
      if (url === '/api/projects/5/field-definitions') {
        createFieldDefinitionCount += 1
        return { id: 500 + createFieldDefinitionCount, ...payload }
      }
      if (url === '/api/forms/8/fields') {
        if (createFieldDefinitionCount > 0) throw instanceError
        return api.createdFormField
      }
      throw new Error(`unexpected POST ${url}`)
    },
    del: async (url) => calls.push([url]),
  }
  const runtime = createRuntime({ api })

  await runtime.run(regularField)
  await runtime.history.undo()
  await assert.rejects(runtime.history.redo(), instanceError)

  assert.equal(calls.filter(([url]) => url === '/api/field-definitions/501').length, 1)
  assert.deepEqual(calls.at(-1), ['/api/field-definitions/501'])
})
