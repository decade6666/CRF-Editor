# Research: backend-dedup 现状盘点

- **Query**: PRD 各收敛点的逐字现状（BatchDeleteRequest / 改名梯子 / 导入错误映射 / 迁移 / 排序方法 / 内联模型）
- **Scope**: internal（HEAD `a4431b0`；行号仅供参考，priorities: 函数/类名优先）
- **Date**: 2026-10-09
- **注意**: 前置任务 `legacy-cleanup`（删 perf_span/record_counter 包装）与 `backend-format`（ruff format）合入后行号会漂移；database.py / order_service.py 当前是逐行空行的旧格式，format 后行数大减。

## 1. BatchDeleteRequest

### 定义（3 份）

| 位置 | 字段 | 限制 |
|---|---|---|
| `backend/src/schemas/__init__.py:7` | `ids: List[int] = Field(..., min_length=1, max_length=500)` | 1–500 |
| `backend/src/routers/admin.py:84` | `project_ids: List[int]` | 无 |
| `backend/src/routers/projects.py:376` | `project_ids: List[int]` | 无 |

### 共享 `ids` 模型的端点（13 个）

- forms.py:187 `POST /projects/{pid}/forms/batch-delete`、:211 批量引用
- units.py:195 批删单位、:219 批量引用
- codelists.py:228 批删字典、:240 批量引用、:318 批删选项
- fields.py:236 批删字段定义、:258 批量引用、:438 批删表单字段
- visits.py:171 批删访视

### 用本地 `project_ids` 模型的端点

- `admin.py:88` `POST /api/admin/projects/batch-delete`（软删；缺 id/含已删 → 400，admin.py:100-104）
- `projects.py:380` `POST /api/projects/batch-delete`（本人项目；**空列表显式 no-op**，projects.py:388-389；owner 过滤静默排除）

### 同形状兄弟模型（一并列出）

- `admin.py:196` `BatchCopyRequest`(`project_ids`+`target_user_id`) → `POST /api/admin/projects/batch-copy`（admin.py:201）
- `admin.py:224` `BatchMoveRequest`(同形状) → `POST /api/admin/projects/batch-move`（admin.py:229）

### 前端调用点

| 调用 | 端点 | 键 |
|---|---|---|
| AdminView.vue:292 | `/api/admin/projects/batch-delete` | `project_ids` |
| AdminView.vue:257 | `/api/admin/projects/batch-move` | `project_ids` |
| AdminView.vue:272 | `/api/admin/projects/batch-copy` | `project_ids` |
| CodelistsTab.vue:173 / :184 | 字典 / 选项批删 | `ids` |
| UnitsTab.vue:144、FieldsTab.vue:159、VisitsTab.vue:349 | 单位 / 字段定义 / 访视批删 | `ids` |
| FormDesignerTab.vue:516、:1155、:1175 | 表单批删 / 表单字段批删×2 | `ids` |

**`/api/projects/batch-delete`（projects.py:380）没有任何前端调用者**（grep 全 frontend/src 仅命中上述 admin 版与 `ids` 子资源端点）→ 前端孤儿端点，改它的请求键零前端成本。

### 空列表可达性（前端不会发空）

- AdminView：`executeBatchDelete` 首行 `if (!selectedProjectIds.value.length) return`（AdminView.vue:291）；三入口按钮 `:disabled="!selectedProjectIds.length"`（:499-501）；`executeBatchMove/Copy` 同守卫（:255、:270）。
- 五个列表页批删按钮均无选择禁用：CodelistsTab.vue:278（`!selCls.length`）、:348（`!selOpts.length`）；UnitsTab.vue:191；FieldsTab.vue:384；VisitsTab.vue:839；FormDesignerTab.vue:3320（`!selForms.length`）。

### 锁行为的测试

- `tests/test_batch_delete_isolation.py:41`（projects 端点，混入他人 id → 204 且他人不受影响）；**:57 `test_batch_delete_empty_list_is_noop`（空列表 → 204）——与 `min_length=1` 直接冲突，PRD R1 已知**。
- `tests/test_admin_project_ops.py:44/58/72`（admin 批删：缺 id / 已删 → 400 零变更）；:96/124/290 batch-move；:163 batch-copy。
- `tests/test_permission_guards.py:364、:494`（form-fields 批删 `ids` 越界拒绝）。

