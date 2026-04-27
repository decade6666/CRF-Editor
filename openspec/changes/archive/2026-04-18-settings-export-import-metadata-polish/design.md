# Settings Export Import Metadata Polish — Design

## Context

本次 change 不是新增导入导出流程，而是把 3 条已有链路做一致性收敛：

1. **前端壳层与设置交互**：编辑模式开关语义、头部快捷入口、设置区动作布局。
2. **项目级元数据**：新增“筛选号格式”字段，并让它在项目 CRUD、复制、项目 `.db` 导入兼容链路与 Word 封面导出中保持一致。
3. **Word 导出访视分布图**：分页/分节、横向页面与现有 `×` 标记语义保持稳定。

本轮 planning 已额外确认以下用户决策：

- “筛选号格式”为空时，**数据库保留空值语义**；UI 显示与 Word 导出统一回退默认串 `S|__|__||__|__|__|`。
- 旧版项目 `.db` **缺少新列时必须兼容导入**，不能直接判定 schema 不兼容。
- “筛选号格式”输入需要**长度限制且禁止换行/控制字符**，最大长度固定为 **100**。

## Multi-Model Analysis Summary

- **Codex（后端）**
  - 认定本次后端主线应是“项目元数据字段 + Word 导出 section 修正”，而不是把项目字段错误塞进 `/api/settings`。
  - 强调 `project_clone_service.py` 与 `project_import_service.py` 都是**显式字段复制/校验**链路，新字段不会自动继承。
- **Gemini（前端 / 集成）**
  - 认可设置弹窗中的编辑模式应直接复用现有主题模式的 `inline-prompt` 呈现风格。
  - 强调 `FormDesignerTab.vue` 中“设计表单”按钮与 `editMode` 的当前硬耦合必须拆开，但高级编辑标签页仍要继续受 `editMode` 约束。
  - 认定访视分布图页的横向布局必须通过 section break 管理，否则后续表单页方向与页眉页脚会漂移。

## Goals / Non-Goals

### Goals

- 将设置中的“编辑模式”切换器改为与主题模式一致的 `inline-prompt`，文案固定为“简要/完全”。
- 关闭编辑模式时，仍允许在已选中表单的前提下看到“设计表单”按钮；`选项 / 单位 / 字段` 等高级标签页继续保持编辑态门控。
- 将主界面头部快捷入口收敛为“导入模板 + 导出Word”，并把“导入Word”移动到设置区“导入项目”下方。
- 删除设置区“数据导出”标题文字，仅保留横向分隔，不改变导入/导出职责边界。
- 新增项目字段 `screening_number_format`，在项目页可编辑、在项目接口中可读写、在复制与项目 `.db` 导入/导出回环中不丢失。
- 将 Word 封面页“筛选号”改为读取项目字段，并在空值时回退默认串。
- 调整 Word 访视分布图的**分页结构、页面方向**，并保持现有 `×` 标记语义不变。
- 保持 `doc.tables[0]` 仍为封面表、`doc.tables[1]` 仍为访视分布图表，不破坏 `docx_import_service.py` 当前“跳过前两个表”的前提。

### Non-Goals

- 不重构全局 `settings.py` 配置协议；“筛选号格式”不是全局设置。
- 不放宽 `editMode` 对高级编辑标签页的整体门控。
- 不引入第二套“导入Word”执行流程，只移动入口位置。
- 不改造“新建项目”弹窗；新字段入口仍限定在 `ProjectInfoTab.vue`。
- 不把本次变更扩展为通用 Word section 模板引擎或通用项目 metadata 框架。

## Decisions

### 1. 前端壳层只做语义收敛，不新增状态层

- **Decision**：前端改动限定在 `frontend/src/App.vue`、`frontend/src/components/FormDesignerTab.vue`、`frontend/src/components/ProjectInfoTab.vue` 及对应静态结构测试中完成。
- **Rationale**：现有 `editMode`、设置弹窗、导入 Word 对话框和项目表单状态都已集中在 `App.vue` / 局部组件内；本次没有引入额外全局状态层的必要。

### 2. 编辑模式只继续控制高级编辑面，不再控制“设计表单”入口可见性

- **Decision**：`editMode` 继续控制 `选项 / 单位 / 字段` 三个标签页和“新建表单”等高权限入口；“设计表单”按钮改为只依赖 `selectedForm`。
- **Rationale**：用户要的是“关闭编辑模式时仍能进入设计器查看/操作当前表单”，不是把整套高级配置入口一并开放。

### 3. 头部入口与设置入口各自只保留一种职责

- **Decision**：头部快捷区只保留“导入模板”“导出Word”；“导入Word”移至设置区“导入项目”下方，复用设置区动作按钮层级；“导入模板”与“导出Word”在头部保持同一级视觉强调。
- **Rationale**：用户已明确不保留双入口，同时要求能力不丢失、样式对齐。

