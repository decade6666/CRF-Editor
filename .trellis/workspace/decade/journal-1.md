# Journal - decade (Part 1)

> AI development session journal
> Started: 2026-04-27

---

## 2026-04-28 — optimize dark mode and project list UI
- Continued Trellis task `optimize-dark-mode-project-list`.
- Read frontend Trellis guidelines before development.
- Implemented darker, low-saturation theme tokens and project-list width/ellipsis fixes.
- Preserved CRF preview rendering logic; preview-specific files were not modified.
- Validation: affected frontend tests pass, frontend eslint quiet pass, frontend build pass.
- Full frontend test suite still reports unrelated existing `FormDesignerTab.vue` source-text assertion failures in `formFieldPresentation.test.js`.



## Session 1: 优化暗色模式配色与项目列表 UI

**Date**: 2026-04-28
**Task**: 优化暗色模式配色与项目列表 UI
**Branch**: `draft`

### Summary

(Add summary)

### Main Changes

| 变更 | 说明 |
|------|------|
| 配色调整 | 色板从蓝靛色调转为柔和青灰色调，降低视觉疲劳 |
| 项目列表重构 | 拆分拖拽句柄与选择按钮，提升语义化与无障碍 |
| ARIA 属性 | 补充 aria-label/aria-hidden/aria-current |
| 测试适配 | 同步更新 6 个测试文件适配新 DOM 结构 |

**涉及文件**:
- `frontend/src/App.vue`
- `frontend/src/styles/main.css`
- `frontend/src/composables/usePerfBaseline.js`
- `frontend/tests/` (6 个测试文件)


### Git Commits

| Hash | Message |
|------|---------|
| `665d61e` | (see git log) |
| `583bbd8` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 2: 首次访问必须先验证登录态

**Date**: 2026-05-07
**Task**: 首次访问必须先验证登录态
**Branch**: `draft`

### Summary

(Add summary)

### Main Changes

| Area | Summary |
|------|---------|
| Auth startup | Added token validation before rendering the editor or admin workspace so invalid local sessions are cleared first. |
| Regression tests | Added app shell tests for auth waiting state, invalid token cleanup, and post-login routing. |
| Task metadata | Captured PRD for the login-before-editor requirement and archived the completed Trellis task. |

**Updated Files**:
- `frontend/src/App.vue`
- `frontend/tests/appSettingsShell.test.js`
- `.trellis/tasks/archive/2026-05/05-06-require-login-before-editor/`


### Git Commits

| Hash | Message |
|------|---------|
| `f68f803` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 3: 孤立项目自动入回收站 + restore 兼容 NULL owner_id

**Date**: 2026-05-07
**Task**: 孤立项目自动入回收站 + restore 兼容 NULL owner_id
**Branch**: `draft`

### Summary

将启动时孤立项目警告改为自动软删入回收站；restore_project 跳过 NULL owner_id 的名称冲突与排序重算；修正 datetime 写入格式与 ORM 一致避免回收站倒序错乱；新增 3 个 pytest 用例（含混合时间戳排序回归）；spec 沉淀 raw text() UPDATE 必须传 datetime 对象的规范。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `64f5ae8` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 4: 孤立项目入回收站 + 修复预存测试基线

**Date**: 2026-05-07
**Task**: 孤立项目入回收站 + 修复预存测试基线
**Branch**: `draft`

### Summary

(Add summary)

### Main Changes

