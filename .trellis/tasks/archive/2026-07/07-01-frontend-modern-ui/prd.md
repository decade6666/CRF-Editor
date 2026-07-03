# 前端现代化与美观度优化(医药研发)

## Goal

对 CRF Editor 前端进行现代化与美观度提升。软件面向医药研发(临床研究)领域,需在保持专业、严谨、可信赖气质的前提下,让界面更现代、更精致。目标是提升视觉质感与交互体验,而非推翻现有信息架构或破坏预览/导出严格一致性契约。

## What I already know

- 技术栈:Vue 3 + Vite + Element Plus,组件位于 `frontend/src/components/`(13 个),复用逻辑在 `frontend/src/composables/`(21 个)。
- 已有成熟 design token 体系(`frontend/src/styles/main.css`,433 行):
  - 原子色板 `--indigo-*`(冷蓝灰,临床感),语义 token(primary/sidebar/header/bg/text/success/warning/danger/info)。
  - 阴影(sm/md/lg/page)、圆角(sm/md/lg/xl)、间距(xs~2xl)、过渡(fast/std)token 齐全。
  - Element Plus 主题色覆盖(`--el-color-primary` 等)。
  - 暗色模式已支持(`html[data-theme="dark"]` 变量覆盖)。
  - 响应式断点(@media max-width:768px)。
- 字体:`Microsoft YaHei`(UI)、`SimSun`(Word 预览页,为对齐导出保真)。
- 布局:顶部 header + 左侧 sidebar(可拖拽宽度)+ 主内容区(el-tabs)。

## 硬约束(不可破坏)

- **预览/导出严格一致性**:`.wp-form-title` 必须保持 `text-align:left`;`.fill-line`(C-01 红线)类名与样式逻辑绝对不改(JS 硬编码 v-html);Word 预览页字体/字号/边框需与导出保真,不能为了"好看"改动 `.word-page` 内影响 parity 的样式。
- **列宽/行高契约**:`.word-page` 表格布局与后端 `width_planning.py` 联动,视觉层可调但不得改变字符根数/列宽计算。
- 不扩展依赖、不改构建流程,除非确认。

## Assumptions (temporary)

- 优化以"视觉打磨 + 交互质感"为主,信息架构保持稳定。
- 现代化方向需与"医药研发专业气质"匹配(克制、可信、精确),避免消费级花哨风格。

## Decision (ADR-lite)

**Context**: "现代化 + 美观"目标宽泛,需在风险与工作量间定档;软件为医药研发,气质需专业可信。
**Decision**: 采用 **A 档「设计系统精修」+「冷静专业」方向**——只在 token / 全局样式层提质,保留冷蓝灰临床基调,不动信息架构与组件结构。在纯 A 档基础上**确认纳入 3 项增补**:①拖拽物理反馈(纯 CSS)②`.word-page` 外层拟物纸张容器(限外层)③空状态图标化(el-empty)。
**Consequences**: 全局观感提升、风险最低、改动集中在 `main.css` + token;需同步视觉锁定测试(themePalette/tableHeaderStyle/wordPageGeometry);深度组件现代化与信任语言延后。

**领域核实(关键决策依据)**: 经代码核实,本项目是 CRF **设计器**(设计/维护/导出表单),**不存在任何 EDC 运行期数据概念**——无质疑(Query)、SDV/源数据核查、逻辑校验(edit-check)、字段锁定;访视矩阵单元格仅表示"表单↔访视关联(勾选/未勾选)"。因此 agy 基于 EDC 系统臆想的建议(非侵入式校验反馈、矩阵状态点表达锁定/质疑、SDV/Query 临床微标)**判定为领域不符,不予纳入**。同时不纳入:微交互动效系统(引入 Anime.js 依赖 + 与临床克制气质相悖)、表格深度封装重塑(属重构非精修、回归风险)、信任设计语言(无版本/审计工作流)。

## Requirements (MVP — A 档 / 冷静专业)

