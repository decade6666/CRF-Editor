# OID 字符集校验（req2）

> 父任务：`07-14-crf-editor-batch-fixes`

## Goal

对用户可编辑的 OID / 标识符输入引入严格字符集校验：只允许字母、数字、`-`、`_`、`.`（正则 `^[A-Za-z0-9._-]+$`）。前端阻止提交并给出内联错误，后端在 create/update schema 层拒绝非法值。空值/未填保持可选。

## Background and confirmed facts

- 当前后端 schema 对 OID 字段**无任何字符校验**：`backend/src/schemas/field.py`（`code: Optional[str]`、`variable_name`）、`backend/src/schemas/form.py`（`code`）、`backend/src/schemas/codelist.py`（码表 `code`、选项 `code`）均只是普通字符串。
- 前端 OID 输入点：
  - 表单 OID：`FormDesignerTab.vue` `newFormCode` / `editFormCode`（`editMode` 下的 `<el-input>`）。
  - 字段 OID / 变量名：`FormDesignerTab.vue` 属性编辑器（`editProp.variable_name` 等）、`FieldsTab.vue`。
  - 码表 / 选项编码：`CodelistsTab.vue`、以及 `FormDesignerTab.vue` / `FieldsTab.vue` 内联新增/编辑字典的 `row.code`。
- Element Plus 表单可用 `:rules` + `prop` + `await formRef.validate()` 做前端校验。
- 已确认决策：**仅编辑时拦截，不迁移存量**。含非法字符的历史记录保持不变，直到用户编辑该记录才被要求改正。

## Requirements

### R1 — 后端 schema 校验（写入边界）

- 定义单一可复用约束（如 `OidStr = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9._-]+$")]`，或等价 `field_validator`），应用到所有 OID / 标识符的 create 与 update schema：字段、表单、码表、码表选项。
- 校验**只在有值时生效**：`None` / 空字符串保持合法（保持字段可选语义），不得因为加校验把原本允许留空的字段变为必填。
- 非法值返回 422，错误信息明确指出允许的字符集。

### R2 — 前端输入校验（交互边界）

- 在上述所有 OID 输入所属的 `el-form` 上挂 `:rules`（正则 `/^[A-Za-z0-9._-]+$/`，允许为空时用 `trigger: 'blur'` 校验），对应 `el-form-item` 绑定 `prop`。
- 提交前 `await formRef.validate()`，校验不过则阻止请求并聚焦到错误项，给出中文提示（例：`OID 只能包含字母、数字、- _ .`）。
- 非表单容器内的内联输入（如字典行 `row.code`）在保存前做等价 JS 正则校验并 `ElMessage.warning` 拦截。

### R3 — 存量兼容（不迁移）

- 不新增迁移脚本、不做启动扫描、不批量改写历史数据。
- 读取/展示含非法字符的存量记录不受影响；只有当用户主动编辑并提交该记录时，新值必须满足字符集。

### R4 — 前后端一致 & 测试

- 前后端正则字符集必须一致（同一集合：`A-Z a-z 0-9 . _ -`）。
- 后端补 schema 校验单测：合法值通过、各类非法字符（空格、中文、`/`、`@` 等）被拒、空值/None 仍合法。
- 前端补 wiring 测试：OID 输入项绑定了 rules/prop，提交路径调用 `validate()`。
- 覆盖率不低于基线。

## Acceptance Criteria

- [ ] 在表单/字段/码表/选项的 OID 输入非法字符（空格、中文、特殊符号）时，前端内联报错并阻止保存。
- [ ] 绕过前端直接调用 API 传非法 OID，后端返回 422 且信息说明允许字符集。
- [ ] 留空 OID（可选字段）仍可正常保存。
- [ ] 存量含非法字符的记录不被自动改写；仅在被编辑时要求改正。
- [ ] 后端/前端新增测试通过，全量套件绿。

## Notes

- 实现前需以 `grep` 定位 UI 中标注为 "OID" 的确切绑定字段，确认「字段 OID」到底是 `code` 还是 `variable_name`（表格列 `label="OID"` 绑定 `prop="code"`，但字段定义标识为 `variable_name`），据此确定最终校验字段集，写入 `design.md`。
- 属于校验/边界改动，需在实现后走 `/ccg:verify-security` 快速扫描（输入校验类）。
