# OPSX Change Proposal: multi-user-ui-improvements

## Overview

一批内网多用户支持 + UI 改善需求，涵盖用户认证/数据隔离、界面布局调整、交互优化和项目管理功能增强。

---

## Enhanced Requirements (Prompt 增强后)

### 需求1 — 多用户认证与数据隔离

**目标**: 支持内网多用户并发使用，每用户数据完全隔离，管理员可跨用户管理。

**确认方案**: 用户名+密码登录，Session 管理，每用户独立 SQLite 数据库文件。

**技术约束**:
- 后端: 新增 `User` 模型（用户名、bcrypt 哈希密码、is_admin、created_at）
- 每用户数据库: `data/{username}.db`，通过 `username` 动态切换 SQLite 路径
- Session: FastAPI + itsdangerous 签名 Cookie（或 JWT Bearer Token）
- Admin 权限: 可查看所有用户项目列表，可将任意项目推送（复制）到指定用户
- 并发安全: 每用户独立 engine/session，SQLite WAL 模式，避免跨用户锁竞争
- 配置隔离: 每用户的 `config.yaml`（模板路径、AI 配置）存放于 `data/{username}/config.yaml`
- 前端: 登录页（未登录时拦截所有路由），顶部显示当前用户名+注销按钮

**Admin 界面功能**:
- 用户列表：查看所有用户
- 创建用户 / 重置密码 / 删除用户
- 将项目推送到指定用户（跨库深拷贝）

**验收标准**:
- [ ] 未登录访问 `/` 跳转到登录页
- [ ] 用户 A 登录后无法看到用户 B 的项目
- [ ] Admin 用户可访问 `/admin` 页面，可推送项目
- [ ] 多用户并发 POST 操作不出现数据库锁错误
- [ ] 注销后 Session 失效，再次访问跳登录页

---

### 需求2 — 项目信息布局：试验名称位置调整

**目标**: 将「试验名称」字段从「项目信息」区块移到「封面页信息」区块的第一行。

**当前状态** (`ProjectInfoTab.vue`):
```
[项目信息] divider
  - 项目名称
  - 版本号
  - 试验名称        ← 当前位置（错误）
[封面页信息] divider
  - CRF版本
  - ...
```

**目标状态**:
```
[项目信息] divider
  - 项目名称
  - 版本号
[封面页信息] divider
  - 试验名称        ← 移到这里，第一行
  - CRF版本
  - ...
```

**技术约束**: 仅移动 `<el-form-item>` DOM 节点位置，不涉及数据模型/API 变更。

**验收标准**:
- [ ] `试验名称` 出现在 `封面页信息` divider 下方第一行
- [ ] 保存功能正常，数据不丢失

---

### 需求3 — 选项界面：字典名称过长省略+tooltip

**目标**: 右侧选项面板顶部的 `<b>{{ selected.name }}</b>` 过长时显示 `...`，hover 显示完整名称。

**当前状态**: `<b>{{ selected.name }}</b>` 无宽度限制，名称过长会撑破布局。

**目标状态**:
```html
<el-tooltip :content="selected.name" placement="top" :disabled="selected.name.length <= 20">
  <b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;display:inline-block">
    {{ selected.name }}
  </b>
</el-tooltip>
```

**技术约束**: 使用 Element Plus `el-tooltip`，`max-width` 根据布局自适应。

**验收标准**:
- [ ] 字典名称超出宽度时显示 `...`
- [ ] hover 时 tooltip 显示完整名称
- [ ] 短名称不显示 tooltip

---

### 需求4 — 选项界面：标签列格式与编码值列保持一致

**目标**: 右侧选项列表中，`标签` 列的 CSS 样式与 `编码值` 列对齐。

**当前状态**:
- 编码值列: `color:var(--color-text-secondary);font-size:13px;width:100px;flex-shrink:0`
- 标签列: `flex:1;font-size:13px`（无颜色约束，无对齐限制）

