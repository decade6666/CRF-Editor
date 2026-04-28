# 实施任务：无密码用户名登录

## 任务列表

- [x] 1.1 修改 `backend/src/models/user.py`：`hashed_password` 改为 `Mapped[Optional[str]]`，`nullable=True`
- [x] 1.2 修改 `backend/src/services/auth_service.py`：删除 `passlib` 导入、`hash_password`、`verify_password` 函数
- [x] 1.3 重写 `backend/src/routers/auth.py`：删除 `/register` 和 `/login`，新增 `/enter` 端点（upsert-by-username）
- [x] 1.4 修改 `backend/src/database.py`：新增 `_migrate_user_hashed_password_nullable`（重建表迁移），新增 `_warn_orphan_projects`，移除 `_bootstrap_admin_user`，更新 `init_db()` 调用顺序
- [x] 1.5 修改 `backend/src/config.py`：`AuthConfig` 删除 `admin_initial_password` 字段
- [x] 1.6 修改 `backend/requirements.txt`：删除 `passlib[bcrypt]` 和 `bcrypt<4.0.0` 两行
- [x] 2.1 修改 `frontend/src/components/LoginView.vue`：删除密码字段和相关校验规则，`handleLogin()` 改为 JSON POST `/api/auth/enter`，按钮文本改为 `进入`
- [x] 3.1 修改 `backend/tests/helpers.py`：`register_and_login` → `login_as(client, username)`，确认 `auth_headers` 保留
- [x] 3.2 重写 `backend/tests/test_auth.py`：覆盖 `/enter` 语义（创建用户、幂等、空用户名 422、无 token 401）
- [x] 3.3 修改 `backend/tests/test_isolation.py`：替换 `register_and_login(client, u, p)` 调用为 `login_as(client, u)`
- [x] 3.4 检查 `backend/tests/conftest.py`：移除 mock config 中 `admin_initial_password` 键（如存在）
- [x] 4.1 验证：启动后端 `cd backend && python main.py`，浏览器打开 `http://localhost:8000`，确认显示无密码框的登录界面
- [x] 4.2 验证：输入 `alice` 进入，看到 alice 项目列表；新标签输入 `bob`，看不到 alice 的项目（隔离有效）
- [x] 4.3 验证：`cd backend && pytest tests/ -v`，`test_auth.py`、`test_isolation.py`、`test_subresource_isolation.py` 全部通过
