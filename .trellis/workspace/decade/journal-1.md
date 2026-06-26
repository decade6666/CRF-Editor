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


## Session 19: 表单设计器内存撤销/恢复（最近20步）

**Date**: 2026-06-15
**Task**: 表单设计器内存撤销/恢复（最近20步）
**Branch**: `draft`

### Summary

(Add summary)

### Main Changes

为表单设计器新增「撤回」「恢复」能力，前端内存维护 undo/redo 双栈（上限 20，刷新即清空，无后端持久化），后端无改动。

| 范围 | 内容 |
|------|------|
| 新增 composable | `useDesignerHistory.js`：双栈、上限裁剪、新操作清空 redo、id 重映射、busy 锁；回放失败快照还原本条 ids 防栈污染 |
| 设计器接入 | 顶栏「撤回/恢复」按钮 + Ctrl+Z/Y（输入框内让出原生撤销）；切换表单清空历史 |
| 六类操作 | 属性编辑、排序（拖拽+键盘两路径经 recordReorderHistory）、新增已有字段、新建字段、删除、批量删除 |
| 逆操作 | 删除/批量删除按删除前快照（含 order_index+全属性）重建并回写新 id；新建字段撤销对称删定义（409 降级保留）；属性回放对日志行也回放颜色 |

**三轮 GPT 评审闭环**：
- 失败后 remap 污染栈 → undo/redo 快照还原本条 ids
- 键盘排序未入栈 → 抽 recordReorderHistory，拖拽+键盘共用
- 日志行颜色撤销缺失 → 颜色 PATCH 改为无条件执行

**验证**：node --test 240/240；build 成功；eslint 0 error；浏览器实测（5173/8888）空栈禁用、增/删/撤销/恢复、Ctrl+Z/Y、删除 id 重映射全通过。PR #19（draft→main）。

**已知边界**：非事务 REST 的回放幂等（create 成功但刷新失败可能重试重复）未处理；toggleInline 等快编未入栈。

**Updated Files**:
- `frontend/src/composables/useDesignerHistory.js`（新增）
- `frontend/src/components/FormDesignerTab.vue`
- `frontend/tests/designerHistory.test.js`（新增，11 例）
- `frontend/tests/orderingStructure.test.js`
- `frontend/tests/formDesignerPropertyEditor.runtime.test.js`
- `frontend/.claude/CLAUDE.md`


### Git Commits

| Hash | Message |
|------|---------|
| `7eb7594` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 20: 表单设计器顶栏按钮文案改图标

**Date**: 2026-06-15
**Task**: 表单设计器顶栏按钮文案改图标
**Branch**: `draft`

### Summary

(Add summary)

### Main Changes

表单设计器 canvas header 四个按钮由文本改为图标/紧凑标识，无逻辑变化。

| 按钮 | 原文案 | 现在 | 实现 |
|------|--------|------|------|
| 新建字段 | 新建字段 | `+` 图标 | `<el-icon><Plus /></el-icon>`（Plus 已在文件内导入） |
| 添加 log 行 | 添加"以下为log行"提示 | 字面 `log` 文本 | 直接文本 |
| 撤回 | 撤回 | Word 弧形撤回箭头 ↶ | 内联 SVG（fill=currentColor，随 el-icon 自适应 1em） |
| 恢复 | 恢复 | Word 弧形恢复箭头 ↷ | 内联 SVG |

**保留**：各按钮 @click 处理器；撤回/恢复保留 data-test="designer-undo/redo"、:disabled、:loading；`><` 无空白链式写法与"批量删除"按钮拼接不变。
**无障碍**：图标按钮补 title + aria-label，el-icon 标 aria-hidden。
**决策**：log 用字面文本、撤回/恢复用自定义 Word 弧形 SVG（而非 EP RefreshLeft/Right）均由用户确认。
**验证**：eslint 0 errors（既有 1627 warnings 为基线）；node:test 240/240 通过。未做浏览器人工核验（用户回复"测试无误"）。

**Updated Files**:
- `frontend/src/components/FormDesignerTab.vue`


### Git Commits

| Hash | Message |
|------|---------|
| `56d9643` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 21: 修复 Word 预览/导出结构行底色一致性

**Date**: 2026-06-15
**Task**: 修复 Word 预览/导出结构行底色一致性
**Branch**: `draft`

