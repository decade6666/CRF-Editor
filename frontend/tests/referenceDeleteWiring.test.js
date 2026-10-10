import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { truncRefs } from '../src/composables/useApi.js'
import { formatFieldImpactMessage } from '../src/composables/fieldReferenceImpact.js'
import {
  buildPartialDeleteMessage,
  confirmReferenceAwareBatchDelete,
  formatFieldReference,
  showReferenceBlockedAlert,
} from '../src/composables/referenceDeleteGuard.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const codelistsSource = readFileSync(path.resolve(currentDir, '../src/components/CodelistsTab.vue'), 'utf8')
const unitsSource = readFileSync(path.resolve(currentDir, '../src/components/UnitsTab.vue'), 'utf8')
const fieldsSource = readFileSync(path.resolve(currentDir, '../src/components/FieldsTab.vue'), 'utf8')
const designerSource = readFileSync(path.resolve(currentDir, '../src/components/FormDesignerTab.vue'), 'utf8')
const mainCss = readFileSync(path.resolve(currentDir, '../src/styles/main.css'), 'utf8')

function getFunctionBody(source, functionName) {
  const marker = `async function ${functionName}`
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, `${functionName} should exist`)
  const nextFunction = source.indexOf('\nasync function ', start + marker.length)
  const nextSyncFunction = source.indexOf('\nfunction ', start + marker.length)
  const candidates = [nextFunction, nextSyncFunction].filter((index) => index !== -1)
  const end = candidates.length ? Math.min(...candidates) : source.length
  return source.slice(start, end)
}

// 提取单个顶层 async 函数的完整源码（以首个行首 "}" 为结束边界），供运行时 harness 求值
function extractFunctionSource(source, functionName) {
  const marker = `async function ${functionName}(`
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, `${functionName} should exist`)
  const end = source.indexOf('\n}', start)
  assert.notEqual(end, -1, `${functionName} should have a top-level closing brace`)
  return source.slice(start, end + 2)
}

// 用注入的假依赖求值真实的删除处理函数源码（弹窗 / API / 提示全部可控）
function buildHandler(fnSource, functionName, sandbox) {
  const keys = Object.keys(sandbox)
  const factory = new Function(...keys, `${fnSource}\nreturn ${functionName};`)
  return factory(...keys.map((key) => sandbox[key]))
}

function createSingleDeleteSandbox({ alertImpl, refs, confirmImpl } = {}) {
  const state = { errorToasts: [], delCalls: 0, delUrls: [], confirmCalls: 0, alertCalls: 0 }
  const sandbox = {
    api: {
      get: async () =>
        refs === undefined ? [{ form_name: '筛选表', form_code: 'SCR', field_label: '体重', field_var: 'WT' }] : refs,
      del: async (url) => {
        state.delCalls += 1
        state.delUrls.push(url)
      },
      post: async () => {
        throw new Error('batch API should not be called from single delete')
      },
    },
    ElMessageBox: {
      alert: () => {
        state.alertCalls += 1
        return alertImpl()
      },
      confirm: () => {
        state.confirmCalls += 1
        return confirmImpl ? confirmImpl() : Promise.resolve('confirm')
      },
    },
    ElMessage: {
      error: (msg) => {
        state.errorToasts.push(msg)
      },
      success: () => {},
      warning: () => {},
    },
    props: { projectId: 1 },
    selected: { value: null },
    selectedUnitId: { value: null },
    selectedFieldId: { value: null },
    selectedForm: { value: null },
    formFields: { value: [] },
    truncRefs,
    formatFieldReference,
    formatFieldImpactMessage,
    showReferenceBlockedAlert,
    reload: () => {},
    reloadUnits: async () => {},
    reloadFields: () => {},
    reloadForms: () => {},
    clearUnitSelection: () => {},
    clearSelection: () => {},
    invalidateFormSelectionSession: () => {},
  }
  return { sandbox, state }
}

