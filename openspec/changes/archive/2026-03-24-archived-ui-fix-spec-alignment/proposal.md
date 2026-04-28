# Proposal: archived-ui-fix-spec-alignment

## Why

`ui-fix-dark-mode-layout-export` 已归档，但后续双模型审查发现：当前实现与归档 spec 存在两处边界不一致。

1. `frontend/src/styles/main.css` 已存在亮色态 `.word-page .wp-log-row { background: #d9d9d9; }`，而归档 Spec 01 只描述了暗色模式覆盖，未把这条亮色基线纳入需求边界。
2. `backend/src/services/export_service.py` 当前在 `project.sponsor or project.data_management_unit` 任一存在时插入一个 `line_spacing = 2.0` 的尾随空段，而归档 Spec 03 将其描述为“仅 DMU 后空段”。

本变更的目标不是扩展功能，而是**把实现回调到归档 spec 的原始边界**，消除审查中的 Warning，并让 archived spec 与运行时代码重新一致。

## What Changes

### 1. 前端：回收 `.wp-log-row` 的亮色基线

- 删除 `frontend/src/styles/main.css` 中亮色态 `.word-page .wp-log-row { background: #d9d9d9; }`
- 保留暗色模式下的 `.word-page .wp-log-row { background: var(--color-bg-hover); }`
- 以此恢复 Spec 01 的“仅暗色模式追加覆盖、亮色模式不变”边界

### 2. 后端：恢复为仅 DMU 后空段

- 调整 `backend/src/services/export_service.py::_add_cover_page()`
- 仅当 `project.data_management_unit` 存在时，才插入 `line_spacing = 2.0` 的内容后空段
- `project.sponsor` 存在但 `project.data_management_unit` 为空时，不再插入该空段
- 保留分页段 `line_spacing = 2.0` 不变

### 3. OpenSpec 对齐

- 更新本变更的 design/specs/tasks，明确这是一次**实现回调**而不是文档追认
- 验证 4 个封面场景边界：`sponsor only`、`DMU only`、`both present`、`both absent`

## Out of Scope

- 不修改 `.fill-line`（继续遵守 HC-3）
- 不修改暗色模式边框颜色策略
- 不扩展 Word 封面页新的布局规则
- 不补充新的自动化测试基座
- 不修改已归档变更目录中的历史文件
