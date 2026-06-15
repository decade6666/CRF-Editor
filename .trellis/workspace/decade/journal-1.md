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


## Session 5: 表单备注移位 + per-form 纸张方向

**Date**: 2026-05-08
**Task**: 05-07-form-paper-direction-and-notes-relocation
**Branch**: `draft`

### Summary

实现了表单设计页备注从右侧 aside 移到 header/section-title，并为每张表单增加 `paper_orientation`（`auto/landscape/portrait`）控制；预览与 Word 导出保持方向一致。

### Main Changes

| 主题 | 说明 |
|------|------|
| 后端 | `Form` 模型新增 `paper_orientation`；`database.py` 增轻量迁移；`FormCreate/FormUpdate/FormResponse` 补字段；`copy_form`、`project_clone_service`、`project_import_service` 同步复制与旧库兼容。 |
| 导出 | `export_service._classify_form_layout` 增 `paper_orientation` 参数；`landscape` / `portrait` 覆写 legacy+inline 宽表路径。 |
| 前端 | `FormDesignerTab.vue` 备注迁移为顶栏摘要 + tooltip；编辑表单弹窗增加纸张方向 radio；重写 `landscapeMode` / `designerLandscapeMode`；增加一次性 `crf_forceLandscape` 迁移。 |
| 测试 | 新增 `test_form_paper_orientation.py`、`test_export_paper_orientation.py`；更新 `test_project_copy.py` 与前端源码级测试正则。 |

**Updated Files**:
- `backend/src/models/form.py`
- `backend/src/schemas/form.py`
- `backend/src/database.py`
- `backend/src/routers/forms.py`
- `backend/src/services/export_service.py`
- `backend/src/services/project_clone_service.py`
- `backend/src/services/project_import_service.py`
- `backend/src/services/import_service.py`
- `backend/tests/test_form_paper_orientation.py`
- `backend/tests/test_export_paper_orientation.py`
- `backend/tests/test_project_copy.py`
- `frontend/src/components/FormDesignerTab.vue`
- `frontend/src/styles/main.css`
- `frontend/tests/formFieldPresentation.test.js`
- `frontend/tests/orderingStructure.test.js`
- `.claude/CLAUDE.md`
- `backend/.claude/CLAUDE.md`
- `frontend/.claude/CLAUDE.md`

### Testing

- [OK] `python3 -m pytest backend/tests/test_form_paper_orientation.py backend/tests/test_export_paper_orientation.py backend/tests/test_project_copy.py backend/tests/test_form_design_notes.py backend/tests/test_export_service.py backend/tests/test_import_service.py backend/tests/test_project_import.py -q` -> `111 passed`
- [OK] `node --test frontend/tests/formFieldPresentation.test.js frontend/tests/orderingStructure.test.js frontend/tests/visitPreviewLandscape.test.js frontend/tests/columnWidthPlanning.test.js` -> `67 passed`
- [OK] `npm --prefix frontend run build` -> built successfully
- [OK] touched frontend files `prettier --check` -> ok
- [OK] touched frontend files eslint -> only warnings, 0 errors

### Status

[OK] **Spec Updated / Session Recorded**

### Next Steps

- 按 `draft -> PR` 流程发起合并
- 若产品确认，再单独补 README 一行能力记录或完整回归脚本


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


## Session 6: 沉淀本次任务的三个 code-spec 模式

**Date**: 2026-05-08
**Task**: 沉淀本次任务的三个 code-spec 模式
**Branch**: `draft`

### Summary

(Add summary)

### Main Changes

## 沉淀内容

| 文件 | 新增模式 |
|---|---|
| `backend/quality-guidelines.md` | API 响应新增字段的向后兼容：additive-only、不重排旧字段、mock 数据同步更新、契约测试必须覆盖 |
| `frontend/state-management.md` | refreshKey 全局 bump 联动：`invalidateCache → load → refreshKey.value++` 顺序、validation & error matrix、wrong vs correct |
| `frontend/component-guidelines.md` | Blob URL 生命周期管理：watch(project) 时 `fetchLogo` 无条件 revoke、无 logo 项目清空 blob、onUnmounted 释放 |


### Git Commits

| Hash | Message |
|------|---------|
| `17b4f8a` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 7: 修复 Word 导入预览对话框内容空白