### Summary

对齐 Word 预览与导出在日志行/标签行上的底纹契约；日志行默认灰底、标签行默认不填充、自定义底纹统一改为实心渲染。

### Main Changes

| Feature | Description |
|---------|-------------|
| Preview shading parity | 前端预览改为与 Word 导出一致的结构行底纹规则：日志行默认 `#D9D9D9`，标签行默认不填充，自定义 `bg_color` 为实心色。 |
| Shared presentation helper | 在 `frontend/src/composables/formFieldPresentation.js` 新增结构行样式 helper，统一 `FormDesignerTab.vue`、`VisitsTab.vue`、`TemplatePreviewDialog.vue` 三条预览路径。 |
| Contract docs | 更新 `.trellis/spec/guides/cross-stack-contracts.md`，补充结构行底纹的跨栈契约与验证要求。 |

**Updated Files**:
- `.trellis/spec/guides/cross-stack-contracts.md`
- `frontend/src/composables/formFieldPresentation.js`
- `frontend/src/styles/main.css`
- `frontend/src/components/FormDesignerTab.vue`
- `frontend/src/components/VisitsTab.vue`
- `frontend/src/components/TemplatePreviewDialog.vue`
- `frontend/tests/formFieldPresentation.test.js`

**Testing**:
- `cd frontend && node --test tests/formFieldPresentation.test.js`
- `cd frontend && node --test tests/wordPageGeometry.test.js`
- `cd frontend && npm run build`
- `cd frontend && node --test tests/*.test.js`
- `cd backend && python3 -m pytest tests/test_export_service.py::test_export_project_sets_form_table_rows_to_at_least_one_centimeter tests/test_export_service.py::test_export_project_preserves_mixed_normal_inline_group_order -q`
- 人工测试：没有问题


### Git Commits

| Hash | Message |
|------|---------|
| `4e8d1b9` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 22: 表单设计器新增字段本地草稿（保存才落库）+ GPT 审计修复

**Date**: 2026-06-15
**Task**: 表单设计器新增字段本地草稿（保存才落库）+ GPT 审计修复
**Branch**: `draft`

### Summary

(Add summary)

### Main Changes

| 项 | 说明 |
|---|---|
| 草稿态新增字段 | `newField` 改为构造本地草稿（`__draft__`，带完整本地 `field_definition`）插入并选中，不落库；顶栏「保存」按钮（`saveDraftField`）才依次 POST 建定义+建实例、替换草稿并作为一次「新建字段」入撤销栈 |
| 自动保存短路 | 属性编辑 watcher 对草稿调 `applyEditorToDraft` 本地不可变写回，不发请求 |
| 边界 guard | `removeField`/`openQuickEdit`/`toggleInline` 对草稿短路；`addField`/`addLogRow` 落库前 `confirmDiscardDraft` 防覆盖；切换表单/选字段/再次新建前统一确认（保存/丢弃/取消）；草稿存在时禁排序、草稿行不入批量选择与 inline 快切 |
| 决策 | 仅 `newField` 走草稿，字段库拖入 `addField` 维持立即落库；草稿预览复用本地 `formFields` 渲染路径，无需真实 id 分支 |
| GPT 审计修复 | 确认并修复 3 个真实 bug：草稿可被预览双击触发 `PUT /form-fields/__draft__`、`addField`/`addLogRow` 落库后 `loadFormFields` 静默覆盖草稿；额外补 `toggleInline` 纵深 guard。判定 `fnBody` 正则脆弱性当前非 bug（prettier 顶格约束下结构可靠）故不改；纠正 GPT 对 passed 数的臆测 |
| 测试 | 新增 `designerNewFieldDraft.test.js`（16 源码级用例），全量 **257 passed / 0 fail**，lint 0 error |
| 交付 | PR #21 (draft→main) 已合并，merge commit `38957eb` |

**更新文件**：
- `frontend/src/components/FormDesignerTab.vue`（草稿态实现 + 4 处 guard + 排序/选择守卫）
- `frontend/tests/designerNewFieldDraft.test.js`（新增，16 用例）
- `frontend/tests/orderingStructure.test.js`（inline tooltip 断言同步）
- `frontend/.claude/CLAUDE.md`（设计器小节 + 变更记录 + 测试计数 27→28）
- `.trellis/tasks/06-15-designer-new-field-draft/prd.md`（Open Questions 已解答 + checklist）

