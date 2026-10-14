import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { nextTick } from 'vue'
import { useDesignerHistory } from '../src/composables/useDesignerHistory.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const source = readFileSync(path.resolve(currentDir, '../src/components/FormDesignerTab.vue'), 'utf8')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const REORDER_URL = '/api/forms/8/fields/reorder'

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

function hasFunction(name) {
  return source.includes(`function ${name}(`)
}

function isAsyncFunction(name) {
  return source.includes(`async function ${name}(`)
}

// 从源码签名解析函数自身的形参名（旧/新版本形参名可能不同，如 targetIdx/targetId）
function functionParams(name) {
  const start = source.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `should locate signature of ${name}`)
  const open = source.indexOf('(', start)
  const close = source.indexOf(')', open)
  return source
    .slice(open + 1, close)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

// 提取真实函数体：依赖形参前置并 bind 固定值，函数保持组件内部的调用签名。
function extractFunction(name, depNames, depValues) {
  const Fn = isAsyncFunction(name) ? AsyncFunction : Function
  const fn = new Fn(...depNames, ...functionParams(name), functionBody(name))
  return fn.bind(null, ...depValues)
}

function notImplemented(name) {
  return async () => {
    throw new Error(`${name} is not implemented in the current source`)
  }
}

function makeDragEvent() {
  return { preventDefault: () => {}, dataTransfer: { dropEffect: '' } }
}

// 构造字段列表：labels[i] 的 id 为 i+1；orders 缺省为 1..n 连续序号
function mkFields(labels, { orders } = {}) {
  return labels.map((label, index) => ({
    id: index + 1,
    label,
    order_index: orders ? orders[index] : index + 1,
  }))
}

const idsOf = (fields) => fields.map((f) => f.id)
const flushMacrotask = () => new Promise((resolve) => setImmediate(resolve))

