# Spec: 数据库导出

## ADDED Requirements

### Requirement: 整库导出端点

系统 SHALL 提供 `GET /api/export/database` 端点，已登录用户调用后返回完整数据库 `.db` 文件的 `FileResponse`。

系统 MUST 使用 `sqlite3.backup()` API 生成数据库快照，确保 WAL 模式下数据一致性。

响应 MUST 设置 `Content-Disposition: attachment; filename="crf_editor_full_YYYYMMDD.db"`。

系统 MUST 在响应发送完毕后自动删除临时文件（通过 `BackgroundTask`）。

#### Scenario: 已登录用户成功导出整库
- **WHEN** 已登录用户发送 `GET /api/export/database`
- **THEN** 系统返回 200 状态码和 `.db` 文件
- **THEN** 文件名格式为 `crf_editor_full_YYYYMMDD.db`（YYYYMMDD 为当前日期）
- **THEN** 文件内容是完整数据库快照，包含所有表和数据

#### Scenario: 未登录用户无法导出
- **WHEN** 未登录用户发送 `GET /api/export/database`
- **THEN** 系统返回 401 状态码

#### Scenario: 导出后临时文件被清理
- **WHEN** 整库导出响应发送完毕
- **THEN** 服务端临时文件 MUST 被自动删除

### Requirement: 单项目导出端点

系统 SHALL 提供 `GET /api/projects/{project_id}/export/database` 端点，项目所有者调用后返回仅包含该项目数据的 `.db` 文件。

系统 MUST 使用 `sqlite3.backup()` 先生成完整快照，然后对临时文件执行裁剪。

裁剪操作 MUST 按以下严格顺序执行：
1. `PRAGMA foreign_keys = ON`
2. `UPDATE project SET owner_id = NULL WHERE id = ?`（目标项目）
3. `DELETE FROM user`
4. `DELETE FROM project WHERE id != ?`（依赖 CASCADE 级联删除关联数据）
5. `VACUUM`

响应 MUST 设置 `Content-Disposition: attachment; filename="{project_name}_template_YYYYMMDD.db"`。

#### Scenario: 项目所有者成功导出单项目
- **WHEN** 项目所有者发送 `GET /api/projects/{project_id}/export/database`
- **THEN** 系统返回 200 状态码和 `.db` 文件
- **THEN** 文件名格式为 `{project_name}_template_YYYYMMDD.db`
- **THEN** 文件仅包含目标项目的数据
- **THEN** `user` 表为空
- **THEN** `project` 表仅含目标项目且 `owner_id` 为 NULL

#### Scenario: 非所有者无法导出
- **WHEN** 非项目所有者发送 `GET /api/projects/{project_id}/export/database`
- **THEN** 系统返回 403 状态码

#### Scenario: 项目不存在
- **WHEN** 用户发送 `GET /api/projects/{999}/export/database`（不存在的 ID）
- **THEN** 系统返回 404 状态码

#### Scenario: 级联删除完整性
- **WHEN** 单项目导出裁剪执行 `DELETE FROM project WHERE id != ?`
- **THEN** 被删项目关联的 visit、form、field_definition、codelist、unit 记录 MUST 被级联删除
- **THEN** visit_form、form_field、codelist_option 等子表记录 MUST 被级联删除

#### Scenario: 导出文件兼容模板导入
- **WHEN** 单项目导出的 `.db` 文件作为模板被 `ImportService._open_template_session()` 打开
- **THEN** MUST 能正常创建 session 并查询数据

### Requirement: 设置弹窗数据库导出 UI

前端设置弹窗 MUST 在"编辑模式"开关下方增加分隔线和导出区域，包含"导出整个数据库"和"导出当前项目"两个按钮。

"导出当前项目"按钮在未选择项目时 MUST 处于 disabled 状态。

点击按钮 MUST 弹出 `ElMessageBox.confirm()` 确认框，确认后触发下载。

#### Scenario: 未选项目时按钮禁用
- **WHEN** 用户打开设置弹窗且未选择项目
- **THEN** "导出整个数据库"按钮可用
- **THEN** "导出当前项目"按钮 disabled

#### Scenario: 确认后触发整库下载
- **WHEN** 用户点击"导出整个数据库"并在确认框中点击确认
- **THEN** 系统发送 `GET /api/export/database` 请求
- **THEN** 收到响应后通过 blob + createObjectURL 触发浏览器下载
- **THEN** 下载完成后显示 `ElMessage.success('数据库导出成功')`

#### Scenario: 确认后触发单项目下载
- **WHEN** 用户点击"导出当前项目"并在确认框中点击确认
- **THEN** 系统发送 `GET /api/projects/{id}/export/database` 请求
- **THEN** 收到响应后通过 blob + createObjectURL 触发浏览器下载

#### Scenario: 用户取消确认
- **WHEN** 用户点击导出按钮后在确认框中点击取消
- **THEN** 不发送任何请求

#### Scenario: 导出失败显示错误
- **WHEN** 导出请求返回非 200 状态码
- **THEN** 显示 `ElMessage.error()` 包含错误信息