**Date**: 2026-05-10
**Task**: 修复 Word 导入预览对话框内容空白
**Branch**: `draft`

### Summary

(Add summary)

### Main Changes

## Summary

修复 .docx 导入流程中, 点击"预览"后 DocxCompareDialog 右侧 SimulatedCRFForm 渲染空白的问题。根因是 DocxCompareDialog 的 v-model 双向绑定断裂——内部 `visible` computed 的 setter 是空函数, 导致父级状态无法回写, 同时切换不同表单时对话框组件不重建, fields prop 引用未刷新。

## Root Cause

| 位置 | 问题 |
|------|------|
| `DocxCompareDialog.vue` 旧版 | `const visible = computed({ get: () => props.modelValue, set: () => {} })` —— setter 空操作, el-dialog 关闭事件无法回传父组件 |
| `App.vue` 旧版 | 用 `hasOpenedDocxCompare` 一次性挂载控制, 切换表单时同一个 dialog 实例复用, 子组件不会因 prop 引用变化而重新执行 setup |

## Fix

| 文件 | 改动 |
|------|------|
| `frontend/src/components/DocxCompareDialog.vue` | 删除空 setter computed; 改为 `:model-value="modelValue"` + `@update:model-value="$emit('update:modelValue', $event)"`; 移除 `destroy-on-close`(用 key 替代) |
| `frontend/src/App.vue` | 删除冗余 `hasOpenedDocxCompare` ref; `v-if="compareFormData"` + `:key="compareFormData?.index"` 强制切换表单时重建对话框实例 |
| `frontend/src/components/SimulatedCRFForm.vue` | 引入 `getFormFieldTextColorStyle`, 为 label-only / label-cell / control-cell 三类 td 加 `:style="getCellStyle(field)"`, 与设计器预览字体颜色一致 |

## Updated Files

- `frontend/src/App.vue` (+3/-4)
- `frontend/src/components/DocxCompareDialog.vue` (+4/-9)
- `frontend/src/components/SimulatedCRFForm.vue` (+8/-1)

## Validation

- 人工浏览器测试: 用户确认预览对话框可正常展示 CRF 表单字段
- 工作区 `git status` clean, `origin/draft` 与本地同步
- 任务 `05-09-word-import-preview` 已归档至 `archive/2026-05/`

## Notes

- 05-07 任务(form-paper-direction-and-notes-relocation)仍处 in-progress, 但主体 commit `cb7fa36` + spec 沉淀 commit `17b4f8a` 已落地, 待用户确认是否一并归档
- 后续若需将"切换表单时重建对话框"模式沉淀为契约, 可走 /trellis:update-spec


### Git Commits

| Hash | Message |
|------|---------|
| `162208f` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 8: 归档 05-07 表单纸张方向 + 备注移位任务

**Date**: 2026-05-10
**Task**: 归档 05-07 表单纸张方向 + 备注移位任务
**Branch**: `draft`

### Summary

(Add summary)

### Main Changes

## Summary

行政性收尾: 05-07-form-paper-direction-and-notes-relocation 任务的核心实现与 spec 沉淀早在 Session 5 完整记录, 本次仅把任务状态推进到 archive。

## Why Archive Now

| 验收项 | 落地证据 |
|---|---|
| 后端 `paper_orientation` 模型/Schema/迁移/复制 | commit `cb7fa36` |
| 前端备注顶栏迁移 + 纸张方向 radio + 一次性迁移 | commit `cb7fa36` |
| Word 导出按 orientation 行为 | commit `cb7fa36` |
| 测试 `test_form_paper_orientation.py` / `test_export_paper_orientation.py` / `test_project_copy.py` | commit `cb7fa36`, 全绿 |
| 三个 code-spec 模式沉淀 | commit `17b4f8a` |
| 跨栈契约更新到根 `CLAUDE.md` | 已在 5/8 全量扫描 commit `6fce08c` 中同步 |

PRD 中 R1-R5 全部满足, Acceptance Criteria 全部勾选, DoD 全部达成; 任务 task.json 状态 in-progress 与现实脱钩, 本次归档让 board 真实可信。

## Action

- `python3 ./.trellis/scripts/task.py archive 05-07-form-paper-direction-and-notes-relocation` → archive/2026-05/

## Cross Reference