## 2. 复制改名梯子（全部枚举）

### A 组：路由层 `_copy` 直拼 + 每候选一次 DB 探测（同一算法，仅参数不同）

| 实现 | 列 | 查询范围 | 梯子 |
|---|---|---|---|
| codelists.py:33-40 `_build_codelist_copy_name` | CodeList.name | `project_id == pid`（逐次 `select(CodeList.id)`） | `X_copy` → `X_copy1` → `X_copy2` |
| fields.py:463-487 `copy_field_definition` 内联 | FieldDefinition.variable_name | `project_id == src.project_id`（逐次 `select(FieldDefinition)` 整实体） | 同上 |
| forms.py:259-270 `copy_form` 内联 | Form.name | 同上 | 同上 |
| visits.py:205-231 `copy_visit` 内联 | Visit.name | 同上 | 同上 |

算法逐字：`base = 原名 + "_copy"`；首候选 = base；冲突则候选 = `f"{base}{idx}"`，**idx 从 1 开始**（即第二个候选是 `X_copy1`）；无内存集、无截断、无 max-length。Soft-delete：这些表无 deleted_at。示例（原名「血压」）：无冲突→`血压_copy`；一次冲突→`血压_copy1`；两次→`血压_copy2`。

### B 组：预取集合 + 中文后缀，编号从 2 开始

- project_clone_service.py:150-166 `_resolve_copy_name(base_name, session, owner_id)`：集合 = **该 owner 全部** `Project.name`（**不过滤 deleted_at，回收站占名**）；`X (副本)` → `X (副本2)` → `X (副本3)`。单次调用，无批内更新。示例（「项目A」）：`项目A (副本)` / `项目A (副本2)` / `项目A (副本3)`。
- admin.py:112-127 `_resolve_restore_name(session, owner_id, base_name)`：集合 = 该 owner **未删除**项目名（`deleted_at IS NULL`）；`X (恢复)` → `X (恢复2)` → …。
- project_import_service.py:184-210 `_resolve_import_name`：集合同上（未删除）；**先试原名本身**（不冲突直接原样返回），再 `X_导入` → `X_导入2` → …。「先试原名」是 B 组独有行为。

### C 组：内存集合 + 后缀参数化（import_service，集合由调用方边写边加）

- import_service.py:448-457 `_make_unique_name(existing, base, suffix="_导入")`：`base_导入` → `base_导入2`（idx 从 2）。表单导入用（:829）。
- import_service.py:460-469 `_make_unique_import_codelist_name`：`X（导入）`（**全角括号**）→ `X（导入2）`（:970）。
- import_service.py:507-516 `_make_unique_var`：`X_IMP` → `X_IMP2`（:1026）。
- import_service.py:519-528 `_make_unique_code`：**与 `_make_unique_var` 逐字节相同**（`_IMP`），仅 docstring 不同（:553 经 `_resolve_import_code`）。
- import_service.py:531-557 `_resolve_import_code(existing_codes, source_code, prefix)`：源非空→strip 透传；空→`generate_code(prefix)`；冲突→`_make_unique_code` 阶梯。

### 分类与建议签名

- **同一算法**：A 组四份（参数 = model、name 列、scope filter；后缀固定 `_copy`、编号作用于已加后缀名、从 1 起、逐候选 DB 探测）。建议：
  `resolve_copy_name(session, model, column_attr, scope_filter, base, *, suffix="_copy", start=1) -> str`
- **同一算法**：C 组四份（参数 = 集合、后缀模板、起始编号；已含 `_IMP` 重复对）。建议：
  `make_unique_in(existing: set, base: str, *, first: str, numbered: Callable[[int], str]) -> str`
  （或简化 `make_unique(existing, base, suffix, start=2)`，可逐字复现 `_导入`/`（导入）`/`_IMP` 全部四种）
