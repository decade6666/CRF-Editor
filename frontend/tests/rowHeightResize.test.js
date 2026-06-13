import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function createLocalStorageStub() {
  const store = new Map()
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value))
    },
    removeItem: (key) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  }
}

function createWindowStub() {
  const listeners = new Map()
  return {
    listeners,
    window: {
      addEventListener(type, listener) {
        listeners.set(type, listener)
      },
      removeEventListener(type, listener) {
        if (listeners.get(type) === listener) listeners.delete(type)
      },
    },
  }
}

test('useRowResize rehydrates persisted row heights by form and table instance', async () => {
  const ls = createLocalStorageStub()
  globalThis.localStorage = ls
  ls.setItem('crf:designer:row-heights:42:normal:fieldIds=1,2', JSON.stringify({ 'field:1': 44 }))

  const { useRowResize } = await import('../src/composables/useRowResize.js')
  const { ref } = await import('vue')

  const state = useRowResize(ref(42), ref('normal:fieldIds=1,2'))
  assert.equal(state.rowHeights['field:1'], 44)

  delete globalThis.localStorage
})

test('useRowResize persists updated row heights on pointer release', async () => {
  const ls = createLocalStorageStub()
  const windowStub = createWindowStub()
  globalThis.localStorage = ls
  globalThis.window = windowStub.window

  const { useRowResize } = await import('../src/composables/useRowResize.js')
  const { ref } = await import('vue')

  const state = useRowResize(ref(42), ref('normal:fieldIds=1,2'))
  const handle = {
    closest(selector) {
      if (selector === 'tr') {
        return {
          getBoundingClientRect() {
            return { height: 36 }
          },
        }
      }
      return null
    },
    setPointerCapture() {},
  }

  state.onResizeStart('field:1', {
    clientY: 100,
    pointerId: 1,
    currentTarget: handle,
    preventDefault() {},
  })

  windowStub.listeners.get('pointermove')({ clientY: 124 })
  assert.equal(state.rowHeights['field:1'], 60)

  windowStub.listeners.get('pointerup')()
  assert.equal(
    ls.getItem('crf:designer:row-heights:42:normal:fieldIds=1,2'),
    JSON.stringify({ 'field:1': 60 }),
  )

  delete globalThis.localStorage
  delete globalThis.window
})

test('row height helper exports stable row keys for inline and unified rows', async () => {
  const helpers = await import('../src/composables/useRowResize.js')

  assert.equal(helpers.getNormalRowKey({ id: 1 }), 'field:1')
  assert.equal(helpers.getInlineHeaderRowKey([{ id: 3 }, { id: 4 }]), 'inline-header:3,4')
  assert.equal(helpers.getInlineDataRowKey([{ id: 3 }, { id: 4 }], 2), 'inline-row:3,4:2')
  assert.equal(helpers.getUnifiedRegularRowKey({ id: 5 }), 'unified-regular:5')
  assert.equal(helpers.getUnifiedFullRowKey({ id: 6 }), 'unified-full:6')
  assert.equal(helpers.getUnifiedInlineHeaderRowKey([{ id: 7 }, { id: 8 }]), 'unified-inline-header:7,8')
  assert.equal(helpers.getUnifiedInlineDataRowKey([{ id: 7 }, { id: 8 }], 1), 'unified-inline-row:7,8:1')
})

function readComponentSource(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const previewComponents = [
  ['FormDesignerTab', '../src/components/FormDesignerTab.vue'],
  ['VisitsTab', '../src/components/VisitsTab.vue'],
]

for (const [name, relativePath] of previewComponents) {
  // 行高手柄需覆盖整行：表格字段（横向表格）每个单元格、非表格字段左右两列都要可拖拽。
  test(`${name} row resize handle covers every cell of a row`, () => {
    const source = readComponentSource(relativePath)

    // 非表格字段左侧 label 列也要成为拖拽锚点并带手柄。
    assert.match(source, /class="wp-label row-resize-anchor"/)
    assert.match(source, /class="unified-label row-resize-anchor"/)

    // 表格字段不再把手柄限制在最后一列：旧的“仅末列”守卫必须移除。
    assert.doesNotMatch(source, /v-if="ci === row\.length - 1"/)
    assert.doesNotMatch(source, /v-if="idx === seg\.fields\.length - 1"/)
    assert.doesNotMatch(source, /'row-resize-anchor': ci === row\.length - 1/)
    assert.doesNotMatch(source, /'row-resize-anchor': idx === seg\.fields\.length - 1/)
  })
}
