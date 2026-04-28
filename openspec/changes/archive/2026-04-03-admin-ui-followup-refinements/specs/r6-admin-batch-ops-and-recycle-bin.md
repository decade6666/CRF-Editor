# Spec: R6 — 管理员支持用户项目批处理与回收站恢复

## Scope
后端：管理员批量复制、迁移、删除、回收站、恢复、硬删除。
前端：用户管理工作区内的项目批处理与回收站 UI。

## Functional Requirements

### FR-6.1 软删除与回收站
- 项目删除进入回收站，不立即物理删除。
- 活跃项目列表默认过滤软删项目。
- 回收站仅展示软删项目，并暴露 `deleted_at`、owner 信息。

### FR-6.2 批量删除
```http
POST /api/admin/projects/batch-delete
Auth: admin required
```
- 采用全成全败事务语义。
- 任何目标项目不存在、已软删或非法时，整个请求失败并零变更。

### FR-6.3 批量迁移 owner
```http
POST /api/admin/projects/batch-move
Auth: admin required
```
- 采用全成全败事务语义。
- 目标用户不存在或任一项目非法时，请求失败并零变更。

### FR-6.4 批量复制
```http
POST /api/admin/projects/batch-copy
Auth: admin required
```
- 采用逐条 savepoint 隔离。
- 返回逐项目结果列表，单条失败不影响其他成功项。

### FR-6.5 restore
```http
POST /api/admin/projects/{project_id}/restore
Auth: admin required
```
- 仅允许恢复回收站项目。
- 保留原 owner。
- 若名称冲突，自动重命名为 `原名 (恢复)`、`原名 (恢复2)`、...
- 恢复到该 owner 活跃列表末尾。

### FR-6.6 hard delete
```http
DELETE /api/admin/projects/{project_id}/hard-delete
Auth: admin required
```
- 仅允许彻底删除回收站项目。

### FR-6.7 用户删除限制
- 用户只要仍拥有任意项目（包含回收站项目）即禁止删除。
- `project_count` 统计活跃 + 回收站全部 owned projects。

## Acceptance Criteria
- [ ] 管理员可批量选择项目并执行复制/迁移/删除
- [ ] 软删项目从主列表消失并进入回收站
- [ ] 回收站可恢复项目，恢复后项目完整可用
- [ ] 名称冲突时 restore 自动重命名
- [ ] 仍拥有活跃或软删项目的用户无法删除
