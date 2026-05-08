# Proposal: Main Branch Form Designer & Word Preview Fixes

## Problem Statement

当前 `main` 分支的“表单设计 / Word 预览”链路存在 6 类相关问题，且前后端语义并不完全一致：

1. **Word 预览中选项尾部下划线未对齐**：同组字典选项的“○选项名____”在 HTML 预览和最终导出链路中缺少统一的对齐规则，当前视觉不整齐。
2. **非表格字段无法填写单个右侧覆盖值**：现有 `default_value` 主要围绕 `inline_mark`（横向表格）使用，普通字段不能稳定地录入并展示一个单行右侧覆盖值。
3. **表单设计界面虽已有预览区，但未满足需求确认的展示方式**：用户确认要在设计界面中采用 **HTML 模拟** 方式展示 Word 预览效果，并进一步优化布局与一致性。
4. **Word 预览未按用户期望展示设计备注**：`Form.design_notes` 已存在，但预览中尚未按“右侧显示、压缩原内容宽度、放大弹窗”的要求呈现。
5. **修改字典名称后选项界面不同步**：前端局部状态 / 缓存失效链路存在刷新不及时问题，造成当前界面需要手动切换或重新加载才看到更新。
6. **字段单位无法清空**：从模型与 schema 看 `unit_id` 可为空，但设计器当前清空链路未形成稳定的“提交 null → 持久化为空 → UI 即时反映”的闭环。

## User Confirmations

本次研究阶段已确认以下需求约束：

- **在当前 `main` 分支修改**
- 设计界面的预览采用 **HTML 模拟**，不使用 Word 截图链路
- 非表格字段的覆盖值 **仅支持单行**
- 备注展示在 **右侧**，并且需要 **压缩原内容显示宽度、放大整个弹窗**
- 单位删除语义为 **清空字段单位**，而非删除单位字典实体

## Scope

### In Scope
- 修复字典/选项型字段在 Word 预览中的尾部下划线对齐问题
- 允许非表格字段录入并保存一个单行覆盖值，用于右侧预览内容
- 优化表单设计界面的 HTML 模拟 Word 预览，使其与导出语义更一致
- 在预览中展示 `design_notes`，并按右侧备注布局呈现
- 修复字典名称编辑后的当前界面联动刷新
- 修复字段单位清空失败问题
- 对涉及字段预览的数据结构、缓存失效、渲染规则进行必要对齐

### Out of Scope
- 不恢复已移除的独立 CRUD / Tab 能力
- 不引入 Word 截图或 COM 自动化作为设计期实时预览方案
- 不扩展为多值覆盖、规则引擎、复杂模板系统
- 不整体重写导出系统或完全替换现有渲染架构
- 不修改与本需求无关的导入、AI 审核或桌面打包能力

## Constraints

### Hard Constraints
- **修改目标是 `main` 分支**，本 proposal 不以其他工作分支为落点。
- 当前后端唯一现成可持久化的表单级覆盖值字段是 `FormField.default_value`；任何“非表格字段覆盖值”方案都必须考虑其已被复制、导入、导出、预览共用。
- `FormFieldRepository.update_inline_mark` 在 `inline_mark` 关闭时会清空 `default_value`，这会直接影响普通字段保留覆盖值的可行性。
- `codelist_id` 与 `unit_id` 位于 `FieldDefinition` 层，不在 `FormField` 层；单位清空和字典联动要走字段定义更新链路。
- 设计器前端预览与后端导出当前存在语义分叉：
  - 前端 `FormDesignerTab.vue` 仅在 `inline_mark` 时使用 `default_value`
  - 后端导出对普通字段也可能优先渲染 `default_value`
- 设计期实时预览不能依赖 `docx_screenshot_service.py`，因为该链路依赖 Windows + Word COM + docx2pdf，适合异步截图，不适合交互式设计预览。
- `Form.design_notes` 已存在于模型与 `FormUpdate` / `FormResponse` schema 中，备注预览必须基于现有字段复用，而不是新增平行字段。
- 字段类型依赖中文字符串约定（如“单选”“多选”“标签”），实现必须兼容现有分支判断方式。

