# Design: UI 优化、导入重复处理、拖拽排序修复与预览重构

## 多模型分析结果

### Codex (后端视角)
- R2 根因：`database.py` 迁移代码存在逻辑 bug（行 274-275），legacy `sort_order` NOT NULL 列未被迁移
- 所有唯一约束均以 `project_id` 为 scope，不会因新 project_id 触发冲突
- 全局 `IntegrityError` handler 将 NOT NULL 失败误翻译为 "数据已存在"
- R3 后端 reorder 接口已就绪，无需修改
- R4 后端 `field_ids` API 已支持部分导入

### Gemini (前端视角)
- R1 建议 `#4169E1` 作为 sidebar-bg（与 header 一致），白色文字对比度 4.92:1
- R3 手动输入序号仍需保留（大量字段时拖拽不便），但应改用 reorder 端点
- R4 建议 960px 弹窗，左 45% 预览 + 右 55% 勾选列表，computed 过滤实现实时同步

---

## D1: 侧边栏配色方案

### 决策
- 亮色：`--color-sidebar-bg: var(--indigo-900)` (即 `#234972`)
- 暗色：`--color-sidebar-bg: #18365a`（已有定义，与 dark 主题协调）
- 使用项目已有的 `--indigo-900` 而非独立色值，保持 token 体系一致性
- 对比度：白色文字 (#FFF) 在 `#234972` 上 ≈ 8.2:1，远超 WCAG AA 要求

### 为何不用 #4169E1
- `#4169E1` 与 header 完全相同会导致侧边栏和 header 视觉合并
- `#234972` 作为更深的蓝，形成从 header 到 sidebar 的渐深层次感

### 影响范围
仅 `main.css` 中 4 个 CSS 变量。

---

## D2: 项目导入去重修复

### 根因分析
1. `_migrate_project_soft_delete_and_ordering()` 行 274-280 有逻辑 bug：
   - 外层 `if "order_index" not in cols`
   - 内层 `if "order_index" in cols` — 永远为 false（死代码）
   - 注释写的是 "重命名 order_index"，实际应处理 legacy `sort_order` → `order_index`
2. 若真实数据库存在 `form_field.sort_order NOT NULL` 遗留列，clone 插入时缺少该值触发 NOT NULL 失败
3. `main.py` 全局 handler 将所有 `IntegrityError` 兜底翻译为 "数据已存在"

### 修复方案（按优先级）

**Step 1: 修复迁移代码**
- 在 `_migrate_project_soft_delete_and_ordering` 中检测 `sort_order` 列
- 若存在：用 `COALESCE(order_index, sort_order, 1)` 回填 `order_index`
- 使用 SQLite 重建表方式移除 `sort_order`

**Step 2: 改进错误 handler**
- `IntegrityError` handler 增加 `NOT NULL` 失败的检测分支
- 返回更精确的错误提示

**Step 3: 防御性写入**（短期保险）
- `clone_from_graph` 中 FormField 创建时，兼容检测 sort_order 列

### PBT 性质
- **幂等性**：导出项目 A → 导入 N 次 → 生成 N 个独立项目
- **round-trip**：导出 → 导入 → 导出 → 比对 → 数据无损
- **单调性**：导入项目名递增 "原名 (导入1)", "(导入2)"...

---

## D3: 字段排序重构

### 当前问题
`FieldsTab.vue:updateOrder` 使用 `api.put` 发送完整字段定义来改排序，副作用包括：
- 可能意外修改字段属性
- 与 reorder 端点的语义不一致

### 修复方案
采用与 `FormDesignerTab.vue:updateFormOrder` 相同的模式：
1. 根据旧位置和新位置重新排列 `fields.value` 数组
2. 提取完整 ID 列表
3. POST 到 `/api/projects/{projectId}/field-definitions/reorder`
4. reload 刷新

### 约束
- reorder 端点要求完整 ID 列表（不能只传可见子集）
- 搜索过滤时禁用手动序号修改（与拖拽一致）
- `:max` 绑定使用 `fields.value.length`（全量而非 visibleFields）

---

## D4: 模板预览弹窗重构

### 布局设计
```
┌──────────────────────────────────────────────────────┐
│ 预览导入效果 - {formName}                    [X]     │
├────────────────────────┬─────────────────────────────┤
│   CRF 预览 (左侧)     │    字段选择 (右侧)          │
│   SimulatedCRFForm     │  ☑ 全选 / □ 取消全选        │
│   :fields="filtered"   │  ────────────────────────── │
│                        │  ☑ 性别     [单选]          │
│   独立滚动             │  ☑ 年龄     [数值]          │
│   overflow-y: auto     │  □ 备注     [文本]  ← 未选  │
│                        │  ...                        │
│                        │  独立滚动                    │
├────────────────────────┴─────────────────────────────┤
│ 已选 2/3 个字段         [取消]  [导入选中字段]        │
└──────────────────────────────────────────────────────┘
```

### 实现要点
- 弹窗宽度：`960px`
- 左右分栏：`display: flex`，左 `flex: 1`，右 `width: 320px`
- 左侧复用 `SimulatedCRFForm`，传入 `computed filteredFields`
- 右侧 checkbox list，支持全选/取消全选
- 勾选变化时 → `selectedIds` 更新 → `filteredFields` 自动重算 → 左侧实时刷新
- 默认全选所有字段
- 保留原有 API 调用：`field_ids` = `Array.from(selectedIds)`

### 性能考量
- Vue 3 响应式 Set + computed 过滤，50+ 字段无性能问题
- 两侧独立 `overflow-y: auto` 容器

---

## 依赖关系与实施顺序

```
R2 (后端迁移修复) ── 独立，优先级最高（阻塞导入功能）
R1 (CSS 配色) ── 独立，最低风险
R3 (排序重构) ── 独立
R4 (预览重构) ── 独立
```

建议顺序：R2 → R3 → R1 → R4（风险递减）
