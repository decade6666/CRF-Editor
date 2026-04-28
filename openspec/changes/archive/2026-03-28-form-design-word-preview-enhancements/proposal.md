# Proposal: Form Design Word Preview Enhancements

## Problem Statement

表单设计与 Word 预览当前存在 6 个相互关联的问题，影响设计效率与预览可信度：

1. **字典选项尾部下划线对齐不一致**：Word 预览中，带 `trailing_underscore` 的选项在视觉上与同组其他选项不齐，尤其在纵向单选/多选场景更明显。
2. **非表格字段缺少“默认值覆盖右侧内容”能力**：当前 `default_value` 主要被用于 `inline_mark` 场景，设计器里未提供“非表格字段单值覆盖”的清晰入口。
3. **表单设计弹窗内缺少实时 Word 预览**：主界面已有右侧预览，但设计弹窗内无法边编辑边验证最终效果。
4. **Word 预览未显示表单设计备注**：`Form.design_notes` 已存在于后端契约中，但设计器预览未展示。
5. **修改字典名称后，选项界面未及时刷新**：快速编辑字典后，字段属性区和依赖它的预览仍可能持有旧的 codelist 快照。
6. **字段单位无法清空**：后端契约允许 `unit_id: null`，但前端当前清空路径存在请求形状或同步问题，导致单位删除失败。

用户已进一步确认以下约束：

- **仅前端预览**：本次仅增强设计器中的前端 Word 预览，不要求同步修改实际 `.docx` 导出链路。
- **默认值仅支持文本/数值**：默认值覆盖能力仅对文本、数值字段开放。
- **设计弹窗内快速编辑**：交互入口放在表单设计弹窗内部，而不是新增独立页面或复杂配置流程。

## Scope

### In Scope
- 修复设计器/预览中单选、多选类选项尾部下划线的对齐规则
- 在表单设计弹窗内，为**非表格字段且字段类型为文本/数值**提供单值默认值覆盖入口
- 在表单设计弹窗内显示实时 Word 预览效果
- 在前端 Word 预览中显示 `design_notes`
- 修复快速编辑字典名称后的前端联动刷新
- 修复字段单位清空并正确持久化
- 保持现有简化版边界，不恢复已移除的独立 CRUD Tab 或额外管理流

### Out of Scope
- 修改实际 Word 导出文件（`.docx`）的后端生成结果
- 新增后端实时预览专用 API
- 将默认值覆盖扩展到表格/inline/table 场景
- 将默认值扩展为多值、规则表达式或模板系统
- 重做导入预览、截图预览、Office/COM 相关链路
- 大规模重构表单设计器架构

## Constraints

### Hard Constraints
- 当前设计器真实数据链路为 `Form -> FormField -> FieldDefinition`；不得误改 legacy `Field` 链路。
- 前端设计器预览必须复用现有渲染逻辑，尤其是 `frontend/src/composables/useCRFRenderer.js` 与 `frontend/src/components/FormDesignerTab.vue` 中的现有 `renderCtrlHtml` / `renderGroups` / `getInlineRows` 机制。
- 本次预览增强限定为**前端预览**；`backend/src/services/export_service.py` 不作为本次一致性目标的一部分。
- `Form.design_notes` 已通过 `FormResponse.design_notes` 返回，可直接复用现有 forms API；不得为备注展示新增不必要接口。
- `FormField.default_value` 当前为字符串字段，本次仅允许作为**单个文本值**使用，不引入数组、多行模板或规则对象。
- 默认值覆盖仅对**非表格字段**、且用户确认的**文本/数值字段**开放；不得在 `inline_mark` 组、日志行、标签、选项类字段中开放同样入口。
- 单位清空必须通过现有可空外键约定处理，即显式提交 `unit_id: null`，不能依赖省略字段或空字符串替代。
- 字典名称联动刷新必须基于现有缓存与响应式数据流修复，不新增事件总线或复杂状态管理框架。
- 不修改简化版功能边界，不恢复被移除的 codelist/unit 独立管理能力。

### Soft Constraints
- 优先最小改动复用 `FormDesignerTab.vue` 现有右侧预览样式与布局。
- 维持当前“打印文档风格”预览观感，不引入与项目现有 UI 脱节的新视觉系统。
- 延续现有前端交互模式：在弹窗内快速编辑、保存后即时刷新。
- 保持数据更新路径清晰：缓存失效 + 重新加载优先于隐式同步。

## Affected Areas

| Area | Likely Files | Notes |
|------|-------------|-------|
| 设计器预览渲染 | `frontend/src/components/FormDesignerTab.vue` | 已有主页面预览与设计弹窗字段编辑逻辑 |
| 通用控件渲染 | `frontend/src/composables/useCRFRenderer.js` | 负责选项、下划线、数值/日期等预览字符串生成 |
| 字典快速编辑联动 | `frontend/src/components/FormDesignerTab.vue` | 已存在 `openQuickEditCodelist` / `saveQuickEditCodelist` 相关流程 |
| 单位清空 | `frontend/src/components/FormDesignerTab.vue` + `backend/src/schemas/field.py` | 后端契约已支持 `unit_id: null` |
| 表单备注 | `backend/src/schemas/form.py` + `frontend/src/components/FormDesignerTab.vue` | 后端已提供 `design_notes` |
| 后端数据契约核对 | `backend/src/schemas/field.py` / `backend/src/schemas/form.py` | 用于确认无需新增 schema |

## Discovered Constraints

