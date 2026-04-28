# Design: admin-ui-followup-refinements

## 1. 目标

本变更只产出 follow-up 约束，目标是把 9 项诉求收敛成可机械执行的实现边界，避免再出现“proposal 写的是旧现状、代码跑的是半成品”的分叉。

本设计的总原则：
- 复用当前仓库已存在的真实链路，不为规划而虚构新体系。
- 以最小结构变更完成需求，不新建角色体系、不引入异步任务系统、不新建 trash 表。
- 所有高影响流程都给出确定门禁、事务边界、冲突策略与可验证不变量。

---

## 2. 已裁决约束

### 2.1 R1 导入权限与路由

**裁决**
- 支持的导入接口以当前真实代码为准：
  - `POST /api/projects/import/project-db`
  - `POST /api/projects/import/database-merge`
- 两个接口都采用 **登录态门禁**，不再属于 admin-only contract。
- 前端设置页对所有已登录用户展示两个导入按钮。
- 旧的 `/api/admin/import/*` 路径不再作为本 change 的活跃契约。

**原因**
- 当前仓库真实代码已在 `backend/src/routers/projects.py` 使用 `get_current_user`。
- 继续把普通用户能力挂在 admin 语义下，只会扩大认知混乱。

**强约束**
- 单项目导入与整库合并都必须把导入项目的 `owner_id` 绑定到当前登录用户。
- 继续保留 SQLite 头校验、schema 预检、200MB 限制与事务原子性。
- 导入失败时数据库零变更，不允许残留半成品项目。

### 2.2 R2 排序真值

**裁决**
- `order_index` 是本 change 内所有项目级有序资源的唯一持久化顺序真值，包括：
  - project
  - visit
  - form
  - field_definition
  - form_field
  - codelist_option
  - unit
- `sequence` 仅保留给 `visit_form` 等业务含义本就不同的关系排序。
- `sort_order` 在活跃代码路径中不再作为权威字段，规划实现阶段必须清除其读取/写入依赖。

**强约束**
- 所有 reorder 接口都必须接收“完整作用域列表”，缺失、重复、跨作用域 ID 一律 400。
- 拖拽排序与手改序号必须最终汇入同一持久化链路，不允许两套真值互相覆盖。
- 过滤/搜索态禁用拖拽，避免提交局部列表。
- 预览、导出、复制、导入、Word 导入后的字段顺序都必须读取 `order_index`。

### 2.3 R5 / R6 信息架构冲突

**裁决**
- 管理员页只保留一个顶层工作区：**用户管理**。
- 批量复制、迁移、删除、回收站、恢复、硬删除都作为“用户管理工作区内的动作/弹窗/抽屉”，**不是新的顶层 tab**。
- 因此：
  - R5 成立：管理员页不再承载历史杂项功能与并列面板。
  - R6 也成立：项目批处理与回收站能力保留，但挂在用户管理流程内。

### 2.4 用户删除与回收站 owner 约束

**裁决**
- 用户只要仍拥有任意项目，就禁止删除；这里的“任意项目”包含：
  - 活跃项目
  - 回收站内项目
- `project_count` 在管理员用户列表中表示该用户名下全部项目数，而非仅活跃项目数。

**原因**
- 若允许先删用户、再保留该用户的回收站项目，restore 时会出现 owner 僵尸态。
- 采用“用户不可先于其项目消失”的约束，可直接消灭 restore owner 冲突分支。

### 2.5 回收站模型与恢复策略

**裁决**
- 回收站采用当前最小模型：仅对 `Project` 做软删除，使用既有 `Project.deleted_at`。
- 不新增 trash 表、不新增 deleted_by、不引入 deletion_batch_id。
- 项目软删除后，项目树仍保留在原表中；主列表默认过滤 `deleted_at is not null`。
- restore 时：
  1. 保留原 owner
  2. 若名称冲突，自动重命名为 `原名 (恢复)`、`原名 (恢复2)`、...
  3. 恢复到该 owner 的活跃项目列表末尾