- Session 5 (journal-1.md:191): 完整实现 + 验证记录
- Session 7 (journal-1.md, 本日早些时候): 05-09 修复 + dialog v-model spec 沉淀


### Git Commits

| Hash | Message |
|------|---------|
| `cb7fa36` | (see git log) |
| `17b4f8a` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 9: 05-12 Word 预览/导出视觉对齐：INLINE_HEADER_FLOOR 与 wp-form-title 左对齐

**Date**: 2026-05-13
**Task**: 05-12 Word 预览/导出视觉对齐：INLINE_HEADER_FLOOR 与 wp-form-title 左对齐
**Branch**: `draft`

### Summary

(Add summary)

### Main Changes

## 任务范围

`.trellis/tasks/05-12-word-preview-export-parity` (P2)：拉齐 Word 预览与 `.docx` 导出在两条视觉契约上的偏离。

| ID | 现象 | 根因 |
|---|---|---|
| R1 | 预览端 `.wp-form-title` 居中，导出 Heading-1 默认左对齐 | `main.css` 历史样式 `text-align: center` |
| R2 | 预览端 ≤4 字短表头（如"未查/项目/单位"）被长邻居挤到换行 | `buildInlineColumnDemands` / `build_inline_column_demands` 未设表头权重下限 |

## 改动总览（3 个 commit）

| 阶段 | Commit | 描述 |
|---|---|---|
| PR1 (TDD-RED) | `16fc75e` | 3 个测试文件 / 6 个红灯断言 |
| PR2 (GREEN) | `a14cf16` | 双端 `INLINE_HEADER_FLOOR=8` + `.wp-form-title` 左对齐 + generator 单一来源整顿 |
| PR3 (Spec) | `bdf76ef` | 跨栈契约规范同步 |

**关键决策**：`INLINE_HEADER_FLOOR = WEIGHT_CHINESE * 4 = 8` 只作用于 `inline` 表（`normal`/`unified` 各自保有 `WEIGHT_ASCII * 4` 等已有保护），写在 max chain `max(label_weight, control_weight, INLINE_HEADER_FLOOR)`。

**Updated Files**：
- `backend/src/services/width_planning.py`（新增常量）
- `backend/src/services/field_rendering.py`（max chain 应用 floor）
- `frontend/src/composables/useCRFRenderer.js`（镜像常量 + 应用 floor）
- `frontend/src/styles/main.css`（`.wp-form-title text-align: left`）
- `frontend/scripts/generatePlannerFixtures.mjs`（dateField helper + 3 case 补齐）
- `backend/tests/fixtures/planner_cases.json`（由 generator 重新输出，11 cases）
- 新建 `frontend/tests/wordPageGeometry.test.js`（3 视觉契约断言）
- `frontend/tests/columnWidthPlanning.test.js`（+9.12 / 9.12b）
- `backend/tests/test_width_planning.py`（+TestInlineHeaderFloor 三测试）
- `.trellis/spec/guides/cross-stack-contracts.md`（§1 + §4）
- 根/前端/后端 `CLAUDE.md`（跨栈契约段、变更记录）

## 测试矩阵

| 套件 | 通过 / 失败 | 备注 |
|---|---|---|
| `backend/tests/test_width_planning.py` | 78 / 0 | 含 TestInlineHeaderFloor 三测试 + fixture 比对 |
| 后端整体 | 385 / 0 (4 xfailed) | 零回归 |
| `wordPageGeometry` + `columnWidthPlanning` | 30 / 0 | PR1 红灯全转绿 |
| 前端整体 | 185 / 1 | 唯一 fail `importRenameFeedback.test.js` 在 base 上即已 fail，与本任务无关 |

## 重要发现 / 学到的教训

1. **Generator 是 fixture 唯一权威**：发现 `generatePlannerFixtures.mjs` 之前漏同步两个 unified case（`unified_mixed_inline_and_regular`、`unified_regular_date_control_weight_spans_value_columns`）—— 它们曾被手动追加进 `planner_cases.json`，导致后续跑 generator 会"丢" case。此次把这两个 case 也补进 generator，让单一来源成立。
2. **Commit 边界隔离**：working tree 上有大量 base 在途的 §4 实现改动（A4 几何 / `@media print` / `table-layout: fixed` / `_render_choice_field` 6 个 `_` 等），不属于本任务。用 `git stash push -- <file>` 把这三个文件的混合改动暂存，重新精准 Edit 出本任务改动，避免 PR2 commit 边界被污染。
3. **`importRenameFeedback.test.js` 是 stale baseline**：`git stash`/`pop` 验证在 PR2 改动之前 base 即已 fail，独立于本任务。

