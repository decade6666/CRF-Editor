# 设计：模板导入 OID 保留

## 核心方案

新增两个私有 helper（`import_service.py`，插在 `:512` 之后）：

```python
@staticmethod
def _make_unique_code(existing: set[str], base: str) -> str:
    """生成不冲突的 OID：base_IMP → base_IMP2 → ..."""

@staticmethod
def _resolve_import_code(existing_codes: set[str], source_code: Optional[str], prefix: str) -> str:
    """模板导入 OID 落库策略（表单/字典/单位共用）。
    源 OID 非空 → strip 后原样保留；为空/纯空白 → generate_code(prefix) 铸新；
    与既有 OID 冲突 → _make_unique_code 阶梯。返回值不在 existing_codes 中，调用方负责 add。
    """
```

**不复用 `_make_unique_var`**（变量名语义、调用契约不同），只复用 `_IMP` token。铸新分支 `while code in existing_codes` 兜唯一约束。

**两个取舍**（写进 changelog）：
- 不做字符集校验：与 `project_clone_service` / `project_import_service` 一致，OID 校验仅编辑边界生效（`2026-07-14` 引入）。
- strip 首尾空白：与 `normalize_optional_oid` 编辑边界行为一致，且 aCRF 导出直接打印 code，前导空格会渲染错位。

## 数据流

`_do_import`（`:662-684`）复用既有整行查询派生三个 code 集合：

```python
target_forms = s.scalars(select(Form).where(...)).all()
existing_forms = {f.name for f in target_forms}
existing_form_codes = {f.code for f in target_forms if f.code}
# units / codelists 同形；existing_field_vars 不动
```

签名变更：`_merge_units` / `_merge_codelists` 加 keyword-only `existing_codes: set[str]`；调用点 `:748-751` / `:755-758` 传入。三处写入点均 `resolve → add → 赋值`。

## 边界情况

- **批内冲突真实存在**：`:867` unit 与 `:901` codelist 查询无 `project_id` 过滤，跨源项目可合法共用 code → 必须边写边加集合。
- **复用分支不覆盖目标 OID**：`_merge_units:869-870`、`_merge_codelists:907-914` 不构造新行，结构上天然不触发写入；新测试钉死。
- **表单 code 与改名独立**：从原始 `sf.code` 解析，插在 `preserve_annotation_positions_storage` try/except 之后。
- **表单批内冲突**：模板源侧约束不保证（migrate_template_db 只 ADD COLUMN 不重建表）；集合去重覆盖。
- 源 OID 超 100 字符 + `_IMP`：SQLite 不强制长度，不加防护，备注即可。

## 明确不做

- 不扩展 `summary` / `ImportExecuteResponse` / 前端——用 `logger.info` 提供可观测性。
- 无迁移、无 API 变化、前端零改动。

## 回归面

- 最高风险：同模板重复导入（现测试无此用例，新测试补上——旧 `generate_code` 一直在静默满足这条不变式）。
- 中：缓存重构（`:663-677`）喂全部下游 merge；legacy 模板裸 SQL 分支（`:1723/:1754`）重跑。
- 低：导入后 OID 不再 `FORM_20...` 形态，aCRF 注记打印更长/CJK 源值（grep `FORM_20` 无断言，不坏）。