**目标状态**: 标签列保持 `flex:1` 弹性宽度，但统一 `font-size:13px`，并去掉不一致的内联差异（两列视觉风格一致）。具体 style 以实际代码审查为准，保持视觉对称。

**验收标准**:
- [ ] 两列 font-size 一致
- [ ] 两列垂直对齐方式一致

---

### 需求5 — 选项界面：默认按序号倒序排列

**目标**: 右侧选项列表默认展示顺序改为 `order_index` 降序（新建的选项排在最上方）。

**当前状态**: `draggable v-model="selected.options"` 直接绑定，后端返回顺序（通常升序）。

**目标状态**: 前端在渲染时对 `selected.options` 做降序排序（不修改后端数据，不影响拖拽保存逻辑）。

**技术约束**:
- 需要用 `computed` 派生排序后的数组给 `draggable` 或用 `ref` 维护本地排序副本
- 排序切换（需求6）后此默认值随之切换

**验收标准**:
- [ ] 进入选项界面，选项默认降序显示（序号大的在上）
- [ ] 切换排序图标后可切换到升序

---

### 需求6 — 所有界面序号列：加点击图标切换正倒序

**目标**: 所有含「序号」列的界面，在列头「序号」旁加 ↑↓ 图标，点击切换正序/倒序（本地排序，不修改数据库）。

**涉及界面**:
1. CodelistsTab — 左侧字典列表（el-table）
2. CodelistsTab — 右侧选项列表（draggable 自定义列头）
3. UnitsTab — 单位列表（el-table）
4. FieldsTab — 字段列表（el-table）
5. FormDesignerTab — 表单列表（若有序号列）
6. VisitsTab — 访视列表（若有序号列）

**交互设计**:
- 图标: `↑` 正序 / `↓` 倒序，当前状态高亮
- 点击切换本地 `sortOrder ref`（`'asc'` | `'desc'`）
- 各界面维护独立的 `sortOrder` 状态
- el-table 界面：通过 `computed filteredXxx` 在现有过滤逻辑基础上叠加排序
- 自定义列头（draggable）：在自定义 header div 中添加图标按钮

**技术约束**:
- 保留现有每行的 `el-input-number`（两者并存，用户确认）
- 仅影响前端展示顺序，不发送任何 API 请求

**验收标准**:
- [ ] 每个含序号列的界面都有正倒序切换图标
- [ ] 点击图标立即切换展示顺序
- [ ] el-input-number 仍可正常修改 order_index 并保存到后端
- [ ] 各界面排序状态互不干扰

---

### 需求7 — 项目列表：删除按钮改名+常显

**目标**: 侧边栏项目列表中，"✕" 改为文字「删除」按钮，且常驻显示（不需要 hover 触发）。

**当前状态** (`App.vue`):
```html
<span class="del-btn" @click.stop="deleteProject(p)">✕</span>
```
CSS 中 `.del-btn` 可能有 hover 显示逻辑。

**目标状态**:
```html
<el-button type="danger" size="small" link @click.stop="deleteProject(p)">删除</el-button>
```
常显，不依赖 hover。

**验收标准**:
- [ ] 每个项目行右侧显示「删除」文字按钮
- [ ] 点击仍触发确认弹窗后删除

---

### 需求8 — 项目列表：添加「复制」按钮（完整深拷贝）

**目标**: 在「删除」左侧添加「复制」按钮，点击后将整个项目完整深拷贝为新项目。

**复制范围（用户确认：完整深拷贝）**:
- 项目基本信息（名称加「(副本)」后缀，其余元数据原样复制，logo 不复制）
- 字典（CodeList + CodeListOption，含 order_index）
- 单位（Unit，含 order_index）
- 字段库（FieldDefinition，含 order_index；codelist_id/unit_id 映射到新 ID）
- 表单（Form + FormField，含 order_index；field_definition_id 映射到新 ID）
- 访视（Visit + VisitForm 关联，含 sequence/order_index；form_id 映射到新 ID）

