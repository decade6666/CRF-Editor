# Proposal: 修复项目列表对比度、排序显示、模板预览与项目导入容错

## Change ID
`ui-ordering-and-import-fixes`

## 需求（增强后）

**目标**：围绕当前 CRF-Editor 中已确认的 4 个现存问题，产出一个仅用于后续规划/实施的 research proposal，收敛实现空间、约束集与可验证成功判据。

**已确认的问题**：

1. **项目列表复制图标对比度过低**：项目列表中的复制图标当前过浅，在侧边栏场景下可读性不足。
2. **“字段”与“表单”界面拖拽后序号显示不一致**：拖拽排序后，界面应像其他列表一样自动反映新的序号；当前表现为排序动作发生了，但序号显示刷新不一致，且“字段”界面的手动改序号逻辑还会额外走字段信息更新链路。
3. **模板导入预览弹窗需要双栏重构**：左侧应呈现与“表单”界面右侧预览区域一致的预览效果；右侧应显示字段列表并支持勾选要导入的字段。
4. **项目数据库导出后再导入失败**：当前前端会出现 `Unexpected token 'I', "Internal S"... is not valid JSON`，而业务期望是同名项目允许导入，并自动另存为 `原名_导入`（继续重复时递增编号），而不是因重名或未捕获异常而失败。

**用户确认的范围约束**：

1. 本次 change 是**修复现有问题**，不是新功能探索。
2. 同名项目导入的目标命名规则采用 **`原名_导入`** 风格；重复导入时应支持递增后缀。
3. 本阶段只做 **research / proposal**，不修改源码、不进入 planning / implementation。

**技术边界**：

- 保持现有前后端分层与接口责任：`routers -> repositories/services -> models/schemas`。
- 优先复用现有排序接口、模板预览接口与导入接口，不在 research 阶段假设新增接口。
- 不把纯前端视觉问题扩大为后端改造。
- 不把单一报错表象误判为仅前端问题；需以当前导入链路的异常传播方式为约束。

---

## Scope

### In Scope
- 收敛项目列表复制按钮低对比度问题的真实影响面与样式边界
- 明确“字段”“表单”两个界面拖拽/手动改序号的后端真值、前端刷新责任和接口契约
- 明确模板导入预览弹窗的现有数据能力、左侧预览一致性要求、右侧字段勾选依赖
- 明确项目 `.db` 导出后再导入失败的实际约束：命名冲突处理、异常响应格式、前端错误解析边界
- 给出后续 `/ccg:spec-plan` 可直接采用的约束集、依赖关系、风险与成功判据

### Out of Scope
- 本阶段不修改任何源码、测试或样式
- 不在此阶段决定具体 UI 实现细节（例如是否拆组件、是否抽公共 preview composable）
- 不重构认证体系，不扩展登录模型
- 不新增与本次问题无关的导入导出能力
- 不新增环境变量、CLI 参数或额外配置系统

---

## Research Summary for OPSX

### Discovered Constraints

