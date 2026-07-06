# PRD:aCRF 视图不显示"标签"类型字段的变量名

## 目标与用户价值
在 aCRF(带标注)视图下,"标签"类型字段是纯展示性的说明/标题文字,没有数据录入,不对应任何 SDTM 变量。当前系统会给它们自动生成并展示 `variable_name`(变量名/OID),导致红色注解浮层出现在本不该被标注的标签字段上,干扰 aCRF 标注的权威性。

本需求让标签字段在 aCRF 相关的三个展示面(两处 Word 预览 + 设计器字段列表)以及导出的 aCRF Word 文档中都不再显示变量名,使"所见即所得"、预览与导出严格一致。

## 背景与确认事实(代码级)
- 标签字段判定:`field_definition.field_type === '标签'`(纯展示字段,无录入)。
- 变量名来源:新建字段时 `genFieldVarName()` 自动生成(`frontend/src/components/FormDesignerTab.vue:2107`),因此标签字段也带 `variable_name`,这是问题根因。
- aCRF 红色注解浮层文本取自字段 `variable_name`(前端)/ 导出注解框(后端)。
- 现有 aCRF 视图仅在完整编辑模式 + `viewMode === 'aCRF'` 下展示(`showAcrfAnnotations`),本需求不改变该触发条件,仅在其内部对标签字段做屏蔽。
- 项目存在"预览/导出严格一致性"契约(`.trellis/spec/guides/cross-stack-contracts.md` §6),故前后端必须同步。
- 经核查:后端仅有 Word 导出与 DB 导出,**无 Define.xml / Excel 数据字典导出**,范围锁定 Word aCRF。

### 涉及展示点与改动锚点
| # | 展示点 | 文件:行 | 现状 |
| --- | --- | --- | --- |
| 1 | 设计器预览 aCRF 字段注解 | `frontend/src/components/FormDesignerTab.vue:109` `getFieldOidAnnotationText` | 读 `variable_name`,标签字段也标注 |
| 2 | 表单界面预览 aCRF 字段注解 | `frontend/src/components/VisitsTab.vue:86` `getFieldOidAnnotationText` | 同上 |
| 3 | 设计器字段列表变量名 | `frontend/src/components/FormDesignerTab.vue:3454-3461` `el-tooltip` + `<span class="ff-var-name">` | `showAcrfAnnotations` 下对标签字段也显示 |
| 4 | 后端 aCRF 导出字段注解 | `backend/src/services/export_service.py:1053` `_field_annotation_text` | 只读 `variable_name`,8 处调用点(2502/2580/2619/2684/2940/2982/3102/3239)单点汇聚,标签行 `_add_label_row`(2953)亦经此 |

## 需求
- R1:表单界面预览(VisitsTab)aCRF 视图下,`field_type === '标签'` 的字段不渲染变量名红色注解浮层。
- R2:表单设计界面预览(FormDesignerTab)aCRF 视图下,标签字段不渲染变量名红色注解浮层。
- R3:表单设计界面字段列表中,aCRF 视图下标签字段行不显示变量名文本与 tooltip,但需保留空白变量名槽位,使标签文字起始位置与其它字段保持一致。
- R4:导出的 aCRF Word 文档中,标签字段不生成变量名 OID 注解框,保持与预览一致。
- R5:非标签字段(文本、单选、多选、日期、日志行等)的变量名展示与导出注解行为完全不变。

## 技术方案要点(单点熔断,无签名改动)
- 前端 R1/R2:在两个 `getFieldOidAnnotationText` 开头加 `if (formField?.field_definition?.field_type === '标签') return ''`。返回空字符串后 `getFieldAnnotationTarget` 已有 `if (!key) return null` 逻辑,自然熔断注解渲染,无需改模板。
- 前端 R3:`FormDesignerTab.vue:3454-3461` 的字段列表在 `showAcrfAnnotations` 下,对非标签字段继续渲染 `el-tooltip + .ff-var-name`,对标签字段改为渲染空白 `.ff-var-name` 占位(无 tooltip、无文本),复用既有宽度样式保持标签对齐。
- 后端 R4:`_field_annotation_text(self, field_def)` 开头加 `if getattr(field_def, "field_type", None) == "标签": return ""`。**已核查 `field_def` 为完整对象、8 处调用点均传入,`field_def.field_type` 可直接访问,无需修改函数签名或调用点**(修正外部分析中"需溯源改 8 处签名"的推测)。

## 边界与风险
- 历史脏数据:`Form.annotation_positions` 中可能以标签字段 `variable_name` 为 key 存有拖动偏移。**无需清洗**——注解文本返回空即不渲染,前后端 target 均为 null,不引用该 key,不报错;保存/重置路径不受影响。
- 响应式:注解由 `field_type` 派生,设计器中把字段切换为/离开标签类型时,注解即时增删,无需额外处理。
- 标签字段其它变量名用途:标签字段的 `variable_name` 仍在数据层存在(不删除),仅在 aCRF 展示/导出层屏蔽;eCRF 视图与字段编辑面板不受影响。

## 验收标准
- AC1(R1/R2):前端 `getFieldOidAnnotationText` 传入 `field_type === '标签'` 的字段返回 `''`;传入非标签字段返回其 `variable_name`。新增/扩展前端 `node:test`(落点 `frontend/tests/acrfViewToggle.test.js` 或新增用例)。
- AC2(R3):aCRF 视图下,字段列表中标签字段行不含变量名 tooltip/文本,但保留空白 `.ff-var-name` 占位节点;非标签字段仍显示变量名。前端 `node:test` 覆盖。
- AC3(R4):后端 `_field_annotation_text` 对标签字段返回 `""`;非标签字段返回 `variable_name`。后端 `pytest` 单元测试。
- AC4(R4 集成):生成含标签字段的 aCRF Word 文档,解析 docx 断言标签字段所在行不含 OID 注解框(`docPr`/注解 run),非标签字段仍含。落点 `backend/tests/test_export_acrf.py`。
- AC5(R5 回归):既有 aCRF 前端与后端测试(`acrfViewToggle.test.js`、`acrfAnnotationGeometry.test.js`、`acrfAnnotationPersistence.test.js`、`test_export_acrf.py`、`test_form_annotation_positions.py`)全部通过,非标签字段行为无回归。

## 范围外
- 不删除或修改标签字段底层 `variable_name` 数据。
- 不改变 aCRF 视图的触发条件(编辑模式 + viewMode)。
- 不改动 eCRF 视图、字段编辑面板中的变量名显示。
- 不涉及 Define.xml / Excel 等其它导出(项目当前不存在)。
- 不改动 `genFieldVarName()` 的自动生成逻辑。

## 分析来源
- Claude 代码级自查(4 处锚点均实证)。
- Antigravity(gemini-pro-agent)独立分析:确认单点熔断为最优、后端必须同步、脏数据无需清洗;其"后端需改 8 处签名"推测经 Claude 核查证伪。
- Codex(gpt-5.4)分析超时(300s,rc=124),按 multi-CLI 回退策略不重试,结论以 Claude 自查 + Antigravity 为准。
