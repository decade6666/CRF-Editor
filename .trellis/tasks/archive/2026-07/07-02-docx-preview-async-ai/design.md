# Design: Word 导入预览 AI 复核异步化

## Architecture

将 `preview_docx_import` 端点中的 `await review_forms()` 同步等待改为 `asyncio.create_task()` 后台执行，预览响应立即返回。

### 为什么选 asyncio 而不是 threading

- `review_forms()` 已经是 async 函数，使用 `httpx.AsyncClient`
- threading 需要在子线程中桥接事件循环（`asyncio.run()`），是 FastAPI 应用的反模式
- asyncio 协作式调度，dict 读写无需 threading lock
- 与截图服务的 threading 模式不同，因为截图依赖 COM 接口（同步/CPU 密集）

### 数据流

```
preview_docx_import()
  ├── parse_full(file_path)           # 同步，保留
  ├── asyncio.create_task(review_bg)  # 新：后台启动 AI 复核
  ├── DocxScreenshotService.start()   # 已有：后台截图
  └── return DocxPreviewResponse      # 立即返回，含 ai_task_id

GET /ai-review/status
  └── 查询 _ai_tasks[temp_id]        # 返回状态 + 渐进式结果

Frontend (App.vue)
  ├── handleDocxUploadSuccess()       # 立即渲染表单列表
  ├── startAiReviewPolling(temp_id)   # setTimeout 递归轮询
  └── mergeAiSuggestions()            # 渐进式合并到表单预览
```

## API Contract

### Modified: `POST /projects/{pid}/import-docx/preview`

响应新增字段：

```python
class DocxPreviewResponse(BaseModel):
    forms: List[DocxFormPreview]
    temp_id: str
    ai_error: Optional[str] = None      # 保留，值改为 "AI复核进行中" 或 null（AI未启用）
    ai_task_id: Optional[str] = None    # 新增，等于 temp_id
```

### New: `GET /projects/{pid}/import-docx/{temp_id}/ai-review/status`

```python
class AIReviewStatus(BaseModel):
    status: str                         # pending | running | done | failed
    progress: Optional[dict] = None     # {"completed": 2, "total": 5}
    suggestions: Optional[Dict[int, List[dict]]] = None  # 与原 ai_suggestions 同结构
    error: Optional[str] = None
```

- 渐进式返回：每个表单复核完成后立即反映在 suggestions 中
- done 时包含完整 suggestions
- failed 时包含 error 信息

## State Management

```python
@dataclass
class AIReviewTask:
    status: str = "pending"             # pending | running | done | failed
    total: int = 0
    completed: int = 0
    suggestions: Dict[int, List[dict]] = field(default_factory=dict)
    error: Optional[str] = None
    created_at: float = 0.0            # time.time()

_ai_tasks: Dict[str, AIReviewTask] = {}
```

- Key 为 `temp_id`（与截图/临时文件共享生命周期）
- 无需 threading lock（asyncio 单线程协作式）
- 清理策略：`DocxImportService.cleanup_temp()` 时一并清理，或 TTL 1 小时自动过期

## Frontend Changes

### App.vue

- `handleDocxUploadSuccess`: 保持不变（已能正常渲染表单列表，即使无 AI 建议）
- 新增 `startAiReviewPolling(tempId)`: setTimeout 递归，3s 间隔
- 新增 `mergeAiSuggestions(suggestions)`: 将渐进式结果合并到 `importedFormsPreview`
- `importWordStep === 2` 时显示 AI 复核中的 loading 指示器

### DocxCompareDialog.vue

- AI 建议区域增加 loading 状态
- 建议到达后动态更新（无需用户操作）

## Compatibility

- 执行导入 (`/import-docx/execute`) 不依赖 AI 结果，无需修改
- `DocxPreviewResponse` 保持向后兼容（新字段 optional）
- AI 未启用时不创建后台任务，`ai_task_id` 为 null
- 单 worker 部署，in-memory dict 满足需求

## Risks

| 风险 | 缓解措施 |
|------|----------|
| 后台任务内存泄漏 | cleanup_temp 时一并清理；TTL 兜底 |
| 服务重启丢失任务 | 前端 404 时停止轮询，显示"AI复核中断" |
| 轮询请求堆积 | setTimeout 递归（非 setInterval），确保前一次完成后再发下一次 |
