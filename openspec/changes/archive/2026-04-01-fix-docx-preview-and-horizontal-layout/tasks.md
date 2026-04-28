## 1. 统一横向宽度语义契约

- [x] 1.1 在 `backend/src/services/export_service.py` 中抽离横向表宽度规划入口，替换 legacy inline 与 unified 的等宽分配逻辑
- [x] 1.2 在 `backend/src/services/field_rendering.py` 或等价辅助层补齐内容 token / 字符权重输入，确保宽度规划仅依赖确定性语义输入
- [x] 1.3 在前端预览链路中实现同语义的宽度规划辅助逻辑，确保 `FormDesignerTab.vue` 与 `useCRFRenderer.js` 输出显式列宽语义而非纯 fixed-table 回退

## 2. 修复 choice trailing token 不拆行

- [x] 2.1 在后端导出中把 `trailing_underscore` 选项渲染为原子 token，保证”文本 + 尾线”不可拆分
- [x] 2.2 在前端 HTML 预览中对同一语义使用 no-wrap 原子包装，保证预览与导出行为一致
- [x] 2.3 复核横向与纵向 choice 两条路径，确保该约束同时覆盖 `单选`、`多选`、`单选（纵向）`、`多选（纵向）`

## 3. 修正排序语义

- [x] 3.1 将 choice 选项排序主键从 `id` 调整为 `order_index`，仅在缺失时使用稳定回退键
- [x] 3.2 确保前端与后端对同一 choice 数据使用一致的排序契约

## 4. 回归与性质验证

- [x] 4.1 为 `legacy inline` 补充测试：列宽非等宽、超预算时按比例缩放、总宽度不超页宽
- [x] 4.2 为 `unified_landscape` 补充测试：同一表内多个 inline block 共享同一宽度规划语义
- [x] 4.3 为 `trailing_underscore` 补充测试：横向与纵向 choice 中”文本 + 尾线”不可拆分
- [x] 4.4 为排序补充测试：`order_index` 生效且 `id` 扰动不改变顺序
- [x] 4.5 提取并落地 PBT / invariant 测试，至少覆盖宽度预算、安全缩放、幂等性、排序稳定性四类性质

## 5. 集成交付检查

- [x] 5.1 验证前端设计器实时预览与导出 Word 对同一表单的横向宽度趋势一致
- [x] 5.2 验证普通 2 列表与非横表路径无回归
- [x] 5.3 验证 `mixed + max_block_width > 4` 仍是 `unified_landscape` 的唯一触发条件
