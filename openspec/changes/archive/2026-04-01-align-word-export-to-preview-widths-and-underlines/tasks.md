## 1. 冻结共享语义输入

- [x] 1.1 在规划实现中明确 `FormDesigner` 为唯一对齐基准，并把可见内容需求作为宽度规划的唯一高层输入
- [x] 1.2 在后端宽度规划入口中定义 unified 横向表的单表级作用域，避免多个 inline block 需求向量简单拼接
- [x] 1.3 定义 `trailing_underscore` 的共享语义与兼容层边界，禁止把固定下划线字符数量当作高层语义
- [x] 1.4 定义多行 `default_value` 的统一规则，确保预览与导出不再分裂为单行/多行两套语义

## 2. 调整后端宽度规划与导出消费路径

- [x] 2.1 在 `backend/src/services/width_planning.py` 中实现或修正按列槽位取最大的 unified 聚合规则
- [x] 2.2 在 `backend/src/services/export_service.py` 中让 unified 横向表消费单表级 `WidthPlan`，禁止长度失配时直接回退等宽
- [x] 2.3 在 `backend/src/services/export_service.py` 中让 legacy inline 路径消费 choice、fill-line、unit、多行默认值等可见内容语义，而不是仅依赖 header 与裸值文本
- [x] 2.4 在导出 choice 路径中把 `choice_atom` 视为不可拆分视觉单元，消除标签与尾部线之间的异常视觉伪影

## 3. 最小化对齐 FormDesigner 预览

- [x] 3.1 在 `frontend/src/components/FormDesignerTab.vue` 中仅为 canonical preview 补齐必要的显式宽度语义输出
- [x] 3.2 如确有必要，在 `frontend/src/composables/useCRFRenderer.js` 中补齐 choice atom / fill-line / 多行默认值相关共享渲染辅助
- [x] 3.3 在 `frontend/src/styles/main.css` 中补齐支撑列宽表达与 no-wrap choice atom 的最小样式改动，避免影响无关页面

## 4. 补齐测试与性质验证

- [x] 4.1 在 `backend/tests/test_width_planning.py` 中增加预算安全、槽位最大需求单调性、scale-to-fit 相对关系保持、规划幂等性测试
- [x] 4.2 在 `backend/tests/test_export_unified.py` 中增加 unified 多 inline block 共享单表级宽度语义的回归测试
- [x] 4.3 增加 choice 导出测试，覆盖横向与纵向路径下 `trailing_underscore` 标签与尾部填写线不可分离
- [x] 4.4 增加多行 `default_value` 回归测试，验证预览参考语义与导出语义保持一致
- [x] 4.5 使用 `python -m pytest` 作为仓库上下文下的测试执行入口，验证相关测试全部通过

## 5. 收口验收

- [x] 5.1 验证长标签、长选项标签、带填写线语义的列在 Word 导出中相对短内容列获得更大宽度
- [x] 5.2 验证同一表单在 FormDesigner 预览与 Word 导出中呈现一致的宽度趋势，而非像素级一致性要求
- [x] 5.3 验证既有 unified 触发条件与页面宽度预算保持不变，且非目标路径无回归
