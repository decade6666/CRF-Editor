# 导入与设计器多项 UX 与状态修复

## Goal

修复 Word 导入对比预览、字典联动、设计器按钮文案、新建项目 Logo 状态共 5 项独立 UX/状态缺陷，统一在一个任务中按子项推进，每项可独立验收、独立小 PR。

## What I already know

### 1）Word 导入对比对话框：去 AI 建议、改名为"预览"
- 对话框组件：`frontend/src/components/DocxCompareDialog.vue`
  - 标题写死 `预览对比 - ${formData?.name}`（L4）
  - AI 建议三处呈现：
    - viewMode radio `直接导入效果 / AI建议导入效果`（L31-34）
    - `ai-diff-summary` 修改说明区（L45-54）
    - 底部"采纳 AI 建议"开关（L62-72）
  - `hasAiSuggestions` / `aiModifiedFields` / `viewMode` 等 computed/state 需一并清理
- 调用方：`frontend/src/App.vue`
  - `aiSuggestionFlags` 状态（L672）、`updateAiFlag`（L796）
  - 表单选择列表中的"采纳 AI 建议" 列（L1210 附近）
  - `executeImportWord` 中拼装 `ai_overrides` 的逻辑（L747-767）
  - 传给 `DocxCompareDialog` 的 `:apply-ai`（L1257）
  - Step 1 上传后展示的 `importWordAiError`（L666, L713）
- 后端 AI 链路：`backend/src/services/ai_review_service.py`、`docx_import_service.py` 在 `/import-docx` 返回 `ai_suggestions`、`/import-docx/execute` 接受 `ai_overrides`

### 2）Word 导入完成后没有显示导入效果
- `executeImportWord`（App.vue L738-779）当前仅：`ElMessage.success(数量)` → 关闭对话框 → `api.clearAllCache()` → `refreshKey++`
- 树状导航会刷新，但用户视角无"导入了哪些表单 / 现在去哪里看"的可视化跳转或摘要
- 期望需明确：是跳转到刚导入的表单设计页？还是"导入结果"列表/摘要 Step 3？

### 3）选项字典名称在表单设计页不同步
- 字典编辑入口在 `CodelistsTab.vue.updateCl`（L149-160），改名后 `api.invalidateCache(/codelists)` + `reload()`，但只刷新 CodelistsTab 自身
- `FormDesignerTab.vue` 维护独立 `codelists` ref（L40, L81-82），且字段渲染依赖 `field_definition.codelist.name`（L1361, L2069 等）
- 字段是从 `/api/forms/.../fields` 拉取，通常 join codelist 后嵌套，所以 codelists 缓存失效不一定能让字段层的字典名同步刷新
- 待确认：后端是 ID 引用动态 join，还是字段中存了 snapshot；本前端是否有全局事件或 refreshKey 联动

### 4）"添加log行" 按钮文案
- `FormDesignerTab.vue:1761` 文案 `添加log行` → 改为 `添加"以下为log行"提示`
- 不影响调用逻辑（按钮 `@click="addLogRow"` 不变）

### 5）新增项目"公司 Logo"显示了上一个项目的 Logo
- 根因在 `ProjectInfoTab.vue` 的 `watch(() => props.project)`（L25-37）
- 仅在 `p.company_logo_path` 真值时调用 `fetchLogo(p.id)`，没有 else 分支清空已有 `logoUrl`
- 切换从"有 Logo 项目 A → 无 Logo 项目 B（含新建项目）"时，`logoUrl` 仍指向 A 的 blob，UI 上看到旧 Logo
- `fetchLogo` 内部 L18 会 revoke 旧 URL，但仅在被调用时才生效

## Assumptions (temporary)

- 5 项之间无强耦合，可拆为 5 个独立子任务，各自小 PR
- AI 建议链路移除：用户期望前端完全不展示，但后端是否可保留 AI 调用（用于将来）需要确认
- 字典名同步：用户期望"实时反映"，但是否要求字段层也立刻刷新（或仅下次进入设计器时刷新）需要确认
- 导入效果"显示"：用户没明确形式，需要在几种典型方案之间做选择

## Open Questions

- Q2：AI 建议是仅前端隐藏，还是后端也跳过（节省调用成本）？
- Q3：字典名同步范围—是否需要立即刷新所有打开的表单设计页中的字段层名称，还是下次切表单时刷新即可？