- **可并入 B**（首候选+编号模板形式）：`_resolve_copy_name` / `_resolve_restore_name` 用同一 set-based helper（first=`X (副本)`，numbered=`X (副本{n})`，start=2），但**集合查询范围不同**（含/不含 deleted_at）须留在调用方。
- **结构性不同，勿强合**：`_resolve_import_name`（先试原名，可能不加后缀）；以及 visit-forms 复制（visits.py:241-254）原样复制 sequence、完全无改名。

## 3. 导入错误 → HTTP 映射

### import_template.py 三份粘贴（`_compatibility_error` 定义 :27-32）

`FileNotFoundError → HTTPException(404, str(e))`；`ValueError` 且 `"模板库不兼容" in msg` → `JSONResponse(400, {"detail": msg, "code": "TEMPLATE_INCOMPATIBLE"})`；其余 `ValueError → HTTPException(400, msg)`。位置：`preview_import` :136-143、`preview_form_fields` :166-173、`execute_import` :205-215（execute 额外多一段裸 `except Exception → logger.exception + HTTPException(500, "导入失败，请检查模板文件是否有效")`）。

- 依赖点：`routers/template_fields.py:12` `from src.routers.import_template import _compatibility_error` —— 抽取时该 helper 必须仍可导入（或同步改 import）。
- 测试：`tests/test_import_service.py:1808`（execute 端点 400，annotation_positions 非法路径）；`tests/test_phase0_ordering_contracts.py:300/573/607/641/718/770`（execute fail-closed 各例）；`tests/test_template_field_index.py:527/540/556/588`（同一映射族经 template-fields 路由：400 未配置 / 404 缺文件 / 400 路径无效 / 400 `TEMPLATE_INCOMPATIBLE`，:607-608 断言 code+detail）。

### projects.py `_IMPORT_ERROR_CODES`

自定义 `class ImportError(Exception)`（projects.py:60-67，`message/code/status_code`）；`_IMPORT_ERROR_CODES` :70-74（SCHEMA_INCOMPATIBLE→IMPORT_SCHEMA_INCOMPATIBLE、DATABASE_ERROR→IMPORT_DATABASE_ERROR、UNEXPECTED_ERROR→IMPORT_UNEXPECTED_ERROR）。`import_project_db` :121-130：`ValueError→ImportError(SCHEMA_INCOMPATIBLE, 400)`、`sqlite3.DatabaseError→ImportError(DATABASE_ERROR)`、其余→`ImportError(UNEXPECTED_ERROR, 500)`。全局 handler：`main.py:469-478` `from src.routers.projects import ImportError as ProjectImportError` → `JSONResponse(status_code=exc.status_code, {"detail", "code"})`。测试：`tests/test_project_import.py`、`tests/test_rate_limit.py:66-68`（patch 的是 service 路径字符串）。

### import_docx.py（形状不同，无 code 字段）

- 上传 :359-367：`ValueError→400 str(e)`；`Exception→500 文件保存失败`。
- 解析 :376-382：`Exception→400 Word文档解析失败…`。
- execute :581-596：`(ValueError, KeyError)→400 导入失败: {e}`；`FileNotFoundError→400 临时文件已过期`；`Exception→500 导入失败，请检查文件内容`。
- 是否并入统一 helper 由 design 决（PRD 已留口）；注意它返回 400/500 裸 detail、无 `code`，与 import_template 形状不一致。

## 4. database.py 迁移

### `_migrate_add_order_index`（:264-508）—— McCabe(radon 风格 AST 统计) ≈ **29**（PRD 估 28）

三段式：Phase1 循环 5 表加列（:278-288）；Phase2 **六**个回填块；Phase3 五条唯一索引（:500-508）。

| 块 | 表 | 分组列 | 序号列 | 行号 |
|---|---|---|---|---|
| 1 | unit | project_id | order_index | :296-324 |
| 2 | field_definition | project_id | order_index | :330-358 |
| 3 | form | project_id | order_index | :364-392 |
| 4 | codelist | project_id | order_index | :398-426 |
| 5 | codelist_option | **codelist_id** | order_index | :432-460 |
| 6 | **visit** | project_id | **sequence** | :464-494 |

