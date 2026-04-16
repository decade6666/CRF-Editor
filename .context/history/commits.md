# Commit History

## fix(designer): 收口自动保存与字典新增提交流程

- **ID**: 238ceb03-4ec5-4438-b8a7-4b94d7b959dc
- **Branch**: draft
- **Timestamp**: 2026-04-15T23:41:49.291178+08:00

**Decisions:**
- 为字段属性自动保存补充失败分类，仅对网络异常、超时、429 与 5xx 保留重试，其它确定性错误不再无限重试。
- 将项目切换前的自动保存 guard 提升到 App.vue，通过 FormDesignerTab 暴露 canLeaveProject 阻止父层切到新项目后再丢失旧草稿。
- 扩展 codelist 创建接口支持一次性提交 options，使前端新增字典改为单请求原子创建并补齐回滚测试。
- ## 2026-03-23T13:36:01.9886236+08:00
- **Decision**: 分析 `fastadmin-migration-claude-md` 时，优先以当前仓库真实领域模型为基线，再叠加 FastAdmin 官方仓库已验证的控制器、模型、JS 模块和 CRUD 约定；新 `CLAUDE.md` 必须明确区分“框架通用约定”和“CRF-Editor 领域特有规则”。
- **Alternatives**: 1. 仅按 proposal 的映射表重写文档；2. 只写 FastAdmin 通用栈说明，不回填当前项目的领域对象、特殊字段和非 CRUD 模块。
- **Reason**: 该变更是纯文档重写，没有代码可作为后续迁移的真实参照；如果只保留 FastAdmin 通用术语，容易丢失现有领域知识，如 `field_definition`/`form_field` 双层模型、`visit_form` 排序关系、日志行、导入导出和 AI 复核等。先以现有模型校正，再用官方仓库样例验证 `Backend` 控制器、RequireJS 模块、时间戳和 `weigh` 约定，能降低文档误导后续 AI 的概率。
- **Risk**: 若文档没有显式标注哪些模块适合 CRUD 生成、哪些必须手写，后续 AI 很可能把复杂关系和自定义流程错误地压平为标准增删改查；另外，若只映射表名而不映射唯一约束、空值规则和排序语义，迁移阶段会出现结构正确但行为错误的问题。
- ## 2026-03-31T14:08:12.6589726+08:00
- **Decision**: 在 `backend/src/services/export_service.py` 中新增 `_add_cover_para()`，并按目标版式彻底重写 `_add_cover_page()`；同时只在 `_apply_document_style`、`_add_log_row`、`_add_label_row`、`_add_field_row`、`_render_field_control` 这些指定方法做定点格式修正，不碰 `_validate_output`、`_add_inline_table` 和数据模型。
- **Alternatives**: 1. 继续复用现有封面表格渲染并只改文案；2. 通过调整 `_apply_cover_page_table_style()` 或公共段落样式去间接逼近目标格式；3. 顺手清理 `export_service.py` 里其它已存在的未提交差异。
- **Reason**: 本次需求对封面顺序、字号、空行、3x2 信息表内容和时间占位格式都有精确约束，继续在旧封面结构上打补丁会把“标题在表格中”和“版本信息在表格中”的旧语义残留住。新增一个很小的封面段落 helper 后，既能最小范围复用字体设置，又能把封面内容从表格中剥离到顶层段落，和测试新断言保持一致；其余只改指定方法，能避免把当前工作区里其他未完成改动卷进这次修复。
- **Risk**: 封面改成“段落 + 表格”后，依赖旧封面单元格坐标的外部脚本如果存在，可能需要同步更新；另外 `FormLabel` 样式仍只在样式不存在时创建，若未来改成基于模板文档导出且模板已预置同名样式，则可能需要再补一个“已存在样式时也强制覆写”的分支。
- ## 2026-04-02T11:38:53.6651422+08:00
- **Decision**: 分析 `admin-and-ui-ordering-enhancements` 时，后端建议采用“弱管理员后端门禁 + 独立项目导入/整库合并服务 + 完整项目树复制服务 + 复用现有 OrderService”的分层实现，不把新能力继续塞进现有 `settings`/`import_template` 单一路由，也不接受仅前端隐藏入口而后端不校验的做法。
- **Alternatives**: 1. 仅在前端按 `admin_username` 控制入口显示，后端接口不做任何管理员校验；2. 将单项目导入、整库合并、项目复制都塞进 `settings` 或 `import_template` 现有职责；3. 用“替换整库”代替“整库合并”，绕开冲突处理。
- **Reason**: 当前仓库已经有 `OrderService`、按 owner 隔离的项目模型和模板导入服务，但管理员、项目复制、整库合并都没有现成 API；同时 `settings` 路由当前未鉴权，`/api/auth/enter` 又允许任意用户名自动建号。如果继续沿用“只在前端控入口”的模式，高影响接口会变成显式可绕过的假门禁。将管理员判断至少落到后端依赖中，且把单项目导入、整库合并、项目复制拆成独立服务，才能把 owner 重绑、唯一键冲突、外键重映射和事务边界收束在可测试的后端层。
- **Risk**: 该方案仍不是强安全模型，因为知道 `admin_username` 的人仍可登录伪装管理员；另外整库合并和项目树复制都需要大事务与全量映射，若冲突策略、logo/文件资源处理和 token 失效规则不先定稿，实现阶段容易出现脏数据或行为不一致。

