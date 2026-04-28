# Proposal: 全栈性能优化第一批约束研究

**Change ID**: research-performance-constraints
**Version**: 1.0.0
**Status**: Research Complete → Ready for Plan
**Date**: 2026-04-25
**Author**: CCG spec-research

---

## 1. 一句话总结

为 CRF-Editor 的“第一批全栈性能优化”产出**约束集合 + 可验证成功判据**，将后续实现空间收敛到：
- 前端包体与懒加载优化
- 设计器响应式/渲染热点治理
- 后端主链路性能基线
- 导入导出与 SQLite 热点定位
- 仅在**有证据**时接受索引/轻量 migration 候选

本提案**不做实现决策**，仅为 `/ccg:spec-plan` 提供可机械执行的边界条件。

---

## 2. 背景

上一轮只读性能分析表明，当前性能问题并非集中在单一接口，而是分布在两个清晰边界：

1. **前端首屏与设计器热点**
   - `frontend/src/main.js` 全量注册 Element Plus 图标，首屏包体偏大
   - `frontend/src/App.vue` 的主 tab 不是 lazy 初始化
   - `frontend/src/components/FormDesignerTab.vue` 体量大、`watch/computed/cachedGet` 密集，是主要交互热点
   - `frontend/src/composables/useCRFRenderer.js` 承担高频列宽/HTML 渲染计算

2. **后端主链路与批处理热点**
   - 缺少统一 request/SQL/阶段耗时基线，导致收益难量化
   - `docx` preview / execute / export / clone / reorder / db import/merge 是主要热点路径
   - SQLite 在 WAL 下仍受单写者约束，长事务与 flush 放大会影响吞吐
   - 导入导出和截图链路混合 CPU / 文件 IO / SQL / 外部依赖，不能只用“慢 SQL”视角定义性能问题

因此，本 research 阶段的目标不是直接写方案，而是先明确：**哪些方向可以做，哪些方向不能做，什么算成功，什么必须保留。**

---

## 3. 用户确认

本次 research 已确认以下约束：

| 主题 | 用户确认 |
|---|---|
| 基线样本规模 | **中等规模** |
| 第一批范围 | **只含主链路**，不把 screenshot 后台任务与 AI review 纳入第一批成功判据 |
| 成功判据方式 | **先建基线**，先要求可观测、可重复测量，不先写死绝对 SLA |
| 索引 / migration | **允许进入候选范围，但必须有 EXPLAIN / 查询数 / 耗时证据支撑** |

---

## 4. 约束集合

### 4.1 Hard Constraints（不可违反）

| # | 约束 | 说明 |
|---|---|---|
| H1 | 本阶段只生成 proposal，不修改业务源码 | `/ccg:spec-research` 只产出约束与成功判据 |
| H2 | 第一批性能工作必须基于现有技术栈 | 保持 FastAPI + SQLAlchemy + SQLite + Vue 3 + Vite + Element Plus |
| H3 | 不得预设迁移数据库、引入任务队列、替换 UI 框架 | proposal 只能约束，不得提前做架构决策 |
| H4 | 第一批范围仅覆盖主链路 | 仅含 `docx preview`、`docx execute`、`word export`、`project clone`、`reorder`、`db import/merge` 及其前端可见主路径 |
| H5 | screenshot 后台任务与 AI review 不纳入第一批成功判据 | 可作为风险或后续候选，但不作为本批 acceptance gating |
| H6 | 前端列宽/渲染语义不能破坏现有跨栈契约 | `frontend/src/composables/useCRFRenderer.js` 与 `backend/src/services/width_planning.py` 必须继续语义对齐 |
| H7 | 后端 API 合约不能因性能工作被破坏 | 包括状态码、错误 JSON、导出下载行为、导入预览返回结构 |
| H8 | SQLite 单写者与 WAL 约束必须显式保留 | 任何性能候选都必须考虑长事务、busy timeout 与锁竞争 |
| H9 | `OrderService` 的排序正确性语义不能退化 | `order_index/sequence` 仍需保持 1-based、稠密、稳定、越权拒绝 |
| H10 | 导入导出兼容性约束不能放宽 | 包括 `rowid` 兼容、legacy `sort_order` 清理、`form_field` 非日志行不能为空引用 |
| H11 | 索引 / 轻量 migration 只能作为“证据驱动候选” | 未经 `EXPLAIN`、查询数、耗时或锁等待证据，不得进入计划 |
| H12 | 性能观测不得泄露敏感内容 | 不记录完整字段值、docx 内容、token、AI payload、本地敏感绝对路径 |
| H13 | 前端设计期预览仍以 HTML 模拟为基础 | 不得把截图/COM 依赖引入为交互式预览基础设施 |
| H14 | 现有安全与隔离边界不能因性能目标而削弱 | 包括 owner 校验、路径安全、上传校验、安全响应头、生产 auth 约束 |

