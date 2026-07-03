按 TDD 修复 aCRF 标注复位「R」按钮禁用态常显 bug。完整背景见 `.trellis/tasks/06-30-acrf-reset-button-hover-only/prd.md`（已通过 codex+antigravity 双模型审查，PASS）。

## 严格文件范围（只允许改这 3 个文件，禁止其他任何改动）
1. `frontend/src/components/FormDesignerTab.vue` — 仅改 `<style scoped>` 内 `.wp-acrf-annotation-reset:disabled` 相关 CSS（约 L5277-5280）。
2. `frontend/src/components/VisitsTab.vue` — 仅改 `<style scoped>` 内同名 CSS（约 L1497-1499）。
3. `frontend/tests/acrfViewToggle.test.js` — 新增回归断言。

**禁止**：改动按钮 HTML 模板 / `resetAnnotationPosition` / `hasAnnotationOverrideForTarget` 逻辑；禁止把 CSS 抽到 `frontend/src/styles/main.css`；禁止任何与本 bug 无关的重构或格式化。两个组件的这段 CSS 必须保持**完全一致**。

## 根因（已确认）
非 hover 时 `.wp-acrf-annotation-reset:disabled` (0,2,0) 特异性高于基础隐藏 `.wp-acrf-annotation-reset` (0,1,0)，禁用态按钮被强制 `opacity:0.45` 常显；hover 时揭示规则 (0,3,0) 又高于 (0,2,0) 使禁用态变 `opacity:1` 丢失置灰。

## 目标改动（两个 .vue 文件同样修改）
把当前：
```css
.wp-acrf-annotation-reset:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
```
改为：
```css
.wp-acrf-annotation-reset:disabled {
  cursor: not-allowed;
}

.wp-acrf-annotation:hover .wp-acrf-annotation-reset:disabled,
.wp-acrf-annotation:focus-within .wp-acrf-annotation-reset:disabled {
  opacity: 0.45;
}
```
- 保留基础 `.wp-acrf-annotation-reset { opacity: 0 }` 与揭示规则 `.wp-acrf-annotation:hover/:focus-within .wp-acrf-annotation-reset { opacity: 1 }` 不动。
- 不要用 `.wp-acrf-annotation-reset:disabled { opacity: 0 }` 简写（会在 hover 时丢失置灰反馈）。

## 新增回归断言（TDD：先加断言确认失败 → 再改 CSS → 确认通过）
在 `acrfViewToggle.test.js` 中新增测试（可复用现有 `extractRuleBody` / `countMatches` helper），对 FormDesignerTab 和 VisitsTab **两份源码**分别锁定：
1. 裸 `.wp-acrf-annotation-reset:disabled` 规则体**不含** `opacity`（正则确保不会退回无条件置灰）。
2. 存在 `.wp-acrf-annotation:hover .wp-acrf-annotation-reset:disabled` 且其规则体含 `opacity: 0.45`（`:focus-within` 变体一并存在）。
3. 原始揭示规则 `.wp-acrf-annotation:hover .wp-acrf-annotation-reset`（非 :disabled）规则体仍含 `opacity: 1`（防误删导致启用态也无法显示）。

注意 `extractRuleBody` 用 `indexOf` 定位，`.wp-acrf-annotation-reset:disabled` 子串在裸规则与揭示规则中都出现——请用足够精确的正则或按整行/选择器前缀断言，避免误配；断言必须真实反映规则语义。

## 验证（必须实际运行并贴结果）
```bash
cd frontend
node --test tests/*.test.js
npm run lint
```
- 先在改 CSS 前跑新测试，确认新断言 RED（失败）；再改两处 CSS，确认全部 GREEN。
- 报告：运行的命令、通过/失败数、lint 结果；若有未跑项明确说明。

## 输出
- 修改摘要（3 文件各改了什么）
- `node --test` 与 `npm run lint` 实际输出摘要（通过数/失败数）
- 任何偏离本任务范围的地方（应为无）
