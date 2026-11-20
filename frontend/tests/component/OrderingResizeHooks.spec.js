import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import Sortable from 'sortablejs'
import { useColumnResize } from '../../src/composables/useColumnResize'
import { useOrderableList } from '../../src/composables/useOrderableList'
import { useSortableTable } from '../../src/composables/useSortableTable'
import { api } from '../../src/composables/useApi'
import { ElMessage } from 'element-plus'

vi.mock('sortablejs', () => ({
  default: { create: vi.fn(() => ({ option: vi.fn(), destroy: vi.fn() })) },
}))

const KEY5 = 'crf:designer:col-widths:5:normal'
const KEY6 = 'crf:designer:col-widths:6:normal'

function makeHandle(width = 400) {
  const host = {
    getBoundingClientRect: () => ({ left: 0, width }),
    querySelectorAll: () => [],
  }
  host.closest = (sel) => (sel === '.col-resize-host' ? host : null)
  const handle = { setPointerCapture: vi.fn() }
  handle.closest = (sel) => (sel === '.col-resize-host' ? host : null)
  return { handle, host }
}

function resizeEvent(handle, clientX) {
  return { preventDefault: vi.fn(), currentTarget: handle, pointerId: 1, clientX }
}

describe('useColumnResize hook', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts from defaults, rehydrates on form/table-kind changes, and resetToEven clears storage', async () => {
    localStorage.setItem(KEY6, JSON.stringify([0.6, 0.4]))
    const formId = ref(5)
    const tableKind = ref('normal')
    const defaults = ref([0.25, 0.75])
    const resize = useColumnResize(formId, tableKind, defaults)
    expect(resize.colRatios).toEqual([0.25, 0.75])
    formId.value = 6
    await nextTick()
    expect(resize.colRatios).toEqual([0.6, 0.4])
    tableKind.value = 'inline-header'
    await nextTick()
    expect(resize.colRatios).toEqual([0.25, 0.75])
    defaults.value = [0.4, 0.6]
    await nextTick()
    expect(resize.colRatios).toEqual([0.4, 0.6])
    tableKind.value = 'normal'
    await nextTick()
    expect(resize.colRatios).toEqual([0.6, 0.4])
    formId.value = 5
    await nextTick()
    expect(resize.colRatios).toEqual([0.4, 0.6])
    localStorage.setItem(KEY5, JSON.stringify([0.9, 0.1]))
    resize.rehydrate()
    expect(resize.colRatios).toEqual([0.9, 0.1])
    resize.resetToEven()
    expect(resize.colRatios).toEqual([0.4, 0.6])
    expect(localStorage.getItem(KEY5)).toBeNull()
  })

  it('rejects out-of-range boundaries and hosts without a resize container', () => {
    const resize = useColumnResize(5, 'normal', [0.5, 0.5])
    const { handle } = makeHandle()
    const bad = resizeEvent(handle, 200)
    resize.onResizeStart(-1, bad)
    resize.onResizeStart(1, bad)
    expect(bad.preventDefault).not.toHaveBeenCalled()
    const orphan = { preventDefault: vi.fn(), currentTarget: {}, pointerId: 1, clientX: 200 }
    resize.onResizeStart(0, orphan)
    expect(orphan.preventDefault).toHaveBeenCalled()
    window.dispatchEvent(new Event('pointerup'))
    expect(resize.snapGuideX).toBeNull()
  })

  it('drags the boundary with snapping, clamps to the minimum and persists on pointerup', () => {
    const resize = useColumnResize(5, 'normal', [0.25, 0.75])
    const { handle } = makeHandle()
    resize.onResizeStart(0, resizeEvent(handle, 100))
    expect(handle.setPointerCapture).toHaveBeenCalledWith(1)
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 300 }))
    expect([...resize.colRatios]).toEqual([0.75, 0.25])
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 198 }))
    expect(resize.snapGuideX).toBe(200)
    expect([...resize.colRatios]).toEqual([0.5, 0.5])
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 5 }))
    expect([...resize.colRatios][0]).toBe(0.02)
    window.dispatchEvent(new Event('pointerup'))
    expect(resize.snapGuideX).toBeNull()
    expect(JSON.parse(localStorage.getItem(KEY5))[0]).toBeCloseTo(0.02, 6)
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 390 }))
    expect(resize.colRatios[0]).toBe(0.02)
  })

  it('ignores pointer moves with zero-width containers', () => {
    const resize = useColumnResize(5, 'normal', [0.5, 0.5])
    const { handle } = makeHandle()
    const { handle: zero } = makeHandle(0)
    resize.onResizeStart(0, resizeEvent(handle, 100))
    resize.onResizeStart(0, resizeEvent(zero, 100))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 300 }))
    expect([...resize.colRatios]).toEqual([0.5, 0.5])
    window.dispatchEvent(new Event('pointerup'))
    window.dispatchEvent(new Event('pointercancel'))
  })
})

describe('useOrderableList', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('crf_token', 'tok')
    api.clearAllCache()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, headers: new Headers(), text: async () => JSON.stringify({ ok: 1 }),
    }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts the id snapshot and runs the success callback', async () => {
    const { dragging, handleDragEnd } = useOrderableList('/api/x/reorder')
    expect(dragging.value).toBe(false)
    dragging.value = true
    const onSuccess = vi.fn().mockResolvedValue(undefined)
    const list = [{ id: 2 }, { id: 1 }]
    await handleDragEnd(list, onSuccess)
    expect(dragging.value).toBe(false)
    expect(onSuccess).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/api/x/reorder')
    expect(JSON.parse(init.body)).toEqual([2, 1])
  })

  it('reports failures through onError without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net')))
    const onError = vi.fn()
    const onSuccess = vi.fn()
    const { handleDragEnd } = useOrderableList('/api/y/reorder')
    await handleDragEnd([{ id: 1 }], onSuccess, onError)
    expect(onError).toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })
})

