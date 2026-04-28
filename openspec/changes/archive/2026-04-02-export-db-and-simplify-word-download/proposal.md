# Proposal: 导出数据库 & 简化 Word 下载

## 变更概述

两项独立功能变更：

1. **导出数据库**：在设置弹窗中增加两个导出按钮（导出整库 / 导出当前项目），点击后弹出确认框，确认后触发浏览器下载 `.db` 文件。导出的 `.db` 可作为模板被现有导入功能读取。
2. **简化 Word 导出**：移除 token 两步下载机制，后端改为单请求直接返回文件；前端点击"导出 Word"后 sleep 1 秒自动触发浏览器下载，移除"下载文件"/"复制下载链接"/"下载链接 N 分钟内有效"UI。

---

## 需求 1: 导出数据库

### 1.1 后端

#### 新增 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/export/database` | 导出整个数据库快照 |
| GET | `/api/projects/{project_id}/export/database` | 导出单项目模板库 |

#### 整库导出 (`/api/export/database`)

- 鉴权：`get_current_user`（已登录即可）
- 实现：使用 Python `sqlite3` 标准库的 `connection.backup()` API 将运行中的 WAL 模式数据库安全复制到临时文件
- 响应：`FileResponse`，`Content-Disposition: attachment; filename="crf_editor_full_YYYYMMDD.db"`
- 清理：下载完成后自动删除临时文件（`background` 参数）

#### 单项目导出 (`/api/projects/{project_id}/export/database`)

- 鉴权：`get_current_user` + `verify_project_owner`
- 实现：
  1. 用 `sqlite3.backup()` 先生成完整快照到临时文件
  2. 连接临时文件，删除非目标项目的数据（`DELETE FROM project WHERE id != ?` 并级联删除关联数据）
  3. 删除 `user` 表数据（安全考虑）
  4. `VACUUM` 压缩文件
- 响应：`FileResponse`，`Content-Disposition: attachment; filename="{project_name}_template_YYYYMMDD.db"`

#### 关键约束

- **WAL 安全**：必须使用 `sqlite3.backup()` 而非直接复制文件，确保 WAL 日志中未 checkpoint 的数据也被包含
- **模板兼容性**：导出的 `.db` 必须能被 `ImportService._open_template_session()` 正常打开并查询
- **不含敏感数据**：单项目导出时清除 `user` 表；整库导出保留全部数据（管理员行为）

### 1.2 前端

#### 设置弹窗 UI

在设置弹窗 (`App.vue` 设置 el-dialog) 中，"编辑模式" switch 下方增加分隔线和导出区域：

```
<el-divider>数据管理</el-divider>
<el-form-item label="导出数据库">
  <el-button @click="exportFullDatabase">导出整个数据库</el-button>
  <el-button @click="exportProjectDatabase" :disabled="!selectedProject">导出当前项目</el-button>
</el-form-item>
```

#### 交互流程

1. 用户点击按钮 → `ElMessageBox.confirm()` 弹出确认框
2. 确认后 → `fetch(url, { headers: getAuthHeaders() })` 请求后端
3. 收到响应后 → `blob` → `URL.createObjectURL` → `<a>.click()` 触发浏览器下载
4. 下载完成 → `ElMessage.success('数据库导出成功')`

---

## 需求 2: 简化 Word 导出

### 2.1 后端

#### 修改 `backend/src/routers/export.py`

