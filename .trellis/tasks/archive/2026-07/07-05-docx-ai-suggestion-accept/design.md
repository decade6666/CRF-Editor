# Design — Word导入AI建议接受开关

> 关联 PRD: `./prd.md`。本设计基于真实代码核对 + Codex(gpt-5.4) 与 Antigravity(gemini-pro-agent) 双模型分析复核后整理。

## 1. 现状数据流（已核对）

```
上传 .docx
  → POST /import-docx/preview
      · parse_full() → full_forms（含 log_row）
      · _build_preview_forms(): 过滤 log_row 后重排 → DocxFormPreview.fields（index=过滤后序号）
      · start_ai_review(temp_id, full_forms) 后台任务
  → 前端 importedFormsPreview（每 form 有 index/name/field_count/fields）
  → 轮询 GET /ai-review/status
      · review_forms(): _build_user_prompt 跳过 log_row，但 index 仍按“原始 fields enumerate”
      · 仅回 ok=false 且 suggested_type∈VALID_FIELD_TYPES 且 ≠ 原类型 的 diffs
      · mergeAiSuggestions() 写入 form.ai_suggestions=[{index,suggested_type,reason}]
  → 预览对话框 DocxCompareDialog：只读展示建议卡片；SimulatedCRFForm 用 viewMode='direct' 渲染原始类型
  → 确认导入 executeImportWord()：payload 仅 {temp_id, form_indices}，从不带 ai_overrides
      · execute 后端已支持 ai_overrides，import_forms 构建 {form_index:{field_index:field_type}}
      · _create_form 按“原始 form_data['fields'] enumerate（含 log_row）”的 fi 匹配 override
```

## 2. 关键契约风险：三处 index 语义不一致（必须处理）

| 位置 | index 语义 | 文件 |
|---|---|---|
| 预览 `DocxFormPreview.fields[].index` | 过滤 `log_row` 后重排序号 | `import_docx.py::_build_preview_forms` L206-221 |
| AI 建议 `suggested.index` | 按原始 `fields` `enumerate()`（跳过 log_row 但不重排） | `ai_review_service.py::_build_user_prompt` L132-146、`review_forms._review_one` L458-460 |
| execute 覆盖 `field_overrides[fi]` | 按原始 `form_data['fields']` `enumerate()`（含 log_row） | `docx_import_service.py::_create_form` L1501-1545 |

- **无 log_row 时三者一致**，功能可用。
- **有 log_row 时**：AI 建议 index 与预览 index 可能错位，且与 execute 覆盖 index 也可能错位 →「预览改的是 A，落库改的是 B」。这是既有 AI 建议展示就已潜伏的缺陷，本次功能把它从“只读展示”升级为“真正落库覆盖”，会把风险放大成数据错误。

**决策**：本次统一以「过滤 log_row 后的真实字段序号」为唯一 index 契约（与预览一致，也是前端唯一能拿到的序号）。

- 后端 `ai_review_service._build_user_prompt`：改为对“过滤 log_row 后的真实字段列表”重排 `enumerate`，使 AI 建议 index 对齐预览。`_review_one` 的 `fields[s["index"]]` 同步改用同一份过滤后列表。
- 后端 `docx_import_service._create_form`：把 `field_overrides` 的 key 语义改为“过滤 log_row 后的真实字段序号”。实现方式：遍历时维护一个 `real_index`（遇 log_row 不自增），用 `real_index` 匹配 override，而不是用含 log_row 的 `fi`。
- 保留后端既有类型合法性校验（`VALID_FIELD_TYPES`）和 `_cleanup_field_config`。

> 该后端调整是「对齐三处 index 契约」，不是新增能力；不改 execute 请求/响应 schema，符合 additive-only 与分层规范。

## 3. 前端状态模型（source of truth 在 App.vue）

双模型一致结论：**接受状态独立存放，绝不写进 `importedFormsPreview`**（否则轮询 `replaceImportedFormsPreview` 会覆盖用户选择）。

```js
// App.vue 新增唯一数据源：{ [formIndex]: { [fieldIndex]: suggestedType } }
const acceptedAiOverrides = ref({})
```

