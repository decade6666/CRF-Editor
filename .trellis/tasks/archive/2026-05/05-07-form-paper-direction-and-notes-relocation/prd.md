# 表单设计页：备注移位与纸张方向控制

## Goal

在「设计 CRF 表单」页的预览区与编辑表单弹窗中，把"设计备注"从画布右侧 aside 移到画布顶部表单名旁（带省略与悬停提示），并为每张表单提供"纸张方向"配置（自动 / 横向 / 纵向）以覆盖现有自动判定，使前端 A4 预览与未来导出行为更可控、与 Word 导出契约一致。

## What I already know

* 入口组件：`frontend/src/components/FormDesignerTab.vue`（2387 行）
* 现有"共 X 个字段"右对齐位于 `fd-canvas-header`：`FormDesignerTab.vue:1580` `<span style="margin-left:auto">共 {{ formFields.length }} 个字段</span>`。
* 现有"设计备注"以右侧 aside 渲染：
  - 普通预览：`FormDesignerTab.vue:1701-1704` `<aside v-if="hasPreviewNotes" class="wp-notes">`
  - Designer 全屏弹窗预览：`FormDesignerTab.vue:1874-1877` 同结构
  - 编辑器底部还有一张备注卡片：`FormDesignerTab.vue:1983-1985`（用于编辑而非显示，需保留）
* 现有横向判定逻辑：
  - `needsLandscape`（自动）：`FormDesignerTab.vue:556` 基于 `renderGroups` 含 `unified` 或 `inline.fields.length > 4`。
  - `forceLandscape`（全局开关）：`FormDesignerTab.vue:557-558` 持久化在 `localStorage['crf_forceLandscape']`，**项目级而非表单级**。
  - 实际值：`landscapeMode = forceLandscape || needsLandscape`（:559）；`designerLandscapeMode`（:560）等价。
* 编辑表单弹窗：`FormDesignerTab.vue:2003-2012`，目前只有 Code、名称两行；提交逻辑 `FormDesignerTab.vue:215-228` 仅发送 `{name, code}`。
* Form 数据模型：`backend/src/models/form.py`，字段为 `id, project_id, name, code, domain, order_index, design_notes`，**无 `paper_orientation`**；Pydantic Schema `backend/src/schemas/form.py` 同样缺失。
* 数据库迁移规范：演进集中在 `backend/src/database.py` 的轻量迁移逻辑（按根 CLAUDE.md）。
* 表单复制路径：`backend/src/routers/forms.py:280` 已显式复制 `design_notes`，新字段需同步复制；`backend/src/services/project_clone_service.py` 同理。
* Word 导出端已有方向决策：`backend/src/services/export_service.py:1155-1204` `_classify_form_layout` 返回 `legacy / mixed_landscape / unified_landscape`，`_switch_section`（:1300）切换 portrait/landscape 并改 `page_width / page_height`。
* 历史变更：`openspec/changes/archive/2026-03-28-form-design-word-preview-enhancements/` 与 `2026-03-28-main-branch-form-designer-word-preview-fixes/` 已对预览/导出的方向一致性做过专项整治；本次属在其上扩展 per-form 覆写。

## Assumptions (temporary)

* "纸张方向"语义为 per-form 持久化覆写：`auto`（默认，沿用现有 `needsLandscape`）/ `landscape` / `portrait`；选了非 auto 时同时覆写**前端预览**与**Word 导出**，避免预览/导出不一致。
* 全局 `localStorage['crf_forceLandscape']` 在每张表单都有 per-form 设置后失去意义，应当废弃（迁移路径：默认全部表单 `auto`，老 localStorage 静默忽略）。
* 顶栏备注的"20 字符"按 JavaScript 字符数计（中文亦按 1），「长度要遮盖'共 XX 个字段'时」按 OR 关系处理；实现优先用 CSS 自适应截断（`flex` + `overflow:hidden` + `text-overflow:ellipsis`），20 字符上限通过 `slice` + 省略号兜底。
* 备注显示文本仅取纯文本（剥离 HTML，因 `previewDesignNotesHtml` 已是渲染后 HTML，需有 plain 版本）；hover 显示完整原文（plain 文本，不渲染 HTML，避免在 tooltip 里出现样式溢出）。
* designer 全屏弹窗内的预览同样应用本次变更（备注上移 + 方向覆写），保持两条预览路径一致。
* 编辑器底部"设计备注"输入卡片（`:1983`）保留，作为修改入口；本次仅迁移**显示位置**，不改编辑入口。

## Open Questions