describe('useSortableTable', () => {
  function makeTableRef() {
    const tbody = {}
    return { $el: { querySelector: (sel) => (sel === '.el-table__body-wrapper tbody' ? tbody : null) } }
  }

  // onBeforeUnmount 必须在 setup() 内注册：用最小真实组件承载 composable
  function useInSetup(setupFn) {
    let result
    const wrapper = mount(defineComponent({
      setup() {
        result = setupFn()
        return () => null
      },
    }))
    return { wrapper, result }
  }

  beforeEach(() => {
    Sortable.create.mockClear()
  })

  it('skips initialization when the table body is missing and re-init destroys the old instance', () => {
    const emptyRef = { $el: { querySelector: () => null } }
    const { result: table, wrapper: w1 } = useInSetup(() => useSortableTable(emptyRef, [], '/x', { saveOrder: vi.fn() }))
    table.initSortable()
    expect(Sortable.create).not.toHaveBeenCalled()
    w1.unmount()
    const tableRef = makeTableRef()
    const { result: table2, wrapper: w2 } = useInSetup(() => useSortableTable(tableRef, [], '/x', { saveOrder: vi.fn() }))
    table2.initSortable()
    table2.initSortable()
    expect(Sortable.create).toHaveBeenCalledTimes(2)
    expect(Sortable.create.mock.calls[0][0]).toBe(tableRef.$el.querySelector('.el-table__body-wrapper tbody'))
    w2.unmount()
  })

  it('reorders the source list, saves ids, and reloads with the source indices', async () => {
    const source = [
      { id: 1, order_index: 1 },
      { id: 2, order_index: 2 },
      { id: 3, order_index: 3 },
    ]
    const saveOrder = vi.fn().mockResolvedValue(undefined)
    const reloadFn = vi.fn().mockResolvedValue(undefined)
    const { result: table, wrapper } = useInSetup(() => useSortableTable(makeTableRef(), source, '/x', { saveOrder, reloadFn }))
    table.initSortable()
    const config = Sortable.create.mock.calls[0][1]
    await config.onEnd({ oldIndex: 2, newIndex: 0 })
    expect(source.map((i) => i.id)).toEqual([3, 1, 2])
    expect(source.map((i) => i.order_index)).toEqual([1, 2, 3])
    expect(saveOrder).toHaveBeenCalledWith([3, 1, 2])
    expect(reloadFn).toHaveBeenCalledWith(2, 0)
    await config.onEnd({ oldIndex: 1, newIndex: 1 })
    await config.onEnd({ oldIndex: 0, newIndex: 2 })
    expect(source.map((i) => i.id)).toEqual([1, 2, 3])
    expect(saveOrder).toHaveBeenLastCalledWith([1, 2, 3])
    expect(reloadFn).toHaveBeenLastCalledWith(0, 2)
    wrapper.unmount()
  })

  it('ignores drops whose rendered ids cannot be resolved in the source list', async () => {
    const source = [{ id: 1 }, { id: 2 }]
    const rendered = [{ id: 1 }, { id: 99 }]
    const saveOrder = vi.fn()
    const { result: table, wrapper } = useInSetup(() => useSortableTable(makeTableRef(), source, '/x', { saveOrder, renderList: rendered }))
    table.initSortable()
    const config = Sortable.create.mock.calls[0][1]
    await config.onEnd({ oldIndex: 1, newIndex: 0 })
    expect(saveOrder).not.toHaveBeenCalled()
    await config.onEnd({ oldIndex: 0, newIndex: 1 })
    expect(saveOrder).not.toHaveBeenCalled()
    expect(source.map((i) => i.id)).toEqual([1, 2])
    wrapper.unmount()
  })

  it('warns and reloads through the recovery path when saving fails', async () => {
    const warning = vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({}))
    const source = [{ id: 1, order_index: 1 }, { id: 2, order_index: 2 }]
    const saveOrder = vi.fn().mockRejectedValue(new Error('save failed'))
    const reloadFn = vi.fn().mockResolvedValue(undefined)
    const { result: table, wrapper } = useInSetup(() => useSortableTable(makeTableRef(), source, '/x', { saveOrder, reloadFn }))
    table.initSortable()
    const config = Sortable.create.mock.calls[0][1]
    await config.onEnd({ oldIndex: 0, newIndex: 1 })
    expect(warning).toHaveBeenCalledWith('排序保存失败，已恢复')
    expect(reloadFn).toHaveBeenCalledWith(0, 1)
    warning.mockRestore()
    wrapper.unmount()
  })

  it('mirrors filter state into the sortable disabled option', async () => {
    const isFiltered = ref(false)
    const { result: table, wrapper } = useInSetup(() => useSortableTable(makeTableRef(), [{ id: 1 }], '/x', { saveOrder: vi.fn(), isFiltered }))
    table.initSortable()
    const instance = Sortable.create.mock.results[0].value
    isFiltered.value = true
    await nextTick()
    expect(instance.option).toHaveBeenCalledWith('disabled', true)
    isFiltered.value = false
    await nextTick()
    expect(instance.option).toHaveBeenLastCalledWith('disabled', false)
    wrapper.unmount()
  })
})