function createBatchDeleteSandbox({
  selectionName,
  items,
  deletedCount = 0,
  blockedIds = [items[0].id],
  selectedId = 2,
  confirmImpl,
  batchDeleteError,
} = {}) {
  const selection = { value: items }
  const selected = { value: { id: selectedId } }
  const selectedUnitId = { value: selectedId }
  const selectedFieldId = { value: selectedId }
  const selectedForm = { value: { id: selectedId } }
  const formFields = { value: [{ id: 21 }] }
  const state = {
    postCalls: [],
    successToasts: [],
    errorToasts: [],
    confirmCalls: 0,
    alertCalls: 0,
    clearCalls: 0,
    invalidations: 0,
  }
  const refsMap = {}
  for (const id of blockedIds) {
    refsMap[id] = [{ form_name: '筛选表', form_code: 'SCR', field_label: '体重', field_var: 'WT', visit_name: '访视一' }]
  }
  const sandbox = {
    api: {
      post: async (url, body) => {
        state.postCalls.push({ url, body })
        if (url.includes('/batch-references')) return refsMap
        if (url.includes('/batch-delete')) {
          if (batchDeleteError) throw batchDeleteError
          return { deleted: deletedCount }
        }
        throw new Error(`unexpected POST ${url}`)
      },
    },
    ElMessageBox: {
      confirm: async () => {
        state.confirmCalls += 1
        return confirmImpl ? confirmImpl() : 'confirm'
      },
      alert: async () => {
        state.alertCalls += 1
      },
    },
    ElMessage: {
      success: (message) => state.successToasts.push(message),
      error: (message) => state.errorToasts.push(message),
      warning: () => {},
    },
    props: { projectId: 1 },
    [selectionName]: selection,
    selected,
    selectedUnitId,
    selectedFieldId,
    selectedForm,
    formFields,
    truncRefs,
    formatFieldReference,
    formatFieldImpactMessage,
    confirmReferenceAwareBatchDelete,
    buildPartialDeleteMessage,
    reload: () => {},
    reloadUnits: async () => {},
    reloadFields: () => {},
    reloadForms: () => {},
    clearUnitSelection: () => {
      state.clearCalls += 1
      selectedUnitId.value = null
    },
    clearSelection: () => {
      state.clearCalls += 1
      selectedFieldId.value = null
    },
    invalidateFormSelectionSession: () => {
      state.invalidations += 1
    },
  }
  return { sandbox, state, selection, selected, selectedUnitId, selectedFieldId, selectedForm, formFields }
}

const singleDeleteCases = [
  ['CodelistsTab', codelistsSource, 'delCl', { id: 11, name: '字典A' }, '/api/projects/1/codelists/11'],
  ['UnitsTab', unitsSource, 'del', { id: 12, symbol: 'kg' }, '/api/units/12'],
  ['FieldsTab', fieldsSource, 'del', { id: 13, label: '体重' }, '/api/field-definitions/13'],
  ['FormDesignerTab', designerSource, 'delForm', { id: 14, name: '筛选表' }, '/api/forms/14'],
]

const batchDeleteItems = [
  { id: 1, name: '已引用字典', symbol: '已引用单位', label: '已引用字段' },
  { id: 2, name: '字典A', symbol: 'kg', label: '体重' },
  { id: 3, name: '字典B', symbol: 'cm', label: '身高' },
]
const batchDeleteCases = [
  ['CodelistsTab', codelistsSource, 'batchDelCl', 'selCls', '字典'],
  ['UnitsTab', unitsSource, 'batchDelUnits', 'selUnits', '单位'],
  ['FieldsTab', fieldsSource, 'batchDelFields', 'selFields', '字段'],
  ['FormDesignerTab', designerSource, 'batchDelForms', 'selForms', '表单'],
]

