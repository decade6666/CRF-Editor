# Commit History

## fix(config): 统一默认端口为 8888

- **ID**: 92e72f5e-4d82-4004-9165-84d27747b07a
- **Branch**: draft
- **Timestamp**: 2026-04-08T13:37:54.376889+08:00

**Decisions:**
- 将 `ServerConfig.port` 默认值从 `8000` 调整为 `8888`，使未显式配置端口时的后端启动行为与当前预期一致
- 同步更新 Vite `/api` 开发代理目标与中英文 README，避免开发入口、文档说明与实际默认端口出现漂移
- 新增后端配置回退测试与前端端口一致性文本测试，防止默认端口、代理目标和文档再次失配

**Bugs Fixed:**
- **Symptom**: 后端默认端口、前端开发代理和 README 中的访问说明仍混用 `8000`，导致默认启动与文档/开发环境配置不一致
  - **Root Cause**: 默认端口调整后，配置源、Vite 代理和中英文文档没有被统一更新，也缺少针对该契约的回归测试
  - **Fix**: 将 `backend/src/config.py`、`frontend/vite.config.js`、`README.md` 和 `README.en.md` 全部统一到 `8888`，并补充后端与前端回归测试

**Files**: README.en.md, README.md, backend/src/config.py, backend/tests/test_config.py, frontend/tests/portDefaults.test.js, frontend/vite.config.js

**Tests**: pytest backend/tests/test_config.py（2 passed）；node --test frontend/tests/portDefaults.test.js（4 passed）

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

**Tests**: test_export_user_projects_database_prunes_to_owner_scope；test_authenticated_user_can_export_owned_projects_database；test_reorder_projects_uses_active_scope_only；test_reorder_visit_forms_persists_dense_sequence_in_readback；test_deleted_projects_do_not_block_user_count_or_deletion；adminViewStructure/appSettingsShell/importRenameFeedback/orderingStructure/themePalette 结构测试

---

## feat(export): 增强导出下载体验与表单预览布局

- **ID**: dcf9ceae-32d7-4075-006f-a98b5a2d3eb5
- **Branch**: draft
- **Timestamp**: 2026-04-01T08:52:00

**Decisions:**
- 导出令牌有效期从 5 分钟延长至 30 分钟，改善用户体验
- 下载链接绑定用户 ID 实现隔离保护，避免跨用户访问
- 前端新增独立模块 exportDownloadState.js 管理下载状态，保持单一职责
- 表单预览新增 unified 模式，支持混合字段横向布局
- 强制横向模式切换使用 localStorage 持久化用户偏好

**Files**: backend/src/routers/export.py, frontend/src/App.vue, frontend/src/components/FormDesignerTab.vue, frontend/src/components/VisitsTab.vue, frontend/src/components/ProjectInfoTab.vue, frontend/src/composables/exportDownloadState.js, frontend/src/styles/main.css

---

## fix(export): 为 unified 横向表格添加表级边框以修复 Word 不可见网格线问题

- **ID**: e82cfcd8-84fd-45a2-91f4-72b488196102
- **Branch**: draft
- **Timestamp**: 2026-04-01T08:46:17

**Decisions:**
- 在 _apply_grid_table_style() 中添加表级 tblBorders（含 insideH/insideV），确保 Word 能稳定渲染网格边框
- 参考已有的 _apply_cover_page_table_style() 实现模式，保持代码风格一致
- 表级边框与单元格级 tcBorders 双层保障，提升兼容性

**Bugs Fixed:**
- **Symptom**: unified landscape 表格导出后在 Word 中没有可见边框
  - **Root Cause**: _apply_grid_table_style() 只写入单元格级 w:tcBorders，缺少表级 w:tblBorders 中的 insideH/insideV 元素
  - **Fix**: 在遍历单元格前先为表格添加 tblBorders，包含 top/left/bottom/right/insideH/insideV

**Files**: backend/src/services/export_service.py, backend/tests/test_export_unified.py

**Tests**: test_export_unified_table_has_table_level_borders — 验证 tblBorders 含 insideH/insideV 且属性正确

---

## feat(import-lock): 实现导入锁定模式

- **ID**: 5b4b61b9-7773-4881-893c-21e78c9ec6b7
- **Branch**: Simplified-Version
- **Timestamp**: 2026-03-23T21:21:41

**Decisions:**
- Project.source 字段新增（manual/word_import/template_import），使用幂等迁移（inspect(engine) 检查列是否存在再 ALTER TABLE），避免重启崩溃
- 所有设计类路由（codelists/forms/units/fields）统一通过 _project_guard.py 守卫函数，source!=manual 返回 HTTP 403
- import_service.get_template_projects 改为列级 select(Project.id, Project.name, Project.version) 避免老模板 DB 缺 source 列时 ORM 崩溃
- 前端 App.vue 新增 isLocked = computed(source != manual)，锁定项目自动隐藏 codelists/units/fields/designer Tab，显示锁定 banner 和侧边栏锁图标
- 新增 13 个集成测试覆盖 10.1-10.9 测试用例，使用 StaticPool in-memory SQLite + FK 强制