六块**逐字同构**（仅表名/分组列/序号列/绑定参数名 pid vs cid 不同）：has_table 守卫 → `SELECT DISTINCT 分组列 WHERE 分组列 IS NOT NULL AND 序号列 IS NULL` → 每组 `SELECT id … ORDER BY id` → 空则 continue → `COALESCE(MAX(序号列),0)+1` 起 enumerate → 逐行 UPDATE。**PRD 说五块，实际有第六块（visit/sequence）**，design 必须覆盖或显式排除。

### `_heal_reserved_admin_account`（:816-912）—— McCabe ≈ 15

分支清单：(1) user 表不存在→return；(2) `config.admin.username.strip()` 为空→return；(3) 无条件 `UPDATE is_admin=1 WHERE TRIM(username)=:u`（**非 production 也执行**）；(4) 按 TRIM(username) 取 admin（ORDER BY id LIMIT 1）；(5) 无记录：非 production→return；production 缺 `admin.bootstrap_password`→RuntimeError；否则 INSERT（hash_password(bootstrap)，auth_version=1）；(6) 有记录：取精确用户名 admin id；`current_username != admin_username and exact_id in (None, user_id)`→改名；`is_production_env() and not has_usable_password_hash(...)`→缺 bootstrap_password 则 RuntimeError，否则改密 + auth_version+1；(7) updates 非空→动态 UPDATE（附 is_admin=1）；(8) production 复查可用 admin，不可用→RuntimeError。

- 依赖：`get_config`、`is_production_env`（src.config，database.py:48 已导入）；`hash_password`、`has_usable_password_hash`（src.services.auth_service，database.py:51 已导入）。config 键：`admin.username`、`admin.bootstrap_password`。
- 调用点：`init_db()` database.py:1380（唯一调用方），位于 `_ensure_form_field_rowid_compatibility` 与 `_move_orphan_projects_to_recycle_bin` 之间。
- 测试：**确认零覆盖**。conftest.py:152 `patch("main.init_db")`；test_app_security.py:82/117 monkeypatch；test_user_admin.py:247 走的是 routers/auth.py:70-75 的 TRIM 登录回退；helpers.py:84 只用 `is_reserved_admin_username` 播种。test_label_variable_name_migration.py:257 只接线断言别的函数。
- 候选目的地与循环风险：**全部无环**——auth_service 只 import config/models（不 import database）；user_admin_service import sqlalchemy/config/models/auth_service（不 import database）；database.py 已 import auth_service。三者皆可：`user_admin_service.py`（需补 `is_production_env` import）、`auth_service.py`（需补 `is_production_env`）、或新模块（零改动风险最小）。

## 5. order_service.py `*_sequence` 六方法

方法体内部**不按模型/列分支**（硬编码 `model_class.sequence`）；重复发生在与 order_index 孪生方法之间：

| sequence 版（行号） | order_index 版 | 结构差异 |
|---|---|---|
| `get_next_sequence` :547 | `get_next_order` :147 | order 版先 `_ensure_initialized`（NULL 自愈）；sequence 版直接 max+1 |
| `insert_at_sequence` :559 | `insert_at` :179 | order 版先 init、且仅 `position <= max_order` 才位移；sequence 版无条件两阶段 |
| `move_to_sequence` :607 | `move_to` :265 | **算法不同**：order 版「记录先泊到 0」+ 方向分支；sequence 版 min/max SAFE_OFFSET 两阶段。不可合并方法体 |
| `delete_and_compact_sequence` :683 | `delete_and_compact` :401 | order 版 init + 向下位移 `-SAFE_OFFSET`，二阶段修负数（`< 0 → +SAFE_OFFSET-1`）；sequence 版无 init + **向上** `+SAFE_OFFSET`，二阶段修 `> old+SAFE_OFFSET → -SAFE_OFFSET-1` |
| `reorder_batch_sequence` :723 | `reorder_batch` :467 | 校验/perf_span/case() 回填逐字同，唯一差异：**位移符号相反**（order 版 `-SAFE_OFFSET`，sequence 版 `+SAFE_OFFSET`） |
| `compact_after_batch_delete_sequence` :819 | `compact_after_batch_delete` :783 | 同上，仅符号相反 |

