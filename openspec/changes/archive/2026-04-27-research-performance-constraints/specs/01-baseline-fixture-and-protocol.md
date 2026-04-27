# Spec 01 — 重压基线样本与测量协议

## 目标

为第一批性能工作定义唯一、可重复、可比对的重压样本与测量协议，避免后续实现阶段出现“样本规模”“测量次数”“冷热缓存”“落盘格式”等决策点。

---

## 1. 固定样本规模

### 1.1 Heavy-1600 fixture

基线样本 ID 固定为：`heavy-1600-seed-20260425`。

| 维度 | 固定值 |
|------|--------|
| owner | 1 个普通用户 |
| 主项目 | 1 个 |
| visits | 10 个 |
| forms | 40 个 |
| fields | 每 form 40 个，总计 1600 个 |
| codelists | 20 个 |
| options | 每 codelist 20 个，总计 400 个 |
| units | 30 个 |
| DOCX fixture | 40 张表，每张表映射 1 个 form |
| merge fixture | 5 个项目，其中 2 个项目名与宿主库主项目重名 |

### 1.2 字段分布

每个 form 的 40 个字段按以下确定性循环生成：

| 字段类型 | 每 form 数量 | 约束 |
|----------|--------------|------|
| 文本 | 8 | 含 ASCII、CJK、长 label 三类 |
| 数值 | 5 | 覆盖 `integer_digits` / `decimal_digits` |
| 日期 | 4 | 固定 `yyyy-MM-dd` |
| 日期时间 | 3 | 固定 `yyyy-MM-dd HH:mm` |
| 时间 | 2 | 固定 `HH:mm` |
| 单选 | 4 | 绑定 codelist |
| 多选 | 4 | 绑定 codelist |
| 单选（纵向） | 3 | 绑定 codelist |
| 多选（纵向） | 3 | 绑定 codelist |
| 标签 | 2 | 长文本结构字段 |
| 日志行 | 2 | `is_log_row` 语义保持 |

> 合计 40 个字段；若实现脚本采用循环生成，字段类型顺序必须稳定。

### 1.3 数据隐私边界

样本生成必须满足：
- 固定随机种子：`20260425`
- 只使用合成文本：`PERF_` 前缀、合成中文占位词、ASCII 占位词
- 禁止使用真实患者、真实研究、真实医院、真实用户、真实路径或真实临床字段
- 所有临时 SQLite / DOCX 文件运行后清理
- 基线产物不得包含字段正文、完整文件名或完整绝对路径

---

## 2. 测量协议

### 2.1 运行次数

每个 scenario 必须按以下顺序执行：
1. `1` 次 warm-up，不写入 measured 统计
2. `5` 次 measured run，写入 JSONL

### 2.2 冷热缓存定义

| 模式 | 定义 | 输出文件 |
|------|------|----------|
| cold | 新临时数据库、新登录会话、前端 reload、`api.clearAllCache()` 后执行 | `*-cold-heavy-1600.jsonl` |
| warm | 同一登录会话、同一已加载项目、同一 fixture，重复执行相同步骤 | `*-warm-heavy-1600.jsonl` |

禁止将 cold 与 warm 合并为单一平均值。

### 2.3 浏览器严测环境

前端浏览器基线固定为：
- 浏览器：`Chromium 120+`
- CPU：`6x slowdown`
- 网络：`Fast 4G`
- 每个交互场景：`1 warm-up + 5 measured`
- 记录 `performance.now()` 时间戳与 `PerformanceObserver` 可用事件

第一批不得新增浏览器自动化依赖；若实现脚本调用本机 Chromium，必须只使用 Node 标准库启动进程与读取输出。

### 2.4 后端 harness

后端基线固定通过 `backend/scripts/run_perf_baseline.py` 执行：
- 使用 `TestClient` 或等价同进程请求方式
- 运行时设置 `CRF_PERF_BASELINE=1`
- 使用临时 SQLite 文件数据库，不使用内存数据库作为 performance baseline
- 每次 measured run 前允许调用 `src.rate_limit.limiter.reset()` 重置测试态限流
- production 限流策略不得新增绕过开关，不得降低阈值或关闭安全策略

---

## 3. Gating 场景清单

### 3.1 后端 gating API

第一批后端基线必须覆盖以下 route templates：

| Scenario | Method | Route template |
|----------|--------|----------------|
| docx_preview | POST | `/api/projects/{project_id}/import-docx/preview` |
| docx_execute | POST | `/api/projects/{project_id}/import-docx/execute` |
| word_export | POST | `/api/projects/{project_id}/export/word` |
| project_copy | POST | `/api/projects/{project_id}/copy` |
| project_db_import | POST | `/api/projects/import/project-db` |
| database_merge | POST | `/api/projects/import/database-merge` |
| projects_reorder | POST | `/api/projects/reorder` |
| visits_reorder | POST | `/api/projects/{project_id}/visits/reorder` |
| forms_reorder | POST | `/api/projects/{project_id}/forms/reorder` |
| field_definitions_reorder | POST | `/api/projects/{project_id}/field-definitions/reorder` |
| form_fields_reorder | POST | `/api/forms/{form_id}/fields/reorder` |
| visit_forms_reorder | POST | `/api/visits/{visit_id}/forms/reorder` |
| codelists_reorder | POST | `/api/projects/{project_id}/codelists/reorder` |
| codelist_options_reorder | POST | `/api/projects/{project_id}/codelists/{cl_id}/options/reorder` |
| units_reorder | POST | `/api/projects/{project_id}/units/reorder` |

