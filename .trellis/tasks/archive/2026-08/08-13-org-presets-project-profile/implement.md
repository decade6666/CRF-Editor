# 机构预设与项目 profile 原子保存 — 实施顺序

## 前置

- 必须基于 PR2 合并后的最新 main 切 worktree 分支；不触碰 `FormDesignerTab.vue`。

## 后端先行（TDD）

1. `models/organization_preset.py` + `models/__init__.py` 注册 + 建表/约束/幂等测试（`test_organization_preset_model.py`）。
2. `services/logo_storage_service.py`（从 projects.py 抽取共用逻辑）+ 纯函数测试（位图矩阵、有界读取、路径、命名空间）。
3. `routers/organization_presets.py` + service/schema：管理员 CRUD（multipart metadata+logo_action）、普通用户只读候选与 Logo GET；`main.py` 注册。测试：`test_organization_presets.py`（CRUD/排序/唯一 409/权限/安全位图/补偿事务失败注入）。
4. `services/project_profile_service.py` + `PUT /projects/{id}/profile`：metadata JSON + logo_action 四态；补偿语义测试 `test_project_profile.py`（四态、快照复制、无 Logo 清除、失败保留旧状态、新文件清理、权限）。
5. 迁移 `test_project_metadata.py` 等 → profile 端点；删除旧 `PUT /projects/{id}`、`POST /projects/{id}/logo`；补 404/405 契约；`GET logo`、复制/导出/purge 回归。

## 前端

6. `OrganizationPresetsDialog.vue`（AdminView 顶部图标入口）：列表/新增/编辑/删除、Logo 本地预览、保存才提交、取消 revoke；`adminOrgPresets.test.js` + `adminViewStructure.test.js` 扩展。
7. `ProjectInfoTab.vue`：单位 el-autocomplete（非空预设候选、共享 rankFuzzyMatches）、Logo 草稿状态机、上传/清除、单次 profile 保存；`projectInfoMetadata.test.js` 重写、`basePathDeployment.test.js` 同步（直连点变化）。

## 验证命令

```bash
cd backend && python3 -m pytest -q
cd frontend && node --test tests/*.test.js
cd frontend && npm run lint && npm run build
```

浏览器实机（亮/暗，管理员+普通账号）：预设增删改（含 Logo 上传/替换/清除）、普通用户选单位同步 Logo、自定义单位、上传覆盖、清除、保存后重开、管理员后改删不影响已保存项目；验证前 `npm run build`。

## 回滚点

- 后端模型/存储服务/预设 API/profile API 分步提交；旧端点删除与全仓迁移同 PR。
- 文件操作均为补偿式；绝不出现 DB 指向不存在文件（先准备后提交）。
