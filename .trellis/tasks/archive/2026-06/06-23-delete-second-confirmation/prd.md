# brainstorm: 删除操作二次确认弹窗

## Goal

为 CRF Editor 中用户触发的删除类操作统一增加更明确的二次确认弹窗，降低误删项目、表单、字段、访视、选项、用户等数据的风险，并尽量沿用现有 Element Plus `ElMessageBox.confirm` 交互风格。

## What I already know

* 用户要求：删除操作都给一个二次确认的弹窗。
* 前端当前已经大量使用 `ElMessageBox.confirm` 做一次确认，主要分布在：
  * `frontend/src/App.vue`：删除项目。
  * `frontend/src/components/AdminView.vue`：删除用户、彻底删除回收站项目。
  * `frontend/src/components/FormDesignerTab.vue`：删除表单、批量删除表单、字段属性离开确认、草稿确认等。
  * `frontend/src/components/FieldsTab.vue`：删除字段、批量删除字段。
  * `frontend/src/components/CodelistsTab.vue`：批量删除选项。
  * `frontend/src/components/VisitsTab.vue`：删除访视、批量删除访视。
* 后端删除接口对应分布在：`projects.py`、`forms.py`、`fields.py`、`codelists.py`、`visits.py`、`units.py`、`admin.py` 等路由。
* 本需求重点应优先落在用户可见的前端删除入口；后端权限与实际删除逻辑已存在，不应把二次确认做成后端协议变更。
* 项目前端使用 Vue 3 + Element Plus；确认弹窗现有文案以中文为主。

## Assumptions (temporary)

* “二次确认”指在现有删除确认之外，再增加一次更明确的最终确认，而不是把一次确认文案改得更长。
* MVP 不覆盖非删除但同样有风险的操作，例如导入覆盖、导出、普通修改影响提醒、离开未保存草稿等。
* MVP 不引入新依赖，不改变后端 DELETE / batch-delete API。

## Open Questions

* 针对“删除项目”相关操作点，逐项确认哪些需要二次确认。

## Requirements (evolving)

* 范围先收敛到“删除项目”相关操作点，并逐项确认是否需要二次确认。
* 已定位的项目删除操作点包括：普通项目列表删除、管理员批量删除项目、回收站彻底删除项目。
* 保留现有一次确认的上下文信息，例如引用影响、批量数量、不可恢复提示。
* 普通项目列表里的“删除项目”需要二次确认：点击删除后先出现现有确认，再出现最终确认，确认两次才删除。
* 管理员“批量删除项目”需要二次确认：在批量操作弹窗点击“确定删除”后，再出现最终确认，确认后才调用批量删除接口。
* 回收站里的“彻底删除项目”需要二次确认：第一次不可逆确认后，再出现最终确认，确认后才永久删除。
* 对纳入范围的删除操作，在真正调用删除 API 前追加最终确认。
* 用户取消任一确认步骤时，不应发出删除请求，也不应改变本地列表状态。
* 最终确认文案应清晰提示“再次确认 / 最终确认 / 操作不可恢复”等风险信息。

## Acceptance Criteria (evolving)

* [x] 项目删除相关入口（普通删除、管理员批量删除、回收站彻底删除）均需要完成两次确认后才调用删除 API。
* [x] 所有非项目删除入口使用单次确认：已有确认弹窗的保持不变，引用检查类（字典/单位删除）在检查通过后补单次确认，无确认的本地/关系移除路径补单次确认。
* [x] 字典/单位删除保留引用检查门禁，有引用时 alert 阻止删除，无引用时弹出确认框。
* [x] 取消确认时不会调用删除 API 或执行本地移除。
* [x] 既有引用影响提示仍然保留，不被确认弹窗替代。
* [x] 已新增/更新前端测试覆盖项目双确认、所有删除路径单确认边界、引用检查门禁、取消短路行为。

## Definition of Done (team quality bar)

* Tests added/updated (unit/source-level where appropriate).
* `cd frontend && node --test tests/*.test.js` passes, or narrowed relevant tests are run first with final full/frontend validation noted.
* `cd frontend && npm run lint` passes if code style-sensitive changes are made.
* Docs/notes updated if the delete confirmation convention becomes reusable guidance.
* Rollout/rollback considered: this is frontend-only UX hardening and should not require data migration.

## Out of Scope (explicit)

* Backend API contract changes for delete confirmation tokens.
* Restoring deleted data or implementing an undo/recycle-bin feature outside current behavior.
* Changing permissions, ownership, or project isolation rules.
* Adding a typed confirmation phrase unless explicitly chosen for high-risk operations.
* Non-delete destructive flows such as import overwrite, password reset, export, or ordinary update impact prompts.