#### Hard Constraints（不可违背）
- **Issue 1 是前端样式问题，不需要新增后端接口。** 项目列表复制动作已经由 `frontend/src/App.vue` 调用 `/api/projects/{id}/copy` 完成；research 阶段没有发现必须改变复制接口语义的后端约束。
- **Issue 1 的可视问题发生在侧边栏深色背景语境下。** `frontend/src/App.vue` 的项目项操作按钮使用 Element Plus `link` 按钮样式，当前与侧边栏颜色变量组合后，对复制图标的感知对比度不足。
- **Issue 2 的排序真值已经在后端存在。** `backend/src/routers/forms.py`、`backend/src/routers/fields.py`、对应仓储与 schema 都以 `order_index` 作为真值，并在列表读取时按该字段排序返回。
- **Issue 2 的重排接口不会返回最新列表。** 表单与字段库等 `reorder` 接口只返回轻量成功响应（`204` 或 `{message: "Reordered"}`），不会把重排后的完整列表重新返回给前端；因此“拖拽后序号立刻刷新”必须依赖前端本地同步或成功后显式 reload。
- **Issue 2 的请求体约定不统一。** 项目/表单/字段库/单位/访视使用原始 ID 数组；表单字段使用 `{ordered_ids}`；访视-表单使用 `{ordered_form_ids}`。任何共享排序逻辑都必须按具体接口契约适配。
- **Issue 2 的“字段”界面当前存在额外耦合。** `frontend/src/components/FieldsTab.vue` 中手动修改序号的 `updateOrder` 会重建列表后调用字段库 `reorder` 接口，但页面同时还维护字段属性编辑态，因此若刷新责任没处理好，容易出现“顺序已改但序号显示未同步”的观感。
- **Issue 3 现有后端已经支持字段级部分导入。** `frontend/src/components/TemplatePreviewDialog.vue` 使用的预览/执行链路依赖 `field_ids`；后端模板导入接口已经允许传入子集字段，因此“右侧勾选字段 -> 左侧预览实时收敛 -> 执行仅导入勾选字段”在接口层面是可行的。
- **Issue 3 的阻塞不在接口，而在前端预览一致性。** 当前模板预览左侧依赖 `SimulatedCRFForm`，而“表单”界面右侧预览主要由 `frontend/src/components/FormDesignerTab.vue` 与 `frontend/src/composables/formFieldPresentation.js` 驱动；要做到“一样的预览效果”，必须把它视为前端渲染一致性问题，而不是请求结构问题。
- **Issue 4 的同名导入逻辑当前已存在，但命名样式不符合用户确认。** `backend/src/services/project_import_service.py` 的 `_resolve_import_name()` 已支持导入自动重命名，但当前风格是 `原名 (导入N)`，不是本次已确认的 `原名_导入` 规则。
- **Issue 4 的 JSON 解析报错表明导入链路存在未捕获异常。** 前端 `frontend/src/App.vue` 的 `handleImportProjectDb()` 直接对响应执行 `resp.json()`；若后端抛出未被转为 JSON 的 500，前端就会收到 `Internal Server Error` 纯文本并触发 `Unexpected token 'I'...`。
- **Issue 4 的异常并非简单“项目重名被拒绝”。** 当前项目名冲突本应被 `_resolve_import_name()` 吸收，因此真正的失败更可能发生在 `ProjectCloneService.clone_from_graph()` 的后续 flush / 复制阶段，或其他未捕获错误路径中。
- **数据库导入有严格前置条件。** 上传文件必须满足 SQLite 文件头、大小限制、核心表存在、关键列兼容等校验；因此“允许导入”不等于放宽 schema 校验，只能在合法 `.db` 的前提下处理命名冲突与错误传播。
- **会话失败应维持原子性。** 当前 `get_session()` 的事务边界意味着导入失败不应留下半成品项目；这允许后续把“失败零副作用”纳入成功判据。

#### Soft Constraints（惯例/偏好）
- 项目当前前端复杂复用逻辑倾向放在 `composables/`，后续若需要统一预览能力，应优先沿这一方向考虑，而不是在 research 阶段假设大量重复模板代码。
- API 请求统一走 `frontend/src/composables/useApi.js`；若后续要修复导入错误展示，需保持这一请求风格与现有错误处理习惯一致。
- 已归档 proposal 模式偏向“增强后需求 + Scope + Research Summary + Success Criteria”，后续 planning 可沿相同结构继续推进。
- 当前仓库对“重名处理”已有多套后缀习惯（复制/导入/恢复）；本次若调整导入命名样式，应注意不要无意改变复制或恢复的既有语义。

### Dependencies

| 模块/文件 | 依赖关系 |
|---|---|
| `frontend/src/App.vue` | 项目列表复制按钮样式、项目 `.db` 导入错误解析、模板导入入口都在此处汇聚 |
| `frontend/src/styles/main.css` | 侧边栏与按钮相关颜色变量的全局语义来源 |
| `frontend/src/composables/useSortableTable.js` | 字段/表单列表拖拽排序的共享前端逻辑 |
| `frontend/src/components/FieldsTab.vue` | 字段库序号显示、手动改序号与拖拽排序的具体落点 |
| `frontend/src/components/FormDesignerTab.vue` | 表单列表序号显示与“标准预览效果”的现有来源 |
| `frontend/src/components/TemplatePreviewDialog.vue` | 模板导入预览弹窗的当前实现与后续双栏改造落点 |
| `frontend/src/composables/formFieldPresentation.js` | “表单”界面右侧预览使用的字段展示/分组逻辑 |
| `backend/src/routers/forms.py` / `backend/src/routers/fields.py` | `order_index` 重排接口与列表读取真值 |
| `backend/src/services/order_service.py` | 稠密顺序校验与持久化核心约束 |
| `backend/src/services/project_import_service.py` | 项目导入命名冲突处理与导入入口 |
| `backend/src/services/project_clone_service.py` | 项目图复制与潜在 flush/约束异常落点 |
| `backend/main.py` | 异常处理是否返回 JSON 的全局边界 |

### Risks & Mitigations