- hard delete 只允许管理员在回收站中执行，且为物理删除。

### 2.6 R7 横向按钮移除后的状态语义

**裁决**
- 预览区移除“横向”按钮后，预览方向只由现有自动判定逻辑决定。
- 不再读取或写入 `localStorage['crf_previewForceLandscape']`。
- 存量 localStorage 键直接忽略，不做迁移提示。

### 2.7 R8 快速编辑真值

**裁决**
- 右侧预览双击只是现有字段实例编辑的快捷入口，不引入第二套数据源。
- 快捷编辑弹窗只允许修改字段实例级属性：
  - `label_override`
  - `bg_color`
  - `text_color`
  - `inline_mark`
- 保存仍走现有 `PUT /api/form-fields/{id}`。
- 保存成功后必须刷新并同步：字段表格、右侧预览、后续导出/渲染来源。

### 2.8 R9 模板导入契约

**裁决**
- 保留当前已存在的最小请求体，不升级为 `selections` 结构：

```json
{
  "source_project_id": 1,
  "form_ids": [11, 12],
  "field_ids": [101, 102, 201]
}
```

- 语义如下：
  - `form_ids` 必填，表示要导入的源表单集合。
  - `field_ids` 可选；缺失时表示整表单导入。
  - `field_ids` 出现时，必须全部属于 `source_project_id` 下、且属于 `form_ids` 指定的表单；否则 400。
- 字段级导入时，后端必须补齐依赖闭包：
  - field_definition
  - unit
  - codelist
  - codelist_option
- 导入后的字段顺序按源 `order_index` 保留相对顺序，并在目标表单中重新压实为稠密序号。

---

## 3. API 与行为约束

### 3.1 导入接口

#### 单项目导入
```http
POST /api/projects/import/project-db
Auth: login required
Content-Type: multipart/form-data
Body: file=<sqlite db>
```

成功响应：
```json
{ "project_id": 123, "project_name": "项目A" }
```

失败语义：
- 非 SQLite / 空文件 / 超 200MB -> 400
- schema 不兼容 -> 400
- 非单项目数据库 -> 400
- 任意导入阶段失败 -> 数据库零变更

#### 整库合并
```http
POST /api/projects/import/database-merge
Auth: login required
Content-Type: multipart/form-data
Body: file=<sqlite db>
```

成功响应：
```json
{
  "imported": [{ "id": 1, "name": "项目A" }],
  "renamed": [{ "original": "项目A", "new": "项目A (导入1)" }]
}
```

### 3.2 排序接口

本 change 不强制把所有 reorder endpoint 合并成同一路由形态，但要求它们都满足“完整作用域 + 稠密落库 + 400 拒绝脏列表”。

关键接口：
- `POST /api/projects/reorder`
- `POST /api/projects/{project_id}/visits/reorder`
- `POST /api/projects/{project_id}/forms/reorder`
- `POST /api/projects/{project_id}/field-definitions/reorder`
- `POST /api/forms/{form_id}/fields/reorder`

### 3.3 管理员用户管理

- `GET /api/auth/me` 保持 `{ username, is_admin }`
- `GET /api/admin/users` 返回 `project_count`，其统计口径为“活跃 + 回收站”全部 owned projects
- `DELETE /api/admin/users/{user_id}`：若 `project_count > 0`，返回 409

### 3.4 管理员项目批处理

#### 批量删除
- 接口：`POST /api/admin/projects/batch-delete`
- 事务语义：**全成全败**
- 预校验：所有 `project_ids` 必须存在且处于活跃态；否则 400，零变更
- 成功后：统一写入 `deleted_at`

#### 批量迁移 owner
- 接口：`POST /api/admin/projects/batch-move`
- 事务语义：**全成全败**
- 预校验：目标用户存在；所有项目存在且处于活跃态；否则 400/404，零变更

#### 批量复制
- 接口：`POST /api/admin/projects/batch-copy`
- 事务语义：**逐条 savepoint 隔离**
- 响应：逐项目结果列表，单条失败不污染其他成功项

