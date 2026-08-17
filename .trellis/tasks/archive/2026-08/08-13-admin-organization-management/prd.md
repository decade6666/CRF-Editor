# 管理员双入口与机构管理

## Goal

将管理员工作区拆分为「用户管理 / 机构管理」两个并列页面级入口，把机构预设从弹窗改造为页面内「列表 + 右侧编辑区」工作区，实现 Logo 缩略图与内置放大预览，并修复现有错误 Logo 读取 URL。

## Background

- 管理员登录后由 `frontend/src/App.vue:1078-1103` 直接挂载单一 `AdminView`，无管理员级导航；机构预设由 `OrganizationPresetsDialog.vue` 弹窗承载，`frontend/tests/adminViewStructure.test.js:11-19` 与 `adminOrgPresets.test.js` 锁定旧结构。
- 既有缺陷：编辑回显请求不存在的 `/api/admin/organization-presets/{id}/logo`（`OrganizationPresetsDialog.vue:62-72`），404 被静默吞掉；真实读取接口是 `/api/organization-presets/{id}/logo`（`backend/src/routers/organization_presets.py:117-137`）。
- 机构预设 CRUD（`require_admin`）、Logo 上传/读取、普通用户候选脱敏（`id/data_management_unit/has_logo`）均已存在（`organization_presets.py:46-114`），预期零后端改动。
- 用户已确认：顶部双入口、列表 + 右侧页面内编辑区、窄屏上下堆叠、Logo 缩略图 + 内置放大预览（不新增自定义弹窗）、修复错误 Logo URL。

## Requirements

### R1 顶部双入口

- 管理员工作区顶部常驻「用户管理」与「机构管理」两个并列页面级入口；切换后同一工作区下方直接显示对应页面，无入口首页、无管理员侧栏、无刷新。
- 入口用 Element Plus 分段控件（`el-radio-group` / `el-radio-button`，自带方向键语义）；默认用户管理。
- 用户管理页为现有 `AdminView`（半宽 `.admin-shell` 不变），用户 CRUD、重置密码、项目列表批量操作、回收站与清理策略全部保留。

### R2 机构管理页面化

- 机构管理为独立页面组件（替代 `OrganizationPresetsDialog.vue`），承载原弹窗全部能力：列表、新增、编辑、删除、Logo 上传/替换/清除。
- 「列表 + 右侧页面内编辑区」：新增/编辑时列表持续可见；窄屏（≤900px）上下堆叠（列表在上、编辑区在下）；编辑区常驻占位，未编辑时显示引导文案而非隐藏。
- 机构页突破 `.admin-shell` 半宽，使用独立宽壳（`max-width: 1200px` 居中）；主流程不打开机构预设弹窗。

### R3 Logo 缩略图与内置放大预览

- 列表 Logo 列：有 Logo 显示可辨识缩略图（CSS 变量边框/底色，明暗主题清晰），无 Logo 显示「—」；上传保存成功后列表立即刷新显示新缩略图。
- 点击缩略图经 `el-image` 内置预览器放大（`preview-src-list` + `preview-teleported`），不新增自定义弹窗；Esc 关闭、缩放为 EP 内置能力。
- 键盘/无障碍：缩略图可聚焦（`tabindex` + `role="button"` + `aria-label`），Enter / Space 经 `el-image` 暴露的 `showPreview` 程序化打开。

### R4 错误 Logo URL 修复

- 编辑回显与列表缩略图统一请求 `/api/organization-presets/{id}/logo`（`apiUrl` + `getAuthHeaders`）；源码不得再出现 `/api/admin/organization-presets/{id}/logo` 读取形态。
- Logo 加载失败必须可观察（错误消息/局部提示），不得静默吞错。

### R5 权限与后端契约不变

- 机构 CRUD 走 `/api/admin/organization-presets*`（管理员专属，403 不变）；Logo 读取走 `/api/organization-presets/{id}/logo`（已登录可读）；普通用户候选脱敏不变。
- 机构页仅在 `App.vue` `isAdmin` 分支可达；401 统一由 `useApi.js` 处理。
- 后端零改动：不新增路由/字段/模型/迁移；multipart 契约（`metadata` JSON + `logo_action` keep/upload/clear + `file`）与 Logo 位图校验语义不变。

## Acceptance Criteria

- [ ] AC1：顶部常驻双入口，切换即显示对应页面；原有管理员能力（用户 CRUD、重置密码、项目列表批量操作、回收站与清理策略）仍可访问。
- [ ] AC2：机构预设全部在页面内完成查看与编辑；列表与编辑区同时可见（窄屏堆叠）；主流程不打开弹窗；新增/编辑/删除/Logo 与保存后刷新可用。
- [ ] AC3：有 Logo 行显示可辨识缩略图，保存后立即更新；点击可经内置预览器放大并 Esc 关闭；键盘（Tab + Enter/Space）与 aria 语义可用。
- [ ] AC4：编辑回显与缩略图均请求 `/api/organization-presets/{id}/logo`；源码无旧错误 URL；加载失败有可观察提示。
- [ ] AC5：机构页宽壳布局，明暗主题下编辑区与缩略图清晰可用。
- [ ] AC6：候选脱敏、403 边界、位图校验与删除确认语义不变；后端零改动且全量回归通过。
- [ ] AC7：前端相关测试（先红后绿）、全量测试、lint、build 通过；浏览器实机验证（明暗主题、双入口切换、页面内编辑、窄屏堆叠、缩略图预览、键盘、普通用户无入口），未运行项必须明确说明。

## Notes

- 仅前端改动；`App.vue` 为共享文件（与并行子任务 `08-13-toolbar-pane-alignment` 区域不重叠，先 rebase 再合并）。
- 涉及文件：`App.vue`（双入口 + 壳）、`AdminView.vue`（移除弹窗接线）、新增 `OrganizationManagementView.vue`、删除 `OrganizationPresetsDialog.vue`、重写 `adminViewStructure.test.js` / `adminOrgPresets.test.js`。
- 文档同步：README 中英、`frontend/.claude/CLAUDE.md`、根 `CLAUDE.md` 变更日志、`.claude/index.json`、`.trellis/spec/frontend/component-guidelines.md`（管理员壳契约）。
