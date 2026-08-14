# 全局搜索与五类列表交互统一 — 实施计划

## 实施顺序（TDD）

1. 搜索算法：先在 `frontend/tests/searchRanking.test.js` 补新契约（四层级、长度边界、相似度下限、稳定排序、多候选、空词原序），跑红；再重写 `searchRanking.js` 至绿。
2. locale：`frontend/src/main.js` 引入 `element-plus/es/locale/lang/zh-cn`，`app.use(ElementPlus, { locale: zhCn })`；检查依赖按钮文本的既有测试（appSettingsShell 等）。
3. selection 居中：`frontend/src/styles/main.css` 加全局规则；扩展 `tableHeaderStyle.test.js`。
4. 五类页面图标化（每页同步更新源码级测试）：
   - `CodelistsTab.vue`（字典 + 选项两个表格）
   - `UnitsTab.vue`
   - `FieldsTab.vue`
   - `FormDesignerTab.vue` 外层表单列表
   - `VisitsTab.vue`（访视 + 关联表单）
5. 全量验证 + 浏览器实机。

## 验证命令

```bash
cd frontend && node --test tests/searchRanking.test.js tests/searchRankingWiring.test.js
cd frontend && node --test tests/*.test.js
cd frontend && npm run lint
cd frontend && npm run build
cd backend && python3 -m pytest -q
```

## 风险与回滚点

- locale 变更可能影响断言 OK/Cancel 的既有测试 → 全量 grep 后同步。
- 图标化后 data-test 必须保留；业务函数零改动。
- `FormDesignerTab.vue` 只改外层模板；若发现全屏相关测试受影响，说明改错了范围。
- 回滚单位 = 整条 PR；CI 自动合并，不手动 merge。