// 提取并执行真实的组件排序/拖拽/持久化函数；API、消息是外部边界，允许注入。
// 内存服务端模型：POST 成功即按 ordered_ids 重排 serverFields，重载从该状态回读。
function createDragRuntime({
  fields = [],
  hasDraft = false,
  postImpl = null,
  reloadGate = null,
} = {}) {
  const calls = { posts: [], invalidations: [], reloads: [], warnings: [], focus: [] }
  const formFields = { value: fields }
  const dragSrcId = { value: null }
  const dragOverIdx = { value: null }
  const isReordering = { value: false }
  const isSavingFieldProp = { value: false }
  const savingDraft = { value: false }
  const fieldItemRefs = { value: {} }
  const selectedIds = { value: [] }
  const history = useDesignerHistory()

  const REORDER_URL_LOCAL = '/api/forms/8/fields/reorder'
  const serverFields = fields.map((f) => ({ ...f }))
  const api = {
    post: async (url, body) => {
      calls.posts.push([url, body])
      if (postImpl) return postImpl(url, body)
      if (url === REORDER_URL_LOCAL && Array.isArray(body?.ordered_ids)) {
        const byId = new Map(serverFields.map((f) => [f.id, f]))
        serverFields.length = 0
        for (const id of body.ordered_ids) {
          const field = byId.get(id)
          if (field) serverFields.push({ ...field, order_index: serverFields.length + 1 })
        }
      }
    },
    cachedGet: async () => serverFields.map((f) => ({ ...f })),
    invalidateCache: (url) => {
      calls.invalidations.push(url)
    },
  }

  const ElMessage = {
    warning: (message) => calls.warnings.push(message),
    error: () => {},
    success: () => {},
  }

  // 模拟 loadFormFields（真实函数经 cachedGet 拉取后排序赋值）：可被 reloadGate 阻塞以区分“立即回滚”与“后续重载落地”
  const loadFormFields = async (formId) => {
    calls.reloads.push(formId)
    if (reloadGate) await reloadGate.promise
    const loaded = await api.cachedGet()
    formFields.value = sortFormFieldsByOrder(loaded)
    return true
  }

  const captureDesignerHistoryContext = () => ({ formId: 8, sessionId: 0 })
  const isCurrentDesignerHistoryContext = (ctx) => Boolean(ctx && ctx.formId === 8 && ctx.sessionId === 0)
  const recordDesignerHistory = (ctx, entry) =>
    isCurrentDesignerHistoryContext(ctx) ? history.record(entry) : false
  // 真实 reloadAfterReplay：invalidateCache 后 loadFormFields
  const reloadAfterReplay = async (formId) => {
    calls.reloads.push(`replay:${formId}`)
    if (formId) api.invalidateCache(`/api/forms/${formId}/fields`)
    await loadFormFields(formId)
  }

  const isFieldMembershipBusy = () => false

  const sortFormFieldsByOrder = extractFunction('sortFormFieldsByOrder', [], [])
  const normalizeFormFieldOrder = extractFunction('normalizeFormFieldOrder', [], [])

  const onDragStart = extractFunction(
    'onDragStart',
    ['designerHistory', 'isReordering', 'isFieldMembershipBusy', 'isSavingFieldProp', 'savingDraft', 'dragSrcId'],
    [history, isReordering, isFieldMembershipBusy, isSavingFieldProp, savingDraft, dragSrcId],
  )
  const onDragOver = extractFunction('onDragOver', ['dragOverIdx'], [dragOverIdx])
  const onDragLeave = extractFunction('onDragLeave', ['dragOverIdx'], [dragOverIdx])

  // recordReorderHistory 在组件内部被 persist 以 3 参调用，依赖前置 bind
  const recordReorderHistory = extractFunction(
    'recordReorderHistory',
    ['recordDesignerHistory', 'api', 'reloadAfterReplay'],
    [recordDesignerHistory, api, reloadAfterReplay],
  )

  // persistFieldReorder 在组件内部被 3 参调用，依赖必须前置 bind
  const persistBound = extractFunction(
    'persistFieldReorder',
    [
      'isReordering',
      'isFieldMembershipBusy',
      'formFields',
      'api',
      'isCurrentDesignerHistoryContext',
      'recordReorderHistory',
      'ElMessage',
      'loadFormFields',
    ],
    [
      isReordering,
      isFieldMembershipBusy,
      formFields,
      api,
      isCurrentDesignerHistoryContext,
      recordReorderHistory,
      ElMessage,
      loadFormFields,
    ],
  )

  // 修复引入的边界换算与末尾落点：旧源码缺失时退化为显式失败的桩，保证 RED 可读。
  let commitFieldDropAtBoundary
  if (hasFunction('commitFieldDropAtBoundary')) {
    commitFieldDropAtBoundary = extractFunction(
      'commitFieldDropAtBoundary',
      [
        'designerHistory',
        'isReordering',
        'isFieldMembershipBusy',
        'isSavingFieldProp',
        'savingDraft',
        'dragSrcId',
        'hasDraft',
        'ElMessage',
        'captureDesignerHistoryContext',
        'persistFieldReorder',
        'normalizeFormFieldOrder',
      ],
      [
        history,
        isReordering,
        isFieldMembershipBusy,
        isSavingFieldProp,
        savingDraft,
        dragSrcId,
        { value: hasDraft },
        ElMessage,
        captureDesignerHistoryContext,
        persistBound,
        normalizeFormFieldOrder,
      ],
    )
  } else {
    commitFieldDropAtBoundary = notImplemented('commitFieldDropAtBoundary')
  }

  // onDrop 的新旧版本形参不同（targetId / targetIdx），依赖取超集并 bind
  const onDrop = extractFunction(
    'onDrop',
    [
      'designerHistory',
      'isReordering',
      'isFieldMembershipBusy',
      'isSavingFieldProp',
      'savingDraft',
      'dragSrcId',
      'hasDraft',
      'ElMessage',
      'captureDesignerHistoryContext',
      'persistFieldReorder',
      'normalizeFormFieldOrder',
      'dragOverIdx',
      'sortFormFieldsByOrder',
      'formFields',
      'commitFieldDropAtBoundary',
    ],
    [
      history,
      isReordering,
      isFieldMembershipBusy,
      isSavingFieldProp,
      savingDraft,
      dragSrcId,
      { value: hasDraft },
      ElMessage,
      captureDesignerHistoryContext,
      persistBound,
      normalizeFormFieldOrder,
      dragOverIdx,
      sortFormFieldsByOrder,
      formFields,
      commitFieldDropAtBoundary,
    ],
  )

  let onDropAtListEnd
  if (hasFunction('onDropAtListEnd')) {
    onDropAtListEnd = extractFunction(
      'onDropAtListEnd',
      [
        'designerHistory',
        'isReordering',
        'isFieldMembershipBusy',
        'isSavingFieldProp',
        'savingDraft',
        'dragSrcId',
        'hasDraft',
        'ElMessage',
        'captureDesignerHistoryContext',
        'persistFieldReorder',
        'normalizeFormFieldOrder',
        'dragOverIdx',
        'sortFormFieldsByOrder',
        'formFields',
        'commitFieldDropAtBoundary',
      ],
      [
        history,
        isReordering,
        isFieldMembershipBusy,
        isSavingFieldProp,
        savingDraft,
        dragSrcId,
        { value: hasDraft },
        ElMessage,
        captureDesignerHistoryContext,
        persistBound,
        normalizeFormFieldOrder,
        dragOverIdx,
        sortFormFieldsByOrder,
        formFields,
        commitFieldDropAtBoundary,
      ],
    )
  } else {
    onDropAtListEnd = notImplemented('onDropAtListEnd')
  }

  const handleFieldKeydown = extractFunction(
    'handleFieldKeydown',
    [
      'isDraftField',
      'selectedIds',
      'onSelectFieldClick',
      'designerHistory',
      'isReordering',
      'isFieldMembershipBusy',
      'isSavingFieldProp',
      'savingDraft',
      'hasDraft',
      'ElMessage',
      'captureDesignerHistoryContext',
      'formFields',
      'persistFieldReorder',
      'normalizeFormFieldOrder',
      'nextTick',
      'isCurrentDesignerHistoryContext',
      'fieldItemRefs',
    ],
    [
      (ff) => ff?.__draft === true || ff?.id === '__draft__',
      selectedIds,
      (field) => calls.selected?.push?.(field?.id),
      history,
      isReordering,
      isFieldMembershipBusy,
      isSavingFieldProp,
      savingDraft,
      { value: hasDraft },
      ElMessage,
      captureDesignerHistoryContext,
      formFields,
      persistBound,
      normalizeFormFieldOrder,
      nextTick,
      isCurrentDesignerHistoryContext,
      fieldItemRefs,
    ],
  )

  return {
    calls,
    formFields,
    dragOverIdx,
    dragSrcId,
    history,
    isReordering,
    fieldItemRefs,
    sortFormFieldsByOrder,
    run: {
      start: (ff) => onDragStart(ff, makeDragEvent()),
      over: (idx) => onDragOver(makeDragEvent(), idx),
      leave: () => onDragLeave(),
      dropRow: (targetId) => onDrop(makeDragEvent(), targetId),
      dropEnd: () => onDropAtListEnd(makeDragEvent()),
      keydown: (event, field, index) => handleFieldKeydown(event, field, index),
    },
  }
}

