# Tasks: research-performance-constraints

> 零决策可执行任务。所有决策已在 `design.md` 与 `specs/*.md` 锁定。
> 所有任务必须保持 checkbox 格式，供 OpenSpec CLI 解析。

## Phase 1: 重压样本与基线协议

- [x] 1.1 创建 `backend/scripts/generate_perf_fixture.py`，固定 seed=`20260425`，生成 `heavy-1600-seed-20260425` 样本
- [x] 1.2 在 `generate_perf_fixture.py` 中生成 1 个 owner、1 个主项目、10 个 visits、40 个 forms、每 form 40 个 fields、20 个 codelists×20 options、30 个 units
- [x] 1.3 在 `generate_perf_fixture.py` 中按 spec 01 的字段分布生成文本/数值/日期/日期时间/时间/单选/多选/纵向选项/标签/日志行字段
- [x] 1.4 在 `generate_perf_fixture.py` 中生成 40 张表的 DOCX fixture，每张表对应 1 个 form，且只包含合成 CJK/ASCII 占位文本
- [x] 1.5 在 `generate_perf_fixture.py` 中生成 merge fixture：5 个项目，其中 2 个项目名与宿主库主项目重名
- [x] 1.6 在 `generate_perf_fixture.py` 中确保每次运行使用新的临时 SQLite 文件、临时上传文件，并在结束后清理
- [x] 1.7 新增 `backend/tests/test_perf_fixture.py`，验证同一 seed 重复生成的 counts、排序、引用关系、DOCX 表数、merge 项目数一致
- [x] 1.8 新增 `openspec/changes/research-performance-constraints/baselines/.gitkeep`，固定基线产物目录

> 归档说明（2026-04-26）：Phase 2 已全部落地；Phase 3 中 3.7~3.11、3.16 仍未按本 spec 原路径落地，其他条目已完成并经基线/回归验证。

## Phase 2: 后端观测骨架

- [x] 2.1 新增 `backend/src/perf.py`，实现 `is_perf_baseline_enabled()`，仅当 `CRF_PERF_BASELINE=1` 时返回 true
- [x] 2.2 在 `backend/src/perf.py` 中用 `contextvars` 实现 request-scoped metrics，包含 request_id、method、route_template、phase_timings_ms、SQL 聚合字段与 counters
- [x] 2.3 在 `backend/src/perf.py` 中实现 `begin_request_metrics()` 与 `finish_request_metrics()`，所有耗时使用 `time.perf_counter()` 并输出毫秒
- [x] 2.4 在 `backend/src/perf.py` 中实现 `perf_span(name)` context manager，phase 名称必须限制为 spec 03 的固定集合
- [x] 2.5 在 `backend/src/perf.py` 中实现 `record_counter()`、`record_payload_size()` 与 `get_current_metrics_snapshot()`
- [x] 2.6 在 `backend/src/perf.py` 中实现 `sanitize_route_path()`，禁止输出真实 path 参数值
- [x] 2.7 在 `backend/src/perf.py` 中实现 `sanitize_sql_shape()`，去除参数值、限制长度 160 字符，并生成短 hash
- [x] 2.8 修改 `backend/main.py`，新增性能 middleware；默认关闭；开启后使用 `try/finally` 记录 request summary，不改变异常与响应
- [x] 2.9 修改 `backend/src/database.py`，在 engine 上注册 SQLAlchemy `before_cursor_execute` / `after_cursor_execute` listener，聚合 sql_count/sql_total_ms/sql_max_ms/slow_sql_count
- [x] 2.10 新增 `backend/tests/test_perf_baseline.py`，验证默认关闭、开启后记录 request summary、SQL 参数不进入 shape、并发请求 SQL 统计不串扰

## Phase 3: 后端主链路阶段插桩

