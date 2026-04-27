# Spec: R9 — 模板导入支持变量级选择

## Scope
前端：模板导入弹窗字段勾选交互。
后端：模板导入执行请求校验与依赖闭包。

## Functional Requirements

### FR-9.1 请求体
继续使用当前最小请求体：
```json
{
  "source_project_id": 1,
  "form_ids": [11],
  "field_ids": [101, 102]
}
```
- `form_ids` 必填。
- `field_ids` 可选；缺失表示整表单导入。

### FR-9.2 字段归属校验
- `field_ids` 出现时，所有字段必须属于 `source_project_id`。
- `field_ids` 出现时，所有字段必须属于 `form_ids` 指定的表单。
- 非法字段、重复字段或跨表单/跨项目字段一律返回 400。

### FR-9.3 依赖闭包
- 字段级导入时，后端必须补齐必要依赖：
  - `field_definition`
  - `unit`
  - `codelist`
  - `codelist_option`
- 不得产生孤立引用或重复冲突脏数据。

### FR-9.4 顺序
- 导入字段保留源 `order_index` 的相对顺序。
- 写入目标表单后重新压实为稠密序号。

### FR-9.5 前端交互
- 用户先选表单，再可查看字段列表并选择子集。
- 进入“选择导入”模式但未选择任何字段时，不允许提交。

## Acceptance Criteria
- [ ] 用户可在所选表单下勾选字段子集
- [ ] 导入结果仅包含所选字段及其依赖闭包
- [ ] 非法 `field_ids` 返回 400
- [ ] 导入后字段顺序可预期且为稠密序号
- [ ] 不产生孤立引用与重复脏数据