test('first downward drag on freshly loaded fields lands above the highlighted boundary', async () => {
  // [A,B,C,D] 拖 A 到 C 上方：应得 [B,A,C,D]，而非旧代码的 [B,C,D,A]
  const rt = createDragRuntime({ fields: mkFields(['A', 'B', 'C', 'D']) })
  rt.run.start(rt.formFields.value[0])
  await rt.run.dropRow(3)
  assert.deepEqual(idsOf(rt.formFields.value), [2, 1, 3, 4])
  assert.deepEqual(rt.calls.posts, [[REORDER_URL, { ordered_ids: [2, 1, 3, 4] }]])
})

test('downward drag after a simulated save-and-reload lands above the boundary', async () => {
  // 模拟新增保存并重载后的 5 字段状态；真实保存→拖动链路由浏览器验收覆盖
  const rt = createDragRuntime({ fields: mkFields(['A', 'B', 'C', 'D', 'E']) })
  rt.run.start(rt.formFields.value[2])
  await rt.run.dropRow(5)
  assert.deepEqual(idsOf(rt.formFields.value), [1, 2, 4, 3, 5])
  assert.deepEqual(rt.calls.posts, [[REORDER_URL, { ordered_ids: [1, 2, 4, 3, 5] }]])
})

test('consecutive downward drags each respect the highlighted boundary', async () => {
  const rt = createDragRuntime({ fields: mkFields(['A', 'B', 'C', 'D']) })
  rt.run.start(rt.formFields.value[0])
  await rt.run.dropRow(3)
  assert.deepEqual(idsOf(rt.formFields.value), [2, 1, 3, 4])
  rt.run.start(rt.formFields.value[1])
  await rt.run.dropRow(4)
  assert.deepEqual(idsOf(rt.formFields.value), [2, 3, 1, 4])
  assert.deepEqual(
    rt.calls.posts,
    [
      [REORDER_URL, { ordered_ids: [2, 1, 3, 4] }],
      [REORDER_URL, { ordered_ids: [2, 3, 1, 4] }],
    ],
  )
})

