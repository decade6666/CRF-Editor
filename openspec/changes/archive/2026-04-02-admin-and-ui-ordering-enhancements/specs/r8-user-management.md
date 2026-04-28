# Spec: R8 — 管理员界面支持用户管理

## Scope
后端：新增 admin/users 路由（list/create/rename/delete）。
前端：管理员界面用户管理视图。

## Functional Requirements

### FR-8.1 用户列表
```
GET /api/admin/users
  Auth: admin gate
  Response 200: [{ "id": int, "username": str, "project_count": int }]
```
- `project_count`：该用户当前拥有（owner_id）的项目数量

### FR-8.2 新增用户
```
POST /api/admin/users
  Auth: admin gate
  Body: { "username": str }
  Response 201: { "id": int, "username": str }
  Response 409: { "detail": "用户名已存在" }
```
- 用户名唯一约束：strip + 大小写敏感
- 不设密码（沿用无密码登录模型）

### FR-8.3 修改用户名
```
PATCH /api/admin/users/{user_id}
  Auth: admin gate
  Body: { "username": str }
  Response 200: { "id": int, "username": str }
  Response 409: { "detail": "用户名已存在" }
```
- **改名后旧 token 立即失效**：JWT 身份绑定稳定 `user.id` + `username` 快照；任一字段不匹配即 401
- 若旧用户名被新用户重新创建，旧 token 也必须继续 401，不得复活
- 若被改名的是当前 admin 自己，前端改名成功后立即清除 token 并跳转登录页

### FR-8.4 删除用户
```
DELETE /api/admin/users/{user_id}
  Auth: admin gate
  Response 204: (no content)
  Response 409: { "detail": "该用户仍拥有 N 个项目，无法删除" }
```
- **只要 `Project.owner_id == user_id`（任意未软删除项目）则禁止删除**
- 删除操作不级联删除任何项目

### FR-8.5 前端用户管理视图
- 表格展示：用户名 | 项目数 | 操作（改名、删除）
- 新增用户：inline 表单或对话框
- 删除按钮：若 project_count > 0 禁用，hover 提示「请先转移或删除该用户的项目」
- 改名：inline 编辑或对话框，成功后若被改名为当前用户则自动登出

## Acceptance Criteria
- [ ] 管理员界面可查看用户列表（含项目数）
- [ ] 可新增用户，用户名唯一；重名时给出 409 提示
- [ ] 可修改用户名，冲突时给出 409 提示
- [ ] 修改用户名后，该用户的旧 token 在下次请求时 401
- [ ] 若修改的是当前管理员自身，前端立即清除 token 并跳转登录页
- [ ] 若用户仍拥有项目，删除操作被拒绝（409），并在前端显示明确提示
- [ ] 删除操作不影响任何项目的 owner_id 或数据完整性
