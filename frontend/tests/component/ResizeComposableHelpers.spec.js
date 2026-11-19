import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import {
  useColumnResize,
  buildColumnWidthStorageKey,
  parseColumnWidthStorageKey,
  isValidColumnWidthOverrideArray,
  migrateLegacyColumnWidthKey,
  collectColumnWidthOverrides,
  readColumnWidthRatios,
  readColumnWidthRatiosWithFallback,
} from '../../src/composables/useColumnResize'
import {
  useRowResize,
  buildTableInstanceId,
  buildRowHeightStorageKey,
  readRowHeightOverrides,
  getRowHeightStyle,
  getNormalRowKey,
  getInlineHeaderRowKey,
  getInlineDataRowKey,
  getUnifiedRegularRowKey,
  getUnifiedFullRowKey,
  getUnifiedInlineHeaderRowKey,
  getUnifiedInlineDataRowKey,
} from '../../src/composables/useRowResize'
import { usePaneSplit } from '../../src/composables/usePaneSplit'

const COL_PREFIX = 'crf:designer:col-widths:'
const ROW_PREFIX = 'crf:designer:row-heights:'

describe('useColumnResize storage key helpers', () => {
  it('buildColumnWidthStorageKey returns null for missing ids and joins otherwise', () => {
    expect(buildColumnWidthStorageKey(null, 'normal')).toBeNull()
    expect(buildColumnWidthStorageKey(7, null)).toBeNull()
    expect(buildColumnWidthStorageKey(undefined, undefined)).toBeNull()
    expect(buildColumnWidthStorageKey(7, 'normal:fieldIds=1,2')).toBe(
      `${COL_PREFIX}7:normal:fieldIds=1,2`,
    )
    expect(buildColumnWidthStorageKey(0, 'x')).toBe(`${COL_PREFIX}0:x`)
  })

  it('parseColumnWidthStorageKey rejects non-prefixed keys and keeps colons in instance ids', () => {
    expect(parseColumnWidthStorageKey(null)).toBeNull()
    expect(parseColumnWidthStorageKey(42)).toBeNull()
    expect(parseColumnWidthStorageKey('crf:designer:row-heights:7:x')).toBeNull()
    expect(parseColumnWidthStorageKey(COL_PREFIX)).toBeNull()
    expect(parseColumnWidthStorageKey(`${COL_PREFIX}7:normal:fieldIds=1,2`)).toEqual({
      formId: 7,
      tableInstanceId: 'normal:fieldIds=1,2',
    })
    expect(parseColumnWidthStorageKey(`${COL_PREFIX}12:a:b:c`)).toEqual({
      formId: 12,
      tableInstanceId: 'a:b:c',
    })
  })

  it('isValidColumnWidthOverrideArray applies the loose export gate on [0,1]', () => {
    expect(isValidColumnWidthOverrideArray('x')).toBe(false)
    expect(isValidColumnWidthOverrideArray(null)).toBe(false)
    expect(isValidColumnWidthOverrideArray([])).toBe(false)
    expect(isValidColumnWidthOverrideArray([0])).toBe(true)
    expect(isValidColumnWidthOverrideArray([1])).toBe(true)
    expect(isValidColumnWidthOverrideArray([0.5, 0.5])).toBe(true)
    expect(isValidColumnWidthOverrideArray([-0.1, 1.1])).toBe(false)
    expect(isValidColumnWidthOverrideArray([Number.NaN])).toBe(false)
    expect(isValidColumnWidthOverrideArray([Number.POSITIVE_INFINITY])).toBe(false)
    expect(isValidColumnWidthOverrideArray(['0.5'])).toBe(false)
    // 导出端无和校验：和不等于 1 仍然有效
    expect(isValidColumnWidthOverrideArray([0.2, 0.2])).toBe(true)
  })
})

