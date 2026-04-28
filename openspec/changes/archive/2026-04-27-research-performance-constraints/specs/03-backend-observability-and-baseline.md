# Spec 03 — 后端观测骨架与主链路基线

## 目标

在不改变 FastAPI 响应、错误语义、FileResponse 下载行为、事务边界与权限校验的前提下，为第一批后端主链路建立 request / SQL / phase 三层性能观测，并通过 heavy-1600 样本生成 cold / warm JSONL 基线。

---

## 1. 观测开关

### 1.1 环境变量

后端观测只由环境变量启用：

```bash
CRF_PERF_BASELINE=1
```

默认行为：
- 未设置或值不等于 `1`：完全关闭结构化性能记录
- 设置为 `1`：启用 request-scoped metrics、SQL 聚合、phase spans 与 baseline collector

### 1.2 禁止行为

观测层不得：
- 修改业务响应 JSON
- 修改 HTTP status
- 修改错误 `detail` / code
- 读取或消费 response body
- 读取或缓存 FileResponse 文件内容
- 写数据库
- 记录 request body、SQL 参数、token、cookie、字段正文、docx 正文、本地完整绝对路径

---

## 2. 新增 `backend/src/perf.py`

### 2.1 公共 API

新增模块必须提供以下函数 / context manager：

```python
def is_perf_baseline_enabled() -> bool: ...

def begin_request_metrics(method: str, route_template: str | None) -> str: ...

def finish_request_metrics(status_code: int, error_type: str | None = None) -> dict: ...

@contextmanager
def perf_span(name: str): ...

def record_counter(name: str, value: int | float = 1) -> None: ...

def record_payload_size(size_bytes: int | None) -> None: ...

def get_current_metrics_snapshot() -> dict: ...

def record_sql_statement(statement: str, elapsed_ms: float) -> None: ...

def sanitize_route_path(path: str) -> str: ...

def sanitize_sql_shape(statement: str) -> str: ...
```

### 2.2 contextvars

`perf.py` 必须使用 `contextvars` 保存 request-scoped metrics，防止并发请求串扰。

请求上下文必须包含：

```json
{
  "request_id": "uuid-like string",
  "method": "POST",
  "route_template": "/api/projects/{project_id}/copy",
  "started_at": 0.0,
  "phase_timings_ms": {},
  "counters": {},
  "sql_count": 0,
  "sql_total_ms": 0.0,
  "sql_max_ms": 0.0,
  "slow_sql_count": 0,
  "slow_sql_shapes": [],
  "sqlite_busy_count": 0,
  "payload_size_bytes": null
}
```

### 2.3 脱敏规则

只允许输出以下字段：

| 类别 | allowlist |
|------|-----------|
| request | method, route_template, status_code, duration_ms, error_type |
| phase | 固定 phase name + ms |
| SQL | sql_count, sql_total_ms, sql_max_ms, slow_sql_count, sql_shape_hash |
| size | file_size_bytes, payload_size_bytes, forms_count, fields_count, row_count |
| id | request_id、session-local short hash |

明确禁止：
- Authorization header
- Cookie
- request body
- SQL parameters
- 字段 label / default_value / option decode
- docx raw text
- AI prompt / payload / API key
- 上传文件完整文件名
- 任意本地绝对路径

---

## 3. FastAPI middleware

### 3.1 修改 `backend/main.py`

新增性能 middleware，必须满足：
- 位于现有安全 header middleware 之后或之前均可，但不得覆盖安全 header
- 只使用 `try/finally`
- 不捕获并转换异常
- 不读取响应 body
- 不改变 `FileResponse`

伪代码：

```python
@app.middleware("http")
async def performance_baseline_middleware(request, call_next):
    if not is_perf_baseline_enabled():
        return await call_next(request)
    begin_request_metrics(request.method, request.scope.get("route").path if available else request.url.path)
    status_code = 500
    error_type = None
    try:
        response = await call_next(request)
        status_code = response.status_code
        return response
    except Exception as exc:
        error_type = exc.__class__.__name__
        raise
    finally:
        summary = finish_request_metrics(status_code, error_type)
        logger.info("perf.request", extra={"perf": summary})
```

