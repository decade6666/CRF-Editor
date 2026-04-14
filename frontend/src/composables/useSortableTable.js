/**
 * el-table 行拖拽排序 Composable
 * 基于 SortableJS（vuedraggable 底层）在 el-table tbody 上启用拖拽行排序。
 *
 * 用法：
 *   const tableRef = ref(null)
 *   const { initSortable } = useSortableTable(tableRef, sourceList, reorderUrl, { reloadFn, isFiltered, renderList })
 *   onMounted(async () => { await load(); nextTick(() => initSortable()) })
 *
 * 参数说明：
 *   - sourceList: 完整数据列表（ref/reactive）
 *   - renderList: 当前表格实际渲染的数据列表（可选，用于过滤场景）
 *                 当提供时，使用 ID 映射将 DOM 索引转换为 sourceList 索引
 *   - isFiltered: 是否处于过滤状态（禁用拖拽）
 */
import { onBeforeUnmount, watch, unref } from 'vue'
import Sortable from 'sortablejs'
import { ElMessage } from 'element-plus'
import { api } from './useApi.js'

export function useSortableTable(tableRef, sourceList, reorderUrl, { reloadFn, isFiltered, renderList } = {}) {
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
        const arr = unref(sourceList)
        const rendered = renderList ? unref(renderList) : arr

        // 通过 ID 找到在 sourceList 中的真实索引
        const draggedId = rendered[oldIndex]?.id
        const targetId = rendered[newIndex]?.id
        if (draggedId == null || targetId == null) return

        const sourceOldIndex = arr.findIndex(it => it.id === draggedId)
        const sourceNewIndex = arr.findIndex(it => it.id === targetId)
        if (sourceOldIndex === -1 || sourceNewIndex === -1) return

        // 在 sourceList 上执行重排
        const [item] = arr.splice(sourceOldIndex, 1)
        arr.splice(sourceNewIndex, 0, item)
        // 重新分配连续序号
        arr.forEach((it, i) => { it.order_index = i + 1 })
        try {
          await api.post(unref(reorderUrl), arr.map(i => i.id))
        } catch (e) {
          // 提示用户并通过 reload 恢复正确顺序
          ElMessage.warning('排序保存失败，已恢复')
        }
        if (reloadFn) await reloadFn(sourceOldIndex, sourceNewIndex)
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