#### 回收站
- 列表接口需要提供专用 schema，至少包含：
  - `id`
  - `name`
  - `owner_id`
  - `owner_username`
  - `deleted_at`
- restore 与 hard delete 都只针对回收站项目生效。

---

## 4. 前端行为约束

### 4.1 App.vue
- 设置页导入按钮对所有登录用户展示。
- 项目复制按钮常显，不依赖 hover。
- 左侧项目区折叠后只保留单一展开入口；隐藏区域不得残留可点击热区。
- 折叠态不持久化到 localStorage。

### 4.2 AdminView.vue
- 顶层只展示用户管理工作区。
- 用户表格保留：用户名、项目数、操作。
- 项目批处理与回收站入口作为工作区内部动作，而非新的顶层 tab。

### 4.3 VisitsTab.vue
- 移除“横向”按钮。
- 删除 `previewForceLandscape` 的 UI 状态来源；只保留自动横向判定。

### 4.4 FormDesignerTab.vue
- 双击右侧预览字段实例打开快捷编辑。
- 快捷编辑保存后，右侧预览与左侧字段实例列表立即一致。
- 任何仍读取 `sort_order` 的预览排序逻辑都必须改为 `order_index`。

### 4.5 TemplatePreviewDialog.vue
- 继续使用“先选表单，再选字段”的最小交互。
- 选择导入模式下，若未选择任何字段，不允许提交。
- 切换 selection mode 不改变后端 contract，仅决定是否发送 `field_ids`。

---

## 5. 不变量 / PBT 属性

| 主题 | Invariant | Falsification Strategy |
|---|---|---|
| R1 导入 | 导入成功后，新增项目及其所有子资源的 `owner_id` / 外键引用完整，且 owner 等于当前用户 | 使用随机生成的单项目/多项目 SQLite 模板库，导入后做 owner 与引用完整性扫描 |
| R1 导入 | 任一导入失败不产生半成品项目 | 在 schema 预检后、写入中途分别注入异常，比对导入前后快照 |
| R2 排序 | 同一作用域持久化顺序始终为 `1..n` 稠密排列 | 随机生成缺失/重复/跨作用域/逆序 ID 列表并断言 400 或稠密排序 |
| R2 排序 | 列表、预览、导出读取同一顺序真值 | 对同一数据集执行 reorder 后分别读取列表/预览/导出顺序并比较 |
| R3 复制按钮 | 复制按钮可见性与 hover 状态无关 | 对不同鼠标状态截图或 DOM 断言按钮常驻存在 |
| R4 折叠 | 收起后项目区不存在可操作隐藏控件 | 折叠后执行键盘 Tab 与点击测试，断言只能命中展开按钮 |
| R5/R6 管理页 | 管理员页只有一个顶层工作区，但内部可完成用户管理与项目批处理闭环 | 端到端检查顶层导航数量与内部动作可达性 |
| R6 回收站 | 软删项目不出现在活跃列表，但可在回收站恢复；恢复后资源图完整 | 随机删除/恢复项目并校验列表过滤、owner 保留、资源可访问 |
| R7 横向按钮 | 预览结果不再受 `localStorage['crf_previewForceLandscape']` 影响 | 预先写入任意 true/false 值后刷新页面，比对渲染结果一致 |
| R8 快速编辑 | 快捷编辑与主编辑区保存后读取同一字段实例真值 | 双击修改后立即读取主列表与预览并比较字段实例属性 |
| R9 字段级导入 | 导入结果只包含所选字段实例及其依赖闭包，不含孤立依赖 | 随机选择字段子集后导入，扫描 form_field、field_definition、unit、codelist 关系闭包 |

---

## 6. 实施顺序

1. 先统一排序真值，清掉 `sort_order` 残留读取。
2. 再固化导入 contract 与所有用户可用的设置页入口。
3. 然后收口管理员页信息架构与回收站事务边界。
4. 最后处理预览 UX（横向按钮移除、双击快捷编辑）与模板字段级导入验证。

此顺序可避免在半迁移排序状态下继续叠加 UI 功能。 