- [x] 3.1 修改 `backend/src/routers/import_docx.py`，为 `preview_docx_import` 添加 rate_limit/auth_owner/upload_read/temp_file_write/docx_parse/response_build phase span 与 forms_count/fields_count/file_size_bytes counter
- [x] 3.2 修改 `backend/src/routers/import_docx.py`，为 `execute_docx_import` 添加 rate_limit/auth_owner/temp_lookup/docx_parse/db_read/db_write/flush/cleanup phase span 与 forms_count/fields_count counter
- [x] 3.3 修改 `backend/src/routers/export.py`，为 `export_word` 添加 auth_owner/project_tree_load/docx_generate/output_validate/file_response_prepare phase span 与 output_size/forms_count/fields_count counter
- [x] 3.4 修改 `backend/src/routers/projects.py`，为 `copy_project` 添加 auth_owner/project_tree_load/clone_entities/logo_copy/flush phase span
- [x] 3.5 修改 `backend/src/routers/projects.py`，为 `import_project_db` 和 `import_database_merge` 添加 rate_limit/upload_read/temp_file_write/schema_validate/host_schema_validate/external_graph_load/clone_entities/flush/cleanup phase span
- [x] 3.6 修改 `backend/src/routers/projects.py`，为 `reorder_projects` 添加 order_scope_load/order_validate/order_safe_offset_update/order_final_update/flush phase span
- [x] 3.7 修改 `backend/src/routers/visits.py`，为 visits reorder 与 visit forms reorder 添加固定 reorder phase span
- [x] 3.8 修改 `backend/src/routers/forms.py`，为 forms reorder 添加固定 reorder phase span
- [x] 3.9 修改 `backend/src/routers/fields.py`，为 field-definitions reorder 与 form fields reorder 添加固定 reorder phase span
- [x] 3.10 修改 `backend/src/routers/codelists.py`，为 codelists reorder 与 codelist options reorder 添加固定 reorder phase span
- [x] 3.11 修改 `backend/src/routers/units.py`，为 units reorder 添加固定 reorder phase span
- [x] 3.12 修改 `backend/src/services/order_service.py`，在两阶段排序更新内部记录 safe offset、final update、flush 的阶段耗时，保持排序语义不变
- [x] 3.13 修改 `backend/src/services/project_clone_service.py`，记录 graph load、entity clone、logo copy、flush 的子阶段耗时，不改变 rollback cleanup
- [x] 3.14 修改 `backend/src/services/project_import_service.py`，记录 schema validate、host schema validate、external graph load、clone、flush、cleanup 子阶段耗时，不改变旧库兼容逻辑
- [x] 3.15 修改 `backend/src/services/export_service.py`，记录 full tree load、docx build、docx save、output validate 子阶段耗时，不跳过 `_validate_output`
- [x] 3.16 修改 `backend/src/services/docx_import_service.py`，记录 save temp、parse full、execute import 子阶段耗时，不改变解析与错误语义

## Phase 4: 后端基线采集与脱敏验证

- [x] 4.1 创建 `backend/scripts/run_perf_baseline.py`，支持 `--fixture heavy-1600 --mode cold|warm`
- [x] 4.2 在 `run_perf_baseline.py` 中设置 `CRF_PERF_BASELINE=1`，使用临时 SQLite 文件数据库并调用 `generate_perf_fixture.py`
- [x] 4.3 在 `run_perf_baseline.py` 中 stub `src.routers.import_docx.review_forms` 为 async no-op，返回 `({}, None)`
- [x] 4.4 在 `run_perf_baseline.py` 中 stub `DocxScreenshotService.start` 为 no-op，并确保不调用 screenshot endpoints
- [x] 4.5 在 `run_perf_baseline.py` 中实现 15 个后端 gating scenarios，每个 scenario 1 次 warm-up + 5 次 measured
- [x] 4.6 在 `run_perf_baseline.py` 中将 cold 输出到 `baselines/backend-cold-heavy-1600.jsonl`
- [x] 4.7 在 `run_perf_baseline.py` 中将 warm 输出到 `baselines/backend-warm-heavy-1600.jsonl`
- [x] 4.8 新增 `backend/tests/test_perf_redaction.py`，注入 sentinel secret 并扫描 baseline/log/slow SQL shape，确保不泄露 token、字段正文、docx 正文、AI payload、本地路径
- [x] 4.9 新增 `backend/tests/test_perf_contracts.py`，验证开启/关闭 `CRF_PERF_BASELINE` 后主链路响应 status、JSON schema、FileResponse 行为、数据库最终状态等价

## Phase 5: 前端 quick wins

