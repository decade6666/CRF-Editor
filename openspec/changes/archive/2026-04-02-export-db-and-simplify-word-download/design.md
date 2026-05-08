# Design: 导出数据库 & 简化 Word 下载

## Context

CRF-Editor 当前 Word 导出采用两步机制：先 `POST /prepare` 生成文件并返回 token，用户再用 token 下载。该机制增加了前端复杂度（状态管理、过期计时、复制链接），且对桌面应用场景无实际收益。

此外，用户需要将数据库导出为 `.db` 文件以便模板共享或备份，目前没有此功能。

**当前状态：**
- Word 导出：`prepare_export()` → token + 30 分钟缓存 → `download_by_token()`
- 前端维护 `exportDownloadUrl`、`exportDownloadExpiresIn` 两个 ref，以及 `clearExportDownloadState()`、`copyExportDownloadLink()`、`triggerExportDownload()` 等函数
- 数据库导出：不存在

**约束：**
- SQLite WAL 模式下直接复制 `.db` 不安全，必须使用 `sqlite3.backup()` API
- 前端 fetch 需要 Bearer token，不能用 `window.open()` 直接下载
- 导出的 `.db` 必须能被 `ImportService._open_template_session()` 正常打开
- `project.owner_id → user.id` 外键 **没有** `ondelete=CASCADE`（关键发现）

## Goals / Non-Goals

**Goals:**
- 提供整库和单项目数据库导出功能，导出文件兼容现有模板导入
- 简化 Word 导出为单次请求直接返回文件，移除所有 token 机制
- 清理前端相关的多余状态和 UI 元素

**Non-Goals:**
- 不做数据库 schema 迁移/版本兼容（已知限制 H4，暂不处理）
- 不做导出进度条（文件通常较小）
- 不修改导入功能
- 不添加导出格式选择（仅 `.db`）

## Decisions

### D1: 数据库快照方式 — `sqlite3.backup()` API

**选择：** 使用 Python `sqlite3` 标准库的 `connection.backup()` 方法。

**替代方案：**
- 直接复制 `.db` + `.wal` + `.shm` 文件 → 拒绝：WAL 模式下不安全，可能得到不一致快照
- `VACUUM INTO 'path'` → 拒绝：SQLite 3.27+ 才支持，且不如 backup API 通用

**理由：** `backup()` 是 SQLite 官方推荐的在线备份方式，能安全处理 WAL 模式，确保快照一致性。

### D2: 单项目导出 — 备份后裁剪策略

**选择：** 先 `backup()` 完整数据库到临时文件，再通过 raw `sqlite3` 连接删除非目标数据。

**裁剪步骤（严格顺序）：**
1. `PRAGMA foreign_keys = ON`（raw sqlite3 不继承 SQLAlchemy 设置）
2. `UPDATE project SET owner_id = NULL WHERE id = ?`（目标项目解除 user FK）
3. `DELETE FROM user`（清除敏感数据）
4. `DELETE FROM project WHERE id != ?`（级联删除其他项目的 visit、form、field_definition、codelist、unit 等）
5. `VACUUM`（压缩文件）

**关键发现：** `project.owner_id → user.id` 没有 `ondelete=CASCADE`，若不先 NULL 化 owner_id 就删除 user，会触发外键约束错误。必须在 DELETE user 之前将目标项目的 owner_id 设为 NULL。

**替代方案：**
- 从空数据库开始逐表复制数据 → 拒绝：需要维护表结构映射，schema 变更时容易遗漏
- 使用 SQLAlchemy ORM 操作临时数据库 → 拒绝：需要创建新 engine/session，过于复杂

### D3: Word 导出 — 单请求直接返回

**选择：** `POST /api/projects/{id}/export/word` 直接生成并返回 `FileResponse`。

**理由：** 桌面应用天然前后端同版本部署，不需要考虑版本不一致。单请求模式简化了前后端实现，消除了缓存管理、过期清理等复杂度。

### D4: 临时文件清理 — FileResponse background 参数

**选择：** 使用 Starlette `FileResponse` 的 `background` 参数注册清理任务，响应发送完毕后自动删除临时文件。

**模式：**
```python
from starlette.background import BackgroundTask

return FileResponse(
    tmp_path,
    background=BackgroundTask(os.unlink, tmp_path),
)
```

### D5: 前端下载模式 — fetch + blob + createObjectURL

**选择：** `fetch` 请求 → 读取 `response.blob()` → `URL.createObjectURL` → 创建隐藏 `<a>` 标签触发下载。

**理由：** 需要携带 Bearer token 鉴权，`window.open()` 无法附带自定义 header。此模式是带鉴权文件下载的标准做法。

### D6: 前端延迟 — Word 导出前 sleep 1 秒

**选择：** 在 `exportWord()` 中请求前 `await new Promise(r => setTimeout(r, 1000))`。

**理由：** 用户体验缓冲，避免按钮点击后瞬间完成导致用户疑惑"是否真的导出了"。loading 状态显示 1 秒提供视觉反馈。

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| 大数据库导出耗时长，前端可能超时 | 加 loading 状态；后端 `backup()` 通常在毫秒级完成 |
| 单项目裁剪遗漏关联数据 | 依赖已有 `ondelete=CASCADE` 外键；测试验证裁剪完整性 |
| `owner_id` FK 约束导致删除失败 | 严格先 NULL 化 owner_id 再删除 user（D2 步骤） |
| raw sqlite3 连接未启用 FK | 裁剪操作首行 `PRAGMA foreign_keys = ON`（D2 步骤 1） |
| 移除 token 机制后旧前端 404 | 桌面应用天然同步部署，不存在版本不一致 |
| 导出的 `.db` schema 与未来版本不兼容 | 已知限制（H4），暂不处理；导入时 `_open_template_session()` 会自然报错 |

## Migration Plan

无需数据迁移。前后端同步部署（桌面打包），不存在过渡期兼容问题。

**部署步骤：**
1. 后端：重写 `export.py` 路由 + 新增 `export_service.py` 数据库导出方法
2. 前端：修改 `App.vue` + 精简 `exportDownloadState.js`
3. 测试：更新 `test_export_validation.py` 适配新 API
4. 打包发布
