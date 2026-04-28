# Tasks: 导出数据库 & 简化 Word 下载

## 1. 后端 — 数据库导出服务

- [x] 1.1 在 `export_service.py` 新增 `export_full_database(db_path: str) -> str` 方法：使用 `sqlite3.backup()` 将运行中数据库安全复制到临时文件，返回临时文件路径
- [x] 1.2 在 `export_service.py` 新增 `export_project_database(db_path: str, project_id: int, project_name: str) -> str` 方法：先调用 `export_full_database` 生成快照，然后对临时文件执行裁剪（PRAGMA foreign_keys=ON → NULL owner_id → DELETE user → DELETE other projects → VACUUM），返回临时文件路径

## 2. 后端 — 重写导出路由

- [x] 2.1 移除 `export.py` 中的 `_export_cache`、`_TOKEN_TTL`、`_cleanup_expired()`、`prepare_export()`、`download_by_token()` 及相关 import（uuid、time、Dict、Tuple）
- [x] 2.2 新增 `POST /api/projects/{project_id}/export/word` 端点：生成临时 docx → 验证 → `FileResponse` 直接返回，`BackgroundTask` 清理临时文件
- [x] 2.3 新增 `GET /api/export/database` 端点：调用 `export_full_database`，返回 `FileResponse`，文件名 `crf_editor_full_YYYYMMDD.db`
- [x] 2.4 新增 `GET /api/projects/{project_id}/export/database` 端点：验证项目所有者，调用 `export_project_database`，返回 `FileResponse`，文件名 `{project_name}_template_YYYYMMDD.db`

## 3. 前端 — 简化 Word 导出

- [x] 3.1 重写 `App.vue` 中 `exportWord()` 函数：loading → sleep 1s → POST 请求 → blob 下载 → 成功提示
- [x] 3.2 移除 `App.vue` 中 `exportDownloadUrl` ref、`exportDownloadExpiresIn` ref、`clearExportDownloadState()` 函数及所有调用点
- [x] 3.3 移除 `App.vue` 中 `copyExportDownloadLink()`、`triggerExportDownload()` 函数
- [x] 3.4 移除 `App.vue` 模板中的"下载文件"按钮、"复制下载链接"按钮、"下载链接 N 分钟内有效"文字
- [x] 3.5 精简 `exportDownloadState.js`：移除 `shouldResetExportDownload()`、`canUseClipboardWriteText()`、`resolveDownloadLink()`，保留 `getDownloadFilename()`

## 4. 前端 — 数据库导出 UI

- [x] 4.1 在 `App.vue` 设置弹窗中增加 `<el-divider>数据管理</el-divider>` 和导出按钮区域（"导出整个数据库" + "导出当前项目"，后者在未选项目时 disabled）
- [x] 4.2 实现 `exportFullDatabase()` 函数：ElMessageBox.confirm → fetch GET → blob 下载 → ElMessage.success
- [x] 4.3 实现 `exportProjectDatabase()` 函数：ElMessageBox.confirm → fetch GET → blob 下载 → ElMessage.success

## 5. 测试更新

- [x] 5.1 更新 `test_export_validation.py`：移除 token 相关测试（prepare/download），新增 `POST /export/word` 直接下载测试
- [x] 5.2 新增数据库导出测试：整库导出返回 `.db` 文件、单项目导出裁剪完整性（仅含目标项目、user 表为空、owner_id 为 NULL）、导出文件兼容 `_open_template_session()`

## 6. 清理验证

- [x] 6.1 确认无残留引用：grep 搜索 `_export_cache`、`_TOKEN_TTL`、`prepare_export`、`download_by_token`、`exportDownloadUrl`、`exportDownloadExpiresIn`、`clearExportDownloadState`、`copyExportDownloadLink`、`triggerExportDownload` 均无结果
- [x] 6.2 端到端验证：启动应用，测试 Word 导出和数据库导出功能正常
