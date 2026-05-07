# brainstorm: 首次访问必须先登录

## Goal

首次访问应用时必须先进入登录界面，未登录用户不能直接进入编辑界面，避免在编辑界面执行操作时因缺少认证状态而报错。

## What I already know

* 用户反馈：首次访问时当前不在登录界面，而是直接进入编辑界面。
* 用户反馈：必须登录才能进入编辑界面。
* 用户反馈：直接进入编辑界面后执行操作会报错。
* 用户提供了截图作为现象补充。
* `frontend/src/App.vue` 当前用 `!!localStorage.getItem('crf_token')` 初始化 `isLoggedIn`，因此只要本地存在 token 就会先渲染主工作台。
* `frontend/src/App.vue` 在 `onMounted` 后才调用 `/api/auth/me` 和 `/api/projects`，过期或无效 token 可能导致主界面短暂出现并触发 401。
* `frontend/src/composables/useApi.js` 已统一处理 401：清除 token 并派发 `crf:auth-expired`。
* `frontend/tests/appSettingsShell.test.js` 已覆盖登录记忆、登出、401 失效和管理员分流结构，但未覆盖启动鉴权等待态。

## Assumptions (temporary)

* 根因更可能是“存在无效/过期本地 token 时启动阶段直接进入主界面”，而不是完全没有登录页。
* 预期行为应是未认证状态显示登录页，认证成功后再显示项目/编辑相关界面。
* 后端接口已经要求认证，修复重点应在前端启动鉴权和渲染守卫。

## Open Questions

* 无。

## Requirements

* 未登录用户首次访问应用时必须看到登录界面。
* 应用启动时如果本地存在 token，必须先调用 `/api/auth/me` 验证登录态。
* token 验证通过前不能渲染普通编辑工作台或管理员工作台。
* token 缺失、过期或无效时必须清理会话并显示登录界面。
* 登录成功后才能进入管理员或普通用户对应工作台。
* 未登录状态下不应触发会导致报错的编辑器数据操作。

## Acceptance Criteria

* [ ] 清空本地登录态后访问应用，默认显示登录界面。
* [ ] 本地存在无效 token 时访问应用，不显示编辑界面，验证失败后显示登录界面。
* [ ] token 验证完成前不触发 `/api/projects` 或编辑器相关数据请求。
* [ ] token 验证通过后普通用户可正常进入项目工作台。
* [ ] 登录成功后可正常进入对应工作台。
* [ ] 相关前端回归测试覆盖启动鉴权等待态。

## Definition of Done (team quality bar)

* Tests added/updated where appropriate.
* Lint / typecheck / relevant tests green.
* Docs/notes updated if user-visible behavior or workflow changes.
* Rollout/rollback considered if risky.

## Out of Scope (explicit)

* 暂不重做认证体系、权限模型或后端登录接口。
* 暂不设计新的路由架构，除非代码检查证明必须调整。

## Technical Notes

* 待检查前端认证入口、应用初始化逻辑与编辑界面渲染条件。
* 重点关注 `frontend/src/App.vue`、登录组件、API 认证状态恢复逻辑以及相关测试。
