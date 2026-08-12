# 执行清单：回收站定时清理与用户管理页重构

> PRD `prd.md`，设计 `design.md`。按序执行，每步附验证命令。

## 后端

### Step 1 · 配置模型 — `backend/src/config.py`
- 在 `DocxScreenshotConfig` 之后加 `RecycleBinAgeUnit`/`RecycleBinSizeUnit`/`RecycleBinAgeRule`/`RecycleBinSizeRule`/`RecycleBinConfig`，`AppConfig.recycle_bin`，`DAYS_PER_MONTH=30`/`DAYS_PER_YEAR=365`。
- `use_enum_values=True`+`validate_default=True` 镜像 `DocxScreenshotConfig`。
- `value` `field_validator >=1`；`interval_minutes` `Field(ge=1,le=1440)`；`min_retain_hours` `ge=0`。
- 不加 `_ENV_OVERRIDE_MAP`。
- 验证：`cd backend && python -m pytest tests/test_config.py -q`（先写测试见 Step 2，但模型先建好测试才能导入）。

### Step 2 · 配置测试 — `backend/tests/test_config.py`
- `test_recycle_bin_defaults_are_disabled`：`AppConfig().recycle_bin.age.enabled is False`、`.size.enabled is False`、`interval_minutes==60`、`min_retain_hours==24`。
- `test_recycle_bin_yaml_overrides_defaults`：写 temp yaml 覆盖，`load_config` 读回。
- `test_recycle_bin_rejects_invalid_unit_at_load`：`unit:"week"` 抛 `ValueError`。
- `test_recycle_bin_rejects_zero_value`：`value:0` 抛错。
- 验证：`python -m pytest tests/test_config.py -q`。

### Step 3 · 抽出 purge_project（纯重构） — `backend/src/services/project_purge_service.py`
- `resolve_logo_path(project)`、`purge_project(session, project)`（delete+flush+logo unlink 包 `try/except OSError` 记 warning）。模块级 `from src.config import get_config`。
- `admin.py:168-189` `hard_delete_project` 删+unlink 两行替换为 `purge_project`，保留 404/400。
- `conftest.py` 加 `patch("src.services.project_purge_service.get_config", return_value=_TEST_CONFIG)`（`project_size_service` 的 patch 在 Step 4 加，或者本步一并加占位）。
- **检查点（关键）**：`python -m pytest tests/test_admin_project_ops.py -q`，两个 hard-delete 用例**不改测试**全绿。

### Step 4 · 体积估算 — `backend/src/services/project_size_service.py`
- `ROW_OVERHEAD_BYTES = 64`。
- `_text_bytes(*cols)` → `func.sum(64 + length(cast(coalesce(col,'') AS BLOB)) + ...)`。
- 各表文本列：
  - `project`: name, version, db_type, trial_name, crf_version, crf_version_date, protocol_number, screening_number_format, sponsor, company_logo_path, data_management_unit
  - `visit`: name, code
  - `visit_form`: 仅行开销（无文本列）
  - `form`: name, code, domain, design_notes, annotation_positions
  - `field`: variable_name, label, field_type, date_format
  - `form_field`: label_override, help_text, default_value, bg_color, text_color, label_font_size
  - `field_definition`: variable_name, label, field_type, checkbox_label, date_format, table_type
  - `codelist`: name, code, description
  - `codelist_option`: code, decode
  - `unit`: symbol, code
  - 子表通过 `Visit`/`Form`/`CodeList` join 回 project_id。
- `estimate_project_sizes(session, project_ids) -> Dict[int,int]`。
- `estimate_recycled_project_sizes(session)`：`WHERE Project.deleted_at IS NOT NULL`。
- Logo：SQL 后对 `company_logo_path` 非空项目 `stat()`，`try/except OSError: 0`。模块级 `from src.config import get_config`。
- `format_bytes(n)`：1024 进制，`0 B`/`< 1 KB`/KB·MB·GB 一位小数，负数 None 返回 `'-'`。
- `conftest.py` 加 `patch("src.services.project_size_service.get_config", ...)`。
- 验证：见 Step 5 测试一并跑。

### Step 5 · 测试 — `backend/tests/test_recycle_bin_cleanup.py`
- 体积估算：随文本内容增长、覆盖子表、含 logo 字节、logo 缺失不抛错、**查询条数与项目数无关**（用 `before_cursor_execute` 监听器断言 2 vs 20 项目查询数恒定）。
- `format_bytes` 边界。
- 验证：`python -m pytest tests/test_recycle_bin_cleanup.py -q`。