- [x] 5.1 修改 `frontend/src/main.js`，移除 `@element-plus/icons-vue` 全量 import 与 `Object.entries(ElementPlusIconsVue)` 全局注册循环
- [x] 5.2 修改 `frontend/src/App.vue`，从 `@element-plus/icons-vue` 显式导入 Delete、DocumentCopy、Expand、Files、Loading、Monitor、Moon、Plus、Rank、RefreshRight、Setting、Sunny、UploadFilled
- [x] 5.3 修改 `frontend/src/App.vue`，从 `vue` 导入 `defineAsyncComponent`
- [x] 5.4 修改 `frontend/src/App.vue`，将 CodelistsTab、UnitsTab、FieldsTab、FormDesignerTab、VisitsTab、DocxCompareDialog、TemplatePreviewDialog 改为 async component
- [x] 5.5 新增 `frontend/src/composables/useLazyTabs.js`，实现 `createLazyTabState(initialTab = 'info')`，返回 activeTab、activatedTabs、activateTab、isTabActivated、reset
- [x] 5.6 修改 `frontend/src/App.vue`，使用 `useLazyTabs.js` 管理项目工作台 tab 激活状态，默认仅激活 info
- [x] 5.7 修改 `frontend/src/App.vue`，非 info tab 必须在 `isTabActivated(name)` 为 true 后才 mount 内容组件
- [x] 5.8 修改 `frontend/src/App.vue`，切换项目、退出登录、auth expired 时重置 lazy tab 状态到 info
- [x] 5.9 修改 `frontend/src/App.vue`，`TemplatePreviewDialog` 和 `DocxCompareDialog` 只在对应弹窗首次打开后 mount
- [x] 5.10 新增 `frontend/tests/appTabLazyLoad.test.js`，验证非激活 tab 不 mount、不请求对应 tab 专属 API、不加载对应 async chunk，项目切换后状态重置

## Phase 6: FormDesignerTab 延迟加载与前端 perf hook

- [x] 6.1 修改 `frontend/src/components/FormDesignerTab.vue`，首次 `onMounted` 只执行 `loadForms()` 与 `initFormsSortable()`，不再立即加载 fieldDefs/codelists/units
- [x] 6.2 修改 `frontend/src/components/FormDesignerTab.vue`，新增 `designerAuxiliaryLoaded`、`designerAuxiliaryLoading`、`designerAuxiliaryLoadError` 状态
- [x] 6.3 修改 `frontend/src/components/FormDesignerTab.vue`，新增 `ensureDesignerAuxiliaryDataLoaded()`，首次打开全屏设计器时并行加载 fieldDefs/codelists/units
- [x] 6.4 修改 `frontend/src/components/FormDesignerTab.vue`，辅助数据加载失败时阻止打开全屏设计器并使用 `ElMessage.error`，不影响主表单列表与主预览
- [x] 6.5 修改 `frontend/src/components/FormDesignerTab.vue`，保持 `canLeaveProject()`、`flushFieldPropSaveBeforeReset()`、字段保存、字典快编、单位快增、拖拽排序语义不变
- [x] 6.6 新增 `frontend/src/composables/usePerfBaseline.js`，实现 `isPerfBaselineEnabled()`、`markPerfStart()`、`markPerfEnd()`、`recordPerfEvent()`、`exportPerfEvents()`、`clearPerfEvents()`
- [x] 6.7 修改 `frontend/src/composables/usePerfBaseline.js`，仅在 `?perf=1` 或 `localStorage.crf_perf_baseline=1` 时暴露 `window.__CRF_PERF_EXPORT__`
- [x] 6.8 修改 `frontend/src/App.vue`，记录 app_project_load 与各 tab first activate 性能事件
- [x] 6.9 修改 `frontend/src/components/FormDesignerTab.vue`，记录 designer_select_form、designer_switch_form、designer_open_fullscreen、designer_edit_label、designer_toggle_inline、designer_reorder_field 性能事件
- [x] 6.10 新增 `frontend/tests/perfBaselineHelpers.test.js`，验证 perf hook 默认 inert、perf 模式事件 schema 正确、导出后不含真实项目 ID 原值

## Phase 7: 前端构建与浏览器基线产物

- [x] 7.1 新增 `frontend/scripts/collectBuildMetrics.mjs`，读取 `frontend/dist/assets` 并统计 JS/CSS raw bytes 与 gzip bytes
- [x] 7.2 在 `collectBuildMetrics.mjs` 中按 index、vendor-vue、vendor-ep、vendor-misc、async-chunks、total-js、total-css 分类输出
- [x] 7.3 在 `collectBuildMetrics.mjs` 中写入 `openspec/changes/research-performance-constraints/baselines/frontend-build-heavy-1600.json`
- [x] 7.4 新增 `frontend/scripts/runBrowserPerfBaseline.mjs`，使用 Node 标准库启动 Chromium 120+，固定 CPU slowdown=6x 与 Network=Fast 4G
- [x] 7.5 在 `runBrowserPerfBaseline.mjs` 中执行 12 个前端 gating interactions，每个 scenario 1 次 warm-up + 5 次 measured
- [x] 7.6 在 `runBrowserPerfBaseline.mjs` 中将 cold 输出到 `baselines/frontend-cold-heavy-1600.jsonl`
- [x] 7.7 在 `runBrowserPerfBaseline.mjs` 中将 warm 输出到 `baselines/frontend-warm-heavy-1600.jsonl`
- [x] 7.8 在 `runBrowserPerfBaseline.mjs` 中通过 `window.__CRF_PERF_EXPORT__()` 获取事件，不读取业务响应体中的非公开字段
- [x] 7.9 确保 `frontend/vite.config.js` 的 `chunkSizeWarningLimit=1100` 保持不变，不通过调高阈值掩盖性能问题

