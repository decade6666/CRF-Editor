# Proposal: 账号密码登录与管理员独立用户管理界面

## Enhanced Requirement

将当前仅通过用户名进入系统的认证流程，改为**账号（复用现有 `username`）+ 密码**登录；同时为 `admin` 管理员提供一个**独立的用户管理工作台**，管理员登录后默认进入该界面，不再显示普通用户使用的 CRF 项目列表、设计器与其他编辑工作台功能。

### 目标
- **认证收口**：移除现有“用户名不存在则自动创建并登录”的无密码进入模式，统一为账号密码认证。
- **最小破坏迁移**：复用现有 `username` 作为登录账号，不新增独立 account 字段，避免扩大 schema 与调用链改动面。
- **管理员分流**：`admin` 登录后进入独立用户管理界面，只保留管理员能力，不展示普通用户的 CRF 编辑工作台。
- **权限语义保持稳定**：继续以现有 `is_admin` 作为管理员门禁，以 `user.id -> project.owner_id` 作为项目隔离边界。
- **可运维性**：旧用户密码迁移由管理员在用户管理界面中设置/重置；生产空库首次启动时，保留管理员初始密码来自环境变量/配置输入。

### 用户确认
- “账号”复用现有 `username` 字段，不新增独立登录标识。
- 旧用户迁移策略采用“管理员重置密码”。
- `admin` 登录后默认进入“仅用户管理”主界面，不显示 CRF 编辑工作台。
- 本次范围纳入“设置密码/重置密码”管理员能力。
- production 首次启动时，保留管理员初始密码来自环境变量或配置项。
- 密码策略采用基础策略：至少明确最小长度，继续沿用现有限流，不引入额外锁定机制。
- `admin` 独立界面仍保留现有批量迁移/复制/删除项目与回收站能力。
- 用户名规范化固定为“仅 `trim()` 首尾空白，大小写敏感”，并统一用于登录、创建、改名、限流与保留管理员匹配。
- “已设密码 / 可用密码哈希”固定为“可被统一密码服务识别并校验的哈希”；不得再按 `NULL`、固定前缀或其他分散规则分别解释。
- production 中 `admin.bootstrap_password` 仅作为“缺少可用保留管理员”时的创建/修复种子；若已有可用保留管理员，则忽略配置变化，不覆盖现有密码。
- 若历史库中存在多个 `TRIM(username) == admin.username` 的账号，固定保留最早记录作为主修复对象，不自动合并其余记录。
- 密码输入按原样保留：不做 `trim`、不做大小写折叠、也不做 Unicode 规范化；只校验最小长度与非空字符串。
- 管理员重置密码接口成功响应固定为 `204 No Content`，不返回响应体。

### 技术约束
- 复用现有 `user.username` 作为登录账号，**不新增** `account` / `login_name` 字段。
- 不能破坏现有 `user.id` 主键与 `project.owner_id` 关联，否则会破坏项目归属与权限边界。
- 管理员门禁继续只基于 `user.is_admin`，不引入角色表、权限表或 ACL 新体系。
- 当前 `hashed_password` 虽然已存在于 `backend/src/models/user.py`，但在现有登录、管理员建用户、启动初始化和测试夹具中被广泛写为 `NULL`；本次必须统一其语义。
- 当前依赖中没有密码哈希库；如引入密码认证，必须补齐安全哈希/校验依赖与对应测试。
- 当前生产空库启动时会自动插入一个 `hashed_password = NULL` 的保留管理员账号；该启动期 bootstrap 必须改造成可生成可登录的管理员密码记录。
- 当前前端没有 `vue-router`，`frontend/src/App.vue` 通过 `v-if` 切换登录态、管理员视图和普通工作台；管理员独立界面的分流必须适配该现状，或在后续规划中显式处理布局拆分。
- 当前登录限流按“用户名 + IP”桶统计；账号密码化后仍需保留可观测限流行为与 `429` 契约。
- 当前 `OAuth2PasswordBearer` 的 `tokenUrl='/api/auth/login'` 与真实接口 `/api/auth/enter` 不一致；认证改造时必须统一 OpenAPI 元数据与真实接口。

