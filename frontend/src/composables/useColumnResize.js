import { reactive, ref, watch, isRef } from 'vue'

const SNAP_ANCHORS = [0.25, 1 / 3, 0.5, 2 / 3, 0.75]
const SNAP_PX = 6
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

function getHandleBoundaryClientX(handle) {
  const rect = handle?.getBoundingClientRect?.()
  if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.width)) return null
  return rect.left + (rect.width / 2)
}

function collectScopeBoundaryClientXs(scopeRoot, activeHandle) {
  const handles = scopeRoot?.querySelectorAll?.('.resizer-handle') ?? []
  const boundaryClientXs = []
  for (const handle of handles) {
    if (handle === activeHandle) continue
    const clientX = getHandleBoundaryClientX(handle)
    if (clientX !== null) boundaryClientXs.push(clientX)
  }
  return boundaryClientXs
}

function pickSnapBoundaryClientX(pointerClientX, containerLeft, containerWidth, minBoundaryRatio, maxBoundaryRatio, boundaryClientXs) {
  if (containerWidth <= 0) return null

  const candidateClientXs = []
  for (const anchor of SNAP_ANCHORS) {
    if (anchor < minBoundaryRatio || anchor > maxBoundaryRatio) continue
    candidateClientXs.push(containerLeft + (anchor * containerWidth))
  }
  for (const clientX of boundaryClientXs) {
    const ratio = (clientX - containerLeft) / containerWidth
    if (!Number.isFinite(ratio) || ratio < minBoundaryRatio || ratio > maxBoundaryRatio) continue
    candidateClientXs.push(clientX)
  }

  let bestClientX = null
  let bestDistance = SNAP_PX + 1
  for (const candidateClientX of candidateClientXs) {
    const distance = Math.abs(candidateClientX - pointerClientX)
    if (distance <= SNAP_PX && distance < bestDistance) {
      bestClientX = candidateClientX
      bestDistance = distance
    }
  }
  return bestClientX
}

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
    const { boundaryIdx, containerWidth, containerLeft, initial, boundaryClientXs } = dragState
    if (containerWidth <= 0) return

    const beforeSum = initial.slice(0, boundaryIdx).reduce((a, b) => a + b, 0)
    const combined = initial[boundaryIdx] + initial[boundaryIdx + 1]
    const minBoundaryRatio = beforeSum + MIN_RATIO
    const maxBoundaryRatio = beforeSum + combined - MIN_RATIO

    let boundaryRatio = (event.clientX - containerLeft) / containerWidth
    const snappedClientX = pickSnapBoundaryClientX(
      event.clientX,
      containerLeft,
      containerWidth,
      minBoundaryRatio,
      maxBoundaryRatio,
      boundaryClientXs,
    )
    if (snappedClientX !== null) {
      boundaryRatio = (snappedClientX - containerLeft) / containerWidth
    }

    const newLeft = clampLeft(combined, boundaryRatio - beforeSum)
    const newRight = combined - newLeft
    const finalBoundaryRatio = beforeSum + newLeft

    snapGuideX.value = snappedClientX !== null ? finalBoundaryRatio * containerWidth : null

    const updated = [...initial]
    updated[boundaryIdx] = newLeft
    updated[boundaryIdx + 1] = newRight
    colRatios.value = updated
  }

  function onUp() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
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

    const scopeRoot = host.closest?.('.wp-main') ?? host
    const rect = host.getBoundingClientRect()
    dragState = {
      boundaryIdx,
      containerWidth: rect.width,
      containerLeft: rect.left,
      initial: [...colRatios.value],
      boundaryClientXs: collectScopeBoundaryClientXs(scopeRoot, handle),
    }

    if (typeof handle?.setPointerCapture === 'function' && event.pointerId != null) {
      try { handle.setPointerCapture(event.pointerId) } catch { /* ignore */ }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
    window.addEventListener('pointercancel', onUp, { once: true })
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
