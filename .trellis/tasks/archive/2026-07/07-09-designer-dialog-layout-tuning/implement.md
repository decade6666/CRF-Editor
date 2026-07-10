# Implement — 表单设计弹窗界面调整

## 执行顺序（单文件为主，逐点改、每点后自查）
1. **新增 composable** `frontend/src/composables/usePaneSplit.js`（R1/R4 基础）。
2. **R3**（最小、独立）：`FormDesignerTab.vue` 字段列表复选框 `:label="ff.id"` → `:value="ff.id"`。
3. **R2**：属性编辑非日志行分支内，OID `el-form-item` 上移到 `字段标签` 之前。
4. **R1 + R4**：接入 `usePaneSplit`（两组 `ratio`/`startResize` + 两个 `computed` rows），template 加两条 `.pane-v-resizer` 并绑定 `:style` gridTemplateRows；CSS 调整 `.designer-side-pane` / `.designer-workspace`（去固定 rows/gap）+ 新增 `.pane-v-resizer`。
5. **R5**：`button.fd-item` 内容按 `showAcrfAnnotations` 两分支重构（aCRF 两行 + 类型跨行；eCRF 单行）。
6. **R6**：字段库各行 span 外包 `el-tooltip`（按行 content），新增 ellipsis 类 CSS。
7. **测试**：更新 `tests/orderingStructure.test.js` 布局断言；新增 `tests/paneSplit.test.js`。
8. **验证**：`npm run lint`、`node --test tests/*.test.js`、`npm run build`；浏览器（dev :5173）验证 6 点交互与持久化。

## 校验命令
```bash
cd frontend && npm run lint
cd frontend && node --test tests/*.test.js
cd frontend && npm run build
```

## 风险 / 回滚点
- 步骤 4 改动 grid + 测试断言，风险最高：先跑 `orderingStructure.test.js` 定位需同步的断言，改完立即回归。
- el-tooltip 包裹 flex 列内 span 可能影响省略号：沿用既有 `ff-var-name` 范式（span 自身 block + ellipsis）规避。
- 回滚：`git checkout -- frontend/src/components/FormDesignerTab.vue frontend/tests/orderingStructure.test.js` 并删除新增 `usePaneSplit.js` / `paneSplit.test.js`。

## Review Gates
- 代码改动 > 30 行 → 交付前跑 `/ccg:verify-quality`（复杂度/命名/函数长度）与 code-reviewer。
- 无安全面变更（纯前端布局），跳过 security-reviewer。
- 覆盖率不低于既有；新增 composable 必带单测。