### 范围边界
**纳入范围**
- 后端认证接口：将现有无密码 `/api/auth/enter` 契约替换或收敛为账号密码登录契约。
- 后端认证服务：新增密码哈希、密码校验、密码设置/重置相关能力。
- 管理员用户管理：新增创建用户时设置密码、后续重置密码能力。
- 启动初始化：为 production 空库首次启动的保留管理员账号提供初始密码来源与初始化规则。
- 前端登录页：从单用户名输入改为账号+密码表单。
- 前端应用壳层：admin 登录默认进入独立用户管理工作台，不再显示普通 CRF 编辑功能。
- 现有 `AdminView.vue`：保留用户管理、批量项目操作与回收站能力，但作为管理员主工作台使用。
- 测试与文档：同步更新认证、管理员、限流、前端登录与项目说明文档。

**不纳入范围**
- 不引入多角色体系或细粒度权限系统。
- 不新增“用户自助找回密码/邮箱验证码/短信验证码”流程。
- 不引入刷新令牌、服务端会话表或 SSO/OAuth 外部身份源。
- 不改变项目导入导出时“按当前登录用户重绑定 owner”的既有语义。
- 不改变单项目/用户范围导出会清空 `user` 表的既有行为，只需保证该行为下的认证边界仍自洽。

### 验收标准
- A1 登录页显示账号与密码输入项，空值与非法输入返回明确错误；成功登录仍返回 Bearer token。
- A2 普通用户必须通过账号+密码登录，原“用户名不存在则自动创建并登录”的路径被移除。
- A3 旧的无密码用户不能直接用原方式登录；管理员可在用户管理界面为其设置/重置密码后再登录。
- A4 production 空库首次启动时，系统能基于环境变量/配置初始化保留管理员账号及其可用密码；若必需输入缺失，启动或认证行为必须有清晰失败语义。
- A5 `admin` 登录后默认进入独立用户管理工作台，不显示项目列表、设计器、字段/单位/字典等普通 CRF 编辑功能。
- A6 管理员工作台保留用户管理、批量迁移/复制/删除项目、回收站等现有管理员能力。
- A7 普通用户无法访问管理员接口；管理员接口继续基于 `is_admin` 拒绝非管理员访问。
- A8 认证改造前后，已有项目的访问边界仍然由原 `user.id -> project.owner_id` 决定，不因密码迁移而改变归属。
- A9 生产环境认证接口仍保有限流行为，超限继续返回 `429` 和 `Retry-After`。
- A10 `/api/auth/me` 仍能稳定返回当前用户身份所需的 `username` 与 `is_admin` 语义，前端可据此完成登录后分流。
- A11 认证相关测试、管理员测试、前端登录/壳层测试和文档均同步更新，无遗留旧契约说明。

## Research Summary for Planning

### Existing Structures
- `backend/src/models/user.py`：用户模型已包含 `username`、`hashed_password`、`is_admin`，其中 `hashed_password` 当前允许为 `NULL`。
- `backend/src/routers/auth.py`：当前 `POST /api/auth/enter` 只接收 `username`，不存在则自动创建普通用户；保留管理员用户名禁止通过该路径手动创建。
- `backend/src/services/auth_service.py` + `backend/src/dependencies.py`：当前采用无状态 JWT，Bearer token 每次按 `user_id` 查库并校验 `username` 快照一致性。
- `backend/src/services/user_admin_service.py`：当前管理员只支持按用户名创建、改名、删除用户，创建出的用户密码字段为 `NULL`。
- `backend/src/database.py`：启动时会自愈保留管理员 `is_admin` 语义，并在 production 空库首次启动时插入一个 `hashed_password = NULL` 的管理员记录。
- `backend/src/config.py`：当前 `AdminConfig` 仅有 `username`，没有管理员初始密码来源配置；`AuthConfig` 已限制 token TTL 不超过 60 分钟。
- `frontend/src/components/LoginView.vue`：当前仅有用户名输入框，请求 `/api/auth/enter`。
- `frontend/src/App.vue`：当前用单一应用壳层在登录成功后同时承载普通用户工作台和管理员入口；`loadMe()` 通过 `/api/auth/me` 读取 `is_admin`。
- `frontend/src/components/AdminView.vue`：已存在较完整的管理员工作台，包含用户列表、增删改名、批量项目迁移/复制/删除和回收站。

### Hard Constraints
- 项目隔离必须继续依赖 `user.id` 与 `project.owner_id`，不能通过重建用户或更换主键实现迁移。
- 认证标识复用 `username`，不得额外引入 account 字段以扩大迁移面。
- `is_admin` 仍是唯一管理员判定源。
- 所有创建用户、管理员初始化、测试夹具和旧数据迁移路径都必须从“允许 `hashed_password = NULL`”过渡到“密码认证可用”的一致语义。
- 管理员初始密码来源必须外部可配置，不能硬编码到代码或仓库。
- 认证限流、token 失效、`/api/auth/me` 契约和前端 token 存储机制必须保持可用。