describe('useColumnResize legacy key migration', () => {
  beforeEach(() => localStorage.clear())

  it('is a no-op when any argument is missing', () => {
    migrateLegacyColumnWidthKey(null, 'new', 'old')
    migrateLegacyColumnWidthKey(7, '', 'old')
    migrateLegacyColumnWidthKey(7, 'new', '')
    expect(localStorage.length).toBe(0)
  })

  it('copies the legacy value to a fresh new key and deletes the legacy key', () => {
    localStorage.setItem(`${COL_PREFIX}7:0-normal-3`, JSON.stringify([0.5, 0.5]))
    migrateLegacyColumnWidthKey(7, 'normal:fieldIds=1,2,3', '0-normal-3')
    expect(localStorage.getItem(`${COL_PREFIX}7:normal:fieldIds=1,2,3`)).toBe(JSON.stringify([0.5, 0.5]))
    expect(localStorage.getItem(`${COL_PREFIX}7:0-normal-3`)).toBeNull()
  })

  it('never overwrites an existing new key but still deletes the legacy key', () => {
    localStorage.setItem(`${COL_PREFIX}7:0-normal-3`, JSON.stringify([0.5, 0.5]))
    localStorage.setItem(`${COL_PREFIX}7:normal:fieldIds=1,2,3`, JSON.stringify([0.2, 0.8]))
    migrateLegacyColumnWidthKey(7, 'normal:fieldIds=1,2,3', '0-normal-3')
    expect(localStorage.getItem(`${COL_PREFIX}7:normal:fieldIds=1,2,3`)).toBe(JSON.stringify([0.2, 0.8]))
    expect(localStorage.getItem(`${COL_PREFIX}7:0-normal-3`)).toBeNull()
  })
})

describe('collectColumnWidthOverrides', () => {
  beforeEach(() => localStorage.clear())

  it('returns an empty object for missing or empty forms', () => {
    expect(collectColumnWidthOverrides(null)).toEqual({})
    expect(collectColumnWidthOverrides([])).toEqual({})
  })

  it('collects only valid overrides of listed forms, strictly read-only', () => {
    const valid = `${COL_PREFIX}7:normal:fieldIds=1,2`
    const foreign = `${COL_PREFIX}8:normal:fieldIds=1`
    const invalid = `${COL_PREFIX}7:wide:fieldIds=3`
    const malformed = `${COL_PREFIX}7:bad:fieldIds=4`
    const legacy = `${COL_PREFIX}7:0-normal-3`
    localStorage.setItem(valid, JSON.stringify([0.5, 0.5]))
    localStorage.setItem(foreign, JSON.stringify([1]))
    localStorage.setItem(invalid, JSON.stringify([1.5]))
    localStorage.setItem(malformed, '{not json')
    localStorage.setItem(legacy, JSON.stringify([0.3, 0.3, 0.4]))
    localStorage.setItem('unrelated:key', 'x')

    const overrides = collectColumnWidthOverrides([{ id: 7 }, { id: null }, { id: 9 }])
    expect(overrides).toEqual({
      'normal:fieldIds=1,2': [0.5, 0.5],
      '0-normal-3': [0.3, 0.3, 0.4],
    })
    // 严格只读：收集后所有键原样保留
    expect(localStorage.getItem(valid)).toBe(JSON.stringify([0.5, 0.5]))
    expect(localStorage.getItem(legacy)).toBe(JSON.stringify([0.3, 0.3, 0.4]))
  })

  it('skips empty raw values and empty array overrides', () => {
    localStorage.setItem(`${COL_PREFIX}7:a`, '')
    localStorage.setItem(`${COL_PREFIX}7:b`, '[]')
    expect(collectColumnWidthOverrides([{ id: 7 }])).toEqual({})
  })
})

