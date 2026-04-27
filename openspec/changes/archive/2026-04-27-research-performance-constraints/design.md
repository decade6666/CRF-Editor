# Design: research-performance-constraints

> 零决策可执行设计。
> 本文档把 `/ccg:spec-research` 的约束、双模型分析结果、歧义消解结果与 PBT 要求收敛为可机械执行的实施蓝图。

## Planning Summary for OPSX

**Multi-Model Analysis Results**:
- codex (Backend): 推荐采用“低侵入、进程内观测 + 可重复基线 + 证据驱动候选”的后端路径；优先建立 request/SQL/阶段耗时证据，不引入数据库替换、任务队列或大规模重构。
- gemini (Frontend): 推荐采用“保守 quick wins + 严格浏览器基线”的前端路径；优先缩小入口包体、延迟非激活 tab/对话框挂载、量化设计器热点，不改变现有 API 与跨栈渲染契约。
- Consolidated Approach: 第一批实施固定为 `重压 1600 样本 + Chromium 严测 + 后端观测基线 + 前端保守 quick wins + 证据门槛筛选候选优化`。

**Resolved Constraints**:
- 基线样本固定为重压样本：1 个 owner、1 个主项目、10 个 visits、40 个 forms、每 form 40 个 fields（总计 1600）、20 个 codelists × 20 options、30 个 units。
- DOCX fixture 固定为 40 张表；数据库 merge fixture 固定为 5 个项目，其中 2 个项目名与宿主库主项目重名，用于覆盖重命名路径。
- 样本生成固定种子：`20260425`；全部使用合成 CJK + ASCII 占位文本，禁止使用真实用户或临床数据。
- 浏览器严测环境固定为 `Chromium 120+`、`CPU slowdown = 6x`、`Network = Fast 4G`。
- 测量协议固定为：每场景 `1 次 warm-up + 5 次 measured`；`cold` 与 `warm` 结果分文件记录，不允许混算。
- 第一批严格排除 AI review 与 screenshot：基线运行时必须 stub `review_forms()`，并 stub `DocxScreenshotService.start()`；不得调用 screenshot 相关端点。
- 数据库导出接口不纳入第一批 gating；若顺带采样，仅能写入单独 `reference` 文件，不能影响 acceptance。
- 前端第一批只允许保守 quick wins：移除全量图标注册、非激活 tab 与对话框 lazy mount、设计器辅助数据延迟加载、局部性能埋点；禁止大规模拆分 `FormDesignerTab.vue`（净迁移代码 > 200 行）、禁止修改 `useApi.js` 公共 API、禁止改变 HTML 预览语义。
- 后端第一批通过 `CRF_PERF_BASELINE=1` 打开观测；默认关闭；观测只写结构化日志/JSONL，不得污染业务响应。
- 第一批不新增 runtime/development 依赖；只允许 Python/Node 标准库、SQLAlchemy events、浏览器原生 Performance API、Vite 现有构建输出。
- 索引/查询候选进入计划的证据门槛固定为：满足以下任一条件才可进入候选池：
  - `median(sql_total_ms) / median(request_total_ms) >= 0.25`
  - 单次请求 `sql_count > 100`
  - `EXPLAIN QUERY PLAN` 在 `>= 500` 行表上出现全表扫描
  - `p95(flush_ms | commit_ms | sqlite_busy_wait_ms) >= 200ms`
- 第一批允许的 migration 仅限 `CREATE INDEX IF NOT EXISTS`；回滚说明只能使用配对的 `DROP INDEX IF EXISTS`；禁止删列、改列、重建表与数据重写。

**PBT Properties**:
- 基线生成确定性：同一 seed 与同一 schema version 必须生成语义等价 fixture。
- 冷热缓存分离：`cold` 与 `warm` 数据不得混写到同一统计样本。
- 观测旁路性：打开/关闭观测后，HTTP status、响应 JSON、FileResponse 行为与事务结果必须等价。
- 排序不变量：所有 reorder 路径仍保持 `1-based`、`稠密`、`唯一`、`稳定`。
- 列宽契约：`backend/src/services/width_planning.py` 与 `frontend/src/composables/useCRFRenderer.js` 的归一化结果继续语义一致。
- 脱敏不变量：性能日志与基线产物不得出现 token、字段值、docx 正文、AI payload、本地敏感绝对路径。