## 未完成 / 后续

- `stash@{0}` 中保留了 §4 视觉一致性的 base 在途实现改动（main.css 的 A4 几何与 @media print、useCRFRenderer.js 的 choice / fill-line literal 调整、field_rendering.py 的动态 placeholder weight）。建议后续单独走一个任务 commit 这些工作。
- 工作树仍有 14 个无关在途文件（`export_service.py`、`FormDesignerTab.vue`、`VisitsTab.vue`、等），与本任务无关，由后续任务处理。


### Git Commits

| Hash | Message |
|------|---------|
| `16fc75e` | (see git log) |
| `a14cf16` | (see git log) |
| `bdf76ef` | (see git log) |
| `d7b53db` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 10: 完成 Word 预览与导出视觉一致性修复

**Date**: 2026-05-15
**Task**: 完成 Word 预览与导出视觉一致性修复
**Branch**: `draft`

### Summary

(Add summary)

### Main Changes

| Area | Summary |
| --- | --- |
| Word preview trailing underline | Aligned frontend trailing_underscore preview paths with backend export: six literal underscores in text path, six-underscore-equivalent HTML fill line, and 0.5em fill-line estimator. |
| Preview/export visual rhythm | Adjusted `.word-page td` to `padding: 5.25pt 6px` and `line-height: 1.0` to mirror backend Word paragraph spacing. |
| Column width and orientation | Preserved/exported form paper orientation across preview/export/import paths and documented the remaining lazy-mount risk in the column-width override chain. |
| Backend export | Updated Word export width handling and regression coverage for paper orientation, inline/unified widths, and override application. |
| Specs and task record | Added the Trellis PRD and synchronized preview-export parity contracts in frontend component guidelines and cross-stack contracts. |

**Validation**:
- `cd frontend && npm run lint -- --quiet` -> passed, 0 errors
- `cd frontend && npm run type-check --if-present` -> passed/no-op because no script is defined
- `cd frontend && npm run build` -> passed
- `cd frontend && node --test tests/*.test.js` -> 190 passed
- `cd backend && python3 -m pytest -q` -> 458 passed, 4 xfailed
- `git diff --check` -> passed

**Known follow-up / risks**:
- Browser A4 100% vs Word/WPS 100% manual visual comparison was provided by the user as tested OK, but not rerun by Claude in-browser.
- Export column-width overrides can still be missed if the designer tab has never been activated; this was traced and documented but intentionally not fixed in this slice.
- Local/unrelated working-tree leftovers remain outside the committed work: `.claude/settings.local.json`, `.gitignore`, and the archived performance evidence timestamp JSON.


### Git Commits

| Hash | Message |
|------|---------|
| `374bd8e` | (see git log) |
| `af0253a` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 11: 忽略本地设置并刷新性能证据

**Date**: 2026-05-15
**Task**: 忽略本地设置并刷新性能证据
**Branch**: `draft`

### Summary

将 Claude 本地设置文件加入 .gitignore，并刷新性能约束归档中的 evidence-summary 生成时间。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `74d0b0e` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 12: Word preview/export strict table-field parity

**Date**: 2026-05-16
**Task**: Word preview/export strict table-field parity
**Branch**: `draft`

### Summary

Implemented strict preview/export table-field parity for Word output, added comparator evidence, synchronized cross-stack contracts, and archived completed Trellis tasks.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `4266c31` | (see git log) |
| `013fba9` | (see git log) |
| `2d49a3d` | (see git log) |
| `fb8e4ab` | (see git log) |
| `c891cea` | (see git log) |
| `9e37ed1` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 13: Session TTL display and refresh

**Date**: 2026-06-10
**Task**: Session TTL display and refresh
**Branch**: `draft`

### Summary

(Add summary)

### Main Changes

