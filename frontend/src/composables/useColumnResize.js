import { reactive, ref, watch, isRef } from 'vue'

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
  if (isRef(source)) return source.value
  return source
}

function buildKey(formId, tableKind) {
  if (formId == null || tableKind == null) return null
  return `crf:designer:col-widths:${formId}:${tableKind}`
}

/**
 * 表格列宽可调 composable。
 *
 * @param {string|number|import('vue').Ref|Function} formIdRef 表单 id，支持 ref / getter / 原值
 * @param {string|import('vue').Ref|Function} tableKindRef 表格类型（如 'normal' / `inline-${N}`）
 * @param {number[]|(() => number[])|import('vue').Ref<number[]>} defaultsSource
 *   默认列宽比例来源。支持：
 *   - 静态数组：`[0.3, 0.7]`（向后兼容）
 *   - 工厂函数：`() => planNormalColumnFractions(group.fields)`（内容驱动）
 *   - Ref / ComputedRef：`computed(() => planInlineColumnFractions(fields))`
 *   每次 rehydrate / resetToEven 都会重新求值，保证内容变化时默认值跟随更新。
 * @returns {{
 *   colRatios: import('vue').Ref<number[]>,
 *   onResizeStart: Function,
 *   snapGuideX: import('vue').Ref<number|null>,
 *   resetToEven: Function,
 * }}
 */
export function useColumnResize(formIdRef, tableKindRef, defaultsSource) {
  const resolveDefaults = () => {
    let raw
    if (typeof defaultsSource === 'function') {
      raw = defaultsSource()
    } else if (isRef(defaultsSource)) {
      raw = defaultsSource.value
    } else {
      raw = defaultsSource
    }
    return Array.isArray(raw) ? [...raw] : []
  }

  const getKey = () => buildKey(resolveValue(formIdRef), resolveValue(tableKindRef))

  const colRatios = ref((() => {
    const defs = resolveDefaults()
    const k = getKey()
    const loaded = k ? readRatios(k, defs.length) : null
    return loaded ?? defs
  })())
  const snapGuideX = ref(null)

  // 切换 form / tableKind / defaultsSource 时重读持久化值。
  // 注意：formIdRef / tableKindRef 可能是 ref / getter / 原值，统一通过 resolveValue
  // 取值后再 watch，确保 getter 形态也能触发 rehydrate。
  const rehydrate = () => {
    const defs = resolveDefaults()
    const k = getKey()
    const loaded = k ? readRatios(k, defs.length) : null
    colRatios.value = loaded ?? defs
  }
  watch(() => resolveValue(formIdRef), rehydrate)
  watch(() => resolveValue(tableKindRef), rehydrate)
  if (isRef(defaultsSource)) watch(defaultsSource, rehydrate)

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
    const k = getKey()
    if (k) {
      try { localStorage.removeItem(k) } catch { /* ignore */ }
    }
    colRatios.value = resolveDefaults()
  }

  return reactive({ colRatios, onResizeStart, snapGuideX, resetToEven })
}
