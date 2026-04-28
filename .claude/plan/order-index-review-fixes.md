# OrderService 全量修复计划

> **来源**：多模型代码评审（10 项发现）
> **生成于**：2026-03-16
> **适用 Skill**：`/ccg:codex-exec`
> **⚠️ 产出类型**：📄 计划（PLAN_ONLY）— 未经用户授权不得执行

---

## 问题清单（优先级排序）

| # | ID | 严重级 | 文件 | 摘要 |
|---|----|--------|------|------|
| 1 | C1 | 🔴 Critical | `order_service.py` | `delete_and_compact()` 缺 `_ensure_initialized()`，NULL 数据必 500 |
| 2 | M1 | 🟠 Major | `order_service.py` | `get_next_order()` 缺 `_ensure_initialized()`，留存 NULL 永不自愈 |
| 3 | M2 | 🟠 Major | `tests/` (新建) | 缺少 OrderService NULL 路径回归测试 |
| 4 | m1 | 🟡 Minor | `models/codelist.py` | 关系层 `order_by` 缺 NULLS LAST |
| 5 | m2a | 🟡 Minor | `schemas/codelist.py` | `order_index` 字段缺 `ge=1` 验证 |
| 6 | m2b | 🟡 Minor | `main.py` | `ValueError` 未映射到 HTTP 4xx |
| 7 | m3 | 🟡 Minor | `CodelistsTab.vue` | `indexOf()` O(N) 查找可用 slot index 替代 |
| 8 | S1 | 💙 建议 | `CodelistsTab.vue` | 透传 slot `$index`/`index` 消除 indexOf |
| 9 | S2 | 💙 建议 | `order_service.py` | `_ensure_initialized()` 合并 3 次查询为 1 次 |

---

## Step 1 — 修复 C1：`delete_and_compact()` 补 `_ensure_initialized()`

**文件**：`backend/src/services/order_service.py`
**行号**：L200-229
**影响范围**：所有调用方自动覆盖（codelists/fields/forms/units 路由层无需改动）

### 修改方式

在 `delete_and_compact()` 方法体**最开始**，`old_position = record.order_index` 之前，添加一行 `_ensure_initialized()` 调用，并重新从已初始化对象读取 `order_index`。

**修改前**（L200-214）：
```python
@staticmethod
def delete_and_compact(session: Session, model_class, scope_filter, record):
    old_position = record.order_index

    # 1. 删除记录
    session.delete(record)
    session.flush()
```

**修改后**：
```python
@staticmethod
def delete_and_compact(session: Session, model_class, scope_filter, record):
    # 先自愈历史 NULL 数据，确保 record.order_index 已被初始化
    OrderService._ensure_initialized(session, model_class, scope_filter)
    # session.flush() 已在 _ensure_initialized 内部执行，record 已更新
    old_position = record.order_index

    # 1. 删除记录
    session.delete(record)
    session.flush()
```

**注意**：`_ensure_initialized()` 内部包含 `session.flush()`，调用后 `record.order_index` 已被 SQLAlchemy identity map 同步为真实值，无需额外刷新。

### 验证标准
- 对 `order_index` 全为 NULL 的作用域执行删除 → 不抛 500，正常返回 204
- 对 `order_index` 部分为 NULL 的作用域执行删除 → 不抛 500，剩余记录序号连续

---

## Step 2 — 修复 M1：`get_next_order()` 补 `_ensure_initialized()`

**文件**：`backend/src/services/order_service.py`
**行号**：L73-86
**影响范围**：所有调用方自动覆盖（codelists/fields/forms/units/docx_import_service 无需改动）

### 修改方式

在返回值计算前，调用 `_ensure_initialized()`，然后重新查询 `max_order`。

**修改前**（L73-86）：
```python
@staticmethod
def get_next_order(session: Session, model_class, scope_filter) -> int:
    max_order = session.query(func.max(model_class.order_index)).filter(scope_filter).scalar()
    return (max_order or 0) + 1
```