- 调用方：sequence 族全部在 `routers/visits.py`（Visit：87/93/137/163/177/193、237；VisitForm：378/429/459）。order_index 族：units.py×6、codelists.py×13（CodeList+CodeListOption）、forms.py×7、fields.py×8（FieldDefinition+FormField）、repositories/project_repository.py:42,53、repositories/form_field_repository.py:51、services/field_profile_service.py:115,190,248,250、services/field_cleanup_service.py:55,67,86、services/docx_import_service.py:1793,2033,2125。
- 测试：`tests/test_order_service.py`（15 例：order 族 12 + reorder_batch_sequence 3）；`tests/test_phase0_ordering_contracts.py`（端点级：projects/codelists/visit-forms/form-fields 重排读回、带序号新增压缩、删除压缩、导出序一致）；契约文档 `.trellis/spec/guides/cross-stack-contracts.md` §2「Two-Phase Ordering Algorithm」（contract `ordering-algorithm`，约 :80-110，SAFE_OFFSET=100000 两阶段）。前端只调 HTTP 端点（useOrderableList/useSortableTable），列参数化不影响前端。
- 合并建议（行为逐字）：内部抽 `_shift(session, model, scope, column, *, where, expr)` 级原语 + `column` 参数（`getattr(model, "order_index"|"sequence")`）；reorder/compact 两对用显式 `direction` 参数保住现符号；get_next/insert_at/delete_and_compact 保留 init 差异（sequence 族**不得**获得 init）；`move_to`/`move_to_sequence` 保持两个公开方法、只共享 WHERE 构造。

## 6. 内联 Pydantic 模型（仅本任务触碰文件）

| 文件 | 模型（行号） | 迁移目标 | 测试/外部 import 风险 |
|---|---|---|---|
| admin.py | MeResponse:32、RecycleBinProjectResponse:52、BatchDeleteRequest:84、BatchCopyRequest:196、BatchMoveRequest:224、CleanupRuleAge:269、CleanupRuleSize:275、CleanupPolicyUpdateRequest:281、CleanupPolicyResponse:288、CleanupPreviewItem:293、UserCreateRequest:397、UserRenameRequest:402、UserPasswordResetRequest:406、UserResponse:410、UserListItem:417 | 新 `schemas/admin.py`（batch 两模型可并 schemas/__init__） | 无测试从该模块 import 模型（仅 patch `src.routers.admin.get_config` / `ProjectCloneService.clone`，不受影响） |
| projects.py | ProjectProfileMetadata:34；BatchDeleteRequest:376 | schemas/project.py；共享 | **main.py:469 `from src.routers.projects import ImportError as ProjectImportError`**（异常类非 BaseModel，:60-67；搬走须同步 main.py） |
| import_template.py | TemplateFormItem:38、TemplateProjectItem:44、ImportPreviewResponse:51、ImportExecuteRequest:55、ImportExecuteResponse:61、TemplateFieldOptionPreview:70、TemplateFieldDefinitionPreview:76、TemplateFieldPreview:89、TemplateFormFieldsResponse:112 | 新 `schemas/template_import.py` | **tests/test_import_service.py:1815 `from src.routers.import_template import ImportExecuteRequest, execute_import` 会破**（测试需同步改）；template_fields.py:12 import 的是 `_compatibility_error` 非模型 |
| fields.py | ReorderRequest:416 | schemas/field.py | 无 |
| visits.py | VisitFormSequenceUpdate:40 | schemas/visit.py | 无 |
| codelists.py / units.py / forms.py | 无内联 BaseModel | — | — |

## 7. 可选项（仅事实）

