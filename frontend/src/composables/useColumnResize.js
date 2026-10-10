import { reactive, ref, watch, isRef } from 'vue'

const SNAP_ANCHORS = [0.25, 1 / 3, 0.5, 2 / 3, 0.75]
const SNAP_PX = 6
const MIN_RATIO = 0.02
const MAX_RATIO = 1 - MIN_RATIO
const KEY_PREFIX = 'crf:designer:col-widths:'

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

// ── 列宽存储键拼装 / 解析 / 校验 / 旧键迁移（shared-rule-convergence R4）──
// 键格式：crf:designer:col-widths:<formId>:<tableInstanceId>
//   tableInstanceId 现行拼法 kind:fieldIds=<ordered-field-ids>（useRowResize.buildTableInstanceId），
//   旧拼法 <groupIndex>-<kind>-<colCount>（仅兼容读取/一次性迁移）。

export function buildColumnWidthStorageKey(formId, tableInstanceId) {
  if (formId == null || tableInstanceId == null) return null
  return `${KEY_PREFIX}${formId}:${tableInstanceId}`
}

export function parseColumnWidthStorageKey(key) {
  if (typeof key !== 'string' || !key.startsWith(KEY_PREFIX)) return null
  const parts = key.slice(KEY_PREFIX.length).split(':')
  if (parts.length < 2) return null
  return { formId: parseInt(parts[0], 10), tableInstanceId: parts.slice(1).join(':') }
}

// 导出收集器专用宽松门（原 App.vue 校验语义，逐字保留）：边界 [0,1] 闭区间、非空、
// 无和校验——导出端有意比读取端宽松；读取端走 readRatios 的严格门（1e-3 / [0.02,0.98] / 长度）。
export function isValidColumnWidthOverrideArray(arr) {
  return Array.isArray(arr) && arr.length > 0 && arr.every((r) => Number.isFinite(r) && r >= 0 && r <= 1)
}

// 首次访问新格式键时把旧格式键的值原样搬到新键（新键已存在则绝不覆盖），
// 随后删除被读到的那把旧键；本函数是整个列宽特性唯一的删除路径。
export function migrateLegacyColumnWidthKey(formId, newTableInstanceId, legacyMapKey) {
  if (!formId || !newTableInstanceId || !legacyMapKey) return
  const legacyKey = `${KEY_PREFIX}${formId}:${legacyMapKey}`
  const newKey = `${KEY_PREFIX}${formId}:${newTableInstanceId}`
  try {
    const legacyValue = localStorage.getItem(legacyKey)
    if (legacyValue != null && localStorage.getItem(newKey) == null) {
      localStorage.setItem(newKey, legacyValue)
    }
    if (legacyValue != null) {
      localStorage.removeItem(legacyKey)
    }
  } catch {
    /* ignore localStorage errors */
  }
}

// Word 导出列宽覆盖收集器（自 App.vue 迁入，行为逐字等价——黄金矩阵 16.2.5e 锁定）。
// 严格只读：任何前缀匹配但无效 / 宽松容差 / 无关键都跳过，绝不删除或改写。
export function collectColumnWidthOverrides(forms) {
  const overrides = {}
  if (!forms || !forms.length) return overrides

  const formIds = new Set(forms.map((f) => f.id).filter((id) => id != null))

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    const parsed = parseColumnWidthStorageKey(key)
    if (!parsed) continue
    if (!formIds.has(parsed.formId)) continue

    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const arr = JSON.parse(raw)
      if (isValidColumnWidthOverrideArray(arr)) {
        overrides[parsed.tableInstanceId] = arr
      }
    } catch {
      // 忽略解析错误
    }
  }

  return overrides
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

export function readColumnWidthRatios(formId, tableKind, expectedLength) {
  if (formId == null || tableKind == null) return null
  try {
    return readRatios(buildColumnWidthStorageKey(formId, tableKind), expectedLength)
  } catch {
    return null
  }
}

export function readColumnWidthRatiosWithFallback(formId, tableKind, expectedLength, legacyTableKind) {
  const current = readColumnWidthRatios(formId, tableKind, expectedLength)
  if (current) return current
  return readColumnWidthRatios(formId, legacyTableKind, expectedLength)
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

  const getKey = () => buildColumnWidthStorageKey(resolveValue(formIdRef), resolveValue(tableKindRef))

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

  return reactive({
    colRatios,
    onResizeStart,
    snapGuideX,
    resetToEven,
    rehydrate,
  })
}