### 已答复
- Q1（已答 2026-05-08）：导入摘要 Step 3 + 跳转入口
  - 决议：执行成功后不立即关闭；进入 Step 3 展示导入表单清单（名称/字段数/状态），每行有"打开设计页"按钮直达；用户手动关闭对话框。
- Q2（已答 2026-05-08）：仅前端隐藏，后端保留 AI 链路
  - 决议：不动 `ai_review_service` / `import-docx` 后端契约；前端纯渲染清理。
- Q3（自决 2026-05-08）：CodelistsTab 改名/改 snapshot 成功后立即 bump 全局 `refreshKey` 并失效相关缓存
  - 依据：后端 `FieldDefinition.codelist` 为 ForeignKey 关系（非 snapshot），后端 join 永远返回最新名；前端已有 `refreshKey` 全局机制（App.vue provide / FormDesignerTab L146、CodelistsTab L55 均 watch），FormDesignerTab 在 watch 中已会 reload `codelists / fieldDefs / formFields`。仅缺一根触发线。

## Requirements (evolving)

### 已确定
- R1.1 `DocxCompareDialog` 标题改为 `预览 - ${formData?.name}`
- R1.2 移除 viewMode 切换、AI 修改说明区、底部 AI 开关；保留"直接导入效果"作为唯一视图
- R1.3 移除 App.vue 表单列表的 AI 开关列、`aiSuggestionFlags`、`ai_overrides` 拼装逻辑
- R1.4 移除 Step 1 的 `importWordAiError` 顶部提示
- R1.5 后端 `ai_review_service` / `/import-docx` 契约不动，前端纯渲染/发送侧清理
- R2.1 `executeImportWord` 成功后不再关闭对话框，进入 Step 3 展示导入摘要
- R2.2 Step 3 列出本次导入的表单：名称、字段数、状态；每行提供"打开设计页"按钮直达对应表单设计页（关闭对话框 + 切到设计页 + 选中该表单）
- R2.3 用户在 Step 3 手动点关闭按钮才退出对话框；关闭后仍触发 `clearAllCache + refreshKey++`
- R3.1 `CodelistsTab.updateCl` 成功后失效 `/api/projects/{id}/codelists` 及相关 `fields` 缓存，并 bump 全局 `refreshKey`（通过 inject/emit 向 App.vue 暴露 bump 函数或直接 inject 可写 ref）
- R3.2 同方案扩展到 `FormDesignerTab` 中快速编辑字典名/snapshot 路径，避免两套逻辑
- R4.1 `FormDesignerTab.vue:1761` 按钮文案改为 `添加"以下为log行"提示`
- R5.1 `ProjectInfoTab.vue` 切换项目时无 Logo 必须清空 `logoUrl`（含 revoke 旧 blob）；实现上让 `fetchLogo` 永远先 revoke+置 null，然后 `watch(props.project)` 无条件调用——而不是条件调用

### 待确定
- R1.5 后端 AI 调用是否同步关闭（取决于 Q2）
- R2.x 导入完成后的"显示效果"实现（取决于 Q1）
- R3.x 字典名同步实现路径（取决于 Q3 + 后端关系核查）

## Acceptance Criteria (evolving)

- [ ] 1：打开 Word 导入预览对话框，标题为"预览 - <表单名>"，无 AI 切换/说明/开关
- [ ] 1：导入流程不再请求/展示 AI 建议，`executeImportWord` 不再发送 `ai_overrides`
- [ ] 2：执行导入成功后，用户能直观看到本次导入的表单（具体形式以 R2 决议为准）
- [ ] 3：在「选项」界面修改字典名后，回到「表单设计」界面已绑定该字典的字段立即显示新名（无需手动刷新页面）
- [ ] 4：表单设计器底部按钮文案为 `添加"以下为log行"提示`，点击后行为不变
- [ ] 5：在 A（有 Logo）→ B（新建/无 Logo）切换、以及新建项目首次进入信息页时，"公司 Logo" 区域不显示任何图像，仅显示"上传 Logo"
- [ ] 全部前端测试 `node --test tests/*.test.js` 与 lint 通过；如改动后端，`pytest` 通过

## Definition of Done (team quality bar)

- 已新增/更新对应回归测试（重点：项目切换 logo 重置；导入对话框无 AI 元素；按钮文案）
- Lint / typecheck / 测试均绿
- 必要时同步更新 `frontend/.claude/CLAUDE.md`、`README.md` 描述
- 5 个子项各自独立小 PR，互不阻塞
- 不破坏现有 Word 导入主流程（解析、批量选择、执行导入）