| Area | Summary |
| --- | --- |
| Session timer UI | Added a top-bar `SessionTimer` component for both admin and ordinary workspaces. It displays `会话剩余 N 分钟`, `会话即将过期`, or `已过期`, and hides when no valid token display text exists. |
| Session refresh | Added `useSessionTimer` composable that decodes JWT payload `exp` for display only, recalculates every 30s, warns once at <=5 minutes, and calls `GET /api/auth/me` on click to reuse `X-Refreshed-Token`. 401 handling remains delegated to `useApi.js`. |
| Tests | Added `frontend/tests/sessionTimer.test.js` for JWT `exp` parsing, warning dedupe, display text boundaries, 30s interval, and manual refresh behavior. |
| Contract docs | Extended `.trellis/spec/guides/cross-stack-contracts.md` `auth-token` invariants for frontend display-only `exp` decoding and `/api/auth/me` refresh triggering. |
| Task archive | Archived completed Trellis task `06-03-session-ttl-display-and-refresh`. |

**Validation**:
- `node --test tests/sessionTimer.test.js` -> 4 passed
- `npm run lint -- --quiet` -> passed
- `npm run type-check --if-present` -> passed/no-op because no script is defined
- `npm run build` -> passed
- `node --test tests/*.test.js` -> 207 passed
- `python3 -m pytest tests/test_export_service.py tests/test_permission_guards.py -q` -> 70 passed
- `git diff --check` -> passed
- Code review agent -> no blocking session timer issues found

**Known unrelated blocker**:
- Backend full `python3 -m pytest -q` was run and failed with 3 failures in `tests/test_perf_evidence_summary.py` because the current working tree has unrelated `openspec/` deletions, so `openspec/changes/research-performance-constraints/baselines/evidence-summary.json` cannot be written. This is outside the session timer task.

**Unrelated working-tree changes left untouched**:
- Existing backend/export/visit/form designer/row-resize/Word preview and large `openspec/` deletion changes remain outside the session timer commit.


### Git Commits

| Hash | Message |
|------|---------|
| `2b0baed` | (see git log) |
| `7ae81ef` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 14: 会话计时器 mm:ss 倒计时 + 访视表单同步

**Date**: 2026-06-13
**Task**: 会话计时器 mm:ss 倒计时 + 访视表单同步
**Branch**: `draft`

### Summary

(Add summary)

### Main Changes

| 变更 | 说明 |
|------|------|
| fix(visits) | 切换访视表单后调用 syncVisitForms 同步本地表单视图（toggleCell 刷新 matrixData 后） |
| feat(session) | 会话计时器显示由调试态 `60(s)`/1s 原始秒改为可读 mm:ss 实时倒计时；保留 <60s「会话即将过期」文案；1s 轮询保留（仅本地 JWT 解码，无网络开销） |

**判定**：finish-work 发现 useSessionTimer 改动为调试残留（1s 轮询 + 原始秒显示），用户选择「打磨成正式实现」而非回退。

**验证**：前端 212/212、后端 468 passed+4 xfailed；eslint 改动文件 0 错误。

**交付**：PR #12（draft→main）已合并为 merge commit 3b6ce6e；本地与远程 draft 已快进对齐。

**更新文件**：
- `frontend/src/components/VisitsTab.vue`
- `frontend/src/composables/useSessionTimer.js`
- `frontend/tests/sessionTimer.test.js`


### Git Commits

| Hash | Message |
|------|---------|
| `1e927d1` | (see git log) |
| `ff77b0e` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 15: 性能优化：预览视图模型缓存 + 后端 reorder/批量删除批量化

**Date**: 2026-06-13
**Task**: 性能优化：预览视图模型缓存 + 后端 reorder/批量删除批量化
**Branch**: `draft`

### Summary

前端 FormDesignerTab/TemplatePreviewDialog 预览改 computed 视图模型并消除合并列 O(M²)；后端 reorder 回填改单条 CASE、批量删除改单条 IN、新增幂等 FK 索引。前端 219 测试 / 后端 477 测试全绿，浏览器验证无回归。两个 perf 提交已 push draft 并创建 PR #13(draft→main)。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `4ddeab3` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 16: 文档审查：修正不实的 fast-check 测试依赖声明

**Date**: 2026-06-14
**Task**: 文档审查：修正不实的 fast-check 测试依赖声明
**Branch**: `draft`

### Summary

(Add summary)

### Main Changes

审查 6 个未提交文档（根/模块 CLAUDE.md、index.json、README.md/en），核对刷新内容与代码库一致性，修正唯一实质错误并经 PR #15 合并到 main。

