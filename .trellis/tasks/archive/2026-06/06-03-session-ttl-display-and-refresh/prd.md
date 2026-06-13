# feat: 会话剩余时间显示 + 续期提示（可点击图标刷新）

## Goal

在前端顶栏显示当前会话剩余有效时间，临近过期时给出可见提示；并允许用户点击图标主动触发一次后端请求，让 770bd2c 引入的 `X-Refreshed-Token` 滑动续期机制立即把 token 续到新窗口。

目标是消除"突然 401 被踢回登录页"的体感问题，让用户在长时间停留页面（没有 API 活动）时也能清楚看到会话状态、并随手延期。

## What I already know

* 后端 JWT TTL：`config.yaml: auth.access_token_expire_minutes: 60`，硬上限 60 分钟（`backend/src/config.py:124-132`），production 红线不可放宽。
* 滑动续期已上线：`backend/src/dependencies.py:14-37` 在每次鉴权通过后下发 `X-Refreshed-Token`；`frontend/src/composables/useApi.js:25-39, 62` 在 2xx 响应里写回 `localStorage('crf_token')`。
* JWT payload 已含 `sub / username / ver / exp`（见 `.trellis/spec/guides/cross-stack-contracts.md:138-143`）。前端解码 `exp` 不需要任何后端改动。
* 401 处理已统一在 `useApi.js:41-44, 52-56`：清掉 `crf_token`、派发 `crf:auth-expired`；`App.vue` 监听后清空壳层状态。
* 顶栏现有图标列：管理员视图在 `App.vue:841-851`（Setting + 主题）；普通用户视图在 `App.vue:873-889`（Expand + RefreshRight + Setting + 主题）。新图标需要在两套顶栏同步出现。
* `App.vue:81-86` 已有 `logout()` 函数；登录后 `currentUser.value` 已就绪。
* 测试基线：`backend/tests/test_auth.py:154-232` 已覆盖刷新头契约，前端无 `auth-expired` 计时类测试。

## Assumptions (temporary)

* 倒计时数据源采用 **前端解析 JWT payload `exp`**，不引入新后端字段——理由：后端契约已经把 `exp` 列为公开字段，前端不需要额外请求即可得到剩余时间，避免 N 个面板同时轮询 `/api/auth/me`。
* 主动刷新动作采用 **复用 `/api/auth/me`**，不新增 `/api/auth/refresh` 端点——理由：`get_current_user` 已经在任意鉴权接口上下发 `X-Refreshed-Token`，再开一个专用端点只会增加契约面但行为完全等价。
* 倒计时只显示分钟粒度（"23 分钟"），不需要逐秒跳动；内部以 30s 节奏重算一次，省 CPU 也避免在多 tab 场景下产生密集 setInterval。
* 临近过期阈值 5 分钟：图标变色 + 弹一次 ElMessage 提示，不弹模态对话框（保留用户上下文，符合"显示而非打断"）。
* 本任务**不**改 JWT TTL、**不**改 `X-Refreshed-Token` 协议、**不**新增后端端点、**不**改 401 处理路径。

## Open Questions

* （暂无阻塞性问题；如果后续要求"长时间空闲也保持登录"，那是另一个独立任务——需要后端实现真正的 refresh token，不在本任务范围）。

## Requirements

### R1 倒计时显示
* 顶栏新增一个会话时间图标 + 文本组件（`SessionTimer.vue` 或就近放进 `App.vue` 顶栏槽位），管理员视图和普通用户视图都要出现，位置在主题切换图标左侧。
* 显示文案：`会话剩余 23 分钟`（剩余 ≥ 1 分钟）/ `会话即将过期` （剩余 < 1 分钟）/ `已过期`（≤ 0）。
* 数据来源：登录后从 `localStorage('crf_token')` 解析 JWT payload `exp`（Base64URL → JSON）；不引入第三方 JWT 库，手写一个不验签的纯解析函数（仅取 payload，不做信任决策）。
* 刷新频率：组件内 `setInterval(30_000)` 重算；组件卸载或登出时清理定时器。

### R2 临近过期提示
* 剩余 ≤ 5 分钟时图标进入 `warning` 视觉态（颜色变橙，可用 CSS class 切换），并在**进入该窗口的那一次重算**触发一次 `ElMessage.warning('会话即将过期，请尽快续期或保存进度')`，避免重复弹。
* 剩余 ≤ 0 时图标变红、文案"已过期"，但不自动跳登录页——保持现有 401 处理路径作为唯一登出触发点。

### R3 主动刷新
* 图标可点击；点击后调用 `apiGet('/api/auth/me')`（已存在），借助现有滑动续期把 `X-Refreshed-Token` 写回 `localStorage`。
* 刷新成功后立刻重算剩余时间并显示 `ElMessage.success('会话已续期')`；失败（网络错误）显示 `ElMessage.error`，**不要**因为单次失败就 logout。
* 401 情况由 `useApi.js` 现有路径处理，组件不重复实现。
* 点击期间图标进入 `loading` 视觉态，防止双击触发并发请求。