## Technical Notes

* Initial search command: `rg -n "ElMessageBox\\.confirm|confirm\\(|delete|Delete|remove|batchDelete|批量删除|删除" frontend/src frontend/tests backend/src/routers`.
* Focused confirmation call list found with: `rg -n "ElMessageBox\\.confirm|confirm\\(" frontend/src/components frontend/src/App.vue`.
* Existing delete confirmation patterns currently use inline `ElMessageBox.confirm(...)` in each component; a small shared frontend helper could reduce duplication, but implementing a helper should be weighed against scope and existing testability.
* Existing delete API routes include single delete and batch delete endpoints; the front-end should gate before these calls rather than changing back-end semantics.

## Expansion Sweep

### Future evolution

* A reusable `confirmDeleteTwice` helper could standardize wording and reduce duplicated two-step confirmation logic.
* Later, high-risk operations could adopt stronger confirmation such as typing the item name, but that is likely too heavy for every delete.

### Related scenarios

* Single delete and batch delete should feel consistent.
* Existing impact-confirm flows for referenced forms/fields/codelists should remain the first confirmation, with final confirmation only after impact is acknowledged.

### Failure & edge cases

* Canceling either confirmation must short-circuit without API calls.
* If the delete API fails after both confirmations, existing error handling / reload behavior should remain unchanged.

## Feasible Approaches

**Approach A: Add a shared two-step delete confirmation helper (Recommended)**

* How it works: create a small frontend helper/composable that wraps the second confirmation and is called from delete handlers after their existing context-specific confirmation.
* Pros: consistent wording, easier tests, avoids copy-paste, future delete flows can reuse it.
* Cons: touches multiple delete handlers and introduces one shared abstraction.

**Approach B: Inline a second `ElMessageBox.confirm` in every delete handler**

* How it works: each existing delete function adds its own final confirmation before calling the API.
* Pros: minimal abstraction, fastest to implement locally.
* Cons: duplicated text and behavior; easy for future delete handlers to drift.

**Approach C: Strong confirmation only for high-risk deletes**

* How it works: all deletes get two dialogs, but only project/user/permanent/batch deletes require typing a name or keyword.
* Pros: strongest protection for irreversible operations.
* Cons: heavier UX and more branching; likely beyond the user’s broad “都给一个二次确认” MVP.

## Decision (ADR-lite)

**Context**: The codebase already has first-level delete confirmations, often with contextual impact messages. The new requirement is to prevent accidental confirmation from immediately deleting data. The user narrowed MVP scope to project delete operation points and confirmed each point individually.

**Decision**: Keep double confirmation only for project delete paths. All other delete paths use single confirmation: already-confirmed delete flows stay single-confirmation, and paths with reference-check gates (codelist/unit delete) add a single confirmation after the reference check passes. Do not change backend APIs.

**Consequences**: High-risk project deletes still require two confirmations, while other delete flows use single confirmation. Reference-check gates (codelist/unit) remain in place before the confirmation dialog, blocking deletion when references exist.

## Implementation Notes

* Added `frontend/src/composables/projectDeleteConfirmation.js` for generic delete and project-delete confirmation messages plus Element Plus confirm wrappers.
* Updated `frontend/src/App.vue` normal project delete to keep the existing first warning and require final confirmation before `api.del`.
* Updated `frontend/src/components/AdminView.vue` so project batch delete and hard delete keep double confirmation, while admin user delete keeps a single existing confirmation.
* Updated `frontend/src/components/CodelistsTab.vue` so `delCl`, `batchDelCl`, and `delOpt` add single `ElMessageBox.confirm` after reference-check gate passes; `batchDelOpt` keeps existing single confirmation.
* Updated `frontend/src/components/UnitsTab.vue` so `del` and `batchDelUnits` add single `ElMessageBox.confirm` after reference-check gate passes.
* Updated `frontend/src/components/FieldsTab.vue`, `frontend/src/components/VisitsTab.vue`, and `frontend/src/components/FormDesignerTab.vue` so already-confirmed delete flows remain single-confirmation, while no-confirmation paths (visit-form relation removals, inline option-row local deletions, and draft-field deletion) add confirmation without backend changes.
* Added/updated `frontend/tests/projectDeleteConfirmation.test.js` and `frontend/tests/designerNewFieldDraft.test.js` to cover message generation, cancellation short-circuit, single-vs-double confirmation boundaries, local row removal ordering, and all delete handler confirmation coverage.