**修改后**：
```python
@staticmethod
def get_next_order(session: Session, model_class, scope_filter) -> int:
    # 先自愈历史 NULL 数据，确保 max_order 基于完整序号计算
    max_order = OrderService._ensure_initialized(session, model_class, scope_filter)
    return max_order + 1
```

**说明**：`_ensure_initialized()` 已返回当前作用域的 `max_order`（int），直接复用，省去第二次 `MAX()` 查询，同时满足 S2 建议（减少查询次数）。

### 验证标准
- 作用域内存在 NULL `order_index` 时新建记录 → `order_index` 为 `max_existing + 1`
- 干净数据不触发 NULL 修复分支（通过查询日志确认无多余 flush）

---

## Step 3 — 修复 m1：`CodeList.options` 关系层 NULLS LAST

**文件**：`backend/src/models/codelist.py`
**行号**：L34-40（relationship 定义）

### 修改方式

将 `order_by` 从字符串形式改为带 `.nullslast()` 的 SQLAlchemy 表达式。

**修改前**（L34-40）：
```python
options: Mapped[List["CodeListOption"]] = relationship(
    back_populates="codelist",
    cascade="all, delete-orphan",
    order_by="CodeListOption.order_index"
)
```

**修改后**：
```python
from sqlalchemy import asc, nullslast  # 在文件顶部导入（如已有则跳过）

options: Mapped[List["CodeListOption"]] = relationship(
    back_populates="codelist",
    cascade="all, delete-orphan",
    order_by=lambda: nullslast(asc(CodeListOption.order_index))
)
```

**备选方案**（若 lambda 与 declarative 映射有兼容问题）：
```python
# 在 CodeListOption 类下方，CodeList 关系定义之后，添加 mapper 级别 order_by
# 或者直接在查询层已有 sorted() 补偿，关系层改用 primaryjoin 明确指定
```

**⚠️ 注意**：SQLAlchemy 的 `relationship(order_by=)` 对 lambda 支持依赖版本，建议先测试。
若遇到兼容问题，降级方案为：保持当前字符串形式，确保**所有查询层**（路由/服务）统一使用 `.nullslast()` 排序，`list_codelists()` 已有此处理（L38）；关系层排序不保证用于直接访问 `cl.options` 的场景。

### 验证标准
- 直接访问 `some_codelist.options` → NULL `order_index` 的选项排在末尾，不排在首位

---

## Step 4 — 修复 m2a：Schema `order_index` 添加 `ge=1` 验证

**文件**：`backend/src/schemas/codelist.py`
**行号**：L10, L17, L35, L42

### 修改方式

为 4 个 schema 中的 `order_index` 字段添加 Pydantic v2 的 `ge=1` 约束。

**需修改的 4 处**（全部相同模式）：

```python
# 修改前：
order_index: Optional[int] = None

# 修改后（4处全改）：
from pydantic import Field  # 顶部导入（如已有则跳过）
order_index: Optional[int] = Field(default=None, ge=1)
```

**涉及的 4 个字段位置**：
- `CodeListOptionCreate.order_index`（L10）
- `CodeListOptionUpdate.order_index`（L17）
- `CodeListCreate.order_index`（L35）
- `CodeListUpdate.order_index`（L42）

### 验证标准
- `POST /codelists` with `{"order_index": 0}` → 返回 422
- `POST /codelists` with `{"order_index": -5}` → 返回 422
- `POST /codelists` with `{"order_index": 1}` → 正常创建

---

## Step 5 — 修复 m2b：`main.py` 添加 `ValueError` → HTTP 400 映射

**文件**：`backend/main.py`
**位置**：在现有 `@app.exception_handler(IntegrityError)` 之后（约 L97 后），`@app.on_event("startup")` 之前

### 修改方式

添加新的 `exception_handler`：

