# feat: 表单设计器新增字段本地草稿（保存才落库）

## Goal

新增字段改为**本地草稿态**：点击新增不再立即落库，而是生成临时草稿字段并显示「保存」按钮，用户编辑后点保存才 POST 建库。**修改与删除维持现有自动保存语义**（保持现状不变）。

## What I already know

* 设计器当前为全自动保存：`newField`（`FormDesignerTab.vue:1370`）会立即 `POST field-definitions` + `POST forms/{id}/fields` 并选中；`addField`（:328）从字段库拖入也立即 POST。
* 属性自动保存链路：`saveFieldProp`（:1319）、`buildFieldPropSnapshot`（:1089）、`syncSelectedField`（:1083）、`flushPendingFieldPropSave`（:1198）—— 全部按真实后端 id 工作。
* 删除：`removeField`（:338）对已有字段调 `DELETE /api/form-fields/{id}`。
* 字典/单位快编（`quickAdd*` / `saveQuickEdit` :935 起）部分路径依赖字段真实 id。
* 后端建定义/建实例 REST：`backend/src/routers/fields.py`（`POST /projects/{id}/field-definitions`、`POST /forms/{id}/fields`）。

## Assumptions (temporary)

* 草稿对象用临时标识：`{ id: '__draft__', __draft: true, ... }`，渲染进 `formFields` 与预览。
* 同一时刻**仅允许一个未保存草稿**；存在草稿时切换表单/字段或新建另一个草稿，复用 `confirmFormChange` 模式提示丢弃/保存。
* 草稿态下属性编辑只写本地对象，不触发自动保存 POST；字典/单位绑定写入草稿本地态。
* 「保存」：先 `POST field-definitions` 再 `POST forms/{id}/fields`，成功后用真实记录替换草稿、清标记、`loadFormFields` + `loadFieldDefs`。
* 与撤销任务（`06-15-designer-undo-redo-20`）解耦：草稿不入撤销栈，保存后作为一次"新增"入栈。

## Open Questions（已解答）

* ✅ 草稿态预览：复用现有本地渲染路径即可——草稿带完整本地 `field_definition`，`buildFormDesignerRenderGroups(formFields)` 直接渲染，无需为真实 id 加草稿分支。
* ✅ `addField`：仅 `newField` 走草稿；字段库拖入已有定义的 `addField` 维持立即落库，但落库前需 `confirmDiscardDraft()` 防止覆盖未保存草稿（`addLogRow` 同）。

## Requirements

### R1 草稿创建
* `newField` 改为构造本地草稿对象插入 `formFields` 并选中，不发请求；显示「保存」按钮。

### R2 编辑链路容忍草稿
* `saveFieldProp` / `buildFieldPropSnapshot` / `syncSelectedField` / `flushPendingFieldPropSave` 对 `__draft` 字段短路为本地更新，不发自动保存请求。
* 字典/单位快编绑定在草稿态写入本地对象。

### R3 保存落库
* 「保存」依次 POST 建定义 + 建实例，替换草稿为真实记录并清标记，刷新列表与字段库。
* 失败时保留草稿与编辑内容，`ElMessage` 报错，不静默吞错。

### R4 删除与切换
* `removeField` 对草稿仅移除本地对象，不调 DELETE；已有字段维持自动删。
* 存在未保存草稿时切换表单/字段/新建草稿，提示保存或丢弃。

## Validation

```bash
cd frontend && node --test tests/*.test.js
```

* 新增前端测试：新增字段不触发 POST、保存后正确落库并替换草稿、草稿删除不调 DELETE、存在草稿时切换有提示。
* 人工验证：新增→编辑属性→保存全流程；未保存切换的提示。

## Out of scope

* 不改修改/删除已有字段的自动保存语义。
* 不做撤销/恢复（由 `06-15-designer-undo-redo-20` 负责）。
* 不新增后端草稿字段列（`is_draft`）。

## Done checklist

* [x] R1–R4 完成
* [x] 前端草稿态回归测试通过
* [x] `node --test tests/*.test.js` 全绿（257 passed）
* [x] 同步更新 `frontend/.claude/CLAUDE.md` 设计器小节