**Bugs Fixed:**
- Symptom: 表单设计器属性编辑改为自动保存后，确定性错误会反复重试、关闭设计器/切项目时草稿可能丢失； Root Cause: 前端错误未保留 HTTP 状态，自动保存状态机缺少关闭/切项目前的 guard，父层项目切换也未等待子组件 flush 完成； Fix: 在 useApi 中保留 status，按错误类型分流重试，并让 App.vue 在切项目之前先通过 FormDesignerTab 的 canLeaveProject guard。
- Symptom: 新增选项字典仍需先建字典再逐条建选项，失败时会留下半成品； Root Cause: 创建接口只支持字典本体，前端只能走多次 POST； Fix: 扩展后端 codelist 创建 schema 与路由，支持一次性创建 options，并为冲突场景补原子性测试。

**Files**: backend/src/routers/codelists.py, backend/src/schemas/codelist.py, backend/tests/test_codelists_router.py, frontend/src/App.vue, frontend/src/components/FormDesignerTab.vue, frontend/src/composables/useApi.js, frontend/tests/quickEditBehavior.test.js

**Tests**: pytest backend/tests/test_codelists_router.py — 3 passed；node --test frontend/tests/quickEditBehavior.test.js — 20 passed

---
## test(auth): 覆盖 token 过期时间配置回归

- **ID**: ce6c6593-3132-4e72-8634-aa46edb64c7a
- **Branch**: draft
- **Timestamp**: 2026-04-15T17:37:40.814765+08:00

**Decisions:**
- 在认证测试中直接 patch get_config，验证 create_access_token 会读取 access_token_expire_minutes 配置而不是写死默认值。
- 在配置测试中补充 auth.access_token_expire_minutes 的显式覆盖与默认回退断言，锁定配置层与令牌生成层的一致性。

**Files**: backend/tests/test_auth.py, backend/tests/test_config.py

**Tests**: 新增 pytest 用例 test_create_access_token_uses_configured_expire_minutes、test_yaml_auth_expire_minutes_overrides_model_default、test_missing_auth_expire_minutes_falls_back_to_auth_default（本次未执行）

---

## fix(ui): 收紧字典操作按钮占位

- **ID**: 62ee38c1-8817-4ad4-9f54-ff5b4c264602
- **Branch**: draft
- **Timestamp**: 2026-04-15T17:37:07.685750+08:00

**Decisions:**
- 将字段属性面板中的“新增字典/编辑字典”改为带 aria-label 和 title 的圆形图标按钮，减少窄宽度下的横向占位。
- 同步更新 quickEditBehavior 结构测试，约束按钮图标、无障碍标签和紧凑样式类。

