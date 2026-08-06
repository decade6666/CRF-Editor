# 实施：模板导入 OID 保留

## 有序清单

1. **RED**：`backend/tests/test_import_service.py` fixture 扩展（向后兼容默认值）+ 新增约 13 例（见下），运行确认失败。
2. **GREEN**：`import_service.py` 新增 `_make_unique_code` + `_resolve_import_code`（`:512` 后）。
3. 缓存重构（`:663-677`）补 `existing_form_codes` / `existing_unit_codes` / `existing_codelist_codes`。
4. `_merge_units` / `_merge_codelists` 加 keyword-only `existing_codes`，两写入点 resolve→add→赋值；调用点传入。
5. 表单循环（`:785-802`）插 code 解析（try/except 之后），替换 `:797` 的 `generate_code("FORM")`。
6. 冲突去重分支加 `logger.info`。
7. 全量验证 + 文档同步（根/后端 CLAUDE.md changelog、`.trellis/spec/backend/database-guidelines.md`）。
8. 提交 → 推送分支 → 开 PR（CI 自动合并，不手动 merge）。

## 测试用例（backend/tests/test_import_service.py）

fixture 扩展：`create_form(..., code=None)`；`build_template_db(..., form_code=None, unit_code="ZHI", codelist_code="CL_SEX")`。

| 用例 | 断言 |
|---|---|
| `test_import_forms_preserves_source_form_codelist_and_unit_oids` | 空目标，三 OID 全等于源（bug 本体） |
| `test_import_forms_mints_oid_when_source_is_empty` | 参数化 None/""/"   " → FORM_/UNIT_/CL_ 前缀 |
| `test_import_forms_suffixes_form_code_when_target_already_uses_it` | DM → DM_IMP，存量行不变 |
| `test_import_forms_suffixes_unit_code_when_symbol_differs_but_code_collides` | 新建单位 code 走 _IMP |
| `test_import_forms_suffixes_codelist_code_when_target_code_collides` | 新建码表 code 走 _IMP |
| `test_import_forms_keeps_reused_unit_code_untouched` | 复用分支不覆盖 |
| `test_import_forms_keeps_reused_codelist_code_untouched` | 复用分支不覆盖（对标 :689） |
| `test_import_forms_renamed_form_keeps_source_code_when_code_is_free` | 名字_导入 + code 保留 |
| `test_import_forms_twice_into_same_project_suffixes_form_oid` | 重复导入无 IntegrityError |
| `test_import_forms_preserves_non_ascii_source_oid_without_charset_validation` | 锁定不做校验 |
| `test_import_forms_strips_surrounding_whitespace_from_source_oid` | 锁定 strip |
| `test_import_forms_dedupes_intra_batch_unit_codes_across_source_projects` | 跨源项目批内去重（fixture 过繁可弃，纯函数兜底） |
| `test_resolve_import_code_ladder` | 纯静态方法三分支 |

## 验证命令

```bash
cd backend
python3 -m pytest tests/test_import_service.py -q
python3 -m pytest tests/test_import_service.py tests/test_project_import.py tests/test_project_copy.py tests/test_oid_validation.py -q
python3 -m pytest -q        # 基线 729 passed / 4 xfailed
```

## 回滚点

- 每步改动可独立 revert；步骤 3-5 共一个提交可整体回退。
- 文档同步为独立提交，不影响代码回滚。