1. **色彩层次**:建立 3 级中性面 token(bg-body / bg-subtle / bg-card)拉开明度;primary 冷蓝灰微调更精致;新增一个克制冷强调色(teal/cyan 系)token,仅用于主 CTA 与关键状态,不铺满;提升 border 与 text-muted 对比。
2. **排版系统**:新增明确 type scale token(替代散落的 11/12/13/14/18px);UI 拉丁字族加 Inter(回退 Roboto),中文保留 YaHei;数字/标识列启用 `tabular-nums`。`.word-page`(SimSun/字号/边框)完全不动。
3. **Elevation**:精修 shadow 分层语义(rest / raised / overlay),hover 阴影带 primary 色调,替代现有过淡阴影。
4. **圆角与间距节奏**:收敛 radius scale(消除 3px 散值);header、空状态、弹窗增加呼吸感;表格保持密度但统一节奏。
5. **暗色模式打磨**:用"更亮表面"表达 elevation 而非纯黑重阴影;优化暗色边框/文本对比。
6. **可访问性**:body/muted 文本对比度达 WCAG AA;补 `:focus-visible` 键盘焦点环。
7. **表格轻量提质**(仅 CSS 覆盖,不改结构):行 hover、表头/斑马纹打磨、矩阵勾选态更清晰。
8. **【增补】拖拽物理反馈**(纯 CSS):补 sortablejs `.sortable-ghost` / `.sortable-chosen` / 拖拽中落点高亮样式,覆盖 el-table 行与 `fd-item` 卡片两类列表,明暗两态适配;**不改 `useSortableTable.js` 逻辑,不碰 aCRF 标注拖拽(`useAcrfAnnotationDrag`)**。
9. **【增补】`.word-page` 外层拟物纸张容器**(限外层):美化 `.word-preview` 外层容器(纸张感底色/阴影/页边距感),把宋体预览与现代 UI 的割裂转为"高保真打印预览"预期;**绝不修改 `.word-page` 内部任何影响 parity 的样式**(字体/字号/边框/`.fill-line`/`.wp-form-title` 左对齐),landscape 宽度需适配。
10. **【增补】空状态图标化**:用 `el-empty` + `@element-plus/icons-vue`(已有依赖)美化现有空状态(AdminView / FormDesignerTab),无新依赖。

## Acceptance Criteria (MVP)