describe('readColumnWidthRatios strict gate', () => {
  beforeEach(() => localStorage.clear())

  it('returns null for missing ids or unreadable storage', () => {
    expect(readColumnWidthRatios(null, 'normal', 2)).toBeNull()
    expect(readColumnWidthRatios(7, null, 2)).toBeNull()
    expect(readColumnWidthRatios(7, 'normal', 2)).toBeNull()
  })

  it('accepts only finite ratios within [0.02,0.98] whose sum is 1 and length matches', () => {
    localStorage.setItem(`${COL_PREFIX}7:normal`, JSON.stringify([0.3, 0.7]))
    expect(readColumnWidthRatios(7, 'normal', 2)).toEqual([0.3, 0.7])
  })

  it('rejects wrong length, out-of-range, non-finite, bad sum and malformed JSON', () => {
    localStorage.setItem(`${COL_PREFIX}7:a`, JSON.stringify([0.5, 0.5]))
    expect(readColumnWidthRatios(7, 'a', 3)).toBeNull()
    localStorage.setItem(`${COL_PREFIX}7:b`, JSON.stringify([0.01, 0.99]))
    expect(readColumnWidthRatios(7, 'b', 2)).toBeNull()
    localStorage.setItem(`${COL_PREFIX}7:c`, JSON.stringify([Number.NaN, 0.5]))
    expect(readColumnWidthRatios(7, 'c', 2)).toBeNull()
    localStorage.setItem(`${COL_PREFIX}7:d`, JSON.stringify([0.5, 0.4]))
    expect(readColumnWidthRatios(7, 'd', 2)).toBeNull()
    localStorage.setItem(`${COL_PREFIX}7:e`, '["x", 0.5]')
    expect(readColumnWidthRatios(7, 'e', 2)).toBeNull()
    localStorage.setItem(`${COL_PREFIX}7:f`, 'nope')
    expect(readColumnWidthRatios(7, 'f', 2)).toBeNull()
    // 容差门：1e-3 内的误差可接受
    localStorage.setItem(`${COL_PREFIX}7:g`, JSON.stringify([0.3, 0.7005]))
    expect(readColumnWidthRatios(7, 'g', 2)).toEqual([0.3, 0.7005])
    localStorage.setItem(`${COL_PREFIX}7:h`, JSON.stringify([0.3, 0.702]))
    expect(readColumnWidthRatios(7, 'h', 2)).toBeNull()
  })

  it('falls back to the legacy table kind only when the current read misses', () => {
    localStorage.setItem(`${COL_PREFIX}9:legacy-kind`, JSON.stringify([0.25, 0.75]))
    expect(readColumnWidthRatiosWithFallback(9, 'current-kind', 2, 'legacy-kind')).toEqual([0.25, 0.75])
    localStorage.setItem(`${COL_PREFIX}9:current-kind`, JSON.stringify([0.4, 0.6]))
    expect(readColumnWidthRatiosWithFallback(9, 'current-kind', 2, 'legacy-kind')).toEqual([0.4, 0.6])
    expect(readColumnWidthRatiosWithFallback(10, 'none', 2, 'also-none')).toBeNull()
  })
})