test('all four components import the shared reference delete guard helpers', () => {
  for (const [source, name] of [
    [codelistsSource, 'CodelistsTab'],
    [unitsSource, 'UnitsTab'],
    [fieldsSource, 'FieldsTab'],
    [designerSource, 'FormDesignerTab'],
  ]) {
    assert.match(source, /from ['"]\.\.\/composables\/referenceDeleteGuard['"]/, `${name} should import referenceDeleteGuard`)
  }
})

test('codelist single delete checks unplaced-aware references before confirming', () => {
  const body = getFunctionBody(codelistsSource, 'delCl')
  assert.match(body, /codelists\/\$\{c\.id\}\/references\?include_unplaced=true/)
  assert.match(body, /该字典被以下字段引用，需先解除相关字段的引用：/)
  assert.match(body, /truncRefs\(refs\.map\(formatFieldReference\)\)/)
  assert.ok(body.indexOf('showReferenceBlockedAlert(ElMessageBox') < body.indexOf('ElMessageBox.confirm('))
  assert.ok(body.indexOf('showReferenceBlockedAlert(ElMessageBox') < body.indexOf('api.del'))
})

test('unit single delete checks unplaced-aware references before confirming', () => {
  const body = getFunctionBody(unitsSource, 'del')
  assert.match(body, /\/api\/units\/\$\{u\.id\}\/references\?include_unplaced=true/)
  assert.match(body, /该单位被以下字段引用，需先解除相关字段的引用：/)
  assert.match(body, /truncRefs\(refs\.map\(formatFieldReference\)\)/)
  assert.ok(body.indexOf('showReferenceBlockedAlert(ElMessageBox') < body.indexOf('ElMessageBox.confirm('))
  assert.ok(body.indexOf('showReferenceBlockedAlert(ElMessageBox') < body.indexOf('api.del'))
})

test('field single delete blocks on any reference with the new message', () => {
  const body = getFunctionBody(fieldsSource, 'del')
  assert.match(body, /const refs = await api\.get\(`\/api\/field-definitions\/\$\{f\.id\}\/references`\)/)
  assert.match(body, /if \(refs\.length\)/)
  assert.match(body, /该字段被以下表单引用，需先从相关表单中移除该字段：/)
  assert.match(body, /formatFieldImpactMessage\(refs, \{ max: 5, sep: '\\n' \}\)/)
  assert.ok(body.indexOf('showReferenceBlockedAlert(ElMessageBox') < body.indexOf('ElMessageBox.confirm('))
  assert.ok(body.indexOf('showReferenceBlockedAlert(ElMessageBox') < body.indexOf('api.del'))
  assert.doesNotMatch(body, /将同时删除/)
})

test('form single delete blocks on any visit reference with the new message', () => {
  const body = getFunctionBody(designerSource, 'delForm')
  assert.match(body, /const refs = await api\.get\(`\/api\/forms\/\$\{f\.id\}\/references`\)/)
  assert.match(body, /if \(refs\.length\)/)
  assert.match(body, /该表单被以下访视引用，需先从相关访视中移除该表单：/)
  assert.match(body, /truncRefs\(\s*refs\.map\(\(r\) => r\.visit_name\),\s*5,\s*'\\n',?\s*\)/)
  assert.ok(body.indexOf('showReferenceBlockedAlert(ElMessageBox') < body.indexOf('ElMessageBox.confirm('))
  assert.ok(body.indexOf('showReferenceBlockedAlert(ElMessageBox') < body.indexOf('api.del'))
  assert.doesNotMatch(body, /将同时从/)
})

test('codelist batch delete groups items through the shared helper before batch-delete', () => {
  const body = getFunctionBody(codelistsSource, 'batchDelCl')
  assert.match(body, /codelists\/batch-references\?include_unplaced=true/)
  assert.match(body, /confirmReferenceAwareBatchDelete\(ElMessageBox/)
  assert.match(body, /noun: '字典'/)
  assert.match(body, /nameOf: \(c\) => c\.name/)
  assert.match(body, /truncRefs\(refs\.map\(formatFieldReference\), 3, '、'\)/)
  assert.match(body, /ids: deleteIds/)
  assert.match(body, /const \{ deleted \} = await api\.post/)
  assert.match(body, /buildPartialDeleteMessage\('字典', deleted, items\.length - toDelete\.length\)/)
  assert.ok(body.indexOf('confirmReferenceAwareBatchDelete(ElMessageBox') < body.indexOf('batch-delete'))
})

test('unit batch delete groups items through the shared helper before batch-delete', () => {
  const body = getFunctionBody(unitsSource, 'batchDelUnits')
  assert.match(body, /units\/batch-references\?include_unplaced=true/)
  assert.match(body, /confirmReferenceAwareBatchDelete\(ElMessageBox/)
  assert.match(body, /noun: '单位'/)
  assert.match(body, /nameOf: \(u\) => u\.symbol/)
  assert.match(body, /truncRefs\(refs\.map\(formatFieldReference\), 3, '、'\)/)
  assert.match(body, /ids: deleteIds/)
  assert.match(body, /const \{ deleted \} = await api\.post/)
  assert.match(body, /buildPartialDeleteMessage\('单位', deleted, items\.length - toDelete\.length\)/)
  assert.ok(body.indexOf('confirmReferenceAwareBatchDelete(ElMessageBox') < body.indexOf('batch-delete'))
})

test('field batch delete groups items through the shared helper before batch-delete', () => {
  const body = getFunctionBody(fieldsSource, 'batchDelFields')
  assert.match(body, /field-definitions\/batch-references/)
  assert.match(body, /confirmReferenceAwareBatchDelete\(ElMessageBox/)
  assert.match(body, /noun: '字段'/)
  assert.match(body, /nameOf: \(f\) => f\.label/)
  assert.match(body, /formatFieldImpactMessage\(refs, \{ max: 3, sep: '、' \}\)/)
  assert.match(body, /ids: deleteIds/)
  assert.match(body, /const \{ deleted \} = await api\.post/)
  assert.match(body, /buildPartialDeleteMessage\('字段', deleted, items\.length - toDelete\.length\)/)
  assert.ok(body.indexOf('confirmReferenceAwareBatchDelete(ElMessageBox') < body.indexOf('batch-delete'))
})

test('form batch delete groups items through the shared helper before batch-delete', () => {
  const body = getFunctionBody(designerSource, 'batchDelForms')
  assert.match(body, /forms\/batch-references/)
  assert.match(body, /confirmReferenceAwareBatchDelete\(ElMessageBox/)
  assert.match(body, /noun: '表单'/)
  assert.match(body, /nameOf: \(f\) => f\.name/)
  assert.match(body, /truncRefs\(refs\.map\(\(r\) => r\.visit_name\), 3, '、'\)/)
  assert.match(body, /ids: deleteIds/)
  assert.match(body, /const \{ deleted \} = await api\.post/)
  assert.match(body, /buildPartialDeleteMessage\('表单', deleted, items\.length - toDelete\.length\)/)
  assert.ok(body.indexOf('confirmReferenceAwareBatchDelete(ElMessageBox') < body.indexOf('batch-delete'))
})

test('batch deletes clear the current selection only when it was actually deleted', () => {
  const codelistsBody = getFunctionBody(codelistsSource, 'batchDelCl')
  const unitsBody = getFunctionBody(unitsSource, 'batchDelUnits')
  const fieldsBody = getFunctionBody(fieldsSource, 'batchDelFields')
  const designerBody = getFunctionBody(designerSource, 'batchDelForms')
  assert.match(codelistsBody, /if \(deleteIds\.includes\(selected\.value\?\.id\)\) selected\.value = null/)
  assert.match(unitsBody, /if \(deleteIds\.includes\(selectedUnitId\.value\)\) clearUnitSelection\(\)/)
  assert.match(fieldsBody, /if \(deleteIds\.includes\(selectedFieldId\.value\)\) clearSelection\(\)/)
  assert.match(designerBody, /if \(deleteIds\.includes\(selectedForm\.value\?\.id\)\) \{\s*invalidateFormSelectionSession\(\);\s*selectedForm\.value = null;\s*formFields\.value = \[\];\s*\}/)
})

test('edit-impact reference calls keep the default response shape', () => {
  for (const [name, body] of [
    ['CodelistsTab.updateCl', getFunctionBody(codelistsSource, 'updateCl')],
    ['CodelistsTab.updateOpt', getFunctionBody(codelistsSource, 'updateOpt')],
    ['UnitsTab.saveUnit', getFunctionBody(unitsSource, 'saveUnit')],
    ['FieldsTab.quickSaveCodelist', getFunctionBody(fieldsSource, 'quickSaveCodelist')],
  ]) {
    assert.match(body, /\/references/, `${name} should query references for the impact reminder`)
    assert.doesNotMatch(body, /include_unplaced/, `${name} must keep the default reference response for edit impact`)
  }
})

test('main.css carries the reference-delete-box dialog styles', () => {
  assert.match(mainCss, /\.el-message-box\.reference-delete-box \{[^}]*--el-messagebox-width: 520px/)
  // Element Plus 基础样式是 width:100% + max-width:var(--el-messagebox-width)，
  // 必须显式钉住宽度，否则宽屏下 max-width:calc(100vw - 32px) 会把弹窗拉满视口
  assert.match(mainCss, /\.el-message-box\.reference-delete-box \{[^}]*width: var\(--el-messagebox-width\)/)
  assert.match(mainCss, /\.reference-delete-box \.el-message-box__message \{[^}]*max-height: 50vh/)
  assert.match(mainCss, /\.reference-delete-box \.el-message-box__message p \{[^}]*white-space: pre-line/)
})

test('single delete handlers await the blocked alert inside try so unexpected errors reach ElMessage.error', () => {
  for (const [source, name, handlerName] of [
    [codelistsSource, 'CodelistsTab', 'delCl'],
    [unitsSource, 'UnitsTab', 'del'],
    [fieldsSource, 'FieldsTab', 'del'],
    [designerSource, 'FormDesignerTab', 'delForm'],
  ]) {
    const body = extractFunctionSource(source, handlerName)
    assert.match(body, /return await showReferenceBlockedAlert\(ElMessageBox/, `${name}.${handlerName} should return await showReferenceBlockedAlert`)
    assert.doesNotMatch(body, /(?<!await )showReferenceBlockedAlert\(/, `${name}.${handlerName} must not fire-and-forget the blocked alert`)
  }
})

for (const [name, source, handlerName, item] of singleDeleteCases) {
  test(`${name}.${handlerName} shows one error toast and blocks deletion when the blocked alert fails unexpectedly`, async () => {
    const { sandbox, state } = createSingleDeleteSandbox({ alertImpl: () => Promise.reject(new Error('boom')) })
    const handler = buildHandler(extractFunctionSource(source, handlerName), handlerName, sandbox)
    await assert.doesNotReject(handler(item))
    assert.equal(state.errorToasts.length, 1)
    assert.equal(state.errorToasts[0], 'boom')
    assert.equal(state.delCalls, 0)
    assert.equal(state.confirmCalls, 0)
  })

  test(`${name}.${handlerName} stays silent on cancel/close dismissal of the blocked alert`, async () => {
    for (const dismissal of ['cancel', 'close']) {
      const { sandbox, state } = createSingleDeleteSandbox({ alertImpl: () => Promise.reject(dismissal) })
      const handler = buildHandler(extractFunctionSource(source, handlerName), handlerName, sandbox)
      await assert.doesNotReject(handler(item))
      assert.equal(state.errorToasts.length, 0)
      assert.equal(state.delCalls, 0)
      assert.equal(state.confirmCalls, 0)
    }
  })
}

for (const [name, source, handlerName, selectionName, noun] of batchDeleteCases) {
  test(`${name}.${handlerName} reports the backend deletion count after a concurrent removal`, async () => {
    const { sandbox, state, selection, selected, selectedUnitId, selectedFieldId, selectedForm, formFields } =
      createBatchDeleteSandbox({ selectionName, items: batchDeleteItems, deletedCount: 1 })
    const handler = buildHandler(extractFunctionSource(source, handlerName), handlerName, sandbox)

    await handler()

    assert.deepEqual(state.postCalls.map(({ body }) => body.ids), [[1, 2, 3], [2, 3]])
    assert.deepEqual(state.successToasts, [buildPartialDeleteMessage(noun, 1, 1)])
    assert.equal(state.confirmCalls, 1)
    assert.deepEqual(selection.value, [])
    if (selectionName === 'selCls') assert.equal(selected.value, null)
    if (selectionName === 'selUnits') {
      assert.equal(selectedUnitId.value, null)
      assert.equal(state.clearCalls, 1)
    }
    if (selectionName === 'selFields') {
      assert.equal(selectedFieldId.value, null)
      assert.equal(state.clearCalls, 1)
    }
    if (selectionName === 'selForms') {
      assert.equal(selectedForm.value, null)
      assert.deepEqual(formFields.value, [])
      assert.equal(state.invalidations, 1)
    }
    assert.deepEqual(state.errorToasts, [])
  })

  test(`${name}.${handlerName} only alerts once and never deletes when every selected item is referenced`, async () => {
    const { sandbox, state, selection, selected, selectedUnitId, selectedFieldId, selectedForm, formFields } =
      createBatchDeleteSandbox({ selectionName, items: batchDeleteItems, blockedIds: [1, 2, 3] })
    const handler = buildHandler(extractFunctionSource(source, handlerName), handlerName, sandbox)

    await handler()

    assert.equal(state.alertCalls, 1)
    assert.equal(state.confirmCalls, 0)
    assert.equal(state.postCalls.length, 1)
    assert.match(state.postCalls[0].url, /batch-references/)
    assert.deepEqual(state.successToasts, [])
    assert.deepEqual(state.errorToasts, [])
    assert.equal(selection.value, batchDeleteItems)
    assert.equal(selected.value.id, 2)
    assert.equal(selectedUnitId.value, 2)
    assert.equal(selectedFieldId.value, 2)
    assert.equal(selectedForm.value.id, 2)
    assert.deepEqual(formFields.value, [{ id: 21 }])
    assert.equal(state.clearCalls, 0)
    assert.equal(state.invalidations, 0)
  })

  test(`${name}.${handlerName} reports the backend error and keeps selections when the batch-delete request fails`, async () => {
    const failure = new Error(`部分${noun}已被引用，无法删除`)
    const { sandbox, state, selection, selected, selectedUnitId, selectedFieldId, selectedForm, formFields } =
      createBatchDeleteSandbox({ selectionName, items: batchDeleteItems, deletedCount: 0, batchDeleteError: failure })
    const handler = buildHandler(extractFunctionSource(source, handlerName), handlerName, sandbox)

    await handler()

    assert.deepEqual(state.errorToasts, [failure.message])
    assert.deepEqual(state.successToasts, [])
    assert.deepEqual(state.postCalls.map(({ body }) => body.ids), [[1, 2, 3], [2, 3]])
    assert.equal(state.postCalls[1].url.includes('/batch-delete'), true)
    assert.equal(selection.value, batchDeleteItems)
    assert.equal(selected.value.id, 2)
    assert.equal(selectedUnitId.value, 2)
    assert.equal(selectedFieldId.value, 2)
    assert.equal(selectedForm.value.id, 2)
    assert.deepEqual(formFields.value, [{ id: 21 }])
    assert.equal(state.clearCalls, 0)
    assert.equal(state.invalidations, 0)
  })

  test(`${name}.${handlerName} deletes nothing and stays silent when the mixed confirm is cancelled`, async () => {
    const { sandbox, state, selection, selected, selectedUnitId, selectedFieldId, selectedForm, formFields } =
      createBatchDeleteSandbox({
        selectionName,
        items: batchDeleteItems,
        confirmImpl: () => Promise.reject('cancel'),
      })
    const handler = buildHandler(extractFunctionSource(source, handlerName), handlerName, sandbox)

    await handler()

    assert.equal(state.confirmCalls, 1)
    assert.equal(state.alertCalls, 0)
    assert.equal(state.postCalls.length, 1)
    assert.match(state.postCalls[0].url, /batch-references/)
    assert.deepEqual(state.successToasts, [])
    assert.deepEqual(state.errorToasts, [])
    assert.equal(selection.value, batchDeleteItems)
    assert.equal(selected.value.id, 2)
    assert.equal(selectedUnitId.value, 2)
    assert.equal(selectedFieldId.value, 2)
    assert.equal(selectedForm.value.id, 2)
    assert.deepEqual(formFields.value, [{ id: 21 }])
    assert.equal(state.clearCalls, 0)
    assert.equal(state.invalidations, 0)
  })

  test(`${name}.${handlerName} keeps a blocked current selection after a partial delete`, async () => {
    const { sandbox, state, selection, selected, selectedUnitId, selectedFieldId, selectedForm, formFields } =
      createBatchDeleteSandbox({ selectionName, items: batchDeleteItems, deletedCount: 2, selectedId: 1 })
    const handler = buildHandler(extractFunctionSource(source, handlerName), handlerName, sandbox)

    await handler()

    assert.deepEqual(state.postCalls.map(({ body }) => body.ids), [[1, 2, 3], [2, 3]])
    assert.deepEqual(state.successToasts, [buildPartialDeleteMessage(noun, 2, 1)])
    assert.deepEqual(selection.value, [])
    assert.equal(selected.value.id, 1)
    assert.equal(selectedUnitId.value, 1)
    assert.equal(selectedFieldId.value, 1)
    assert.equal(selectedForm.value.id, 1)
    assert.deepEqual(formFields.value, [{ id: 21 }])
    assert.equal(state.clearCalls, 0)
    assert.equal(state.invalidations, 0)
  })

  test(`${name}.${handlerName} shows no partial toast when nothing is blocked`, async () => {
    const { sandbox, state, selection } = createBatchDeleteSandbox({
      selectionName,
      items: batchDeleteItems,
      deletedCount: 3,
      blockedIds: [],
    })
    const handler = buildHandler(extractFunctionSource(source, handlerName), handlerName, sandbox)

    await handler()

    assert.equal(state.confirmCalls, 1)
    assert.deepEqual(state.postCalls.map(({ body }) => body.ids), [[1, 2, 3], [1, 2, 3]])
    assert.deepEqual(state.successToasts, [])
    assert.deepEqual(state.errorToasts, [])
    assert.deepEqual(selection.value, [])
  })
}

for (const [name, source, handlerName, item, expectedDelUrl] of singleDeleteCases) {
  test(`${name}.${handlerName} confirms once and deletes an unreferenced item at the correct URL`, async () => {
    const { sandbox, state } = createSingleDeleteSandbox({
      alertImpl: () => Promise.reject(new Error('alert should not fire for an unreferenced item')),
      refs: [],
    })
    const handler = buildHandler(extractFunctionSource(source, handlerName), handlerName, sandbox)
    await assert.doesNotReject(handler(item))
    assert.equal(state.alertCalls, 0)
    assert.equal(state.confirmCalls, 1)
    assert.deepEqual(state.delUrls, [expectedDelUrl])
    assert.deepEqual(state.errorToasts, [])
  })

  test(`${name}.${handlerName} deletes nothing and shows no error toast when the delete confirm is cancelled`, async () => {
    const { sandbox, state } = createSingleDeleteSandbox({
      alertImpl: () => Promise.reject(new Error('alert should not fire for an unreferenced item')),
      refs: [],
      confirmImpl: () => Promise.reject('cancel'),
    })
    const handler = buildHandler(extractFunctionSource(source, handlerName), handlerName, sandbox)
    await assert.doesNotReject(handler(item))
    assert.equal(state.confirmCalls, 1)
    assert.equal(state.delCalls, 0)
    assert.deepEqual(state.errorToasts, [])
  })
}