| 风险 | 严重度 | 缓解思路 |
|---|---|---|
| 只修复复制图标颜色，不验证侧边栏深色语境下的 hover/active 对比 | Medium | 后续 planning 需把“默认/hover/active”一起视作验收面，而不是只改单个 icon 色值 |
| 误以为后端会返回最新排序列表，导致前端实现后仍出现序号不刷新 | High | 明确把“前端本地更新或成功后 reload”写入 planning 前提 |
| 将“字段界面”问题只当成拖拽问题，遗漏手动改序号路径 | High | 后续 planning 要同时覆盖拖拽与 `el-input-number` 改序号两条路径 |
| 模板预览左侧只做视觉近似，未真正对齐“表单”界面预览行为 | Medium | 在 success criteria 中写明“与表单界面右侧预览一致”是行为级约束，而非仅双栏布局 |
| 只修改前端错误解析，掩盖后端未捕获异常 | High | 后续 planning 需把“后端返回可解析 JSON 或消除该异常路径”纳入同一问题域 |
| 只改命名规则，不排查 `clone_from_graph()` 里的真实失败点 | High | 后续 planning 需同时覆盖命名规则与异常根因验证 |
| 调整导入命名风格时影响复制/恢复等其他后缀规则 | Medium | 将作用域明确限定为项目 `.db` 导入链路，不扩散到其他重名场景 |

### Success Criteria

1. **项目列表复制按钮**在当前侧边栏背景下具有清晰可辨识的默认态、hover 态与 active 态，对比度问题不再出现。
2. **字段界面**中，拖拽排序后序号列立即反映新的连续顺序；手动修改序号时，只改变排序结果，不误触发与排序无关的字段信息更新效果。
3. **表单界面**中，拖拽排序后序号列立即反映新的连续顺序，并与后端列表接口读回的 `order_index` 真值一致。
4. **模板导入预览弹窗**改为双栏：左侧预览效果与“表单”界面右侧预览一致；右侧展示字段列表并支持勾选。
5. 在模板导入预览中，**取消勾选任一字段**后，左侧预览实时反映变化；执行导入时仅提交并导入勾选字段。
6. **项目数据库导出再导入**时，若目标用户下已存在同名项目，导入应成功完成，并自动生成 `原名_导入` 风格的新名称；重复导入时名称能继续递增且保持可预测。
7. **项目数据库导入失败**时，前端不再出现 `Unexpected token 'I'...` 这类 JSON 解析异常；错误要么被正确业务化处理，要么后端返回可解析的 JSON 错误体。
8. 对于合法 `.db` 文件，**同名冲突不应成为阻止导入的原因**；对于非法或不兼容 `.db`，仍应保留现有校验并返回明确失败信息。
9. 导入失败时，**不产生半成品项目或脏数据残留**。

---

## User Confirmations

| 问题 | 用户决策 |
|---|---|
| 本次 spec-research 围绕什么开展 | **修复现有问题** |
| 具体覆盖的问题清单 | **复制图标对比度、字段/表单排序显示、模板预览双栏、项目导出后再导入** |
| 同名项目导入的目标命名规则 | **原名_导入** |
| 当前阶段是否进入实现 | **否，仅生成 proposal** |

---

## Affected Areas

- 前端项目列表与样式：`frontend/src/App.vue`, `frontend/src/styles/main.css`
- 前端排序交互：`frontend/src/composables/useSortableTable.js`, `frontend/src/components/FieldsTab.vue`, `frontend/src/components/FormDesignerTab.vue`
- 前端模板预览：`frontend/src/components/TemplatePreviewDialog.vue`, `frontend/src/composables/formFieldPresentation.js`
- 后端排序约束：`backend/src/routers/forms.py`, `backend/src/routers/fields.py`, `backend/src/services/order_service.py`
- 后端项目导入与复制：`backend/src/services/project_import_service.py`, `backend/src/services/project_clone_service.py`
- 全局异常边界：`backend/main.py`

---

## Research Outcome

本次 research 已把问题空间收敛为 4 条明确约束链路：

- **UI 对比度链路**：这是侧边栏按钮可视性问题，不需要扩散为后端改造。
- **排序显示链路**：后端 `order_index` 真值已存在，关键在前端如何在接口不回列表的前提下同步显示。
- **模板预览链路**：后端已有字段级部分导入能力，关键在前端是否真正复用/对齐“表单”界面的预览语义。
- **导入容错链路**：项目名重名不是唯一问题，异常传播与命名规则都需要纳入 planning，而不能只改前端提示。

后续 `/ccg:spec-plan` 应在以上约束下输出文件级实施顺序，而不是重新讨论问题是否存在。