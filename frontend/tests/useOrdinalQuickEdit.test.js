import test from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'
import { clampOrdinal, useOrdinalQuickEdit } from '../src/composables/useOrdinalQuickEdit.js'

function buildHarness(items, options = {}) {
  const source = ref(items)
  const submittedOrders = []
  const restoreMessages = []
  let reloadCount = 0

  const quickEdit = useOrdinalQuickEdit(source, '/api/reorder', {
    applyList: (nextList) => {
      source.value = nextList
    },
    notifyRestore: (message) => {
      restoreMessages.push(message)
    },
    saveOrder: async (ids) => {
      submittedOrders.push(ids)
      if (options.shouldFail) {
        throw new Error('boom')
      }
    },
    reloadFn: async () => {
      reloadCount += 1
    },
    ...options,
  })

  return {
    source,
    quickEdit,
    submittedOrders,
    restoreMessages,
    getReloadCount: () => reloadCount,
  }
}

test('clampOrdinal keeps values within the allowed range', () => {
  assert.equal(clampOrdinal(0, 1, 5), 1)
  assert.equal(clampOrdinal(3, 1, 5), 3)
  assert.equal(clampOrdinal(9, 1, 5), 5)
})

test('startEdit respects filtered state and cancelEdit clears draft state', () => {
  const filtered = ref(true)
  const source = ref([{ id: 1, order_index: 1 }])
  const quickEdit = useOrdinalQuickEdit(source, '/api/reorder', {
    applyList: (nextList) => {
      source.value = nextList
    },
    isFiltered: filtered,
    saveOrder: async () => {},
    notifyRestore: () => {},
  })

  assert.equal(quickEdit.startEdit(source.value[0]), false)
  assert.equal(quickEdit.editingId.value, null)

  filtered.value = false
  assert.equal(quickEdit.startEdit(source.value[0]), true)
  assert.equal(quickEdit.editingId.value, 1)
  assert.equal(quickEdit.editingValue.value, 1)

  quickEdit.cancelEdit()
  assert.equal(quickEdit.editingId.value, null)
  assert.equal(quickEdit.editingValue.value, 1)
})

test('commitEdit moves the row to the requested ordinal and resequences order_index', async () => {
  const harness = buildHarness([
    { id: 1, order_index: 1, name: 'A' },
    { id: 2, order_index: 2, name: 'B' },
    { id: 3, order_index: 3, name: 'C' },
  ])

  assert.equal(harness.quickEdit.startEdit(harness.source.value[2]), true)
  harness.quickEdit.editingValue.value = 1

  const committed = await harness.quickEdit.commitEdit()

  assert.equal(committed, true)
  assert.deepEqual(harness.source.value.map((item) => item.id), [3, 1, 2])
  assert.deepEqual(harness.source.value.map((item) => item.order_index), [1, 2, 3])
  assert.deepEqual(harness.submittedOrders, [[3, 1, 2]])
  assert.equal(harness.getReloadCount(), 1)
  assert.equal(harness.quickEdit.editingId.value, null)
})

test('commitEdit resequences custom order keys such as visit form sequence', async () => {
  const harness = buildHarness(
    [
      { id: 11, sequence: 1, name: '表单A' },
      { id: 22, sequence: 2, name: '表单B' },
      { id: 33, sequence: 3, name: '表单C' },
    ],
    { orderKey: 'sequence' },
  )

  assert.equal(harness.quickEdit.startEdit(harness.source.value[0]), true)
  harness.quickEdit.editingValue.value = 3

  const committed = await harness.quickEdit.commitEdit()

  assert.equal(committed, true)
  assert.deepEqual(harness.source.value.map((item) => item.id), [22, 33, 11])
  assert.deepEqual(harness.source.value.map((item) => item.sequence), [1, 2, 3])
  assert.deepEqual(harness.submittedOrders, [[22, 33, 11]])
})

