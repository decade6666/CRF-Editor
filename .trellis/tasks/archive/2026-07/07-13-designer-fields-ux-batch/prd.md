# 表单设计器与字段界面交互批次（父任务）

## Goal

一次性交付 6 项来自用户的表单设计器 / 字段库界面交互修复与增强，按 5 组子任务独立规划、实现、验收；父任务负责源需求集合、任务映射、跨子任务一致性验收与最终集成复核。

本 PRD 由 codex + agy 分析（codex 本轮超时不可用，采用 agy + Claude 双源代码复核）后综合产出。

## Source requirements（用户原始需求，逐字保留语义）

1. 表单设计界面，复选类型的字段拖拽排序时会出现 🚫 标志，完成排序之后偶尔会卡顿一会再显示拖拽之后的顺序。
2. Word 预览中的表单名称应该显示默认的黑色，而不是现在显示的灰色。
3. 表单设计界面的属性编辑卡片的"保存"按钮和"取消"按钮常显：
   - 3.1 修改字段属性时需要点击 保存/取消，点击保存才会提交数据；
   - 3.2 修改字段属性后切换到其他字段或关闭设计界面，会弹窗提醒并阻止动作，提醒用户字段属性的修改没有保存，提醒弹窗提供保存或取消的按钮，点击后执行此前被阻止的操作；
   - 3.3 修改字段属性并保存（包括通过提醒弹窗保存），如果字段被多个表单引用，会提醒用户此修改会影响的内容，和字段界面修改出现的弹窗相同。
4. 字段界面修改字段属性出现的弹窗，增加一个判断，仅字段被多个表单引用时才会提醒。
5. 字段界面多选字段然后删除，同样遵循第 4 条规则。
6. 表单设计界面左侧的字段库，打开设计弹窗时自动刷新一遍。

## Task map（5 组子任务）

| 组 | 子任务目录 | 覆盖需求 | 复杂度 | 主要文件 |
| --- | --- | --- | --- | --- |
| G1 | `07-13-designer-checkbox-drag-fix` | 需求 1 | 轻~中 | `frontend/src/components/FormDesignerTab.vue` |
| G2 | `07-13-word-preview-title-color` | 需求 2 | 轻 | `frontend/src/styles/main.css` |
| G3 | `07-13-designer-field-prop-save-cancel` | 需求 3（3.1/3.2/3.3） | 高 | `FormDesignerTab.vue` + `useDesignerHistory.js` |
| G4 | `07-13-fields-multiref-warn-threshold` | 需求 4 + 5 | 轻~中 | `frontend/src/components/FieldsTab.vue`（可能含后端 `references`） |
| G5 | `07-13-designer-open-refresh-fieldlib` | 需求 6 | 轻 | `FormDesignerTab.vue` |

G2 / G5 为 PRD-only 轻量任务；G3 为复杂任务，需 `design.md` + `implement.md`；G1 / G4 视实现深度补充设计。

## Cross-cutting decisions（跨子任务统一约定）

### D1 — "多个表单引用"的准确定义（影响 G3.3、G4）

- 后端 `GET /api/field-definitions/{id}/references`（`backend/src/routers/fields.py:174-184`）当前 `select(Form.name, Form.code)` 经 `FormField` join，**不去重、不返回 `form_id`**。同一字段在同一表单出现多次（如日志行 / 多实例）会产生重复行。
- 因此 `refs.length` 统计的是 FormField 实例数，不是不同表单数。
- **统一裁决**：判定"多个表单"= 去重后的不同表单数 > 1。去重键为 `form_name + '|' + form_code`（当前后端返回字段），或在后端加 `.distinct()` / 增加 `form_id` 返回。具体实现放到 G4 的 `design.md`；G3.3 直接复用 G4 落地的同一判定与文案。
- 注意：agy 分析里假设 references 返回 `form_id`，**该字段目前不存在**，实现时须以 name+code 去重或改后端。

### D2 — 影响提醒文案与 truncRefs 复用

- G3.3（设计器端保存）弹出的影响提醒必须与字段界面（G4）在文案模板、`truncRefs` 截断、按钮语义上一致，避免两处标准漂移。

### D3 — G1 与 G3 的交互边界

- G1 拖拽乐观更新直接改动 `formFields`，须与 G3 的属性脏标记 `isDirty` / 选中态解耦：拖拽排序不得被属性未保存拦截误伤，也不得绕过 G3 的拦截语义（排序改的是实例顺序，不是被编辑字段的属性）。若 G1、G3 同期实现，需在集成复核阶段验证两者不互相污染。

### D4 — 现有健壮性任务不重做

- 已存在的 `07-13-designer-history-busy-coordination`（历史 busy / session 协调）与本批次并行；G1/G3 改动 reorder 与属性历史时不得回退该任务约定的 busy 门控与 session 校验语义，须保持兼容。

## Cross-child acceptance criteria（父任务级）

- [ ] PAC1：5 组子任务各自 `prd.md` 验收标准全部满足并归档。
- [ ] PAC2：D1 的"多个表单"判定在 G3.3 与 G4 两处使用同一实现/常量，无重复分叉逻辑。
- [ ] PAC3：D2 影响提醒文案在设计器端与字段库端一致。
- [ ] PAC4：全量 `cd frontend && node --test tests/*.test.js`、`npm run lint`、`npm run build` 通过；若触及后端 references，`cd backend && python -m pytest` 相关用例通过。
- [ ] PAC5：`wordPageGeometry.test.js` 的 `.wp-form-title` `text-align:left` 契约不被 G2 破坏。
- [ ] PAC6：集成复核确认 G1↔G3、G3↔`designer-history-busy-coordination` 无回归（D3/D4）。

## Out of scope

- 后端字段属性存储结构、字段 OID 生成、撤销/重做栈持久化重构。
- 与本 6 项无关的设计器其他快捷编辑路径、aCRF 注释、列宽/行高机制。
- 多实例并发编辑 / 协同编辑。

## Planning status

需求边界已由代码复核 + agy 分析确认。唯一需在子任务 `design.md` 收敛的关键决策为 D1（"多个表单"判定的前后端落点）。其余为直接可执行改动。

## Follow-up (out of scope, deferred)

- **App.vue 工作台 Tab 切换离开守卫**：agy 审查 G3 时指出，从"表单"Tab 切到"字段"Tab 走 `App.vue` 的 `el-tabs`，未经 `resolveFieldPropLeave`，属性卡脏改动可能静默丢失。本批次需求 3.2 仅列举"切换字段/关闭设计器"，且修复需改 `App.vue`（跨出各子任务单写文件边界），故判定为范围外后续项。建议后续单开任务：在 `App.vue` 的 `el-tabs` 上加 `:before-leave` 守卫，调用 `FormDesignerTab` 暴露的 `canLeaveProject`/新增 `canLeaveTab` 钩子。
