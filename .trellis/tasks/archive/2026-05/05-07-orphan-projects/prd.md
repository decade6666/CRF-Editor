# brainstorm: 处理孤立项目（放入回收站不提醒）

## Goal

在应用启动时检测孤立项目（owner_id 为 NULL），将其自动移入回收站，避免警告日志，并确保这些项目不会影响正常使用。

## What I already know

- 启动时日志显示：WARNING src.database - 发现 1 个孤立项目（owner_id 为 NULL），这些项目将无法被任何用户访问
- 当前孤立项目只是警告，未做实际处理
- 需要放入回收站并禁止提醒

## Assumptions (temporary)

- 孤立项目应移入回收站而非直接删除（可恢复）
- 放入回收站后不再输出警告日志

## What I already know (updated)

- 回收站功能已完整实现（admin.py 有 list_recycle_bin、restore_project、hard_delete_project）
- 前端 AdminView.vue 有完整的回收站 UI
- `restore_project` 逻辑依赖 `project.owner_id` 计算排序，owner_id 为 NULL 时会出错

## Decision (ADR-lite)

**Context**: 孤立项目（owner_id 为 NULL）在启动时仅输出警告，未做实际处理
**Decision**: 启动时自动将孤立项目移入回收站，允许恢复为孤立状态
**Consequences**: 需要修改 restore_project 逻辑以处理 owner_id 为 NULL 的情况

## Requirements

- 启动时检测孤立项目（owner_id 为 NULL）
- 自动将孤立项目设置 deleted_at（移入回收站）
- 移入回收站后不输出警告日志
- 恢复孤立项目时允许保持 owner_id 为 NULL

## Acceptance Criteria

- [ ] 启动时不再显示孤立项目警告日志
- [ ] 孤立项目被自动设置 deleted_at
- [ ] 回收站列表能显示孤立项目（owner_id 为 NULL）
- [ ] 管理员可以恢复孤立项目（恢复后 owner_id 保持 NULL）

## Definition of Done

- 测试通过
- 代码符合项目规范
- 文档更新（如需要）

## Out of Scope

- 直接删除孤立项目（不可恢复）
- 修改孤立项目的 owner_id

## Technical Notes

- 已修改 `backend/src/database.py` 中的 `_warn_orphan_projects` 为 `_move_orphan_projects_to_recycle_bin`
- 已修改 `backend/src/routers/admin.py` 中的 `restore_project` 以处理 owner_id 为 NULL 的情况
- 测试通过：test_admin_project_ops.py (10 passed), test_isolation.py, test_subresource_isolation.py, test_permission_guards.py (50 passed)