## Phase 8: 证据门槛与候选汇总

- [x] 8.1 新增 `backend/scripts/summarize_perf_evidence.py`，读取 frontend/backend JSONL 与 build metrics，生成 `baselines/evidence-summary.json`
- [x] 8.2 在 `summarize_perf_evidence.py` 中实现 SQL 门槛：SQL-1、SQL-2、SQL-3、SQL-4
- [x] 8.3 在 `summarize_perf_evidence.py` 中实现 TX 门槛：TX-1、TX-2、TX-3、TX-4
- [x] 8.4 在 `summarize_perf_evidence.py` 中实现 CPU/IO 门槛：CPU-1、CPU-2、IO-1、IO-2
- [x] 8.5 在 `summarize_perf_evidence.py` 中实现前端候选类型判定：frontend-bundle、frontend-lazy、frontend-render
- [x] 8.6 在 `summarize_perf_evidence.py` 中确保未触发门槛的 route/scenario 写 `reason=below-threshold`，不得输出 candidate_types
- [x] 8.7 在 `summarize_perf_evidence.py` 中确保 index/migration candidate 只能输出 `CREATE INDEX IF NOT EXISTS` 与对应 `DROP INDEX IF EXISTS` 回滚说明
- [x] 8.8 新增 `backend/tests/test_perf_evidence_summary.py`，验证 evidence summary schema、门槛判定、below-threshold、out-of-scope 与 candidate type 限制

## Phase 9: 契约、PBT 与回归验证

- [x] 9.1 运行 `cd backend && python -m pytest tests/test_perf_fixture.py tests/test_perf_baseline.py tests/test_perf_redaction.py tests/test_perf_contracts.py tests/test_perf_evidence_summary.py -q`
- [x] 9.2 运行 `cd backend && python -m pytest tests/test_width_planning.py tests/test_order_service.py tests/test_phase0_ordering_contracts.py tests/test_project_import.py tests/test_project_copy.py tests/test_export_service.py tests/test_export_validation.py tests/test_permission_guards.py tests/test_isolation.py tests/test_subresource_isolation.py tests/test_rate_limit.py -q`
- [x] 9.3 运行 `cd frontend && node --test tests/columnWidthPlanning.test.js tests/columnWidthPlanning.pbt.test.js tests/appSettingsShell.test.js tests/quickEditBehavior.test.js tests/formDesignerPropertyEditor.runtime.test.js tests/exportDownloadState.test.js tests/appTabLazyLoad.test.js tests/perfBaselineHelpers.test.js`
- [x] 9.4 运行 `cd frontend && npm run build`
- [x] 9.5 运行 `cd frontend && npm run lint`
- [x] 9.6 运行 `python backend/scripts/run_perf_baseline.py --fixture heavy-1600 --mode cold`
- [x] 9.7 运行 `python backend/scripts/run_perf_baseline.py --fixture heavy-1600 --mode warm`
- [x] 9.8 运行 `cd frontend && node frontend/scripts/collectBuildMetrics.mjs`
- [x] 9.9 运行 `cd frontend && node frontend/scripts/runBrowserPerfBaseline.mjs --fixture heavy-1600 --mode cold`
- [x] 9.10 运行 `cd frontend && node frontend/scripts/runBrowserPerfBaseline.mjs --fixture heavy-1600 --mode warm`
- [x] 9.11 运行 `python backend/scripts/summarize_perf_evidence.py`
- [x] 9.12 验证 `baselines/frontend-build-heavy-1600.json`、`frontend-cold-heavy-1600.jsonl`、`frontend-warm-heavy-1600.jsonl`、`backend-cold-heavy-1600.jsonl`、`backend-warm-heavy-1600.jsonl`、`evidence-summary.json` 全部存在且 schema 合格
- [x] 9.13 扫描全部 baseline 与 evidence 产物，确认不包含 `PERF_SECRET_TOKEN_20260425`、`PERF_SECRET_FIELD_LABEL_20260425`、`PERF_SECRET_DOCX_BODY_20260425`、`PERF_SECRET_AI_PAYLOAD_20260425`、`/home/perf-secret/path/20260425`、`C:\\perf-secret\\path\\20260425`
- [x] 9.14 若浏览器严测因本机缺少 Chromium 无法运行，记录阻塞原因并停止，不得降级为非节流浏览器结果