### Step 6 · 清理决策 — `backend/src/services/recycle_bin_cleanup_service.py`
- `resolve_age_cutoff(rule, now)`：naive 本地，`factor={day:1,month:30,year:365}`，关闭→None。
- `resolve_size_limit_bytes(rule)`：MB→`1024**2`，GB→`1024**3`，关闭→None。
- `build_cleanup_plan(session, policy, now=None) -> CleanupPlan(age_ids, size_ids, total_bytes_before, total_bytes_after, would_converge)`：语义见 design §6。
- `run_recycle_bin_cleanup(session, policy=None, now=None) -> dict`：每项目一事务、删前重查 `deleted_at is not None`、失败 rollback+continue、INFO 日志。
- 模块级 `from src.config import get_config` + `from src.services.project_size_service import ...` + `from src.services.project_purge_service import purge_project`。
- `conftest.py` 加 `patch("src.services.recycle_bin_cleanup_service.get_config", ...)`。
- 测试（在 `test_recycle_bin_cleanup.py` 续写）：
  - 年龄规则：用 naive `datetime.now()-timedelta(days=N)`，不用 tz；不误伤 `deleted_at IS NULL`。
  - 容量规则：最早优先逐个删至阈值以下；未超阈值 no-op；已被年龄选中不重复计入；`min_retain_hours` 保护的项目不被选中；因保留下限无法降到阈值以下时正常返回。
  - 执行：完整删数据图+logo；计划后被恢复的项目跳过；单项目失败不影响其余。
- 验证：`python -m pytest tests/test_recycle_bin_cleanup.py -q`。

### Step 7 · 后台任务 — `backend/src/background_jobs.py`
- `_DISABLE_ENV="CRF_DISABLE_BACKGROUND_JOBS"`。
- `should_enable_background_jobs() -> bool`：值为 1/true/yes/on 则 False。
- `_run_cleanup_once_sync()`：`with Session(get_engine()) as session: run_recycle_bin_cleanup(session)`。
- `async def _recycle_bin_cleanup_loop()`：先干活后 sleep；`CancelledError` 原样上抛；其余 `logger.exception` 后继续；`interval=max(1,get_config().recycle_bin.interval_minutes)` 每轮重读。
- `start_background_jobs(app)`、`async def stop_background_jobs(app)`。
- 测试 `backend/tests/test_background_jobs_flag.py`：仿 `test_main_reload_flag.py`，未设置/1/true/on/0/乱值 四种 + 关闭时 `start_background_jobs` 不产生 task。
- `conftest.py` 在 `from main import app`（L24）**之前**加 `os.environ.setdefault("CRF_DISABLE_BACKGROUND_JOBS","1")`。
- 验证：`python -m pytest tests/test_background_jobs_flag.py -q`。

### Step 8 · lifespan 接线 — `backend/main.py:133-166`
- `init_db()` 之后 yield 之前 `start_background_jobs(app)`。
- `finally` 第一件事 `await stop_background_jobs(app)`，先于现有 `DocxScreenshotService.cleanup_old_caches`。
- 验证：`python -m pytest tests/test_main_reload_flag.py -q`，并跑 `python -c "import main"` 确认导入无副作用。

### Step 9 · 管理端接口 — `backend/src/routers/admin.py`
- `CleanupRuleAge/Size`、`CleanupPolicyUpdateRequest`、`CleanupPolicyResponse`、`CleanupPreviewItem` 模型（admin.py 内）。
- `GET/PUT /api/admin/recycle-bin/cleanup-policy`、`POST /api/admin/recycle-bin/cleanup/preview`，`Depends(require_admin)`。
- PUT 走 `update_config({"recycle_bin": payload.model_dump(mode="json")})`。
- `RecycleBinProjectResponse` 加 `estimated_size_bytes: int = 0`，`list_recycle_bin` 调 `estimate_recycled_project_sizes` 填充。
- preview 调 `build_cleanup_plan` 不执行；`matched_rules` 由 plan 的 age_ids/size_ids 推导。
- 测试 `backend/tests/test_recycle_bin_policy_api.py`：
  - GET 默认值+统计；PUT 落盘回读；`value=0`/`unit="week"`/`unit="TB"`→422；非管理员 GET/PUT/preview→403；**PUT 不污染 ai/template**；preview 不删除（前后计数不变）。
- `test_admin_project_ops.py` 加「回收站列表含 `estimated_size_bytes`」。
- 验证：`python -m pytest tests/test_recycle_bin_policy_api.py tests/test_admin_project_ops.py -q`。

### Step 10 · 后端全量
- `cd backend && python -m pytest`（期望全绿，基线 748 passed/4 xfailed 保持或增加）。

## 前端

### Step 11 · byteSize 组合式 — `frontend/src/composables/byteSize.js`
- `formatBytes(bytes)`：1024 进制，`0 B`/`< 1 KB`/一位小数，非法返回 `'-'`。
- 测试 `frontend/tests/byteSize.test.js`。
- 验证：`cd frontend && node --test tests/byteSize.test.js`。

