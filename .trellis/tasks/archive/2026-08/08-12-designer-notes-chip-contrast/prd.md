# 设计器顶栏备注 chip 与表单名视觉分隔

## Goal

让「表单」tab 主画布顶栏、以及全屏设计器「实时预览」标题栏里的设计备注摘要，在明暗两套主题下都能一眼看出是独立的备注 chip，而不是表单名的续写。

## Background

PR#67 / PR#69 已修好「多行只显示第一行 + 悬停按原文换行 + 框宽贴合文字」。用户在暗色主题下重新 `npm run build` + 重启服务后反馈：顶栏文字连成 `知情同意1.赛美斯：…`，虚线框几乎看不见。

根因是 chip 用 `--color-bg-hover` 底 + `1px dashed --color-border`，叠在顶栏 `--color-primary-subtle` 上。暗色三色几乎同色（`#17242d` / `#253845` / `#14232e`），框与底融为一体。全屏 `.designer-section-title` 本身就是 `--color-bg-hover`，chip 填充与标题栏完全相同。

用户已确认：只加强对比，不加「备注」前缀、不改摘要/浮窗文案。

## Requirements

- R1. `.fd-canvas-header-notes` 改为卡片底 + 实线边：`background: var(--color-bg-card)`、`border: 1px solid var(--color-border)`。保留 muted 文字、单行 ellipsis、`flex: 0 1 auto`、`min-width: 0`、`max-width: none`、`padding: 0 6px`、`line-height: 18px`、`margin-right: var(--notes-reserve, 96px)`。
- R2. 主画布顶栏与全屏「实时预览」标题栏共用同一条规则，同时生效。
- R3. 明暗两套都走 CSS 变量，不写死颜色、不新增暗色特例。
- R4. `formFieldPresentation.test.js` 备注契约补一条：chip 使用 `var(--color-bg-card)` 与 `1px solid`，且不再使用 `dashed` / `--color-bg-hover` 作为 chip 底/边。
- R5. 不改 `designNotesSummary.js`、tooltip / pre-wrap、`VisitsTab` 侧栏、后端。

## Acceptance Criteria

- [ ] 暗色主题主画布顶栏：表单名与备注之间能看见独立 chip（卡片底 + 实线边），不再连成 `知情同意1.赛美斯…`。
- [ ] 浅色主题同样能看见独立 chip。
- [ ] 全屏设计器「实时预览」标题栏与主画布表现一致。
- [ ] 摘要仍只显示第一行 + `…`；悬停浮窗仍按原文分行。
- [ ] 前端全量 `node --test tests/*.test.js` 通过（基线 544）；`npm run lint` 0 errors；`npm run build` 成功。
- [ ] 文档：根/前端 `CLAUDE.md` Change Log 各一条。

## Out of scope

- 摘要/浮窗文案逻辑与 `designNotesSummary.js`
- 在 chip 内加「备注」前缀
- 访视预览 `.wp-notes` 侧栏
- 后端与 Word 导出
- 调整 `--notes-reserve` 或顶栏整体布局

## Notes

- 轻量 CSS 任务，PRD-only。
- 禁止 `npm run format`。
- `FormDesignerTab.vue` 只动 `.fd-canvas-header-notes` 的 background / border，不做顺带重构。