**Files**: backend/src/database.py, backend/src/models/project.py, backend/src/schemas/project.py, backend/src/services/import_service.py, backend/src/routers/codelists.py, backend/src/routers/forms.py, backend/src/routers/units.py, frontend/src/App.vue, backend/tests/test_import_lock.py

**Tests**: backend/tests/test_import_lock.py — 13 个集成测试全部通过，覆盖锁定/解锁/跨项目/幂等迁移等场景

---

## fix(import-lock): 修复审查发现的三处安全/逻辑隐患

- **ID**: 0a19e0d8-26db-4274-8f24-9c4a1f9b575a
- **Branch**: Simplified-Version
- **Timestamp**: 2026-03-23T21:10:00

**Decisions:**
- batch_delete_form_fields 增加 form_id 过滤参数，防止攻击者通过手动项目端点越权删除锁定项目的表单字段
- ensure_project_design_writable_by_id 拆分 None 检查，project 不存在时抛 404 而非静默通过，修复下游操作可能在空对象上继续执行的隐患
- ensure_form_design_writable_by_form_id 同步增加 form 不存在时的 404 守卫
- import_docx 和 import_template 的 source 首次标记改为原子 sa_update WHERE source=manual，消除多 worker 并发 TOCTOU 竞争窗口

**Bugs Fixed:**
- **Symptom**: batch_delete_form_fields 可通过手动项目端点批量删除锁定项目字段
  - **Root Cause**: FormFieldRepository.batch_delete 按 ID 全局匹配删除，未检查 form_id 归属；guard 仅校验 URL form_id 所属项目，body 中的 field IDs 可来自任意项目
  - **Fix**: 增加 form_id Optional 参数，循环内先确认 form_field.form_id == form_id 再删除
- **Symptom**: 并发导入请求下 source 标记可能被覆盖或重复写入
  - **Root Cause**: ORM 先读 project.source 再赋值是两步操作，多 worker 下存在 TOCTOU 竞争
  - **Fix**: 改为 sa_update(Project).where(source=="manual").values(source=...) 单条原子 SQL UPDATE
- **Symptom**: ensure_project_design_writable_by_id 传入不存在的 project_id 时静默通过，下游继续操作
  - **Root Cause**: 原代码 if project and project.source != "manual" 在 project=None 时两个条件都不满足，不抛出任何异常
  - **Fix**: 拆分为独立 if project is None: raise HTTPException(404)

**Files**: backend/src/routers/_project_guard.py, backend/src/repositories/form_field_repository.py, backend/src/routers/fields.py, backend/src/routers/import_docx.py, backend/src/routers/import_template.py

---

## docs(readme): 补全近期新增功能描述并修正 config.yaml 路径

- **ID**: 6c3fb4f2-a6dd-4f89-88dd-5f6591e93874
- **Branch**: draft
- **Timestamp**: 2026-03-18T19:24:13

**Decisions:**
- config.yaml 正确路径为项目根目录，README.md 错记为 backend/config.yaml，README.en.md 错记为 backend/src/config.yaml，统一修正
- 访视表单预览、全局模糊搜索、暗色模式三项功能未在 README 中记录，中英文版本均补全
- 访视管理补充矩阵批量编辑描述，表单设计补充设计备注功能描述
- 项目结构图中 config.yaml 移至根级，删除 backend/ 下的误记条目

**Files**: README.md, README.en.md

---

## feat(ui): 新增访视表单预览弹窗并统一顶部图标按钮样式

- **ID**: 124d02dd-7219-430e-ba07-c1b1f05f5e3d
- **Branch**: draft
- **Timestamp**: 2026-03-18T19:11:43

**Decisions:**
- VisitsTab 复用 useCRFRenderer 的 renderCtrl/renderCtrlHtml 渲染访视面板表单预览，避免重复实现 HTML 拼接与 XSS 转义逻辑
- toRendererField() 适配器将 field_definition 结构映射到渲染器入参，最小化 VisitsTab 与 FormDesignerTab 的耦合
- previewRenderGroups computed 按 inline_mark 分组字段，与 FormDesignerTab 采用相同分组策略
- formPreviewRequestSeq 序列号防竞争，多次快速切换表单时自动丢弃过期响应
- previewNeedsLandscape computed：内联字段列数 > 4 时自动切换横向预览布局
- App.vue 顶部三按钮由 emoji 改用 el-icon 组件，新增 aria-label 属性改善无障碍
- 统一 header-icon-btn CSS 类替代三套独立按钮类，删除约 70 行冗余样式

**Files**: frontend/src/App.vue, frontend/src/components/VisitsTab.vue, frontend/src/styles/main.css

---

## feat(ui): 新增五个 Tab 模糊搜索框、访视批量编辑重命名及项目信息分组

- **ID**: 724ab9e0-ba4d-42bb-aace-b8ffe886b2c1
- **Branch**: draft
- **Timestamp**: 2026-03-18T11:30:00