**待人工验证**：草稿新建→编辑属性→保存全流程（定义+实例落库、撤销栈记一次「新建字段」）；未保存草稿时切换表单/字段、拖入字段库、点 log、双击预览草稿单元格 → 弹保存/丢弃/取消或不触发 `__draft__` 请求。


### Git Commits

| Hash | Message |
|------|---------|
| `0e008f8` | (see git log) |
| `9d6ffd4` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 23: 修复 Word 导出纵向选项 snapToGrid 间距不均

**Date**: 2026-06-16
**Task**: 修复 Word 导出纵向选项 snapToGrid 间距不均
**Branch**: `draft`

### Summary

(Add summary)

### Main Changes

| 项 | 说明 |
|----|------|
| 现象 | Word 导出纵向单选/多选首项与第二项间距明显大于后续项（预览正常、导出错）|
| 根因 | 节级 `docGrid type=lines linePitch=312`(15.6pt 行网格)+ Word 默认 `snapToGrid=1` 把段落 `space_before` 吸附到整行网格；首项 `before=0`(正落网格线)与其余项 `before=3pt`(被吸附到下一条网格线)渲染成"首间距偏大"。实测确认段落存储间距本就一致(无空段落、非存储值不均)，排除了合并空段落假设 |
| 修复 | 新增 `export_service._disable_snap_to_grid`(用 `insert_element_before` 有序插入 `w:snapToGrid=0`，三态合法且幂等)，`_render_vertical_choices` 对每个选项段落调用；不动 `VERTICAL_OPTION_GAP_PT=3`/`SINGLE_LINE_HEIGHT_PT=15.6`/`CELL_VPAD_PT` 等跨栈契约与文本/strict parity |
| 测试 | `test_export_unified.py`、`test_export_paper_orientation.py` 补 `snapToGrid=0` XML 断言；窄测 29 passed、全量 479 passed/4 xfailed |
| 评审 | GPT 三轮评审通过；helper 顺序问题已根治；`doc.tables[2]` 硬编码与文本作 dict key 列为非阻塞低优先级测试脆弱点 |
| 验收 | 用户人工 Word 验收无问题 |

**Updated Files**:
- `backend/src/services/export_service.py`（新增 `_disable_snap_to_grid` + 调用）
- `backend/tests/test_export_unified.py`
- `backend/tests/test_export_paper_orientation.py`
- `backend/.claude/CLAUDE.md`（导出契约 + 变更记录）

**承接**：前序任务 `06-14-word-cell-height-1cm` 显式标注的 snapToGrid 遗留项收口。


### Git Commits

| Hash | Message |
|------|---------|
| `2bd838c` | (see git log) |
| `d2ee0e0` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 24: Word 导出目录预渲染 + 服务器侧写死真实页码

**Date**: 2026-06-16
**Task**: Word 导出目录预渲染 + 服务器侧写死真实页码
**Branch**: `draft`

### Summary

(Add summary)

### Main Changes

审查并修复 GPT 的 Word 导出目录草稿，再按用户三轮反馈完善。

| 方面 | 内容 |
|------|------|
| 审查修复 | GPT 草稿把预渲染条目放在 TOC 域外，Word 更新域后会再生成一份导致目录重复；改为首条条目合入 TOC 域起始、末条合入 end，整段条目即 separate→end 域结果，整体替换不重复 |
| 目录外观 | `_apply_raw_run_font` 写宋体；`_ensure_toc_styles` 幂等注入 TOC1/2/3 样式（默认模板仅 TOCHeading，悬空 pStyle 回退默认字体导致"排版不像目录"） |
| 标题与空行 | `_add_toc_placeholder` 只写"目录"标题(宋体小四加粗)+记录锚点，`_build_toc_entry` 把域指令合入首条条目，标题与首条条目零空行 |
| 真实页码 | 新增 `toc_pagination.py`：LibreOffice 无头渲染 docx→PDF、读 PDF 大纲页码；`_bake_toc_page_numbers` 写回 PAGEREF；`bake_toc_page_numbers` 默认 False（单测安全）、路由传 True（生产）；失败优雅回退 Word 更新域 |
| 依赖 | requirements.txt +pypdf；系统可选 LibreOffice（已在本机安装验证） |
| 验证 | 完整后端套件 488 passed, 4 xfailed；新增无空行/写死页码回归测试；LibreOffice 实测页码 3/4/5/6/7/8 递增 |