test('commitEdit uses rendered ordinals when source list contains hidden rows', async () => {
  const source = ref([
    { id: 1, order_index: 1, label: '可见A', hidden: false },
    { id: 99, order_index: 2, label: '隐藏行', hidden: true },
    { id: 2, order_index: 3, label: '可见B', hidden: false },
  ])
  const renderList = ref(source.value.filter((item) => !item.hidden))
  const submittedOrders = []

  const quickEdit = useOrdinalQuickEdit(source, '/api/reorder', {
    applyList: (nextList) => {
      source.value = nextList
      renderList.value = nextList.filter((item) => !item.hidden)
    },
    renderList,
    saveOrder: async (ids) => {
      submittedOrders.push(ids)
    },
    notifyRestore: () => {},
  })

  assert.equal(quickEdit.startEdit(renderList.value[1]), true)
  assert.equal(quickEdit.editingValue.value, 2)
  quickEdit.editingValue.value = 1

  const committed = await quickEdit.commitEdit()

  assert.equal(committed, true)
  assert.deepEqual(source.value.map((item) => item.id), [2, 1, 99])
  assert.deepEqual(renderList.value.map((item) => item.id), [2, 1])
  assert.deepEqual(submittedOrders, [[2, 1, 99]])
})

test('commitEdit is a no-op when the target ordinal matches the current row', async () => {
  const harness = buildHarness([
    { id: 1, order_index: 1 },
    { id: 2, order_index: 2 },
  ])

  assert.equal(harness.quickEdit.startEdit(harness.source.value[1]), true)
  harness.quickEdit.editingValue.value = 2

  const committed = await harness.quickEdit.commitEdit()

  assert.equal(committed, false)
  assert.deepEqual(harness.source.value.map((item) => item.id), [1, 2])
  assert.deepEqual(harness.submittedOrders, [])
  assert.equal(harness.getReloadCount(), 0)
})

test('commitEdit ignores out-of-range values instead of posting a clamped reorder', async () => {
  const harness = buildHarness([
    { id: 1, order_index: 1 },
    { id: 2, order_index: 2 },
    { id: 3, order_index: 3 },
  ])

  assert.equal(harness.quickEdit.startEdit(harness.source.value[1]), true)
  harness.quickEdit.editingValue.value = 99

  const committed = await harness.quickEdit.commitEdit()

  assert.equal(committed, false)
  assert.deepEqual(harness.source.value.map((item) => item.id), [1, 2, 3])
  assert.deepEqual(harness.submittedOrders, [])
  assert.equal(harness.getReloadCount(), 0)
})

test('commitEdit restores the previous order when the reorder request fails', async () => {
  const harness = buildHarness(
    [
      { id: 1, order_index: 1 },
      { id: 2, order_index: 2 },
      { id: 3, order_index: 3 },
    ],
    { shouldFail: true },
  )

  assert.equal(harness.quickEdit.startEdit(harness.source.value[0]), true)
  harness.quickEdit.editingValue.value = 3

  const committed = await harness.quickEdit.commitEdit()

  assert.equal(committed, false)
  assert.deepEqual(harness.source.value.map((item) => item.id), [1, 2, 3])
  assert.deepEqual(harness.submittedOrders, [[2, 3, 1]])
  assert.deepEqual(harness.restoreMessages, ['排序保存失败，已恢复'])
  assert.equal(harness.getReloadCount(), 1)
})

test('commitEdit keeps success state when reloadFn fails after a successful reorder', async () => {
  const reloadErrors = []
  const harness = buildHarness(
    [
      { id: 1, order_index: 1 },
      { id: 2, order_index: 2 },
      { id: 3, order_index: 3 },
    ],
    {
      reloadFn: async () => {
        throw new Error('reload failed')
      },
      notifyReloadError: (message) => {
        reloadErrors.push(message)
      },
    },
  )

  assert.equal(harness.quickEdit.startEdit(harness.source.value[2]), true)
  harness.quickEdit.editingValue.value = 1

  const committed = await harness.quickEdit.commitEdit()

  assert.equal(committed, true)
  assert.deepEqual(harness.source.value.map((item) => item.id), [3, 1, 2])
  assert.deepEqual(harness.submittedOrders, [[3, 1, 2]])
  assert.deepEqual(reloadErrors, ['列表刷新失败，请稍后重试'])
  assert.equal(harness.quickEdit.editingId.value, null)
})
