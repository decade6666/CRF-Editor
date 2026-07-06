# Implementation Plan: Word 导入预览 AI 复核异步化

## Checklist

### 1. 后端：AI 复核后台任务模块

**文件**: `backend/src/services/ai_review_service.py`

- [ ] 新增 `AIReviewTask` dataclass（status/total/completed/suggestions/error/created_at）
- [ ] 新增模块级 `_ai_tasks: Dict[str, AIReviewTask] = {}`
- [ ] 新增 `get_ai_task(temp_id)` / `remove_ai_task(temp_id)` / `cleanup_old_ai_tasks(max_age=3600)`
- [ ] 新增 `start_ai_review(temp_id, forms)` async 函数：
  - 创建 AIReviewTask（status=pending）
  - `asyncio.create_task()` 启动后台协程
  - 后台协程内：逐表单调用原 `_review_one`，每完成一个更新 `completed` 和 `suggestions`
  - 全部完成 → status=done；异常 → status=failed + error
- [ ] 原 `review_forms()` 保留不变（可继续用于非异步场景或测试）

**验证**: `python3 -c "from src.services.ai_review_service import start_ai_review, get_ai_task; print('OK')"`

### 2. 后端：预览端点修改

**文件**: `backend/src/routers/import_docx.py`

- [ ] `preview_docx_import` 中移除 `await review_forms(full_forms)` 同步调用
- [ ] 改为 `await start_ai_review(temp_id, full_forms)`（非阻塞启动）
- [ ] AI 未启用时跳过启动，`ai_task_id` 返回 null
- [ ] `DocxPreviewResponse` 新增 `ai_task_id: Optional[str] = None`
- [ ] `ai_error` 在 AI 启用时设为 `None`（不再是错误信息，建议在前端通过轮询获取）

**验证**: 上传 docx 后端点应在 <5s 内返回（不含 AI 等待）

### 3. 后端：AI 复核状态查询端点

**文件**: `backend/src/routers/import_docx.py`

- [ ] 新增 `GET /projects/{pid}/import-docx/{temp_id}/ai-review/status`
- [ ] 响应 schema `AIReviewStatusResponse`（status/progress/suggestions/error）
- [ ] 鉴权：复用 `get_current_user` + `verify_project_owner`
- [ ] temp_id 不存在时返回 404

**验证**: 手动调用端点，确认 pending → running → done 状态流转

### 4. 后端：清理集成

**文件**: `backend/src/services/ai_review_service.py`, `backend/src/routers/import_docx.py`

- [ ] `cleanup_temp` 调用链中加入 `remove_ai_task(temp_id)`
- [ ] `cleanup_old_ai_tasks()` 挂载到 `cleanup_screenshots` 管理端点或独立定时清理
- [ ] 确保 execute 端点的 cleanup 路径也清理 AI task

**验证**: 手动触发 cleanup，确认 AI task 被清除

### 5. 前端：轮询 AI 复核结果

**文件**: `frontend/src/App.vue`

- [ ] `handleDocxUploadSuccess` 中：收到 `ai_task_id` 后启动轮询
- [ ] 新增 `pollAiReview(tempId)` 函数（setTimeout 递归，3s 间隔）
- [ ] 新增 `mergeAiSuggestions(suggestions)` 函数：将建议合并到 `importedFormsPreview`
- [ ] 轮询终止条件：status=done/failed、对话框关闭、组件卸载
- [ ] AI 未启用（ai_task_id 为 null）时不轮询

**验证**: 浏览器中上传 docx，表单列表立即显示，AI 建议 ~3-30s 后渐进补充

### 6. 前端：AI 复核 loading 状态

**文件**: `frontend/src/App.vue`

- [ ] Step 2 表单列表中增加 AI 复核状态指示（如小 icon 或文字提示）
- [ ] AI 建议到达后替换为实际建议内容
- [ ] AI 失败时显示"AI复核不可用"提示，不阻塞用户操作

**验证**: UI 上能看到 loading → 建议 或 loading → 失败降级

### 7. 测试更新

**文件**: `backend/tests/test_ai_review_service.py`, `backend/tests/test_docx_import_contract.py`

- [ ] 新增 `test_start_ai_review_creates_background_task`
- [ ] 新增 `test_ai_review_status_endpoint_returns_progressive_results`
- [ ] 新增 `test_ai_review_cleanup_with_temp_cleanup`
- [ ] 更新 `test_docx_import_contract.py` 中预览响应断言（新增 ai_task_id 字段）
- [ ] 确认现有 AI 测试（test_ai_review_service.py, test_settings_ai_test.py）通过

**验证**: `cd backend && python -m pytest tests/test_ai_review_service.py tests/test_docx_import_contract.py -v`

### 8. 全量回归

- [ ] `cd backend && python -m pytest`
- [ ] `cd frontend && node --test tests/*.test.js`

## Risky Files

| 文件 | 风险 | 回滚点 |
|------|------|--------|
| `ai_review_service.py` | 新增模块级状态管理 | 保留原 `review_forms()` 不修改 |
| `import_docx.py` | 预览端点行为变更 | git stash 恢复 |
| `App.vue` | 轮询逻辑和状态合并 | 回滚 handleDocxUploadSuccess |

## Execution Order

1 → 2 → 3 → 4 → 7 → 5 → 6 → 8（后端先完成并测试，前端再适配）
