import test from 'node:test'
import assert from 'node:assert/strict'

import { useDesignerHistory, MAX_HISTORY } from '../src/composables/useDesignerHistory.js'

function noop() {
  return Promise.resolve()
}

test('empty stacks disable undo and redo', () => {
  const history = useDesignerHistory()
  assert.equal(history.canUndo.value, false)
  assert.equal(history.canRedo.value, false)
})

test('recording enables undo and disables redo', () => {
  const history = useDesignerHistory()
  history.record({ label: 'op', ids: { ffId: 1 }, undo: noop, redo: noop })
  assert.equal(history.canUndo.value, true)
  assert.equal(history.canRedo.value, false)
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