### Soft Constraints
- 优先复用现有渲染链路：前端 `useCRFRenderer.js` + `FormDesignerTab.vue`，后端 `field_rendering.py` + `export_service.py`
- 沿用当前 Router / Service / Repository 分层，不把业务规则堆到 router
- 前端继续使用 Element Plus 组件与现有 cache/invalidate 模式
- 优先通过局部数据与缓存失效修复联动问题，避免引入全局状态管理
- 预览风格应保持现有“纸质 CRF / Word 模拟”视觉基调

## Codebase Assessment

项目为典型多目录结构：

- `frontend/src/**`：Vue 3 + Element Plus 设计器、预览、缓存与渲染逻辑
- `backend/src/**`：FastAPI 路由、SQLAlchemy 模型、导出 / 渲染 / 导入服务
- `openspec/changes/**`：已有变更提案目录

本次需求天然跨越 **前端预览边界** 与 **后端字段/导出边界**，属于多目录、多上下文改动。

## Exploration Summary for OPSX

### Discovered Constraints

#### Frontend-side Constraints
- `frontend/src/components/FormDesignerTab.vue` 已内置右侧预览区和“设计表单”弹窗，说明“表单设计界面显示 Word 预览”不是从零开始，而是要增强现有预览质量与布局。
- `renderCell()` / `renderCellHtml()` 当前对选项类字段强制显示完整选项列表，即使 `default_value` 存在也不覆盖；这与后端导出行为不完全一致。
- 设计器属性面板中“默认值”输入框仅在 `editProp.inline_mark` 为真时显示，直接限制了普通字段录入覆盖值。
- 设计器已支持 `formDesignNotes` 的编辑与自动保存，但预览区尚未按照用户确认的右侧备注样式展示。
- 快速编辑字典时，名称与选项保存后虽然执行了 `loadCodelists()` 与 `loadFormFields()`，但当前选中字段的本地编辑态及联动展示仍可能滞后。
- 单位输入使用 `el-select clearable`，但单位清空是否真正提交为 `null` 需要与后端更新链路协同确认。
- `useCRFRenderer.js` / HTML 预览使用 `<span class="fill-line">` 等方式模拟填线；若只改导出端，不会自动修复设计器预览错位。

#### Backend-side Constraints
- `FieldDefinition` 保存字段类型、字典、单位、格式；`FormField` 保存表单内实例属性、默认值、inline 标记和排序。
- `field_rendering.py` 已抽离默认值拆行与横向表格模型逻辑，适合作为预览 / 导出一致性的约束中心。
- `FormUpdate` 与 `FormResponse` 已支持 `design_notes`，无需为备注新增后端字段。
- `ExportService` 通过项目树预加载和共享渲染逻辑生成导出内容；若覆盖值或备注语义改变，导出与预览都必须同步评估。
- `CodeListOption` 已持久化 `trailing_underscore`，但不同消费端对其利用程度不一致；现有信息足够支持尾部填线规则，但需要在前后端统一使用。
- `unit_id` 从数据模型上允许为空，说明“无法删除字段单位”更可能是更新链路或前端提交流程问题，而非数据库硬限制。

### Dependencies
- **前端核心文件**
  - `frontend/src/components/FormDesignerTab.vue`
  - `frontend/src/composables/useCRFRenderer.js`
  - `frontend/src/components/SimulatedCRFForm.vue`
  - `frontend/src/components/TemplatePreviewDialog.vue`
- **后端核心文件**
  - `backend/src/models/form.py`
  - `backend/src/models/form_field.py`
  - `backend/src/models/field_definition.py`
  - `backend/src/models/codelist.py`
  - `backend/src/routers/forms.py`
  - `backend/src/routers/fields.py`
  - `backend/src/services/field_rendering.py`
  - `backend/src/services/export_service.py`
