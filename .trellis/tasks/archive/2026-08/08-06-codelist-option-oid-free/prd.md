# 放开字典选项 OID 字符格式限制

## Goal

码表（字典）**选项**的 `code`（OID 列）与 `decode`（标签）一样，不限制内容格式：允许中文、空格、括号、`/` 等任意字符。表单 OID、字段 `variable_name`、码表本身的 `code` 保持既有严格字符集校验 `^[A-Za-z0-9._-]+$` 不变。

## Background and confirmed facts

- 2026-07-14 的 `07-14-oid-charset-validation` 给所有 OID 类标识符加了统一字符集校验，误伤了码表选项编码——选项编码实际是给人看的取值说明，不参与任何机器标识（aCRF 注释只用 `variable_name`，Word 导出与宽度规划只读 `decode`，无 `v-for :key`/DOM 选择器/URL/正则依赖）。
- 现状死结：简洁模式下选项 OID 输入框被 `v-if="editMode"` 隐藏，但 `updateOpt` 的字符集校验始终生效——存量含中文 code 的选项在简洁模式下改标签会被 `OID 只允许…` 拦住且无从修正。
- `optional_oid_validator` 是 `mode="before"`，承担 4 件事：`str()` 转型、`.strip()`、`""→None`、字符集校验。放开字符集**不能直接删 validator**：`.strip()` 与 `""→None` 保护三元组唯一约束 `(codelist_id, code, decode)` 不产生肉眼相同的重复行，且 `import_service._build_codelist_option_signature` 用 `(index, code, decode)` 做模板导入去重签名，`None` vs `""` 不等会导致重复导入产生副本。
- 已确认无任何对选项 code 字符集的隐式依赖（探索核实：URL 全用数字 id、零动态正则、`v-html` 链路只取 decode 且转义、无按 code 排序/拆分/序列化假设）。

## Requirements

### R1 — 后端 schema（写入边界）

- 新增自由编码规范化器（命名避免含 `oid`，如 `normalize_optional_free_code` / `optional_free_code_validator`），语义：`None`/空/空白 → `None`，非空则 `str(value).strip()`，**不做字符集校验**。
- 应用到 `CodeListOptionCreate` / `CodeListOptionUpdate` / `CodeListOptionBatchUpdate` 的 `code` 字段（`CodeListSnapshotUpdate` 嵌套后者自动跟随）。
- `CodeListCreate.code` / `CodeListUpdate.code`、`FormCreate/Update.code`、`FieldDefinitionCreate/Update.variable_name` 的 OID 校验保持不变。

### R2 — 前端交互边界

- 删除全部选项级 `isValidOptionalOid` 守卫（CodelistsTab `addOpt`/`updateOpt`，FieldsTab `quickAddOptRow`/`quickAddCodelist`/`quickEditAddOptRow`/`quickSaveCodelist`，FormDesignerTab `quickAddCodelist`/`quickSaveCodelist`）。
- 保留：选项 code 非空检查（`!optForm.code.trim()`）、码表级 OID 守卫、字段 `variable_name` 守卫、选项完整性检查（`!opt.code || !opt.decode`）。
- 清理因此未使用的 import（FieldsTab 的 `isValidOptionalOid`）。

### R3 — 存量兼容

- 零迁移、零数据改写；放开后历史含任意字符的 code 均可正常编辑保存。

### R4 — 前后端一致 & 测试

- 前后端行为一致：选项 code 自由文本；其余 OID 仍严格。新增/调整测试（见 implement 清单），全量套件绿。

## Acceptance Criteria

- [x] 后端：选项 code 可含中文/空格/括号/`/` 等，`POST /options`、`PUT /options/{id}`、`PUT /snapshot` 均接受（schema + 路由层回归覆盖）；空/空白归一为 `None`（路由测试断言 `""` 入库为 NULL）；码表级 code 传非法字符仍 422（`test_route_codelist_rejects_invalid_code` 保持）。
- [x] 前端：8 处选项级守卫已删（CodelistsTab / FieldsTab / FormDesignerTab），选项编码任意字符可保存；表单/字段/码表 OID 守卫保留（源码级 wiring 测试反转断言锁定）。
- [x] 简洁模式下编辑含中文 code 的存量选项不再被拦：`updateOpt` 的 `isValidOptionalOid` 已删，仅保留非空检查（源码级断言 `!editOptForm.code.trim()` 仍在）。
- [x] 后端全量 748 passed / 4 xfailed；前端全量 530 passed；lint 0 errors；build OK。
- [x] README 中英、cross-stack-contracts §10、backend/frontend/根 CLAUDE.md 同步。

## Notes

- 轻量任务，PRD-only 即可；不改 ORM、不加迁移。
- 禁止 `npm run format`。
- 相关另一任务 `08-06-template-import-oid-preserve`（in_progress，只碰后端 import_service.py 与模板导入路径）：两任务对 `code` 语义的改动互不冲突，合并时注意 `_build_codelist_option_signature` 的 `None` vs `""` 假设保持一致。