### 4.2 Soft Constraints（约定 / 偏好）

| # | 约束 | 说明 |
|---|---|---|
| S1 | 前端优先做低风险 quick wins | 优先包体、lazy、局部响应式边界，而非大规模重构 |
| S2 | 前端优先复用既有 composable / cache / tab 结构 | 例如 `useApi.js`、`useCRFRenderer.js`、`App.vue` 现有壳层 |
| S3 | 后端优先补观测基线，再谈优化 | 没有基线不定义收益 |
| S4 | 后端优先保留现有 router → service/repository 分层 | 不把性能逻辑散落到 router |
| S5 | proposal 中的成功判据优先写成“可观察行为” | 如可测量、可复现、可对比，而非直接承诺绝对 SLA |
| S6 | 第一批尽量聚焦“高性价比、低风险”候选 | 例如日志基线、lazy、包体、热点路径证据采集、索引候选验证 |

---

## 5. 依赖关系

### 5.1 前端边界依赖

- `frontend/src/main.js`：当前依赖注入与图标注册入口
- `frontend/src/App.vue`：主壳层、tab 初始化、登录后主工作台
- `frontend/src/components/FormDesignerTab.vue`：设计器主热点，承担加载、排序、预览、字段编辑
- `frontend/src/composables/useApi.js`：缓存、并发去重、失效策略
- `frontend/src/composables/useCRFRenderer.js`：HTML 预览、列宽规划、前后端共享语义契约
- `frontend/vite.config.js`：现有 manualChunks 与构建告警边界

### 5.2 后端边界依赖

- `backend/src/database.py`：engine、PRAGMA、session、轻量 migration
- `backend/src/routers/import_docx.py`：preview / execute / screenshot 主链路入口
- `backend/src/services/docx_import_service.py`：docx 解析与导入执行
- `backend/src/services/export_service.py`：Word 导出主链路
- `backend/src/services/order_service.py`：重排序语义中心
- `backend/src/repositories/project_repository.py`、`form_field_repository.py`：查询边界与潜在索引热点

### 5.3 跨栈依赖

- 列宽规划契约：`backend/src/services/width_planning.py` ↔ `frontend/src/composables/useCRFRenderer.js`
- 导出/预览一致性：前端 HTML 预览不能与 Word 导出语义分叉
- API 可观察行为：`/api/projects/{id}/import-docx/preview`、`/execute`、`/export/word`、`reorder`、`db import/merge`

---

## 6. 风险与缓解

| 风险 | 概率 | 缓解措施 |
|---|---|---|
| 无统一基线，后续优化收益无法量化 | 高 | 计划阶段先定义 request/SQL/阶段耗时采集边界 |
| 只盯 SQL 会误判 docx CPU / 文件 IO / 外部依赖热点 | 高 | 成功判据必须按阶段拆分，不只看 DB |
| 前端 quick win 改动引发 tab 状态或设计器回归 | 中 | proposal 要求保留现有 tab/编辑流语义，并通过行为判据约束 |
| 索引 / migration 候选影响旧库兼容性 | 中 | 只有证据驱动候选可进入计划，并保持旧库 roundtrip 约束 |
| 观测日志泄露表单内容或本地路径 | 中 | proposal 明确限制日志内容，只记录规模、阶段、状态、匿名标识 |
| 将 screenshot / AI review 混入第一批会导致规格扩散 | 高 | 用户已确认第一批只含主链路，proposal 明确排除 |
| FormDesigner 大组件热点过多，容易诱发超范围重构 | 中 | proposal 将第一批限制为 quick wins + 可测热点，不预设组件大拆分 |

---

## 7. 成功判据（可验证）

> 本 proposal 采用**基线优先**策略：第一批成功不是“已经达到某个绝对阈值”，而是“已经建立可重复、可对比、可驱动后续计划的观测与约束”。

### 7.1 基线覆盖

