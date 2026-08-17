# 设计：管理员双入口与机构管理

> 依据 `prd.md` 与父任务 `research/multimodel-evidence.md` §1；零后端改动，全部为前端文件。测试契约、执行顺序与浏览器验证见 `implement.md`。

## 1. 组件边界

```
App.vue（管理员分支：壳 + 入口）
 ├─ activeAdminPage: 'users' | 'orgs'（内存态，不持久化，刷新回 'users'）
 ├─ el-radio-group 分段控件（用户管理 / 机构管理）
 ├─ v-if="activeAdminPage === 'users'" → div.admin-shell > AdminView（半宽不变）
 └─ v-else → div.admin-org-shell > OrganizationManagementView（宽壳）
```

- **App.vue**：只持有 `activeAdminPage` 与两个壳；不持有机构业务状态；`<AdminView @logout="logout" />` 接线不变（登出入口在全局设置弹窗，两页一致）。
- **AdminView.vue**：删除 `OrganizationPresetsDialog` 的 import / `showOrgPresets` / 「机构预设」按钮 / 挂载点；其余一行不动。
- **OrganizationManagementView.vue**（新，无 props/emits）：自包含列表、草稿（name / data_management_unit）、Logo 草稿（source / file / previewUrl）、缩略图缓存、保存/删除流程；逻辑从 `OrganizationPresetsDialog.vue` 移植（multipart 保存、`confirmDelete`「机构预设 "…"」删除确认、`resetDraft` 语义原样保留）。
- **OrganizationPresetsDialog.vue**：删除（git 历史可恢复）。

## 2. API 契约复用

| 操作 | 端点 | 方式 | 鉴权 |
|---|---|---|---|
| 列表 | `GET /api/admin/organization-presets` | `api.get`（useApi，统一 401/缓存） | `require_admin` |
| 新增/编辑 | `POST/PUT /api/admin/organization-presets[/{id}]` | `fetch(apiUrl(url), { method, body: FormData, headers: getAuthHeaders() })` | `require_admin` |
| 删除 | `DELETE /api/admin/organization-presets/{id}` | `api.del` | `require_admin` |
| Logo 读取 | `GET /api/organization-presets/{id}/logo` | `fetch(apiUrl) → blob → Object URL` | 仅登录 |

- multipart 契约原样保留：`metadata` JSON（`name` 必填、`data_management_unit` 空→null）、`logo_action` ∈ {keep, upload, clear}、upload 时附 `file`；保存失败解析 `detail` 展示中文错误。
- 编辑回显与缩略图共用同一 Logo 加载函数（§3），统一正确 URL；列表加载后对有 `logo_path` 的行逐个拉取，无 Logo 行显示「—」。

## 3. Logo Blob / Object URL 生命周期

原则：**每个 `createObjectURL` 产物有唯一 revoke 责任点**；同一 preset 只保留一份 URL，换新先 revoke 旧的。

- 组件内 `thumbUrls = reactive(new Map())`（key = presetId）+ in-flight promise 去重（防并发重复请求）；`loadLogoUrl(id)` 失败返回 null 并 `ElMessage.error('加载机构 Logo 失败: …')`（可观察，不静默）。
- 替换：保存成功 → `load()` 刷新 → 有 `logo_path` 的行先 revoke 旧 URL 再重载；无 `logo_path` 的行 revoke 并删除。
- 删除：预设删除成功后立即 revoke 并删除该 id 的缩略图 URL / in-flight 记录，不等到组件卸载。
- 卸载：`onBeforeUnmount` 遍历 revoke 并清空（旧弹窗 `onUnmounted` 语义一致，改用 `onBeforeUnmount` 提前释放）。
- 编辑草稿：`pickLogo` 先 revoke 当前预览再建新 URL；`clearLogoDraft` / `resetDraft` / 切换编辑对象 revoke。
- 取舍：预览器打开期间组件卸载——图片已解码，主流浏览器仍显示，接受不做延迟释放；Object URL 绝不入 localStorage。
- 该逻辑预计 <100 行，直接放组件内；若组件超 800 行再抽取 composable（不提前抽象）。

## 4. 内置放大预览与键盘无障碍

- 缩略图用 `el-image`（EP 2.13.2 全局注册）：`:src`、`:preview-src-list="[url]"`、`preview-teleported`（teleport 到 body 防 scoped overflow 裁剪）、`fit="contain"`、`alt`=机构名 + Logo。
- 程序化打开：EP 2.13.2 的 `el-image` 经 `defineExpose` 暴露 `showPreview`（已实证）；缩略图外层 `tabindex="0"` + `role="button"` + `aria-label`，`@keydown.enter` / `@keydown.space.prevent` → ref 的 `showPreview()`；鼠标点击走 `el-image` 原生 click。
- 预览器 Esc/缩放/旋转全为 EP 内置能力，不写自定义逻辑。
- 缩略图样式：固定小尺寸、`border: 1px solid var(--color-border)`、`border-radius: 4px`、`background: var(--color-bg-card)`，明暗主题经 CSS 变量自动适配，无主题专属 hack。

## 5. 响应式布局与主题

- `.admin-org-shell`（App.vue scoped）：`width: 100%; max-width: 1200px; margin-inline: auto; padding: 0 16px;`——突破半宽；`.admin-shell` 原样保留。
- `.org-layout`（组件内）：`flex + gap 16px + align-items: flex-start`；列表 `flex: 1 1 auto; min-width: 0`；编辑区 `flex: 0 0 380px`（360–420 可调）。
- `@media (max-width: 900px)`：`flex-direction: column`；编辑区 `width: 100%`（列表上、编辑区下）；与 `main.css` 768px 头部队列并存不冲突。
- 编辑区常驻占位（「选择机构进行编辑，或点击新增预设」）保证两栏稳定、堆叠不跳动；编辑态渲染表单（机构名称必填、数据管理单位、Logo 上传/替换/清除 + 预览、保存/取消），按钮组与旧弹窗 footer 语义一致。
- 全部沿用现有 Element Plus 组件与 CSS 变量体系；不新增全局样式文件，样式进组件 scoped，壳样式进 App.vue scoped。

## 6. 权限与回滚

- 机构页仅在 `App.vue` `isAdmin` 分支可达；无新增前端鉴权。列表/删除等 `useApi.js` 请求继续走统一 401 处理；multipart 与 Logo Blob 的直接 `fetch` 保持 `apiUrl()` + `getAuthHeaders()`，并在非 2xx 时显示可观察错误。403/候选脱敏由后端既有测试（`test_admin_presets_reject_regular_user` 等）锁定。
- 零后端改动；回滚 = revert 前端提交；无数据迁移、无 localStorage 残留（`activeAdminPage` 不持久化）；删除的 Dialog 由 git 历史恢复。

## 7. 测试与文档同步指引

- 重写 `adminViewStructure.test.js` 与 `adminOrgPresets.test.js`（先红后绿），契约清单见 `implement.md` 阶段 1；前端全量/后端回归/lint/build/浏览器验证见 `implement.md` 阶段 3–5。
- 文档同步：`component-guidelines.md` 管理员壳契约（用户页半宽 + 机构页宽壳双规则）、README 中英、模块 CLAUDE.md、根 CLAUDE.md 变更日志、`.claude/index.json`（见 `implement.md` 阶段 6）。