describe('useRowResize pure helpers', () => {
  beforeEach(() => localStorage.clear())

  it('buildTableInstanceId joins field ids and tolerates missing fields', () => {
    const fields = [{ id: 1 }, { id: null }, { id: 3 }]
    expect(buildTableInstanceId('normal', fields)).toBe('normal:fieldIds=1,3')
    expect(buildTableInstanceId('normal', fields)).toBe('normal:fieldIds=1,3')
    expect(buildTableInstanceId('inline-header', fields)).toBe('inline-header:fieldIds=1,3')
    expect(buildTableInstanceId('normal', null)).toBe('normal:fieldIds=')
    expect(buildTableInstanceId('normal', undefined)).toBe('normal:fieldIds=')
  })

  it('buildRowHeightStorageKey returns null for missing parts', () => {
    expect(buildRowHeightStorageKey(null, 'x')).toBeNull()
    expect(buildRowHeightStorageKey(7, '')).toBeNull()
    expect(buildRowHeightStorageKey(7, 'normal:fieldIds=1')).toBe(`${ROW_PREFIX}7:normal:fieldIds=1`)
  })

  it('readRowHeightOverrides clamps to [28,240], rounds, and drops invalid entries', () => {
    localStorage.setItem(`${ROW_PREFIX}7:inst`, JSON.stringify({
      r1: 50.6, r2: 10, r3: 1000, r4: 'bad', '': 5, r5: 240,
    }))
    expect(readRowHeightOverrides(7, 'inst')).toEqual({ r1: 51, r2: 28, r3: 240, r5: 240 })
    expect(readRowHeightOverrides(7, 'missing')).toEqual({})
    localStorage.setItem(`${ROW_PREFIX}7:arr`, JSON.stringify([30]))
    expect(readRowHeightOverrides(7, 'arr')).toEqual({})
    localStorage.setItem(`${ROW_PREFIX}7:bad`, '{oops')
    expect(readRowHeightOverrides(7, 'bad')).toEqual({})
    expect(readRowHeightOverrides(null, 'inst')).toEqual({})
  })

  it('getRowHeightStyle renders px styles only for finite heights', () => {
    expect(getRowHeightStyle({ r1: 42 }, 'r1')).toEqual({ height: '42px' })
    expect(getRowHeightStyle({ r1: 42 }, 'missing')).toBeNull()
    expect(getRowHeightStyle({ r1: '42' }, 'r1')).toBeNull()
    expect(getRowHeightStyle(null, 'r1')).toBeNull()
    expect(getRowHeightStyle({ r1: Number.NaN }, 'r1')).toBeNull()
  })

  it('row key builders compose stable keys', () => {
    const fields = [{ id: 1 }, { id: 2 }]
    expect(getNormalRowKey({ id: 5 })).toBe('field:5')
    expect(getNormalRowKey({})).toBe('field:unknown')
    expect(getNormalRowKey(null)).toBe('field:unknown')
    expect(getInlineHeaderRowKey(fields)).toBe('inline-header:1,2')
    expect(getInlineDataRowKey(fields, 3)).toBe('inline-row:1,2:3')
    expect(getUnifiedRegularRowKey({ id: 7 })).toBe('unified-regular:7')
    expect(getUnifiedFullRowKey({ id: 8 })).toBe('unified-full:8')
    expect(getUnifiedInlineHeaderRowKey(fields)).toBe('unified-inline-header:1,2')
    expect(getUnifiedInlineDataRowKey(fields, 0)).toBe('unified-inline-row:1,2:0')
    expect(getUnifiedInlineDataRowKey(fields)).toBe('unified-inline-row:1,2:undefined')
  })
})

function fakeResizeEvent({ clientX = 0, clientY = 0, rect = { top: 0, height: 400, left: 0, width: 400 } } = {}) {
  const preventDefault = vi.fn()
  const currentTarget = { parentElement: { getBoundingClientRect: () => rect } }
  return { currentTarget, preventDefault, clientX, clientY }
}

describe('usePaneSplit', () => {
  beforeEach(() => localStorage.clear())

  it('starts from the stored ratio, clamped into the configured range', () => {
    localStorage.setItem('ps-a', '0.5')
    expect(usePaneSplit('ps-a', 0.3).ratio.value).toBe(0.5)
    localStorage.setItem('ps-b', '0.99')
    expect(usePaneSplit('ps-b', 0.3).ratio.value).toBe(0.88)
    localStorage.setItem('ps-c', '0.01')
    expect(usePaneSplit('ps-c', 0.3).ratio.value).toBe(0.12)
    localStorage.setItem('ps-d', 'abc')
    expect(usePaneSplit('ps-d', 0.3).ratio.value).toBe(0.3)
    localStorage.setItem('ps-e', '')
    expect(usePaneSplit('ps-e', 0.25).ratio.value).toBe(0.25)
    expect(usePaneSplit(null, 0.4).ratio.value).toBe(0.4)
  })

  it('honours custom min/max and clamps non-finite defaults to min', () => {
    expect(usePaneSplit('ps-f', 2, { min: 0.5, max: 0.6 }).ratio.value).toBe(0.6)
    expect(usePaneSplit('ps-g', Number.NaN, { min: 0.2, max: 0.8 }).ratio.value).toBe(0.2)
    expect(usePaneSplit('ps-h', 0.5, { min: 0.5, max: 0.5 }).ratio.value).toBe(0.5)
  })

  it('persists ratio changes through its watcher', async () => {
    const { ratio } = usePaneSplit('ps-i', 0.5)
    ratio.value = 0.42
    await nextTick()
    expect(localStorage.getItem('ps-i')).toBe('0.42')
  })

  it('drag adjusts the ratio and clamps at min/max, vertical axis by default', () => {
    const { ratio, startResize } = usePaneSplit(null, 0.5)
    startResize(fakeResizeEvent({ clientY: 200 }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 400 }))
    expect(ratio.value).toBe(0.88)
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 0 }))
    expect(ratio.value).toBe(0.12)
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 220 }))
    expect(ratio.value).toBe(0.5 + 20 / 400)
    // 结束本次拖拽：释放 document 上的临时监听（不结束会跨用例泄漏），并证明已摘除。
    document.dispatchEvent(new MouseEvent('mouseup', { clientY: 220 }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 400 }))
    expect(ratio.value).toBe(0.5 + 20 / 400)
  })

  it('horizontal axis follows clientX and mouseup detaches the listeners', () => {
    const { ratio, startResize } = usePaneSplit(null, 0.5, { axis: 'horizontal' })
    startResize(fakeResizeEvent({ clientX: 100 }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 200 }))
    expect(ratio.value).toBe(0.75)
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 200 }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 400 }))
    expect(ratio.value).toBe(0.75)
  })

  it('ignores startResize when the container has no measurable size', () => {
    const { ratio, startResize } = usePaneSplit(null, 0.5)
    startResize(fakeResizeEvent({ rect: { top: 0, height: 0, left: 0, width: 400 } }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 400 }))
    expect(ratio.value).toBe(0.5)
    startResize({ currentTarget: null, preventDefault: vi.fn(), clientY: 0 })
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 400 }))
    expect(ratio.value).toBe(0.5)
  })
})

