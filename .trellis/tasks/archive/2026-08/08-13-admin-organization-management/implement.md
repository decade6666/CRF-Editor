# 实施：管理员双入口与机构管理

> 严格 TDD（先红后绿）；仅前端改动；`FormDesignerTab.vue` 不在本任务范围。
> `App.vue` 为共享文件（并行子任务 `08-13-toolbar-pane-alignment` 改全局顶栏区域，本任务改管理员分支模板 + 壳，区域不重叠）；合并时先 rebase 再处理上下文冲突。

## 阶段 0：基线

1. 任务 worktree 内 `git status` 干净；记录前端全量（当前 622 passed）与后端全量（当前约 799 passed / 4 xfailed，以实跑为准）基线。
2. 确认 `node_modules` 中 element-plus ≥ 2.3（当前 2.13.2，`el-image` 的 `preview-src-list` / `preview-teleported` / `showPreview` 可用）。

## 阶段 1：RED

1. **重写 `frontend/tests/adminViewStructure.test.js`**：
   - 删「单一工作区 + 弹窗入口」旧断言（`el-tabs` 禁令、`showOrgPresets`、`<OrganizationPresetsDialog/>`）。
   - 新增：双 `el-radio-button`（用户管理/机构管理）、`activeAdminPage` 分支渲染、无 `el-menu` / `showOrgPresets` 旧形态。
   - 保留迁移：`.admin-shell` 规则、新增 `.admin-org-shell`、`<AdminView @logout="logout" />`、项目列表/回收站/清理策略/`adminApiBase` 等不变断言。
2. **重写 `frontend/tests/adminOrgPresets.test.js`**（源改为 `OrganizationManagementView.vue`）：
   - 结构：`.org-layout` 双栏 + `@media (max-width: 900px)` 堆叠 + 编辑区占位/表单分支。
   - Logo URL：存在 `apiUrl(\`/api/organization-presets/${id}/logo\`)`；`doesNotMatch` 旧 `/api/admin/organization-presets/{id}/logo` 读取形态；失败分支可观察提示。
   - 缩略图：`el-image` + `preview-src-list` + `preview-teleported` + `tabindex`/`role`/`aria-label` + `showPreview` 键盘打开。
   - 生命周期：`createObjectURL`/`revokeObjectURL` 接线（保存后刷新、删除成功、切换、清除、`onBeforeUnmount`）。
   - 业务复用：multipart payload、`confirmDelete` 机构预设文案、`api.del` 删除。
3. 运行 `node --test tests/adminViewStructure.test.js tests/adminOrgPresets.test.js`，确认 RED（新组件缺失时读取文件抛错同样计入 RED 证据）。

## 阶段 2：GREEN

1. **新增 `frontend/src/components/OrganizationManagementView.vue`**（≤800 行）：从 Dialog 移植 `load`/`resetDraft`/`openAdd`/`openEdit`/`pickLogo`/`clearLogoDraft`/`saveDraft`/`removePreset` 与 `FILE_ACCEPT`；修复 Logo URL（`openEdit` 与缩略图共用 `loadLogoUrl` → `/api/organization-presets/{id}/logo`，失败可观察）；缩略图缓存 + in-flight 去重 + 保存/删除/切换/卸载各路径释放 Object URL；`.org-layout` 双栏 + 编辑区常驻占位/表单 + 窄屏 media query；工具栏「新增预设」+ 列表（名称/单位/Logo 列/操作列 `EditPen`/`Delete` danger，`el-tooltip` + `aria-label` 沿用 listActionsIconify 语义）；Logo 列 `el-image` 内置预览 + 键盘接线。
2. **修改 `AdminView.vue`**：删 `OrganizationPresetsDialog` import / `showOrgPresets` / 按钮 / 挂载点；其余不动。
3. **修改 `App.vue`**（最小 diff）：`activeAdminPage` ref（默认 `'users'`）；管理员模板加分段控件 + 分支渲染；`.admin-org-shell` 样式；`.admin-shell` 原样。
4. **删除 `frontend/src/components/OrganizationPresetsDialog.vue`**。
5. 运行阶段 1 两个测试文件，确认 GREEN。

## 阶段 3：全量验证（前端）

1. `node --test tests/*.test.js` 全量通过（重点复核 `recycleBinCleanupPolicy` / `projectDeleteConfirmation` / `appSettingsShell` / `listActionsIconify` / `basePathDeployment`——新组件裸 `fetch` 必须走 `apiUrl()`）。
2. `npm run lint` 0 errors（禁止 `npm run format`）。
3. `npm run build` 成功；浏览器验证前重建并同步 `frontend/dist/`（gitignore，后端直接托管）。
4. 自查：新组件 ≤800 行、无 `console.log`、`git diff` 仅本任务文件。

## 阶段 4：后端回归（零改动证明）

1. `cd backend && python -m pytest` 全量（重点 `test_organization_presets.py` / `test_logo_storage_service.py` / `test_organization_preset_model.py` / 权限类用例）。
2. `git status` 确认后端零改动。

## 阶段 5：浏览器实机（明暗主题 + 权限）

按 AC1–AC5 逐项验证并记录：双入口切换无刷新；用户页半宽不变；机构页宽壳 + 列表/编辑区；新增与编辑（回显含 Logo，验证原 404 修复）；保存后列表立即出缩略图；点击缩略图 → 内置预览放大 → Esc 关闭；Tab 聚焦 + Enter/Space 打开；视口 ≤900px 堆叠无横向溢出；明暗主题对比度正常；普通用户无机构入口且直连管理端点 403；控制台无 error。未运行项显式记 not-run 并说明替代验证。

## 阶段 6：文档同步与收尾

1. `.trellis/spec/frontend/component-guidelines.md`：管理员壳契约改双规则（用户页 `.admin-shell` 半宽 + 机构页 `.admin-org-shell` 宽壳）。
2. `frontend/.claude/CLAUDE.md`（组件/测试清单）、根 `CLAUDE.md` 变更日志、`.claude/index.json`、README 中英。
3. `git diff` 自查后提交（`feat(admin): …`，遵循仓库约定），PR 流程按约定，不直接合入 main。

## 文件清单

| 文件 | 动作 |
|---|---|
| `frontend/src/components/OrganizationManagementView.vue` | 新增 |
| `frontend/src/components/AdminView.vue` | 修改（去弹窗接线） |
| `frontend/src/App.vue` | 修改（双入口 + 壳） |
| `frontend/src/components/OrganizationPresetsDialog.vue` | 删除 |
| `frontend/tests/adminViewStructure.test.js` / `adminOrgPresets.test.js` | 重写 |
| `.trellis/spec/frontend/component-guidelines.md` + README/CLAUDE 文档 | 同步 |

## 验收对照

AC1–AC5 ← 阶段 1 测试 + 阶段 3 + 阶段 5；AC6 ← 阶段 4；AC7 ← 阶段 3/5（未运行项显式声明）。
