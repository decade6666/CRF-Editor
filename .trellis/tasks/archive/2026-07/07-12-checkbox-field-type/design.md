# 复选字段技术设计

## Architecture

`复选` 是普通 `FieldDefinition` 的一种独立渲染类型，不复用字典驱动的选择字段路径。虚拟选项的固定 OID `1` 是领域语义，不需要持久化 `CodeListOption`。

```text
FieldDefinition
  field_type = "复选"
  checkbox_label = nullable custom text
  codelist_id = null

resolveCheckboxText = checkbox_label || label || ""
rendered control  = "□" + resolveCheckboxText
```

`checkbox_label` 为 `null`/空时不写入一份标签副本，直接实时回退 `FieldDefinition.label`；因此字段标签更新会反映到未自定义的复选文本。

## Persistence and API Contract

- `backend/src/models/field_definition.py`：新增可空 `VARCHAR(255)` 的 `checkbox_label`。
- `backend/src/database.py`：采用幂等的列存在性探测 + SQLite `ALTER TABLE` 轻量迁移；不改变既有字段类型列或字典表。
- `backend/src/schemas/field.py`：Create/Update/Response 统一传递可空字段。
- 复制和导入路径必须显式复制该属性，避免使用手写字段白名单时丢失：`project_clone_service.py` 与 `import_service.py`。

## Rendering and Width Contract

### Frontend

- `useCRFRenderer.js::renderCtrl` 为 `复选` 添加独立分支；不改 `isChoiceField()`，HTML 路径通过既有 `toHtml(renderCtrl(...))` 保持转义安全。
- `computeFieldControlWeight` 创建扁平渲染字段时必须保留 `label` 与 `checkbox_label`，并将 `□ + resolved text` 的 `computeChoiceAtomWeight` 作为控件权重。
- FormDesigner、Visits、SimulatedCRF 的扁平 renderer 输入均需携带 `checkbox_label`；FormDesigner/Visits 还需明确传递字段定义标签。

### Backend

- `export_service.py::_render_field_control` 在单选/多选分支之前单独处理 `复选`。
- 四条 table 渲染路径的普通字段 `else` 已调用 `_render_field_control(field_def)`，因此不把复选加入字典 choice 条件即可覆盖 normal、inline 和 unified 布局。
- `field_rendering.py::build_field_control_weight` 对 `复选` 使用与前端相同的 `compute_choice_atom_weight(resolved_text, False)`。

### Layout and aCRF

- `formFieldPresentation.js` 不把复选列为结构字段；它继续走 `regular_field`，生成“标签 | 控件”两列。
- aCRF 几何和批注继续按字段变量名工作，不新增选项 OID 标注或位置数据。

## Editing Semantics

- 复选文本 UI 仅在 `field_type === '复选'` 时显示。
- `FieldsTab` 的本地类型切换必须清空从数值/日期/选择/单位类型遗留的专属数据，特别是 `codelist_id`。
- `formDesignerPropertyEditor::syncFieldTypeSpecificProps` 已能因 `!isChoiceField('复选')` 清空 `codelist_id`；补充在切换到非复选类型时清空 `checkbox_label`。
- 普通选择字段仍按原有机制必选字典；复选永不触发该校验。

## Compatibility

- ORM 字段类型是无约束字符串，既有数据库会通过新增可空列兼容。
- `null` codelist 已在复制、项目导入与模板导入中具备安全路径；补齐 `checkbox_label` 显式映射即可。
- DOCX 导入不新增推断规则；AI/Docx 类型建议不作为本期创建入口。

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| 未处理独立分支导致渲染为填写线 | 前后端渲染测试锁定 `□文本`，覆盖默认/自定义两种数据。 |
| renderer 扁平对象丢失 label | 在 FormDesigner、Visits 和 width planner 的适配对象中显式补字段，并加预览回归。 |
| 复选误进入 choice 路径并要求字典 | 保持 `isChoiceField` 不变，测试保存与属性面板。 |
| 长文本列宽不足导致浏览器/Word 换行 | 前后端同时使用 choice atom 权重，重生成共享 fixture。 |
| 导入/复制遗漏新列 | 覆盖 clone、项目导入和模板导入的保真测试。 |
