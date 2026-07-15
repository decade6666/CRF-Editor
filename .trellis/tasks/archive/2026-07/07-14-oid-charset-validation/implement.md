# OID 字符集校验 — Implement（req2）

> 子任务：`07-14-oid-charset-validation` ｜ 先读：`prd.md` → `design.md`
> 原则：TDD 先红后绿；仅编辑时拦截、不迁移；空值保持可选。改 `FormDesignerTab.vue` 与其它同文件子任务串行。

## 相关文件与锚点
- 后端 schema：
  - `backend/src/schemas/field.py`：`FieldDefinitionCreate.variable_name`（:32 必填）、`FieldDefinitionUpdate.variable_name`（:54 可选）。
  - `backend/src/schemas/form.py`：`FormCreate.code`（:93）、`FormUpdate.code`（:107）。
  - `backend/src/schemas/codelist.py`：`CodeListCreate.code`（:39）、`CodeListUpdate.code`（:47）、`CodeListOptionCreate.code`（:6）、`CodeListOptionUpdate.code`（:13）、`CodeListOptionBatchUpdate.code`（:21）。
- 前端输入：`FormDesignerTab.vue`（`newFormCode`:4831 / `editFormCode`:4841 / 属性编辑器 variable_name / 内联字典行 `row.code`）、`FieldsTab.vue`、`CodelistsTab.vue`。
- 字符集常量：`^[A-Za-z0-9._-]+$`。

## 有序执行清单（TDD）

### S1 — 后端校验单测（RED）
- [ ] 新增/扩展 `backend/tests/`（如 `test_oid_validation.py`）：
  - 合法：`AE01`、`a.b-c_d`、`DM.01` 通过（各 Create/Update schema）。
  - 非法：含空格、中文、`/`、`@`、`#`、`:` 的值被拒（`ValidationError`）。
  - 可选字段：`None`、`""`、`"   "` 合法且归一为未设（None）。
  - 必填 `variable_name`（Create）：空值/非法被拒。
  - 路由层：绕过前端直接 `POST/PUT` 传非法 OID 返回 422（挑代表性端点：表单、字段定义、码表、选项）。
- [ ] 运行确认失败：`cd backend && python -m pytest tests/test_oid_validation.py -q`。

### S2 — 后端实现（GREEN）
- [ ] 定义复用别名/`field_validator`（见 design 2.2），DRY 应用到 4 组 schema 的 OID 字段。
- [ ] 必填 `variable_name(Create)` 用 `OidStr`（非空+字符集）；可选字段用 `mode="before"` validator（空→None、非空才校验字符集）。
- [ ] 错误信息含允许字符集说明。
- [ ] 复跑 S1 转绿；再跑相关既有套件确认无回归：`cd backend && python -m pytest tests/test_forms*.py tests/test_field*.py tests/test_codelist*.py -q`（按实际存在的测试文件）。

### S3 — 前端 wiring 测试（RED）
- [ ] 扩展/新增前端测试（源码级 wiring，风格参考 `frontend/tests/` 现有 wiring 用例）：
  - 表单 OID / 字段 variable_name / 码表 / 选项 的 `el-form` 挂了 `:rules` 且 item 绑 `prop`；提交路径调用 `validate()`。
  - 内联字典行保存前有 JS 正则校验 + `ElMessage` 拦截。
- [ ] 运行确认失败：`cd frontend && node --test tests/<新增或相关>.test.js`。

### S4 — 前端实现（GREEN）
- [ ] `FormDesignerTab.vue`：表单 OID 对话框 `el-form :rules` + 提交前 `validate()`；属性编辑器 variable_name 校验；内联字典行 `row.code` JS 正则拦截。（改 FormDesignerTab.vue，注意串行）
- [ ] `FieldsTab.vue`：variable_name / 内联字典行校验。
- [ ] `CodelistsTab.vue`：码表 `code` / 选项 `code` 校验。
- [ ] 文案统一 `OID 只能包含字母、数字、- _ .`；可空字段留空放行。
- [ ] 复跑 S3 转绿。

### S5 — 全量回归
- [ ] `cd backend && python -m pytest`
- [ ] `cd frontend && node --test tests/*.test.js`
- [ ] 覆盖率不低于基线。

### S6 — 复核与文档
- [ ] `/ccg:verify-security`（输入校验类，确认无绕过、错误可观测）。
- [ ] `code-reviewer`（前后端一致性、DRY）。
- [ ] 如涉及校验契约，同步模块 CLAUDE.md / README（本任务纯校验，改动小，按需）。

## 回滚点
- 后端校验（S2）与前端校验（S4）为独立回滚边界；若后端校验意外阻断存量无关编辑，先核查是否对「未出现在 payload 的字段」误校验，再决定收窄到「仅字段出现时校验」。

## 验收对齐（见 prd.md）
- 前端非法字符内联报错阻止保存 / 后端 422 / 可选留空可存 / 存量不被改写 / 前后端测试绿。