### 3.2 route template

`route_template` 必须优先使用 FastAPI route path：
- `/api/projects/{project_id}/copy`
- `/api/forms/{form_id}/fields/reorder`

如果无法取得 route path，必须调用 `sanitize_route_path()`，不得输出真实 path 参数值。

---

## 4. SQLAlchemy listeners

### 4.1 修改 `backend/src/database.py`

在 engine 初始化处注册：
- `before_cursor_execute`
- `after_cursor_execute`

约束：
- 只在 `CRF_PERF_BASELINE=1` 且存在 request context 时聚合
- 使用 connection context 保存开始时间
- 使用 `time.perf_counter()`
- 记录 SQL shape / hash，不记录 SQL 参数
- SQL listener 异常不得影响业务 SQL 执行

### 4.2 SQL shape

`sanitize_sql_shape()` 必须：
- 去除多余空白
- 替换数字字面量为 `?`
- 替换字符串字面量为 `?`
- 输出长度限制为 160 字符
- 同时可生成短 hash 用于 top slow SQL

---

## 5. 固定 phase schema

所有后端 JSONL record 的 `phase_timings_ms` 只能使用以下键；不适用阶段省略或写 `null`，不得临时发明新键。

| Phase | 适用路径 |
|-------|----------|
| auth_owner_ms | 所有项目归属校验路径 |
| rate_limit_ms | docx preview / execute / db import / merge |
| upload_read_ms | docx preview / db import / merge |
| temp_file_write_ms | docx preview / db import / merge |
| temp_lookup_ms | docx execute |
| docx_parse_ms | docx preview / execute |
| docx_generate_ms | word export |
| response_build_ms | docx preview / execute |
| project_tree_load_ms | word export / project copy |
| schema_validate_ms | db import / merge |
| host_schema_validate_ms | db import / merge |
| external_graph_load_ms | db import / merge |
| clone_entities_ms | project copy / db import / merge |
| logo_copy_ms | project copy / db import / merge |
| order_scope_load_ms | reorder |
| order_validate_ms | reorder |
| order_safe_offset_update_ms | reorder |
| order_final_update_ms | reorder |
| db_read_ms | 所有主链路 |
| db_write_ms | 写路径 |
| flush_ms | 写路径 |
| commit_ms | 写路径 |
| file_response_prepare_ms | word export |
| output_validate_ms | word export |
| cleanup_ms | temp file / rollback cleanup |

---

## 6. 主链路插桩要求

### 6.1 `backend/src/routers/import_docx.py`

`preview_docx_import` 必须记录：
- `rate_limit_ms`
- `auth_owner_ms`
- `upload_read_ms`
- `temp_file_write_ms`
- `docx_parse_ms`
- `response_build_ms`
- `forms_count`
- `fields_count`
- `file_size_bytes`

`execute_docx_import` 必须记录：
- `rate_limit_ms`
- `auth_owner_ms`
- `temp_lookup_ms`
- `docx_parse_ms`
- `db_read_ms`
- `db_write_ms`
- `flush_ms`
- `cleanup_ms`
- `forms_count`
- `fields_count`

### 6.2 `backend/src/routers/export.py`

`export_word` 必须记录：
- `auth_owner_ms`
- `project_tree_load_ms`
- `docx_generate_ms`
- `output_validate_ms`
- `file_response_prepare_ms`
- `forms_count`
- `fields_count`
- `output_size_bytes`

数据库导出相关 endpoint 只允许写 reference metrics，不参与 gating。

### 6.3 `backend/src/routers/projects.py`

`copy_project` 必须记录：
- `auth_owner_ms`
- `project_tree_load_ms`
- `clone_entities_ms`
- `logo_copy_ms`
- `flush_ms`

