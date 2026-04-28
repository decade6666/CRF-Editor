# Spec: R4 — 模板导入预览弹窗重构

## 需求
将预览与字段选择从互斥切换改为左右分栏同时显示。

## 布局规格

### 弹窗
- 宽度：`960px`
- 高度：内容自适应，最大 `80vh`

### 分栏
```
┌─────────────────────┬──────────────────────┐
│  CRF 预览 (flex:1)  │  字段列表 (320px)    │
│  overflow-y: auto   │  overflow-y: auto    │
└─────────────────────┴──────────────────────┘
```

### 左侧：CRF 预览
- 复用 `SimulatedCRFForm` 组件
- 传入 `filteredFields` computed 属性（基于 selectedIds 过滤）
- 随勾选实时更新

### 右侧：字段勾选列表
- 顶部：全选/取消全选按钮
- 每行：checkbox + 字段标签 + 类型 tag
- 默认全选

## 数据流
```
fields (全量) → selectedIds (Set) → filteredFields (computed) → SimulatedCRFForm
                     ↑
               checkbox 点击
```

## API 调用不变
- 预览：`GET /api/projects/{pid}/import-template/form-fields?form_id={fid}`
- 导入：`POST /api/projects/{pid}/import-template/execute`
  - body: `{ source_project_id, form_ids, field_ids? }`
  - `field_ids` = `Array.from(selectedIds)` 当未全选时

## 约束
- C4-1: 左右分栏，不再互斥切换
- C4-2: 弹窗宽度 960px
- C4-3: 左侧复用 SimulatedCRFForm
- C4-4: 右侧带 checkbox，全选/取消全选
- C4-5: 勾选变化实时更新左侧预览
- C4-6: 两侧独立滚动
- C4-7: 保留现有 API，通过 field_ids 传递
- C4-8: 默认全选

## 影响文件
| 文件 | 类型 | 说明 |
|------|------|------|
| `frontend/src/components/TemplatePreviewDialog.vue` | TO_MODIFY | 主要重构 |
| `frontend/src/styles/main.css` | TO_MODIFY | 可能新增分栏样式 |

## 验证标准
- [ ] 弹窗打开后左右同时显示预览和字段列表
- [ ] 取消勾选某字段后左侧预览实时移除
- [ ] 全选/取消全选功能正常
- [ ] 点击"导入选中字段"正确传递 field_ids
- [ ] 50+ 字段时无明显卡顿