### Soft Constraints
- 变更应优先复用现有 `AdminView.vue` 和 `App.vue` 结构，尽量避免在 research 阶段引入大规模前端路由重构决策。
- 管理员界面从普通工作台中分流即可，不需要在本阶段扩展新的业务能力范围。
- 密码策略以基础策略为主：至少定义最小长度，不在本次引入复杂度校验与账户锁定体系。

### Dependencies
- 后端关键依赖链：`backend/src/models/user.py`、`backend/src/routers/auth.py`、`backend/src/routers/admin.py`、`backend/src/services/auth_service.py`、`backend/src/services/user_admin_service.py`、`backend/src/dependencies.py`、`backend/src/database.py`、`backend/src/config.py`、`backend/src/rate_limit.py`。
- 前端关键依赖链：`frontend/src/components/LoginView.vue`、`frontend/src/App.vue`、`frontend/src/components/AdminView.vue`、`frontend/src/composables/useApi.js`。
- 高耦合测试/文档面：`backend/tests/test_auth.py`、`backend/tests/test_user_admin.py`、`backend/tests/test_rate_limit.py`、`backend/tests/helpers.py`、前端登录/壳层测试、`README.md`、`README.en.md`、模块级 `.claude/CLAUDE.md`。

### Risks & Mitigations
- **R1 旧用户无密码无法登录**：现存大量 `hashed_password = NULL` 用户。  
  **Mitigation:** 将“管理员设置/重置密码”纳入同一变更，作为旧用户迁移主路径。
- **R2 production 空库管理员不可登录**：当前 bootstrap 仅插入无密码管理员。  
  **Mitigation:** 在配置/环境变量中定义管理员初始密码来源，并在启动期明确校验缺失行为。
- **R3 前端壳层强耦合**：`App.vue` 当前共享布局和数据加载，admin 分流容易出现界面闪动或残留普通功能入口。  
  **Mitigation:** 在规划阶段明确登录后先拉取 `/api/auth/me` 再决定管理员/普通用户主视图，避免共享工作台误显。
- **R4 回归面大**：现有测试、帮助函数和文档默认 `/api/auth/enter` 无密码契约。  
  **Mitigation:** 将测试契约与文档同步列为显式交付项，避免接口改了但说明和夹具未改。
- **R5 OpenAPI 与真实登录接口不一致**：`tokenUrl` 当前已漂移。  
  **Mitigation:** 在本次认证收口中统一 tokenUrl 与真实登录路由，避免后续客户端继续误用。
- **R6 用户改名与 token 失效语义耦合**：当前 JWT 额外校验 `username` 快照。  
  **Mitigation:** 在规划阶段显式判断该行为是保留还是调整，并同步管理员改名后的会话影响测试。

### Success Criteria
- 认证入口从无密码进入统一为账号密码登录，且无自动创建普通用户副作用。
- 旧数据在不改变 `user.id` 的前提下完成可登录迁移路径设计。
- 管理员拥有独立主工作台，普通 CRF 编辑入口对 admin 默认隐藏。
- 现有管理员项目运维能力继续可用。
- 生产与开发环境下的认证配置、限流、JWT 与文档契约一致。

### Open Questions Resolved During Research
1. “账号”是否是新字段？→ 否，复用现有 `username`。  
2. 旧无密码用户如何迁移？→ 由管理员设置/重置密码。  
3. admin 登录后默认进入什么？→ 独立用户管理工作台，不显示 CRF 编辑工作台。  
4. 是否把密码设置/重置纳入本次？→ 是。  
5. production 初始管理员密码来源？→ 环境变量/配置项。  
6. 密码策略是否上强规则和锁定？→ 否，本次只要求基础策略并沿用现有限流。  
7. 管理员独立界面是否保留项目批量操作与回收站？→ 是，保留。

## Supplementary Research: 管理员 admin 界面细化

### Enhanced Requirement

在现有管理员独立工作台基础上，补充一轮以“可理解性 + 可追溯性 + 可恢复性”为目标的界面细化，且不改变管理员工作台仍由 `frontend/src/components/AdminView.vue` 直挂载的现状。

