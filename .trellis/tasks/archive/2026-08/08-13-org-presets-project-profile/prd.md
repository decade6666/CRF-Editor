# 机构预设与项目 profile 原子保存

## Goal

让管理员集中维护「机构名称 + 数据管理单位 + 公司 Logo」预设，普通用户在项目信息页通过数据管理单位自动完成快速套用（Logo 同步预览），并可继续自定义覆盖；同时把项目元数据与 Logo 保存收敛为单一 multipart 原子端点，消除「元数据已保存、Logo 失败」的半成功状态。预设是快照式填充工具：项目不保存 `preset_id`，管理员后改删不影响已保存项目。

## Requirements

### 数据模型

1. 新增 `organization_preset` 表：`id`、`name`（trim 后必填）、`data_management_unit`（可空）、`logo_path`（仅存安全相对文件名）、时间戳。注册进 `models/__init__.py`，由 `Base.metadata.create_all()` 幂等建表（不改旧表、不迁移数据）。
2. 唯一性：`name` 与「非空 `data_management_unit`」均 trim + NOCASE 唯一（列级 `collation='NOCASE'` + 唯一约束）；空白单位在 schema before-validator 归一为 null，多条空单位可共存；冲突映射稳定中文 409。记录 SQLite NOCASE 仅折叠 ASCII 大小写。

### 共用 Logo 存储服务与补偿事务

3. 从 `projects.py` 抽取 `logo_storage_service.py` 供项目/预设共用：有界读取（5MB+1B）、`is_safe_file_upload` 位图魔数、仅 JPG/JPEG/PNG/GIF/BMP/WEBP、拒 SVG/XML、UUID 文件名、目录隔离、历史文件读取时复核路径与魔数、日志不暴露绝对路径。
4. 文件+DB 写使用服务自有短生命周期 `Session(get_engine())` 事务（普通 `get_session` 在路由返回后才提交）：事务外准备唯一新文件 → 事务内复核权限并写 DB → commit 失败删新文件、旧状态原样；commit 成功再删旧文件，失败仅 warning。删除预设先提交记录删除再删 Logo。

### 机构预设 API

5. 新增 `routers/organization_presets.py` + service/schema，`main.py` 注册。管理员：`GET/POST /api/admin/organization-presets`、`PUT/DELETE /api/admin/organization-presets/{id}`（multipart：metadata JSON + `logo_action=keep|upload|clear` + 条件 file）；列表按名称 NOCASE 排序；删除前端二次确认后永久删除、不进回收站。
6. 普通已登录用户：`GET /api/organization-presets`（仅非空单位候选，字段 `id/data_management_unit/has_logo`，不泄露机构名/路径；按名称稳定排序）+ `GET /api/organization-presets/{id}/logo`（安全位图读取；无 Logo 404）。补齐未登录/admin 越权/路径穿越/恶意历史 Logo 测试。

### 项目 profile 原子端点

7. `PUT /api/projects/{project_id}/profile`（multipart）：`metadata`（ProjectUpdate 字段集 JSON，禁写 `company_logo_path`）+ `logo_action=keep|preset|upload|clear` + 条件 `preset_id`/`file`。`keep` 只更新元数据；`preset` 有 Logo 复制新 UUID 到项目 `logos/`、无 Logo 明确清除，不存 preset_id；`upload` 自定义安全位图；`clear` 清路径并删旧文件。元数据与路径同事务提交，失败回滚+删新文件+保留旧状态。
8. 同 PR 删除 `PUT /projects/{id}` 与 `POST /projects/{id}/logo`；保留 `GET /projects/{id}/logo`、项目创建/复制/导入导出/回收站。项目复制与 Word 导出继续读项目自身 `data_management_unit`/`company_logo_path`。

### UI

9. 新增 `OrganizationPresetsDialog.vue`（AdminView 顶部「机构预设」图标入口）：按名称排序列表、新增/编辑（名称/单位/Logo 本地预览）、保存才提交、取消 revoke 且无副作用、删除二次确认。
10. `ProjectInfoTab.vue`：数据管理单位改 `el-autocomplete`（候选=非空单位预设，只显示单位；共享 `rankFuzzyMatches`）；点候选同步单位 + Logo 草稿（有 Logo 认证拉取 Blob、无 Logo 置 clear）；选后改文字转自定义但保留已同步 Logo 草稿；直接输入未选文本只改单位；Logo 上传/清除只改本地草稿；页面「保存」按 Logo 草稿来源构造 `logo_action` 单次提交；重开不恢复预设关联；Blob URL 在替换/关闭/unmount revoke；直连 URL 用 `apiUrl()`、缓存键裸路径（basePath 契约）。

## Acceptance Criteria

- [ ] 后端：机构预设 CRUD/排序/唯一/权限/安全位图矩阵/补偿事务（写文件与 DB 失败注入）/旧端点删除后 404/GET Logo 保留/项目复制导出回归；project profile 四态 + 快照复制 + 无 Logo 清除 + 失败保留旧状态。
- [ ] 前端：管理弹窗契约、单位 autocomplete（排序、不泄露机构名）、Logo 同步/覆盖/清除、单次保存、basePath 全边界。
- [ ] 全量门禁：后端 pytest、前端 node --test、lint 0 errors、build OK。
- [ ] 浏览器实机（亮/暗）：管理员增删改预设 → 普通用户选单位同步 Logo → 自定义覆盖 → 保存后重开 → 管理员后改删不影响已保存项目。
- [ ] 文档同步：README 中英、模块 CLAUDE、`.claude/index.json`、Trellis spec（database-guidelines 补 NOCASE 约定）。

## Notes

- 必须基于 PR2 合并后的 main 切分支；不触碰 `FormDesignerTab.vue`。
- 详细设计见 `design.md`、实施顺序见 `implement.md`。