### Frontend Constraints
- `FormDesignerTab.vue` 已同时包含主界面 Word 预览、设计弹窗、字段属性编辑、字典快速增改、单位选择等逻辑，本次变更应在现有组件内做增量增强，而非拆出新系统。
- `renderCellHtml(ff)` 已对 `default_value`、`inline_mark`、`field_definition.codelist.options` 做特殊处理，说明默认值能力和预览渲染已有交叉点，新增规则必须避免破坏现有 inline 行为。
- `useCRFRenderer.js:56-111` 当前将 `trailing_underscore` 简单转成文本后缀 `________`，再统一把连续下划线替换为 `.fill-line`；选项对齐问题主要属于前端渲染规则问题，不依赖后端版式元数据。
- 当前属性面板中“默认值”仅在 `editProp.inline_mark` 为真时显示，且注释明确假定这是纯文本场景；这与新需求“非表格字段允许单值默认值覆盖”存在直接冲突，需要重新定义展示条件。
- `FormDesignerTab.vue` 已有 `formDesignNotes` 与 `PUT /api/forms/{id}` 保存备注的逻辑，说明备注编辑入口已存在，缺口主要在预览展示。
- 当前快速编辑字典后会 `invalidateCache('/api/projects/${projectId}/codelists')` 并 `loadCodelists()`，但依赖该字典的 `formFields` / `fieldDefs` 快照未必同步刷新，因此名称更新问题更可能是前端局部状态失配，而不是后端保存失败。

### Backend Constraints
- 后端已稳定提供 `FormResponse.design_notes`，且 `FormUpdate.design_notes` 可更新；备注展示不需要新增 API。
- 后端 `FieldDefinitionUpdate.unit_id: Optional[int]` 与 `FormFieldUpdate.default_value: Optional[str]` 均允许空值；单位无法删除、默认值规则不清更多是前端写入条件问题。
- 现有后端不会校验“默认值仅用于文本/数值、且仅限非表格字段”，若本次坚持 frontend-only，则该规则仅为 UI/交互约束，而非服务端约束。
- `inline_mark` 仍是后端既有特殊语义，且切换 `inline_mark` 的专用 patch 会影响 `default_value`；因此本次必须避免把“非表格字段默认值”与 inline 语义混淆。
- `CodeListOption.trailing_underscore` 是稳定数据字段，可继续作为前端对齐规则输入。

## Dependencies

- 设计器所需数据依赖现有接口：
  - `/api/projects/{project_id}/forms`
  - `/api/forms/{form_id}/fields`
  - `/api/projects/{project_id}/field-definitions`
  - `/api/projects/{project_id}/codelists`
  - `/api/projects/{project_id}/units`
- 备注展示依赖 `selectedForm.design_notes` 或 forms 列表中的同字段同步更新。
- 字典名称刷新依赖 codelists 缓存失效后重新加载，并将最新名称传播到字段属性区和预览使用的数据源。
- 单位清空依赖 `saveFieldProp` 在提交字段定义更新时显式发送 `unit_id: null`。
- 默认值覆盖依赖 `editProp.default_value`、`saveFieldProp`、`renderCellHtml`、可能的 `getInlineRows` 规则协同收敛。

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| 前端预览与实际导出 Word 不完全一致 | Medium | 在 proposal 中明确本次范围仅限前端预览，不把 `.docx` 一致性作为验收条件 |
| 默认值新规则误伤现有 inline/default_value 语义 | High | 将默认值入口严格限制在非表格且文本/数值字段，避免复用 inline 逻辑判定 |
| 修复字典名称刷新时只更新 codelist 列表，未更新已选字段快照 | Medium | 以“缓存失效 + 重取依赖数据 + 刷新当前编辑态”为约束，避免仅做局部赋值 |
| 单位清空仍发送空字符串或 `undefined`，导致后端不生效 | Medium | 成功标准明确要求显式提交 `unit_id: null` 并回读验证 |
| 为解决下划线对齐而改动过大，破坏其他字段类型渲染 | Medium | 将改动限制在选项类渲染分支或 HTML 包装策略，不重写整个控件渲染器 |
| 设计弹窗内新增预览导致组件进一步臃肿 | Low | 复用现有预览 DOM/计算逻辑，避免再复制一套完全独立渲染实现 |
| Gemini 前端探索未完成，遗漏局部约束 | Low | 已通过 `Glob + Grep + Read` 直接核查关键前端文件补齐；若进入计划阶段仍有歧义，再在 `/ccg:spec-plan` 继续消解 |

## Success Criteria

1. 在设计器相关 Word 预览中，带尾部填写线的选项与同组其他选项视觉对齐一致。
2. 在表单设计弹窗内，可直接查看当前表单的 Word 预览效果，无需退出弹窗。
3. `design_notes` 在前端 Word 预览中可见，且不破坏现有页面布局。
4. 非表格字段中，仅文本/数值字段提供默认值覆盖输入入口，且只能保存单个字符串值。
5. 选项类字段、标签、日志行、inline/table 场景不暴露本次默认值覆盖入口。
6. 快速编辑字典名称并保存后，属性面板中的字典名称与关联预览无需手动刷新即可显示最新值。
7. 清空字段单位后再次保存并重新读取，`unit_id` 与 `unit` 均为空。
8. 不新增后端预览 API，不修改实际 `.docx` 导出链路，不突破简化版当前边界。

## User Confirmations

- 仅做**前端预览**增强，不要求同步改造后端 Word 导出。
- 默认值覆盖能力仅支持**文本/数值**。
- 编辑入口放在**设计弹窗内快速编辑**。