| 项 | 内容 |
|---|---|
| 核对正确 | 文件计数（services 13 / tests 39 / scripts 4 / components 13 / composables 14 / frontend tests 26）、index.json 显式路径、hypothesis 真实依赖、跨栈契约 §4/§5 编号 |
| 实质问题 | README、根与前端 CLAUDE.md 称前端测试依赖 fast-check，实则项目不依赖该库，使用自研 frontend/tests/testProperty.js（前端 CLAUDE.md 自身已称其为"轻量替代 fast-check"，自相矛盾） |
| 修正 | 4 个文件 6 处 fast-check 表述改为 testProperty.js；保留 frontend/.claude/CLAUDE.md:101 "轻量替代 fast-check" 的正确描述 |
| 验证 | 前端 lint 0 errors；node:test 全套 220/220 通过；grep fast-check 仅余 1 处正确描述 |
| 交付 | 提交 28d12af 推送 draft，创建并合并 PR #15（draft→main，含前置 06a9330 行高拖拽 hover 修复） |

**Updated Files**:
- `.claude/CLAUDE.md`
- `.claude/index.json`
- `README.md`
- `README.en.md`
- `backend/.claude/CLAUDE.md`
- `frontend/.claude/CLAUDE.md`


### Git Commits

| Hash | Message |
|------|---------|
| `28d12af` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 17: Session timer seconds display

**Date**: 2026-06-14
**Task**: Session timer seconds display
**Branch**: `draft`

### Summary

Changed the session timer display to raw remaining seconds with an (s) suffix and locked the behavior with session timer tests.

### Main Changes

- Updated `frontend/src/composables/useSessionTimer.js` so positive remaining time renders as `<seconds>(s)` while preserving empty output for invalid values and `已过期` for expired sessions.
- Updated `frontend/tests/sessionTimer.test.js` display assertions for `60(s)`, `59(s)`, `1800(s)`, and `3600(s)` while keeping expiry behavior unchanged.
- Verified the target test first failed after updating assertions, then passed after the implementation change.
- Ran `cd frontend && node --test tests/sessionTimer.test.js` successfully.
- Ran `cd frontend && node --test tests/*.test.js` successfully: 228/228 passed.
- Code review agent confirmed the diff is limited to the PRD scope and found no required fixes.


### Git Commits

| Hash | Message |
|------|---------|
| `01002c4` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 18: Word 导出表格行高改 AT_LEAST 下限 + 单行 1cm 间距

**Date**: 2026-06-15
**Task**: Word 导出表格行高改 AT_LEAST 下限 + 单行 1cm 间距
**Branch**: `draft`

### Summary

(Add summary)

### Main Changes

GPT 实现、Claude review + 浏览器端到端验证的 Word 导出行高修复。

| 改动 | 说明 |
|------|------|
| 行高规则 | `EXACTLY` → `AT_LEAST`，保留 Cm(1) 下限；单行恰 1cm，多行不裁切 |
| 新增常量 | `SINGLE_LINE_HEIGHT_PT=15.6`、`CELL_VPAD_PT≈6.35pt` |
| 段落几何 | 抽出 `_apply_cell_paragraph_metrics`/`_apply_exact_line_spacing`，消除 11+ 处重复 |
| 测试 | 补行高/间距/纵向选项回归；旧 `exact` 用例同步为 `atLeast` |

**Review 发现并修复**：首轮 GPT 漏改 `test_export_service.py` 旧 `exact` 契约，全量套件 4 红；二轮按建议修复后转绿。

**验证**：
- 后端全量 `479 passed, 4 xfailed`
- 浏览器端到端导出（TEST 项目/DECADE）：`trHeight hRule=atLeast val=567`（537 行）；单行 cell `before=127,after=127,exact,line=312` → 内容盒 566≈567 twips(1cm)，常量无需微调
- strict parity 未受影响（仅改几何不动文本）

**交付**：commit 785e3ee（draft）→ PR #18（draft→main，中文描述）

**Updated Files**:
- `backend/src/services/export_service.py`
- `backend/tests/test_export_paper_orientation.py`
- `backend/tests/test_export_service.py`
- `backend/.claude/CLAUDE.md`


### Git Commits

| Hash | Message |
|------|---------|
| `785e3ee` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
