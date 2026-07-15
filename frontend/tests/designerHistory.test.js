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
  let reject
  const promise = new Promise((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function functionBody(name) {
  // Skip parameter-list braces (e.g. `function f({ actionText })`) before taking the body.
  const marker = `function ${name}(`
  const start = designerSource.indexOf(marker)
  assert.notEqual(start, -1, `should locate ${name}`)
  let index = start + marker.length - 1
  let parenDepth = 0
  let braceDepth = 0
  for (; index < designerSource.length; index += 1) {
    const ch = designerSource[index]
    if (ch === '{') braceDepth += 1
    else if (ch === '}') braceDepth -= 1
    else if (braceDepth === 0) {
      if (ch === '(') parenDepth += 1
      else if (ch === ')') {
        parenDepth -= 1
        if (parenDepth === 0) break
      }
    }
  }
  assert.ok(index < designerSource.length, `${name} parameter list should close`)
  const bodyStart = designerSource.indexOf('{', index + 1)
  assert.notEqual(bodyStart, -1, `${name} should have a body`)
  let depth = 0
  for (let cursor = bodyStart; cursor < designerSource.length; cursor += 1) {
    if (designerSource[cursor] === '{') depth += 1
    if (designerSource[cursor] === '}') depth -= 1
    if (depth === 0) return designerSource.slice(bodyStart + 1, cursor)
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

test('clear during an undo replay prevents the old entry from migrating to redo', async () => {
  const history = useDesignerHistory()
  const replay = deferred()
  history.record({ label: 'old-form', ids: {}, undo: () => replay.promise, redo: noop })

  const undoPromise = history.undo()
  history.clear()
  assert.deepEqual(history.undoStack.value, [])
  assert.deepEqual(history.redoStack.value, [])

  replay.resolve()
  await undoPromise
  assert.deepEqual(history.undoStack.value, [])
  assert.deepEqual(history.redoStack.value, [])
  assert.equal(history.busy.value, false)
})

test('clear during a redo replay prevents the old entry from migrating to undo', async () => {
  const history = useDesignerHistory()
  const replay = deferred()
  history.record({ label: 'old-form', ids: {}, undo: noop, redo: () => replay.promise })
  await history.undo()

  const redoPromise = history.redo()
  history.clear()
  assert.deepEqual(history.undoStack.value, [])
  assert.deepEqual(history.redoStack.value, [])

  replay.resolve()
  await redoPromise
  assert.deepEqual(history.undoStack.value, [])
  assert.deepEqual(history.redoStack.value, [])
  assert.equal(history.busy.value, false)
})

test('clear during a failing undo replay still rejects and keeps both stacks empty', async () => {
  const history = useDesignerHistory()
  const replay = deferred()
  history.record({
    label: 'old-form',
    ids: { ffId: 9 },
    undo: () => replay.promise,
    redo: noop,
  })

  const undoPromise = history.undo()
  history.clear()
  replay.reject(new Error('undo replay failed after clear'))

  await assert.rejects(() => undoPromise, /undo replay failed after clear/)
  assert.deepEqual(history.undoStack.value, [])
  assert.deepEqual(history.redoStack.value, [])
  assert.equal(history.busy.value, false)
})

test('clear during a failing redo replay still rejects and keeps both stacks empty', async () => {
  const history = useDesignerHistory()
  const replay = deferred()
  history.record({
    label: 'old-form',
    ids: { ffId: 11 },
    undo: noop,
    redo: () => replay.promise,
  })
  await history.undo()

  const redoPromise = history.redo()
  history.clear()
  replay.reject(new Error('redo replay failed after clear'))

  await assert.rejects(() => redoPromise, /redo replay failed after clear/)
  assert.deepEqual(history.undoStack.value, [])
  assert.deepEqual(history.redoStack.value, [])
  assert.equal(history.busy.value, false)
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
  const currentBody = functionBody('isCurrentDesignerHistoryContext')
  const recordBody = functionBody('recordDesignerHistory')

  assert.match(captureBody, /formId == null \? null : \{ formId, sessionId: formSelectionSession \}/)
  assert.match(currentBody, /context\.sessionId === formSelectionSession/)
  assert.match(currentBody, /context\.formId === \(selectedForm\.value\?\.id \?\? null\)/)
  assert.match(recordBody, /if \(!isCurrentDesignerHistoryContext\(context\)\) return false/)
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

test('field membership mutations invalidate caches before stale returns and only reload current UI state', () => {
  assert.match(
    functionBody('addField'),
    /const created = await api\.post[\s\S]*?api\.invalidateCache\(`\/api\/forms\/\$\{formId\}\/fields`\);[\s\S]*?if \(!isCurrentDesignerHistoryContext\(historyContext\)\) return;[\s\S]*?await loadFormFields\(formId\);/,
  )
  assert.match(
    functionBody('copyFormField'),
    /await reloadAfterReplay\(formId, \{ defs: !isLogRow \}\);/,
    'copy still reloads through the shared helper on the current session',
  )
  assert.match(
    functionBody('copyFormField'),
    /createdFormField = await api\.post[\s\S]*?api\.invalidateCache\(`\/api\/forms\/\$\{formId\}\/fields`\);[\s\S]*?api\.invalidateCache\(`\/api\/projects\/\$\{projectId\}\/field-definitions`\);[\s\S]*?if \(!isCurrentDesignerHistoryContext\(historyContext\)\) return;/,
  )
  assert.match(
    functionBody('removeField'),
    /await api\.del\(`\/api\/form-fields\/\$\{ff\.id\}`\);[\s\S]*?api\.invalidateCache\(`\/api\/forms\/\$\{formId\}\/fields`\);[\s\S]*?if \(!isCurrentDesignerHistoryContext\(historyContext\)\) return;/,
  )
  assert.match(
    functionBody('batchDelete'),
    /await api\.post\(`\/api\/forms\/\$\{formId\}\/fields\/batch-delete`, \{ ids \}\);[\s\S]*?api\.invalidateCache\(`\/api\/forms\/\$\{formId\}\/fields`\);[\s\S]*?if \(!isCurrentDesignerHistoryContext\(historyContext\)\) return;/,
  )
  assert.match(
    functionBody('saveDraftField'),
    /const createdFf = await api\.post[\s\S]*?api\.invalidateCache\(`\/api\/forms\/\$\{formId\}\/fields`\);[\s\S]*?api\.invalidateCache\(`\/api\/projects\/\$\{projectId\}\/field-definitions`\);[\s\S]*?if \(!isCurrentDesignerHistoryContext\(historyContext\)\) return true;[\s\S]*?await loadFormFields\(formId\);[\s\S]*?await loadFieldDefs\(\);/,
  )
  assert.match(
    functionBody('addLogRow'),
    /const created = await api\.post[\s\S]*?api\.invalidateCache\(`\/api\/forms\/\$\{formId\}\/fields`\);[\s\S]*?if \(!isCurrentDesignerHistoryContext\(historyContext\)\) return;[\s\S]*?await loadFormFields\(formId\);/,
  )
  assert.match(
    functionBody('persistFieldReorder'),
    /await api\.post\(`\/api\/forms\/\$\{formId\}\/fields\/reorder`, \{ ordered_ids: nextOrder \}\);[\s\S]*?api\.invalidateCache\(`\/api\/forms\/\$\{formId\}\/fields`\);[\s\S]*?if \(!isCurrentDesignerHistoryContext\(historyContext\)\) return false;/,
  )
})

test('commands revalidate captured context after confirmations before persistent requests', () => {
  for (const name of ['addField', 'copyFormField', 'addLogRow']) {
    assert.match(
      functionBody(name),
      /await confirmDiscardDraft\(\);[\s\S]*?if \(!isCurrentDesignerHistoryContext\(historyContext\)\) return;/,
      `${name} should revalidate after draft confirmation`,
    )
  }
  for (const name of ['removeField', 'batchDelete']) {
    assert.match(
      functionBody(name),
      /await confirmFormChange\(\);[\s\S]*?if \(!isCurrentDesignerHistoryContext\(historyContext\)\) return;/,
      `${name} should revalidate after delete confirmation`,
    )
  }
})

test('stale async completions cannot mutate current designer field state or focus', () => {
  assert.match(
    functionBody('saveDraftField'),
    /const createdFf = await api\.post[\s\S]*?if \(!isCurrentDesignerHistoryContext\(historyContext\)\) return true;[\s\S]*?formFields\.value =/,
  )
  assert.match(
    functionBody('copyFormField'),
    /if \(!isCurrentDesignerHistoryContext\(historyContext\)\) return;[\s\S]*?await reloadAfterReplay\(formId,[\s\S]*?if \(!isCurrentDesignerHistoryContext\(historyContext\)\) return;[\s\S]*?selectField\(created\)/,
  )
  assert.match(
    functionBody('removeField'),
    /await api\.del\(`\/api\/form-fields\/\$\{ff\.id\}`\);[\s\S]*?if \(!isCurrentDesignerHistoryContext\(historyContext\)\) return;[\s\S]*?formFields\.value =/,
  )
  assert.match(
    functionBody('batchDelete'),
    /await api\.post\(`\/api\/forms\/\$\{formId\}\/fields\/batch-delete`[\s\S]*?if \(!isCurrentDesignerHistoryContext\(historyContext\)\) return;[\s\S]*?selectedIds\.value =/,
  )
  const reorderBody = functionBody('persistFieldReorder')
  assert.match(
    reorderBody,
    /await api\.post\(`\/api\/forms\/\$\{formId\}\/fields\/reorder`[\s\S]*?if \(!isCurrentDesignerHistoryContext\(historyContext\)\) return false;[\s\S]*?recordReorderHistory\(historyContext, previousOrder, nextOrder\)/,
  )
  assert.match(functionBody('onDrop'), /await persistFieldReorder\(historyContext, previousFields,/)
  const keyboardBody = functionBody('handleFieldKeydown')
  assert.match(keyboardBody, /await persistFieldReorder\(historyContext, previousFields,/)
  assert.match(keyboardBody, /nextTick\(\(\) => \{[\s\S]*?if \(!isCurrentDesignerHistoryContext\(historyContext\)\) return;/)
})

test('local draft and field selection continuations reject stale confirmation contexts', () => {
  assert.match(
    functionBody('newField'),
    /historyContext = captureDesignerHistoryContext\(\)[\s\S]*?await confirmDiscardDraft\(\);[\s\S]*?if \(!isCurrentDesignerHistoryContext\(historyContext\)\) return;/,
  )
  assert.match(
    functionBody('onSelectFieldClick'),
    /historyContext = captureDesignerHistoryContext\(\)[\s\S]*?await confirmDiscardDraft\(\);[\s\S]*?if \(!isCurrentDesignerHistoryContext\(historyContext\)\) return;/,
  )
})

test('form selection uses attempt supersession without invalidating the committed session before commit', () => {
  const body = functionBody('selectForm')
  assert.match(designerSource, /let formSelectionAttempt = 0;/)
  assert.match(
    functionBody('invalidateFormSelectionSession'),
    /formSelectionSession \+= 1;[\s\S]*?formSelectionAttempt \+= 1;/,
  )
  assert.match(
    functionBody('isFormSelectionAttemptCurrent'),
    /selectionAttempt === formSelectionAttempt[\s\S]*?selectionSession === formSelectionSession[\s\S]*?projectId === props\.projectId/,
  )
  assert.match(
    body,
    /if \(\(currentForm\?\.id \?\? null\) === \(nextForm\?\.id \?\? null\)\) \{[\s\S]*?formSelectionAttempt \+= 1;[\s\S]*?return;[\s\S]*?\}/,
  )
  assert.match(body, /const selectionSession = formSelectionSession;[\s\S]*?const projectId = props\.projectId;[\s\S]*?const selectionAttempt = \+\+formSelectionAttempt;/)
  assert.match(body, /if \(!isFormSelectionAttemptCurrent\(selectionAttempt, selectionSession, projectId\)\) return;/)
  assert.match(
    body,
    /if \(designerHistory\.busy\.value \|\| isReordering\.value \|\| savingDraft\.value\) \{[\s\S]*?formsTableRef\.value\?\.setCurrentRow\(currentForm\);[\s\S]*?return;/,
  )
  assert.match(body, /invalidateFormSelectionSession\(\);[\s\S]*?selectedForm\.value = nextForm \|\| null;/)
  assert.doesNotMatch(body, /\+\+formSelectionSession/)
  assert.match(functionBody('resolveDesignerLeave'), /formSelectionAttempt \+= 1;/)
  assert.match(functionBody('canLeaveProject'), /return resolveDesignerLeave\(\{ actionText: '切换项目' \}\)/)
  assert.match(
    functionBody('canLeaveTab'),
    /const ok = await resolveDesignerLeave\(\{ actionText: '切换标签页' \}\);[\s\S]*if \(ff\) selectField\(ff\);[\s\S]*else resetFieldPropAutoSaveState\(\);[\s\S]*return ok/,
  )
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
  assert.match(functionBody('onDragStart'), /if \(designerHistory\.busy\.value \|\| isReordering\.value \|\| isFieldMembershipBusy\(\)\) \{[\s\S]*return;/)
  assert.match(functionBody('onDrop'), /if \(designerHistory\.busy\.value \|\| isReordering\.value \|\| isFieldMembershipBusy\(\)\) return;/)
  assert.match(functionBody('handleFieldKeydown'), /if \(ctrlKey && \(designerHistory\.busy\.value \|\| isReordering\.value \|\| isFieldMembershipBusy\(\)\)\) return;/)
  assert.match(functionBody('handleFieldKeydown'), /if \(designerHistory\.busy\.value \|\| isReordering\.value \|\| isFieldMembershipBusy\(\)\) return;/)
})

test('history-producing designer controls and property forms are disabled during replay', () => {
  assert.match(designerSource, /data-test="designer-field-library-add"[\s\S]*?:disabled="designerHistory\.busy\.value"/)
  assert.match(designerSource, /data-test="designer-new-field"[\s\S]*?:disabled="designerHistory\.busy\.value \|\| isReordering\.value"/)
  assert.match(designerSource, /data-test="designer-save-draft"[\s\S]*?:disabled="designerHistory\.busy\.value"/)
  assert.match(designerSource, /data-test="designer-add-log-row"[\s\S]*?:disabled="designerHistory\.busy\.value"/)
  assert.match(designerSource, /data-test="designer-batch-delete"[\s\S]*?:disabled="designerHistory\.busy\.value"/)
  assert.match(designerSource, /data-test="designer-copy-field"[\s\S]*?:disabled="copyingFieldIds\.has\(ff\.id\) \|\| designerHistory\.busy\.value"/)
  assert.match(designerSource, /data-test="designer-delete-field"[\s\S]*?:disabled="!isDraftField\(ff\) && designerHistory\.busy\.value"/)
  assert.match(designerSource, /:draggable="!designerHistory\.busy\.value && !isReordering && !isFieldMembershipBusy\(\)"/)
  assert.match(designerSource, /data-test="designer-log-property-form"[\s\S]*?:disabled="designerHistory\.busy\.value"/)
  assert.match(designerSource, /data-test="designer-field-property-form"[\s\S]*?:disabled="designerHistory\.busy\.value"/)
  assert.match(designerSource, /data-test="designer-draft-save"[\s\S]*?:disabled="designerHistory\.busy\.value"/)
})

test('membership-changing actions, history replay, and leave guards all block reorder/draft-sensitive flows', () => {
  assert.match(designerSource, /const fieldMembershipMutationCount = ref\(0\)/)
  assert.match(functionBody('isFieldMembershipBusy'), /fieldMembershipMutationCount\.value > 0/)
  assert.match(functionBody('beginFieldMembershipMutation'), /fieldMembershipMutationCount\.value \+= 1/)
  assert.match(
    functionBody('endFieldMembershipMutation'),
    /fieldMembershipMutationCount\.value = Math\.max\(0, fieldMembershipMutationCount\.value - 1\)/,
  )
  for (const name of ['addField', 'copyFormField', 'removeField', 'batchDelete', 'newField', 'saveDraftField', 'addLogRow']) {
    assert.match(functionBody(name), /isReordering\.value/, `${name} should reject while reorder persistence is active`)
  }
  for (const name of ['addField', 'copyFormField', 'removeField', 'batchDelete', 'saveDraftField', 'addLogRow']) {
    assert.match(functionBody(name), /beginFieldMembershipMutation\(\)/, `${name} should mark membership mutation in-flight`)
    assert.match(functionBody(name), /endFieldMembershipMutation\(\)/, `${name} should clear membership mutation in-flight`)
  }
  assert.match(functionBody('persistFieldReorder'), /if \(isReordering\.value \|\| isFieldMembershipBusy\(\)\) return false/)
  assert.match(functionBody('onDragStart'), /isFieldMembershipBusy\(\)/)
  assert.match(functionBody('onDrop'), /isFieldMembershipBusy\(\)/)
  assert.match(functionBody('handleFieldKeydown'), /isFieldMembershipBusy\(\)/)
  assert.match(
    designerSource,
    /:draggable="!designerHistory\.busy\.value && !isReordering && !isFieldMembershipBusy\(\)"/,
  )
  assert.match(functionBody('runHistory'), /if \(designerHistory\.busy\.value \|\| isReordering\.value \|\| savingDraft\.value\) return;/)
  assert.match(
    functionBody('runHistory'),
    /historyContext = captureDesignerHistoryContext\(\)[\s\S]*?await confirmDiscardDraft\(\);[\s\S]*?if \(historyContext && !isCurrentDesignerHistoryContext\(historyContext\)\) return;[\s\S]*?if \(!proceed\) return;/,
  )
  assert.match(functionBody('saveFieldProp'), /if \(!isReordering\.value\) \{[\s\S]*?await loadFormFields\(\);[\s\S]*?\}/)
  assert.match(
    functionBody('saveQuickEdit'),
    /historyContext = captureDesignerHistoryContext\(\)[\s\S]*?api\.invalidateCache\(`\/api\/forms\/\$\{formId\}\/fields`\);[\s\S]*?if \(!isCurrentDesignerHistoryContext\(historyContext\)\) return;/,
  )
  assert.match(
    functionBody('saveQuickEdit'),
    /if \(isReordering\.value\) return;[\s\S]*?if \(!isReordering\.value\) \{\s*await loadFormFields\(formId\);/,
  )
  assert.match(
    functionBody('toggleInline'),
    /historyContext = captureDesignerHistoryContext\(\)[\s\S]*?await confirmFormChange\(\);[\s\S]*?if \(!isCurrentDesignerHistoryContext\(historyContext\) \|\| isReordering\.value\) return;/,
  )
  assert.match(
    functionBody('toggleInline'),
    /api\.invalidateCache\(`\/api\/forms\/\$\{formId\}\/fields`\);[\s\S]*?if \(!isCurrentDesignerHistoryContext\(historyContext\)\) return;[\s\S]*?if \(isReordering\.value\) \{[\s\S]*?syncSelectedField\(updatedField,[\s\S]*?return;[\s\S]*?\}[\s\S]*?await loadFormFields\(formId\);/,
  )
  assert.match(
    functionBody('resolveDesignerLeave'),
    /if \(designerHistory\.busy\.value \|\| isReordering\.value \|\| savingDraft\.value\) return false;/,
  )
  assert.match(functionBody('canLeaveProject'), /return resolveDesignerLeave\(\{ actionText: '切换项目' \}\)/)
  assert.match(
    functionBody('canLeaveTab'),
    /const ok = await resolveDesignerLeave\(\{ actionText: '切换标签页' \}\);[\s\S]*if \(ff\) selectField\(ff\);[\s\S]*else resetFieldPropAutoSaveState\(\);[\s\S]*return ok/,
  )
})