### R4 跨栈契约扩展
* `.trellis/spec/guides/cross-stack-contracts.md` 的 `auth-token` 契约（line 127-155）新增一条 Frontend invariant：
  - "Frontend MAY decode JWT payload `exp` for display purposes; this decode MUST NOT be treated as authoritative — backend `get_current_user` remains the only authority for token validity."
  - "Frontend MAY trigger `GET /api/auth/me` solely to request a fresh `X-Refreshed-Token`; this MUST NOT bypass the standard rate-limit or 401 handling."
* 不改契约 ID，不新增独立契约项；附加在 `Files`、`Tests` 行覆盖范围内。

### R5 边界与不做项
* 不实现真正的 refresh token（idle-too-long → 仍然过期，由后续任务决定是否做）。
* 不弹模态确认框。
* 不改 `access_token_expire_minutes`、不改 `dependencies.py` 的刷新头逻辑、不新增后端端点。
* 不在登录页/未登录状态下渲染该组件。
* 多 tab 场景：每个 tab 各自维护 `setInterval`，依赖 `localStorage` 的最新 token；不做 `storage` 事件跨 tab 同步（这是 polish 选项，本期不做）。

## Acceptance Criteria

### AC-1 显示
* [ ] 登录后顶栏（管理员 + 普通用户两个视图）出现会话剩余时间图标和文案，位于主题切换图标左侧。
* [ ] 文案随 30s 节拍自动减少，剩余 23/22/21 分钟可被肉眼观察到。
* [ ] 登出后图标消失。

### AC-2 临近过期
* [ ] 当剩余 ≤ 5 分钟时图标颜色切换为 warning，且只弹一次 `ElMessage.warning`。
* [ ] 当剩余 ≤ 0 时图标显示"已过期"，颜色为 danger；不自动跳转登录页。

### AC-3 主动刷新
* [ ] 点击图标后 `/api/auth/me` 被请求一次，`localStorage('crf_token')` 被更新，文案立即回到 60 分钟附近。
* [ ] 点击成功弹 `ElMessage.success('会话已续期')`；点击失败弹 error 但不 logout。
* [ ] 加载期间图标进入 loading 态，二次点击被防抖。

### AC-4 测试
* [ ] 前端新增测试 `frontend/tests/sessionTimer.test.js`：
  - 解析 JWT payload `exp` 的纯函数（提供 mock token，断言返回剩余秒数）；
  - 5 分钟阈值的 warning 触发去重（同一窗口内只触发一次）；
  - 刷新动作调用 `apiGet('/api/auth/me')` 一次并更新本地剩余时间状态。
* [ ] 后端不需要新增测试（行为完全复用 `test_auth.py:154-232` 已覆盖路径）。

### AC-5 契约文档
* [ ] `.trellis/spec/guides/cross-stack-contracts.md` `auth-token` 节追加 R4 列出的两条 invariant。

### AC-6 不破坏既有行为
* [ ] 401 处理路径不变（仍由 `useApi.js` 派发 `crf:auth-expired`）。
* [ ] 后端 `dependencies.py:14-37` 一行不动。
* [ ] `npm run lint` / `npm run build` 通过；现有前端 22 个测试全绿。

## Out of Scope

* 真正的 refresh token / "记住我"机制 → 单独任务。
* 跨 tab `storage` 事件同步 → 单独 polish 任务。
* 后端可配置不同角色 TTL → 单独任务。
* 登录页/管理员重置密码弹窗内的过期提示 → 走现有 401 路径即可。

## Files In Scope

| 改动 | 文件 |
|---|---|
| 新增 | `frontend/src/composables/useSessionTimer.js`（解析 + 倒计时 + 刷新动作）|
| 新增 | `frontend/src/components/SessionTimer.vue`（图标 + 文案 + 点击）|
| 修改 | `frontend/src/App.vue`（管理员视图和普通用户视图顶栏挂载点）|
| 修改 | `.trellis/spec/guides/cross-stack-contracts.md`（`auth-token` 契约新增两条 invariant）|
| 新增 | `frontend/tests/sessionTimer.test.js` |

## Files Out of Scope (不要碰)

* `backend/src/dependencies.py`、`backend/src/services/auth_service.py`、`backend/src/config.py`、`config.yaml`
* `frontend/src/composables/useApi.js` 的 401 处理段、`_storeRefreshedToken` 段
* `frontend/src/components/LoginView.vue`、`frontend/src/components/AdminView.vue` 的认证主流程

## Risks / Notes

* **JWT payload 解析失败**：token 损坏 / 用户清了 localStorage 后未登录就渲染组件。组件须只在已登录态挂载，并在解析异常时把文案降级为不显示（不抛出）。
* **时钟漂移**：客户端时钟和服务端不一致会导致显示偏差。本期不做时钟校准（成本远高于收益）；显示偏差最多在分钟级，可接受。
* **频繁点击刷新**：debounce 由 loading 态防御；后端有限流，无额外风险。
