# Tasks: backend-default-port-8888

## Phase 1 — 收敛仓库默认端口真值

- [x] 1.1 修改 `backend/src/config.py`：将 `ServerConfig.port` 默认值从 `8000` 改为 `8888`
- [x] 1.2 保持 `backend/src/config.py` 现有配置优先级不变：不得新增 env / CLI 端口覆盖逻辑，不得修改 `ServerConfig.host` 默认值
- [x] 1.3 修改仓库根 `config.yaml`：仅将 `server.port` 从 `8000` 改为 `8888`
- [x] 1.4 修改根 `config.yaml` 时保留现有其他键值原样不动，尤其不得改写 `auth.secret_key`、`ai.*`、`admin.*`

## Phase 2 — 对齐前端开发代理

- [x] 2.1 修改 `frontend/vite.config.js`：将 `/api` 代理目标从 `http://127.0.0.1:8000` 改为 `http://127.0.0.1:8888`
- [x] 2.2 保持 `frontend/vite.config.js` 中前端开发服务器端口 `5173` 不变
- [x] 2.3 确认 `frontend/src/composables/useApi.js` 继续使用相对 `/api` 路径，不新增任何 `localhost:8888` 或 `127.0.0.1:8888` 绝对 API base URL

## Phase 3 — 对齐中英文文档与默认示例

- [x] 3.1 修改 `README.md`：将配置示例中的 `server.port` 改为 `8888`
- [x] 3.2 修改 `README.md`：将默认 Web 访问地址、开发代理说明中的后端端口、`/docs` 地址统一改为 `8888`
- [x] 3.3 修改 `README.en.md`：将配置示例中的 `server.port` 改为 `8888`
- [x] 3.4 修改 `README.en.md`：将默认 Web 访问地址、开发代理说明中的后端端口、`/docs` 地址统一改为 `8888`
- [x] 3.5 README 改动仅限端口相关事实，不扩展到与本次端口变更无关的说明重写

## Phase 4 — 补最小必要回归测试

- [x] 4.1 在 `backend/tests/` 新增配置链路测试：验证 `config.yaml` 显式 `server.port` 仍覆盖模型默认值
- [x] 4.2 在 `backend/tests/` 新增 fallback 测试：验证缺失 `server.port` 时回退到 `ServerConfig.port == 8888`
- [x] 4.3 在 `frontend/tests/` 新增或更新静态断言测试：验证 `frontend/vite.config.js` 的 `/api` proxy target 为 `http://127.0.0.1:8888`
- [x] 4.4 在 `frontend/tests/` 新增或更新静态断言测试：验证 README / README.en 的默认端口示例统一为 `8888`

## Phase 5 — 运行验证

- [x] 5.1 保持 `backend/main.py` 不改动；运行源码开发后端并验证 `http://127.0.0.1:8888/docs` 可达
- [x] 5.2 保持 `backend/app_launcher.py` 不改动；仅在静态检查中确认它继续从 `config.server.port` 取端口、继续使用 `127.0.0.1` 打开浏览器
- [x] 5.3 运行前端开发服务器并验证 `/api` 请求能通过 Vite 代理正常命中 `8888` 后端

## Phase 6 — 范围收口检查

- [x] 6.1 全仓检查 `8000` 相关命中，确认实现后仅剩明确排除项或无关常量
- [x] 6.2 明确不修改 `data/admin/config.yaml`
- [x] 6.3 明确不新增 env / CLI 覆盖机制
- [x] 6.4 明确不改变源码开发 host 语义与桌面打包 host 语义

## Success Criteria

| ID | 条件 | 对应任务 |
|---|---|---|
| SC-1 | `backend/src/config.py` 与根 `config.yaml` 同时以 `8888` 作为仓库默认后端端口 | 1.1 ~ 1.4 |
| SC-2 | Vite `/api` proxy target 默认指向 `http://127.0.0.1:8888` | 2.1 ~ 2.3 |
| SC-3 | `README.md` 与 `README.en.md` 的端口示例、默认访问地址、`/docs` 地址全部统一为 `8888` | 3.1 ~ 3.5 |
| SC-4 | 配置优先级保持不变：显式 YAML 覆盖模型默认值 | 4.1 ~ 4.2 |
| SC-5 | 源码开发启动默认访问 `http://127.0.0.1:8888/docs` 可用 | 5.1 |
| SC-6 | 桌面启动入口继续从 `config.server.port` 取端口，且保持 `127.0.0.1` host 语义 | 5.2、6.4 |
| SC-7 | 未引入新的 env / CLI 覆盖，也未修改 host 语义 | 1.2、5.2、6.3、6.4 |
| SC-8 | `data/admin/config.yaml` 未被纳入本次实现范围 | 6.2 |