**Technical Decisions**:
- 新增 `backend/src/perf.py` 承载 request-scoped metrics、phase span、SQL 聚合与脱敏事件输出。
- 新增 `frontend/src/composables/usePerfBaseline.js` 承载浏览器端性能事件缓存与导出。
- 新增 `frontend/src/composables/useLazyTabs.js` 承载项目工作台 tab 的激活状态机。
- 使用 `backend/scripts/generate_perf_fixture.py` 生成重压样本。
- 使用 `backend/scripts/run_perf_baseline.py` 通过 `TestClient` 采集后端 JSONL 基线。
- 前端浏览器交互基线不引入新依赖；通过 `?perf=1` 打开前端性能模式，并通过 `window.__CRF_PERF_EXPORT__()` 导出采样结果。

**Implementation Tasks**:
- Phase 1: 生成重压 fixture 与基线目录结构。
- Phase 2: 落地后端观测骨架、SQL 聚合与主链路阶段计时。
- Phase 3: 落地前端 quick wins、tab/dialog lazy mount 与设计器热点埋点。
- Phase 4: 采集前端 build/browser 基线与后端 route 基线。
- Phase 5: 基于证据门槛生成候选优化列表，并运行契约/回归测试。

---

## 1. 架构决策

### D1 — 基线与证据产物采用“双通道”结构

**决策**：
- 运行时代码只负责产生结构化事件，不直接硬编码写入 `openspec/`。
- 基线 harness 负责把结构化事件落盘到 change 目录下的 `baselines/`。
- 前端 build 指标、前端浏览器交互指标、后端 route 基线、候选证据摘要分别分文件存储。

**产物路径固定为**：

| 文件 | 用途 |
|------|------|
| `openspec/changes/research-performance-constraints/baselines/frontend-build-heavy-1600.json` | Vite 构建产物体积与 chunk 指标 |
| `openspec/changes/research-performance-constraints/baselines/frontend-cold-heavy-1600.jsonl` | Chromium 严测下的前端冷启动/首交互基线 |
| `openspec/changes/research-performance-constraints/baselines/frontend-warm-heavy-1600.jsonl` | Chromium 严测下的前端暖缓存交互基线 |
| `openspec/changes/research-performance-constraints/baselines/backend-cold-heavy-1600.jsonl` | 后端主链路冷基线 |
| `openspec/changes/research-performance-constraints/baselines/backend-warm-heavy-1600.jsonl` | 后端主链路暖基线 |
| `openspec/changes/research-performance-constraints/baselines/evidence-summary.json` | 候选优化门槛判定结果 |
| `openspec/changes/research-performance-constraints/baselines/reference-database-export.jsonl` | 非 gating 的数据库导出 reference（可空） |

**结果**：
- 运行时代码保持低侵入。
- `openspec/` 下的产物结构稳定、可比对、可归档。
- 第一批 acceptance 直接依赖 `baselines/` 文件是否齐全与结构是否合格，而不是依赖固定 SLA。

---

### D2 — 前端采用“局部 lazy + 局部埋点”，不做大拆分

**决策**：
- `frontend/src/main.js` 移除 `@element-plus/icons-vue` 的全量注册循环。
- `frontend/src/App.vue` 引入 async component，只 lazy 以下组件：
  - `CodelistsTab`
  - `UnitsTab`
  - `FieldsTab`
  - `FormDesignerTab`
  - `VisitsTab`
  - `TemplatePreviewDialog`
  - `DocxCompareDialog`
- 以下组件保持 eager：
  - `LoginView`
  - `AdminView`
  - `ProjectInfoTab`
- `App.vue` 使用 `useLazyTabs.js` 维护 `activatedProjectTabs`：默认仅 `info=true`，其他为 `false`；只有当前激活或已激活的 tab 才允许 mount。
- `selectedProject` 切换时重置 `activatedProjectTabs` 为初始状态，避免跨项目遗留 mounted 状态。
- `FormDesignerTab.vue` 的第一批优化只做：
  - 首次 mount 时仅拉取 `forms`
  - 将 `fieldDefs/codelists/units` 延迟到首次打开设计器全屏弹窗时加载
  - 在 `?perf=1` 模式下记录 mount、tab 激活、预览更新、字段编辑、inline 切换与拖拽排序的性能事件
- 第一批禁止将 `FormDesignerTab.vue` 拆成多个大组件；若新增 helper，净迁移代码必须 `<= 200` 行。

**理由**：
- 当前 `App.vue` 在初始加载时直接同步 import 多个重组件，且 `el-tab-pane` 内容默认立即参与渲染，造成无谓的首屏与主工作台成本。
- 当前 `FormDesignerTab.vue` 在 mount 时并行拉取 `forms/fieldDefs/codelists/units`，对非设计器路径存在额外开销。
- 通过 lazy + 激活状态机 + 设计器辅助数据延迟加载，能够以最小侵入获得可量化收益。

