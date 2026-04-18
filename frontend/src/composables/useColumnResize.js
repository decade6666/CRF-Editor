import { reactive, ref, watch } from 'vue'

// 吸附锚点（容器宽比例）与阈值（像素）
const SNAP_ANCHORS = [0.25, 1 / 3, 0.5, 2 / 3, 0.75]
const SNAP_PX = 4
const MIN_RATIO = 0.1
const MAX_RATIO = 0.9

function readRatios(key, n) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr) || arr.length !== n) return null
    if (!arr.every(r => Number.isFinite(r) && r >= MIN_RATIO && r <= MAX_RATIO)) return null
    const sum = arr.reduce((a, b) => a + b, 0)
    if (Math.abs(sum - 1) > 1e-3) return null
    return arr
  } catch {
    return null
  }
}

function resolveValue(source) {
  if (source == null) return source
  if (typeof source === 'function') return source()
  if (typeof source === 'object' && 'value' in source) return source.value
  return source
}

function buildKey(formId, tableKind) {
  if (formId == null || tableKind == null) return null
  return `crf:designer:col-widths:${formId}:${tableKind}`
}

function evenRatios(n) {
  return Array.from({ length: n }, () => 1 / n)
}

/**
 * 表格列宽可调 composable。
 * @param {string|number|import('vue').Ref|Function} formIdRef 表单 id，支持 ref / getter / 原值
 * @param {string|import('vue').Ref|Function} tableKindRef 表格类型（如 'normal' / `inline-${N}`）
 * @param {number[]} initialRatios 默认列宽比例（总和必须为 1）
 */
export function useColumnResize(formIdRef, tableKindRef, initialRatios) {
  const n = initialRatios.length
  const defaults = [...initialRatios]

  const getKey = () => buildKey(resolveValue(formIdRef), resolveValue(tableKindRef))

  const colRatios = ref((() => {
    const k = getKey()
    return (k ? readRatios(k, n) : null) ?? [...defaults]
  })())
  const snapGuideX = ref(null)

  // 切换 form / tableKind 时重读持久化值
  const rehydrate = () => {
    const k = getKey()
    const loaded = k ? readRatios(k, n) : null
    colRatios.value = loaded ?? [...defaults]
  }
  if (formIdRef && typeof formIdRef === 'object' && 'value' in formIdRef) {
    watch(formIdRef, rehydrate)
  }
  if (tableKindRef && typeof tableKindRef === 'object' && 'value' in tableKindRef) {
    watch(tableKindRef, rehydrate)
  }

  let dragState = null

  function clampLeft(combined, leftCandidate) {
    const min = MIN_RATIO
    const max = combined - MIN_RATIO
    if (leftCandidate < min) return min
    if (leftCandidate > max) return max
    return leftCandidate
  }

  function onMove(event) {
    if (!dragState) return
    const { boundaryIdx, containerWidth, containerLeft, initial } = dragState
    if (containerWidth <= 0) return
    let ratio = (event.clientX - containerLeft) / containerWidth

    const otherBoundaries = []
    let cum = 0
    for (let i = 0; i < initial.length - 1; i += 1) {
      cum += initial[i]
      if (i !== boundaryIdx) otherBoundaries.push(cum)
    }
    const candidates = SNAP_ANCHORS.concat(otherBoundaries)
    const threshold = SNAP_PX / containerWidth
    let snapped = null
    for (const c of candidates) {
      if (Math.abs(c - ratio) < threshold) {
        snapped = c
        break
      }
    }
    if (snapped !== null) {
      ratio = snapped
      snapGuideX.value = snapped * containerWidth
    } else {
      snapGuideX.value = null
    }

    const beforeSum = initial.slice(0, boundaryIdx).reduce((a, b) => a + b, 0)
    const combined = initial[boundaryIdx] + initial[boundaryIdx + 1]
    const newLeft = clampLeft(combined, ratio - beforeSum)
    const newRight = combined - newLeft

    const updated = [...initial]
    updated[boundaryIdx] = newLeft
    updated[boundaryIdx + 1] = newRight
    colRatios.value = updated
  }

  function onUp() {
    window.removeEventListener('pointermove', onMove)
    snapGuideX.value = null
    const k = getKey()
    if (k) {
      try { localStorage.setItem(k, JSON.stringify(colRatios.value)) } catch { /* ignore */ }
    }
    dragState = null
  }

  function onResizeStart(boundaryIdx, event) {
    if (boundaryIdx < 0 || boundaryIdx >= colRatios.value.length - 1) return
    event.preventDefault()
    const handle = event.currentTarget
    const host = handle?.closest?.('.col-resize-host')
    if (!host) return
    const rect = host.getBoundingClientRect()
    dragState = {
      boundaryIdx,
      containerWidth: rect.width,
      containerLeft: rect.left,
      initial: [...colRatios.value],
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }

  function resetToEven() {
    colRatios.value = evenRatios(n)
    const k = getKey()
    if (k) {
      try { localStorage.removeItem(k) } catch { /* ignore */ }
    }
  }

  return reactive({ colRatios, onResizeStart, snapGuideX, resetToEven })
}