- [ ] 能对**中等规模样本**重复采集前后端主链路基线
- [ ] 第一批基线至少覆盖：`docx preview`、`docx execute`、`word export`、`project clone`、`reorder`、`db import/merge`
- [ ] 第一批基线不把 screenshot 后台任务与 AI review 作为 gating 指标

### 7.2 前端可验证行为

- [ ] 构建产物可量化：记录当前入口 / vendor chunk 体积，能作为后续对比基线
- [ ] 能观察主工作台 tab 是否 lazy 初始化，以及设计器是否仍在非激活时被不必要初始化
- [ ] 能对设计器预览热点建立可重复的交互基线（如切换表单、加载字段、预览更新）
- [ ] 任何前端候选不得破坏现有列宽规划与 HTML 预览语义契约

### 7.3 后端可验证行为

- [ ] 能区分 request total、数据库读写、flush/commit、docx parse/generate、文件 IO 等阶段耗时
- [ ] 能统计关键路径的 SQL 数量、查询计划或等价证据，用于判断索引/查询优化候选是否成立
- [ ] 性能观测不改变现有响应 JSON、HTTP status、FileResponse 下载行为、错误 code 或安全校验逻辑
- [ ] `reorder`、`clone`、`import/export` 的现有事务一致性与回滚语义保持不变

### 7.4 证据驱动约束

- [ ] 若将索引 / 轻量 migration 纳入计划，必须附带 `EXPLAIN`、查询数、耗时或锁等待证据
- [ ] 若某候选无法给出可重复证据，则不得在计划阶段作为第一批承诺项
- [ ] 观测输出不得包含敏感 payload、token、完整 docx/字段内容或本地敏感绝对路径

---

## 8. 范围边界

### In Scope

- 前端：包体热点、图标/组件加载方式、tab lazy 边界、设计器响应式/渲染热点基线
- 后端：主链路性能基线、docx 导入导出热点、SQLite / 事务 / flush / 排序热点、证据驱动的索引候选
- 跨栈：预览/导出语义一致性、API 可观察行为不退化、列宽契约不破坏

### Out of Scope

- screenshot 后台任务的性能目标
- AI review 的网络耗时与外部模型性能目标
- 切换数据库、引入任务队列、替换前端框架、整体重写导入导出系统
- 直接承诺绝对 SLA 或固定改善百分比
- 与第一批主链路无关的功能性改造

---

## 9. Research Summary for OPSX

### Discovered Constraints

- 前端首批应优先聚焦 `main.js`、`App.vue`、`FormDesignerTab.vue`、`useApi.js`、`useCRFRenderer.js` 与 `vite.config.js` 的热点边界。
- 后端首批应优先聚焦 `database.py`、`import_docx.py`、`docx_import_service.py`、`export_service.py`、`order_service.py` 及关键 repository 的主链路证据。
- `useCRFRenderer.js` 与 `width_planning.py` 的语义契约是跨栈硬约束，不能为性能优化牺牲一致性。
- SQLite + WAL + 单写者模型、现有事务边界、排序稠密性、导入导出兼容性与错误 JSON 结构都是不可破坏的硬边界。
- 第一批 proposal 只能先定义“如何测量、如何判断候选是否成立”，不能替计划阶段决定最终方案。

### Dependencies

- 前端依赖：`main.js`、`App.vue`、`FormDesignerTab.vue`、`useApi.js`、`useCRFRenderer.js`、`vite.config.js`
- 后端依赖：`database.py`、`import_docx.py`、`docx_import_service.py`、`export_service.py`、`order_service.py`、相关 repository
- 跨栈依赖：列宽契约、导出/预览一致性、导入导出与 reorder API 合约

### Risks & Mitigations

- 风险：没有基线、误判热点、日志泄露、索引/migration 兼容性回归、前端 quick win 诱发回归
- 缓解：基线优先、阶段化观测、证据驱动候选、保持 API 合约与语义不变、限制观测内容

### Success Criteria

- 第一批成功标准是“中等规模样本 + 主链路 + 可重复基线 + 证据驱动候选”
- 不要求在 research 阶段给出固定 SLA
- 允许索引 / 轻量 migration 进入后续计划，但前提是证据充分

### User Confirmations

- 基线样本规模：**中等规模**
- 第一批范围：**只含主链路**
- 成功判据：**先建基线**
- 索引 / migration：**允许且必须有证据**

---

## 10. 下一步

Research complete. Proposal generated. Run `/ccg:spec-plan` to continue planning.
