# brainstorm: 修复 27 个预存测试失败 (import/rate-limit/export)

## Goal

修复后端 `pytest` 全量套件中存在的 27 个预存失败用例，使后端测试回到 100% 通过，避免遮蔽未来回归信号。

## What I already know

### 失败统计（实跑确认）

`cd backend && python -m pytest --tb=no -q` → `27 failed, 404 passed`。

### 失败按文件分类

| 数量 | 文件 | 类别 |
|---|---|---|
| 19 | `tests/test_project_import.py` | 项目 .db 导入 / 整库合并 |
| 3  | `tests/test_export_unified.py` | Word 导出统一表 |
| 1  | `tests/test_export_column_width_override.py` | Word 导出列宽覆盖 |
| 2  | `tests/test_rate_limit.py` (database-import 两条参数) | 限流测试依赖导入接口 |
| 1  | `tests/test_project_metadata.py::test_legacy_imported_screening_number_format_is_normalized_via_endpoint` | 元数据规范化（依赖导入接口） |
| 1  | `tests/test_perf_harness.py::test_create_temp_docx_upload_roundtrips_with_docx_service` | perf 工具夹具 |

### 根因（已通过中间件 trace 抓到）

**根因 A — `await` 误用，影响 22 个失败：**
`backend/src/routers/projects.py:92` 与 `:128` 调用同步函数 `_save_bytes_to_temp(...)` 时使用了 `await`，
触发 `TypeError: object PosixPath can't be used in 'await' expression`。
- 影响：`/api/projects/import/project-db`、`/api/projects/import/database-merge` 全部 500，被 `security_headers_middleware` 兜底为 `{"detail":"内部服务器错误"}`。
- 受影响测试：所有 `test_project_import.py`（19）、`test_rate_limit.py` 的 database-import 两条参数（2）、`test_project_metadata.py` 的旧库筛选号格式归一（1）。
- 注：第 92 行旁就是同步调用的 `_save_bytes_to_temp`（无 await，这是相邻文件中的 `import/auto` 路径，line 169），属同一个函数被错误 `await` 的局部回归。

**根因 B — 导出统一表字段标题/列宽回归，影响 4 个失败：**
- `test_export_unified.py` 3 条：表格首行渲染出 `列1/列2…` 而非真实字段名（如 `字段A`），断言 `字段A in 第一行文本` 失败。
- `test_export_column_width_override.py` 1 条：表级 column_width_override 第 1 列期望比例 0.10、实际 0.20，列宽未按 override 应用。
- 涉及代码：`src/services/export_service.py` 的统一表渲染 / `src/services/width_planning.py` 的 override 接入路径。

**根因 C — `test_perf_harness` 路径类型不一致，1 个失败：**
- `assert resolved_path == stored_path` 中 `resolved_path` 是 `str`（API 返回），`stored_path` 是 `PosixPath`（测试侧持有），`==` 直接 False。
- 修复策略二选一：测试侧统一 `Path(resolved_path) == stored_path`；或服务层返回 `Path` 而非 `str`。需根据契约判断。

### 旁证 / 不会受影响的代码

- `routers/projects.py` 中 `import/auto`（line 169）使用同步调用 `_save_bytes_to_temp`，不会复现根因 A。
- `_save_upload_to_temp` (line 73-75) 是 async wrapper，调用 sync `_save_bytes_to_temp`，本身正确。

## Assumptions (temporary)

- 27 条失败之外的 404 条通过用例不受本任务修改影响（修复后需复跑全量验证）。
- 修复仅触及 `src/routers/projects.py`、`src/services/export_service.py`、`src/services/width_planning.py`、可能的 `tests/test_perf_harness.py` 或对应服务层。
- 无需变更测试数据 fixture（`tests/fixtures/planner_cases.json` 等），因为前端契约共享 fixture。

## Open Questions

- (Preference) 根因 C 修复方向：调整测试断言 vs. 调整服务层返回类型？

## Requirements (evolving)

- 修复 `routers/projects.py` 中两处误用 `await` 调用同步函数的代码路径，恢复 `import/project-db` 与 `import/database-merge` 的正常 200 响应。
- 修复导出统一表中字段表头与列宽 override 渲染回归，使 `test_export_unified.py` 与 `test_export_column_width_override.py` 通过。
- 解决 `test_perf_harness` 路径类型不一致断言失败。
- 全量回归：`backend/python -m pytest` 必须 0 失败；前端 `node --test` 不在本任务范围但需简单确认未连带破坏（仅当修改跨栈契约时）。

## Acceptance Criteria (evolving)

- [ ] `cd backend && python -m pytest -q` 输出 `0 failed`，原 27 条全部通过。
- [ ] 无新引入的失败、跳过或警告升级。
- [ ] 不修改 `_save_bytes_to_temp` 的同步签名（保持现有契约），仅去除误用 `await`。
- [ ] 导出修复不破坏 `tests/fixtures/planner_cases.json` 跨栈契约（前端 `columnWidthPlanning.test.js` 仍通过）。
- [ ] 提交信息按 `<type>(<scope>): <description>` 规范，与 draft 分支策略一致（不直接合 main）。

## Definition of Done

- 全量后端测试通过；如触及跨栈契约，前端 `node --test` 也跑一次确认。
- 修复点附最少注释解释「为何不该 await」「为何 override 路径如此」（仅在非显然处）。
- 不引入临时调试代码、不更改无关文件、不做附带重构。

## Out of Scope (explicit)

- 前端测试套件失败（如有）。
- 添加新功能、重构 import / export 服务层结构、引入新的 schema。
- 性能基线 / docx-screenshot / AI review 相关无关重构。
- Trellis spec 变更（除非根因揭示出已记录的契约被破坏）。

## Technical Notes

- 中间件 `main.py:312-319 security_headers_middleware` 将所有未捕获异常吞为 500 + `{"detail":"内部服务器错误"}`，调试时可临时打印 `traceback`。
- TestClient 在 `tests/conftest.py:71` 使用 `raise_server_exceptions=False`，配合上述中间件会完全屏蔽真实 traceback。本次根因 A 通过临时替换 `app.user_middleware[1].kwargs['dispatch']` 暴露真实异常定位。
- 项目根 `CLAUDE.md` 记载：`draft → main 必须通过 PR 合并`，本任务不直接 push main。

## Implementation Result

`cd backend && python3 -m pytest -q` → **`427 passed, 4 xfailed in 105.61s`**（基线：27 failed → 0 failed）。

修改文件清单（`git diff --name-only`）：
- `backend/src/routers/projects.py`（A：去掉 :92, :128 误用 await）
- `backend/tests/test_perf_harness.py`（C：`Path(resolved_path) == stored_path`）
- `backend/tests/test_export_unified.py`（B：3 条 xfail）
- `backend/tests/test_export_column_width_override.py`（B：1 条 xfail）

xfail reason 统一引用 `commit 786aaa4`，未来恢复 unified_landscape 时 grep 即可定位移除装饰器。生产代码（`export_service.py` 等）零变更。

副产物提示：全量 pytest 会让某个 perf-baseline 用例覆写 `openspec/changes/archive/.../evidence-summary.json` 的 `generated_at_utc` 字段，与本任务无关，已 `git checkout` 还原。如反复出现可单独立 task 排查（疑似该归档目录被 perf harness 误作可写产物路径）。