**Decisions:**
- 5个Tab组件统一新增 el-input 模糊搜索框，放置于批量删除按钮之后
- draggable组件（UnitsTab、CodelistsTab右面板）使用 v-show 过滤而非数组 filter，保留拖拽DOM索引稳定性
- FieldsTab在已有 visibleFields computed 中叠加关键词搜索层，不新建重复计算属性
- VisitsTab将"预览"按钮重命名为"批量编辑"并同步更新弹窗标题为"访视表单矩阵批量编辑"
- ProjectInfoTab使用 el-divider 将表单拆分为"项目信息"与"封面页信息"两个分区
- 搜索逻辑采用 Object.values(item).some() 实现全字段模糊匹配，String(v ?? "") 防空处理

**Files**: frontend/src/components/CodelistsTab.vue, frontend/src/components/FieldsTab.vue, frontend/src/components/FormDesignerTab.vue, frontend/src/components/ProjectInfoTab.vue, frontend/src/components/UnitsTab.vue, frontend/src/components/VisitsTab.vue

---

## fix(ui): 修复三处界面缺陷——单位对齐、弹窗关闭及选项标签显示

- **ID**: 937513db-2e3d-4919-bffb-8dce8a12b256
- **Branch**: draft
- **Timestamp**: 2026-03-17T17:06:45

**Decisions:**
- 单位符号对齐：toHtml() 新增 aligned 步骤，用正则包裹 fill-line span 后的单位文字为 vertical-align:bottom span，与填写线底边对齐
- 弹窗关闭策略：统一为全部 14 处 el-dialog 添加 :close-on-click-modal=false，声明式配置无副作用
- trailing_underscore 显示分离：该字段仅用于 Word 导出，删除 Vue 模板中的条件渲染表达式

**Bugs Fixed:**
- **Symptom**: 带单位的文本字段，单位符号相对填写线偏上显示
  - **Root Cause**: .fill-line 为 display:inline-block 空 span，紧随其后的单位文本为普通 inline 流，基线对齐导致视觉上高于填写线底边
  - **Fix**: toHtml() 新增 aligned 步骤：</span> 后紧跟的空格+文字包裹为 <span style=vertical-align:bottom>
- **Symptom**: 点击弹窗遮罩层可直接关闭弹窗，导致用户误操作丢失填写内容
  - **Root Cause**: Element Plus el-dialog 默认 close-on-click-modal=true
  - **Fix**: 全局 14 处 el-dialog 添加 :close-on-click-modal=false（App×2, CodelistsTab×4, FormDesignerTab×6, UnitsTab×2, VisitsTab×4）
- **Symptom**: 选项列表中标签旁显示多余的下划线后缀字符
  - **Root Cause**: CodelistsTab.vue 模板中直接渲染 trailing_underscore 条件表达式
  - **Fix**: 删除该条件表达式，trailing_underscore 仅在 renderCtrl/Word 导出时生效

**Files**: frontend/src/App.vue, frontend/src/components/CodelistsTab.vue, frontend/src/components/FormDesignerTab.vue, frontend/src/components/UnitsTab.vue, frontend/src/components/VisitsTab.vue, frontend/src/composables/useCRFRenderer.js

---

## fix(form): 修复后加下划线未同步及填写线位置偏中两处缺陷

- **ID**: 8efd2bf8-1bc9-47a1-ad49-afc966845af1
- **Branch**: draft
- **Timestamp**: 2026-03-17T11:00:00

**Decisions:**
- quickSaveCodelist 保存字典选项后需同步失效 formFields 缓存并重新加载，避免预览区显示脏数据
- vertical-align 从 baseline 改为 bottom：空 inline-block 的 baseline=底部 margin 边，baseline 对齐导致 border-bottom 偏中，bottom 对齐行框底部为正确位置

**Bugs Fixed:**
- **Symptom**: 编辑字典选项的后加下划线后，Word 预览不更新、字段仍显示旧选项数据
  - **Root Cause**: quickSaveCodelist 只失效了 codelists 缓存，未失效 /api/forms/${formId}/fields；formFields 持有完整选项（含 trailing_underscore），预览依赖此数据
  - **Fix**: 在 loadCodelists 之后追加 api.invalidateCache formFields + await loadFormFields()，加 selectedForm 守卫
- **Symptom**: .fill-line 填写线显示在文字中央，类似短横线
  - **Root Cause**: vertical-align: baseline 使空 inline-block 以底部 margin 边对齐文本 baseline，致 border-bottom 出现在文字中段
  - **Fix**: 改为 vertical-align: bottom，使 border-bottom 贴合行框底部

**Files**: frontend/src/components/FormDesignerTab.vue, frontend/src/styles/main.css

---

## chore(config): migrate config.yaml to project root

- **ID**: ce409b03-d074-42ae-b5ae-a182ddea8fe4
- **Branch**: draft
- **Timestamp**: 2026-03-16T11:34:00

**Decisions:**
- Move config.yaml from backend/src/ to project root for unified config entry
- Update .gitignore rule from backend/src/config.yaml to /config.yaml
- Update config.py CONFIG_FILE path to parents[2]; fix db/upload relative paths to ./

**Files**: .gitignore, backend/config.yaml, backend/src/config.py

---