---

### D3 — 后端采用“统一 middleware + SQLAlchemy events + 显式 phase spans”

**决策**：
- 新增 `backend/src/perf.py`，提供：
  - `is_perf_baseline_enabled()`
  - request-scoped `contextvars`
  - `perf_span(name)`
  - `record_counter(name, value)`
  - `emit_request_summary(...)`
  - SQL statement shape 脱敏归一化函数
- `backend/main.py` 新增一个只负责 `try/finally` 记录的性能 middleware：
  - 记录 `request_total_ms`
  - 记录 `route_template`
  - 不改写异常、不包裹响应体、不读取 `FileResponse` 内容
- `backend/src/database.py` 在 engine 上注册 SQLAlchemy listeners：
  - `before_cursor_execute`
  - `after_cursor_execute`
  - 必须聚合到当前 request context
  - 只记录 SQL shape/hash，不记录参数
- 主链路通过显式 `perf_span()` 落地阶段计时；阶段明细在 `specs/03-backend-observability-and-baseline.md` 中锁定。

**结果**：
- 同一套观测骨架覆盖 request、SQL 与业务阶段。
- 观测默认关闭，开启后也不改变业务 contract。
- 未来即使第一批不产生任何优化候选，也能留下稳定的基线设施。

---

### D4 — AI review 与 screenshot 采用 harness stub，而不是改生产逻辑

**决策**：
- 不为 AI review 与 screenshot 引入新的运行时开关。
- `backend/scripts/run_perf_baseline.py` 与相关测试在基线采集时：
  - monkeypatch `src.routers.import_docx.review_forms` 为固定返回 `({}, None)` 的 async stub
  - monkeypatch `src.services.docx_screenshot_service.DocxScreenshotService.start` 为 no-op stub
- screenshot 相关端点：
  - `/api/projects/{project_id}/import-docx/{temp_id}/screenshots/start`
  - `/api/projects/{project_id}/import-docx/{temp_id}/screenshots/status`
  - `/api/projects/{project_id}/import-docx/{temp_id}/screenshots/pages/{page}`
  第一批完全不进入 baseline harness。

**理由**：
- 当前 `preview` 路由会真实调用 `review_forms()` 并触发 `DocxScreenshotService.start()`；若不 stub，就无法满足“严格排除”约束。
- 使用 harness stub 可以确保生产路径零额外分支，不污染业务逻辑。

---

### D5 — 候选优化池与 acceptance gate 分离

**决策**：
- 第一批 acceptance gate 只看：
  1. 基线是否可重复生成
  2. 结构化事件是否完整
  3. 脱敏是否成立
  4. 契约与回归测试是否通过
- 候选优化池只看证据门槛；即使没有任何候选越过门槛，第一批依然可以完成。
- `evidence-summary.json` 必须显式给出：
  - 每个 route/scenario 的摘要指标
  - 是否触发门槛
  - 若触发，进入的候选类型（索引 / 查询形状 / flush 合并 / 生命周期调整 / 前端 quick win）
  - 若未触发，必须写明 `reason: below-threshold`

**结果**：
- 计划阶段不会把“可能有价值”的猜测误包装成第一批承诺。
- `/ccg:spec-impl` 只需机械地落地观测、采样、汇总与判定流程。

---

## 2. 关键文件矩阵

