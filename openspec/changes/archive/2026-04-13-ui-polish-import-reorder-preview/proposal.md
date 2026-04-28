# Proposal: UI 优化、导入重复处理、拖拽排序修复与预览重构

## 概述

四项改进集中在用户体验层面：侧边栏配色、导入容错、排序交互一致性和模板预览可用性。

---

## R1: 项目列表配色加深

### 现状
- 侧边栏背景 `--color-sidebar-bg: #90EE90`（浅绿），文字 `rgba(255,255,255,0.75)`
- 对比度不足，视觉风格与蓝色主题（header `#4169E1`、primary `#2F6FD6`）不协调

### 约束集
- **C1-1**: 仅修改 `frontend/src/styles/main.css` 中的 CSS 变量
- **C1-2**: 必须同时更新暗色模式 `html[data-theme="dark"]` 对应变量
- **C1-3**: 文字与背景对比度 >= 4.5:1（WCAG AA）
- **C1-4**: 配色应与 header 蓝色系 (`#4169E1`) 协调，形成统一视觉语言

### 影响文件
| 文件 | 类型 | 说明 |
|------|------|------|
| `frontend/src/styles/main.css` | TO_MODIFY | CSS 变量 `--color-sidebar-*` 系列 |

### 成功判据
- [ ] 侧边栏与 header 形成协调的蓝色系配色
- [ ] 项目列表文字清晰可读（亮色/暗色模式均满足）
- [ ] hover/active 状态有明显视觉反馈

---

## R2: 项目导出再导入自动重命名

### 现状
- `project_import_service.py` 已有 `_resolve_import_name()` 自动生成 "名称 (导入N)" 格式
- 但导入过程中可能在 `ProjectCloneService.clone_from_graph` 阶段触发子实体唯一约束冲突
- 全局 `IntegrityError` handler (`main.py:83`) 兜底为 "数据已存在，请检查是否重复"
- 前端 `handleImportProjectDb` (`App.vue:283`) 将错误展示为 "导入失败: 数据已存在..."

### 约束集
- **C2-1**: `_resolve_import_name` 已工作正常（项目名不是冲突来源）
- **C2-2**: 冲突可能来自 `clone_from_graph` 中的子实体（form.code, codelist.code, field_definition.variable_name 等）
- **C2-3**: 子实体唯一约束均以 `project_id` 为 scope，新项目 ID 不应冲突 → 需排查是否存在跨 scope 的约束
- **C2-4**: `generate_code()` 生成随机 code，极小概率重复 → 需确认
- **C2-5**: 修复方向：要么在 clone 流程中捕获并重试，要么在 clone_from_graph 中确保 code 唯一性

### 影响文件
| 文件 | 类型 | 说明 |
|------|------|------|
| `backend/src/services/project_import_service.py` | TO_MODIFY | 导入流程入口 |
| `backend/src/services/project_clone_service.py` | REFERENCE | clone 逻辑，需排查冲突点 |
| `backend/src/utils.py` | REFERENCE | `generate_code()` 实现 |
| `backend/main.py` | REFERENCE | IntegrityError handler |

### 成功判据
- [ ] 导出项目后立即导入，成功创建名为 "原名 (导入)" 的新项目
- [ ] 重复导入多次均成功，名称递增 (导入2), (导入3)...
- [ ] 不出现 "数据已存在" 错误

---

## R3: 字段/表单拖拽排序修复

### 现状
- `useSortableTable.js` 正确实现拖拽排序：调用 reorder 端点 + 重载数据
- `FieldsTab.vue:updateOrder` (L143-154) 用 `api.put` 更新整个字段定义来改变序号，这是序号手动输入的处理函数，包含了不必要的字段属性
- `FormDesignerTab.vue:updateFormOrder` (L118-130) 正确使用 reorder 端点
- 用户反馈：拖拽后序号显示不正确，或触发了字段信息更新而非单纯排序

### 约束集
- **C3-1**: 拖拽排序走 `useSortableTable.js` → reorder 端点，应已正确
- **C3-2**: 手动修改序号（el-input-number）应只更新排序，不应发送整个字段数据
- **C3-3**: `FieldsTab.vue:updateOrder` 需重构为使用 reorder 端点（与 `FormDesignerTab.vue:updateFormOrder` 一致）
- **C3-4**: reorder 端点要求传入完整 ID 列表（`reorder_batch` 校验 `request_ids == valid_ids`）
- **C3-5**: FormDesigner 中 form field 的排序使用自定义 drag handlers（不用 useSortableTable），已通过 `/api/forms/{form_id}/fields/reorder` 端点

### 影响文件
| 文件 | 类型 | 说明 |
|------|------|------|
| `frontend/src/components/FieldsTab.vue` | TO_MODIFY | `updateOrder` 函数重构 |
| `frontend/src/components/FormDesignerTab.vue` | REFERENCE | `updateFormOrder` 参考实现 |
| `frontend/src/composables/useSortableTable.js` | REFERENCE | 拖拽排序核心逻辑 |

### 成功判据
- [ ] 字段界面：拖拽后序号列正确显示 1, 2, 3...
- [ ] 字段界面：手动修改序号后，只改变排序，不影响字段属性
- [ ] 表单界面：拖拽后序号列正确显示

---

## R4: 模板导入预览弹窗重构

### 现状
- `TemplatePreviewDialog.vue` 宽度 640px
- 有两种模式：默认显示 `SimulatedCRFForm` 预览，切换到"选择导入"模式显示字段勾选列表
- 两种模式互斥（v-if/v-else），无法同时查看预览和选择字段
- 后端已支持 `field_ids` 参数进行部分字段导入

### 约束集
- **C4-1**: 重构为左右分栏布局：左侧 CRF 预览，右侧字段勾选列表
- **C4-2**: 弹窗宽度需增大（建议 960-1000px）
- **C4-3**: 左侧复用 `SimulatedCRFForm` 组件，与表单设计器右侧预览效果一致
- **C4-4**: 右侧字段列表带 checkbox，全选/取消全选
- **C4-5**: 勾选/取消勾选字段时，左侧预览实时更新（只显示已勾选字段）
- **C4-6**: 两侧独立滚动
- **C4-7**: 保留现有 API 接口，通过 `field_ids` 参数传递选中字段
- **C4-8**: 默认全选所有字段

### 影响文件
| 文件 | 类型 | 说明 |
|------|------|------|
| `frontend/src/components/TemplatePreviewDialog.vue` | TO_MODIFY | 主要重构 |
| `frontend/src/components/SimulatedCRFForm.vue` | REFERENCE | 左侧预览组件 |
| `frontend/src/styles/main.css` | TO_MODIFY | 可能需新增少量样式 |

### 成功判据
- [ ] 弹窗打开后左侧显示完整 CRF 预览，右侧显示字段列表（带 checkbox）
- [ ] 取消勾选某字段后，左侧预览实时移除该字段
- [ ] 点击"导入选中字段"正确传递 field_ids
- [ ] 全选/取消全选功能正常

---

## 依赖关系

```
R1 (配色) ── 独立
R2 (导入) ── 独立
R3 (排序) ── 独立
R4 (预览) ── 独立
```

四项需求互不依赖，可并行实施。
