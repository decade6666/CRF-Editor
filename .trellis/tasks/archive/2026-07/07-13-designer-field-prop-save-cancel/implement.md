# Implement — 设计器属性卡改为保存/取消与脏拦截（G3）

> 任务：`07-13-designer-field-prop-save-cancel`｜先读 `prd.md` → `design.md`。
> 原则：TDD（先红后绿）；小步提交；每步跑源码级/运行时测试。禁止 git commit（由用户触发）。

## 前置

- [ ] 建议先完成 G4（`07-13-fields-multiref-warn-threshold`）落地共享 helper `frontend/src/composables/fieldReferenceImpact.js`（`countDistinctForms` / `formatFieldImpactMessage`）。若并行，本任务临时内联同逻辑，集成时收敛到同一 helper（父任务 PAC2）。
- [ ] 读取相关代码锚点（design.md §1 行号）。

## 步骤（有序）

### S1 — 脏态基准与派生（RED→GREEN）
- [ ] 测试：`formDesignerPropertyEditor.runtime.test.js` 增用例——选中字段后 `isDirty=false`；改任一属性后 `isDirty=true`；改回原值 `isDirty=false`；草稿字段 `isDirty` 恒 false。
- [ ] 实现：新增 `fieldPropBaseline` ref；`currentEditorPropState()`（映射 `editProp`→`snapshotFieldPropState` 形状，注意日志行 label→label_override）；`isDirty` computed。
- [ ] 在 `selectField` 水合末尾设 `fieldPropBaseline.value = snapshotFieldPropState(ff)`（草稿/无 fd → null）。

### S2 — 拆除持久字段 autosave（RED→GREEN）
- [ ] 测试：改属性后**不**产生自动 PUT 请求（mock api，断言未调用）；不再有 400ms 后自动保存。
- [ ] 实现：`watch(currentFieldPropDraftKey)` 移除持久字段入队+防抖分支（保留草稿 `applyEditorToDraft` 分支与 `isHydratingFieldProp`）。
- [ ] 移除 `selectField` 内 `void flushPendingFieldPropSave()`。
- [ ] 清理仅服务于 autosave 队列的死代码（`pendingFieldPropSnapshots`/`fieldPropSaveTimer`/`flushPendingFieldPropSave`/`flushFieldPropSaveBeforeReset`/`classifyFieldPropSaveError`/`upsert|hasPendingFieldPropSnapshot`/`pendingFieldPropSnapshotVersion`）；`resetFieldPropAutoSaveState` 精简为清编辑器+baseline+选中态（保留 `preserveEditor`）。逐个确认无其它引用后再删。

### S3 — 显式保存 saveSelectedFieldProp（含 3.3 影响提醒）（RED→GREEN）
- [ ] 测试：多表单引用（去重>1）→ 弹影响提醒；确认后提交并记录历史；取消→不提交、保持脏态。单/零表单→不弹直接提交。`missing_codelist`→提示且不提交。保存成功→baseline 更新、`isDirty=false`。
- [ ] 实现：`saveSelectedFieldProp()` 按 design §2.3；复用 `saveFieldProp` PUT/PATCH+历史核心（去 sessionId/队列依赖或传当前值）；引用 `fieldReferenceImpact` helper。
- [ ] 返回 boolean（成功=true）。

### S4 — 取消 cancelSelectedFieldProp（RED→GREEN）
- [ ] 测试：改属性后点取消→编辑器还原、无请求、`isDirty=false`。
- [ ] 实现：对当前 ff 重新 `selectField(ff)` 还原。

### S5 — 常显保存/取消 bar（模板）（RED→GREEN）
- [ ] 测试：`v-if` 持久字段时渲染 bar；按钮 `data-test`、`:disabled="!isDirty"`、busy 时禁用；草稿字段仍显示原草稿 bar。
- [ ] 实现：`</el-form>` 后新增持久字段 bar（design §2.7）。

### S6 — 三态离开拦截 resolveFieldPropLeave 重写（RED→GREEN）
- [ ] 测试：`isDirty` 下——保存分支（成功→继续/失败→留下）、取消分支（丢弃→继续）、关闭分支（留下）。覆盖切字段/切表单/切项目/关窗四路径。
- [ ] 实现：重写 `resolveFieldPropLeave`（design §2.5）；`onSelectFieldClick` 前置拦截（design §2.6）；确认 `selectForm`/切项目 watch/`canLeaveProject`/`handleDesignerBeforeClose` 调用语义正确。

### S7 — 交互矩阵回归 & 兼容（RED→GREEN）
- [ ] 覆盖 design §4 全矩阵：草稿共存、日志行、busy 禁用、快速编辑弹窗后 baseline 对齐。
- [ ] 断言不破坏 `designerHistory.test.js`、`designerNewFieldDraft.test.js`、`designerFieldCopy.test.js`、`07-13-designer-history-busy-coordination` 约定的 busy/session 语义。

### S8 — 文档同步
- [ ] 更新 `frontend/.claude/CLAUDE.md`（属性编辑器由 autosave 改为显式保存/取消 + 脏拦截 + 影响提醒契约；离开策略更新）。
- [ ] 若测试文件数变化，同步根/前端模块的测试清单计数。

## 验证命令（每步 + 收尾）

```bash
cd frontend && node --test tests/formDesignerPropertyEditor.runtime.test.js
cd frontend && node --test tests/designerHistory.test.js tests/designerNewFieldDraft.test.js tests/designerFieldCopy.test.js
cd frontend && node --test tests/*.test.js        # 全量
cd frontend && npm run lint && npm run build
```

- [ ] 若浏览器可用：smoke——保存/取消、切字段/关窗拦截三态、多表单影响提醒各走一遍；否则在报告注明未跑范围。

## Review gates

- [ ] `/ccg:verify-change` + `/ccg:verify-quality frontend/src/components/FormDesignerTab.vue`（改动 >30 行）。
- [ ] code-reviewer 复核 autosave 拆除无残留死代码、无遗漏离开路径、`isDirty` 无水合误报。
- [ ] 父任务 PAC2/PAC3：影响提醒 helper 与文案与 G4 一致。

## Rollback points

- 每个 S 步独立可回退；autosave 拆除（S2）是最大不可逆点——在 S2 前确保 S1 脏态已就绪、S3/S6 的显式保存与拦截能覆盖原 autosave 的所有"离开即保存"语义，避免出现"既不自动存也无拦截"的数据丢失窗口。
- 若 S3 影响提醒依赖的 G4 helper 未就绪，先内联实现并在集成时替换，不阻塞主链路。
