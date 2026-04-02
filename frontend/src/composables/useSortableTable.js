/**
 * el-table 行拖拽排序 Composable
 * 基于 SortableJS（vuedraggable 底层）在 el-table tbody 上启用拖拽行排序。
 *
 * 用法：
 *   const tableRef = ref(null)
 *   const { initSortable } = useSortableTable(tableRef, sourceList, reorderUrl, { reloadFn, isFiltered })
 *   onMounted(async () => { await load(); nextTick(() => initSortable()) })
 */
import { onBeforeUnmount, watch, unref } from 'vue'
import Sortable from 'sortablejs'
import { api } from './useApi.js'

export function useSortableTable(tableRef, sourceList, reorderUrl, { reloadFn, isFiltered } = {}) {
  let instance = null

  function initSortable() {
    if (instance) instance.destroy()
    const el = unref(tableRef)?.$el?.querySelector('.el-table__body-wrapper tbody')
    if (!el) return
    instance = Sortable.create(el, {
      animation: 150,
      handle: '.drag-handle',
      disabled: unref(isFiltered) || false,
      onEnd: async ({ oldIndex, newIndex }) => {
        if (oldIndex === newIndex) return
        const list = [...unref(sourceList)]
        const [item] = list.splice(oldIndex, 1)
        list.splice(newIndex, 0, item)
        try {
          await api.post(unref(reorderUrl), list.map(i => i.id))
        } catch {
          // 静默失败，reload 会恢复顺序
        }
        if (reloadFn) await reloadFn()
      },
    })
  }

  if (isFiltered) {
    watch(() => unref(isFiltered), (disabled) => {
      if (instance) instance.option('disabled', disabled)
    })
  }

  onBeforeUnmount(() => { if (instance) instance.destroy() })

  return { initSortable }
}