`import_project_db` 与 `import_database_merge` 必须记录：
- `rate_limit_ms`
- `upload_read_ms`
- `temp_file_write_ms`
- `schema_validate_ms`
- `host_schema_validate_ms`
- `external_graph_load_ms`
- `clone_entities_ms`
- `flush_ms`
- `cleanup_ms`
- `project_count`

`reorder_projects` 必须记录 reorder phase。

### 6.4 Reorder endpoints

以下 endpoints 必须记录 reorder phase：
- `/api/projects/reorder`
- `/api/projects/{project_id}/visits/reorder`
- `/api/projects/{project_id}/forms/reorder`
- `/api/projects/{project_id}/field-definitions/reorder`
- `/api/forms/{form_id}/fields/reorder`
- `/api/visits/{visit_id}/forms/reorder`
- `/api/projects/{project_id}/codelists/reorder`
- `/api/projects/{project_id}/codelists/{cl_id}/options/reorder`
- `/api/projects/{project_id}/units/reorder`

必须至少记录：
- `order_scope_load_ms`
- `order_validate_ms`
- `order_safe_offset_update_ms`
- `order_final_update_ms`
- `flush_ms`
- `scope_size`

---

## 7. 后端基线脚本

### 7.1 `backend/scripts/run_perf_baseline.py`

必须支持：

```bash
python backend/scripts/run_perf_baseline.py --fixture heavy-1600 --mode cold
python backend/scripts/run_perf_baseline.py --fixture heavy-1600 --mode warm
```

行为：
- 设置 `CRF_PERF_BASELINE=1`
- 创建临时 SQLite 文件数据库
- 调用 `generate_perf_fixture.py` 准备样本
- 登录普通用户
- 执行 15 个后端 gating scenarios
- 每 scenario 1 次 warm-up + 5 次 measured
- 输出到对应 JSONL 文件
- 运行结束删除临时文件

### 7.2 harness stub

脚本必须在采样期间：
- stub `src.routers.import_docx.review_forms` 为 async no-op
- stub `src.services.docx_screenshot_service.DocxScreenshotService.start` 为 no-op
- 不调用 screenshot endpoints

---

## 8. PBT 属性

| 属性 | 不变量 | 反例生成策略 |
|------|--------|--------------|
| observability side-effect freedom | 开关观测前后，同一请求的 status、JSON schema、FileResponse 行为与数据库最终状态等价 | 同一 fixture 分别在开/关观测下运行主链路，比较响应与数据库快照 |
| phase non-negativity | 所有 phase 耗时必须为 ms 且 `>= 0` | 注入负数/秒单位，validator 必须失败 |
| SQL context isolation | 并发请求 SQL 统计不得串扰 | 并发执行 copy 与 reorder，断言各 request sql_count 独立 |
| sanitized SQL | SQL shape 不得包含参数值、字段 label、token | 注入 sentinel 参数，扫描 slow_sql_shapes |
| error path preservation | 失败请求也记录 request_total_ms，但错误 status/detail 不变 | 构造无效 docx、无效 temp_id、越权 project |
| transaction integrity | 观测 span 不得改变 commit/rollback 边界 | 在 flush/docx parse/file save 注入异常，比对数据库快照 |
| WAL preservation | 新连接仍保持 foreign_keys、WAL、busy_timeout、synchronous NORMAL | 查询 PRAGMA 并与既有配置比较 |

---

## 9. 验证条件

| ID | 条件 |
|----|------|
| SC-3.1 | `CRF_PERF_BASELINE` 默认关闭，开启后生成 request summary |
| SC-3.2 | SQL listeners 记录 sql_count/sql_total_ms，且不记录 SQL 参数 |
| SC-3.3 | 15 个后端 gating scenarios 均有 5 条 measured record |
| SC-3.4 | docx preview 的 AI review 与 screenshot 被 harness stub 严格排除 |
| SC-3.5 | 开启观测后现有导入、导出、排序、权限、安全测试继续通过 |
| SC-3.6 | sentinel secret 扫描不命中任何 baseline/log artifact |