### 目标
- **操作命名清晰化**：把“批量迁移/批量复制/批量删除/删除”调整为更贴近结果语义的“迁移项目/复制项目/删除项目/删除用户”，降低误解成本。
- **恢复归属显式化**：回收站恢复不再隐式恢复到原 owner，而是在恢复前显式选择“恢复到哪个用户”；若原 owner 仍可用则默认选中，否则默认留空并要求手动选择。
- **管理员写操作留痕**：在“回收站”右侧增加“痕迹”入口，展示管理员界面内所有写操作的不可修改痕迹，用于事后追溯。
- **项目数可解释化**：在用户列表“项目数”数字上悬停时，展示该用户当前活跃项目列表，让数字可被快速解释。
- **去除冗余说明文案**：删除“统一管理用户、批量项目操作与回收站入口”副标题，保留更简洁的管理员页头。

### 用户确认
- “痕迹”覆盖**所有写操作**，不覆盖只读查看行为。
- 回收站恢复时，若原所属用户已不存在或不可用，默认行为为**清空并手选**，不自动回退到管理员或其他用户。
- 批量操作的痕迹记录粒度为**每项目一条**，而不是只记批次汇总。

### 范围边界
**纳入范围**
- `frontend/src/components/AdminView.vue` 的按钮文案、副标题、悬停项目列表、恢复前目标用户选择、痕迹入口与只读展示。
- `backend/src/routers/admin.py` 的回收站恢复契约扩展，以及管理员痕迹查询接口。
- 管理员写操作痕迹的持久化模型、轻量迁移与查询链路。
- 相关前后端测试与 OpenSpec 文档同步。

**不纳入范围**
- 不记录管理员界面的只读查看行为。
- 不提供痕迹编辑、删除、补录、合并或人工修正能力。
- 不重做管理员壳层为多页路由或 tab 架构。
- 不改变普通用户工作台、非管理员接口权限体系或 `project_count` 的统计口径。

### Hard Constraints
- 现有管理员前端是单一 `AdminView.vue` 工作台，且 `frontend/tests/adminViewStructure.test.js` 明确禁止引入 `el-tabs` / `el-tab-pane`；新增“痕迹”入口必须延续当前直达式工作台或对话框式交互。
- 现有回收站恢复接口 `POST /api/admin/projects/{project_id}/restore` 无请求体，只支持恢复到当前 `project.owner_id`；若要支持目标用户选择，必须扩展请求契约或新增端点。
- 当前恢复逻辑的重名处理和 `order_index` 续尾都基于原 `owner_id` 计算；恢复到其他用户时，这两段逻辑必须改为针对目标用户重新计算。
- `project.owner_id` 是项目归属唯一来源，且允许为 `NULL`；系统已允许“仅剩回收站项目的用户被删除”，因此“原删除用户”不保证始终存在，默认值必须容忍原 owner 不可用。
- 管理员用户列表中的 `project_count` 只统计活跃项目；悬停项目列表必须与该口径一致，只展示 `deleted_at IS NULL` 的当前项目。
- 现有系统没有可查询的业务级审计表或操作轨迹 API；若实现“痕迹”，必须新增持久化结构，不能依赖普通日志输出代替。
- 痕迹要求“不可修改”，而现有项目硬删除、用户删除都可能移除被操作实体；轨迹存储不能只依赖会被级联删除或失效的外键，必须保留足够的对象快照信息。
- 批量复制当前支持部分成功、部分失败；既然用户确认批量痕迹按“每项目一条”记录，轨迹语义必须能区分每个项目的成功/失败结果，不能只保留批次级结果。

### Soft Constraints
- 文案重命名与副标题删除应尽量保持为低影响前端改动，不引入额外 API 或数据结构耦合。
- “项目数”悬停列表优先复用现有 `GET /api/projects?user_id=...` 管理员查询能力，避免为只读展示新增重复接口契约。
- “痕迹”入口应与“回收站”处于同一管理员动作区，延续当前页头按钮组织方式。
- 轨迹展示应保持只读，不在 research 阶段扩展筛选、编辑、回滚或批量修复等衍生能力。

### Dependencies
- 前端主边界：`frontend/src/components/AdminView.vue`、`frontend/tests/adminViewStructure.test.js`。
- 后端主边界：`backend/src/routers/admin.py`、`backend/src/services/user_admin_service.py`、`backend/src/routers/projects.py`、`backend/src/schemas/project.py`。
- 持久化边界：`backend/src/models/` 与 `backend/src/database.py` 的轻量迁移链路。
- 既有查询复用：`GET /api/projects?user_id={user_id}` 已可供管理员读取指定用户的活跃项目列表。
- 既有回归基线：`backend/tests/test_admin_project_ops.py` 与 `backend/tests/test_user_admin.py` 已锁定当前恢复、删除、迁移、复制与用户管理语义。

