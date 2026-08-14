# 全屏设计器两栏重构与字段原子 profile

## Goal

消除全屏表单设计器四列布局的横向拥挤：删除独立字段库卡片，把字段库入口移入 OID/字段标签自动完成；把字段定义与实例的多请求保存链收敛为两个原子 profile 端点（单事务），支持候选换绑与 OID 分叉的原子历史回放；设计备注改为表单属性动作栏图标 + 弹窗显式保存。前后端同时改造，跨栈契约新增 default_value/inline_mark 归一。

## Requirements

### 布局（仅全屏设计器；外层表单列表+快速预览不改）

1. 宽屏左右两栏：左 38% / 右 62%（新 localStorage 键），可横向拖拽记忆；左栏内部字段列表/属性卡各 50%（纵向拖拽记忆）。复用并扩展 `usePaneSplit`（新增 `axis: 'horizontal'`）。
2. 约 1100px 可用宽度以下退化为上下布局（列表+属性在上、预览在下），隐藏横向拖拽条；断点以浏览器实测微调。
3. 删除独立字段库卡片、字段库搜索框、字段库宽度拖拽条；旧 localStorage 键不迁移。
4. 右栏预览占满可用高度，完整保留：固定 A4 几何、缩放、列宽/行高拖拽缓存键、eCRF/aCRF 切换、注记渲染/垂直拖拽持久化、横竖纸逻辑；不改 Word 导出与预览/导出一致性契约。
5. 属性卡固定标题 + 中间独立滚动 + 固定底部动作栏。表单属性动作栏左侧备注图标、右侧取消/保存；字段属性右侧取消/保存；log 行只读无按钮。

### 字段自动完成与换绑

6. OID 与字段标签输入都接入同一候选（完整模式显示 OID；简洁模式隐藏 OID 但标签可搜）。候选：`isVisibleInFieldLibrary` 过滤 + 升级后的 `rankFuzzyMatches`（OID+标签双候选）；显示 OID/标签/类型；非空输入才展开（`trigger-on-focus=false`）；不设上限、滚动展示全部。
7. 当前实例定义标「当前字段」；已被当前表单其他实例引用的定义仍显示但标「已添加」、禁用（鼠标和键盘都拒绝）。仅明确点击候选才设置本地换绑；粘贴同 OID 不自动换绑，保存时前端阻止并提示，后端唯一约束兜底 409。
8. 点击候选是唯一豁免脏态离开确认的路径：直接丢弃当前未保存属性、以候选定义重新水合，原始保存基线保留（取消可完整恢复）。
9. 选择候选后：OID 未改 → 非 OID 属性属于候选共享定义（保存前必须影响确认）；OID 改动 → 创建分叉定义。新增草稿遵循完全相同的判断。保存才落库。

### 原子字段 API

10. 新增 `POST /api/forms/{form_id}/field-profile`（新增草稿）与 `PUT /api/form-fields/{ff_id}/binding-profile`（已有字段/快编/inline/历史回放），共享一个 service/schema 核心。命令三部分：`definition_operation`（none / update_shared / create_or_restore+preferred_definition_id）、`binding`（keep / existing / operation_result）、`instance`（upsert / delete），另 `cleanup_definition_id`（仅限原绑定定义；换绑/删除后无引用即删并压实，有引用保留并返回 `retained_in_use`）。所有校验与写操作在单个 `get_session` 事务内，失败整体回滚。
11. 保留契约：OID 字符集、label_bold 拒 null、HexColor、LabelFontSize、跨项目 403、同表单重复 409、log 行拒绝进入 binding-profile（仍走既有结构端点、属性只读）、多选策略、复选清字典。
12. 新跨栈归一：后端镜像前端 `isDefaultValueSupported` / `normalizeDefaultValue` / `canToggleInline`（复选无默认值；inline 多行；非 inline 仅文本/数值且截单行；标签/日志行禁 inline），用共享用例表锁定两侧一致。
13. 同 PR 全仓迁移后删除：`PUT /form-fields/{id}`、`PATCH /form-fields/{id}/colors`、`PATCH /form-fields/{id}/inline-mark`。保留：`PUT /projects/{pid}/field-definitions/{id}`（仅 FieldsTab 共享库编辑，仍允许显式共享 OID 改名）、field-definition create/copy/delete/reorder/references/batch、form-field create/delete/reorder/batch-delete（log/复制/结构删除/既有历史）。

### 保存与历史

14. `saveFieldProp` → 单次 binding-profile；`saveDraftField` → 单次 field-profile；`saveQuickEdit` → binding-profile 实例部分更新；`toggleInline` → 同路径 `{inline_mark}`。删除旧三连发与旧 `applyFieldPropState`。
15. 共享更新前用 references + `fieldReferenceImpact` 确认影响表单数；历史记录 before/after 完整快照 + 创建/换绑/分叉信息 + 影响表单数；undo/redo 单次 profile 调用原子回放、不重复弹确认；分叉 redo 复用 `preferred_definition_id` 或按原 OID 重建，冲突时明确失败并保持栈，绝不 `_copyN` 漂移；分叉 undo 被引用时保留并提示。
16. 成功持久化后才写入历史；历史标签/tooltip 显示影响表单数。

### 备注弹窗

17. 备注图标仅在表单属性动作栏左侧显示；弹窗独立草稿：「确定」await 表单 PUT 成功后关闭、失败保持；「取消」/关闭/遮罩完全丢弃。删除 500ms 防抖计时器、pending 队列与自动保存；备注不参与页面离开自动 flush。删除全屏「实时预览」标题栏备注摘要；外层快速预览胶囊保留。

### 图标

18. 全屏工具栏：新增字段 `Plus`、保存草稿 `Check`、log 行用已安装文档添加类图标（tooltip/aria 明确「添加"以下为 log 行"」）、撤销/重做语义图标、批删 `Delete` 常显禁用不显示数量；行级 inline/复制/删除图标化（删除 danger）。全部 `el-tooltip + aria-label`，保留 data-test、快捷键与处理函数。

## Acceptance Criteria

- [ ] 后端新端点 RED→GREEN 全矩阵测试（create/attach/fork、instance-only/shared/rebind/fork、重复/跨项目/log 行/校验/归一/事务回滚/清理语义/权限），旧三写路由全仓无残留调用且删除后 404。
- [ ] 跨栈归一用例表两侧一致（新增 `test_field_normalization_parity.py` + 前端契约测试）。
- [ ] 前端全量测试通过（自动完成排序/状态/禁用、换绑/分叉/草稿、历史原子回放与失败保栈、备注弹窗、usePaneSplit 横轴、两栏布局与预览几何源码契约）。
- [ ] `npm run lint` 0 errors、`npm run build` OK；后端全量 pytest 通过。
- [ ] 浏览器实机（亮/暗、宽/窄屏、明暗、键盘）：候选选择→保存→影响确认→撤销/重做（含分叉定义保留/删除）、备注弹窗、分隔记忆、eCRF/aCRF/列宽/行高/注记无回归。
- [ ] 文档同步：README 中英、模块 CLAUDE、`.claude/index.json`、Trellis spec（cross-stack-contracts 补归一契约）。

## Notes

- `FormDesignerTab.vue` 为本子任务串行主战场；必须基于 PR#72（子任务 1）合并后的 main 切分支。
- 详细设计见 `design.md`、实施顺序见 `implement.md`。