describe('useRowResize hook', () => {
  beforeEach(() => localStorage.clear())

  function makeEvent({ clientY = 0, height = 60, pointerId = 1, withRow = true } = {}) {
    const setPointerCapture = vi.fn()
    const row = withRow ? { getBoundingClientRect: () => ({ height }) } : null
    const currentTarget = {
      closest: (sel) => (sel === 'tr' ? row : null),
      setPointerCapture,
    }
    return { preventDefault: vi.fn(), currentTarget, clientY, pointerId }
  }

  it('starts from storage, rehydrates on form/kind changes and exposes style access', async () => {
    localStorage.setItem('crf:designer:row-heights:5:normal:fieldIds=1', JSON.stringify({ r1: 44 }))
    const formId = ref(5)
    const kind = ref('normal:fieldIds=1')
    const hook = useRowResize(formId, kind)
    expect(hook.rowHeights).toEqual({ r1: 44 })
    expect(hook.getRowHeightStyle('r1')).toEqual({ height: '44px' })
    localStorage.setItem('crf:designer:row-heights:6:normal:fieldIds=1', JSON.stringify({ r2: 66 }))
    formId.value = 6
    await nextTick()
    expect(hook.rowHeights).toEqual({ r2: 66 })
    kind.value = 'other'
    await nextTick()
    expect(hook.rowHeights).toEqual({})
  })

  it('rejects resize starts without a row key or a table row', () => {
    const hook = useRowResize(5, 'x')
    const noKey = makeEvent()
    hook.onResizeStart('', noKey)
    expect(noKey.preventDefault).not.toHaveBeenCalled()
    const noRow = makeEvent({ withRow: false })
    hook.onResizeStart('r1', noRow)
    expect(noRow.preventDefault).not.toHaveBeenCalled()
    window.dispatchEvent(new Event('pointerup'))
    expect(hook.rowHeights).toEqual({})
  })

  it('drags the row height with clamping and persists on pointerup', () => {
    const hook = useRowResize(5, 'normal:fieldIds=1')
    const ev = makeEvent({ clientY: 200, height: 60 })
    hook.onResizeStart('r1', ev)
    expect(ev.preventDefault).toHaveBeenCalled()
    expect(ev.currentTarget.setPointerCapture).toHaveBeenCalledWith(1)
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 260 }))
    expect(hook.rowHeights.r1).toBe(120)
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 100000 }))
    expect(hook.rowHeights.r1).toBe(240)
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: -100000 }))
    expect(hook.rowHeights.r1).toBe(28)
    window.dispatchEvent(new Event('pointerup'))
    expect(JSON.parse(localStorage.getItem('crf:designer:row-heights:5:normal:fieldIds=1'))).toEqual({ r1: 28 })
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 900 }))
    expect(hook.rowHeights.r1).toBe(28)
  })

  it('keeps prior heights while dragging and swallows pointer capture failures', () => {
    localStorage.setItem('crf:designer:row-heights:7:x', JSON.stringify({ keep: 50 }))
    const hook = useRowResize(7, 'x')
    const throwing = {
      preventDefault: vi.fn(),
      currentTarget: {
        closest: () => ({ getBoundingClientRect: () => ({ height: 40 }) }),
        setPointerCapture: () => { throw new Error('no capture') },
      },
      clientY: 10,
      pointerId: 3,
    }
    hook.onResizeStart('r2', throwing)
    expect(throwing.preventDefault).toHaveBeenCalled()
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 40 }))
    expect(hook.rowHeights).toEqual({ keep: 50, r2: 70 })
    window.dispatchEvent(new Event('pointercancel'))
    expect(JSON.parse(localStorage.getItem('crf:designer:row-heights:7:x'))).toEqual({ keep: 50, r2: 70 })
  })
})