**关键文件**：
- `backend/src/services/export_service.py`（重构 + baking）
- `backend/src/services/toc_pagination.py`（新建）
- `backend/src/routers/export.py`（生产开启 baking）
- `backend/requirements.txt`、`README.md`、`README.en.md`、`backend/.claude/CLAUDE.md`

**已知限制**：LibreOffice 与 Word 分页可能差一页，PAGEREF + updateFields 保留供 Word 再校正；写死页码仅在装有 LibreOffice 的服务器部署生效。


### Git Commits

| Hash | Message |
|------|---------|
| `878e6eb` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 25: Fix designer preview override sync

**Date**: 2026-06-18
**Task**: Fix designer preview override sync
**Branch**: `draft`

### Summary

(Add summary)

### Main Changes

| Area | Description |
|------|-------------|
| Frontend | Fixed bidirectional synchronization between page-level Word preview and fullscreen form designer after adjusting row heights or column widths |
| Composables | Exposed `rehydrate()` from `useColumnResize` and `useRowResize` so preview state can reload the latest localStorage overrides |
| Validation | Added regression tests covering open-designer sync, close-designer sync, and manual rehydrate behavior for width/height persistence |
| Spec | Updated `.trellis/spec/frontend/state-management.md` to document the preview override rehydrate contract and required tests |

**Updated Files**:
- `frontend/src/components/FormDesignerTab.vue`
- `frontend/src/composables/useColumnResize.js`
- `frontend/src/composables/useRowResize.js`
- `frontend/tests/columnWidthPlanning.test.js`
- `frontend/tests/quickEditBehavior.test.js`
- `frontend/tests/rowHeightResize.test.js`
- `.trellis/spec/frontend/state-management.md`

**Verification**:
- `cd frontend && node --test tests/*.test.js`
- Manual test confirmed both directions work:
  - page preview → open fullscreen designer
  - fullscreen designer → close back to page preview


### Git Commits

| Hash | Message |
|------|---------|
| `69e5a21` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 26: 表单设计器属性面板文案和标签字号调整

**Date**: 2026-06-21
**Task**: 表单设计器属性面板文案和标签字号调整
**Branch**: `draft`

### Summary

按用户要求完成表单设计器属性面板文案与样式微调：属性编辑标签宽度加宽，变量标签改为字段标签，选项属性改为字段选项，大号标签字号从 15px 增至 16px。

### Main Changes

| Area | Description |
|------|-------------|
| Frontend | Updated `FormDesignerTab.vue` property editor label width from `70px` to `88px`, renamed `变量标签` to `字段标签`, and renamed the field choice property `选项` to `字段选项`. |
| Presentation | Updated `formFieldPresentation.js` large label font-size preview mapping from `15px` to `16px`. |
| Tests | Updated `formFieldPresentation.test.js` and `quickEditBehavior.test.js` assertions for the new labels, label width, and large font-size mapping. |
| Trellis | Backfilled `.trellis/tasks/06-21-designer-property-label-copy/` with `task.json`, `prd.md`, and context JSONL files. |

**Updated Files**:
- `frontend/src/components/FormDesignerTab.vue`
- `frontend/src/composables/formFieldPresentation.js`
- `frontend/tests/formFieldPresentation.test.js`
- `frontend/tests/quickEditBehavior.test.js`
- `.trellis/tasks/06-21-designer-property-label-copy/task.json`
- `.trellis/tasks/06-21-designer-property-label-copy/prd.md`
- `.trellis/tasks/06-21-designer-property-label-copy/implement.jsonl`
- `.trellis/tasks/06-21-designer-property-label-copy/check.jsonl`
- `.trellis/tasks/06-21-designer-property-label-copy/debug.jsonl`

