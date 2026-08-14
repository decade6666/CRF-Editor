# 机构预设与项目 profile 原子保存 — 技术设计

## 架构边界

- 预设 = 管理员维护的填充模板；项目 = 快照消费方（不存 preset_id）。管理员后改删不影响项目。
- Logo 文件 + DB 是两类资源：DB 是唯一事实源，文件操作全部补偿式。顺序固定「准备文件 → DB 事务 → commit → 删旧文件」。
- 服务自有 Session 事务（`Session(get_engine())` + `session.begin()`）用于所有文件+DB 组合写；普通 `get_session` 仅在无文件操作的纯 DB 路由使用。

## 数据模型与 SQLite 兼容

```python
class OrganizationPreset(Base):
    __tablename__ = "organization_preset"
    id, name: String(255, collation="NOCASE") not null
    data_management_unit: String(255, collation="NOCASE") nullable
    logo_path: String(500) nullable
    created_at, updated_at
    UniqueConstraint("name", name="uq_org_preset_name")
    UniqueConstraint("data_management_unit", name="uq_org_preset_unit")
```

- 空白单位 → schema before-validator 归一 None；SQLite 允许多个 NULL 共存。
- 新表由 `create_all` 幂等创建；不写轻量迁移函数（无需改旧库结构）。测试：重复 `init_db()` 不报错、约束 DDL、trim/大小写冲突、多 null。
- 友好冲突预检（先查再写）+ 数据库约束兜底并发，统一 409「机构名称已存在」/「单位已存在」。

## 文件存储服务（抽取自 projects.py）

```text
logo_storage_service.py
  read_bounded_upload(file, max_mb=5) -> bytes          # 5MB+1B 截断检测
  validate_bitmap(filename, content) -> ext             # is_safe_file_upload 白名单
  prepare_new_file(namespace, content, ext) -> rel_path # UUID 文件名，事务外
  copy_file_for_project(namespace, source_rel) -> rel   # preset 快照复制
  safe_resolve(namespace, rel) -> Path                  # 穿越防护（_resolve_logo_path 语义）
  delete_file(namespace, rel) -> bool                   # 失败仅 warning
  read_safe(namespace, rel) -> bytes                    # 历史文件魔数复核
```

目录：`upload_path/organization-logos/` 与 `upload_path/logos/` 隔离。响应/日志不暴露绝对路径。

## API 契约

### 机构预设（管理员）

- `GET /api/admin/organization-presets` → 全字段（含 logo_path 仅作 has_logo/预览 URL 依据，不直接暴露路径语义）
- `POST /api/admin/organization-presets`（multipart：`metadata` JSON + `logo_action=keep|upload|clear` + `file?`）
- `PUT /api/admin/organization-presets/{id}`（同上；keep 保留原 Logo）
- `DELETE /api/admin/organization-presets/{id}` → 204（事务删行 → commit → unlink，失败 warning）

### 普通用户

- `GET /api/organization-presets` → `[{id, data_management_unit, has_logo}]`（仅非空单位，按 name NOCASE 排序）
- `GET /api/organization-presets/{id}/logo` → FileResponse（认证 + 404 无 Logo + 位图复核）

### 项目 profile

`PUT /api/projects/{project_id}/profile`（multipart）：

```text
metadata: JSON(ProjectUpdate 字段集，company_logo_path 禁止)
logo_action: keep | preset | upload | clear
preset_id: preset 必填；file: upload 必填
```

流程：读 metadata 并校验 → 按 action 在事务外准备新文件（upload 校验写 UUID；preset 复制预设 Logo 为新 UUID）→ 服务自有事务内复核权限/预设并写项目行 → commit 失败删新文件；commit 成功删旧文件（失败 warning）。

## 前端状态机（ProjectInfoTab Logo 草稿）

```text
logoDraftSource: 'project' | 'preset' | 'upload' | 'clear' | null(未改)
- 点预设候选：unit = 预设单位；有 Logo → source='preset'（拉取 Blob 预览）；无 Logo → source='clear'
- 改单位文本：单位转自定义；logoDraftSource 保留
- 上传：source='upload'（ObjectURL 预览）
- 清除：source='clear'
- 保存：keep（source 为 null 或 project）| preset（source='preset'，带 preset_id）| upload | clear
```

保存成功后才改 URL 显示并 revoke 旧 Blob；取消/卸载 revoke 全部。

## 兼容与回滚

- 旧 `PUT /projects/{id}` / `POST /projects/{id}/logo` 与前端调用、`test_project_metadata.py` 等测试迁移同 PR 完成；删除后补 404/405 契约测试。
- `GET /projects/{id}/logo`、项目复制（`project_clone_service`）、purge（`project_purge_service`）、Word 导出消费 `company_logo_path` 不变。
- 回滚单位 = 整条 PR revert。
