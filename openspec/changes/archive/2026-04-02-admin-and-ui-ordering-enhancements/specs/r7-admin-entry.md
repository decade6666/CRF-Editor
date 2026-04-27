# Spec: R7 — 管理员界面入口（用户名来自 config）

## Scope
后端：扩展 config 模型、新增 auth me 接口、所有 admin 路由统一后端 gate。
前端：新增管理员入口 UI，基于 is_admin 控制显示。

## Functional Requirements

### FR-7.1 配置扩展
在 `config.yaml` 新增：

```yaml
admin:
  username: "admin"   # 与此用户名完全匹配的登录用户获得管理员能力
```

在 `backend/src/config.py` 对应新增 `AdminConfig` 与 `Settings.admin`。

**用户名比较规则**：strip 前后空白 + 大小写敏感（原样比较）。

### FR-7.2 后端 auth me 接口
新增：
```
GET /api/auth/me
  Auth: 需登录 token
  Response 200: { "username": str, "is_admin": bool }
```
- `is_admin` = (当前 username.strip() == settings.admin.username.strip())
- **不在响应中暴露 admin_username 原值**

### FR-7.3 后端 admin gate 依赖
新增依赖函数 `require_admin(current_user = Depends(get_current_user))`:
- 验证 `current_user.username.strip() == settings.admin.username.strip()`
- 不满足则 403

所有 admin 路由（`/api/admin/*`）统一使用此依赖。

### FR-7.4 前端管理员入口
- 登录后调用 `GET /api/auth/me`，存储 `isAdmin` 到应用状态
- `isAdmin = true` 时，在 App.vue 顶部或侧边栏显示「管理」入口按钮
- 进入管理员界面后展示用户管理页（R8）
- 界面中显示明显提示文案：**「管理员模式：当前使用用户名入口，不提供强安全保护」**

## Acceptance Criteria
- [ ] config.yaml 中可配置 `admin.username`
- [ ] `GET /api/auth/me` 返回当前用户名与 is_admin
- [ ] 使用 admin_username 登录时，前端显示「管理」入口
- [ ] 非 admin_username 登录时不显示「管理」入口
- [ ] 所有 `/api/admin/*` 路由若非管理员调用，返回 403
- [ ] 响应中不暴露 admin_username 原值
- [ ] 管理员界面包含明确的弱安全警示文案
