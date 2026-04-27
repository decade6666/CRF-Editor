# Spec: R4 — 项目列表删除按钮常显 + 新增复制按钮

## Scope
前端：App.vue 项目列表 UI 调整。
后端：新增 ProjectCloneService 与复制接口。

## Functional Requirements

### FR-4.1 删除按钮常显
- 删除按钮从 hover 显示改为常显
- 视觉风格保持不变（颜色、尺寸、确认交互）

### FR-4.2 新增复制按钮
- 每个项目项新增复制图标按钮（与删除按钮并列）
- 点击触发 `POST /api/projects/{project_id}/copy`
- 复制成功后：新项目立即出现在当前用户项目列表顶部（或末尾）
- 复制期间按钮显示 loading 状态，防止重复点击

### FR-4.3 复制的完整项目树定义
复制必须包含以下所有实体（**全量深拷贝**）：

```
project
  ├── visit (含 order_index)
  ├── form (含 order_index)
  ├── visit_form (关联 visit + form，含 sequence)
  ├── field_definition (含 order_index)
  │   └── codelist
  │       └── codelist_option (含 order_index)
  ├── form_field (关联 form + field_definition，含 order_index)
  ├── unit (含 order_index)
  └── logo 文件（深拷贝，独立路径）
```

**包含未被表单引用的 field_definition、unit、codelist**（project 级全量资源）。

### FR-4.4 复制后处理
- 所有新主键独立生成，不复用源项目任何 ID
- 内部外键映射完整（不存在指向源项目子资源的悬空引用）
- `project.owner_id` = 当前操作者
- 项目名称规则：`{原名称} (副本)` 若已存在则追加序号 `(副本2)`、`(副本3)`...
- logo 文件复制到新路径（若存在）；若原项目无 logo，副本也无 logo

## API Contract

```
POST /api/projects/{project_id}/copy
  Auth: 当前用户必须为 owner 或 admin
  Response 200: { "project_id": int, "project_name": str }
  Response 404: 源项目不存在或无权访问
  Response 500: 复制失败（事务回滚，数据库无变更）
```

## Non-Functional Requirements
- 整个复制在单一数据库事务内完成
- logo 文件复制在事务提交后执行；文件写入失败不回滚数据库（记录错误日志）
- 复制时间预期 < 3s（正常项目规模）

## Acceptance Criteria
- [ ] 删除按钮在项目列表中常显
- [ ] 新增复制按钮，与删除按钮并列
- [ ] 复制成功后，新项目立即出现在当前用户项目列表中
- [ ] 复制后的项目可正常打开、编辑、导出
- [ ] 复制后的项目不存在指向源项目子资源 ID 的引用
- [ ] logo 文件独立（删除源项目 logo 不影响副本）
- [ ] 项目名称追加「(副本)」后缀，重名时追加序号
