# feat: 表单设计器内存撤销/恢复（最近20步）

## Goal

为表单设计器新增「撤回」「恢复」按钮，前端内存维护 undo/redo 双栈（上限 20 步），用户可退回最近操作或恢复被退回的操作。刷新页面即清空，**不做后端历史持久化**（已评估排除 30 天/全量持久化方案）。

## What I already know

* 设计器为全自动保存模型，所有操作立即落库，无客户端草稿缓冲。
* 涉及操作与入口（`frontend/src/components/FormDesignerTab.vue`）：
  * 新增字段：`addField`（:328）、`newField`（:1370）→ `POST /api/forms/{id}/fields`（+ `field-definitions`）
  * 删除字段：`removeField`（:338）→ `DELETE /api/form-fields/{id}`
  * 批量删除：`batchDelete`（:356）→ `POST /api/forms/{id}/fields/batch-delete`
  * 拖拽排序：`onDrop`（:383）→ `POST /api/forms/{id}/fields/reorder`
  * 属性编辑：`saveFieldProp`（:1319，防抖 + session 校验）
* 后端 REST：`backend/src/routers/fields.py`（create/delete/reorder/batch-delete 已具备）。
* 前端复杂复用逻辑约定放 `frontend/src/composables/`。

## Assumptions (temporary)

* 撤销栈纯内存（`ref`），刷新清空，符合"内存最近 20 步"语义。
* 逆操作经现有后端 REST 回放，**优先不新增后端接口**；若"重建已删字段需保留原 order_index/属性"无法用现有入参表达，再小幅扩展 `fields.py` 入参（需先确认）。
* 撤销删除会产生新后端 id，需在栈内做 id 重映射，保证后续 redo/undo 引用正确。
* 与草稿态任务（`06-15-designer-new-field-draft`）解耦：未保存草稿不入撤销栈；草稿"保存"后才作为一次"新增"入栈。

## Open Questions

* 撤销"删除字段"时，逆操作需恢复原属性与原排序位置；现有 create 接口是否接受指定 `order_index` 与完整属性？若不接受，需评估是否扩展接口或改用"重建后再 reorder + 属性回写"组合。
* 是否绑定键盘 Ctrl+Z / Ctrl+Y（可选增强，默认实现按钮即可）。

## Requirements

### R1 历史 composable
* 新增 `frontend/src/composables/useDesignerHistory.js`：维护 `undoStack` / `redoStack`，每条记录 `{ label, forward, inverse }`（均为 async 函数）。
* 上限 20：超出时丢弃最旧记录。
* 执行新操作时清空 `redoStack`。

### R2 操作接入
* 将 5 类操作（属性编辑、排序、新增、删除、批量删除）包装为可注册的命令，记录正向与逆向。
* 删除/批量删除的逆操作：重建字段并恢复属性/顺序；维护 id 重映射表。

### R3 UI
* 设计器顶栏新增「撤回」「恢复」按钮；空栈时禁用对应按钮。
* 撤销/恢复后刷新列表与预览（复用 `loadFormFields`），与现有缓存失效路径一致。

### R4 边界
* 撤销/恢复执行期间禁止并发触发（加 busy 锁）。
* 后端回放失败时给出 `ElMessage` 提示并回滚本地栈状态，不静默吞错。

## Validation

```bash
cd frontend && node --test tests/*.test.js
```

* 新增前端测试：栈上限 20、新操作清空 redo、删除→撤销 id 重映射后 redo 正确、空栈按钮禁用。
* 人工验证：依次新增/改/删/排序后，撤回与恢复行为符合预期。

## Out of scope

* 不做后端操作历史表、30 天/全量持久化、跨会话撤销。
* 不改新增字段的保存语义（由 `06-15-designer-new-field-draft` 负责）。

## Done checklist

* [ ] R1–R4 完成
* [ ] 前端撤销/恢复回归测试通过
* [ ] `node --test tests/*.test.js` 全绿
* [ ] 同步更新 `frontend/.claude/CLAUDE.md` composables 计数与设计器小节