* ~~O1（备注右侧 aside 命运）~~ → D3：彻底删除两条路径的 `wp-notes`。
* ~~O2（导出是否一致）~~ → D1：方案 B，全栈一致。
* ~~O3（全局开关命运）~~ → D4：方案 Q，迁移一次后废弃。
* ~~O4（designer 弹窗）~~ → D3：同步应用同一规则。
* ~~O5（强制纵向溢出处理）~~ → D2：保存时二次确认 + 超宽换行。
* ~~O6（默认值与历史数据）~~ → D5：`'auto'` 为缺省，老库 ALTER TABLE 默认值同。

## Requirements (evolving)

### R1 设计备注位置迁移（前端）
- 把预览区（`wp-notes`）的备注**移除**，改在 `fd-canvas-header` 中表单名右侧渲染，限定最长 20 字符，超长以"…"截断；hover 显示完整原文（tooltip）。
- 当顶栏空间不够（即将遮盖 `共 X 个字段`）时也按"…"截断。优先用 flex+overflow:ellipsis 自适应。
- 备注无内容时不显示徽标。
- Designer 全屏弹窗内同步应用同一规则。

### R2 预览强制 A4 + 与导出规则一致（前端）
- 预览页强制 A4：纵向 21cm × 29.7cm，横向 29.7cm × 21cm（CSS 已有 word-page / .landscape 样式，确认无偏离）。
- 自动判定逻辑：沿用现有 `needsLandscape`，作为 `paper_orientation === 'auto'` 时的回退。

### R3 编辑表单弹窗增加"纸张方向"（前端）
- 在 `el-dialog v-model="showEditForm"`（:2003）中加一行 `<el-form-item label="纸张方向">`，三选项 `el-radio-group`：`自动 / 横向 / 纵向`，默认 `自动`。
- 提交时通过 `PUT /api/forms/{id}` 把 `paper_orientation` 一并写入。
- 选中非 `auto` 时，前端预览（普通 + designer）按所选方向渲染，跳过 `needsLandscape` 自动判定。

### R4 后端模型/Schema/迁移/复制（后端）
- `backend/src/models/form.py` 增 `paper_orientation: Optional[str]`（默认 `'auto'`，约束 `auto|landscape|portrait`）。
- `backend/src/schemas/form.py` 在 `FormCreate / FormUpdate / FormResponse` 同步加字段（含 Literal 校验）。
- `backend/src/database.py` 增轻量迁移：表已存在则 ALTER TABLE 加列，缺省 `'auto'`。
- `backend/src/routers/forms.py:copy_form` 与 `project_clone_service.py` 同步复制该字段。

### R5 Word 导出尊重 per-form 方向（后端，**待 O2 确认**）
- 若用户确认导出也应同步：`export_service._classify_form_layout` 在 `paper_orientation=='landscape'` 时强制返回 unified/mixed landscape；`'portrait'` 时强制 legacy 模式（即不切横向）；`'auto'` 维持现状。

## Acceptance Criteria (evolving)

* [ ] 普通预览顶栏：表单名旁出现备注摘要（≤20 字），超长 "…"；hover 完整文本；与"共 X 个字段"不互相遮盖。
* [ ] 普通预览右侧不再出现 `wp-notes`（若 O1 选删除）。
* [ ] Designer 全屏弹窗内预览：同样规则。
* [ ] 编辑表单弹窗显示"纸张方向"，三选项 radio，默认"自动"。
* [ ] 选 `横向` → 预览强制横向；选 `纵向` → 预览强制纵向；选 `自动` → 由 `needsLandscape` 决定。
* [ ] `PUT /api/forms/{id}` 接受并持久化 `paper_orientation`；非法值返回 422。
* [ ] 旧库升级后所有现存表单 `paper_orientation = 'auto'`。
* [ ] 复制表单 / 复制项目均带过 `paper_orientation`。
* [ ] （O2=是时）Word 导出按 `paper_orientation` 行为，与预览一致。
* [ ] 后端 pytest 与前端 node:test 全绿；新增 fixture/契约测试覆盖 paper_orientation 路径。

## Definition of Done

* 单元测试：后端 schema 校验 / 路由 PUT / 复制路径；前端 truncation 行为、editForm 提交 payload。
* 集成测试：（O2=是时）`test_word_export.py` 增 per-form orientation 用例；前端 `columnWidthPlanning.test.js` 不受影响。
* `cd backend && python -m pytest` 全绿；`cd frontend && node --test tests/*.test.js` 全绿；`npm run lint`、`npm run format` 通过。
* 文档同步：根 `CLAUDE.md` 跨栈契约、`backend/.claude/CLAUDE.md` 数据库迁移段落、`frontend/.claude/CLAUDE.md`（若有）更新；新增能力在 `README.md` 顺手记一笔（如适用）。
* 不直接 push main，按 draft → PR 流程。

