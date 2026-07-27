# 数据库类型选项与多选字段类型控制

## Goal

给项目增加「数据库类型」开关（赛美斯 / 其他），并在「其他」模式下封堵多选字段的新增路径，同时保留存量多选字段可读、可渲染、可导出、可改成其他类型，但改走后不可再改回多选。

## Background / Confirmed Facts

- 「项目信息」页位于 `frontend/src/components/ProjectInfoTab.vue`，版本号字段在模板第 91 行；新建项目对话框在 `App.vue`。
- `Project` 当前无 `db_type` 列；创建/更新路由字段无关，但 clone / project-import 的 `Project(...)` 是显式 kwarg 列表。
- 字段类型为自由字符串；可编辑下拉仅在 `FieldsTab.vue` 与 `FormDesignerTab.vue`；`docxAiSuggestionOverrides.js` 的 `VALID_FIELD_TYPES` 与后端 `ai_review_service.VALID_FIELD_TYPES` 字节对齐。
- DOCX 解析结果不跨 preview/execute 持久化，仅 temp 文件存活；两端都会 `parse_full`，索引契约依赖确定性解析。
- `复选` 当前不在 DOCX 导入路径与 AI `VALID_FIELD_TYPES` 中。

## Requirements

### R1. 项目级数据库类型

- 在「项目信息」→「版本号」下方增加单选「数据库类型」，选项「赛美斯」「其他」，默认「其他」。
- 新建项目默认「其他」；存量项目迁移后统一为「其他」。
- 值持久化到 `project.db_type`，经 create/update/list/get、项目复制、项目 `.db` 导入（含 legacy 兼容）往返。

### R2. 「其他」模式下的多选管控

- 字段库与表单设计器类型下拉隐藏「多选」「多选（纵向）」。
- 存量多选字段：下拉显示当前值但 `disabled`；可改为其他类型；改走后不可回选。
- 后端在 field-definition 创建/更新时拦截：项目为「其他」且目标类型为多选/多选（纵向）→ 400 中文错误。
- 更新拦截必须只在 `field_type` 真正变更时触发（幂等 PUT 改标签不得 400）。
- 字段复制允许保留多选（存量迁移语义）。
- 渲染 / 导出 / 列宽规划继续支持多选（勿删渲染路径）。

### R3. DOCX 导入拆分（「其他」）

- 解析阶段拆分，使 preview 与 execute 所见一致。
- 纵向/简单表：1 个「标签」（原题干）+ 每选项 1 个「复选」（`label`=选项文字，`checkbox_label` 缺省 → ✔）。
- 内联/横向表：N 个「复选」，保留 `inline_mark`，不插标签行，label 为 `原标签-选项`（≤255）。
- 空 options 兜底：纵向 → 单标签；内联 → 单文本 + `inline_mark`。

### R4. AI 建议

- 解析先拆；「其他」模式下提示词禁止建议多选，并允许一对多 `suggested_fields` 替换协议（向后兼容一对一）。
- 共享 `VALID_FIELD_TYPES` 9 项字节锁不变；项目级子集过滤不参与锁。
- execute 侧拒绝「其他」项目上的多选 `ai_overrides`。

## Acceptance Criteria

- [ ] AC1: 项目信息在版本号下可编辑「数据库类型」；默认/存量为「其他」；API 往返正确。
- [ ] AC2: 「其他」项目新建多选/多选（纵向）前后端均拒绝；「赛美斯」允许。
- [ ] AC3: 「其他」项目存量多选可显示、可改出、不可改回；仅改标签的 PUT 成功。
- [ ] AC4: 项目复制与 legacy 项目 `.db` 导入保留/默认 `db_type`。
- [ ] AC5: 「其他」下 DOCX 预览与导入对纵向/内联多选按规则拆分，且 preview/execute 索引一致。
- [ ] AC6: AI「其他」模式不建议多选；一对多协议可接受时正确应用；字节对齐锁仍绿。
- [ ] AC7: 后端 pytest + 前端 node:test + lint 通过；禁止 `npm run format`。

## Out of Scope

- 模板库导入对多选的拆分或拒绝（已知缺口，本次不修）。
- DOCX 截图对内联拆分 label 的页码精确定位（v1 接受「未定位到原文页」）。
- 合并三个前端字段类型字面量数组。

## Decisions

| 项 | 结论 |
|---|---|
| 后端拦截 | 是 |
| 存量默认 | 其他 |
| 存量下拉 | 显示当前值 disabled |
| DOCX | 解析阶段拆分 |
| 纵向形状 | 标签 + N 复选（左=选项名，右=✔） |
| 内联形状 | N 复选 + 前缀，无标签行 |
| AI | 解析先拆 + 一对多协议 |
| 复制字段 | 允许 |
| 模板导入 | 暂不处理 |