- [x] 新增/精修 token 后,`themePalette.test.js`、`tableHeaderStyle.test.js`、`wordPageGeometry.test.js`、`visitPreviewLandscape.test.js` 全部通过(专项 26/26)。
- [x] `.word-page` 内 parity 相关样式(`.fill-line`、`.wp-form-title` 左对齐、字体/边框)零改动;parity 测试全绿。
- [x] `--color-text-muted` 提深至 #66788f(WCAG AA);新增全局 `:focus-visible` 焦点环。
- [x] type scale token 落地;`tabular-nums` 应用于矩阵序号列(`.ordinal-cell` 原有)。
- [x] 暗色模式阴影改用带色调/更亮表面语义,锁定暗色 token 未动。
- [x] `node --test tests/*.test.js` 全量 371/371 通过;`npm run lint` 退出码 0(既有 prettier warning 非本次引入)。
- [ ] **待做**:浏览器实机验证(http://0.0.0.0:8888,DECADE 账号)关键页面明暗两态。
- [ ] **待做**:提交(3 个 PR 语义分次 commit)。

### 实现记录
- 分 3 次委托 codex(`codex exec -s workspace-write`)执行,每次 Claude 审 diff + 跑全量测试:
  - PR1 色彩/层次地基 → 仅 `main.css`(中性面 3 级 + teal accent token + 状态三级着色 + elevation 分层 + 对比度提深)
  - PR2 排版/密度 → `main.css` + `AdminView.vue`/`FormDesignerTab.vue`(type scale + Inter 字体栈去 Arial + tabular-nums + radius 收敛 + 间距 + 2 处 el-empty 空态)
  - PR3 暗色/表格/交互/a11y → 仅 `main.css`(sortablejs ghost/chosen/drag 拖拽反馈 + `.word-preview` 外层拟物容器 + 表格 hover/矩阵勾选态 + `:focus-visible` 环)
- codex 沙箱内 `browserPerfBaselineScript.test.js` 因受限 PATH 假失败,Claude 环境全量 371/371 通过。
- 未提交,等待实机验证与用户确认。

## Definition of Done (team quality bar)

- 前端 lint/format 通过(`npm run lint` / `npm run format`)。
- 源码级测试通过(`node --test tests/*.test.js`),覆盖不下降。
- 不破坏预览/导出严格一致性契约,相关 parity 测试通过。
- 浏览器实机验证(http://0.0.0.0:8888)关键页面视觉与交互。
- 同步更新 README / 模块 CLAUDE.md(若行为或入口变化)。

## Out of Scope (explicit)

- 推翻信息架构或重构组件树。
- 改动影响 Word 预览/导出 parity 的任何样式逻辑(`.word-page` / `.fill-line` / `.wp-form-title`)。
- 引入重型 UI 框架替换 Element Plus,或扩展新依赖(Inter 走系统/本地字体回退,不引包)。
- 状态徽章体系、统一图标语言、插画化空态、完整 Anime.js 动效系统(留待 B/C 档)。
- 深度组件结构重写(仅允许 CSS 层覆盖打磨)。

## Technical Approach

- 改动集中在 `frontend/src/styles/main.css` 的 token 定义与全局 Element Plus 覆盖;组件 `.vue` 文件仅在必要处调整 class 引用,不改模板结构与逻辑。
- 新增 type scale / 中性面 / 强调色 / elevation token,组件样式改为引用新 token,减少散值。
- Inter 字体走 `font-family` 回退链(`Inter, Roboto, 'Microsoft YaHei', sans-serif`),无网络依赖;若本地无 Inter 则优雅回退,不阻塞。
- 每次改 token 前先 `grep` 全仓引用点(遵循 cross-stack 思考指南),改后同步视觉锁定测试。

## Implementation Plan (small PRs)

- **PR1 — 色彩与层次地基**:中性面 3 级 token + primary 微调 + 冷强调色 token + 状态标签三级着色 + border/muted 对比达标 + elevation 分层;同步 `themePalette.test.js`。
- **PR2 — 排版与密度**:type scale token + Inter 回退链(去 Arial) + 数字 tabular-nums + radius 收敛 + header/空态/弹窗间距节奏 + 空状态图标化(el-empty)。
- **PR3 — 暗色打磨 + 表格/交互提质 + a11y**:暗色亮表面 elevation、表格 hover/斑马纹/矩阵勾选态(CSS 覆盖)、拖拽物理反馈(sortablejs ghost/chosen/落点)、`.word-page` 外层拟物容器、`:focus-visible` 焦点环;同步 `tableHeaderStyle.test.js`、跑 `wordPageGeometry.test.js`/`visitPreviewLandscape.test.js`;浏览器明暗两态实机验证。

> 派发策略:分阶段委托 codex 执行,PR1 先行产出可审 diff,Claude 审核并跑测试后再委托 PR2/PR3;codex 只在授权文件范围内改动、不自行 commit。

## Technical Notes

- 现状文件:`frontend/src/styles/main.css`、`frontend/src/App.vue`(1588 行,应用外壳)。
- 设计规范约束(来自全局 CLAUDE.md):动画用 Anime.js / Framer Motion;图表用 ECharts;调色板用 CSS 变量;a11y(语义化 HTML、ARIA、键盘导航、对比度)。
- agy(Antigravity)第二视角分析结果见下方 Research Notes。

## Research Notes

> **agy 调用修正**:早期失败是 CLI 参数顺序错误——`-p/--print` 是取值参数会吞掉紧跟的 token。正确写法 `agy --dangerously-skip-permissions -p "<prompt>"`(布尔 flag 在前,prompt 作为 `-p` 的值放最后)。修正后 agy 正常返回。以下为 Claude 分析 + agy 交叉视角整合。Claude 基于完整阅读 `main.css`(433 行)与视觉锁定测试集(`themePalette.test.js` / `tableHeaderStyle.test.js` / `wordPageGeometry.test.js` 等)。

### agy(Antigravity)交叉视角要点(与 Claude 一致 + 补充)
- **方向印证**:agy 同样锚定 Medidata/Veeva「克制、严谨、高信息密度」临床美学,与所选「冷静专业」方向一致。
- **一致项**:拉丁字族兜底、WCAG AA 对比度、"逻辑紧凑+板块呼吸"间距节奏、表格降噪(细浅灰线 `#e2e8f0`+表头轻压沉 `#f1f5f9`)、focus 双层聚焦圈、暗色避纯黑(主背 `#0f172a`/卡片 `#1e293b`+语义色降饱和+半透明边框)、按钮权重分级、弹窗聚焦。
- **agy 补充(A 档可纳入,token/CSS 层)**:
  - 状态标签"三级着色"系统(浅底+细边框+深字,如 danger `bg:#fef2f2 / border:#fee2e2 / text:#ef4444`),避免大面积饱和色块 → 纳入 PR1 色彩。
  - 弹窗遮罩毛玻璃 `backdrop-filter: blur(4px); rgba(15,23,42,0.3)` + 滚动区上下渐变蒙版 → 纳入 PR3 组件打磨(CSS-only)。
  - `.word-page` 拟物化纸张容器包装(外层 `#f1f5f9` 底 + 实体纸张阴影 + 页边距/页码感),把"宋体+外围现代 UI 的割裂"转化为"高保真打印预览"心理预期 → 纳入 PR3,**仅包外层容器,不碰 `.word-page` 内 parity 样式**。
  - el-tabs 降噪(激活底线细化 2px、非激活灰度、关闭图标仅 hover 显现)→ 纳入 PR3。
- **agy 提出但归入 B/C 档(组件/图标级,超出 A 档)**:
  - 临床语义微标(SDV 盾牌/Query 气泡/锁定锁头图标)→ B/C 档(需图标系统)。
  - 非侵入式校验反馈(红框+静默角标/Tooltip,无布局抖动)→ B 档(涉及组件行为)。
  - 访视矩阵状态点"空心/半实心/实心"形态语义 → B 档(涉及矩阵渲染逻辑)。
  - 拖拽物理反馈(dragstart 缩放/透明度、Dropzone 呼吸虚线)→ B 档(涉及设计器交互)。
- **字体分歧调和**:agy 兜底栈含 Arial;按项目 code-quality 规范(禁 Arial/System),采用 `Inter, Roboto, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif`,去 Arial 保留系统兜底。

---

### Claude 原始分析

### 现状评估(优点)
- Design token 体系成熟(primitive→semantic 两层),暗色模式、响应式、Element Plus 主题覆盖齐全,冷蓝灰色调有临床专业感。

### 优化机会(问题→改法→收益,按优先级)

**P0 — 视觉基调与信任感(投入小、全局提质)**
1. 色彩过扁平/低对比:body #f7fbff、card #fff、border #dbe7f3 几乎同色,层次糊。→ 引入 3 级中性面(bg-body / bg-subtle / bg-card)拉开明度,primary 略加饱和,新增一个克制强调色(青/teal,对应"数据/已核查"语义)仅用于 CTA 与关键状态。→ 界面立刻有精致度与焦点。
2. 缺少临床信任语言:无统一状态徽章(草稿/生效/锁定)、版本/审计视觉线索。→ 建立 status badge + 一致图标语言 + 精确对齐栅格,参考 Veeva 的"冷静高密度"。→ 强化专业可信气质。

**P1 — 排版/层次/密度**
3. 字体系统单一(仅 YaHei):OID/版本号/计数等大量拉丁数字缺现代无衬线与等宽对齐。→ UI 拉丁字族加 Inter/Roboto,数字列用 tabular-nums;建立明确 type scale(现为 11/12/13/14/18px 散值)。SimSun 仅限 .word-page(约束保留)。→ 数据可读性与秩序感提升。
4. 阴影/层次太轻(alpha 0.04~0.08):卡片几乎不浮。→ 分层 elevation 语言,hover 用略带 primary 色调的阴影。→ 空间层次清晰。
5. 间距节奏偏挤(header 8px、卡片 padding 6~10px):→ header、空状态、弹窗增加呼吸感,表格可留密度但统一节奏。→ 高级感。
6. 表格质感(核心数据录入界面):→ 斑马纹、sticky header 打磨、行 hover、矩阵 checked 态更清晰的视觉反馈。→ 录入效率与观感。
7. 对比度 a11y:text-muted #94a3b8 on white 接近 WCAG AA 边界。→ 审计对比度达 AA,补 focus-visible 键盘焦点环。→ 合规与可用性。

**P2 — 细节打磨**
8. 圆角语言不统一(3/4/8/12px 混用):→ 收敛为一致 radius scale。
9. 微交互(已有 translateX/scale hover):→ 补 tab 切换过渡、按钮按压反馈、骨架屏加载;动效用 Anime.js(全局规范,禁手写引擎),保持克制。
10. 暗色模式打磨:暗色阴影为重黑(0.42~0.48),→ 改用"更亮表面"表达 elevation 而非纯黑阴影,边框对比优化。
11. 空状态/引导:empty-state 偏素(#909399),→ 图标化/插画化空态 + 轻引导。
12. 按钮/输入层级:→ primary/secondary/ghost 明确层级,一致 focus 态。

### 硬约束复核(改动红线)
- 不碰 `.word-page` 内影响 parity 的字体/字号/边框/`.fill-line`/`.wp-form-title` 左对齐。
- 改色板需同步 `frontend/tests/themePalette.test.js`;改表头需同步 `tableHeaderStyle.test.js`;改预览几何需同步 `wordPageGeometry.test.js` / `visitPreviewLandscape.test.js`。
