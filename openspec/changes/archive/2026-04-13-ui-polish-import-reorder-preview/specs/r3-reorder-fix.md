# Spec: R3 — 字段排序修复

## 需求
FieldsTab 的手动序号修改应只改排序，不影响字段属性。

## 当前问题
`FieldsTab.vue:updateOrder` (L143-154) 使用 `api.put` 发送完整字段定义数据来修改排序，会：
1. 触发字段属性校验和更新逻辑
2. 与 reorder 端点语义不一致

## 修复方案
重构 `updateOrder` 为与 `FormDesignerTab.vue:updateFormOrder` 一致的模式：

```javascript
async function updateOrder(row, newValue) {
  if (newValue == null || newValue === row.order_index) return
  try {
    const oldIdx = fields.value.findIndex(f => f.id === row.id)
    const newIdx = newValue - 1
    if (oldIdx === -1 || newIdx < 0 || newIdx >= fields.value.length) return
    const list = [...fields.value]
    const [item] = list.splice(oldIdx, 1)
    list.splice(newIdx, 0, item)
    await api.post(
      `/api/projects/${props.projectId}/field-definitions/reorder`,
      list.map(i => i.id)
    )
    await reloadFields()
  } catch (e) { ElMessage.error(e.message) }
}
```

## 约束
- C3-1: reorder 端点要求完整 ID 列表
- C3-2: 搜索过滤时禁用手动序号修改（或基于全量列表计算）
- C3-3: `:max` 绑定改为 `fields.value.length`（非 visibleFields.length）

## 影响文件
| 文件 | 类型 | 说明 |
|------|------|------|
| `frontend/src/components/FieldsTab.vue` | TO_MODIFY | 重构 updateOrder 函数 |

## 验证标准
- [ ] 拖拽后序号正确显示 1, 2, 3...
- [ ] 手动修改序号后只改排序，不影响字段属性
- [ ] 搜索过滤时手动序号修改被禁用