### Step 12 · R2+R3 AdminView 改造 — `frontend/src/components/AdminView.vue`
- 删密码状态列模板块（只删列，不删重置密码逻辑）。
- 删 `showBatchMove/Copy/Delete`、`batchActionTitle`、`batchActionConfirmText`、`openBatchMove/Copy/Delete`、`loadUserProjects`。
- 加 `showProjectList`/`projectListUser`/`loadingProjects`/`batchMode`、`needsTargetUser`/`canExecute`/`batchConfirmText` computed、`openProjectList`/`executeBatchAction`/`resetProjectListState`。
- `executeBatchMove/Copy/Delete` 函数体保持，仅 `resetBatchActionState`→`resetProjectListState`。
- `操作` 列 `width="540"`→`width="300"`，按钮 `改名/重置密码/项目列表/删除`。
- 批量弹窗（替换 L345-388）：标题 `项目列表 - {username}`，`width=600`，顶部 `el-radio-group`（迁移/复制/删除），`v-if="needsTargetUser"` 目标用户下拉（复制允许选自己），底部单执行按钮（删除 danger）。

### Step 13 · R4 宽度居中 — `frontend/src/App.vue` scoped style
- `.admin-shell { width:50%; min-width:600px; max-width:100%; margin-inline:auto; }`。
- 不加任何 td/.cell 规则。

### Step 14 · 清理策略 UI + 回收站大小列 — `AdminView.vue`
- 回收站弹窗 `.tab-header` 加「清理策略」按钮，开独立 `el-dialog`(`width=520`，`append-to-body`)。
- 策略表单：启用过期清理 switch + 保留时长 input-number(min 1) + 单位下拉(天/月/年→day/month/year)；启用容量清理 switch + 容量上限 + 单位下拉(MB/GB)；最短保留时间(min 0)；巡检间隔(min 1 max 1440)；只读统计行。
- 帮助文案含：月按30天年按365天、超出后从最早删开始逐个彻底删除、大小为估算值。
- 「预览将删除」按钮 → `POST .../cleanup/preview`，只读表格展示结果。
- 保存：任一规则关闭→启用时，复用 `confirmFinalProjectDelete` 二次确认，再 `api.put`。
- 回收站表格加 `大小（估算）` 列(width 120) 绑 `formatBytes(row.estimated_size_bytes)`，弹窗宽 760→860。
- 新增 `byteSize.js` 的 `formatBytes` import。
- 测试 `frontend/tests/recycleBinCleanupPolicy.test.js`：单位 option 值恰为 day/month/year 与 MB/GB；`:min` 约束；启用二次确认在 api.put 之前；预览接线。

### Step 15 · 前端测试更新 — `frontend/tests/adminViewStructure.test.js`
- L18-23：删 openBatchMove/Copy/Delete 断言，改 `openProjectList(row)` + `项目列表`；保留 `@selection-change="onProjectSelectionChange"`。
- L38-40：三条 openBatch* 正则合并为一条 `openProjectList`；L41-42 与 L30-36 保持。
- L60-65：反转为 `doesNotMatch(/label="密码状态"/)`、`doesNotMatch(/has_password/)`；保留 `openResetPassword` 与 `api.put(.../password)`。
- L57：`adminApiBaseCalls.length >= 9`→`>= 12`。
- 新增：App.vue `.admin-shell` 含 `width: 50%` 与 `margin-inline: auto`；项目列表弹窗 `v-model="showProjectList"` + `type="selection"` 列；`v-if="needsTargetUser"`；`操作` 列 `width="300"`；回收站 `estimated_size_bytes` 列；`清理策略` 按钮与三接口调用。
- `projectDeleteConfirmation.test.js`/`appSettingsShell.test.js` 无需改但实跑确认。

### Step 16 · 前端全量
- `cd frontend && node --test tests/*.test.js`（期望全绿，基线 530）。
- `cd frontend && npm run lint`（0 errors，禁跑 `npm run format`）。
- `cd frontend && npm run build`。

## 文档（Step 17）

- `README.md`/`README.en.md`：配置块加 `recycle_bin:` + 「回收站自动清理」说明（两规则独立、估算、不可逆、单实例限制）。
- `config.yaml.example`：加注释 `recycle_bin:` 段。
- 根 `.claude/CLAUDE.md`：Core Capabilities + 新跨栈契约条目 + Change Log + 模块计数（backend service 15→18、test 52→56；frontend composables 23→24、test 53→56）。
- `backend/.claude/CLAUDE.md`：3 新 service + `background_jobs.py` + env 开关 + naive deleted_at 约定 + Change Log。
- `frontend/.claude/CLAUDE.md`：AdminView 描述去「密码状态显示」加项目列表弹窗+清理策略；`byteSize.js`；测试清单；Change Log。
- `.claude/index.json`：5 个新源文件。
- `.trellis/spec/backend/database-guidelines.md`：后台任务禁用 get_session、naive 本地时间比较、一项目一事务。
- `.trellis/spec/guides/cross-stack-contracts.md`：§11 回收站清理策略契约。
- `.trellis/spec/frontend/component-guidelines.md`：admin-shell 半宽居中 + 禁加全局 td 对齐。

## 收尾（Step 18）

- 端到端手工验证（见 plan 验证小节 5 项）。
- 提交（格式 `<type>(<scope>): <desc>`，无 Co-Authored-By），推分支 `-u`，开 PR（base main，CI 过检自动合并，勿手动 merge）。
- PR 合并后按用户请求清理 worktree/分支。