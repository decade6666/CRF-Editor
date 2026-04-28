# Spec: R1 — 设置页新增导入能力与重排导入/导出布局

## Scope
前端设置弹窗布局调整 + 后端两个独立导入接口。

## Functional Requirements

### FR-1.1 设置页布局
- 数据管理区从单列按钮改为两列纵向布局
- 左列：「导入项目」、「导入数据库」
- 右列：「导出当前项目」、「导出整个数据库」
- 所有按钮文案保持与现有系统风格一致

### FR-1.2 导入项目（单项目 .db）
- 仅管理员可触发（后端 gate）
- 用户选择本地 .db 文件，上传至 `POST /api/admin/import/project-db`
- 后端预检：
  1. 文件类型必须为 SQLite
  2. 文件包含 project 表，且 project 数量 **恰好等于 1**（不满足则 400）
  3. Schema 兼容性检查（必须包含 project/visit/form/field/codelist/unit 等核心表）
- 导入成功后：
  - 为导入的项目分配新主键
  - 所有子资源（visit/form/visit_form/field_definition/form_field/codelist/codelist_option/unit/logo）全量深拷贝
  - `project.owner_id` 强制重绑为当前操作者
  - 返回新项目 ID 与名称

### FR-1.3 导入数据库（整库合并）
- 仅管理员可触发（后端 gate）
- 用户选择本地 .db 文件，上传至 `POST /api/admin/import/database-merge`
- 后端预检：同 FR-1.2 的文件类型与 Schema 兼容性检查
- 合并规则：
  - **不导入 user 表**：外部用户记录全部忽略
  - **owner 重绑**：所有导入项目的 owner_id 均重绑为当前操作者
  - **重名策略**：若目标库已存在同名项目，新项目自动追加后缀（如「项目A (导入1)」），不覆盖、不跳过
  - 子资源全量深拷贝（同 FR-1.2）
- 返回结构化合并报告：新增项目列表、重命名项目列表

## API Contracts

```
POST /api/admin/import/project-db
  Content-Type: multipart/form-data
  Body: file (binary)
  Auth: admin gate
  Response 200: { "project_id": int, "project_name": str }
  Response 400: { "detail": str }  // schema 不兼容 / 非单项目 / 非 SQLite

POST /api/admin/import/database-merge
  Content-Type: multipart/form-data
  Body: file (binary)
  Auth: admin gate
  Response 200: { "imported": [{ "id": int, "name": str }], "renamed": [{ "original": str, "new": str }] }
  Response 400: { "detail": str }
```

## Non-Functional Requirements
- 预检失败时不写入任何数据（事务原子性）
- 整库合并写入在单一事务内；文件系统写入（logo）在事务成功后执行
- 文件大小限制：后端接受最大 200 MB
- 不支持外部库 schema 版本低于当前 schema 的情况（直接 400，不做兼容分支）

## Acceptance Criteria
- [ ] 设置页数据管理区呈现两列四按钮布局
- [ ] 导入项目：上传单项目 .db 文件后，刷新项目列表可见新项目，owner 为当前用户
- [ ] 导入项目：上传含 0 个或 2+ 个 project 的 .db 时返回 400 且数据库无任何变更
- [ ] 导入数据库：合并成功后返回报告，包含新增与重命名列表
- [ ] 导入数据库：重名项目自动重命名，不覆盖现有项目
- [ ] 导入数据库：所有导入项目的 owner 均为当前操作者，不产生孤儿项目
- [ ] 非管理员用户调用导入接口返回 403