test('upward drag above the target row keeps its original correct placement', async () => {
  const rt = createDragRuntime({ fields: mkFields(['A', 'B', 'C', 'D']) })
  rt.run.start(rt.formFields.value[3])
  await rt.run.dropRow(2)
  assert.deepEqual(idsOf(rt.formFields.value), [1, 4, 2, 3])
})

test('dropping onto the immediately next row is a no-op without requests or history', async () => {
  const rt = createDragRuntime({ fields: mkFields(['A', 'B', 'C', 'D']) })
  rt.run.start(rt.formFields.value[0])
  await rt.run.dropRow(2)
  assert.deepEqual(idsOf(rt.formFields.value), [1, 2, 3, 4])
  assert.equal(rt.calls.posts.length, 0)
  assert.equal(rt.history.undoStack.value.length, 0)
})

test('dropping a row onto itself is a no-op without requests or history', async () => {
  const rt = createDragRuntime({ fields: mkFields(['A', 'B', 'C', 'D']) })
  rt.run.start(rt.formFields.value[1])
  await rt.run.dropRow(2)
  assert.deepEqual(idsOf(rt.formFields.value), [1, 2, 3, 4])
  assert.equal(rt.calls.posts.length, 0)
  assert.equal(rt.history.undoStack.value.length, 0)
})

test('dragging the last row onto the end zone is a no-op without requests', async () => {
  const rt = createDragRuntime({ fields: mkFields(['A', 'B', 'C', 'D']) })
  rt.run.start(rt.formFields.value[3])
  await rt.run.dropEnd()
  assert.deepEqual(idsOf(rt.formFields.value), [1, 2, 3, 4])
  assert.equal(rt.calls.posts.length, 0)
  assert.equal(rt.history.undoStack.value.length, 0)
})

test('dragging a row before the first row makes it the first row', async () => {
  const rt = createDragRuntime({ fields: mkFields(['A', 'B', 'C', 'D']) })
  rt.run.start(rt.formFields.value[3])
  await rt.run.dropRow(1)
  assert.deepEqual(idsOf(rt.formFields.value), [4, 1, 2, 3])
  assert.deepEqual(rt.calls.posts, [[REORDER_URL, { ordered_ids: [4, 1, 2, 3] }]])
})

