import { nextTick, ref, unref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from './useApi.js'

export function clampOrdinal(value, min, max) {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(value, min), max)
}

export function moveItem(items, fromIndex, toIndex) {
  const nextItems = [...items]
  const [movedItem] = nextItems.splice(fromIndex, 1)
  nextItems.splice(toIndex, 0, movedItem)
  return nextItems
}

export function resequenceItems(items, orderKey = 'order_index') {
  return items.map((item, index) => ({
    ...item,
    [orderKey]: index + 1,
  }))
}

function resolveRowOrdinal(row, fallbackIndex, orderKey) {
  const rawValue = Number(row?.[orderKey])
  return Number.isFinite(rawValue) && rawValue >= 1 ? rawValue : fallbackIndex + 1
}

async function reloadList(reloadFn, args, { notifyReloadError, reloadErrorMessage, suppressError = false } = {}) {
  if (!reloadFn) return
  try {
    await reloadFn(...args)
  } catch (error) {
    if (!suppressError && typeof notifyReloadError === 'function') {
      notifyReloadError(reloadErrorMessage)
    }
  }
}

function defaultApplyList(sourceList, nextList) {
  if (sourceList && typeof sourceList === 'object' && 'value' in sourceList) {
    sourceList.value = nextList
    return
  }
  const currentList = unref(sourceList)
  if (!Array.isArray(currentList)) return
  currentList.splice(0, currentList.length, ...nextList)
}

export function useOrdinalQuickEdit(sourceList, reorderUrl, {
  applyList,
  reloadFn,
  renderList,
  isFiltered,
  orderKey = 'order_index',
  saveOrder = async (ids) => api.post(unref(reorderUrl), ids),
  notifyRestore = (message) => ElMessage.warning(message),
  notifyReloadError = (message) => ElMessage.error(message),
  restoreMessage = '排序保存失败，已恢复',
  reloadErrorMessage = '列表刷新失败，请稍后重试',
} = {}) {
  const editingId = ref(null)
  const editingValue = ref(1)
  const inputRef = ref(null)

  function cancelEdit() {
    editingId.value = null
    editingValue.value = 1
  }

  function applyNextList(nextList) {
    if (typeof applyList === 'function') {
      applyList(nextList)
      return
    }
    defaultApplyList(sourceList, nextList)
  }

  function startEdit(row) {
    if (unref(isFiltered) || row?.id == null) return false
    const sourceItems = Array.isArray(unref(sourceList)) ? unref(sourceList) : []
    const renderedItems = renderList && Array.isArray(unref(renderList)) ? unref(renderList) : sourceItems
    const sourceIndex = sourceItems.findIndex((item) => item?.id === row.id)
    const renderedIndex = renderedItems.findIndex((item) => item?.id === row.id)
    if (sourceIndex === -1) return false
    editingId.value = row.id
    editingValue.value = renderedIndex === -1
      ? resolveRowOrdinal(row, sourceIndex, orderKey)
      : renderedIndex + 1
    nextTick(() => {
      inputRef.value?.focus?.()
    })
    return true
  }

  async function commitEdit() {
    const currentId = editingId.value
    if (currentId == null) return false

    const currentItems = Array.isArray(unref(sourceList)) ? [...unref(sourceList)] : []
    const renderedItems = renderList && Array.isArray(unref(renderList)) ? [...unref(renderList)] : currentItems
    const currentIndex = currentItems.findIndex((item) => item?.id === currentId)
    const renderedIndex = renderedItems.findIndex((item) => item?.id === currentId)
    if (currentIndex === -1 || renderedIndex === -1 || renderedItems.length === 0) {
      cancelEdit()
      return false
    }

    const requestedOrdinal = Number(editingValue.value)
    const targetOrdinal = clampOrdinal(requestedOrdinal, 1, renderedItems.length)
    const currentOrdinal = renderedIndex + 1

    if (!Number.isFinite(requestedOrdinal) || requestedOrdinal !== targetOrdinal) {
      cancelEdit()
      return false
    }

    if (targetOrdinal === currentOrdinal) {
      cancelEdit()
      return false
    }

    const targetId = renderedItems[targetOrdinal - 1]?.id
    const targetIndex = currentItems.findIndex((item) => item?.id === targetId)
    if (targetId == null || targetIndex === -1) {
      cancelEdit()
      return false
    }

    const nextList = resequenceItems(moveItem(currentItems, currentIndex, targetIndex), orderKey)
    const snapshot = currentItems.map((item) => ({ ...item }))

    applyNextList(nextList)
    try {
      await saveOrder(nextList.map((item) => item.id))
    } catch (error) {
      applyNextList(snapshot)
      notifyRestore(restoreMessage)
      cancelEdit()
      await reloadList(reloadFn, [currentIndex, targetOrdinal - 1], {
        notifyReloadError,
        reloadErrorMessage,
        suppressError: true,
      })
      return false
    }

    cancelEdit()
    await reloadList(reloadFn, [currentIndex, targetOrdinal - 1], {
      notifyReloadError,
      reloadErrorMessage,
    })
    return true
  }

  return {
    editingId,
    editingValue,
    inputRef,
    cancelEdit,
    commitEdit,
    startEdit,
  }
}
