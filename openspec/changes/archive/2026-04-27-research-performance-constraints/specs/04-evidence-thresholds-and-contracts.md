# Spec 04 — 证据门槛、候选优化与契约验证

## 目标

将“证据驱动候选”转化为机器可判定规则：只有满足固定门槛的性能热点才可进入候选优化池；所有性能改动必须通过 API、排序、导入导出、列宽、权限与脱敏契约验证。

---

## 1. Candidate evidence summary

### 1.1 输出文件

候选判定结果固定写入：

```text
openspec/changes/research-performance-constraints/baselines/evidence-summary.json
```

### 1.2 schema

```json
{
  "fixture_id": "heavy-1600-seed-20260425",
  "fixture_schema_version": 1,
  "generated_at_utc": "ISO-8601 string",
  "routes": [
    {
      "scenario": "docx_preview",
      "route_template": "/api/projects/{project_id}/import-docx/preview",
      "mode": "cold|warm",
      "median_request_total_ms": 0.0,
      "p95_request_total_ms": 0.0,
      "median_sql_total_ms": 0.0,
      "max_sql_count": 0,
      "p95_flush_ms": 0.0,
      "p95_commit_ms": 0.0,
      "p95_sqlite_busy_wait_ms": 0.0,
      "explain_findings": [],
      "thresholds_triggered": [],
      "candidate_types": [],
      "reason": "accepted|below-threshold|out-of-scope"
    }
  ],
  "frontend": [
    {
      "scenario": "tab_designer_first_activate",
      "mode": "cold|warm",
      "median_interaction_duration_ms": 0.0,
      "p95_interaction_duration_ms": 0.0,
      "network_count": 0,
      "chunk_load_count": 0,
      "candidate_types": [],
      "reason": "accepted|below-threshold"
    }
  ]
}
```

---

## 2. 后端候选门槛

### 2.1 SQL / migration 候选

索引或查询形状优化候选只有满足以下任一条件时才可进入候选池：

| 门槛 ID | 条件 |
|---------|------|
| SQL-1 | `median(sql_total_ms) / median(request_total_ms) >= 0.25` |
| SQL-2 | 任一 measured request 的 `sql_count > 100` |
| SQL-3 | `EXPLAIN QUERY PLAN` 在 heavy-1600 中 `>= 500` 行表上出现 full table scan |
| SQL-4 | `p95(sqlite_busy_wait_ms) >= 200ms` |

若未满足任一 SQL 门槛，`candidate_types` 不得包含：
- `index`
- `query-shape`
- `migration`

### 2.2 Flush / transaction 候选

flush 合并或事务生命周期调整候选只有满足以下任一条件时才可进入候选池：

| 门槛 ID | 条件 |
|---------|------|
| TX-1 | `p95(flush_ms) >= 200ms` |
| TX-2 | `p95(commit_ms) >= 200ms` |
| TX-3 | `p95(sqlite_busy_wait_ms) >= 200ms` |
| TX-4 | `flush_count > 10` 且 `median(flush_ms) / median(request_total_ms) >= 0.15` |

### 2.3 CPU / IO 候选

docx parse/generate 或文件 IO 候选只有满足以下任一条件时才可进入候选池：

| 门槛 ID | 条件 |
|---------|------|
| CPU-1 | `median(docx_parse_ms) / median(request_total_ms) >= 0.30` |
| CPU-2 | `median(docx_generate_ms) / median(request_total_ms) >= 0.30` |
| IO-1 | `median(temp_file_write_ms) / median(request_total_ms) >= 0.20` |
| IO-2 | `median(file_response_prepare_ms) / median(request_total_ms) >= 0.20` |

---

## 3. 允许的候选优化类型

第一批 evidence summary 只能输出以下候选类型：

| 类型 | 允许进入条件 | 禁止项 |
|------|--------------|--------|
| `index` | SQL 门槛触发，且有 EXPLAIN 证据 | 无证据新增索引 |
| `query-shape` | SQL 门槛触发，且查询数量或形状证据明确 | 改 API schema |
| `flush-batching` | TX 门槛触发 | 破坏 FK id 依赖、改变错误暴露语义 |
| `transaction-lifetime` | TX 门槛触发 | 改 commit/rollback 边界导致部分提交 |
| `docx-cpu` | CPU 门槛触发 | 跳过解析校验或导出校验 |
| `file-io` | IO 门槛触发 | 跳过上传安全校验或输出校验 |
| `frontend-bundle` | build metrics 指向入口/vendor 过大 | 调高 Vite warning 阈值掩盖问题 |
| `frontend-lazy` | 非激活 tab 仍 mount/request/chunk load | 改变 tab 功能或路由结构 |
| `frontend-render` | 设计器交互 P95 明显集中在 preview_update | 改变 HTML/列宽语义 |

---

## 4. 允许的 migration 边界

