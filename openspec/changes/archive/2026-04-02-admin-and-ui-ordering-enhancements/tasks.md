# Tasks: admin-and-ui-ordering-enhancements

## Phase 0: 后端基础设施

- [x] 0.1 在 `config.yaml` 新增 `admin.username` 字段，默认值 `"admin"`
- [x] 0.2 在 `backend/src/config.py` 新增 `AdminConfig` 类并挂载到 `Settings.admin`
- [x] 0.3 在 `backend/src/dependencies.py` 新增 `require_admin()` 依赖函数（校验当前用户名与 admin.username 一致；不满足则 403）
- [x] 0.4 新建 `backend/src/routers/admin.py`，注册 `GET /api/auth/me`（返回 username + is_admin），并在 `main.py` 注册 router

## Phase 1: 简单前端调整（R2、R5、R6）

- [x] 1.1 [R5] 在 `App.vue` 添加 `isCollapsed` 响应式变量，绑定折叠按钮点击事件，控制侧边栏宽度/样式切换
- [x] 1.2 [R5] 收起态下禁用 sidebarWidth 手动拖拽，确保项目选中/操作不受影响
- [x] 1.3 [R6] 在 `FormDesignerTab.vue` 将表格列头与对话框 label 中的 `Code` 改为 `Code（域名）`
- [x] 1.4 [R2] 枚举并隐藏 `CodelistsTab.vue`、`UnitsTab.vue` 中的 code 相关列（如有）
- [x] 1.5 [R2] 枚举并隐藏 `FieldsTab.vue` 中的 `Code（变量名）` 表格列（保留 data 绑定与 input 功能）
- [x] 1.6 [R2] 枚举并隐藏 `FormDesignerTab.vue` 中的 code 相关列（保留 data 绑定与 input 功能）
- [x] 1.7 [R2] 枚举并隐藏 `VisitsTab.vue` 中的 code 相关列（如有）

## Phase 2: 拖拽排序补全（R3）

- [x] 2.1 在 `FieldsTab.vue` 引入 `vuedraggable`，复用 `useOrderableList.js` 协议，接入 `PATCH /api/fields/reorder`
- [x] 2.2 在 `FormDesignerTab.vue` 表单主列表引入 `vuedraggable`，接入 `PATCH /api/forms/reorder`
- [x] 2.3 在 `VisitsTab.vue` 引入 `vuedraggable`，接入 `PATCH /api/visits/reorder`
- [x] 2.4 三处拖拽均在过滤/搜索态下禁用（`:disabled="isFiltered"` 或 `v-if`）
- [x] 2.5 验证拖拽后刷新页面顺序稳定，导出/预览顺序与拖拽结果一致

## Phase 3: 项目复制（R4）

- [x] 3.1 新建 `backend/src/services/project_clone_service.py`：实现 `ProjectGraphLoader.load()`（覆盖全量 field_definitions/units/codelists/options/forms/visits/visit_forms/form_fields/logo）
- [x] 3.2 实现 `ProjectCloneService.clone()`：按拓扑顺序深拷贝、维护 id_map、owner 重绑、命名规则「(副本)」/「(副本N)」、事务内完成、logo 文件复制在事务后执行
- [x] 3.3 在 `backend/src/routers/projects.py` 新增 `POST /api/projects/{project_id}/copy`，调用 `ProjectCloneService.clone()`
- [x] 3.4 在 `App.vue` 项目列表中：删除按钮改为常显；新增复制按钮（loading 状态、成功后刷新列表）
- [x] 3.5 编写集成测试：随机生成含全量子资源的项目，clone 后验证图同构性、主键隔离、owner 归属、logo 独立性

## Phase 4: 导入能力（R1）

- [x] 4.1 在 `backend/src/services/import_service.py` 新增 `ProjectDbImportService`：只读打开外部 SQLite、schema 预检（核心表存在性）、exactly-one-project 校验、调用 `ProjectCloneService.clone_from_graph()`
- [x] 4.2 新增 `DatabaseMergeService`：读取所有项目（不加载 user 表）、重名自动重命名、逐项目调用 clone_from_graph、返回 MergeReport
- [x] 4.3 在 `admin.py` 新增 `POST /api/admin/import/project-db` 和 `POST /api/admin/import/database-merge`（均使用 `require_admin` 依赖，文件大小上限 200 MB）
- [x] 4.4 在 `App.vue` 设置弹窗将数据管理区改为两列布局（左：导入项目 + 导入数据库；右：导出当前项目 + 导出整个数据库）
- [x] 4.5 导入按钮仅 `isAdmin` 时显示（或置灰并提示权限不足）；触发 `<input type="file" accept=".db">` 并调用对应 API
- [x] 4.6 导入完成后显示结果弹窗（单项目：新项目名称；整库：新增/重命名列表）；刷新项目列表
- [x] 4.7 编写集成测试：单项目导入的 owner 重绑、孤儿项目保护、schema 不兼容 400（含真实 HTTP 路径）、非单项目 400；整库合并的重命名规则、原子性（中途失败零变更）

## Phase 5: 管理员界面与用户管理（R7、R8）

- [x] 5.1 在 `admin.py` 新增用户管理接口：`GET /api/admin/users`、`POST /api/admin/users`、`PATCH /api/admin/users/{id}`、`DELETE /api/admin/users/{id}`（均使用 `require_admin`）
- [x] 5.2 新建 `backend/src/services/user_admin_service.py`：list（含 project_count）、create（唯一约束）、rename（唯一约束）、delete（有项目则 409）
- [x] 5.3 在前端登录后调用 `GET /api/auth/me`，将 `isAdmin` 存入应用状态（App.vue 或 composable）
- [x] 5.4 新建 `frontend/src/components/AdminView.vue`：用户列表表格（用户名|项目数|操作）、新增用户表单、改名对话框、删除按钮（project_count>0 时禁用）、弱安全警示横幅
- [x] 5.5 改名成功后：若被改名为当前登录用户，清除 token 并跳转登录页；其他用户改名后下次请求自然 401
- [x] 5.6 在 `App.vue` 顶部/侧边栏添加「管理」入口，`isAdmin` 时显示，点击进入 AdminView
- [x] 5.7 编写集成测试：admin gate 403、用户名唯一约束、有项目删除 409、改名后旧 token 401（含旧用户名重建后仍 401）

## Phase 6: 回归验证

- [x] 6.1 执行全量后端测试，确保现有测试无回归
- [x] 6.2 人工验证 R2（code 列隐藏不影响 CRUD/导出）和 R6（文案）
- [x] 6.3 人工验证拖拽排序在 FieldsTab/FormDesignerTab/VisitsTab 的刷新稳定性
- [x] 6.4 验证设置页两列布局与现有导出功能无干扰
- [x] 6.5 验证管理员流程：config 改名 → 重启 → 正确识别管理员 → 用户管理全流程