**(a) 9 个重排端点请求形状**（PRD 称「查询参数」不准确——8 个均为**裸 JSON 数组体** `id_list: List[int]`）：
1. `POST /api/projects/reorder`（projects.py:232）body `[ids]`，204
2. visits.py:185、3. forms.py:239、4. fields.py:291、6. codelists.py:343、7. codelists.py:335、8. units.py:258 —— body `[ids]`，返回 `{"message": "Reordered"}`
5. `POST /forms/{fid}/fields/reorder`（fields.py:424）body `{"ordered_ids": [...]}`（ReorderRequest），204
9. `POST /visits/{vid}/forms/reorder`（visits.py:392）body `[ids]`，204；自带校验（空/重复/不完整→400）且把 form_id 映射为 visit_form id 后才调 `reorder_batch_sequence`

**(b) main.py:456-462 全局 `value_error_handler`**：任何未处理 `ValueError` → `400 {"detail": str(exc)}`。依赖它的路径：OrderService 各 `raise ValueError("Invalid position…")` / 重排校验三类消息（经端点冒泡成 400）；`fields.py` FormField 越界等。收窄会改变这些端点的错误形状。

**(c) 脱敏函数**：`utils.mask_secret`（utils.py:100-116）——空→""；`len<=4`→全 `*`；否则 `*`*(n-4)+后4。调用：routers/settings.py:19,144,178,219,242（:178/:242 用「回显==脱敏值」判断未改密，格式不能变）；tests/test_settings_ai_test.py:9,56。`ai_review_service._mask_api_key`（:152-157）——空→""；`len<=4`→`key+"***"`（短密钥原样泄露的瑕疵）；否则前4+`***`。调用仅日志两行：:553、:631。

## 8. 风险 / 与 PRD 的出入

1. **PRD 少算一块**：`_migrate_add_order_index` 实为 **6** 个回填块（多了 visit/sequence，:464-494）；McCabe 实测 ≈29（PRD 28）。design 须决定第六块是否同收。
2. **PRD 措辞偏差**：8 个重排端点是裸数组**请求体**，不是查询参数；R7(a) 统一仍是 API 契约变化。
3. **符号不对称是故意的**：reorder/compact 两对仅位移符号不同（order 版向下、sequence 版向上）。最终状态等价，但「逐字保持」要求合并后保符号；visit/visit_form 的 sequence 列**没有唯一索引**（唯一索引只建在 5 张 order_index 表上，database.py:500-508），方向差异不影响约束，仅影响中间态。
4. **`move_to` vs `move_to_sequence` 算法不同**（泊 0 法 vs min/max 位移法），不能合并方法体，只能共享 WHERE/表达式助手。
5. **init 自愈差异**：order 族三方法先 `_ensure_initialized`（partial-NULL 回填），sequence 族刻意不做——参数化时必须保留，否则 sequence 端点获得新行为。
6. **min_length=1 冲突点**：`test_batch_delete_isolation.py:57`（空→204）与 projects.py:388 的显式空 no-op；admin 端点对缺 id 是 400（语义本就不同）。前端已证不发空列表（§1），422 化对 UI 安全；但 projects 批删是前端孤儿端点，空列表语义改动只影响 API 调用方/测试。
7. **字段名统一牵连**：改 admin 三兄弟模型键名须同步 AdminView.vue:257/272/292；改 projects.py:380 为 `ids` 无前端成本；13 个子资源端点继续用 `ids`。任何统一方案都有一侧要动前端或保留双键，须 design 定。
8. **搬模型会破坏导入**：test_import_service.py:1815（ImportExecuteRequest）、main.py:469（ImportError）。测试同步改属允许范围，但须在 implement 列出。
9. **`_heal_reserved_admin_account` 零测试即搬移高风险**：生产多用户服务器在跑（memory），PRD R4 要求先写特征测试——确认必要。
10. **命名陷阱**：projects.py 的 `ImportError` 遮蔽内建；抽公共导入错误助手时不能再用 `ImportError` 之名。
11. **兄弟任务漂移**：legacy-cleanup 删 perf 包装（order_service.py:17、projects.py 等的 import 会变）、backend-format 折叠全部双空行（database.py 1431 行、order_service.py 848 行会大幅缩短）——本文所有行号仅 HEAD a4431b0 有效。
