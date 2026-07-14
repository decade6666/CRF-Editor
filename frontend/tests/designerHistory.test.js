import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { useDesignerHistory, MAX_HISTORY } from '../src/composables/useDesignerHistory.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const designerSource = readFileSync(path.resolve(currentDir, '../src/components/FormDesignerTab.vue'), 'utf8')

function noop() {
  return Promise.resolve()
}

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function functionBody(name) {
  const start = designerSource.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `should locate ${name}`)
  const bodyStart = designerSource.indexOf('{', start)
  let depth = 0
  for (let index = bodyStart; index < designerSource.length; index += 1) {
    if (designerSource[index] === '{') depth += 1
    if (designerSource[index] === '}') depth -= 1
    if (depth === 0) return designerSource.slice(bodyStart + 1, index)
  }
  assert.fail(`${name} should have a complete body`)
}

test('empty stacks disable undo and redo', () => {
  const history = useDesignerHistory()
  assert.equal(history.canUndo.value, false)
  assert.equal(history.canRedo.value, false)
})

test('recording enables undo and disables redo', () => {
  const history = useDesignerHistory()
  const accepted = history.record({ label: 'op', ids: { ffId: 1 }, undo: noop, redo: noop })
  assert.equal(accepted, true)
  assert.equal(history.canUndo.value, true)
  assert.equal(history.canRedo.value, false)
})

test('record rejects an entry while undo replay is busy without polluting either stack', async () => {
  const history = useDesignerHistory()
  const replay = deferred()
  history.record({ label: 'original', ids: {}, undo: () => replay.promise, redo: noop })

  const undoPromise = history.undo()
  assert.equal(history.busy.value, true)
  assert.equal(history.record({ label: 'injected', ids: {}, undo: noop, redo: noop }), false)
  assert.deepEqual(history.undoStack.value.map((entry) => entry.label), ['original'])
  assert.deepEqual(history.redoStack.value, [])

  replay.resolve()
  await undoPromise
  assert.deepEqual(history.undoStack.value, [])
  assert.deepEqual(history.redoStack.value.map((entry) => entry.label), ['original'])
})

test('record rejects an entry while redo replay is busy without polluting either stack', async () => {
  const history = useDesignerHistory()
  const replay = deferred()
  history.record({ label: 'original', ids: {}, undo: noop, redo: () => replay.promise })
  await history.undo()

  const redoPromise = history.redo()
  assert.equal(history.busy.value, true)
  assert.equal(history.record({ label: 'injected', ids: {}, undo: noop, redo: noop }), false)
  assert.deepEqual(history.undoStack.value, [])
  assert.deepEqual(history.redoStack.value.map((entry) => entry.label), ['original'])

  replay.resolve()
  await redoPromise
  assert.deepEqual(history.undoStack.value.map((entry) => entry.label), ['original'])
  assert.deepEqual(history.redoStack.value, [])
})

test('history is capped at MAX_HISTORY, dropping the oldest', () => {
  const history = useDesignerHistory()
  for (let i = 0; i < MAX_HISTORY + 5; i += 1) {
    history.record({ label: `op-${i}`, ids: { ffId: i }, undo: noop, redo: noop })
  }
  assert.equal(history.undoStack.value.length, MAX_HISTORY)
  // 最旧的 5 条被丢弃，栈底应为 op-5。
  assert.equal(history.undoStack.value[0].label, `op-5`)
  assert.equal(history.undoStack.value[MAX_HISTORY - 1].label, `op-${MAX_HISTORY + 4}`)
})

test('recording a new operation clears the redo stack', async () => {
  const history = useDesignerHistory()
  history.record({ label: 'first', ids: {}, undo: noop, redo: noop })
  await history.undo()
  assert.equal(history.canRedo.value, true)
  history.record({ label: 'second', ids: {}, undo: noop, redo: noop })
  assert.equal(history.canRedo.value, false)
  assert.equal(history.redoStack.value.length, 0)
})

test('undo then redo moves the entry between stacks and replays in order', async () => {
  const history = useDesignerHistory()
  const calls = []
  history.record({
    label: 'op',
    ids: { ffId: 7 },
    undo: async (ids) => {
      calls.push(['undo', ids.ffId])
    },
    redo: async (ids) => {
      calls.push(['redo', ids.ffId])
    },
  })
  await history.undo()
  assert.deepEqual(calls, [['undo', 7]])
  assert.equal(history.undoStack.value.length, 0)
  assert.equal(history.redoStack.value.length, 1)
  await history.redo()
  assert.deepEqual(calls, [['undo', 7], ['redo', 7]])
  assert.equal(history.undoStack.value.length, 1)
  assert.equal(history.redoStack.value.length, 0)
})

