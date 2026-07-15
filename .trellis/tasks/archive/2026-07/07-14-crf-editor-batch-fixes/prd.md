# CRF Editor 批量修复（父任务）

## Goal

统筹 4 项相互独立、但多数改动集中在巨型文件 `frontend/src/components/FormDesignerTab.vue` 的修复需求，拆为 4 个可独立验证 / 归档的子任务，并约束执行顺序以避免跨任务在同一文件上的写冲突。

本父任务不承载实现，只负责：源需求集、子任务映射、跨子任务验收、串行约束与全局决策记录。

> 说明：用户原始需求中的「工作台 Tab 脏守卫」（原第 5 项）已移出本父任务范围，交由 GPT/Codex 单独执行，相关任务与文档已删除。

## 源需求（用户原文归纳）

1. 最小列宽限制放宽，允许设置更小的列宽。
2. OID 只允许由字母、数字、`-`、`_`、`.` 组成。
3. 表单界面（VisitsTab）与表单设计界面（FormDesignerTab）的 Word 预览效果差异：
   - 3.1 表格字段红色矩形位置不一致，表单界面比设计界面偏上；
   - 3.2 设计界面显示宽度比表单界面宽，并非都是 A4；
   - 3.3 红色矩形默认位置改为与单元格纵向居中对齐。
4. 表单设计界面修改字段属性后，左侧字段库不更新。

## 子任务映射

| 子任务目录 | 覆盖需求 | 主要改动面 | 复杂度 | 改 FormDesignerTab.vue |
|---|---|---|---|---|
| `07-14-column-width-min-relax` | 1 | `useColumnResize.js`（+ 可选 planner 下限 & fixture） | 中 | 否 |
| `07-14-oid-charset-validation` | 2 | 后端 schemas + 前端 `FormDesignerTab/FieldsTab/CodelistsTab` | 中 | 是 |
| `07-14-acrf-preview-geometry-parity` | 3.1/3.2/3.3 | `acrfAnnotationGeometry.js`+`export_service.py`+`main.css`+`VisitsTab.vue`+`FormDesignerTab.vue` | 高 | 是 |
| `07-14-designer-field-lib-refresh` | 4 | `FormDesignerTab.vue`（`saveFieldProp` 加 `refreshKey.value++`） | 低 | 是 |

## 全局决策（已与用户确认，2026-07-14）

- **拆分粒度**：父任务 + 4 子任务；req3 的 3.1/3.2/3.3 因同属 aCRF 几何/预览、共享同一批文件，合并为一个子任务。
- **OID 存量数据**：仅在编辑时校验拦截（前端输入 + 后端 create/update schema）。不做数据迁移、不启动扫描；存量含非法字符的记录保持不变，直到用户编辑该记录时才被要求改正。空值/未填保持可选，校验只在有值时生效。
- **aCRF 注记基线**：req3.3 改默认纵向居中后，接受基线平移、不迁移。未自定义（`annotation_positions.y=0` / 无覆盖项）的注记直接采用新居中默认；已自定义 `y` 的注记相对新基线整体平移，不写迁移脚本。

## 串行执行约束

- reqs 2 / 3 / 4 都会修改 `frontend/src/components/FormDesignerTab.vue`（项目内已知的超大共享组件，多任务并发编辑会冲突）。这些子任务的**实现阶段必须串行**，不得并行改同一文件；规划（PRD/design）阶段可并行。
- req1（`column-width-min-relax`）不改 FormDesignerTab.vue，可与其它子任务实现阶段并行。
- 建议顺序：req4（一行、低风险、快速见效）→ req2（独立校验）→ req3（几何对齐，跨栈高风险，放最后单独验证）；req1 任意时段并行插入。
- 注意：外部（GPT/Codex）并行执行的「工作台 Tab 脏守卫」同样会改 `App.vue` 与 `FormDesignerTab.vue` 的 `defineExpose`，与本父任务改 `FormDesignerTab.vue` 的子任务存在同文件冲突风险，需与外部执行协调错开写窗口。

## 跨子任务验收

- [x] 4 个子任务各自 PRD 完成并可独立验证。
- [x] 全量后端 `pytest`（695 passed / 4 xfailed）与前端 `node --test tests/*.test.js`（476 passed）通过，覆盖率不低于基线。
- [x] `FormDesignerTab.vue` 无并发写冲突（req2/req4 串行改，req3 未改该文件）。
- [x] 受影响子任务同步更新跨栈契约（列宽 width_planning 未动、aCRF 几何 §6 默认偏移 −26940、预览/导出 A4 对等）及 README / README.en / 模块 CLAUDE.md / `.claude/index.json`。

## Notes

- 复杂子任务（req2/req3）在各自目录补 `design.md` / `implement.md`；req1/req4 可 PRD 为主。
- 不主动提交；实现完成后按 `git-security.md` 走 draft → PR。
