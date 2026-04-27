# Spec: 简化 Word 导出

## ADDED Requirements

### Requirement: 单请求 Word 导出端点

系统 SHALL 提供 `POST /api/projects/{project_id}/export/word` 端点，直接生成并返回 Word 文件的 `FileResponse`。

系统 MUST 在生成后验证文件有效性（`ExportService._validate_output()`），验证失败返回 500 错误。

响应 MUST 设置 `Content-Disposition: attachment; filename="{project_name}_CRF.docx"`。

系统 MUST 在响应发送完毕后自动删除临时文件。

#### Scenario: 项目所有者成功导出 Word
- **WHEN** 项目所有者发送 `POST /api/projects/{project_id}/export/word`
- **THEN** 系统返回 200 状态码和 `.docx` 文件
- **THEN** 文件名格式为 `{project_name}_CRF.docx`

#### Scenario: 非所有者无法导出
- **WHEN** 非项目所有者发送 `POST /api/projects/{project_id}/export/word`
- **THEN** 系统返回 403 状态码

#### Scenario: 项目不存在
- **WHEN** 用户发送 `POST /api/projects/{999}/export/word`
- **THEN** 系统返回 404 状态码

#### Scenario: 导出失败返回错误
- **WHEN** `ExportService.export_project_to_word()` 返回 False 或 `_validate_output()` 验证失败
- **THEN** 系统返回 500 状态码和错误信息
- **THEN** 临时文件 MUST 被清理

#### Scenario: 异常时返回 500
- **WHEN** 导出过程抛出未预期异常
- **THEN** 系统返回 500 状态码和通用错误信息
- **THEN** 异常 MUST 被记录到日志

## REMOVED Requirements

### Requirement: Token 准备端点
**Reason**: 被单请求直接下载替代，token 两步机制增加不必要复杂度
**Migration**: 使用新端点 `POST /api/projects/{id}/export/word`

### Requirement: Token 下载端点
**Reason**: 被单请求直接下载替代
**Migration**: 使用新端点 `POST /api/projects/{id}/export/word`

### Requirement: 导出缓存与过期清理
**Reason**: 不再需要 token 缓存机制（`_export_cache`、`_TOKEN_TTL`、`_cleanup_expired()`）
**Migration**: 无需替代，临时文件通过 `BackgroundTask` 自动清理

## ADDED Requirements

### Requirement: 前端 Word 导出简化

前端 `exportWord()` 函数 MUST 改为：
1. 显示 loading 状态
2. `await new Promise(r => setTimeout(r, 1000))` 延迟 1 秒
3. `POST /api/projects/{id}/export/word` 获取文件流
4. 将响应 blob 转为 ObjectURL → `<a>.click()` 触发下载
5. 显示成功提示并关闭 loading

#### Scenario: 用户点击导出 Word 自动下载
- **WHEN** 用户点击"导出 Word"按钮
- **THEN** 按钮进入 loading 状态
- **THEN** 延迟 1 秒后发送请求
- **THEN** 收到响应后自动触发浏览器下载
- **THEN** 无需用户二次操作

#### Scenario: 导出失败显示错误
- **WHEN** `POST /api/projects/{id}/export/word` 返回非 200
- **THEN** 显示 `ElMessage.error()` 包含错误信息
- **THEN** loading 状态关闭

## REMOVED Requirements

### Requirement: 下载文件按钮
**Reason**: 改为自动下载，无需二次操作
**Migration**: 无替代 UI

### Requirement: 复制下载链接按钮
**Reason**: 不再有可复制的链接
**Migration**: 无替代 UI

### Requirement: 下载链接有效期显示
**Reason**: 不再有 token 过期机制
**Migration**: 无替代 UI

### Requirement: exportDownloadState 状态管理函数
**Reason**: `shouldResetExportDownload()`、`canUseClipboardWriteText()`、`resolveDownloadLink()` 不再需要
**Migration**: 仅保留 `getDownloadFilename()` 供 Word 和数据库导出共用