test('dropping above the last row is distinct from the absolute end boundary', async () => {
  const rt = createDragRuntime({ fields: mkFields(['A', 'B', 'C', 'D']) })
  rt.run.start(rt.formFields.value[0])
  await rt.run.dropRow(4)
  assert.deepEqual(idsOf(rt.formFields.value), [2, 3, 1, 4])
})

test('dropping onto the end zone moves the row to the absolute end', async () => {
  const rt = createDragRuntime({ fields: mkFields(['A', 'B', 'C', 'D']) })
  rt.run.start(rt.formFields.value[0])
  await rt.run.dropEnd()
  assert.deepEqual(idsOf(rt.formFields.value), [2, 3, 4, 1])
  assert.deepEqual(rt.calls.posts, [[REORDER_URL, { ordered_ids: [2, 3, 4, 1] }]])
})

test('targets are resolved in the visible logical order even when the backing array diverges', async () => {
  // 复制草稿转正等路径可能保留非规范 backing 顺序：backing 为 [C,B,A]，可见顺序 [A,B,C]（ids [1,2,3]）
  const rt = createDragRuntime({
    fields: [
      { id: 3, label: 'C', order_index: 3 },
      { id: 2, label: 'B', order_index: 2 },
      { id: 1, label: 'A', order_index: 1 },
    ],
  })
  assert.deepEqual(idsOf(rt.sortFormFieldsByOrder(rt.formFields.value)), [1, 2, 3])
  // 拖 A（backing 末位、可见首位）放到 B 上方：可见顺序已如此，no-op
  rt.run.start(rt.formFields.value[2])
  await rt.run.dropRow(2)
  assert.equal(rt.calls.posts.length, 0)
  assert.deepEqual(idsOf(rt.sortFormFieldsByOrder(rt.formFields.value)), [1, 2, 3])
  // A 放到 C 上方：按可见逻辑顺序得到 [B,A,C]，POST 完整排列
  rt.run.start(rt.formFields.value[2])
  await rt.run.dropRow(3)
  assert.deepEqual(idsOf(rt.formFields.value), [2, 1, 3])
  assert.deepEqual(rt.calls.posts, [[REORDER_URL, { ordered_ids: [2, 1, 3] }]])
})

test('a valid reorder posts once, records one history entry, and keeps the optimistic order', async () => {
  const rt = createDragRuntime({ fields: mkFields(['A', 'B', 'C', 'D']) })
  const beforeB = rt.formFields.value[1]
  rt.run.start(rt.formFields.value[0])
  rt.run.over(2)
  assert.equal(rt.dragOverIdx.value, 2)
  await rt.run.dropRow(3)
  assert.equal(rt.calls.posts.length, 1)
  assert.equal(rt.calls.invalidations.length, 1)
  assert.deepEqual(rt.calls.reloads, [])
  assert.deepEqual(idsOf(rt.formFields.value), [2, 1, 3, 4])
  assert.deepEqual(
    rt.formFields.value.map((f) => f.order_index),
    [1, 2, 3, 4],
  )
  assert.equal(beforeB.order_index, 2, 'source field objects must not be mutated in place')
  assert.equal(rt.isReordering.value, false)
  assert.equal(rt.history.undoStack.value.length, 1)
  assert.equal(rt.history.canRedo.value, false)
  const entry = rt.history.undoStack.value[0]
  assert.equal(entry.label, '排序')
  assert.deepEqual(entry.ids.previousOrder, [1, 2, 3, 4])
  assert.deepEqual(entry.ids.nextOrder, [2, 1, 3, 4])
})