- 存 `suggestedType` 而非 boolean：天然绑定“接受的是哪个建议”，轮询变更时可精确核对。
- 三级派生（computed / helper，不额外持久化）：
  - 单条：`acceptedAiOverrides[formIndex]?.[fieldIndex] === suggestion.suggested_type`
  - 单表单：该 form 全部 `ai_suggestions` 是否都已接受 → 支持 全选/半选(indeterminate)/未选
  - 全部：所有含建议的 form 是否都已接受 → 全选/半选/未选

### 生命周期（清空点，全部已在现有代码中有锚点）
| 时机 | 位置 | 动作 |
|---|---|---|
| 关闭 Word 导入弹窗 | `watch(showImportWordDialog)` L702 | 清空 |
| 打开导入弹窗 | `openImportWordDialog()` L780 | 清空 |
| 返回上一步 | `goBackToImportWordStep1()` L794 附近 | 清空 |
| 重新上传成功 | 灌入新 preview 处 L815 附近 | 先清空再灌入 |

### 轮询合并对账（reconcile，最易漏）
`mergeAiSuggestions()` 之后调用 `reconcileAcceptedOverrides(nextForms, acceptedAiOverrides)`：
- 仅保留“该 form 当前 `ai_suggestions` 里仍存在、且 `index` 对应建议的 `suggested_type` 未变”的接受项。
- 建议消失 / suggested_type 变化 → 删除对应接受项，防止“幽灵接受”违反默认关闭与提交脏数据。
- 不做“新到建议自动接受”——新建议一律默认关闭（满足 R2）。

## 4. 预览渲染（复用已有能力，不改渲染逻辑）

`SimulatedCRFForm.vue` 已支持 `viewMode='ai' + aiSuggestions`（L131-146：命中建议时 `{...f, field_type: sug.suggested_type, _aiModified:true}`，未命中回落原类型，其余属性保留）。

- `DocxCompareDialog` 改为向 `SimulatedCRFForm` 传 `view-mode="ai"` + **仅“已接受”的建议子集** `acceptedSuggestions`。
- 未接受任何建议时传空数组 → 渲染回落原始类型（等价当前 direct 效果），满足默认关闭。
- `SimulatedCRFForm` 内部 `aiSugMap` 以 `s.index` 建映射；此处 `s.index` 即“过滤后真实序号”，与 `field.index`（预览序号）一致 → 覆盖正确。
- 保留 `_aiModified` 的 `AI` 徽标与 `.ai-row` 高亮，天然给出“接受后效果”视觉反馈。

> 注：预览是“渲染时按类型覆盖”，与后端 `_cleanup_field_config` 精确落库可能存在极少数细节差异（如类型切换后 options 清理）。这是既有 `viewMode='ai'` 的固有近似，本次不扩大范围处理，在 PRD Out of Scope 已声明。

## 5. 组件边界与交互（单向数据流）

- **App.vue**：持有 `acceptedAiOverrides`；提供三级操作方法 + `buildAiOverridesPayload()`；注入 execute。
- **DocxCompareDialog.vue**：
  - 接收 `formData`、`acceptedSuggestions`(computed 子集) 作为 props；不在内部改状态。
  - AI 建议列表每条加接受控件（`el-checkbox`）；顶部加“本表单全接受 / 全取消”（`el-checkbox` + indeterminate）。
  - 操作向上 `emit('toggle-suggestion', {formIndex, fieldIndex, suggestedType, accepted})` 与 `emit('toggle-form', {formIndex, accepted})`。
  - 保持 `:model-value`+`@update:model-value` 契约（component-guidelines「Dialog v-model + Per-Object Key Reset」），不引入空 setter。
- **Step 2 表单列表（App.vue 模板 L1285-1322）**：在列表上方操作区加“全部表单：全接受 / 全取消”（仅当存在建议时可用；无建议置灰）。
- **SimulatedCRFForm.vue**：大概率不改；仅确认 `view-mode='ai'` + 子集建议路径可用。

### 交互细节
- 无建议的表单：其“本表单全接受”控件 disabled；全局控件在“无任何建议”时 disabled。
- AI 复核中/失败：沿用既有降级卡片；接受控件仅对“已到达的建议”可用，不改失败展示。

