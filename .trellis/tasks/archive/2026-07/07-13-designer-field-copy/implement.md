# 执行计划 — 表单设计器字段复制（稳健档）

## 前置
- 分支 `draft`，仅前端。
- 开工前重读：`buildFormFieldCreatePayload`(:472)、`reloadAfterReplay`(:557)、`addField`(:621)、`removeField`(:649 含 409 降级)、`saveDraftField`(:2150 redo 范式)、`addLogRow`(:2238)、草稿守卫（`isDraftField`/`hasDraft`/`confirmDiscardDraft`）、`deletingFieldIds`(:659)、`savingDraft`(:2162)。
- 确认后端唯一约束冲突返回码（预期 409）：`backend/src/routers/fields.py` 创建定义路径 + `main.py` 唯一约束→JSON 映射。

## 步骤
1. **新增 `copyingFieldIds` ref**（`ref(new Set())`，放 `deletingFieldIds` 附近）。
2. **写 `copyFormField(ff)`**（放 `removeField` 附近），按 design.md 数据流：
   - 草稿兜底 return → `hasDraft` 确认 → 行级锁 → 组 `instancePayload`（`order_index=原+1`）。
   - 分支 A：`/copy` 定义 → 建实例（失败清理孤儿定义再抛错）；分支 B：直接建实例。
   - `reloadAfterReplay(formId,{defs:!isLog})` → 选中新字段。
   - 构造 `defSnapshot`（`buildDefinitionSnapshotFromResponse`，含 checkbox_label、order_index=null）。
   - `designerHistory.record`（undo/redo 稳健档，见 design.md）。
   - `try/catch ElMessage.error` + `finally` 释放锁。
3. **内联辅助 `buildDefinitionSnapshotFromResponse(newFd)`** —— 从 `/copy` 响应取全部可写列（勿用 `buildFieldDefinitionCreatePayload`，它漏 checkbox_label）。
4. **模板改动**（:3530「删除」左侧）：插入复制按钮（`v-if="!isDraftField(ff)"`、`:disabled="copyingFieldIds.has(ff.id)"`、`@click.stop="copyFormField(ff)"`）。
5. **测试 `frontend/tests/designerFieldCopy.test.js`（三件）**：
   - (a) **wiring**：模板含 `copyFormField(ff)` + `@click.stop` + 位于 `removeField` 左侧 + `v-if !isDraftField` + `:disabled` 绑 `copyingFieldIds`；源码含 `/field-definitions/${...}/copy`、`order_index` `+ 1`、`confirmDiscardDraft`、`designerHistory.record('复制字段')` 字样。
   - (b) **history/runtime remap**：模拟 record 的 undo/redo，断言 redo 复用/同名重建、`remapId` 调用、OID 不漂移（redo 不调用 `/copy`）。
   - (c) **mocked-api 行为**：mock `api`，验证分支 A 两步请求顺序、实例失败时 `del` 孤儿定义、分支 B 日志行不调 `/copy`、双击第二次被锁拦截。
   - 参考风格：`designerNewFieldDraft.test.js`、`designerHistory.test.js`、`codelistsCopyButton.test.js`、`orderingStructure.test.js`；勿只 regex。

## 验证命令
```bash
cd frontend && node --test tests/*.test.js
cd frontend && npm run lint
cd frontend && npm run build
```

## 复查门
- [ ] 按钮就位（草稿隐藏、复制中禁用）。
- [ ] 普通字段 OID `_copy`、属性全复制（含 checkbox_label）、落下一行。
- [ ] 日志行复制无 OID 报错。
- [ ] undo 移除实例+定义（409 保留/404 容忍）；redo OID 不漂移、无 `_copyN` 堆叠。
- [ ] 草稿确认、双击防抖、孤儿清理、错误提示齐全。
- [ ] 三件测试 + lint + build 全绿。

## 回滚点
`git checkout frontend/src/components/FormDesignerTab.vue frontend/tests/designerFieldCopy.test.js` 整体回退。

## 文档同步（收尾）
- `frontend/.claude/CLAUDE.md`：FormDesignerTab 能力追加「字段实例复制（撤销/重做稳健档）」，测试目录计数 +1，Change Log +1。
- 根 `.claude/CLAUDE.md` Change Log +1。
- 若测试文件计数出现在 README，同步。
