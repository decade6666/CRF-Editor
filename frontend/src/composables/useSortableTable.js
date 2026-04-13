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
        // 立即更新 reactive data，确保序号同步刷新
        const arr = unref(sourceList)
        const [item] = arr.splice(oldIndex, 1)
        arr.splice(newIndex, 0, item)
        // 重新分配连续序号
        arr.forEach((it, i) => { it.order_index = i + 1 })
        try {
          await api.post(unref(reorderUrl), arr.map(i => i.id))
        } catch (e) {
          // 提示用户并通过 reload 恢复正确顺序
          import('element-plus').then(m => m.ElMessage?.warning?.('排序保存失败，已恢复'))
        }
        if (reloadFn) await reloadFn(oldIndex, newIndex)
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