## Out of Scope (explicit)

* 不调整字段渲染列宽规划契约（`width_planning.py` ↔ `useCRFRenderer.js`），仅让其在 `landscape` 模式下沿用既有可用宽度。
* 不引入项目级"默认纸张方向"（如有需要可独立任务）。
* 不重写 `forceLandscape` 全局开关（除"是否废弃"外）。
* 不改 Word 导出表头/页眉样式。
* 备注编辑入口（设计器底部 textarea）位置不变。

## Technical Notes

* 关键文件：
  - 前端：`frontend/src/components/FormDesignerTab.vue`（顶栏、wp-notes 删除、editForm 弹窗、`landscapeMode` / `designerLandscapeMode` 计算属性、`updateForm` 提交 payload）。
  - 后端：`backend/src/models/form.py`、`backend/src/schemas/form.py`、`backend/src/database.py`（轻量迁移）、`backend/src/routers/forms.py`（copy）、`backend/src/services/project_clone_service.py`、（视 O2）`backend/src/services/export_service.py`。
* 跨栈契约：本次涉及 Form schema 变更，需后端先发新字段、前端再消费；按根 CLAUDE.md 规则更新跨栈一致性段落。
* 风险：
  - 旧库升级遗漏 ALTER TABLE → 启动错误。需在 `database.py` 已有迁移序列里追加并补 pytest。
  - `previewDesignNotesHtml` 当前是渲染 HTML，顶栏需要剥离 HTML 取 plain 文本；考虑复用现有 `formDesignNotes` 原始字符串（设计备注 textarea 绑定的就是纯文本）。
  - tooltip 长度：`previewDesignNotesHtml` 是 markdown/换行渲染产物；tooltip 直接显示原文（保留换行），用 `el-tooltip` `effect="dark"` 即可。

## Research Notes

### What similar tools do

* Word/Office：document/section 级 orientation；CRF 设计工具普遍允许 per-form/per-section 切换。
* 其他临床表单设计器（OpenClinica 等）：表单属性窗口含 paging / orientation 相关字段。

### Constraints from our repo/project

* SQLite 轻量迁移：必须能在老库无字段时容错升级（`backend/src/database.py` 既有 `_ensure_column` 风格）。
* Pydantic：Schema 用 `Literal["auto","landscape","portrait"]` 强校验。
* 前端目前仅 `localStorage` 持久化方向，本次升格为后端持久化。

### Feasible approaches

**Approach A：仅前端预览改动 + per-form 设置**（保守）

* 仅前端预览采用 `paper_orientation`；导出仍走 `_classify_form_layout` 自动判定。
* 优点：影响面小，导出端无回归。
* 缺点：预览与导出可能不一致，违背用户对"所见即所得"的预期。

**Approach B：前端预览 + Word 导出统一覆写**（推荐）

* `paper_orientation` 同时驱动预览与导出；`auto` 维持现有自动判定。
* 优点：行为一致；用户掌控力强。
* 缺点：需改 `export_service` 的分类与切节逻辑，回归面更大。

**Approach C：仅后端字段 + 不联动前端自动**（不推荐）

* 仅落库不影响渲染；后续由其他迭代消费。
* 缺点：需求 1.2 明确要求前端预览改变，不满足。

## Decision (ADR-lite)

**[2026-05-07] D1 — 范围方案选 B（全栈一致）**

* Context：需求只字面要求"显示"按所选方向；但 CRF 编辑器历史上预览与 Word 导出强一致（见 `2026-03-28-main-branch-form-designer-word-preview-fixes/` 整治），若仅改预览将造成预览/导出方向不一致，违背用户预期。
* Decision：`paper_orientation` 同时驱动前端 A4 预览与 Word 导出；`auto` 走现有 `needsLandscape` / `_classify_form_layout` 自动判定；`landscape` / `portrait` 在两端均强制覆写。
* Consequences：
  - R5（导出端覆写）从"待 O2 确认"升为正式范围。
  - 测试范围扩大：需扩 `test_export.py`（或同名）增 per-form orientation 用例。
  - 触发"强制纵向时内容超宽"的边缘行为决定（待 O5 解决）。
  - 前端 `landscapeMode` / `designerLandscapeMode` 计算属性需重写为：`paper_orientation === 'landscape' ? true : paper_orientation === 'portrait' ? false : needsLandscape`。

**[2026-05-07] D2 — 强制纵向溢出策略：确认 + 换行**

