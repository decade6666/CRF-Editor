# 选项字典列表复制按钮

## Goal

在选项界面左侧字典列表的操作列中增加“复制”按钮，并加宽整列，使其布局参考表单界面左侧表单列表的操作列，方便用户直接复制已有选项字典。

## What I already know

* 用户要求在“选项界面”的左侧字典列表操作列增加“复制”按钮。
* 用户要求加宽该操作列，参考表单界面左侧表单列表的操作列。
* 实际字典管理组件是 `frontend/src/components/CodelistsTab.vue`。
* 表单界面参考实现是 `frontend/src/components/FormDesignerTab.vue`：左侧表单列表操作列为 `width="150" fixed="right"`，按钮顺序为“复制 / 编辑 / 删除”。
* 当前字典列表操作列为 `width="120"`，仅有“编辑 / 删除”。
* 后端当前没有现成的字典复制接口；`backend/src/routers/codelists.py` 仅提供列表、创建、更新、快照替换、删除、批量删除、选项增删改排等接口。
* 表单复制后端接口是 `POST /api/forms/{form_id}/copy`，命名规则为 `原名_copy`，冲突时追加数字，复制后追加到列表末尾。
* 字典模型 `CodeList` 在同一项目内对 `code` 有唯一约束；复制时不能复用原 OID，应生成新的 `CL` code 或沿用创建接口的生成逻辑。
* 字典选项 `CodeListOption` 会随字典删除级联，复制时应深拷贝选项，并保留选项顺序与下划线设置。

## Assumptions (temporary)

* “复制”复制整组选项字典及其所有选项，不复制单个选项条目。
* 复制后的字典命名沿用表单复制体验：`原名_copy`，冲突时 `原名_copy1`、`原名_copy2`。
* 复制后追加到当前项目字典列表末尾。
* 复制按钮在“编辑 / 删除”之前，按钮顺序参考表单列表为“复制 / 编辑 / 删除”。

## Open Questions

* 无。

## Requirements (evolving)

* 左侧字典列表操作列新增“复制”按钮。
* 操作列宽度需要加宽，建议参考表单列表使用 `width="150" fixed="right"`。
* 新增后端字典复制能力，复制字典基本信息与全部选项。
* 复制时生成不冲突的字典名称和新的 OID/code。
* 复制成功后仅刷新字典列表并显示“复制成功”，不自动选中新副本或进入编辑。

## Acceptance Criteria (evolving)

* [ ] 选项界面左侧字典列表每行展示“复制 / 编辑 / 删除”。
* [ ] 操作列宽度足以容纳三个按钮，视觉上与表单列表一致。
* [ ] 点击复制后创建一个新的字典副本，名称按 `_copy` 规则去重。
* [ ] 副本包含原字典的描述、全部选项、选项顺序、选项填写线设置。
* [ ] 副本使用新的字典 OID/code，不触发唯一约束冲突。
* [ ] 复制后仅刷新列表，不自动选中新副本，并不影响已有编辑、删除、选择字典行为。
* [ ] 越权复制其他项目字典会被拒绝。

## Definition of Done (team quality bar)

* Backend and frontend tests added/updated where appropriate.
* Relevant backend pytest and frontend node tests pass or not-run reason is recorded.
* Lint / relevant source-level tests pass or not-run reason is recorded.
* Docs/notes updated only if user-facing behavior documentation needs同步。
* Rollout/rollback considered; this is low-risk CRUD addition.

## Out of Scope (explicit)

* 不改变单个选项条目的复制/编辑方式。
* 不改变字典、选项的数据结构。
* 不改变字段引用关系：复制后的新字典不会自动替换任何字段正在引用的原字典。
* 不调整其他管理界面的操作列布局，除表单界面参考一致性外不做全局样式重构。

## Technical Approach

* Backend: 在 `backend/src/routers/codelists.py` 增加 `POST /api/projects/{project_id}/codelists/{cl_id}/copy`，复用 `_get_codelist_with_project_check` 和 `OrderService.get_next_order`。
* Backend copy behavior: 创建新的 `CodeList(project_id=src.project_id, name=deduped_name, code=generate_code("CL"), description=src.description, order_index=next)`；逐个复制 `CodeListOption(code, decode, trailing_underscore, order_index)`。
* Frontend: 在 `frontend/src/components/CodelistsTab.vue` 增加 `copyCl(row)`，调用新增 API，刷新列表并提示成功；操作列改为与表单列表一致的三按钮布局。
* Tests: 后端增加字典复制集成测试；前端增加/更新源码级结构测试，确保 CodelistsTab 有复制按钮、API 调用、操作列宽度。

## Decision (ADR-lite)

**Context**: 现有表单列表已经支持复制，但选项字典列表没有同等操作；仅前端用现有创建接口拼装复制容易出现 code 唯一约束、选项顺序和权限边界不一致问题。

**Decision**: 推荐新增后端复制接口，并在前端调用该接口；UI 布局直接复用表单列表的操作列宽度与按钮顺序。

**Consequences**: 改动跨前后端，但复制语义集中在后端，权限、命名去重、OID 生成、选项深拷贝更可靠；需要补充后端接口测试。

## Technical Notes

* `frontend/src/components/CodelistsTab.vue` 当前操作列：`label="操作" width="120"`，按钮为“编辑 / 删除”。
* `frontend/src/components/FormDesignerTab.vue` 表单列表操作列：`label="操作" width="150" fixed="right"`，按钮为“复制 / 编辑 / 删除”。
* `backend/src/routers/codelists.py` 当前 `create_codelist` 会在缺少 code 时使用 `generate_code("CL")`，选项创建时按输入顺序设置 `order_index`。
* `backend/src/models/codelist.py`：`CodeList` 有 `UniqueConstraint("project_id", "code")`；`CodeListOption` 有 `UniqueConstraint("codelist_id", "code", "decode")`。
* `backend/src/routers/forms.py` 表单复制命名规则可作为字典复制命名规则参考。