function resizeEvent(handle, clientX) {
  return { preventDefault: vi.fn(), currentTarget: handle, pointerId: 1, clientX }
}

function makeHandle(width = 400, siblingRects = []) {
  const siblings = siblingRects.map((rect) => ({ getBoundingClientRect: () => rect }))
  const host = {
    getBoundingClientRect: () => ({ left: 0, width }),
    querySelectorAll: (sel) => (sel === '.resizer-handle' ? siblings : []),
  }
  host.closest = (sel) => (sel === '.col-resize-host' ? host : null)
  const handle = { setPointerCapture: vi.fn() }
  handle.closest = (sel) => (sel === '.col-resize-host' ? host : null)
  return { handle, host }
}

describe('useColumnResize boundary snapping', () => {
  beforeEach(() => localStorage.clear())

  it('snaps to sibling handle boundaries inside the movable window and ignores invalid rects', () => {
    // 邻列把手中心在 clientX 240（比率 0.6）；拖动边界可移动窗口为 [0.3, 0.7]
    const { handle } = makeHandle(400, [
      { left: 240, width: 8 },
      { left: 1000, width: Number.NaN },
      null,
    ])
    const resize = useColumnResize(5, 'normal', [0.3, 0.7])
    resize.onResizeStart(0, resizeEvent(handle, 120))
    // 198px 处距 0.5 吸附锚 2px → 吸附到锚点 200px（SNAP_ANCHORS 同样生效）
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 198 }))
    expect(resize.snapGuideX).toBe(200)
    expect([...resize.colRatios]).toEqual([0.5, 0.5])
    // 230px 处距锚 0.5/0.667 均超过 6px，距把手中心 240px 为 10px → 直接跟随
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 230 }))
    expect(resize.snapGuideX).toBeNull()
    expect(resize.colRatios[0]).toBeCloseTo(0.575, 6)
    expect(resize.colRatios[1]).toBeCloseTo(0.425, 6)
    // 244px 恰为把手中心（left 240 + width 8 / 2）→ 吸附到邻列边界（比率 0.61）
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 244 }))
    expect(resize.snapGuideX).toBe(244)
    expect(resize.colRatios[0]).toBeCloseTo(0.61, 6)
    expect(resize.colRatios[1]).toBeCloseTo(0.39, 6)
    // 350px（比率 0.875）在可移动窗口 [0.02, 0.98] 内 → 直接跟随
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 350 }))
    expect(resize.snapGuideX).toBeNull()
    expect([...resize.colRatios][0]).toBeCloseTo(0.875, 6)
    window.dispatchEvent(new Event('pointerup'))
    expect(resize.snapGuideX).toBeNull()
  })

  it('zero-width containers disable both snapping and dragging', () => {
    const { handle } = makeHandle(0, [{ left: 240, width: 8 }])
    const resize = useColumnResize(5, 'normal', [0.5, 0.5])
    resize.onResizeStart(0, resizeEvent(handle, 0))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 300 }))
    expect([...resize.colRatios]).toEqual([0.5, 0.5])
    expect(resize.snapGuideX).toBeNull()
    window.dispatchEvent(new Event('pointerup'))
  })
})