```python
@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    """将 OrderService 的位置越界 ValueError 转换为可读的 400 错误"""
    return JSONResponse(status_code=400, content={"detail": str(exc)})
```

**导入检查**：`Request` 和 `JSONResponse` 已在 L5-6 导入，无需新增。

### 验证标准
- `PUT /codelists/{id}` with `{"order_index": 99999}` → 返回 400（原来会 500）
- 错误消息包含 `Invalid position` 等可读文本

---

## Step 6 — 修复 m3 + S1：前端消除 `indexOf` O(N) 查找

**文件**：`frontend/src/components/CodelistsTab.vue`
**行号**：L183-210（`updateOptOrder` 和 `updateClOrder`），L229, L274（template 调用点）

### 当前代码（有问题）

```javascript
// L183-193: updateOptOrder
async function updateOptOrder(element, newValue) {
  const currentOrder = element.order_index ?? (selected.value.options.indexOf(element) + 1)
  // ...
}

// L195-210: updateClOrder
async function updateClOrder(element, newValue) {
  const currentOrder = element.order_index ?? (codelists.value.indexOf(element) + 1)
  // ...
}
```

```html
<!-- L274: 选项排序触发 -->
@change="v => updateOptOrder(element, v)"

<!-- L229: 字典排序触发 -->
@change="v => updateClOrder(row, v)"
```

### 修改方式

**Step 6.1** — 修改函数签名，接收 `index` 参数（S1 建议）：

```javascript
// updateOptOrder 新签名（接收可选的 slotIndex）
async function updateOptOrder(element, newValue, slotIndex = null) {
  // 优先用 slotIndex（O(1)），回退到 order_index，最后才用 indexOf
  const currentOrder = slotIndex !== null
    ? slotIndex + 1
    : (element.order_index ?? (selected.value.options.indexOf(element) + 1))
  // ...其余逻辑不变
}

// updateClOrder 新签名（接收可选的 slotIndex）
async function updateClOrder(element, newValue, slotIndex = null) {
  const currentOrder = slotIndex !== null
    ? slotIndex + 1
    : (element.order_index ?? (codelists.value.indexOf(element) + 1))
  // ...其余逻辑不变
}
```

**Step 6.2** — 修改 template 调用点，透传 slot index：

```html
<!-- L274 附近（选项表格） — 修改后 -->
@change="v => updateOptOrder(element, v, $index)"

<!-- L229 附近（字典表格） — 修改后 -->
@change="v => updateClOrder(row, v, $index)"
```

**⚠️ 注意**：Element Plus `el-table` 的列 slot 中，slot prop 名为 `$index`（0-based）。确认模板是否在 `v-for` 循环 slot scope 内，准确使用 `$index` 或 `index`（取决于模板结构）。如确认无法透传，Step 6.1 的回退逻辑已保证正确性，不影响功能。

### 验证标准
- 拖拽或手动修改排序输入 → 请求 body 中的 `order_index` 为正确值
- 无 JavaScript 报错

---

## Step 7 — 新增 M2：OrderService 回归测试

**文件**：`backend/tests/test_order_service.py`（新建文件）
**框架**：pytest + SQLAlchemy in-memory SQLite

### 必须覆盖的测试场景

```python
# 测试分组清单（按场景）

class TestDeleteAndCompact:
    # 1. 干净数据：正常删除后序号连续
    def test_clean_data_delete_compacts_correctly(self)
    # 2. 全 NULL：删除前触发自愈，删除后序号连续
    def test_all_null_order_index_delete_does_not_crash(self)
    # 3. 部分 NULL：删除前触发部分自愈，删除后无间隔
    def test_partial_null_order_index_delete_heals_and_compacts(self)

class TestGetNextOrder:
    # 4. 干净数据：返回 max+1
    def test_clean_data_returns_max_plus_one(self)
    # 5. 全 NULL：自愈后返回 n+1
    def test_all_null_returns_count_plus_one(self)
    # 6. 部分 NULL：补齐后返回 max+1
    def test_partial_null_appends_after_max(self)

class TestEnsureInitialized:
    # 7. 空作用域：返回 0，不报错
    def test_empty_scope_returns_zero(self)
    # 8. 全 NULL：回填 1..n，两阶段不触发唯一约束
    def test_all_null_backfills_sequentially(self)
    # 9. 部分 NULL：仅补齐 NULL 记录，已有值不变
    def test_partial_null_only_heals_nulls(self)
    # 10. 全干净：直接返回 max，无副作用
    def test_clean_data_returns_max_without_flush(self)

class TestCompactAfterBatchDelete:
    # 11. 批量删除后序号无间隔
    def test_compact_removes_gaps(self)
```