test('undo and redo replay the exact permutations through the recorded closures', async () => {
  const rt = createDragRuntime({ fields: mkFields(['A', 'B', 'C', 'D']) })
  rt.run.start(rt.formFields.value[0])
  await rt.run.dropRow(3)
  await rt.history.undo()
  assert.deepEqual(idsOf(rt.formFields.value), [1, 2, 3, 4])
  assert.deepEqual(rt.calls.posts[1], [REORDER_URL, { ordered_ids: [1, 2, 3, 4] }])
  assert.ok(rt.calls.reloads.includes('replay:8'))
  assert.equal(rt.history.canUndo.value, false)
  assert.equal(rt.history.canRedo.value, true)
  await rt.history.redo()
  assert.deepEqual(idsOf(rt.formFields.value), [2, 1, 3, 4])
  assert.deepEqual(rt.calls.posts[2], [REORDER_URL, { ordered_ids: [2, 1, 3, 4] }])
  assert.equal(rt.history.canRedo.value, false)
  // 栈未被回放污染：再次撤销仍回放同一 previous 排列
  await rt.history.undo()
  assert.deepEqual(rt.calls.posts[3], [REORDER_URL, { ordered_ids: [1, 2, 3, 4] }])
  assert.equal(rt.history.undoStack.value.length, 0)
})

test('a rejected reorder restores the previous order, warns, skips history, and allows retry', async () => {
  let resolveGate
  const reloadGate = { promise: new Promise((resolve) => (resolveGate = resolve)) }
  let failPost = true
  const rt = createDragRuntime({
    fields: mkFields(['A', 'B', 'C', 'D']),
    postImpl: async () => {
      if (failPost) throw new Error('network down')
    },
    reloadGate,
  })
  rt.run.start(rt.formFields.value[0])
  await rt.run.dropRow(3)
  // 立即回滚：可见顺序恢复旧排列，提示既有的失败文案
  const rolledBack = rt.formFields.value
  assert.deepEqual(idsOf(rolledBack), [1, 2, 3, 4])
  assert.deepEqual(rt.calls.warnings, ['排序保存失败，已恢复'])
  assert.ok(rt.calls.reloads.includes(8))
  assert.equal(rt.history.undoStack.value.length, 0)
  assert.equal(rt.isReordering.value, false)
  // 重载尚未落地（受控 promise 未决），回滚结果未被覆盖
  assert.equal(rt.formFields.value[0].label, 'A')
  resolveGate()
  await flushMacrotask()
  // 后续重载落地：按服务端（未变的）状态重新赋值，替换回滚数组
  assert.notEqual(rt.formFields.value, rolledBack)
  assert.deepEqual(idsOf(rt.formFields.value), [1, 2, 3, 4])
  // busy 已释放：可继续拖动并成功保存
  failPost = false
  rt.run.start(rt.formFields.value[0])
  await rt.run.dropRow(3)
  assert.deepEqual(idsOf(rt.formFields.value), [2, 1, 3, 4])
  assert.deepEqual(rt.calls.posts, [
    [REORDER_URL, { ordered_ids: [2, 1, 3, 4] }],
    [REORDER_URL, { ordered_ids: [2, 1, 3, 4] }],
  ])
  assert.equal(rt.calls.warnings.length, 1)
})

test('an unsaved draft blocks reordering with the existing warning', async () => {
  const rt = createDragRuntime({ fields: mkFields(['A', 'B', 'C', 'D']), hasDraft: true })
  rt.run.start(rt.formFields.value[0])
  await rt.run.dropRow(3)
  assert.deepEqual(rt.calls.warnings, ['请先保存或丢弃新增字段草稿'])
  assert.deepEqual(idsOf(rt.formFields.value), [1, 2, 3, 4])
  assert.equal(rt.calls.posts.length, 0)
  assert.equal(rt.history.undoStack.value.length, 0)
})