**Bugs Fixed:**
- Symptom: 字段属性面板的字典操作按钮占位过大，挤压下拉框可用宽度； Root Cause: 两个文本按钮与默认间距在窄面板中横向空间开销过高； Fix: 换成紧凑图标按钮并保留可访问标签。

**Files**: frontend/src/components/FormDesignerTab.vue, frontend/tests/quickEditBehavior.test.js

**Tests**: 更新 node 结构测试 quickEditBehavior.test.js 覆盖图标按钮与 aria/title 约束（本次未执行）

---

## fix(ui): 调整设置页操作区布局与暗色样式

- **ID**: cbef1010-8b65-4772-ab12-cbfea3f911cd
- **Branch**: draft
- **Timestamp**: 2026-04-15T17:34:41.476805+08:00

**Decisions:**
- 为主内容标签页和设置页导入导出操作区补充独立 class，避免继续依赖内联样式导致窄宽度布局难以复用和测试。
- 增强深色主题下按钮背景与边框对比度，避免浅透明样式在暗色模式中难以识别。
- 补充 appSettingsShell 结构测试，锁定设置页操作按钮布局和 tabs 样式钩子。

**Bugs Fixed:**
- Symptom: 设置页导入导出按钮在当前布局下宽度和排列不稳定，暗色主题按钮边界也偏弱； Root Cause: 关键布局仍写在内联样式中，且暗色按钮样式透明度过高； Fix: 提取可测试的样式钩子并提高暗色模式按钮背景与边框对比度。

**Files**: frontend/src/App.vue, frontend/src/styles/main.css, frontend/tests/appSettingsShell.test.js

**Tests**: 新增 node 结构测试 appSettingsShell.test.js 覆盖设置页布局钩子（本次未执行）

---

## feat(designer): 增强字典快编与字段属性编辑

- **ID**: 2d425e3b-2b3f-409c-8e6f-7889d14debea
- **Branch**: draft
- **Timestamp**: 2026-04-15T17:32:17.913443+08:00

**Decisions:**
- 为字典快编新增 /snapshot 原子保存接口，前端改为一次性提交名称、说明与选项，避免逐项增删改造成部分成功和说明丢失。
- 将字段类型切换时的属性清理和 HEX 颜色规范化提取到 formDesignerPropertyEditor.js，恢复数值/日期/单位/默认值等类型相关编辑能力。
- 在字段列表增加 inline_mark 快捷切换，并补充前后端测试覆盖字典快照原子性、属性同步和界面约束。

**Files**: backend/src/routers/codelists.py, backend/src/schemas/codelist.py, backend/tests/test_codelists_router.py, frontend/src/components/FormDesignerTab.vue, frontend/src/composables/formDesignerPropertyEditor.js, frontend/tests/quickEditBehavior.test.js, frontend/tests/formDesignerPropertyEditor.runtime.test.js

**Tests**: 新增 pytest 用例：test_replace_codelist_snapshot_preserves_description_and_replaces_options、test_replace_codelist_snapshot_is_atomic_when_new_option_conflicts（本次未执行）；新增 node 结构/运行时测试：quickEditBehavior.test.js、formDesignerPropertyEditor.runtime.test.js（本次未执行）

---

## fix(config): 统一默认端口为 8888

- **ID**: 92e72f5e-4d82-4004-9165-84d27747b07a
- **Branch**: draft
- **Timestamp**: 2026-04-08T13:37:54.376889+08:00

**Decisions:**
- 将 ServerConfig.port 默认值从 8000 调整为 8888，使未显式配置端口时的后端启动行为与当前预期一致
- 同步更新 Vite /api 开发代理目标与中英文 README，避免开发入口、文档说明与实际默认端口出现漂移
- 新增后端配置回退测试与前端端口一致性文本测试，防止默认端口、代理目标和文档再次失配

**Bugs Fixed:**
- Symptom: 后端默认端口、前端开发代理和 README 中的访问说明仍混用 8000，导致默认启动与文档/开发环境配置不一致; Root Cause: 默认端口调整后，配置源、Vite 代理和中英文文档没有被统一更新，也缺少针对该契约的回归测试; Fix: 将 backend/src/config.py、frontend/vite.config.js、README.md 和 README.en.md 全部统一到 8888，并补充后端与前端回归测试

