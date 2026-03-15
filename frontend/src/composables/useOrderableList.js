import { ref, unref } from 'vue'
import { api } from './useApi.js'

/**
 * 可排序列表 Composable
 * 提供拖拽排序功能的通用逻辑
 */
export function useOrderableList(reorderUrl) {
  const dragging = ref(false)

  /**
   * 拖拽结束处理
   * @param {Array} list - 当前列表（已更新顺序，vue-draggable 的 v-model 已改写）
   * @param {Function} onSuccess - 成功回调（支持异步）
   * @param {Function} onError - 失败回调（接收 err）
   */
  async function handleDragEnd(list, onSuccess, onError) {
    dragging.value = false
    // 保存快照：POST 前记录顺序，失败时可手动回滚
    const snapshot = list.map((item) => item.id)
    try {
      await api.post(unref(reorderUrl), snapshot)
      if (onSuccess) await onSuccess()
    } catch (err) {
      if (onError) onError(err)
    }
  }

  return {
    dragging,
    handleDragEnd,
  }
}
