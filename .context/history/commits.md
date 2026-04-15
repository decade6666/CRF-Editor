# Commit History

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
