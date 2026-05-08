# Tasks: admin-ui-followup-refinements

## Phase 0: 排序真值收口

- [x] 0.1 盘点并移除前后端仍读取或写入 `sort_order` 的活跃代码路径，统一改为 `order_index`
- [x] 0.2 统一 `FormDesignerTab.vue` 右侧预览、导出链路、复制链路、模板导入链路对字段顺序的读取来源为 `order_index`
- [x] 0.3 校验所有 reorder 接口的请求语义，补齐“完整作用域列表 / 缺失或重复即 400 / 稠密重排”约束
- [x] 0.4 为拖拽与手改序号并存页面补测试，验证刷新后顺序不回弹，且预览/导出顺序一致

## Phase 1: 导入能力对所有登录用户开放（R1）

- [x] 1.1 以 `backend/src/routers/projects.py` 为唯一导入入口，确认并清理旧 `/api/admin/import/*` 契约与前端调用残留
- [x] 1.2 固化 `POST /api/projects/import/project-db` 与 `POST /api/projects/import/database-merge` 的登录态门禁与 200MB/SQLite/schema 校验行为
- [x] 1.3 为单项目导入与整库合并补 owner 重绑、失败零变更、非 SQLite、非单项目库等集成测试
- [x] 1.4 在 `App.vue` 设置页移除 `isAdmin` 对导入按钮的显示限制，并保持导入成功后的列表刷新与结果提示

## Phase 2: 项目复制与项目区折叠（R3、R4）

- [x] 2.1 在 `App.vue` 保持项目复制按钮常显，不依赖 hover，且不改变现有复制接口语义
- [x] 2.2 收口左侧项目选择区折叠行为，确保收起后仅保留一个展开入口，不残留隐藏热区
- [x] 2.3 补 UI 验证：折叠不破坏项目切换、复制、删除、刷新与设置入口

## Phase 3: 管理员页信息架构与用户管理（R5）

- [x] 3.1 将 `AdminView.vue` 收口为单一“用户管理”工作区，移除顶层并列 tab 结构
- [x] 3.2 保留用户列表、创建、改名、删除限制等最小闭环，并继续使用 `GET /api/auth/me` 的 `is_admin` 入口判定
- [x] 3.3 将项目批处理与回收站入口内嵌到用户管理工作区动作中，避免形成第二个顶层管理面板
- [x] 3.4 补管理员工作区导航与死链回归验证

## Phase 4: 批量项目操作与回收站（R6）

- [x] 4.1 固化项目软删除模型：活跃列表默认过滤 `deleted_at is not null`，回收站列表仅显示软删项目
- [x] 4.2 将 `project_count` 的统计口径明确为“活跃 + 回收站”全部 owned projects，并同步用户删除限制
- [x] 4.3 为 `POST /api/admin/projects/batch-delete` 增加全成全败预校验，拒绝不存在、已软删或跨条件的脏输入
- [x] 4.4 为 `POST /api/admin/projects/batch-move` 增加全成全败预校验，拒绝目标用户不存在或项目非法状态
- [x] 4.5 为 `POST /api/admin/projects/batch-copy` 增加逐条 savepoint 隔离语义与结果列表一致性验证
- [x] 4.6 为回收站列表定义专用响应结构，至少暴露 `deleted_at`、`owner_id`、`owner_username`
- [x] 4.7 为 restore 实现名称冲突自动重命名与尾插恢复顺序，并补恢复后资源完整性测试
- [x] 4.8 限制 hard delete 只作用于回收站项目，并补物理删除后的完整性验证

## Phase 5: 预览 UX 收口（R7、R8）

- [x] 5.1 在 `VisitsTab.vue` 移除“横向”按钮与 `previewForceLandscape` 的 localStorage 读写逻辑
- [x] 5.2 保留自动横向判定逻辑，验证移除按钮后预览渲染不异常
- [x] 5.3 在 `FormDesignerTab.vue` 将右侧预览双击入口正式收口为快捷编辑能力，不引入第二套真值
- [x] 5.4 将快捷编辑弹窗字段范围限制为字段实例级属性：`label_override`、`bg_color`、`text_color`、`inline_mark`
- [x] 5.5 补保存后主列表、预览、导出来源一致性的验证

## Phase 6: 模板导入变量级选择（R9）

- [x] 6.1 保留当前 `source_project_id + form_ids + field_ids` 请求体，不升级为 `selections` 结构
- [x] 6.2 在 `import_template.py` / `import_service.py` 增加字段归属校验：`field_ids` 必须属于 `source_project_id` 且属于 `form_ids`
- [x] 6.3 为字段级导入补依赖闭包：`field_definition`、`unit`、`codelist`、`codelist_option`
- [x] 6.4 导入后按源 `order_index` 保留相对顺序，并在目标表单中重排为稠密序号
- [x] 6.5 在 `TemplatePreviewDialog.vue` 补“选择导入模式但未勾选字段不可提交”的交互限制
- [x] 6.6 补字段级导入集成测试，覆盖依赖闭包、非法 field_ids、重复选择、孤立引用与顺序一致性

## Phase 7: 全链路验证

- [x] 7.1 覆盖所有用户导入、管理员批处理、回收站恢复、快速编辑、模板字段级导入的集成测试
- [x] 7.2 补前端关键流程验证：项目区折叠、复制按钮常显、管理员单工作区、预览双击快捷编辑
- [x] 7.3 回归验证导出、预览、复制、导入在统一 `order_index` 后无顺序回归