## 6. execute payload 构造（buildAiOverridesPayload）

仅从「当前 `importedFormsPreview` + `acceptedAiOverrides` + `selectedFormsToImport`」构造：

```js
// 产物: [{ form_index, overrides: [{ index, field_type }] }]
// 过滤: 仅已选表单 ∩ 仍存在建议 ∩ suggested_type∈VALID_FIELD_TYPES ∩ ≠ 原 field_type
```

- `VALID_FIELD_TYPES` 前端来源：新增前端常量并加注释「必须与 backend ai_review_service.VALID_FIELD_TYPES 同步」，作为跨栈约定（Antigravity 指出的 PRD 缺口）。后端仍是最终校验兜底，前端过滤只为避免无谓 400。
- 无有效项 → payload 不带 `ai_overrides`（保持现有行为）。
- 位置：`executeImportWord()` L852-877，在现有 `payload` 上按需追加。

## 7. 复用与放置（code-reuse）

- 纯函数抽到轻量 helper 便于测试，不做整套状态机 composable（双模型一致）：
  - `frontend/src/composables/docxAiSuggestionOverrides.js`：`reconcileAcceptedOverrides`、`buildAiOverridesPayload`、三级选中态派生（`isFormFullyAccepted` / `isFormIndeterminate` / `isAllAccepted` 等纯函数）。
- 状态 ref、生命周期清空、emit 接线仍在 App.vue（与 importWordStep/pollAiReview/executeImportWord 强绑定）。

## 8. 测试设计

- `frontend/tests/docxAiSuggestionAcceptance.test.js`（新增，纯函数为主）：
  - 默认空状态全部未接受；单条 toggle 开/关；单表单 accept-all/clear-all；全局 accept-all/clear-all。
  - 全选/半选/未选派生正确。
  - `reconcileAcceptedOverrides`：相同 index+suggested_type 保留；建议消失或 suggested_type 变更时清除。
  - `buildAiOverridesPayload`：仅已选表单、合法类型、≠原类型；无有效项时省略 `ai_overrides`；默认关闭时输出空。
- `frontend/tests/docxBimodalPreview.test.js`（扩展）：
  - 左截图面板结构不破坏（既有断言保留）。
  - 断言 `DocxCompareDialog` 预览走 `SimulatedCRFForm` 的 `view-mode="ai"` + 已接受子集，而非直接改 `formData.fields`。
  - 断言对话框存在单条接受控件与“本表单全接受/全取消”控件；App.vue 存在“全部表单”控件。
- 后端 index 契约回归：
  - `backend/tests/test_ai_review_service.py`：含 log_row 的表单，AI 建议 index 对齐“过滤后序号”。
  - `backend/tests/`（import 覆盖）：含 log_row 时 `ai_overrides` 按“过滤后序号”命中正确字段落库。

## 9. 影响文件清单

| 类型 | 文件 |
|---|---|
| 改（前端） | `frontend/src/App.vue`、`frontend/src/components/DocxCompareDialog.vue` |
| 增（前端） | `frontend/src/composables/docxAiSuggestionOverrides.js` |
| 改（后端，index 对齐） | `backend/src/services/ai_review_service.py`、`backend/src/services/docx_import_service.py` |
| 改/增（测试） | `frontend/tests/docxAiSuggestionAcceptance.test.js`(新)、`frontend/tests/docxBimodalPreview.test.js`、`backend/tests/test_ai_review_service.py`、后端 import 覆盖用例 |
| 文档同步 | `README.md`/`README.en.md`(功能一句)、`frontend/.claude/CLAUDE.md`、`backend/.claude/CLAUDE.md`、`.claude/index.json`、必要时 `.trellis/spec` 契约补注 |

## 10. 兼容与回滚

- execute 请求/响应 schema 不变，纯增字段行为；不带 `ai_overrides` 时与现状完全一致。
- 后端 index 对齐对“无 log_row”场景零行为变化;仅修复“有 log_row”错位。
- 回滚点：前端改动与后端 index 改动可分别独立回退;前端回退后回到“只读建议”现状,后端回退后回到含 log_row 潜在错位的旧行为。
