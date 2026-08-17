# Implementation Plan — 管理端与属性卡体验修复

## Phase A — 管理端

1. **RED**：更新 `adminViewStructure.test.js`、`adminOrgPresets.test.js`、`projectDeleteConfirmation.test.js`，覆盖 KeepAlive、机构弹窗、源用户排除、软删恢复提示和 hard-delete 保持不可恢复。
2. `OrganizationManagementView.vue`：将双栏编辑重构为表格 + `el-dialog`，复用既有 draft/Logo 处理函数，删除空白占位和页头副标题。
3. `AdminView.vue`：移除页头副标题；用户名列用 min-width；目标用户过滤统一排除源用户。
4. `App.vue`：管理员条件页面置入 KeepAlive；项目普通删除首层/最终确认改为管理员恢复表述。
5. `projectDeleteConfirmation.js`：实现 `recoverable` 后缀选项；AdminView 批量软删传入该选项。
6. 跑管理端定向 Node tests；若变更超过预期，先修复再继续。

## Phase B — 设计器与矩阵

1. **RED**：更新 `designerNewFieldDraft.test.js` 断言 fallback map 后仍调用 `selectField`；更新 `projectDeleteConfirmation.test.js`，矩阵取消勾选不再要求确认。
2. `FormDesignerTab.vue`：
   - 局部禁止 `.fd-canvas-toolbar` 换行，删除 notes chip 的 reserve margin。
   - 移除 fullscreen fields pane 的 `.fd-canvas` class，补齐必要 flex 布局属性且不引入内缘 border/shadow。
   - 在 `!reloaded` 草稿转正路径中选中新字段。
3. `VisitsTab.vue`：`toggleCell()` 无确认删除关联。
4. 跑设计器/访视相关定向 Node tests。

## Phase C — Units / Visits 属性卡

1. **RED**：更新或扩展 Units/Visits 的 edit-mode、toolbar/pane alignment、icon action、ordinal quick edit、flow workspace、deletion confirmation 和 ordering tests。
2. `UnitsTab.vue`：合并新增/编辑状态为单属性编辑器；把单列表改为左表格 + 右侧属性卡；删除两个编辑弹窗和 EditPen 行操作；保留搜索、排序、引用检查、删除路径。
3. `VisitsTab.vue`：仅 list workspace 改为左表格 + 右侧属性卡；合并新增/编辑状态；不提交 sequence；移除两个编辑弹窗和 EditPen 行操作；flow workspace 不动。
4. 跑 Units/Visits 定向测试，检查 full/brief mode、排序、选中/取消和新增保存。

## Cross-phase quality gates

1. 每一阶段结束执行相关 `node --test` 文件。
2. 所有前端变更完成后：
   ```bash
   npm --prefix /root/github/CRF-Editor-admin-property-cards/frontend run lint
   npm --prefix /root/github/CRF-Editor-admin-property-cards/frontend run build
   node --test /root/github/CRF-Editor-admin-property-cards/frontend/tests/*.test.js
   python3 -m pytest  # from backend working directory
   ```
3. 构建新的 `frontend/dist` 后，用 Chrome DevTools 在管理员和普通用户路径验证：机构弹窗/KeepAlive/目标用户过滤/删除文案、窄宽备注 chip、属性卡 CRUD、矩阵取消、单线面板、新字段保存自动选择。
4. 修改或新增前端测试后同步 `frontend/.claude/CLAUDE.md`、根 `.claude/CLAUDE.md` 和 `.claude/index.json` 的测试数量/Change Log。
5. 运行 code-reviewer；因本任务不涉权限、认证或上传边界，安全专项 review 非必需。

## Rollback points

- 每个阶段完成前只保留该阶段相关文件；定向测试失败时先恢复行为而非扩大重构。
- 保持后端 endpoint、payload 名称和 API cache key 不变，任何跨栈异常可通过丢弃该任务分支/PR 立即回退。