### 测试 Fixture 参考结构

```python
import pytest
from sqlalchemy import create_engine, Column, Integer, UniqueConstraint
from sqlalchemy.orm import Session, DeclarativeBase, Mapped, mapped_column
from typing import Optional

class Base(DeclarativeBase):
    pass

class FakeModel(Base):
    __tablename__ = "fake_model"
    __table_args__ = (UniqueConstraint("scope_id", "order_index"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scope_id: Mapped[int] = mapped_column(Integer, nullable=False)
    order_index: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

@pytest.fixture
def session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as s:
        yield s
        s.rollback()
```

### 验证标准
- `pytest backend/tests/test_order_service.py -v` 全部通过
- 覆盖率：`OrderService` 核心方法 ≥ 80%

---

## 执行顺序与依赖关系

```
Step 1 (C1)  ──┐
Step 2 (M1)  ──┤── 独立，可并行执行
Step 3 (m1)  ──┤
Step 4 (m2a) ──┤
Step 5 (m2b) ──┤
Step 6 (m3)  ──┘

Step 7 (M2)  ──── 依赖 Step 1 + Step 2 完成后编写（验证修复效果）
```

**推荐执行顺序**：Step 1 → Step 2 → Step 3 → Step 4 → Step 5 → Step 6 → Step 7

---

## 文件修改清单

| 文件 | 操作 | 修改点 |
|------|------|--------|
| `backend/src/services/order_service.py` | ✏️ 修改 | L73-86 `get_next_order()`，L200-214 `delete_and_compact()` |
| `backend/src/models/codelist.py` | ✏️ 修改 | L34-40 `options` relationship `order_by` |
| `backend/src/schemas/codelist.py` | ✏️ 修改 | L10, L17, L35, L42 四处 `order_index` 字段 |
| `backend/main.py` | ✏️ 修改 | 添加 `ValueError` exception handler |
| `frontend/src/components/CodelistsTab.vue` | ✏️ 修改 | `updateOptOrder`/`updateClOrder` 签名 + template 调用点 |
| `backend/tests/test_order_service.py` | 🆕 新建 | 11 个测试用例 |

**路由层文件**（codelists/fields/forms/units/docx_import_service）：**无需修改**，服务层修复自动覆盖。

---

## 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| `_ensure_initialized()` 在 `delete_and_compact()` 中被重复调用（调用方已手动调用） | 低 | 低（幂等操作，多次执行无副作用） | 可接受 |
| Step 3 `relationship(order_by=lambda)` SQLAlchemy 兼容性 | 中 | 低（仅影响直接属性访问排序） | 见备选方案 |
| Step 6 template `$index` 变量名不匹配 | 中 | 低（回退逻辑保证正确性） | 修改前确认 slot scope 变量名 |

---

## 完成判断标准

- [ ] `pytest backend/tests/` 全部通过（含新增 11 个测试）
- [ ] `POST /api/projects/{id}/codelists` with `order_index=0` → 422
- [ ] 对存在 NULL `order_index` 的字典执行删除 → 204，无 500
- [ ] 对存在 NULL `order_index` 的字典执行新建 → 正确追加序号
- [ ] 前端排序操作无 JS 报错，请求参数正确