第一批只允许：
- `CREATE INDEX IF NOT EXISTS index_name ON table_name (...)`

每个 index candidate 必须同时提供：
- 目标 route / scenario
- 目标 SQL shape hash
- before/after EXPLAIN
- before/after sql_count 或 sql_total_ms
- 写入成本风险说明
- 回滚说明：`DROP INDEX IF EXISTS index_name`

明确禁止：
- 删除列
- 重命名列
- 改列类型
- 重建表
- 批量数据重写
- 引入外部连接池
- 调整 `journal_mode=WAL` / `busy_timeout=5000` / `synchronous=NORMAL` 为其他默认值

---

## 5. 必跑契约测试

### 5.1 后端

每次性能实现完成后必须运行：

```bash
cd backend && python -m pytest tests/test_width_planning.py tests/test_order_service.py tests/test_phase0_ordering_contracts.py tests/test_project_import.py tests/test_project_copy.py tests/test_export_service.py tests/test_export_validation.py tests/test_permission_guards.py tests/test_isolation.py tests/test_subresource_isolation.py tests/test_rate_limit.py -q
```

### 5.2 前端

每次性能实现完成后必须运行：

```bash
cd frontend && node --test tests/columnWidthPlanning.test.js tests/columnWidthPlanning.pbt.test.js tests/appSettingsShell.test.js tests/quickEditBehavior.test.js tests/formDesignerPropertyEditor.runtime.test.js tests/exportDownloadState.test.js
```

### 5.3 构建与 lint

```bash
cd frontend && npm run build
cd frontend && npm run lint
```

若 lint 因存量问题失败，必须记录失败文件与原因；不得用禁用规则或调高 warning 阈值绕过。

---

## 6. API contract 不变量

| 路径 | 不变量 |
|------|--------|
| `/api/projects/{project_id}/import-docx/preview` | 成功响应保留 `forms/temp_id/ai_error`；无效文件仍为 400；AI stub 不删除 `ai_error` 字段 |
| `/api/projects/{project_id}/import-docx/execute` | 成功响应保留 `imported_form_count/detail`；无效 temp_id 仍保持既有错误语义 |
| `/api/projects/{project_id}/export/word` | media type、FileResponse 行为、失败错误语义不变 |
| `/api/projects/{project_id}/copy` | owner 校验、logo rollback cleanup、201 响应结构不变 |
| `/api/projects/import/project-db` | schema incompatible 错误 code 与稳定 JSON 不变 |
| `/api/projects/import/database-merge` | `imported/renamed` 响应结构不变 |
| reorder endpoints | 成功响应与 status 保持现状，不改变 204/JSON 差异 |

---

## 7. 排序与列宽 PBT 属性

| 属性 | 不变量 | 反例生成策略 |
|------|--------|--------------|
| reorder density | 每个 scope 内排序结果必须 1-based、稠密、唯一 | 随机生成 move/delete/insert/reorder 序列，与纯内存模型比较 |
| reorder rejection | 重复 ID、不完整 ID、跨 scope ID、越权 ID 必须拒绝且状态不变 | 随机插入非法 ID 集合 |
| width parity | 前后端列宽 planner 对同一 fixture 的归一化结果保持 epsilon 内一致 | 同时运行 JS/Python planner fixture |
| preview/export parity | 前端 HTML 预览与后端 Word 导出语义不分叉 | 生成混合字段类型，比较语义树 |
| legacy import compatibility | 旧库 rowid / sort_order / form_field 引用兼容不退化 | 构造旧库 fixture，导入后 foreign_key_check/integrity_check |
| security boundary | 性能缓存或观测不得跨用户、跨项目泄露 | 两用户交叉访问所有 gating routes |

---

## 8. 脱敏校验

新增测试必须注入以下 sentinel：

```text
PERF_SECRET_TOKEN_20260425
PERF_SECRET_FIELD_LABEL_20260425
PERF_SECRET_DOCX_BODY_20260425
PERF_SECRET_AI_PAYLOAD_20260425
/home/perf-secret/path/20260425
C:\\perf-secret\\path\\20260425
```

运行所有 gating scenarios 后，扫描：
- baseline JSON / JSONL
- captured log records
- slow SQL shapes
- evidence-summary.json

任意命中即失败。

---

## 9. 验证条件

| ID | 条件 |
|----|------|
| SC-4.1 | `evidence-summary.json` 按固定 schema 输出 |
| SC-4.2 | 未满足门槛的 route 写 `reason=below-threshold`，不得输出候选类型 |
| SC-4.3 | index candidate 只允许 `CREATE INDEX IF NOT EXISTS` |
| SC-4.4 | 必跑后端契约测试通过 |
| SC-4.5 | 必跑前端契约测试通过 |
| SC-4.6 | 脱敏 sentinel 扫描通过 |
| SC-4.7 | 若没有任何候选越过门槛，第一批仍可通过 acceptance |