**Files**: README.en.md, README.md, backend/src/config.py, backend/tests/test_config.py, frontend/tests/portDefaults.test.js, frontend/vite.config.js

**Tests**: pytest backend/tests/test_config.py — 2 passed；node --test frontend/tests/portDefaults.test.js — 4 passed

---

## feat(core): 完善导出权限、拖拽排序与设置体验

- **ID**: daad292b-f965-4dcd-87c0-b39edd2f9572
- **Branch**: draft
- **Timestamp**: 2026-04-07T19:27:36.9765933+08:00

**Decisions:**
- 新增当前用户项目数据库导出接口，导出结果仅保留本人项目并清空 user 表与 owner_id，避免普通用户触达整库导出能力
- 项目排序、用户项目计数与删除校验统一排除已删除项目，并为访视表单补充完整列表重排接口以保持稠密 sequence
- 设置面板按角色拆分数据导出与全局配置，统一退出登录、记住用户名、导入改名反馈和拖拽排序交互
- 管理端 API 调用统一收敛到 /api/admin 前缀，并调整主题主色为更柔和的蓝色系以改善界面观感

**Files**: backend/src/repositories/project_repository.py, backend/src/routers/export.py, backend/src/routers/visits.py, backend/src/services/export_service.py, backend/src/services/order_service.py, backend/src/services/user_admin_service.py, backend/tests/test_export_validation.py, backend/tests/test_permission_guards.py, backend/tests/test_phase0_ordering_contracts.py, backend/tests/test_user_admin.py, frontend/src/App.vue, frontend/src/components/AdminView.vue, frontend/src/components/CodelistsTab.vue, frontend/src/components/LoginView.vue, frontend/src/components/UnitsTab.vue, frontend/src/components/VisitsTab.vue, frontend/src/styles/main.css, frontend/tests/adminViewStructure.test.js, frontend/tests/appSettingsShell.test.js, frontend/tests/importRenameFeedback.test.js, frontend/tests/orderingStructure.test.js, frontend/tests/themePalette.test.js

**Tests**: test_export_user_projects_database_prunes_to_owner_scope；test_authenticated_user_can_export_owned_projects_database；test_reorder_projects_uses_active_scope_only；test_reorder_visit_forms_persists_dense_sequence_in_readback；test_deleted_projects_do_not_block_user_count_or_deletion；frontend structure tests: adminViewStructure/appSettingsShell/importRenameFeedback/orderingStructure/themePalette

---

## refactor(export): 简化 Word 导出为直接下载并新增数据库导出功能

- **ID**: fb7c3e8a-1d2f-4a9c-b5e6-7f8g9h0i1j2k
- **Branch**: draft
- **Timestamp**: 2026-04-02T10:14:21+08:00

**Decisions:**
- 移除两阶段下载流程（prepare → download），改为 POST /export/word 直接返回 FileResponse + BackgroundTask 自动清理
- 删除内存缓存 _export_cache 及令牌机制，简化后端状态管理
- 新增 export_full_database() 与 export_project_database() 使用 sqlite3.backup() 安全复制运行中数据库
- 单项目导出执行 owner_id=NULL、DELETE FROM user、DELETE FROM project WHERE id!=? 裁剪逻辑
- 前端移除链接复制/有效期提示逻辑，简化导出按钮为单一操作
- 新增设置页数据管理分区：导出整个数据库、导出当前项目

**Files**: backend/src/routers/export.py, backend/src/services/export_service.py, backend/tests/test_export_validation.py, frontend/src/App.vue, frontend/src/composables/exportDownloadState.js, frontend/tests/exportDownloadState.test.js

**Tests**: test_export_word_returns_docx_file — 验证直接返回文件流；test_export_full_database_returns_valid_sqlite — 验证整库导出可用；test_export_project_database_prunes_correctly — 验证单项目裁剪完整性

---
