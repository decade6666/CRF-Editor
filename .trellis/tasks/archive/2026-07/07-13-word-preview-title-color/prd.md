# Word 预览表单名称改为黑色（G2 / 需求 2）

> 父任务：`07-13-designer-fields-ux-batch`

## Goal

将 Word 预览中表单名称（`.wp-form-title`）由当前继承的灰色改为默认黑色，与 Word 导出的标题颜色一致。

## Background and confirmed facts

- `frontend/src/styles/main.css:330`：
  `.word-page .wp-form-title { font-size: 14pt; font-weight: bold; margin-bottom: 24px; text-align: left; }`
  未设置 `color`，标题继承了外层容器的灰色。
- `wordPageGeometry.test.js` 锁定 `.wp-form-title` 的 `text-align: left`（禁止改回 `center` 或引入导致块居中的 `margin: 0 auto`）。
- 参考同文件相邻规则以 `#000` 表示黑色（如 `.word-page td { border: 1px solid #000 }`、`.wp-ctrl { color: #000 }`）。

## Requirements

- R1：`.wp-form-title` 显示为黑色（`color: #000`，与既有黑色约定一致）。
- R2：不改动 `text-align: left`、`font-size`、`font-weight`、`margin-bottom` 等既有几何/排版属性。
- R3：改动只影响预览标题颜色，不影响 Word 导出管线（导出侧标题颜色由后端控制，无需改）。

## Acceptance Criteria

- [ ] AC1：预览中表单名称显示为黑色。
- [ ] AC2：`wordPageGeometry.test.js` 全部通过（`text-align:left` 契约不破）。
- [ ] AC3：`npm run lint`、`npm run build` 通过；如可用浏览器验证，截图确认标题黑色。

## Out of scope

- 其它预览文本颜色、主题变量重构、暗色模式适配（若暗色模式下黑色不合适需另议，本任务按需求只处理默认亮色预览标题）。

## Planning status

PRD-only 轻量任务，单行 CSS 改动，可直接实现。