**Verification**:
- RED step: targeted tests failed before implementation on old `15px` large label font-size and old property labels.
- `cd frontend && node --test tests/formFieldPresentation.test.js tests/quickEditBehavior.test.js` — 54/54 passed.
- `node --test tests/*.test.js` — 276/276 passed.
- `npm run lint -- --quiet` — passed, no errors.
- `code-review low` — `(none)`.
- `python3 ./.trellis/scripts/task.py validate 06-21-designer-property-label-copy` — passed.

**Not Run**:
- Browser/manual UI screenshot verification.
- Git commit; commit requires explicit user authorization.


### Git Commits

(No commits - planning session)

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 27: fix: 字段库缓存刷新 — 切回设计页时同步字段定义

**Date**: 2026-06-21
**Task**: fix: 字段库缓存刷新 — 切回设计页时同步字段定义
**Branch**: `draft`

### Summary

(Add summary)

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `533d565` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 28: UI 改进与删除确认统一

**Date**: 2026-06-24
**Task**: UI 改进与删除确认统一
**Branch**: `draft`

### Summary

(Add summary)

### Main Changes

| 任务 | 状态 |
|------|------|
| 选项字典列表复制按钮 | 已归档 |
| 搜索框模糊搜索排序规则 | 已归档 |
| 删除操作二次确认弹窗 | 已归档 |
| 字段编辑窗口按钮尺寸统一 | 已归档 |
| 字段界面直接编辑引用字典 | 已归档 |
| 选项列表分割线 | 已归档 |

**主要改动**:
- 选项列表改为 `el-table border` 统一视觉风格
- 删除操作统一二次确认规则（项目删除保留双重确认，其他单次确认）
- 字段编辑窗口按钮尺寸统一
- 搜索框改用 `rankFuzzyMatches` 精确优先模糊排序

**测试**: 331/331 frontend tests pass


### Git Commits

| Hash | Message |
|------|---------|
| `125156e` | (see git log) |
| `c761f08` | (see git log) |
| `735651a` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 29: feat: 标签字段库隐藏 + 删除时后端自动清理孤儿定义

**Date**: 2026-06-24
**Task**: feat: 标签字段库隐藏 + 删除时后端自动清理孤儿定义
**Branch**: `draft`

### Summary

标签类型字段不再显示在字段库（FieldsTab/FormDesignerTab）；删除表单中的标签字段时后端自动清理孤儿 FieldDefinition；undo/redo 支持标签字段回放重建

### Main Changes

(Add details)

### Git Commits

(No commits - planning session)

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 30: feat: 标签字段库隐藏 + 删除时后端自动清理孤儿定义

**Date**: 2026-06-24
**Task**: feat: 标签字段库隐藏 + 删除时后端自动清理孤儿定义
**Branch**: `draft`

### Summary

(Add summary)

### Main Changes

| Feature | Description |
|---------|-------------|
| 前端可见性过滤 | 新增 `fieldDefinitionVisibility.js` 纯辅助模块，标签和日志行类型不显示在字段库中 |
| 后端孤儿清理 | 新增 `field_cleanup_service.py`，删除标签字段时自动清理无引用的 FieldDefinition |
| Undo/Redo 修复 | FormDesignerTab 支持标签字段 404 重建，解决后端自动清理导致撤销失败的问题 |
| 测试覆盖 | 后端 5 个清理测试 + 前端可见性与回放测试 |

**Updated Files**:
- `frontend/src/composables/fieldDefinitionVisibility.js` (NEW)
- `backend/src/services/field_cleanup_service.py` (NEW)
- `frontend/src/components/FormDesignerTab.vue` (MOD)
- `frontend/src/components/FieldsTab.vue` (MOD)
- `backend/src/routers/fields.py` (MOD)
- `.trellis/spec/frontend/hook-guidelines.md` (MOD)
- `backend/tests/test_field_cleanup_service.py` (NEW)
- `frontend/tests/fieldLibraryVisibility.test.js` (NEW)

**PR**: https://github.com/decade6666/CRF-Editor/pull/33


### Git Commits

| Hash | Message |
|------|---------|
| `b51ea62` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 31: 序号快编与纯文本输入收尾

**Date**: 2026-06-25
**Task**: 序号快编与纯文本输入收尾
**Branch**: `draft`

### Summary

前端 7 个有序列表新增双击序号快编，并在收尾中移除步进按钮、补齐测试和前端 spec。

### Main Changes

