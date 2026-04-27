# Tasks: archived-ui-fix-spec-alignment

> 本变更是实现回调型修正：收缩当前代码，使其重新匹配 archived spec 的原始边界。

- [x] 1.1 在 `frontend/src/styles/main.css` 中删除亮色态 `.word-page .wp-log-row { background: #d9d9d9; }`
- [x] 1.2 保留 `html[data-theme="dark"] .word-page .wp-log-row { background: var(--color-bg-hover); }`
- [x] 1.3 验证：`main.css` 中其他 `.word-page` 暗色规则不变，`.fill-line` 不变（SC-1.1 ~ SC-1.4）
- [x] 2.1 在 `backend/src/services/export_service.py::_add_cover_page()` 中移除 `if project.sponsor or project.data_management_unit:` 的公共尾随空段逻辑
- [x] 2.2 将 `line_spacing = 2.0` 的内容后空段恢复为仅 `if project.data_management_unit:` 分支内生成
- [x] 2.3 验证：sponsor-only 时无内容后空段；DMU-only 时有 1 个；both-present 时仍为 1 个；both-absent 时无内容后空段（SC-2.1 ~ SC-2.4）
- [x] 2.4 验证：分页段 `line_spacing = 2.0`、sponsor/DMU 的 `Pt(7.8)` 段前后距保持不变（SC-2.5）
