# 设计器顶栏备注换行显示

## Goal

修复表单设计器顶栏「设计备注」把多行内容压成一行的问题：顶栏摘要在备注存在换行时只显示第一行（后补省略号提示被截断），完整原文在悬浮提示中按原样分行显示。两处顶栏（表单设计页主画布顶栏、全屏设计器「实时预览」标题栏）共用同一套逻辑，同时生效。

## Background

用户反馈：Word 预览界面中表单名称旁边的备注没有显示换行符。根因在 `FormDesignerTab.vue` 的 `headerDesignNotesSummary`：`\s+ → ' '` 把换行一并压成空格，顶栏 chip 变成单行跑马灯；悬浮提示走 `el-tooltip :content`（纯文本节点），HTML 默认折叠换行，同样看不到分行。对照 `VisitsTab.vue` 访视预览侧栏备注（`escapePreviewText` 已做 `\n → <br>`）是正常分行的。

## Requirements

- 顶栏摘要（`headerDesignNotesSummary`）：备注多行时只取第一条非空行；该行内部折叠连续空白；首行超 60 字截断加省略号；首行未超长但存在后续非空行时补 `…` 提示；纯空白返回空串（顶栏隐藏，与现状一致）。
- 悬浮提示（`headerDesignNotesTooltip`）：完整原文，保留换行与行内缩进（`white-space: pre-wrap`），统一 CRLF、去掉首尾空行；超长可滚动。
- 影响范围仅 `FormDesignerTab.vue` 两处顶栏；`VisitsTab.vue` 侧栏、后端、导出 parity 均不改动。
- 纯函数逻辑抽到 `frontend/src/composables/designNotesSummary.js`，便于直接单测。

## Acceptance Criteria

- [ ] 新增 `frontend/src/composables/designNotesSummary.js`，导出 `summarizeDesignNotes` / `normalizeDesignNotesTooltip` / `HEADER_NOTES_MAX_LENGTH`，行为符合 Requirements。
- [ ] `FormDesignerTab.vue` 两处 `el-tooltip` 改用 `popper-class="fd-notes-tooltip"` + `#content` 插槽；tooltip 样式（`white-space: pre-wrap`、max-width、max-height 滚动）写入非 scoped `<style>` 块。
- [ ] 顶栏 chip `.fd-canvas-header-notes` 的单行省略号样式与顶栏高度不变。
- [ ] 新增 `frontend/tests/designNotesSummary.test.js` 行为测试；同步更新 `formFieldPresentation.test.js` 既有断言（不再引用内联 `raw.length > HEADER_NOTES_MAX_LENGTH`）。
- [ ] 前端全量 `node --test tests/*.test.js` 通过（基线 530），lint 0 errors，`npm run build` OK。
- [ ] 文档同步：`.claude/CLAUDE.md`、`frontend/.claude/CLAUDE.md` Change Log 条目 + 修正已漂移的 composables/tests 计数。
- [ ] Trellis 收尾（task.py 归档）→ 推分支 → PR 到 main（non-draft，不手动 merge）。

## Notes

- 禁止 `npm run format`（会重排整个 src 树污染 diff）。
- 后端零改动，不跑后端全量测试。
- 悬浮提示保留换行是用户明确诉求（顶栏只显示第一行以换空间）。
