# fix: aCRF 复位「R」按钮禁用态常显应改为 hover 显示

## Goal

统一 aCRF 视图下变量名标注框右上角「圆圈 R」复位按钮的显示时机：所有标注一律鼠标悬停（hover / focus-within）才显示复位按钮，消除部分标注常显的问题。涉及表单设计界面（FormDesignerTab）和访视表单预览界面（VisitsTab）两处 Word 预览。

## What I already know

- 「圆圈 R」= 标注框右上角的复位按钮 `wp-acrf-annotation-reset`（圆形边框 `border-radius:999px` + 文字「R」），点击调用 `resetAnnotationPosition` 将该标注竖直偏移复位到默认值。
- 按钮 `:disabled` 绑定 `!hasAnnotationOverrideForTarget(target)`：**未拖动过（无持久化 override）的标注 → 按钮 disabled；已拖动过 → 按钮 enabled**。
- 设计意图：`opacity:0` 默认隐藏，`.wp-acrf-annotation:hover / :focus-within` 时 `opacity:1` 显示。
- 两个组件各自维护一份**完全相同**的 scoped CSS：
  - `frontend/src/components/FormDesignerTab.vue` L5241-5280
  - `frontend/src/components/VisitsTab.vue` L1461-1499

## Root Cause (已确认，含双模型审查修正)

CSS 特异性泄漏。特异性记作 (id, class+pseudo-class, type)：

| 规则 | 特异性 | opacity |
| --- | --- | --- |
| `.wp-acrf-annotation-reset`（基础隐藏） | (0,1,0) | 0 |
| `.wp-acrf-annotation-reset:disabled`（禁用置灰） | (0,2,0) | 0.45 |
| `.wp-acrf-annotation:hover .wp-acrf-annotation-reset`（hover 显示） | (0,3,0) | 1 |

- **主因（常显）**：非 hover 时，`:disabled` (0,2,0) 高于基础隐藏 (0,1,0)，禁用态按钮被强制 `opacity:0.45` 常显。
- **次因（审查补充，同一处修复顺带解决）**：hover 时，揭示规则 (0,3,0) 又高于 `:disabled` (0,2,0)，导致禁用态按钮在 hover 时以 `opacity:1` 显示，**丢失置灰反馈**（看起来和可点击的启用态一样）。
- 结果对照：未拖动过的标注（disabled）→ 复位 R 常显 0.45、hover 时变实心 1；已拖动过的标注（enabled）→ 正确的 hover-only。这与「有的常显、有的 hover 才显示」现象完全吻合。

> 注：Vue `scoped` 会给每条规则追加 `[data-v-xxx]` 属性选择器，各规则同等 +1，相对胜负关系不变（codex 已核实）。

## Requirements

- 禁用态复位按钮在非 hover 时必须保持完全隐藏（`opacity:0`）。
- 保留禁用态在 hover / focus-within 揭示时的置灰视觉（`opacity:0.45` + `cursor:not-allowed`），使「无可复位内容」有可辨识反馈。
- 启用态复位按钮维持原行为：hover / focus-within 时 `opacity:1`。
- FormDesignerTab 与 VisitsTab 两份 CSS 同步修改，保持一致。

## Technical Approach

将「禁用置灰」从无条件规则改为**限定在 hover/focus-within 揭示上下文内**，不再覆盖基础隐藏态：

```css
/* 保留：仅光标语义，不再设置 opacity */
.wp-acrf-annotation-reset:disabled {
  cursor: not-allowed;
}

/* 新增：禁用态仅在揭示时置灰，特异性 (0,3,0) 高于揭示-启用态 (0,2,0) */
.wp-acrf-annotation:hover .wp-acrf-annotation-reset:disabled,
.wp-acrf-annotation:focus-within .wp-acrf-annotation-reset:disabled {
  opacity: 0.45;
}
```

新规则特异性 `.wp-acrf-annotation:hover .wp-acrf-annotation-reset:disabled` = (0,4,0)，高于揭示-启用态 (0,3,0)：

- 非 hover：基础规则 `opacity:0` 生效（两态都隐藏）✅
- hover：启用态 (0,3,0)→1，禁用态 (0,4,0)→0.45 ✅
- **反例警告**：不可简写成 `.wp-acrf-annotation-reset:disabled { opacity: 0 }`——它 (0,2,0) 低于揭示规则 (0,3,0)，hover 时禁用态会被强制 `opacity:1`，反而丢失置灰反馈（双模型一致确认）。

## Acceptance Criteria

- [ ] 未拖动过的标注：默认不显示复位 R；鼠标悬停标注框（或键盘聚焦进入标注区 `:focus-within`）时以置灰态显示复位 R。
- [ ] 已拖动过的标注：默认不显示复位 R；鼠标悬停或键盘聚焦进入标注区时以实心态显示可点击复位 R。
- [ ] FormDesignerTab 和 VisitsTab 两处预览行为一致。
- [ ] 新增源码级回归测试锁定以下三条断言（防回退，codex + agy 一致建议）：
  1. 裸 `.wp-acrf-annotation-reset:disabled` 规则不再包含 `opacity`；
  2. 两组件都存在 `.wp-acrf-annotation:hover/:focus-within .wp-acrf-annotation-reset:disabled { opacity:0.45 }`；
  3. 原始 `.wp-acrf-annotation:hover/:focus-within .wp-acrf-annotation-reset { opacity:1 }` 揭示规则仍保留（防止误删导致启用态也无法显示的更严重回退）。
- [ ] `node --test tests/*.test.js` 全绿。

## Definition of Done

- 两文件 CSS 同步修改。
- 回归测试新增并通过；现有 aCRF 测试不回归。
- 前端 lint 通过。

## Out of Scope

- 复位按钮的图标/文案/尺寸/颜色调整。
- 标注拖动、持久化、导出几何逻辑。
- `:focus-within` 在点击复位后按钮保持焦点导致短暂驻留的次要交互（非本次「常显」根因）。

## Decision (ADR-lite)

- **Context**：aCRF 标注复位「R」按钮部分常显，需统一为 hover-only；同时 codex + agy 双模型审查 PRD。
- **Decision**：
  1. 禁用态 hover 行为采用「置灰显示」（用户选择 A）——保留「无可复位」反馈。
  2. 用「`:disabled` 仅留 cursor + 揭示上下文内置灰规则」的特异性收口方案，不用 `:disabled{opacity:0}` 简写。
  3. 本次**保持两组件 CSS 同步修改，不抽全局 main.css**（两处均在 `<style scoped>`，全局化会打散 scoped 组织并扩大测试面）；未来若出现第三处复用，再考虑抽 `AcrfAnnotation.vue` 共享子组件（agy/codex 一致建议）。
- **Consequences**：改动面 = 2 文件 CSS + 1 测试文件；顺带修复 hover 丢失置灰的次要 bug；遗留巨石组件重复 CSS 的历史债务（记为后续 refactor 候选）。
- **审查结论**：codex = PASS，antigravity = PASS，均无 Critical。已折入本 PRD 的特异性修正、验收/测试补强。

## Technical Notes

- 相关测试目录 `frontend/tests/`，现有 `acrfViewToggle.test.js` 未锁定复位按钮 opacity/hover，可安全新增断言。
- 无后端改动；不涉及跨栈 aCRF 几何契约（§6）。