test('delete-undo remaps the recreated id so redo targets the new id', async () => {
  const history = useDesignerHistory()
  const deleted = []
  let nextRecreatedId = 100
  // 模拟「删除字段」命令：undo 重建产生新 id 并回写，redo 按当前 id 删除。
  history.record({
    label: '删除字段',
    ids: { ffId: 5 },
    undo: async (ids, { remapId }) => {
      const recreatedId = nextRecreatedId
      remapId(ids.ffId, recreatedId)
    },
    redo: async (ids) => {
      deleted.push(ids.ffId)
    },
  })
  await history.undo()
  // 撤销后 entry.ids.ffId 应已重映射为新 id。
  assert.equal(history.redoStack.value[0].ids.ffId, 100)
  await history.redo()
  // redo 必须删除重映射后的新 id，而非已失效的旧 id 5。
  assert.deepEqual(deleted, [100])
})

test('remapId rewrites ids stored inside arrays across stacks', () => {
  const history = useDesignerHistory()
  history.record({ label: '批量删除', ids: { ffIds: [1, 2, 3] }, undo: noop, redo: noop })
  history.remapId(2, 22)
  assert.deepEqual(history.undoStack.value[0].ids.ffIds, [1, 22, 3])
})

test('a failing undo keeps the stack intact and propagates the error', async () => {
  const history = useDesignerHistory()
  history.record({
    label: 'op',
    ids: {},
    undo: async () => {
      throw new Error('backend replay failed')
    },
    redo: noop,
  })
  await assert.rejects(() => history.undo(), /backend replay failed/)
  // 失败不应移动栈状态，撤回仍可重试。
  assert.equal(history.undoStack.value.length, 1)
  assert.equal(history.redoStack.value.length, 0)
  assert.equal(history.busy.value, false)
})

test('a callback that remaps then throws must not pollute the stack ids', async () => {
  const history = useDesignerHistory()
  history.record({
    label: '删除字段',
    ids: { ffId: 5 },
    undo: async (ids, { remapId }) => {
      // 模拟：重建成功并 remap，但随后的列表刷新抛错
      remapId(ids.ffId, 100)
      throw new Error('reload failed after recreate')
    },
    redo: async () => {},
  })
  await assert.rejects(() => history.undo(), /reload failed/)
  // 失败后该记录仍在 undo 栈，且 ids 必须还原为 5（不被中途 remap 污染）
  assert.equal(history.undoStack.value.length, 1)
  assert.equal(history.redoStack.value.length, 0)
  assert.equal(history.undoStack.value[0].ids.ffId, 5)
})

test('a redo callback that remaps then throws restores its ids', async () => {
  const history = useDesignerHistory()
  history.record({ label: 'op', ids: { fdId: 7 }, undo: async () => {}, redo: async () => {} })
  await history.undo()
  // 重写 redo 行为以模拟 remap 后抛错
  const entry = history.redoStack.value[0]
  entry.redo = async (ids, { remapId }) => {
    remapId(ids.fdId, 200)
    throw new Error('second post failed')
  }
  await assert.rejects(() => history.redo(), /second post failed/)
  assert.equal(history.redoStack.value.length, 1)
  assert.equal(history.redoStack.value[0].ids.fdId, 7)
})

test('clear empties both stacks', () => {
  const history = useDesignerHistory()
  history.record({ label: 'op', ids: {}, undo: noop, redo: noop })
  history.clear()
  assert.equal(history.undoStack.value.length, 0)
  assert.equal(history.redoStack.value.length, 0)
  assert.equal(history.canUndo.value, false)
})

