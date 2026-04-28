# Tasks: 设置中的普通用户自助修改密码

## 1. OpenSpec 产物补齐
- [x] 1.1 确认 `proposal.md` 中按钮文案、位置、适用角色、限流与成功后登出语义与最终约束一致
- [x] 1.2 新增 `design.md`，冻结接口路径、错误码、会话失效、前端交互与测试策略
- [x] 1.3 新增 `specs/auth-self-password-change/spec.md`，定义后端自助改密契约与受保护行为
- [x] 1.4 新增 `specs/settings-self-password-change/spec.md`，定义设置弹窗入口、子弹窗与成功/失败交互

## 2. 后端认证能力扩展
- [x] 2.1 修改 `backend/src/routers/auth.py`：新增 `PUT /api/auth/me/password` 请求模型与路由
- [x] 2.2 修改 `backend/src/routers/auth.py`：为普通用户专用自助端点增加管理员 `403` 授权约束
- [x] 2.3 修改 `backend/src/services/auth_service.py` 或等价认证服务：补充自助改密共享逻辑，复用 `verify_password`、`validate_password_policy` 与 `hash_password`
- [x] 2.4 修改自助改密逻辑：当前密码错误、密码策略错误、新旧密码相同统一返回 `400`，不得返回 `401`
- [x] 2.5 修改自助改密逻辑：成功后更新 `hashed_password` 并递增 `auth_version`
- [x] 2.6 修改 `backend/src/rate_limit.py` 与认证路由调用点：在 production 下为自助改密复用现有登录限流契约
- [x] 2.7 确认后端请求模型禁止额外字段被静默忽略，保持 `确认新密码` 仅由前端处理

## 3. 前端设置弹窗交互
- [x] 3.1 修改 `frontend/src/App.vue`：在设置弹窗“当前用户”一行把“修改密码”按钮放到用户名右侧
- [x] 3.2 修改 `frontend/src/App.vue`：确保该按钮仅普通用户可见，管理员设置中不显示
- [x] 3.3 修改 `frontend/src/App.vue`：新增自助改密子弹窗与 `当前密码 / 新密码 / 确认新密码` 表单字段
- [x] 3.4 修改 `frontend/src/App.vue`：前端校验新密码与确认新密码一致，不一致时阻止提交
- [x] 3.5 修改 `frontend/src/App.vue`：请求 `PUT /api/auth/me/password` 时仅发送 `current_password` 与 `new_password`
- [x] 3.6 修改 `frontend/src/App.vue`：成功后先提示，再复用现有会话清理逻辑立即退出并返回登录态
- [x] 3.7 修改 `frontend/src/App.vue`：业务失败时保持在设置流程内展示错误，不把业务错误当作全局登录过期

## 4. 测试补充
- [x] 4.1 修改 `backend/tests/test_auth.py`：覆盖普通用户自助改密成功返回 `204`
- [x] 4.2 修改 `backend/tests/test_auth.py`：覆盖成功后旧 JWT 访问受保护接口返回 `401`
- [x] 4.3 修改 `backend/tests/test_auth.py`：覆盖成功后旧密码登录失败、新密码登录成功
- [x] 4.4 修改 `backend/tests/test_auth.py`：覆盖当前密码错误返回 `400` 且数据库状态不变
- [x] 4.5 修改 `backend/tests/test_auth.py`：覆盖新密码不满足策略与新旧密码相同返回 `400`
- [x] 4.6 修改 `backend/tests/test_auth.py`：覆盖管理员调用自助端点返回 `403`
- [x] 4.7 修改 `backend/tests/test_auth.py`：覆盖 production 下自助改密失败复用登录限流并返回 `429 + Retry-After`
- [x] 4.8 修改 `frontend/tests/appSettingsShell.test.js`：覆盖普通用户用户名右侧出现“修改密码”按钮
- [x] 4.9 修改 `frontend/tests/appSettingsShell.test.js`：覆盖管理员不显示该按钮
- [x] 4.10 修改 `frontend/tests/appSettingsShell.test.js`：覆盖子弹窗三字段结构与成功后会话清理链路

## 5. 验证
- [x] 5.1 运行 `cd backend && python -m pytest backend/tests/test_auth.py` 或等价认证测试集，确认新增后端用例通过
- [x] 5.2 运行 `cd frontend && node --test tests/appSettingsShell.test.js` 或等价前端测试，确认设置壳层断言通过
- [x] 5.3 手动验证：普通用户在设置弹窗用户名右侧看到“修改密码”按钮，管理员看不到
- [x] 5.4 手动验证：修改密码成功后先提示，再立即退出并要求重新登录
