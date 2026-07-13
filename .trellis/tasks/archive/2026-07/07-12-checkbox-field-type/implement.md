# 复选字段实施清单

## 0. Test-first baseline

- [ ] 在后端补复选字段创建/导出/列宽/复制导入的失败测试。
- [ ] 在前端补 renderer、属性编辑器与类型切换的失败测试。
- [ ] 执行这些聚焦测试，确认当前实现尚不能渲染 `□文本` 或保留 `checkbox_label`。

## 1. Backend data and API

- [ ] 给 `FieldDefinition`、Pydantic schemas 与 SQLite 轻量迁移增加 `checkbox_label`。
- [ ] 调整 field-definition 的复制、模板导入和模板预览映射以传递新属性。
- [ ] 对 `复选` 增加 Word 导出文本和 label-aware 列宽分支；保持不接入 codelist 选择分支。
- [ ] 按已确认范围更新 AI 类型校验常量（不增加 DOCX 自动检测逻辑）。

## 2. Frontend rendering and editors

- [ ] 在共享 renderer 加入 `复选` 输出与 label-aware 宽度计算，不修改 `isChoiceField`。
- [ ] 将 `label`/`checkbox_label` 补入 FormDesigner、Visits 与 SimulatedCRF 的 renderer 数据适配层。
- [ ] 在 FieldsTab 与 FormDesignerTab 的类型清单、属性编辑器和保存数据中支持 `checkbox_label`。
- [ ] 清理类型切换时的过期专属配置；确认 quick edit 只读类型与常规布局自动正确。

## 3. Cross-stack planner and data lifecycle

- [ ] 向 `frontend/scripts/generatePlannerFixtures.mjs` 加入复选 case，运行生成器更新 `backend/tests/fixtures/planner_cases.json`。
- [ ] 扩展 clone、项目导入与模板导入断言，锁定 null `codelist_id` 与复选文本保真。

## 4. Verification and review

- [ ] 运行后端聚焦 pytest、前端聚焦 node:test；修复后再运行 backend/frontend 全量回归、frontend lint/build。
- [ ] 启动 backend + Vite，使用浏览器验证两处创建入口、默认/自定义文本、无字典、quick edit、Word 导出与 aCRF 范围。
- [ ] 运行代码审查与适用的质量门禁；修复高严重度问题。
- [ ] 更新 README、README.en.md、根/模块 CLAUDE.md、`.claude/index.json` 和 Trellis 规格，再按用户要求决定提交。

## Rollback

- 代码回滚可删除新类型入口与渲染分支；数据库中的 `checkbox_label` 可保留为未使用的可空兼容列，避免破坏已有 SQLite 数据。
