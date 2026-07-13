# 复选字段调研结论

## 当前字段类型架构

- `FieldDefinition.field_type` 是未受 enum/check 约束的 `VARCHAR(50)`；新字符串无需 schema migration。
- 普通单选/多选使用 `codelist_id` + `CodeListOption`；前端 `isChoiceField()` 同时驱动字典选择控件、保存校验和 choice HTML 渲染。
- `复选` 不能加入该 helper：它无字典，加入后会在 FieldsTab/FormDesignerTab 要求选择 codelist。

## 渲染影响

- 前端 `useCRFRenderer.renderCtrl` 的未知类型会退回填写线，必须显式处理。
- 后端 `export_service._render_field_control` 的未知类型同样退回填写线；normal/inline/unified 的四个非 choice `else` 分支均会调用它。
- renderer 接收扁平字段对象；FormDesigner/Visits 的适配对象此前不带 label，因此新类型需要显式携带 `label` 和 `checkbox_label`。

## 共享列宽

- 类型专属控件权重在 backend `field_rendering.py` 与 frontend `useCRFRenderer.js` 计算，`width_planning.py` 仅消费数值权重。
- 复选应使用现有 choice atom 权重（□ marker + 文本），而不是通用填写线权重。
- `frontend/scripts/generatePlannerFixtures.mjs` 是 `backend/tests/fixtures/planner_cases.json` 的唯一生成源，修改必须同步跑后端与前端测试。

## 生命周期与兼容性

- 现有 clone/project import/template import 对 null codelist 已安全；但手写 `FieldDefinition(...)` 与 preview mapping 必须显式传递 `checkbox_label`。
- aCRF 标注按字段级变量名生成，未依赖 choice options；无需对固定 OID 1 增加几何/持久化逻辑。
- Word DOCX detection 对复选没有可靠无歧义的规则，本期保留手动类型设置。
