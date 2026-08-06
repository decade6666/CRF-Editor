# 模板导入保留表单/码表/单位 OID

## Goal

修复模板库 `.db` 导入时丢失表单、选项(码表)、单位 OID 的问题：模板里的 OID 原样导入目标项目，为空才铸新，与目标项目既有 OID 冲突时按 `_IMP` 阶梯去重。

## Background / Confirmed Facts

用户反馈：**导入模板时，选项、单位和表单的 OID 没有同步导入进去**。「选项」指 UI「选项」页签（`frontend/src/App.vue:1254`）的 `CodeList` 实体；选项**内部**条目 OID（`codelist_option.code`）与字段变量名（`variable_name`）本已正确复制。

根因：`backend/src/services/import_service.py` 是仓库唯一不复制源 OID 的导入路径——三个写入点把读到的 `code` 丢弃、改用 `generate_code()` 现铸：

| 实体 | 写入点 | 现状 | 源值已在手 |
|---|---|---|---|
| 表单 | `import_service.py:797` | `code=generate_code("FORM")` | `sf.code`（快照 `:42`，裸 SQL 分支 `:609` 已含 `code`） |
| 单位 | `import_service.py:876` | `code=generate_code("UNIT")` | `src_unit.code` |
| 选项(码表) | `import_service.py:925` | `code=generate_code("CL")` | `src_cl.code` |

对照组：`project_clone_service.py`（`:230/241/252/262/303/341`）逐字复制全部 OID；各 router（`units.py:57-63`、`codelists.py:63-66`、`forms.py:95-99`）`if not dump.get("code")` 有则留无则铸。

**关键约束**：`Form`/`CodeList`/`Unit` 均有 `UniqueConstraint("project_id","code")`。裸改三行会让「同一模板重复导入同一项目」在 `s.flush()` 抛 `IntegrityError`，被 `routers/import_template.py:212-214` 的 `except Exception` 吞成 500。去重必须**前置**（`_IMP` 阶梯），不能靠异常兜底。

## Requirements

1. 模板表单/码表/单位的非空 OID 原样复制进目标项目（strip 首尾空白后）。
2. 源 OID 为空/纯空白 → 按仓库约定 `generate_code(prefix)` 铸新。
3. 与目标项目内既有 OID 冲突 → `base_IMP` → `base_IMP2` → … 阶梯去重（批内边写边加）。
4. 码表/单位的**复用分支**（symbol 命中 / 名称+选项签名一致）不得覆盖目标项目已有 OID。
5. 表单 code 去重与 `_导入` 改名相互独立：被改名的表单仍优先取源 OID。
6. 冲突去重可观测（`logger.info`），不扩展 summary/API/前端。

## Acceptance Criteria

- [ ] 模板导入后目标项目中表单/码表/单位的 `code` 等于模板源值（非空时）。
- [ ] 源 OID 为空时导入成功且 code 为 `FORM_`/`CL_`/`UNIT_` 前缀的新铸值。
- [ ] OID 冲突时得到 `_IMP` / `_IMP2` 后缀且不抛 `IntegrityError`。
- [ ] 同一模板向同一项目重复导入不抛错、不 500。
- [ ] 复用分支下目标项目已有 OID 保持不变。
- [ ] 后端全量测试通过（基线 729 passed / 4 xfailed → 新增约 13 例）。
- [ ] 文档同步：根/后端 `CLAUDE.md` changelog、`.trellis/spec/backend/database-guidelines.md` OID copy contract 小节。

## Out of Scope

- 不做 OID 字符集校验（与 clone/project import 一致，校验仅编辑边界生效）。
- 不新增迁移；存量已导入项目保留既有生成码。
- 前端零改动、无 API 形状变化。