* Context：方案 B 下，用户可能选"纵向"却命中现有 `needsLandscape=true` 条件（即内容确实超出 21cm）。需要明确取舍：是否阻止 / 提示 / 静默截断。
* Decision：保存编辑表单时，若 `paper_orientation==='portrait'` 且当前 `needsLandscape===true`，弹出 ElMessageBox 二次确认"内容较宽，纵向显示可能出现换行/截断，仍要保存？"；用户确认后按所选方向渲染——超宽列自动换行。
* Consequences：
  - 前端 `updateForm()` 增预校验：在 `PUT /api/forms/{id}` 之前判定 `needsLandscape`，必要时 `ElMessageBox.confirm`。
  - 前端预览 `.word-page table` 在 portrait 下需保证 `table-layout: fixed; word-break: break-word`（确认现有 CSS 是否已具备，否则补）。
  - 后端导出：`paper_orientation==='portrait'` 时直接走 legacy 模式（不切横向），列宽规划仍用 `available_cm=14.66`，python-docx 默认换行处理超长内容；不在后端再次警告（前端已确认过）。
  - 单元测试：覆盖"内容超宽 + portrait 强制"路径；UI 测试覆盖确认弹窗触发条件。

**[2026-05-07] D3 — UI 范围：方案 X（彻底统一）**

* Context：备注当前出现在两条预览路径的右侧 aside（普通预览 :1701-1704、designer 全屏弹窗 :1874-1877），需求只描述顶栏新位置，未明确旧位置去留。
* Decision：删除两条预览路径的 `<aside class="wp-notes">` 及其 CSS / `word-page--with-notes` 修饰类；统一在 fd-canvas-header（普通）与 designer 全屏弹窗 header（同等位置）渲染顶栏摘要 + hover tooltip；底部 textarea 编辑入口保留不动。
* Consequences：
  - `hasPreviewNotes` / `previewDesignNotesHtml` 在预览中不再使用；保留 `formDesignNotes`（原始字符串）供顶栏摘要与 tooltip 使用。
  - CSS：`.word-page.word-page--with-notes`、`.wp-notes` 等可清理，避免死代码。
  - designer 弹窗 header（`FormDesignerTab.vue:1747` 附近）需补一个等价于普通预览顶栏的容器（可能现 designer header 无此条目，需新增）—— 实施时需验证 designer 全屏弹窗是否已有 header 区域，没有则补。
  - 测试：删除现有 `wp-notes` 渲染相关断言（如有），新增顶栏 truncation/tooltip 断言。

**[2026-05-07] D4 — 旧全局开关：方案 Q（迁移一次后废弃）**

* Context：`localStorage['crf_forceLandscape']` 是项目级前端 hack，per-form 设置上线后语义重叠且优先级混乱。
* Decision：进入项目（FormDesignerTab `onMounted` / 项目切换时）检测 `localStorage['crf_forceLandscape']==='true'` → 把当前项目所有 `paper_orientation==='auto'` 的表单批量更新为 `landscape` → 设置一次性 `localStorage['crf_forceLandscape_migrated_v1']='true'` 并 `removeItem('crf_forceLandscape')` 防止重复执行。迁移采用并发 `PUT /api/forms/{id}` 循环（数量级一般 <100，无须新增批量接口）；任一失败则保留 localStorage 不清，下次重试。删除 `forceLandscape` ref / watch / 计算属性引用。
* Consequences：
  - 新增 `migrateLegacyForceLandscape(projectId)` 工具函数，置于 `FormDesignerTab.vue` 或 `frontend/src/composables/`。
  - 单元测试：mock localStorage、mock api，覆盖（a）有旧值 → 触发批量 PUT；（b）已迁移过 → 跳过；（c）无旧值 → 不动作；（d）部分 PUT 失败 → 不删 localStorage。
  - 不影响后端；纯前端清理。

**[2026-05-07] D5 — 默认值与历史数据：`auto`**

* Context：新增字段 `paper_orientation`，老库无该列。
* Decision：
  - DB 列默认 `'auto'`，NOT NULL。
  - `database.py` 轻量迁移在表已存在时 `ALTER TABLE form ADD COLUMN paper_orientation VARCHAR(16) NOT NULL DEFAULT 'auto'`（SQLite 支持）；同时回填为 `'auto'`（DEFAULT 已覆盖）。
  - Pydantic Schema：`Literal["auto","landscape","portrait"]`，`FormCreate.paper_orientation` 默认 `'auto'`。
  - 项目复制 / 表单复制：值随源对象一起复制（不强制 reset 为 auto）。
* Consequences：单一可信默认值，跨 import / clone / 旧库升级路径行为一致。

所有 O1–O6 已收敛，进入最终确认与实施计划。
