import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { effectScope, nextTick, ref } from 'vue'

import { useDesignerFormSelection } from '../src/composables/useDesignerFormSelection.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const appSource = readFileSync(path.resolve(currentDir, '../src/App.vue'), 'utf8')

function createDesigner(calls) {
  return { selectFormById: async (id) => calls.push(id) }
}

function createHarness(initialDesigner = null) {
  const designerRef = ref(initialDesigner)
  const scope = effectScope()
  let requestFormSelection
  scope.run(() => {
    requestFormSelection = useDesignerFormSelection(designerRef).requestFormSelection
  })
  return { designerRef, requestFormSelection, scope }
}

test('queues a selection until the designer ref becomes ready', async () => {
  const calls = []
  const harness = createHarness()
  try {
    const queued = harness.requestFormSelection(5)
    assert.deepEqual(calls, [])
    await queued
    assert.deepEqual(calls, [])

    harness.designerRef.value = createDesigner(calls)
    await nextTick()

    assert.deepEqual(calls, [5])
  } finally {
    harness.scope.stop()
  }
})

test('selects immediately when the designer ref is already ready', async () => {
  const calls = []
  const harness = createHarness(createDesigner(calls))
  try {
    const selection = harness.requestFormSelection(7)
    assert.deepEqual(calls, [7])
    await selection
    assert.deepEqual(calls, [7])
  } finally {
    harness.scope.stop()
  }
})

test('keeps only the latest selection request while the designer is pending', async () => {
  const calls = []
  const harness = createHarness()
  try {
    const firstRequest = harness.requestFormSelection(1)
    const latestRequest = harness.requestFormSelection(2)
    assert.deepEqual(calls, [])

    harness.designerRef.value = createDesigner(calls)
    await nextTick()
    await Promise.all([firstRequest, latestRequest])

    assert.deepEqual(calls, [2])
  } finally {
    harness.scope.stop()
  }
})

test('does not replay a queued selection after the designer remounts', async () => {
  const firstCalls = []
  const remountedCalls = []
  const harness = createHarness()
  try {
    harness.requestFormSelection(5)
    harness.designerRef.value = createDesigner(firstCalls)
    await nextTick()
    assert.deepEqual(firstCalls, [5])

    harness.designerRef.value = null
    await nextTick()
    harness.designerRef.value = createDesigner(remountedCalls)
    await nextTick()

    assert.deepEqual(remountedCalls, [])
  } finally {
    harness.scope.stop()
  }
})

test('does not replay an immediately consumed selection after remount', async () => {
  const firstCalls = []
  const remountedCalls = []
  const harness = createHarness(createDesigner(firstCalls))
  try {
    await harness.requestFormSelection(7)
    assert.deepEqual(firstCalls, [7])

    harness.designerRef.value = null
    await nextTick()
    harness.designerRef.value = createDesigner(remountedCalls)
    await nextTick()

    assert.deepEqual(remountedCalls, [])
  } finally {
    harness.scope.stop()
  }
})

test('passes a queued null form id through when the designer becomes ready', async () => {
  const calls = []
  const harness = createHarness()
  try {
    const queued = harness.requestFormSelection(null)
    harness.designerRef.value = createDesigner(calls)
    await nextTick()
    await queued

    assert.deepEqual(calls, [null])
  } finally {
    harness.scope.stop()
  }
})

test('App routes imported-form selection through the bridge without a retry loop', () => {
  const start = appSource.indexOf('async function openDesignerForImportedForm(formId)')
  assert.notEqual(start, -1, 'should locate the imported-form navigation function')
  const end = appSource.indexOf('\n}', start)
  assert.notEqual(end, -1, 'the imported-form navigation function should close')
  const body = appSource.slice(start, end)

  assert.match(body, /await requestFormSelection\(formId\);/)
  assert.doesNotMatch(body, /\btries\b/)
  assert.doesNotMatch(body, /setTimeout\(r,\s*50\)/)
})