### 4. `screening_number_format` 采用显式项目列，而不是通用 JSON metadata

- **Decision**：新增项目列 `screening_number_format`，类型固定为 `String(100)`、允许 `NULL`。
- **Rationale**：当前 `Project` 的封面页元数据都是显式列；为单个字段引入通用 metadata 容器会增加 schema、校验和复制/导入复杂度。

### 5. 空值语义统一为“存空值 + 读写时回退默认串”

- **Decision**：后端 schema 对空字符串/纯空白执行 `trim -> None` 归一化；项目页显示与 Word 导出统一回退默认串 `S|__|__||__|__|__|`；只有用户输入非空值时才持久化显式内容。
- **Rationale**：用户已经明确选择“空值仍存库”，这样能区分“用户从未设置”和“用户显式保存默认模板串”。

### 6. 输入校验在项目接口边界完成

- **Decision**：`screening_number_format` 保存前执行：去首尾空白、最大长度 100、禁止换行和控制字符。
- **Rationale**：该字段最终会渲染到 Word 封面页表格中，需要在系统边界防止排版破坏和不可见控制字符进入文档。

### 7. 旧版项目 `.db` 导入兼容优先于新列强约束

- **Decision**：`backend/src/services/project_import_service.py` 不把 `screening_number_format` 加入旧库硬性必需列集合；当外部 `project` 表缺少该列时，导入继续成功，并按空值默认语义处理。
- **Rationale**：用户已明确要求兼容旧库，否则历史项目 `.db` 将被无谓阻断。

### 8. 复制、管理员响应和项目接口必须完整透传新字段

- **Decision**：`ProjectResponse`、项目列表/详情/更新接口、管理员回收站响应、项目复制和项目导入生成的新项目都必须保留 `screening_number_format`。
- **Rationale**：这些链路当前都依赖显式 schema 或显式字段列表；若漏改会出现静默丢值。

### 9. 访视分布图页必须拥有独立 landscape section

- **Decision**：目录页尾与访视分布图页尾都使用 `WD_SECTION.NEW_PAGE`；进入矩阵前切到 landscape section，矩阵结束后切回 portrait section；每次切 section 都重新应用页眉页脚。
- **Rationale**：页面方向是 section 级能力；只改表格或普通分页无法保证后续表单页恢复为纵向，也无法避免页眉页脚漂移。

### 10. 前两张表的逻辑顺序必须保持不变

- **Decision**：无论 section 如何拆分，导出后仍要满足：`doc.tables[0]` 是封面表，`doc.tables[1]` 是访视分布图表。
- **Rationale**：`backend/src/services/docx_import_service.py` 当前明确依赖“跳过前两个表”的结构假设。

## Risks / Trade-offs

- **[旧库导入兼容 + 新库透传字段]**：实现需要同时覆盖 ORM、schema、迁移、复制、导入、管理员响应和导出测试，触点较多，但这是消除静默丢值的必要代价。
- **[头部样式对齐]**：只要求与 `导出Word` 同级视觉强调，不额外引入新按钮层级或全局按钮样式重构。

## PBT / Verifiable Properties

1. **Project metadata round-trip**：任意合法 `screening_number_format` 经过项目 `PUT -> GET` 后语义保持一致；空串/纯空白统一归一为空值语义。
2. **Default fallback consistency**：当项目字段为空时，项目页默认显示值与 Word 封面页“筛选号”导出值相同，且都等于 `S|__|__||__|__|__|`。
3. **Copy / import preservation**：任意显式非空 `screening_number_format` 在项目复制和项目 `.db` 导入/导出回环后不丢失。
4. **Legacy import compatibility**：对任意缺少新列的旧版项目 `.db`，导入不会因缺列失败，且导入项目在读取/导出时仍满足默认回退语义。
5. **Section orientation recovery**：任意成功导出的文档都满足“目录/前置页 portrait -> 矩阵页 landscape -> 后续表单页 portrait”的方向恢复模式。
6. **Front-two-table stability**：任意成功导出的文档，前两张表始终分别是封面表和访视分布图表。
7. **Matrix marker stability**：任意成功导出的文档，访视分布图关联单元格继续使用现有 `×` 标记语义。

## Implementation Order

1. 先更新 OpenSpec `specs/*.md` 与 `tasks.md`，冻结业务语义与验证边界。
2. 再收敛项目元数据链路：模型、schema、项目接口、管理员响应、SQLite 迁移、复制、旧库导入兼容、项目页输入。
3. 然后调整前端壳层：编辑模式开关呈现、按钮可见性、头部/设置入口重排。
4. 最后收敛 Word 导出：封面页筛选号来源、section/orientation 与结构稳定性回归测试。

## Open Questions

- 无阻塞性开放问题；当前实现约束已经足够进入 `/ccg:spec-impl`。