**后端实现**:
- 新增 API: `POST /api/projects/{project_id}/copy`
- 事务内完成所有复制操作，失败回滚
- 返回新项目的 `ProjectResponse`

**前端实现**:
- 项目行添加「复制」按钮（`el-button type="primary" size="small" link`）
- 点击后调用 API，成功后刷新项目列表并选中新项目
- 加载状态处理（防止重复点击）

**验收标准**:
- [ ] 「复制」按钮显示在「删除」左侧
- [ ] 复制后新项目名称为「{原名称}(副本)」
- [ ] 新项目包含完整的字典/单位/字段/表单/访视数据
- [ ] 字段的 codelist/unit 引用指向新项目内的对应实体（ID 映射正确）
- [ ] 复制失败时事务回滚，不产生脏数据
- [ ] Logo 不复制

---

## Discovered Constraints

### Hard Constraints
- **SQLite 多数据库**: 每用户独立 `.db` 文件，`get_engine()` 需按 username 动态创建并缓存 engine
- **并发安全**: SQLite 默认不支持多连接写入，需开启 WAL 模式（`PRAGMA journal_mode=WAL`）
- **Session 安全**: Cookie 需 HttpOnly + SameSite=Lax；密码用 bcrypt 哈希（`passlib`库）
- **Admin 用户数据库**: Admin 自身数据存于 `data/admin.db`，系统启动时若无 admin 用户则自动创建
- **迁移兼容**: 现有单数据库数据需迁移方案（或文档说明迁移步骤）
- **API ID 映射**: 复制项目时，codelist_id/unit_id/field_definition_id/form_id 均需在新项目内重新映射
- **order_index 唯一索引**: 复制时 order_index 保持原值即可（新项目内唯一索引不冲突）

### Soft Constraints
- Element Plus 组件风格：按钮、tooltip、图标使用 Element Plus / Element Plus Icons
- 前端状态管理：无 Vuex/Pinia，用 `ref`/`computed`/`inject` 管理状态
- 样式：内联 style 为主，不引入新 CSS 文件（现有约定）
- 中文 UI：所有用户可见文字用中文
- 不引入新的前端框架或路由库（当前无 vue-router）

### Dependencies
- 需求1（多用户）完成后，需求1-Admin（推送项目）= 需求8（复制）的跨用户版本，可复用后端 copy 逻辑
- 需求5（默认倒序）是需求6（排序图标）的初始状态，两者需协调实现
- 需求7+8（项目列表按钮）可独立实现，不依赖需求1

### Risks
- **多用户架构复杂度高**: 涉及认证、Session、动态数据库切换，工作量最大，建议单独一个实现阶段
- **前端无路由**: 登录页/主页切换需手动管理 `v-if` 或引入 vue-router
- **SQLite 并发**: WAL 模式可缓解但不消除并发写入限制，高并发场景需评估
- **跨库 Admin 推送**: Admin 推送项目到用户需要同时操作两个 SQLite 数据库（源+目标），需谨慎事务处理

---

## Implementation Order (建议)

| 阶段 | 需求 | 说明 |
|------|------|------|
| Phase A | 2, 3, 4, 7 | 纯前端 UI 调整，无后端变更，风险极低 |
| Phase B | 5, 6 | 前端排序逻辑，无后端变更 |
| Phase C | 8 | 后端新增复制 API + 前端按钮 |
| Phase D | 1 | 多用户认证+隔离，架构变更最大，独立阶段 |

---

## User Confirmations

- 需求1: 用户名+密码登录（不是简单用户名），需 admin 界面，需并发安全
- 需求1-Admin: admin 可将项目推送到指定用户（跨库复制）
- 需求8: 完整深拷贝（含访视关联），副本名称加「(副本)」后缀
- 需求6: 保留 el-input-number + 列头加正倒序图标（两者并存）
