# Spec: R1 — 设置页导入能力对所有登录用户开放

## Scope
前端：设置页导入按钮显示与触发。
后端：项目导入与整库合并导入继续走 `projects` 路由。

## Functional Requirements

### FR-1.1 设置页入口
- 设置页中的“导入项目(.db)”与“导入数据库(.db)”对所有已登录用户可见、可点击。
- 不再以 `isAdmin` 控制显示或可用性。

### FR-1.2 单项目导入
```http
POST /api/projects/import/project-db
Auth: login required
```
- 上传文件必须是有效 SQLite 数据库。
- 文件大小上限 200MB。
- 外部库必须恰好包含 1 个 project，否则 400。
- schema 不兼容时返回 400。
- 导入成功后，项目及其全部子资源归属于当前登录用户。

### FR-1.3 整库合并
```http
POST /api/projects/import/database-merge
Auth: login required
```
- 上传文件必须是有效 SQLite 数据库。
- 文件大小上限 200MB。
- schema 不兼容时返回 400。
- 外部 user 记录不导入。
- 所有导入项目的 owner_id 强制重绑为当前登录用户。
- 名称冲突时自动重命名，不覆盖现有项目。

### FR-1.4 原子性
- 任一导入失败都不得留下半成品项目。
- logo 等文件系统副作用只能在数据库事务成功后执行。

## Acceptance Criteria
- [ ] 普通用户在设置页可见并可触发两类导入
- [ ] 单项目导入成功后，新项目 owner 为当前用户
- [ ] 整库合并成功后，所有导入项目 owner 为当前用户
- [ ] 非 SQLite、超大文件、schema 不兼容、非单项目库都返回 400
- [ ] 任一失败场景下数据库零脏写入
