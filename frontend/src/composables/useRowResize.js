import { reactive, ref, watch, isRef } from 'vue'

const MIN_ROW_HEIGHT_PX = 28
const MAX_ROW_HEIGHT_PX = 240

function resolveValue(source) {
  if (source == null) return source
  if (typeof source === 'function') return source()
  if (isRef(source)) return source.value
  return source
}

function normalizeHeightMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const normalized = {}
  for (const [rowKey, height] of Object.entries(value)) {
    if (typeof rowKey !== 'string' || !rowKey) continue
    if (!Number.isFinite(height)) continue
    const clamped = Math.round(Math.max(MIN_ROW_HEIGHT_PX, Math.min(MAX_ROW_HEIGHT_PX, height)))
    normalized[rowKey] = clamped
  }
  return normalized
}

function readHeightMap(storageKey) {
  if (!storageKey) return {}
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return {}
    return normalizeHeightMap(JSON.parse(raw))
  } catch {
    return {}
  }
}

export function buildTableInstanceId(kind, fields) {
  const fieldIds = (fields || [])
    .map((field) => field?.id)
    .filter((id) => id != null)
    .join(',')
  return `${kind}:fieldIds=${fieldIds}`
}

export function buildRowHeightStorageKey(formId, tableInstanceId) {
  if (formId == null || !tableInstanceId) return null
  return `crf:designer:row-heights:${formId}:${tableInstanceId}`
}

export function readRowHeightOverrides(formId, tableInstanceId) {
  return readHeightMap(buildRowHeightStorageKey(formId, tableInstanceId))
}

export function getRowHeightStyle(rowHeights, rowKey) {
  const height = rowHeights?.[rowKey]
  if (!Number.isFinite(height)) return null
  return { height: `${height}px` }
}

function fieldIdList(fields) {
  return (fields || [])
    .map((field) => field?.id)
    .filter((id) => id != null)
    .join(',')
}

export function getNormalRowKey(field) {
  return `field:${field?.id ?? 'unknown'}`
}

export function getInlineHeaderRowKey(fields) {
  return `inline-header:${fieldIdList(fields)}`
}

export function getInlineDataRowKey(fields, rowIndex) {
  return `inline-row:${fieldIdList(fields)}:${rowIndex}`
}

export function getUnifiedRegularRowKey(field) {
  return `unified-regular:${field?.id ?? 'unknown'}`
}

export function getUnifiedFullRowKey(field) {
  return `unified-full:${field?.id ?? 'unknown'}`
}

export function getUnifiedInlineHeaderRowKey(fields) {
  return `unified-inline-header:${fieldIdList(fields)}`
}

export function getUnifiedInlineDataRowKey(fields, rowIndex) {
  return `unified-inline-row:${fieldIdList(fields)}:${rowIndex}`
}

export function useRowResize(formIdRef, tableKindRef) {
  const getStorageKey = () => buildRowHeightStorageKey(resolveValue(formIdRef), resolveValue(tableKindRef))
  const rowHeights = ref(readHeightMap(getStorageKey()))

  const rehydrate = () => {
    rowHeights.value = readHeightMap(getStorageKey())
  }

  watch(() => resolveValue(formIdRef), rehydrate)
  watch(() => resolveValue(tableKindRef), rehydrate)

  let dragState = null

  function onMove(event) {
    if (!dragState) return
    const nextHeight = Math.round(
      Math.max(
        MIN_ROW_HEIGHT_PX,
        Math.min(MAX_ROW_HEIGHT_PX, dragState.startHeight + (event.clientY - dragState.startY)),
      ),
    )
    rowHeights.value = {
      ...dragState.initialMap,
      [dragState.rowKey]: nextHeight,
    }
  }

  function onUp() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    const storageKey = getStorageKey()
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(rowHeights.value))
      } catch {
        /* ignore */
      }
    }
    dragState = null
  }

  function onResizeStart(rowKey, event) {
    if (!rowKey) return
    const rowElement = event.currentTarget?.closest?.('tr')
    if (!rowElement) return
    event.preventDefault()
    dragState = {
      rowKey,
      startY: event.clientY,
      startHeight: Math.round(rowElement.getBoundingClientRect().height),
      initialMap: { ...rowHeights.value },
    }
    if (typeof event.currentTarget?.setPointerCapture === 'function' && event.pointerId != null) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
    window.addEventListener('pointercancel', onUp, { once: true })
  }

  return reactive({
    rowHeights,
    getRowHeightStyle: (rowKey) => getRowHeightStyle(rowHeights.value, rowKey),
    onResizeStart,
  })
}
