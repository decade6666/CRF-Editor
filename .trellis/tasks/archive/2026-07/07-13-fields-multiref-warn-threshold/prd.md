# 字段界面多表单引用才提醒（G4 / 需求 4 + 5）

> 父任务：`07-13-designer-fields-ux-batch`

## Goal

字段库界面（FieldsTab）的字段属性修改影响提醒、以及多选删除的影响提醒，增加判断：仅当字段被"多个表单"引用时才弹出影响提醒；单表单或未引用时退化为普通二次确认（或直接执行），避免打断日常维护。

## Background and confirmed facts

- `FieldsTab.vue`：
  - `save()`（`108-112`）：`GET /field-definitions/{id}/references`，当前 `if (refs.length)` 即 `ElMessageBox.confirm('修改将影响以下表单：...')`。
  - `del()`（`124-130`）：单删，`refs.length` 时提示"将同时删除以下表单中的该字段"，否则普通确认"删除字段？"。
  - `batchDelFields()`（`142-152`）：`POST batch-references`，对每个字段拼接引用表单，`allRefs.length` 时提示影响，否则"确认删除选中的 N 个字段？"。
- 后端 `GET /field-definitions/{id}/references`（`fields.py:174-184`）：`select(Form.name, Form.code)` 经 FormField join，**不去重、无 form_id**；`POST .../batch-references`（`234-259`）同理按 `{fd_id: [{form_name, form_code}]}` 聚合，也不去重。
- 因此 `refs.length` = FormField 实例数，非不同表单数。父任务 D1 裁决："多个表单" = 去重后不同表单数 > 1。

## Requirements

### R1 — "多个表单"判定（对齐父任务 D1）

- 判定标准：去重后不同表单数 > 1。去重键 `form_name + '|' + form_code`（前端去重），或后端 `references` / `batch-references` 加 `.distinct()`（并保证 batch 同步）。二选一在 `design.md` 定，须与设计器端 G3.3 共享同一判定，避免逻辑分叉。
- 落地为可复用的纯函数/常量（供 G3.3 复用）。

### R2 — 修改属性提醒（需求 4）

- `save()`：仅当被多个表单引用（R1）时弹影响提醒；否则直接保存（不弹或仅必要提示），不再对单表单引用弹提醒。

### R3 — 删除提醒（需求 5）

- 单删 `del()`：仅当被多个表单引用时弹"将同时删除以下表单中的该字段"影响提醒；否则退化为普通删除确认"删除字段 "X"？"。保持删除二次确认存在（删除是破坏性操作，不能无提示直接删）。
- 批删 `batchDelFields()`：影响提醒中只列出被多个表单引用的字段；若选中字段均非多表单引用，退化为普通"确认删除选中的 N 个字段？"。
- del() 与 batchDelFields() 与 save() 使用同一 R1 判定，保持一致（父任务 PAC2）。

### R4 — 语义与安全

- 不改后端删除/更新的实际影响范围（仍会删除所有引用实例）；本任务只调整"何时弹影响提醒"的阈值，删除本身的破坏性二次确认保留。
- 若选择改后端 references 去重，需同步 `batch-references`，并检查其它复用 references 的调用方（如设计器 G3.3）不被破坏。

## Acceptance Criteria

- [ ] AC1（需求 4）：修改被单个表单引用的字段属性 → 不弹影响提醒直接保存；被多个表单引用 → 弹影响提醒。
- [ ] AC2（需求 5 单删）：删除被单表单引用/未引用字段 → 普通删除确认；被多表单引用 → 影响提醒。
- [ ] AC3（需求 5 批删）：影响提醒仅列被多表单引用字段；全部非多表单引用 → 普通批量确认。
- [ ] AC4：save/del/batchDelFields 三处用同一"多表单"判定。
- [ ] AC5：若改后端，`cd backend && python -m pytest` references 相关用例通过；前端 `node --test tests/*.test.js`、`npm run lint`、`npm run build` 通过；新增/更新阈值判定回归。
- [ ] AC6：同一字段在同一表单多次引用（日志行/多实例）时不被误判为"多个表单"。

## Out of scope

- 设计器端属性保存的影响提醒（G3.3，复用本任务判定）。
- 字典/单位等其它 references 弹窗阈值（未在需求内）。

## Planning status

轻~中量。关键决策：R1 判定放前端去重还是后端 `.distinct()`（父任务 D1）。因是父任务共享判定，建议本任务先落地判定实现，再由 G3.3 复用。若涉及后端改动则补 `design.md`。
