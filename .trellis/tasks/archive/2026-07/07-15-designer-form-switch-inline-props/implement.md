# Implement checklist

## 1. Tests first
- [ ] 新增 `frontend/tests/formDesignerFormPropertyEditor.test.js`（源级 wiring）
  - header select 受控 + filteredForms + onSwitchFormFromDropdown
  - 表单属性状态/脏/保存/取消/leave 函数存在
  - 空白点击 onCanvasBlankClick 与 `.ff-item` 过滤
  - resolveDesignerLeave / selectForm 串联 form prop leave
  - 共享 persistFormProps 被 updateForm 与 saveFormProp 使用
  - PUT body / OID guard / paper orientation radios

## 2. Pure helpers (optional small)
- [ ] `formDesignerPropertyEditor.js` 增加 `buildFormPropState` / `sameFormPropState`

## 3. FormDesignerTab.vue
- [ ] 状态 + sync/dirty/save/cancel/leave/persist
- [ ] selectForm / resolveDesignerLeave / openDesigner / handleDesignerBeforeClose 接入
- [ ] header 下拉
- [ ] 右侧双模式 UI
- [ ] 字段列表空白点击
- [ ] updateForm 走共享 persist

## 4. Docs
- [ ] `frontend/.claude/CLAUDE.md` 变更日志 + 能力描述
- [ ] 根 `.claude/CLAUDE.md` 变更日志（简要）

## 5. Verify
```bash
cd frontend && node --test tests/formDesignerFormPropertyEditor.test.js
cd frontend && node --test tests/*.test.js
cd frontend && npm run lint
```

## Rollback
单文件 UI 改动为主；失败则还原 `FormDesignerTab.vue` 与新增测试文件。
