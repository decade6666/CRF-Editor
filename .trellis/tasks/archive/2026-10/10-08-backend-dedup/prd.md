# 后端路由与迁移代码去重

## Goal

- 收拢后端重复实现：批量删除请求模型、复制改名循环、导入错误转换、迁移回填块、排序平行方法。
- 只动重复实现的形态，不改对外行为；两处批量删除接口补上缺失的数量上限，这一行为变化必须显式声明。
- 内联模型顺手迁移：只迁本任务触碰过的路由文件，不做全仓库大迁移。

## Background（证据核实于 2026-10-08）

- `BatchDeleteRequest` 定义了 3 份（已核实）：`backend/src/routers/admin.py:84` 与 `backend/src/routers/projects.py:376` 均为 `project_ids: List[int]`，**无**数量上限；`backend/src/schemas/__init__.py:7` 为 `ids: List[int] = Field(..., min_length=1, max_length=500)`，**有** 1-500 上限。注意：共享版的字段名是 `ids`，两个路由版是 `project_ids`——统一时需决定统一字段名（涉及请求体 JSON 键名，属行为变化，须在 design 阶段定并同步前端调用点）。
- 复制改名"梯子"（copy-then-rename 命名循环）多处重复（已核实锚点，完整清单执行时枚举）：路由层 `codelists.py:33-40`（`_build_codelist_copy_name`，`_copy` 后缀 + 数字）、`fields.py:463-471`、`forms.py:258-262`、`visits.py:205`（均"`_copy` 后缀冲突追加数字"）、`admin.py:197` `batch_copy_projects` 待核；服务层 `project_clone_service.py:149-162`（`_resolve_copy_name`，"原名 (副本)" → "(副本2)" 阶梯）、`import_service.py:448` `_make_unique_name`（`_导入` 后缀）、`:460`、`:507`、`:519`（`_make_unique_import_codelist_name` / `_make_unique_var` / `_make_unique_code`）。各处后缀约定不同（`_copy` / `(副本)` / `_导入` / `_IMP`），公共助手必须把后缀作为参数，不能强行统一后缀。
- 导入错误转 HTTP 映射重复（已核实）：`backend/src/routers/import_template.py` 三个端点各贴一份 `FileNotFoundError → 404`、`ValueError` 含"模板库不兼容"→ 结构化 JSON（`TEMPLATE_INCOMPATIBLE`，`:31`）、其余 `ValueError → 400` 的转换（约 `:132-143`、`:161-173`、`:193-206`）。`projects.py:70-76` 另有 `_IMPORT_ERROR_CODES` 风格映射。至少收拢 import_template.py 的三份；是否把 projects/import_docx 的映射也纳入由 design 决定。
- `database.py` 迁移函数（已核实）：`backend/src/database.py:264` `_migrate_add_order_index` 对 `unit`、`field_definition`、`form`、`codelist`、`codelist_option` 五张表各贴一段同构回填块（读函数体已确认同构，复杂度约 28）；`backend/src/database.py:816` `_heal_reserved_admin_account` 把管理员账号修复业务逻辑混在迁移代码中。
- 排序平行方法（已核实）：`backend/src/services/order_service.py` 6 个 `*_sequence` 方法——`:547` `get_next_sequence`、`:559` `insert_at_sequence`、`:607` `move_to_sequence`、`:683` `delete_and_compact_sequence`、`:723` `reorder_batch_sequence`、`:819` `compact_after_batch_delete_sequence`。方法体内存在按模型/列重复的分支逻辑（审查结论：改为把列名作为参数传入）；重构时必须保持与前端 `useOrderableList.js` / `useSortableTable.js` 的排序契约不变（根 `.claude/CLAUDE.md` Ordering contract）。
- 内联 Pydantic 模型规模（已核实）：`backend/src/routers/` 共 51 个 `class ...(BaseModel)` 直接定义在路由文件里。只迁本任务触碰的文件。
- 可选项（design 阶段决定，需用户确认）：
  - (a) 9 个排序端点中，`fields.py:426` `reorder_form_fields` 用请求体 `ReorderRequest`，其余 8 个用查询参数 `id_list: List[int]`（已核实）。统一属于 API 契约变化，需要前端同步。
  - (b) `backend/main.py:452-454` 的全局 `ValueError → 400` 处理器，可能把内部错误伪装成用户输入错误（审查已核实存在该风险）。收窄还是保留，由 design 论证。
  - (c) 两个密钥脱敏函数，从 `legacy-cleanup` 移来，2026-10-08 已核实：
    - `utils.mask_secret` 只露后 4 位，其余换成等长的 `*`。它的输出返回给前端，保存时又用来比对、判断「密钥没改」（`routers/settings.py:144/178/219/242`），所以**格式不能改**。
    - `ai_review_service.py:152` `_mask_api_key` 只露前 4 位加 `***`，只用在两行日志里（`:553`、`:631`）。它有一个小瑕疵：密钥不超过 4 位时会原样输出。真实密钥不会这么短，影响很小。
    - 两个选择：维持现状（可顺手修掉 ≤4 位原样输出的瑕疵），或让日志改用 `mask_secret`。后者会改变日志格式，并暴露密钥长度。

## Requirements

