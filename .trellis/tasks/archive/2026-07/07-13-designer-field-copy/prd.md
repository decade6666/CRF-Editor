# 表单设计器字段复制

## Goal
在表单设计器 `frontend/src/components/FormDesignerTab.vue` 的字段实例列表中，为每行「删除」按钮左侧新增「复制」按钮：一键把所选字段的全部内容复制一份，OID(`variable_name`) 自动加 `_copy` 避免唯一约束报错，复制出的新字段紧贴在被复制字段的下一行。行为对齐字段库 `FieldsTab.vue` 的复制语义。

## Background（经 Codex + Antigravity + 本地三方评审确认）
- 后端 `backend/src/routers/fields.py:486 copy_field_definition` 整行复制字段定义并给 `variable_name` 加 `_copy`（冲突再追加数字），前向复制直接复用它（整行拷贝天然带 `checkbox_label` 等全部列，比前端 `buildFieldDefinitionCreatePayload` 更完整——后者漏 `checkbox_label` 且会带旧 `order_index`）。
- `backend/src/routers/fields.py:301 add_form_field` 接受可选 `order_index`，走 `OrderService.insert_at`（1-based，先后移 `>=position` 记录再写入），`order_index=原+1` 精准落在正下方，原字段为末行时 `position=max+1` 亦合法，无 off-by-one。
- 前端 `buildFormFieldCreatePayload(:472)` 已完整覆盖 `FormFieldCreate` 的 12 个可写列。
- 设计器撤销/重做栈 `useDesignerHistory.js` 已被 `addField`/`saveDraftField`/`removeField` 接入，且提供 `remapId`。

## Requirements

### 功能
- R1：字段实例每行「删除」按钮左侧新增「复制」按钮（`el-button size="small" link`，`@click.stop`，`v-if="!isDraftField(ff)"`），风格对齐字段库复制按钮。模板仅一处（`removeField(ff)` 全文唯一，:3530）。
- R2：复制生成一个新字段实例，内容完整复制自原字段：
  - 分支 A —— 普通/标签字段（`field_definition_id` 非空）：`POST /api/field-definitions/{id}/copy` 复制定义（OID 自动 `_copy`）→ 用返回的新定义 id + `buildFormFieldCreatePayload(ff)` 全属性建实例。
  - 分支 B —— 日志行（`is_log_row=1`、`field_definition_id=null`）：直接建实例复制属性，不碰 OID。
- R3：新字段 `order_index = 原字段.order_index + 1`，落在被复制字段正下方。
- R4：复制成功后刷新列表并选中新字段（对齐 `saveDraftField` 成功行为）。
- R5：复制接入撤销/重做栈，**稳健档**语义：
  - undo：删新实例；分支 A 再尝试删新定义（409 被其他表单引用→降级保留并提示；标签字段因后端 `delete_form_field_and_cleanup_label_definition` 已自动清理孤儿标签定义，其显式删定义遇 404 视为可接受）。
  - redo：优先复用保留下来的 copied 定义 id；若已删除，则按**首次 copied 定义的完整快照**（含 `checkbox_label`，`order_index` 归位）重建同名定义，再建实例；`remapId` 回写新 id。不得在 redo 时再次 `/copy`（会长出新的 `_copyN`，OID 漂移）。

### 约束 / 边界
- C1：草稿字段不允许复制（按钮 `v-if="!isDraftField(ff)"` 隐藏）。
- C2：`copyFormField` 开头须 `hasDraft → confirmDiscardDraft`（保存/丢弃/取消）。**理由**：复制成功会 `loadFormFields()` 整体替换 `formFields.value`，若列表内另有未保存草稿会被冲掉；对齐 `addField`/`addLogRow` 的既有守卫。
- C3：双击防抖为**必需**（非可选）：复制链路非幂等，每次点击后端都新建唯一 OID 定义，而 FormField 唯一约束只拦同一 `field_definition_id`，不同复制定义可同时插入 → 双击必造两份。加行级 `copyingFieldIds` 锁（仿 `savingDraft`/`deletingFieldIds`）；`useDesignerHistory.busy` 只管撤销/重做、不保护按钮。
- C4：分支 A 实例创建失败必须清理已创建的孤儿定义（`DELETE` newFd 后再抛错），并 `ElMessage.error` 明确提示。
- C5：仅前端改动 + 复用现有后端接口，**零后端改动**。

## Acceptance Criteria
- [ ] 字段行「删除」左侧出现「复制」按钮，画布视图与全屏设计器共用同一处均生效；草稿字段不显示。
- [ ] 复制普通字段：新字段 OID = 原 OID + `_copy`，其余属性（类型/标签/默认值/颜色/字号/横向标记/checkbox_label 等）一致，位于原字段下一行。
- [ ] 复制日志行：新日志行 `label_override` 与样式一致，位于下一行，无 OID 报错。
- [ ] 复制后新字段被选中。
- [ ] undo 一次复制：新实例（及分支 A 的新定义）移除，回到复制前状态；409/404 分别降级保留/视为可接受。
- [ ] redo 一次复制：OID **不漂移**（复用/同名重建），反复 undo/redo 不产生 `_copy1/_copy2` 堆叠。
- [ ] 存在草稿时点复制先弹 `confirmDiscardDraft`；快速双击只产生一份副本。
- [ ] 分支 A 实例创建失败后字段库无孤儿定义残留，有错误提示。
- [ ] 测试三件（见 implement.md）：wiring + history/runtime remap + mocked-api 行为（两步请求 + 失败清理）；`node --test tests/*.test.js` 全绿。

## Notes
- 复用优先，禁止重造：前向定义复制走 `/field-definitions/{id}/copy`，实例 payload 走 `buildFormFieldCreatePayload`。
- 参考既有 `saveDraftField`（:2150 redo 范式）、`removeField`（:649 清理/降级）、`addField`（:621 草稿守卫）保持一致。
