# CRF编辑器设计与交互统一改造

## Goal

消除全屏表单设计器的横向拥挤与独立字段库占位，统一列表页的图标操作、中文确认文案和复选框对齐，并提供管理员可维护、项目可覆盖的公司 Logo / 数据管理单位预设。父任务维护完整需求与三个子任务映射，只做最终集成验收，不直接承担实现。

## 子任务映射

| 子任务 | 目录 | 交付 |
| --- | --- | --- |
| 1. 全局搜索与五类列表交互统一 | `08-13-global-search-list-actions` | 搜索算法升级 + zh-cn locale + 五类页面图标化 + selection 居中 |
| 2. 全屏设计器两栏重构与字段原子 profile | `08-13-designer-two-pane-field-profile` | 两栏布局 + 字段自动完成/换绑/OID 分叉 + 原子字段 API + 备注弹窗 |
| 3. 机构预设与项目 profile 原子保存 | `08-13-org-presets-project-profile` | 机构预设 CRUD + 项目 profile multipart 原子保存 + 旧项目写端点废弃 |

## Requirements

1. 全屏设计器（点击「设计表单」后打开）：宽屏左右两栏（默认左 38% 右 62%，可拖拽记忆），左栏字段列表/属性卡各 50% 纵向拖拽；约 1100px 以下退化为上下布局。删除独立字段库卡片/搜索框/宽度条。
2. 字段库入口改为 OID / 字段标签自动完成；明确点击候选才换绑（保存才落库）；非 OID 属性修改属于共享定义需影响确认；OID 修改=创建分叉定义；撤销/重做原子回放且 OID 不漂移。
3. 设计备注改为表单属性动作栏左侧图标 + 弹窗（确定即保存、取消放弃），删除 500ms 防抖自动保存；外层摘要保留。
4. Element Plus 全局 zh-cn locale（官方「确定/取消」）。
5. 五类页面（选项/单位/字段/表单/访视含直接子列表）新增/批量删除与操作列图标化，批删常显禁用不显示数量，全部 el-tooltip + aria-label。
6. 全局 Element Plus 表格 selection 复选框水平居中（含管理员弹窗；设计器手写复选框除外）。
7. 搜索算法升级为精确 > 连续包含 > 子序列 > 受限编辑距离，所有接入页面共用。
8. 机构预设：管理员维护名称/单位/Logo（SQLite 表 + `uploads/organization-logos/` 安全位图），普通用户仅只读非空单位候选并可在项目信息页选择同步 Logo 或自定义覆盖。
9. 项目信息改用 multipart 原子端点 `PUT /api/projects/{id}/profile`（metadata + logo_action keep|preset|upload|clear）；旧项目 PUT / Logo POST 废弃删除。
10. 字段写路径收敛为原子端点：`POST /forms/{id}/field-profile` 与 `PUT /form-fields/{id}/binding-profile`；旧 `PUT /form-fields/{id}`、colors PATCH、inline-mark PATCH 废弃删除；字段库共享定义编辑端点保留。
11. 文档同步：README 中英、模块 CLAUDE.md、`.claude/index.json`、Trellis spec 指南。

## Acceptance Criteria

- [ ] 三个子任务独立 PR 依次合入 main（CI 自动合并，不手动 merge），每个 PR 前后端全量测试 + lint + build 通过。
- [ ] 浏览器实机验证（亮/暗主题、宽窄屏、键盘/tooltip/中文文案、设计器关键流程、机构预设全流程）无回归。
- [ ] API 迁移矩阵（见计划文件）中「删除」端点在全仓无残留调用，测试断言随迁。
- [ ] 覆盖率不低于现有基线，不运行 `npm run format`。

## Notes

- 执行边界、API 矩阵、验证命令与风险详见计划文件 `/root/.claude/plans/1-1-1-1-2-1-3-bright-quokka.md`。
- `FormDesignerTab.vue` 串行约束：任一时刻仅一个分支可修改该文件；PR2 必须基于 PR1 合入后的 main。
- 本任务在全部子任务合入后做最终集成验收并记录三 PR 映射与浏览器证据。
