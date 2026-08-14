# 全屏设计器两栏重构与字段原子 profile — 实施顺序

## 前置

- 必须基于 PR#72（子任务 1）合并后的最新 main 切 worktree 分支。
- `FormDesignerTab.vue` 串行独占；先提交任务启动，后实施。

## 后端先行（TDD，RED→GREEN）

1. `backend/src/services/field_normalization.py` + 共享用例表 + `test_field_normalization_parity.py`（前端同表锁定）。
2. `backend/src/schemas/field_profile.py`：FieldProfileCommand 校验（判别 + 组合校验 + 归一 schema）。
3. `backend/src/services/field_profile_service.py`：单事务执行 create / instance-only / shared / rebind / fork / restore / delete+cleanup；复用 `verify_*`、`_reject_disallowed_multiselect`、`OrderService`。
4. `backend/src/routers/fields.py` 新增 `POST /forms/{form_id}/field-profile`、`PUT /form-fields/{ff_id}/binding-profile`；`main.py` 无需改动（fields router 已注册）。
5. 后端测试矩阵（`test_field_profile.py` 或并入 `test_fields_router.py`）：全模式、重复/跨项目/log 行/校验/归一/事务回滚（构造第二次写失败断言定义与实例均未落库）/清理语义/权限。
6. 迁移旧端点测试断言 → 新端点；删除三个旧写路由并确认 404 契约。

## 前端

7. `usePaneSplit` 加 `axis`（`paneSplit.test.js` 补横向用例）。
8. `fieldDefinitionAutocomplete.js`（纯逻辑：候选过滤/排序/当前/已添加/水合状态）+ 契约测试。
9. `formDesignerPropertyEditor.js` 补 profile 快照/比较/命令构造纯函数 + 测试。
10. `FormDesignerTab.vue` 布局重构：两栏 + 左栏上下分栏 + 窄屏退化 + 删除字段库三件套 + 属性卡固定标题/滚动/固定动作栏（同步 `paneSplit`/`wordPageGeometry`/`acrfViewToggle` 等源码契约测试）。
11. 自动完成接线：OID/标签两个 `el-autocomplete`、候选 slot、当前/已添加禁用、粘贴同 OID 阻止。
12. 保存路径迁移：`saveFieldProp`/`saveDraftField`/`saveQuickEdit`/`toggleInline`/`applyFieldPropState` → 单次 profile；影响确认与历史快照升级。
13. 备注弹窗：新 `DesignNotesDialog.vue`（或隔离块）、删除防抖/队列/全屏摘要。
14. 全屏图标化：Plus/Check/文档添加 log/撤销重做/批删常显/行级 inline/复制/删除（子任务 1 规范延续）。
15. 前端测试迁移 + 新增：designerHistory（原子回放/失败保栈/分叉保留提示）、designerNewFieldDraft（field-profile）、formDesignerPropertyEditor.runtime（autocomplete 接线/水合/阻止）、quickEditBehavior、designNotes 弹窗契约、`designerFieldRebind.test.js`。

## 验证命令

```bash
cd backend && python3 -m pytest -q
cd frontend && node --test tests/*.test.js
cd frontend && npm run lint && npm run build
```

浏览器实机（亮/暗、宽/窄屏）：候选选择→保存→影响确认→撤销/重做（分叉保留/删除）、备注弹窗、分隔记忆、eCRF/aCRF/列宽/行高/注记无回归；验证前必须 `npm run build` 防旧包假象。

## 回滚点

- 每步一个提交粒度（后端端点组 / 布局 / 自动完成 / 保存迁移 / 备注 / 图标），便于 revert。
- 旧端点删除必须等前端迁移与测试迁移同 PR 完成。