test('reorder is skipped while another reorder is in flight but hover state is cleared', async () => {
  const rt = createDragRuntime({ fields: mkFields(['A', 'B', 'C', 'D']) })
  rt.run.start(rt.formFields.value[0])
  rt.run.over(2)
  assert.equal(rt.dragOverIdx.value, 2)
  rt.isReordering.value = true
  await rt.run.dropRow(3)
  assert.equal(rt.dragOverIdx.value, null)
  assert.deepEqual(idsOf(rt.formFields.value), [1, 2, 3, 4])
  assert.equal(rt.calls.posts.length, 0)
})

test('an unknown source or target id is ignored silently', async () => {
  const rt = createDragRuntime({ fields: mkFields(['A', 'B', 'C', 'D']) })
  await rt.run.dropRow(3)
  assert.equal(rt.calls.posts.length, 0)
  rt.run.start(rt.formFields.value[0])
  await rt.run.dropRow(999)
  assert.equal(rt.calls.posts.length, 0)
  assert.deepEqual(idsOf(rt.formFields.value), [1, 2, 3, 4])
})

test('ctrl+arrow moves a field exactly one row without the drop boundary formula', async () => {
  const rt = createDragRuntime({ fields: mkFields(['A', 'B', 'C', 'D']) })
  const event = { key: 'ArrowDown', ctrlKey: true, preventDefault: () => {} }
  await rt.run.keydown(event, rt.formFields.value[0], 0)
  assert.deepEqual(idsOf(rt.formFields.value), [2, 1, 3, 4])
  assert.deepEqual(rt.calls.posts, [[REORDER_URL, { ordered_ids: [2, 1, 3, 4] }]])
})

test('ctrl+arrow at the list edges is a no-op without requests', async () => {
  const rt = createDragRuntime({ fields: mkFields(['A', 'B', 'C', 'D']) })
  await rt.run.keydown({ key: 'ArrowUp', ctrlKey: true, preventDefault: () => {} }, rt.formFields.value[0], 0)
  await rt.run.keydown(
    { key: 'ArrowDown', ctrlKey: true, preventDefault: () => {} },
    rt.formFields.value[3],
    3,
  )
  assert.deepEqual(idsOf(rt.formFields.value), [1, 2, 3, 4])
  assert.equal(rt.calls.posts.length, 0)
})

test('plain arrow keys only move focus and never persist an order', async () => {
  const rt = createDragRuntime({ fields: mkFields(['A', 'B', 'C', 'D']) })
  rt.fieldItemRefs.value = {
    1: { focus: () => rt.calls.focus.push(1) },
    2: { focus: () => rt.calls.focus.push(2) },
    3: { focus: () => rt.calls.focus.push(3) },
    4: { focus: () => rt.calls.focus.push(4) },
  }
  await rt.run.keydown({ key: 'ArrowDown', ctrlKey: false, preventDefault: () => {} }, rt.formFields.value[0], 0)
  await nextTick()
  assert.deepEqual(rt.calls.focus, [2])
  assert.equal(rt.calls.posts.length, 0)
  assert.deepEqual(idsOf(rt.formFields.value), [1, 2, 3, 4])
})

test('a sparse or shuffled API response still yields consistent source and visible order', async () => {
  // 对照组：乱序响应 + 稀疏序号加载后，可见顺序 ids [2,3,1]（labels [A,B,C]），第一次拖动即按可见边界正确落点
  const rt = createDragRuntime({ fields: mkFields(['C', 'A', 'B'], { orders: [9, 1, 5] }) })
  assert.deepEqual(idsOf(rt.sortFormFieldsByOrder(rt.formFields.value)), [2, 3, 1])
  // 拖 A（id2，可见首位）放到 C（id1，可见末位）上方：可见顺序变为 [B,A,C]
  rt.run.start(rt.formFields.value[1])
  await rt.run.dropRow(1)
  assert.deepEqual(idsOf(rt.formFields.value), [3, 2, 1])
  assert.deepEqual(rt.calls.posts, [[REORDER_URL, { ordered_ids: [3, 2, 1] }]])
})