## Out of Scope (explicit)

- 不重写 AI 建议引擎，也不改变 `ai_review_service` 的接口契约（除非 Q2 决议要求关闭）
- 不调整 `DocxScreenshotPanel`（左侧截图当前已被 `ENABLE_LEFT_PREVIEW=false` 屏蔽）
- 不变更字典/字段的数据库模型，只动同步触发链路
- 不调整 Logo 上传/删除策略本身，仅修复展示状态

## Technical Notes

- 前端涉及文件：`App.vue`、`DocxCompareDialog.vue`、`FormDesignerTab.vue`、`ProjectInfoTab.vue`、`CodelistsTab.vue`
- 后端可能涉及：`routers/import_docx.py`、`services/docx_import_service.py`、`services/ai_review_service.py`（仅在 Q2 决议要求时）
- 测试参考：`frontend/tests/projectInfoMetadata.test.js`、`importRenameFeedback.test.js`、`formDesignerPropertyEditor.runtime.test.js`、`quickEditBehavior.test.js`
- 跨栈契约：本任务不触碰列宽/排序契约
- 当前仓库已有 10 个未提交修改属于另一在规划中的任务 `05-07-form-paper-direction-and-notes-relocation`，本任务实现时需与之隔离（建议在干净 working tree 上以独立分支推进）

## Decision (ADR-lite)

**Context**：5 项独立 UX/状态缺陷同批提出，优先级不同，耦合低。需要确认推进方式、AI 链路去留、字典同步实现。

**Decision**：
- 打包为一个父任务 + 5 个子任务，各自小 PR（允许合并为 2–3 个 PR 聚合）
- AI 建议仅前端隐藏，保留后端链路与 `/import-docx` 契约
- 字典同步采用"写侧 bump 全局 refreshKey + 失效缓存"的最小触发线方案，复用已有 refresh 机制，不改数据模型
- 导入完成走 Step 3 摘要 + 跳转入口，不再"一 Toast 了事"
- Logo 状态修复采用 `fetchLogo 无条件 revoke + watch 无条件调用 fetchLogo`，解决条件分支遗漏

**Consequences**：
- 向后兼容：后端 `/import-docx` 字段和 AI 模块保持完整，将来恢复 AI UI 只需 re-add 前端开关
- 性能：字典改名后会触发所有打开 Tab 的 reload，但代价可忽略（单项目数据量小）
- 风险：Step 3 新增界面与跳转逻辑需要与现有表单选择/高亮交互打磨；建议新增 `importRenameFeedback.test.js` 同级的 Step 3 测试

## Implementation Plan (small PRs)

按优先级与风险排序，建议顺序（可并行的以组号相同表示）：

- **PR1**（组 1，Trivial/Simple，最先落）
  - R4.1 按钮文案改"添加'以下为log行'提示"
  - R5.1 ProjectInfoTab 切换项目 Logo 状态修复
  - 覆盖测试：扩展 `projectInfoMetadata.test.js` 增加"切换到无 Logo 项目时 logoUrl 被清空"断言
- **PR2**（组 1，Moderate）
  - R1.1–R1.5 `DocxCompareDialog` + App.vue AI UI 全量移除，标题改"预览"
  - 覆盖测试：新增/扩展 `importRenameFeedback.test.js` 或 `appSettingsShell.test.js` 级测试——确认对话框无 AI 元素
- **PR3**（组 2，Moderate，依赖 PR2 清理后再加 Step 3）
  - R2.1–R2.3 导入成功 Step 3 摘要 + 跳转入口
  - 覆盖测试：新增"executeImportWord 成功后停留在 Step 3 且渲染摘要表"测试
- **PR4**（组 2，Moderate，独立）
  - R3.1–R3.2 字典改名写侧 bump refreshKey + 失效缓存
  - 覆盖测试：新增"CodelistsTab updateCl 后 refreshKey 自增且 codelists 缓存失效"测试

## Subtask Decomposition

- 05-08-fix-log-row-label-and-logo-reset（PR1）
- 05-08-remove-ai-suggestion-from-docx-compare（PR2）
- 05-08-import-docx-step3-summary（PR3）
- 05-08-codelist-rename-refresh-propagation（PR4）

父任务本身在 PR 全部合并后归档。
