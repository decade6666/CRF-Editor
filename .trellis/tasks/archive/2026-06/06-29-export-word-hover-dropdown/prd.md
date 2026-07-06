# 导出Word 悬停下拉:eCRF / aCRF

## Goal
把顶部「导出Word」单一按钮改为悬停展开的下拉菜单,提供「导出eCRF」「导出aCRF」两个选项。「导出eCRF」复用现有 `exportWord()` 整套逻辑(行为完全不变);「导出aCRF」本期不实现任何导出,仅作占位,待下一步开发。

## What I already know
- 当前按钮位于 `frontend/src/App.vue` 顶栏 `header-right` 区域(约 L915):
  `<el-button v-if="selectedProject" type="warning" size="small" :loading="exportWordLoading" @click="exportWord">导出Word</el-button>`
- 导出逻辑 `exportWord()`(App.vue L317-355):POST `/api/projects/{id}/export/word`,带 `column_width_overrides`,blob 下载,`exportWordLoading` 控制 loading 与防重复点击。
- 项目使用 Element Plus,`el-dropdown` 原生支持 `trigger="hover"`,但目前 `frontend/src` 中尚无 `el-dropdown` 用法(首次引入)。
- 状态管理为 provide/inject + composable,无外部 store。
- 现有测试 `frontend/tests/appSettingsShell.test.js` L57-62 用正则断言了导出按钮的精确 markup(`@click="exportWord"...>导出Word`),改成 dropdown 后必须同步更新该断言。

## Requirements (evolving)
- 顶栏原「导出Word」位置改为 `el-dropdown`,触发方式 `hover`。
- 下拉项 1「导出eCRF」:点击后执行与原「导出Word」完全一致的导出流程(复用 `exportWord()`,不改后端、不改下载逻辑)。
- 下拉项 2「导出aCRF」:可点击,点击后仅弹出轻提示(`ElMessage.info('导出aCRF 功能即将上线')` 或同义文案),不发起任何导出/网络请求。
- 保留 `v-if="selectedProject"` 显隐条件与 `type="warning"` 风格基调。
- 导出进行中(`exportWordLoading`)的 loading / 防重复点击语义保留在 eCRF 路径上。

## Open Questions
- (无)已全部澄清。

## Acceptance Criteria (evolving)
- [ ] 鼠标悬停触发器即可展开下拉,出现「导出eCRF」「导出aCRF」两项。
- [ ] 点击「导出eCRF」产生与改造前点击「导出Word」一致的 .docx 下载效果。
- [ ] 点击「导出aCRF」仅弹出「即将上线」轻提示,不发起任何网络请求、不报错。
- [ ] 未选择项目时整个导出入口不显示(保持 `v-if="selectedProject"`)。
- [ ] `appSettingsShell.test.js` 导出入口断言同步更新并通过。

## Definition of Done
- 前端 `node --test tests/*.test.js` 全绿(含更新后的导出入口断言)。
- `npm run lint` 通过。
- 若行为/入口变化,同步 README / frontend `.claude/CLAUDE.md` 说明。
- 浏览器手动验证悬停展开与 eCRF 下载(条件允许时)。

## Out of Scope (explicit)
- aCRF 的实际导出实现(后端/模板/下载),留待下一步开发。
- 后端 `export/word` 接口任何改动。
- 导入模板按钮及其它顶栏按钮的改造。

## Technical Notes
- 首选 Element Plus `el-dropdown` + `el-dropdown-menu` + `el-dropdown-item`,`trigger="hover"`,`@command` 分发或各 item 直接绑定 `@click`。
- 触发器按钮沿用 `type="warning" size="small"`,文案保留「导出Word」(或按决定调整);loading 绑定在触发器上以复用 `exportWordLoading`。
- 需引入 `ElDropdown` 等组件 —— 项目已全量注册 Element Plus(`main.js`),无需额外 import。

## Decision (ADR-lite)
- **Context**: aCRF 本期不实现,需要一种占位形态既不误触发导出,又不让用户误以为是 bug。
- **Decision**: 菜单项可点击,点击仅弹出轻提示「导出aCRF 功能即将上线」(`ElMessage.info`),不发起任何请求。
- **Consequences**: 用户有明确反馈;后续接入真实 aCRF 导出时,只需把提示替换为实际导出调用,入口与下拉结构无需重排。