| 主题 | 说明 |
|------|------|
| 启动迁移 | `_warn_orphan_projects` → `_move_orphan_projects_to_recycle_bin`，启动时把 `owner_id IS NULL` 活跃项目软删入回收站，告警降为 INFO。 |
| 恢复路径 | `restore_project` 对孤立项目跳过同名冲突检查与 order_index 重排，恢复后保持 `owner_id=NULL`（仅管理员可见）。 |
| 时间戳一致性 | 启动迁移与原生 `text()` UPDATE 改用 `datetime` 对象写入，避免与 ORM ISO 字符串混排导致回收站倒序错乱。 |
| 测试基线 | 后端全量测试 27 failed → 0 failed（4 xfailed）：移除 `projects.py` 同步函数 `_save_bytes_to_temp` 的误 `await`（22 条转绿）；修正 `test_perf_harness` 路径断言；`unified_landscape` 死代码 4 条断言改 xfail 并引用 786aaa4。 |
| 规范沉淀 | `.trellis/spec/backend/database-guidelines.md` 新增「raw text() UPDATE 必须传 datetime 对象」条目。 |

**Updated Files**:
- `backend/src/database.py`
- `backend/src/routers/admin.py`
- `backend/src/routers/projects.py`
- `backend/tests/test_admin_project_ops.py`
- `backend/tests/test_perf_harness.py`
- `backend/tests/test_export_unified.py`
- `backend/tests/test_export_column_width_override.py`
- `.trellis/spec/backend/database-guidelines.md`


### Git Commits

| Hash | Message |
|------|---------|
| `64f5ae8` | (see git log) |
| `7cef80a` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 5: Word导入去AI预览、Step3摘要、字典名同步、按钮文案、Logo重置

**Date**: 2026-05-08
**Task**: Word导入去AI预览、Step3摘要、字典名同步、按钮文案、Logo重置
**Branch**: `draft`

### Summary

(Add summary)

### Main Changes

## 完成事项

| 项 | 内容 |
|---|---|
| PR1 | FormDesignerTab 按钮文案"添加log行"→"添加'以下为log行'提示"；ProjectInfoTab Logo 残留修复（无 logo 项目切换时清空 logoUrl） |
| PR2 | DocxCompareDialog 重写为纯预览（标题"预览"，移除 AI 建议/AI 说明/AI 开关）；App.vue 全量移除 aiSuggestionFlags / updateAiFlag / importWordAiError / getFieldLabel；表单列表去 AI Popover/Switch |
| PR3 | App.vue executeImportWord 成功进入 Step 3 摘要表（name/field_count/打开设计页按钮）；新增 openDesignerForImportedForm 跳转；后端 DocxFormResult 新增 form_id 字段；backend/tests/test_rate_limit.py 补 mock |
| PR4 | CodelistsTab reload() bump refreshKey 联动其他 Tab；FormDesignerTab.quickSaveCodelist 两处 bump refreshKey；FormDesignerTab 暴露 selectFormById |
| S4 | Step 3 el-table 增加 aria-label="导入结果"（Gemini 审查建议） |
| S5 | ProjectInfoTab onUnmounted 释放 logoUrl blob（Gemini 审查建议） |
| M1 | 新建 backend/tests/test_docx_import_contract.py：2 个用例覆盖 form_id 契约（Codex 审查建议） |

**变更文件**：
- `backend/src/routers/import_docx.py` - DocxFormResult 新增 form_id
- `backend/src/services/docx_import_service.py` - _create_form 返回 form_id
- `backend/tests/test_rate_limit.py` - mock 补 form_id
- `backend/tests/test_docx_import_contract.py` - 新建契约测试
- `frontend/src/App.vue` - AI 移除、Step 3 摘要、跳转
- `frontend/src/components/DocxCompareDialog.vue` - 重写为纯预览
- `frontend/src/components/CodelistsTab.vue` - reload bump refreshKey
- `frontend/src/components/FormDesignerTab.vue` - selectFormById、quickSaveCodelist bump、按钮文案
- `frontend/src/components/ProjectInfoTab.vue` - Logo 残留修复 + onUnmounted

**测试**：后端 47/47 pass，前端 179/181 pass（2 个 pre-existing 失败，属 05-07 任务）

**双模态审查**：codex 后端 75/100（M1 已补）；gemini 前端无 Critical，S4/S5 已补


### Git Commits

| Hash | Message |
|------|---------|
| `7c22457` | (see git log) |
| `f017850` | (see git log) |
| `e290de3` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