| 文件 | 类型 | 角色 |
|------|------|------|
| `backend/src/perf.py` | 新增 | 后端观测核心模块 |
| `backend/main.py` | 修改 | 请求级性能 middleware |
| `backend/src/database.py` | 修改 | SQLAlchemy listeners 接入 |
| `backend/src/routers/import_docx.py` | 修改 | preview / execute 阶段 span |
| `backend/src/routers/export.py` | 修改 | word export 阶段 span |
| `backend/src/routers/projects.py` | 修改 | project copy / db import / merge / project reorder span |
| `backend/src/routers/visits.py` | 修改 | visits reorder / visit forms reorder span |
| `backend/src/routers/forms.py` | 修改 | forms reorder span |
| `backend/src/routers/fields.py` | 修改 | field-definitions reorder / form fields reorder span |
| `backend/src/routers/codelists.py` | 修改 | codelists reorder / options reorder span |
| `backend/src/routers/units.py` | 修改 | units reorder span |
| `backend/src/services/project_clone_service.py` | 修改 | clone 子阶段 span |
| `backend/src/services/project_import_service.py` | 修改 | import/merge 子阶段 span |
| `backend/src/services/docx_import_service.py` | 修改 | docx parse / execute 辅助 span |
| `backend/src/services/export_service.py` | 修改 | export build/save/validate 子阶段 span |
| `backend/src/services/order_service.py` | 修改 | safe offset / final update / flush span |
| `backend/scripts/generate_perf_fixture.py` | 新增 | 重压样本生成 |
| `backend/scripts/run_perf_baseline.py` | 新增 | 后端 JSONL 基线采集 |
| `backend/tests/test_perf_baseline.py` | 新增 | 后端观测/脱敏/PBT 测试 |
| `frontend/src/main.js` | 修改 | 移除全量图标注册 |
| `frontend/src/App.vue` | 修改 | async components + lazy tab state + perf hook |
| `frontend/src/components/FormDesignerTab.vue` | 修改 | 延迟加载辅助数据 + 设计器热点 perf hook |
| `frontend/src/composables/useLazyTabs.js` | 新增 | tab 激活状态机 |
| `frontend/src/composables/usePerfBaseline.js` | 新增 | 前端 perf 事件缓存与导出 |
| `frontend/tests/perfBaselineHelpers.test.js` | 新增 | 前端 perf helper 测试 |
| `frontend/tests/appTabLazyLoad.test.js` | 新增 | lazy tab 行为测试 |

---

## 3. 依赖与实施顺序

```text
Phase 1  fixture/protocol
  ├─ generate_perf_fixture.py
  └─ baselines/ output contract

Phase 2  backend observability
  ├─ backend/src/perf.py
  ├─ main.py middleware
  ├─ database.py SQL listeners
  └─ route/service spans

Phase 3  frontend quick wins
  ├─ main.js icon import tightening
  ├─ useLazyTabs.js
  ├─ App.vue async tabs/dialogs
  ├─ usePerfBaseline.js
  └─ FormDesignerTab deferred auxiliary loading

Phase 4  evidence capture
  ├─ frontend build metrics
  ├─ frontend browser perf JSONL
  ├─ backend route perf JSONL
  └─ evidence-summary.json

Phase 5  contract verification
  ├─ width/reorder/import/export regression tests
  ├─ perf redaction tests
  └─ candidate threshold checks
```

**关键依赖**：
- Phase 2 完成前，不得运行后端 JSONL 基线采集。
- Phase 3 完成前，不得运行前端浏览器交互 JSONL 采集。
- Phase 4 完成后才能判定是否存在“证据驱动候选优化”。
- Phase 5 必须在所有采样完成后执行，用于证明“观测与 quick wins 没有破坏契约”。

---

## 4. 非目标与禁止项

以下内容明确不进入第一批：
- 切换 SQLite 以外数据库
- 引入任务队列或后台 job system
- 重写导入导出系统
- 调整 `useApi.js` 的公共 API 形状
- 大规模拆分 `FormDesignerTab.vue`
- 修改 `useCRFRenderer.js` / `width_planning.py` 的列宽语义
- 把 screenshot 或 AI review 重新纳入第一批 success gate
- 为性能观测新增必须由业务客户端解析的响应字段
- 新增任何 runtime / dev dependency

---

## 5. 风险与缓解

| 风险 | 等级 | 缓解 |
|------|------|------|
| 观测代码改变响应或异常语义 | 高 | middleware 仅 `try/finally` 记录；不得改写异常/响应体 |
| SQL listeners 出现并发串扰 | 高 | 使用 `contextvars` 绑定 request-scoped 聚合 |
| 前端 lazy 破坏 tab 行为 | 中 | 使用 `useLazyTabs.js` 显式维护激活状态，并补单元测试 |
| 设计器延迟加载破坏字段编辑流 | 中 | 只延迟 `fieldDefs/codelists/units`，不延迟 `forms` 与 `formFields` |
| 产物泄露敏感信息 | 高 | allowlist 输出 + sentinel secret 扫描测试 |
| 没有任何候选越过证据门槛 | 低 | 这仍视为第一批成功，输出空候选列表即可 |

---

## 6. 验收定义

第一批设计完成的验收条件固定为：
1. `design.md`、`specs/*.md`、`tasks.md` 全部存在。
2. 所有歧义已转化为显式约束，不再出现 `TBD`、`视实现而定`、`后续决定`。
3. PBT 不变量已写入 specs，且与现有跨栈契约一致。
4. `tasks.md` 中每个任务都能直接映射到明确文件与动作。
5. 第一批 acceptance gate 与候选优化门槛已完全分离。