- **联动依赖**
  - 表单复制 `copy_form`
  - 表单字段列表 `/api/forms/{form_id}/fields`
  - 字典列表 `/api/projects/{project_id}/codelists`
  - 字段定义更新 `/api/projects/{project_id}/field-definitions/{id}`

### Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| 继续复用 `default_value` 可能牵连导出、复制、导入、预览多条链路 | High | 在实现前先统一“普通字段 override”语义，避免只修 UI 不修导出 |
| `inline_mark` 关闭时自动清空 `default_value` 会误删普通字段覆盖值 | High | 实施阶段必须优先核查并收敛该逻辑 |
| 只修前端 HTML 预览会导致与导出结果继续分叉 | High | 预览与导出共享约束，至少统一覆盖值与选项尾线规则 |
| 选项尾部对齐如果采用固定宽度方案，窄容器下可能溢出或换行异常 | Medium | 需要在 HTML 模拟布局中验证宽度策略 |
| 字典名称更新不同步可能来自缓存与本地编辑态双重来源 | Medium | 实施时同时检查 cache invalidation 与 selected-field 本地状态回填 |
| 单位清空问题若仅修前端显示、未落到后端 null 持久化，会在重载后回滚 | Medium | 成功判据必须包含“刷新后仍为空” |
| Gemini 探索过程中出现模型容量 429，前端约束需要以代码扫描结果为主交叉验证 | Low | 研究结论仅采纳成功输出和本地代码证据，不基于失败重试日志做推断 |

## Success Criteria

以下判据必须可观察、可验证：

1. 同一组选项在 HTML 模拟预览中，尾部填线起始位置与整体对齐规则一致。
2. 如果该字段在导出中使用同一选项数据，则最终导出效果与设计器预览不再出现明显规则分叉。
3. 非表格字段可以录入且仅录入 **一个单行覆盖值**，保存后重新加载仍能读回。
4. 非表格字段的覆盖值能在设计器预览右侧生效，不依赖切换为 `inline_mark`。
5. 表单设计备注可在预览中显示于 **右侧区域**，并且预览弹窗 / 容器布局按需求放大、压缩正文宽度。
6. 修改字典名称后，当前界面相关选项区域与预览无需手动刷新即可同步更新。
7. 清空字段单位后，请求层、持久层、返回 DTO 与界面显示都表现为空，刷新后不回填旧单位。
8. 不引入 Word 截图型实时预览依赖，设计期预览继续基于 HTML 模拟。

## Affected Areas

| Area | Files / Modules |
|------|-----------------|
| 表单设计与预览 | `frontend/src/components/FormDesignerTab.vue` |
| 预览渲染规则 | `frontend/src/composables/useCRFRenderer.js`, `frontend/src/components/SimulatedCRFForm.vue` |
| 表单备注 | `backend/src/schemas/form.py`, `backend/src/routers/forms.py`, `frontend/src/components/FormDesignerTab.vue` |
| 字段覆盖值语义 | `backend/src/models/form_field.py`, `backend/src/services/field_rendering.py`, `backend/src/services/export_service.py`, `frontend/src/components/FormDesignerTab.vue` |
| 字典联动刷新 | `frontend/src/components/FormDesignerTab.vue`, `frontend/src/components/CodelistsTab.vue` |
| 单位清空 | `backend/src/models/field_definition.py`, `backend/src/routers/fields.py`, `frontend/src/components/FormDesignerTab.vue` |

## Recommended Research Outcome

本次 research 阶段不做架构决策，只收敛实现空间：

- **不要** 选择 Word 截图 / COM 作为设计期预览基础设施
- **不要** 新增第二套独立预览数据结构，优先复用现有字段 DTO 与共享渲染规则
- **不要** 只修单侧（仅前端或仅后端）而放任预览 / 导出继续分叉
- **必须** 在实施前先明确 `default_value` 在普通字段上的语义，否则无法机械执行后续实现
