# OID 字符集校验 — Design（req2）

> 父任务：`07-14-crf-editor-batch-fixes` ｜ 子任务：`07-14-oid-charset-validation`
> 先读：`prd.md`。已确认决策：仅编辑时拦截、不迁移存量；空值保持可选。

## 1. 已核实现状

### 后端 schema（Pydantic v2）
- `backend/src/schemas/field.py` 已用 v2 惯用法：`from pydantic import StringConstraints, field_validator, model_validator`；`from typing_extensions import Annotated`。既有别名可直接照抄风格：
  - `HexColor = Annotated[str, StringConstraints(pattern=r"^[0-9A-Fa-f]{6}$")]`（:96）
  - `LabelFontSize = Annotated[str, StringConstraints(pattern=r"^(large|default|small)$")]`（:97）
- OID / 标识符字段（逐个）：
  - **字段标识 = `variable_name`**（`field.py` `FieldDefinitionCreate.variable_name: str`（:32，必填）、`FieldDefinitionUpdate.variable_name: Optional[str]`（:54））。模型层唯一约束 `uq_field_def_var_name (project_id, variable_name)`，确认 `variable_name` 就是字段级 OID。
  - **表单 OID = `code`**（`form.py` `FormCreate.code: Optional[str]`（:93）、`FormUpdate.code: Optional[str]`（:107））。`form.py` 已 `ConfigDict(extra="forbid")`。
  - **码表 OID = `code`**（`codelist.py` `CodeListCreate.code`（:39）、`CodeListUpdate.code`（:47），均 Optional）。
  - **码表选项 OID = `code`**（`codelist.py` `CodeListOptionCreate`（:6）、`CodeListOptionUpdate`（:13）、`CodeListOptionBatchUpdate`（:21），均 Optional）。
- 注：`FormDesignerTab.vue:2844` `prop="code" label="OID"` 属**表单列表**（左侧 form 列表），`code` 即表单 OID，与 `form.py` 一致。

### 前端输入点
- 表单 OID：`FormDesignerTab.vue` `newFormCode`（:4831 `<el-form-item label="OID"><el-input v-model="newFormCode"/>`）、`editFormCode`（:4841）——在 `el-form` 内。
- 字段 `variable_name`：`FormDesignerTab.vue` 属性编辑器、`FieldsTab.vue` 字段编辑。
- 码表 / 选项 `code`：`CodelistsTab.vue`（新增/编辑码表与选项）、以及 `FormDesignerTab.vue`/`FieldsTab.vue` 内联新增/编辑字典的行内 `row.code`（**非 el-form**，需 JS 校验）。

## 2. 方案

### 2.1 字符集
- 正则（前后端一致）：`^[A-Za-z0-9._-]+$`（集合 = `A-Z a-z 0-9 . _ -`）。

### 2.2 后端（写入边界）
定义两个复用别名，放在合适的 schema 模块（建议在 `field.py` 或新建 `backend/src/schemas/_common.py` 供三处 import；以项目现有组织为准）：

```python
# 必填 OID（非空且符合字符集）——用于 variable_name(Create)
OidStr = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9._-]+$")]
```

- **必填字段** `FieldDefinitionCreate.variable_name`：类型改为 `OidStr`（非空 + 字符集）。
- **可选字段**（`FieldDefinitionUpdate.variable_name`、所有 `code`）：保持 Optional，但需「有值才校验、空/空白视为未设」。因 `StringConstraints(pattern="...+$")` 对空串 `""` 会判失败，采用 `field_validator(mode="before")` 归一：

```python
@field_validator("code", mode="before")  # 各 schema 对应字段
@classmethod
def _validate_oid(cls, v):
    if v is None:
        return None
    s = str(v).strip()
    if s == "":
        return None          # 空/空白视为未设，保持可选
    if not re.fullmatch(r"[A-Za-z0-9._-]+", s):
        raise ValueError("OID 只能包含字母、数字、- _ .")
    return s
```

- 统一封装一个可复用的 validator 工厂或 mixin，避免在 4 处 schema 重复粘贴（DRY）。
- 非法值 → Pydantic 抛错 → FastAPI 返回 422，`detail` 含允许字符集说明。

### 2.3 前端（交互边界）
- **el-form 内**（表单 OID、字段 variable_name、码表/选项在 CodelistsTab 的对话框）：给对应 `el-form` 挂 `:rules`，`el-form-item` 绑 `prop`；规则用 `pattern: /^[A-Za-z0-9._-]+$/`，可空字段设 `required:false` 并仅在有值时校验（自定义 `validator` 里空值放行）；提交前 `await formRef.value.validate()`，失败阻止请求并聚焦错误项。
- **非 el-form 的行内输入**（内联字典行 `row.code`）：保存前用等价 JS 正则逐行校验，不过则 `ElMessage.warning('OID 只能包含字母、数字、- _ .')` 拦截。
- 文案统一：`OID 只能包含字母、数字、- _ .`。

### 2.4 存量兼容（不迁移）
- 不新增迁移脚本、不做启动扫描、不批量改写。
- 读取/展示含非法字符的历史记录不受影响；只有用户主动提交该记录时新值需合规。
- 可选字段留空仍可保存（归一为 None/未设）。

## 3. 风险与对策
| 风险 | 对策 |
| --- | --- |
| 可选字段空串被 `+$` 误拒 | `field_validator(mode="before")` 把空/空白归一为 None，仅非空才校验 |
| 存量非法值阻断无关编辑 | 仅在该字段被写入时校验；不改其它字段的更新路径（但注意 Update 若整体校验会带出该字段——见实现步骤，必要时仅在字段出现在 payload 时校验） |
| 前后端正则不一致 | 单一字符集常量，前后端各自锁定同一正则并加测试 |
| 4 处 schema 重复逻辑 | 抽复用 validator/别名，DRY |

## 4. 影响文件
- 后端：`backend/src/schemas/field.py`、`backend/src/schemas/form.py`、`backend/src/schemas/codelist.py`（可选新增 `_common.py`）。
- 前端：`frontend/src/components/FormDesignerTab.vue`、`frontend/src/components/FieldsTab.vue`、`frontend/src/components/CodelistsTab.vue`。
- 测试：后端 schema 校验单测；前端 wiring 测试。
- 文档：如涉及校验契约，同步模块 CLAUDE.md。
