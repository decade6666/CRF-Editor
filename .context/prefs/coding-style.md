# Coding Style Guide

> 此文件定义团队编码规范，所有 LLM 工具在修改代码时必须遵守。
> 提交到 Git，团队共享。

## General

- 优先做小而可审阅的改动，避免无关重构。
- 函数尽量保持在 50 行以内，嵌套不超过 4 层。
- 命名要清晰直白，避免单字母变量（循环计数器除外）。
- 显式处理错误，禁止静默吞错。
- 默认使用不可变更新，避免就地修改对象或数组。
- 不在生产代码中保留调试输出；前端禁止 `console.log`。

## Backend (Python / FastAPI / SQLAlchemy)

- 遵循 PEP 8，并为所有函数签名补充类型注解。
- 路由层保持轻量，重逻辑放在 `backend/src/services/`。
- 数据访问优先复用 `repositories/` 与现有模型，不在路由中直接堆砌查询。
- 结构变更集中在 `backend/src/database.py` 的轻量迁移逻辑中维护。
- API 错误优先返回可直接展示的中文 `detail`，同时保留足够上下文便于排查。
- 禁止硬编码密钥、口令或令牌，统一走 `CRF_*` 环境变量或配置。

## Frontend (Vue 3 / Vite / Element Plus)

- 复用逻辑优先放入 `frontend/src/composables/`，避免在组件内复制业务代码。
- API 请求统一通过 `frontend/src/composables/useApi.js`。
- 字段渲染与预览统一复用 `frontend/src/composables/useCRFRenderer.js`。
- 字段展示规则优先复用 `frontend/src/composables/formFieldPresentation.js`。
- 保持语义化 HTML、键盘可导航和合理 ARIA 标注。
- 动画若需要引入，优先使用 Anime.js 或 Framer Motion 风格的成熟方案；当前栈内不要手写复杂动画引擎。

## Cross-stack Contracts

- 列宽规划改动必须同步检查后端 `backend/src/services/width_planning.py` 与前端 `frontend/src/composables/useCRFRenderer.js`。
- 调整列宽契约时，同时更新 `backend/tests/fixtures/planner_cases.json`、`backend/tests/test_width_planning.py`、`frontend/tests/columnWidthPlanning.test.js`。
- 排序语义变更需同步检查 `backend/src/services/order_service.py` 与前端排序 composables。
- 认证链路变更需同步检查后端认证服务/路由与前端 `App.vue`、`LoginView.vue`、`AdminView.vue`。

## Git Commits

- 使用 Conventional Commits，语气保持 imperative。
- 一个 commit 只做一类逻辑变更。
- 类型限定为：`feat`、`fix`、`refactor`、`docs`、`test`、`chore`、`perf`、`ci`。

## Testing

- 每个 `feat` / `fix` 都必须包含对应测试。
- 先写失败测试，再写最小实现，再回归验证。
- 覆盖率不得下降，目标不低于 80%。
- 后端使用 `pytest`；前端使用 `node:test`。
- 涉及认证、权限、项目隔离、导入导出、列宽契约的改动，必须补对应回归。

## Security

- 不记录或展示 secrets、tokens、cookies、JWT 完整值。
- 所有外部输入必须在系统边界做校验。
- production 相关改动必须遵守 `CRF_ENV`、JWT TTL、管理员保留账号修复等安全约束。
- 上传、导入路径和文件类型校验不得绕过现有白名单规则。
