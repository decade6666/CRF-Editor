# Word 导入预览 AI 复核异步化

## Goal

解决 Word 导入预览通过 Cloudflare 访问时因 AI 复核耗时过长导致 504 Gateway Timeout 的问题。

## Background

用户通过 `test.decadej.com`（Cloudflare 代理）访问 CRF Editor，上传 `.docx` 文件时触发 504 超时。

根因：`/import-docx/preview` 端点内 `review_forms()` 是同步 `await`，每个表单调用一次 AI API（超时上限 30s/表单，并发上限 5）。多表单文档的总处理时间（上传 + 解析 + AI 复核）超过 Cloudflare 网关超时（~100s）。

截图服务的 `pythoncom` ImportError 是非 Windows 环境的预期行为，与此问题无关。

## Requirements

### R1: AI 复核改为非阻塞后台任务

- 预览端点在文档解析完成后立即返回表单列表，不等待 AI 复核
- AI 复核在后台异步执行（类似截图服务的模式）
- 前端通过轮询获取 AI 建议结果

### R2: 新增 AI 复核状态查询接口

- 提供 `GET /projects/{project_id}/import-docx/{temp_id}/ai-review/status` 端点
- 返回状态（pending/running/done/failed）和结果数据
- 复核完成后返回与当前 `ai_suggestions` 相同结构的数据

### R3: 前端适配

- 预览对话框正常显示表单列表（无需等待 AI）
- AI 建议就绪后异步补充到表单预览中
- AI 复核失败或超时时优雅降级，不影响用户操作

### R4: 向后兼容

- `DocxPreviewResponse` 仍保留 `ai_error` 字段（标记为"AI复核进行中"或 null）
- 执行导入 (`/import-docx/execute`) 不依赖 AI 复核结果，无需修改

## Out of Scope

- Cloudflare 超时配置调整（基础设施层面）
- 截图服务在非 Windows 环境的行为（预期行为）
- `parse_full` 性能优化（当前不是瓶颈）

## Acceptance Criteria

1. 预览端点响应时间不再包含 AI 复核耗时
2. 多表单文档（5+ 表单）通过 Cloudflare 代理可正常完成预览
3. AI 复核完成后前端能正确显示建议
4. AI 复核失败不影响导入流程
5. 现有 AI 复核相关测试通过或按新接口更新
6. 现有 docx import contract 测试通过
