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

test('buildTableInstanceId stays equivalent and caches by fields reference', async () => {
  const { buildTableInstanceId } = await import('../src/composables/useRowResize.js')

  const fields = [{ id: 1 }, { id: 2 }, { id: 3 }]

  // 与原实现逐字符等价：kind:fieldIds=<逗号分隔 id>
  assert.equal(buildTableInstanceId('inline', fields), 'inline:fieldIds=1,2,3')
  // 同一引用 + 同 kind 重复调用结果稳定（命中按引用缓存）
  assert.equal(buildTableInstanceId('inline', fields), 'inline:fieldIds=1,2,3')

  // 同一引用、不同 kind 互不串扰
  assert.equal(buildTableInstanceId('unified', fields), 'unified:fieldIds=1,2,3')
  assert.equal(buildTableInstanceId('inline', fields), 'inline:fieldIds=1,2,3')

  // 不同引用但相同 id 序列 → 相同 id 字符串（缓存不影响等价性）
  const sameIdsNewRef = [{ id: 1 }, { id: 2 }, { id: 3 }]
  assert.equal(buildTableInstanceId('inline', sameIdsNewRef), 'inline:fieldIds=1,2,3')

  // 新数组（字段增删）→ id 反映新的 id 序列，不会复用旧引用结果
  const added = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
  assert.equal(buildTableInstanceId('inline', added), 'inline:fieldIds=1,2,3,4')

  // null / 空值兜底：与原实现一致，不抛错
  assert.equal(buildTableInstanceId('normal', null), 'normal:fieldIds=')
  assert.equal(buildTableInstanceId('normal', []), 'normal:fieldIds=')
})

test('buildTableInstanceId documents immutable fields reference cache contract', async () => {
  const { buildTableInstanceId } = await import('../src/composables/useRowResize.js')

  const fields = [{ id: 1 }, { id: 2 }]
  assert.equal(buildTableInstanceId('normal', fields), 'normal:fieldIds=1,2')

  // 缓存按 fields 数组引用命中；调用方若改变字段 id，必须用新数组表达，不能原地改。
  fields[0] = { id: 9 }
  assert.equal(
    buildTableInstanceId('normal', fields),
    'normal:fieldIds=1,2',
    'same fields reference keeps the cached table instance id by contract',
  )

  assert.equal(
    buildTableInstanceId('normal', [...fields]),
    'normal:fieldIds=9,2',
    'a rebuilt fields array recomputes the table instance id',
  )
})

function readComponentSource(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const mainCssSource = readComponentSource('../src/styles/main.css')

const previewComponents = [
  ['FormDesignerTab', '../src/components/FormDesignerTab.vue'],
  ['VisitsTab', '../src/components/VisitsTab.vue'],
]
test('row height hover guideline spans the full preview row', () => {
  assert.match(
    mainCssSource,
    /\.word-page tr:has\(\.row-resizer-handle:hover\) \.row-resizer-handle::after/s,
    'row resize hover must promote every cell handle in the hovered row, not only the hovered cell segment',
  )
  assert.match(
    mainCssSource,
    /\.word-page tr:has\(\.row-resizer-handle:active\) \.row-resizer-handle::after/s,
    'row resize drag state should keep the full-row guideline visible while active',
  )
})

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