### Risks & Mitigations
- **R1 原 owner 不存在导致恢复默认值失真**：回收站项目可能来自已被删除用户。  
  **Mitigation:** 恢复弹窗默认优先原 owner；原 owner 不可用时默认留空并要求手动选择，后端拒绝无目标用户的恢复请求。
- **R2 痕迹在实体删除后丢失审计意义**：若只保存外键，项目硬删除或用户删除后轨迹会不可读。  
  **Mitigation:** 轨迹中保留操作者、目标对象、动作类型、结果等必要快照，避免完全依赖活体外键解析。
- **R3 批量复制/迁移/删除存在部分成功语义**：如果痕迹粒度或写入时机不清晰，会造成记录与真实结果不一致。  
  **Mitigation:** 以“每项目一条”作为固定粒度，并在 planning 阶段明确成功/失败记录时机与字段。
- **R4 管理员表格操作区已较拥挤**：再增加入口可能降低可读性。  
  **Mitigation:** “痕迹”放在“回收站”右侧页头动作区，而不是继续堆到表格行操作列。
- **R5 复用项目列表接口可能带来悬停时额外请求**：若用户较多或频繁悬停，可能增加前端请求频率。  
  **Mitigation:** 规划阶段明确是否按 hover 懒加载并结合前端已有 API 缓存能力，避免无界重复请求。

### Success Criteria
- S1 管理员列表操作列文案变为“迁移项目 / 复制项目 / 删除项目 / 删除用户”，且不影响现有批量操作能力。
- S2 管理员页头不再显示“统一管理用户、批量项目操作与回收站入口”副标题。
- S3 管理员在回收站点击“恢复”时，必须先看到“恢复到哪个用户”的选择界面；原 owner 可用时默认选中，原 owner 不可用时默认不选。
- S4 恢复到目标用户后，项目 `deleted_at` 被清空，并追加到目标用户的 `order_index` 尾部；若目标用户已有同名活跃项目，仍保持当前“恢复重命名”语义。
- S5 管理员页头“回收站”右侧存在“痕迹”入口；痕迹只能查看，不能修改。
- S6 痕迹覆盖管理员界面的所有写操作；批量迁移/复制/删除按**每个项目一条**记录，而不是单条汇总。
- S7 项目或用户后续被删除后，既有痕迹仍可查询，不因实体消失而失真到无法理解。
- S8 管理员将鼠标悬停在“项目数”数字上时，可看到该用户当前活跃项目列表，且列表口径与 `project_count` 一致。

### Research Summary for OPSX

**Discovered Constraints**:
- 管理员前端仍必须保持 `AdminView.vue` 直达式工作台，避免引入 tab 架构。
- 回收站恢复现有契约只支持原 owner，支持目标用户选择需要扩展后端接口。
- 原 owner 可能因用户删除而不可用，默认恢复目标必须容忍空值场景。
- `project_count` 与悬停项目列表都必须只统计活跃项目。
- 系统当前没有业务级可查询轨迹表；“痕迹”必须新增持久化模型和查询链路。
- 痕迹不可依赖会被级联删除的实体外键作为唯一信息来源。
- 批量操作存在部分成功语义，且用户已确认按每项目一条留痕。

**Dependencies**:
- `frontend/src/components/AdminView.vue`
- `frontend/tests/adminViewStructure.test.js`
- `backend/src/routers/admin.py`
- `backend/src/routers/projects.py`
- `backend/src/services/user_admin_service.py`
- `backend/src/models/` + `backend/src/database.py`
- `backend/tests/test_admin_project_ops.py`
- `backend/tests/test_user_admin.py`

**Risks & Mitigations**:
- 原 owner 不可用 → 默认留空并强制手选。
- 痕迹在实体删除后失真 → 持久化对象快照而非只存外键。
- 批量操作部分成功 → 规划时明确逐项目痕迹语义与记录时机。
- 前端操作区拥挤 → “痕迹”入口放到页头而非行内操作列。
- 悬停触发额外请求 → 规划阶段结合懒加载与现有 API 缓存控制请求次数。

**Success Criteria**:
- 管理员操作文案更新且副标题移除。
- 回收站恢复前可选目标用户，默认值遵循“原 owner 可用则选中，否则留空”。
- “痕迹”入口可读不可改，覆盖所有管理员写操作。
- 批量操作按每项目一条记录痕迹。
- “项目数”悬停展示活跃项目列表，且口径与 `project_count` 一致。

**User Confirmations**:
- 痕迹覆盖所有写操作。
- 原所属用户不可用时，恢复默认值清空并手选。
- 批量操作按每项目一条记录痕迹。