- **移除** `prepare_export()` 端点 (`POST /projects/{id}/export/word/prepare`)
- **移除** `download_by_token()` 端点 (`GET /export/download/{token}`)
- **移除** `_export_cache` 字典和 `_cleanup_expired()` 函数和 `_TOKEN_TTL` 常量
- **新增** 单请求直接导出端点：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/projects/{project_id}/export/word` | 直接返回 Word 文件 |

- 鉴权：`get_current_user` + `verify_project_owner`
- 实现：生成临时 docx → 验证 → `FileResponse` 直接返回
- 清理：利用 `FileResponse` 的 `background` 参数在响应发送后删除临时文件

### 2.2 前端

#### 修改 `frontend/src/App.vue`

- **修改** `exportWord()` 函数：
  1. 显示 loading 状态
  2. `POST /api/projects/{id}/export/word`（直接返回文件流）
  3. `await new Promise(r => setTimeout(r, 1000))` — sleep 1 秒
  4. 将响应 blob 转为 ObjectURL → `<a>.click()` 触发下载
  5. 成功提示

- **移除** 以下代码/UI：
  - `exportDownloadUrl` ref
  - `exportDownloadExpiresIn` ref
  - `clearExportDownloadState()` 函数（及所有调用点）
  - `copyExportDownloadLink()` 函数
  - `triggerExportDownload()` 函数
  - 模板中的"下载文件"按钮 (line 496)
  - 模板中的"复制下载链接"按钮 (line 497)
  - 模板中的"下载链接 N 分钟内有效"文字 (line 498)

#### 修改/清理 `frontend/src/composables/exportDownloadState.js`

- **移除** `shouldResetExportDownload()`、`canUseClipboardWriteText()`、`resolveDownloadLink()` — 不再需要
- **保留** `getDownloadFilename()` — Word 导出和数据库导出共用

---

## 发现的约束

### 硬约束

| # | 约束 | 影响 |
|---|------|------|
| H1 | SQLite WAL 模式下直接复制 .db 文件不安全 | 必须使用 `sqlite3.backup()` API |
| H2 | `ImportService._open_template_session()` 只接受 `.db` 后缀并直接用当前 ORM 查询 | 导出的 .db 必须保持完整 schema |
| H3 | 前端 fetch 需要 Bearer token 鉴权 | 不能用 `window.open()` 直接下载 |
| H4 | 模板导入不做 schema 迁移 | 未来 schema 变更可能导致旧导出模板不兼容 |

### 软约束

| # | 约束 | 影响 |
|---|------|------|
| S1 | 路由层保持薄，逻辑下沉 service | 数据库导出核心逻辑放 service 层 |
| S2 | 测试 `test_export_validation.py` 覆盖了 prepare/download 流程 | 需同步更新测试 |

### 依赖

- `backend/main.py` 注册路由 — 新端点需注册
- `frontend/src/App.vue` 导入 `exportDownloadState.js` — 清理导入语句
- `config.db_path` 提供数据库路径 — 数据库导出依赖此路径

### 风险

| 风险 | 缓解 |
|------|------|
| 导出大数据库时间长，前端超时 | 加 loading 状态，后端设合理 timeout |
| 单项目导出级联删除遗漏关联数据 | 按外键关系依次清理，测试验证 |
| 移除 token 机制后，旧版前端调旧 API 404 | 一次性前后端同步部署（桌面应用天然保证） |

---

## 验收标准

### 需求 1: 导出数据库

- [ ] 设置弹窗中有"导出整个数据库"和"导出当前项目"两个按钮
- [ ] 未选择项目时，"导出当前项目"按钮 disabled
- [ ] 点击按钮弹出确认框，确认后触发浏览器下载 `.db` 文件
- [ ] 导出的 `.db` 文件可被导入模板功能读取（`ImportService._open_template_session()` 正常打开）
- [ ] 单项目导出的 `.db` 不含 `user` 表数据和其他项目数据

### 需求 2: 简化 Word 导出

- [ ] 点击"导出 Word"按钮后自动完成下载，无需二次操作
- [ ] 下载前有 1 秒延迟（用户体验缓冲）
- [ ] 移除"下载文件"按钮、"复制下载链接"按钮、"下载链接 N 分钟内有效"文字
- [ ] 后端 `POST /api/projects/{id}/export/word` 直接返回 FileResponse
- [ ] 旧端点 `prepare` 和 `download/{token}` 已移除
- [ ] 导出失败时显示明确错误提示

---

## 涉及文件清单

### 后端（新增/修改）

| 文件 | 操作 |
|------|------|
| `backend/src/routers/export.py` | **重写** — 移除 token 机制，新增 Word 直接下载 + 数据库导出端点 |
| `backend/src/services/export_service.py` | **新增方法** — 数据库导出逻辑（backup + 项目级清理） |
| `backend/tests/test_export_validation.py` | **更新** — 适配新 API 端点 |

### 前端（修改）

| 文件 | 操作 |
|------|------|
| `frontend/src/App.vue` | **修改** — 简化 exportWord()、新增数据库导出功能、清理 download state |
| `frontend/src/composables/exportDownloadState.js` | **精简** — 移除不再需要的函数 |