- R1：`BatchDeleteRequest` 收敛为 `backend/src/schemas/` 一份带 `min_length=1, max_length=500` 上限的定义；两个路由端点改用共享模型。显式声明行为变化：批量删除接口获得 1-500 条数校验（超界 422/400）；字段名统一方案（`ids` 或 `project_ids`）在 design 定，并同步前端调用处。既有测试冲突需在 design 中显式决策并记录：`tests/test_batch_delete_isolation.py:57-66` 的 `test_batch_delete_empty_list_is_noop` 锁定「空列表 → 204 且不删除」，加 `min_length=1` 后空列表变 422。二选一：(a) 接受 422 并改写该测试，前提是确认前端从不发空列表（`AdminView.vue:292` 以 `{ project_ids }` 提交管理员批量删除）；(b) 保留空列表 no-op 语义。
- R2：复制改名梯子抽成一个参数化助手（后缀、查询模型/字段可配置），替换已核实的路由层与服务层重复实现；各处后缀约定与生成结果保持逐字不变（含"原名 (副本)"这类中文阶梯）。
- R3：导入错误转换抽成一个函数（输入异常，输出 `HTTPException` 或结构化 JSON），替换 `import_template.py` 的三份粘贴；`TEMPLATE_INCOMPATIBLE` 的 JSON 形状不变。
- R4：`_migrate_add_order_index` 的五段回填块抽成两个小助手（如"按分组回填空序号"+“单表执行”），迁移语义与幂等性完全不变；`_heal_reserved_admin_account` 的业务修复逻辑移出迁移代码（移到服务层或独立模块），`init_db` 的调用语义不变。现状该函数没有任何测试覆盖（`tests/conftest.py:84` 在测试中 patch 掉了 `main.init_db`；`tests/test_user_admin.py:247` 的「空白保留用户名可登录」走的是 `routers/auth.py:71-74` 的 `TRIM` 登录回退，与该函数无关；`tests/helpers.py` 只用 `is_reserved_admin_username` 做播种判定，均不触发修复路径）。搬移前先写特征测试（characterization test，锁定现有行为的测试）覆盖其分支：提升 `is_admin`、production 缺管理员时用 `bootstrap_password` 创建、production 修复不可用密码哈希并升 `auth_version`。
- R5：`order_service.py` 六个 `*_sequence` 方法按列名参数化合并，删除方法体内重复分支；`visits/forms/fields/codelists/units` 各排序端点的行为与响应不变。
- R6：本任务触碰的路由文件中，内联 Pydantic 请求/响应模型迁移到 `backend/src/schemas/` 对应模块；未触碰文件不动。
- R7：可选项 (a)(b)(c) 如决定实施，先向用户确认；默认不做。(c) 无论选哪种，`mask_secret` 的输出格式都不变。
- R8：测试：每项收敛补行为测试（批量删除 0 条/超 500 条被拒；改名梯子冲突场景；导入错误映射三类输出；迁移幂等——连续两次 `init_db` 结果一致；排序端点回归；`_heal_reserved_admin_account` 搬移前的特征测试，见 R4）。

## Acceptance Criteria

- [ ] AC1（对应 R1）：仓库内 `BatchDeleteRequest` 只有一份定义；两个端点对 0 条与 501 条请求返回校验错误；正常批量删除回归通过；前端调用同步完成。
- [ ] AC2（对应 R2）：改名梯子助手唯一；各复制端点生成的名称阶梯与改造前逐字一致（有对比测试）。
- [ ] AC3（对应 R3）：`import_template.py` 三个端点的错误转换走同一函数；模板不兼容仍返回 `TEMPLATE_INCOMPATIBLE` 结构化 JSON。
- [ ] AC4（对应 R4）：`_migrate_add_order_index` 复杂度显著下降（目标圈复杂度 <= 10，即分支数指标）；对旧库样本连续跑两次 `init_db` 幂等；管理员修复逻辑移出后，现有迁移测试（`test_label_variable_name_migration.py`、`test_codelist_option_migration.py`、`test_date_format_migration.py`、`test_phase0_ordering_contracts.py`）与 R4 新增特征测试通过。
- [ ] AC5（对应 R5）：`order_service.py` 平行方法合并；全部排序相关测试（含与前端 `useOrderableList.js`/`useSortableTable.js` 的契约测试）通过。
- [ ] AC6（对应 R6/R7）：模型迁移仅限触碰文件；可选项未做（或已获用户确认并记录）。
- [ ] AC7（回归门禁）：后端全量测试（父任务执行手册 §3 的命令，在任务 worktree 内运行）无新增失败。
- [ ] AC8（文档同步）：若 schemas/ 路由结构描述或排序契约描述受影响，同步 `backend/.claude/CLAUDE.md` 与 `.trellis/spec/guides/cross-stack-contracts.md`。

## Out of Scope

- 不做全仓库内联模型大迁移（只迁触碰文件）。
- 不改任何排序端点的 API 形状（除非 R7 获批）、不改"先探测再迁移"机制本身。
- 不合并不同用途的数据库会话类型、不引入 Alembic/版本表。
- 全局非目标：不做重写 / 换技术栈 / 微服务 / TypeScript 迁移；不做通用 CRUD 列表组件；不做大范围"防御性代码"清理；不重写 Word 导入解析器；不引入 Redis/Celery。

## Dependencies and Order

- 前置：`backend-format` 已合入（避免与格式化提交冲突）。
- Wave D 收尾任务（`legacy-cleanup` → `backend-format` → `export-layer-cleanup` → `backend-dedup` 的最后一环），与 `export-layer-cleanup` 串行执行。
- 与前端 Wave E 任务无文件冲突，可并行（除非 R7(a) 获批需同步前端）。
- 一个任务 = 一个 worktree + 一个分支，检查通过后本地合入 `main`。

## Before Starting

这是范围文档。开工前必须基于当时最新的 main 补写 design.md 和 implement.md（Trellis 对复杂任务的要求），并重新核实上面的行号。执行流程见父任务 `implement.md`（公共执行手册）。