### 3.2 前端 gating interactions

第一批前端浏览器基线必须覆盖：

| Scenario | Step |
|----------|------|
| app_project_load | 登录普通用户 → 选择 heavy-1600 主项目 → 只进入 info tab |
| tab_designer_first_activate | 从 info tab 切换到 表单 tab，首次加载 `FormDesignerTab` |
| designer_select_form | 选择第 1 个含 40 fields 的 form |
| designer_switch_form | 切换到另一个含 40 fields 的 form |
| designer_open_fullscreen | 点击“设计表单”首次打开全屏设计器 |
| designer_edit_label | 编辑 1 个字段 label |
| designer_toggle_inline | 切换 1 个字段 inline_mark |
| designer_reorder_field | 拖拽 1 个字段重排 |
| tab_visits_first_activate | 首次进入 visits tab |
| tab_fields_first_activate | 首次进入 fields tab |
| tab_codelists_first_activate | 首次进入 codelists tab |
| tab_units_first_activate | 首次进入 units tab |

---

## 4. 非 gating 清单

以下接口和行为第一批严格排除：

| 项 | 处理方式 |
|----|----------|
| AI review 网络调用 | harness 中 stub `review_forms()`，返回 `({}, None)` |
| screenshot start/status/pages | 不调用相关端点，stub `DocxScreenshotService.start()` 为 no-op |
| `/api/projects/{project_id}/import-docx/{temp_id}/screenshots/start` | out-of-scope |
| `/api/projects/{project_id}/import-docx/{temp_id}/screenshots/status` | out-of-scope |
| `/api/projects/{project_id}/import-docx/{temp_id}/screenshots/pages/{page}` | out-of-scope |
| `/api/export/database` | 仅可写 reference，不参与 gating |
| `/api/projects/export/database` | 仅可写 reference，不参与 gating |
| `/api/projects/{project_id}/export/database` | 仅可写 reference，不参与 gating |

---

## 5. 基线产物 schema

### 5.1 JSONL record 必填字段

每行 JSONL 必须包含：

```json
{
  "run_id": "string",
  "timestamp_utc": "ISO-8601 string",
  "git_sha": "string",
  "fixture_id": "heavy-1600-seed-20260425",
  "fixture_schema_version": 1,
  "mode": "cold|warm",
  "scenario": "string",
  "iteration": 1,
  "is_warmup": false,
  "status": "ok|expected_error|failed",
  "duration_ms": 0.0,
  "metrics": {},
  "fixture_counts": {}
}
```

### 5.2 后端 metrics 必填键

```json
{
  "method": "POST",
  "route_template": "/api/...",
  "status_code": 200,
  "request_total_ms": 0.0,
  "phase_timings_ms": {},
  "sql_count": 0,
  "sql_total_ms": 0.0,
  "sql_max_ms": 0.0,
  "slow_sql_count": 0,
  "sqlite_busy_count": 0,
  "payload_size_bytes": 0
}
```

### 5.3 前端 metrics 必填键

```json
{
  "browser": "Chromium 120+",
  "cpu_slowdown": 6,
  "network_profile": "Fast 4G",
  "interaction_duration_ms": 0.0,
  "network_count": 0,
  "component_mount_count": 0,
  "chunk_load_count": 0,
  "preview_update_ms": 0.0
}
```

---

## 6. PBT 属性

| 属性 | 不变量 | 反例生成策略 |
|------|--------|--------------|
| fixture determinism | 同一 seed、同一 schema version 生成的项目图、DOCX 表数、merge fixture 项目数语义等价 | 重复生成两次，比较 counts、名称模式、排序、引用关系 |
| cold/warm separation | cold 与 warm 不得写入同一输出文件，不得合并统计 | 故意把 warm record 写入 cold 文件，validator 必须失败 |
| baseline completeness | gating API 与 gating interactions 集合必须完整覆盖 | 删除任一 scenario，validator 必须失败 |
| non-gating exclusion | AI review、screenshot、database export 不得影响 acceptance | 让 stub 外部依赖变慢或失败，gating acceptance 不应失败 |
| unit consistency | 所有耗时单位必须为 ms 且非负 | 注入秒单位或负数耗时，validator 必须失败 |
| privacy | 产物不得包含 sentinel secret、token、字段正文、完整绝对路径 | 在 fixture 文本与 token 中注入 sentinel，扫描 baselines |

---

## 7. 验证条件

| ID | 条件 |
|----|------|
| SC-1.1 | `backend/scripts/generate_perf_fixture.py` 能生成 heavy-1600 fixture |
| SC-1.2 | 同一 seed 重复生成的 fixture counts 完全一致 |
| SC-1.3 | 后端 cold/warm JSONL 均包含 15 个后端 gating scenarios × 5 measured records |
| SC-1.4 | 前端 cold/warm JSONL 均包含 12 个前端 gating interactions × 5 measured records |
| SC-1.5 | 所有 JSONL record 通过 schema validator |
| SC-1.6 | 基线产物敏感信息扫描通过 |
