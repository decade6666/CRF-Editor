# Tasks: 模板导入修复与 UI 微调

- [x] 1.1 在 `backend/src/services/import_service.py` 顶部添加 `from sqlalchemy.exc import OperationalError`
- [x] 1.2 将 `import_service.py:119-123` 的查询包裹在 try/except OperationalError 中，fallback 为按 `FormField.id` 排序
- [x] 1.3 验证：用旧模板（无 order_index 列）预览表单字段，不报 500
- [x] 2.1 在 `frontend/src/App.vue:788` 移除 `v-if="isAdmin"`
- [x] 2.2 验证：非 admin 用户可见"导入项目"和"导入数据库"按钮，且导入导出两列对齐
- [x] 3.1 在 `frontend/src/components/FormDesignerTab.vue:387` 的 `quickEditProp` 中添加 `default_value: ''`
- [x] 3.2 在 `FormDesignerTab.vue:390-396` 的 `openQuickEdit` 中初始化 `default_value: ff.default_value || ''`
- [x] 3.3 在 `FormDesignerTab.vue:402` 的 `saveQuickEdit` payload 中添加 `default_value: quickEditProp.default_value || null`
- [x] 3.4 删除 `FormDesignerTab.vue:703` 的变量名行（整行删除）
- [x] 3.5 将 `FormDesignerTab.vue:711` 的默认值改为 `v-model="quickEditProp.default_value"`，移除 `disabled` 和 `v-if` 条件
- [x] 4.1 验证：FieldsTab 和 FormDesignerTab 表单列表拖拽后序号立即更新