test('designer history recording is centralized behind form id and selection session guards', () => {
  const captureBody = functionBody('captureDesignerHistoryContext')
  const recordBody = functionBody('recordDesignerHistory')

  assert.match(captureBody, /formId == null \? null : \{ formId, sessionId: formSelectionSession \}/)
  assert.match(recordBody, /context\.sessionId !== formSelectionSession/)
  assert.match(recordBody, /context\.formId !== \(selectedForm\.value\?\.id \?\? null\)/)
  assert.match(recordBody, /return designerHistory\.record\(entry\)/)
  assert.equal((designerSource.match(/designerHistory\.record\(/g) || []).length, 1)

  const labels = ['排序', '新增字段', '复制字段', '删除字段', '批量删除', '编辑属性', '新建字段', '添加log行提示']
  for (const label of labels) {
    assert.match(designerSource, new RegExp(`recordDesignerHistory\\(historyContext, \\{[\\s\\S]*?label: '${label}'`))
  }
})

test('stale A to B to A command context is rejected by the monotonic selection session', () => {
  let sessionId = 4
  const selectedForm = { value: { id: 10 } }
  const recorded = []
  const capture = (formId = selectedForm.value?.id ?? null) =>
    formId == null ? null : { formId, sessionId }
  const record = (context, entry) => {
    if (!context) return false
    if (context.sessionId !== sessionId) return false
    if (context.formId !== (selectedForm.value?.id ?? null)) return false
    recorded.push(entry)
    return true
  }

  const contextFromA = capture()
  selectedForm.value = { id: 20 }
  sessionId += 1
  selectedForm.value = { id: 10 }
  sessionId += 1

  assert.equal(record(contextFromA, { label: '旧命令' }), false)
  assert.deepEqual(recorded, [])
})

test('all async history commands capture context and both reorder paths pass it to the shared reorder helper', () => {
  for (const name of [
    'addField',
    'copyFormField',
    'removeField',
    'batchDelete',
    'onDrop',
    'saveFieldProp',
    'saveDraftField',
    'addLogRow',
  ]) {
    assert.match(functionBody(name), /historyContext = captureDesignerHistoryContext\(/, `${name} should capture context`)
  }

  const reorderBody = functionBody('recordReorderHistory')
  assert.match(reorderBody, /recordDesignerHistory\(historyContext,/)
  const persistBody = functionBody('persistFieldReorder')
  assert.match(persistBody, /recordReorderHistory\(historyContext, previousOrder, nextOrder\)/)
  assert.match(persistBody, /if \(isCurrentDesignerHistoryContext\(historyContext\)\) \{[\s\S]*formFields\.value = previousFields/)
  assert.match(functionBody('onDrop'), /persistFieldReorder\(historyContext, previousFields, normalizeFormFieldOrder\(arr\)\)/)
  assert.match(functionBody('handleFieldKeydown'), /persistFieldReorder\(historyContext, previousFields, normalizeFormFieldOrder\(arr\)\)/)
})

test('history-producing command functions reject new work while replay is busy', () => {
  for (const name of [
    'addField',
    'copyFormField',
    'batchDelete',
    'onDrop',
    'saveFieldProp',
    'newField',
    'saveDraftField',
    'addLogRow',
  ]) {
    assert.match(functionBody(name), /designerHistory\.busy\.value/, `${name} should guard replay busy state`)
  }
  assert.match(functionBody('removeField'), /if \(designerHistory\.busy\.value && !isDraftField\(ff\)\) return;/)
  assert.match(functionBody('onDragStart'), /if \(designerHistory\.busy\.value \|\| isReordering\.value\) \{[\s\S]*return;/)
  assert.match(functionBody('onDrop'), /if \(designerHistory\.busy\.value \|\| isReordering\.value\) return;/)
  assert.match(functionBody('handleFieldKeydown'), /if \(ctrlKey && \(designerHistory\.busy\.value \|\| isReordering\.value\)\) return;/)
  assert.match(functionBody('handleFieldKeydown'), /if \(designerHistory\.busy\.value \|\| isReordering\.value\) return;/)
})

test('history-producing designer controls and property forms are disabled during replay', () => {
  assert.match(designerSource, /data-test="designer-field-library-add"[\s\S]*?:disabled="designerHistory\.busy\.value"/)
  assert.match(designerSource, /data-test="designer-new-field"[\s\S]*?:disabled="designerHistory\.busy\.value"/)
  assert.match(designerSource, /data-test="designer-save-draft"[\s\S]*?:disabled="designerHistory\.busy\.value"/)
  assert.match(designerSource, /data-test="designer-add-log-row"[\s\S]*?:disabled="designerHistory\.busy\.value"/)
  assert.match(designerSource, /data-test="designer-batch-delete"[\s\S]*?:disabled="designerHistory\.busy\.value"/)
  assert.match(designerSource, /data-test="designer-copy-field"[\s\S]*?:disabled="copyingFieldIds\.has\(ff\.id\) \|\| designerHistory\.busy\.value"/)
  assert.match(designerSource, /data-test="designer-delete-field"[\s\S]*?:disabled="!isDraftField\(ff\) && designerHistory\.busy\.value"/)
  assert.match(designerSource, /:draggable="!designerHistory\.busy\.value && !isReordering"/)
  assert.match(designerSource, /data-test="designer-log-property-form"[\s\S]*?:disabled="designerHistory\.busy\.value"/)
  assert.match(designerSource, /data-test="designer-field-property-form"[\s\S]*?:disabled="designerHistory\.busy\.value"/)
  assert.match(designerSource, /data-test="designer-draft-save"[\s\S]*?:disabled="designerHistory\.busy\.value"/)
})