| Feature | Description |
|---------|-------------|
| 序号快编 | 为字典、选项、单位、字段、访视、访视内表单、设计器左侧表单列表增加双击序号直达目标位置输入，复用既有 reorder 接口。 |
| 运行时修复 | 修复隐藏行场景下回填错误显示序号的问题，并确保 reload 失败不会让编辑态卡住。 |
| 交互收尾 | 双击后仅显示文本输入框，统一关闭 `el-input-number` 的加减按钮。 |
| 文档与规范 | 同步 README、`CLAUDE.md`、`.claude/index.json`，并在 `.trellis/spec/frontend/hook-guidelines.md` 记录序号快编契约。 |
| 验证 | `node --test tests/useOrdinalQuickEdit.test.js`、`node --test tests/ordinalQuickEditWiring.test.js tests/useOrdinalQuickEdit.test.js`、`node --test tests/*.test.js`、`npm run build` 通过；`npm run lint` 无 error（仍有仓库既有 warning）。 |

**Updated Files**:
- `frontend/src/composables/useOrdinalQuickEdit.js`
- `frontend/src/components/CodelistsTab.vue`
- `frontend/src/components/UnitsTab.vue`
- `frontend/src/components/FieldsTab.vue`
- `frontend/src/components/VisitsTab.vue`
- `frontend/src/components/FormDesignerTab.vue`
- `frontend/tests/useOrdinalQuickEdit.test.js`
- `frontend/tests/ordinalQuickEditWiring.test.js`
- `frontend/tests/orderingStructure.test.js`
- `README.md`
- `README.en.md`
- `.claude/CLAUDE.md`
- `frontend/.claude/CLAUDE.md`
- `.claude/index.json`
- `.trellis/spec/frontend/hook-guidelines.md`


### Git Commits

| Hash | Message |
|------|---------|
| `6d0fb8e` | (see git log) |
| `0fff247` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 32 — 2026-06-25 — import-template-preview-no-trigger review follow-up

### Scope

- Task: `.trellis/tasks/06-25-import-template-preview-no-trigger/`
- Commit under review: `3bd5804c5dc41c17690c17d000d3305a304ef10d`
- Follow-up focus: address review findings M1/M2/M3/L1 after the implementation commit.

### Changes

| Area | Result |
|------|--------|
| M1 behavior test | Replaced the source-string regex check in `frontend/tests/appTabLazyLoad.test.js` with a Vite SSR behavior test that mounts the real `TemplatePreviewDialog.vue` after the lazy-open flag turns true while `modelValue` is already true, then verifies `api.get` receives `/api/projects/11/import-template/form-fields?form_id=22`. |
| L1/L2 spec capture | Added a `Lazy-Mounted v-model Dialogs` contract to `.trellis/spec/frontend/component-guidelines.md`, documenting the `immediate: true` / equivalent setup-time initialization requirement and parent prop ordering constraint. |
| M2 runtime validation | Browser validation reached `http://0.0.0.0:8888`, logged in with the project test account, selected project `通用表单`, and opened `导入模板`; runtime preview validation was blocked before the preview button appeared because `POST /api/projects/2/import-template` returned 400: template `form_field` is missing `label_bold, label_font_size`. No local database mutation was performed. |
| M3 task metadata | Updated `task.json` from planning phase 0 to completed phase 6 with commit `3bd5804c5dc41c17690c17d000d3305a304ef10d`, related files, and blocked runtime-validation notes. |

### Updated Files

- `frontend/tests/appTabLazyLoad.test.js`
- `.trellis/spec/frontend/component-guidelines.md`
- `.trellis/tasks/06-25-import-template-preview-no-trigger/prd.md`
- `.trellis/tasks/06-25-import-template-preview-no-trigger/task.json`
- `.trellis/workspace/decade/journal-1.md`

### Validation

- `node --test tests/appTabLazyLoad.test.js` passed after the behavior-test rewrite and after review cleanup.
- `node --test tests/formDesignerPreviewModel.test.js` passed.
- `npm run lint -- --quiet` passed with 0 errors.
- `node --test tests/*.test.js` passed: 349 tests.
- `git diff --check` passed.

### Status

- Code/spec/Trellis follow-up completed.
- Browser AC remains environment-blocked until the local template database is migrated or replaced with a compatible template library.
