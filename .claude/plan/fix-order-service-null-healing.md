# 计划：OrderService NULL 自愈 + 前端索引优化

> **生成时间**：2026-03-16
> **分支**：draft
> **产出类型**：📄 计划（需用户确认后方可执行）

---

## 问题概览

| 级别 | ID | 问题 | 影响 |
|------|-----|------|------|
| 🔴 Critical | C1 | `delete_and_compact()` 在调用 `_ensure_initialized()` 之前读取 `record.order_index`，若该值为 NULL 则导致 SQLAlchemy `ArgumentError` | 删除任意 order_index 为 NULL 的字典/选项时 500 崩溃 |
| 🟠 Major | M1 | `get_next_order()` 未调用 `_ensure_initialized()`，向 NULL 脏数据场景追加新记录时序号不连续 | 批量导入后追加记录时序号错乱 |
| 🟠 Major | M2 | `OrderService` 完全没有回归测试 | 任何改动均无安全网 |
| 🟡 Minor | m1 | ORM relationship 裸字符串 `order_by="CodeListOption.order_index"` 无 `nullslast()` | NULL 记录排序位置不确定（SQLite 默认 NULLS FIRST） |
| 🟡 Minor | m2 | Pydantic schemas `order_index` 缺 `ge=1`；`ValueError` 无 HTTP 映射（返回 500） | 非法序号无友好报错 |
| 🟡 Minor | m3 | `updateOptOrder`/`updateClOrder` 用 O(N) `.indexOf()` 作 NULL fallback | 列表长时性能退化（低优先级） |
| 💙 Suggest | S1 | 模板已有 `$index`/`index`，可直接传入 handler 消除 `.indexOf()` | 前端代码简化 |

---

## 实施计划

### Step 1 — 🔴 C1：修复 `delete_and_compact()` NULL 安全问题

**文件**：`backend/src/services/order_service.py`
**位置**：L200–230，`delete_and_compact` 方法

**问题代码**：
```python
@staticmethod
def delete_and_compact(session, model_class, scope_filter, record):
    old_position = record.order_index   # ← 若 NULL，下方 WHERE > NULL 会报 ArgumentError
    session.delete(record)
    session.flush()
    session.execute(
        update(model_class)
        .where(scope_filter)
        .where(model_class.order_index > old_position)  # ← NULL 比较炸裂
        ...
    )
```

**修复方案**：在读取 `old_position` 前，先调用 `_ensure_initialized()` 完成自愈：

```python
@staticmethod
def delete_and_compact(session, model_class, scope_filter, record):
    # 先自愈，确保 record.order_index 已被赋值（不为 NULL）
    OrderService._ensure_initialized(session, model_class, scope_filter)
    # session.refresh(record) 不需要，ORM identity map 自动反映更新
    old_position = record.order_index   # 现在一定有值

    session.delete(record)
    session.flush()

    # 后续位移逻辑不变
    session.execute(
        update(model_class)
        .where(scope_filter)
        .where(model_class.order_index > old_position)
        .values(order_index=model_class.order_index - OrderService.SAFE_OFFSET)
    )
    session.flush()
    session.execute(
        update(model_class)
        .where(scope_filter)
        .where(model_class.order_index < 0)
        .values(order_index=model_class.order_index + OrderService.SAFE_OFFSET - 1)
    )
```

**注意**：`_ensure_initialized()` 在 session 内直接修改 ORM 对象（Python 内存中），无需 `session.refresh(record)`，ORM identity map 自动同步。

---

### Step 2 — 🟠 M1：修复 `get_next_order()` 不自愈问题

**文件**：`backend/src/services/order_service.py`
**位置**：L73–86，`get_next_order` 方法

**问题代码**：
```python
@staticmethod
def get_next_order(session, model_class, scope_filter) -> int:
    max_order = session.query(func.max(model_class.order_index)).filter(scope_filter).scalar()
    return (max_order or 0) + 1   # ← max() 在全 NULL 场景返回 None，留下脏数据
```

**修复方案**：

```python
@staticmethod
def get_next_order(session, model_class, scope_filter) -> int:
    # 保证 NULL 数据被回填，再取 max
    max_order = OrderService._ensure_initialized(session, model_class, scope_filter)
    return max_order + 1
```

`_ensure_initialized()` 已返回修复后的 `max_order`（int），复用其返回值，减少一次额外查询。

---

### Step 3 — 🟡 m1：ORM relationship 添加 `nullslast()`

**文件**：`backend/src/models/codelist.py`

**问题代码**（裸字符串 `order_by` 无法用 `nullslast()`）：
```python
options: Mapped[List["CodeListOption"]] = relationship(
    back_populates="codelist",
    cascade="all, delete-orphan",
    order_by="CodeListOption.order_index"   # ← 无 nullslast()
)
```

**修复方案**（改为 lambda 延迟引用，使用列表达式）：
```python
from sqlalchemy import nullslast

options: Mapped[List["CodeListOption"]] = relationship(
    back_populates="codelist",
    cascade="all, delete-orphan",
    order_by=lambda: nullslast(CodeListOption.order_index.asc())
)
```

> **SQLite 兼容性说明**：SQLAlchemy 的 `nullslast()` 在 SQLite 上会转换为 `CASE WHEN order_index IS NULL THEN 1 ELSE 0 END, order_index`，完全兼容。但需注意：若此 relationship 在整个应用中已经被加载到 identity map，改动后重启服务才生效。

**备选方案（保守）**：不改 relationship，在 `list_codelists()` router 中继续使用已有的 Python 层排序（当前 L42–43 已有 `sorted(..., key=...)`），仅补充文档注释即可。**推荐先用备选方案，风险最低。**

---

### Step 4 — 🟡 m2：Pydantic schemas 添加 `ge=1` + `ValueError` → 400 映射

#### 4a：schemas 添加约束

**文件**：`backend/src/schemas/codelist.py`

```python
from pydantic import BaseModel, Field
from typing import Optional

class CodeListCreate(BaseModel):
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    order_index: Optional[int] = Field(None, ge=1)   # ← 新增

class CodeListUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    order_index: Optional[int] = Field(None, ge=1)   # ← 新增

class CodeListOptionCreate(BaseModel):
    code: Optional[str] = None
    decode: str
    trailing_underscore: int = 0
    order_index: Optional[int] = Field(None, ge=1)   # ← 新增

class CodeListOptionUpdate(BaseModel):
    code: Optional[str] = None
    decode: Optional[str] = None
    trailing_underscore: Optional[int] = None
    order_index: Optional[int] = Field(None, ge=1)   # ← 新增
```

#### 4b：`ValueError` → HTTP 400 全局映射

**文件**：`backend/main.py`

在已有的 `@app.exception_handler(RequestValidationError)` 之后添加：

```python
from fastapi.responses import JSONResponse

@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    """将 OrderService 抛出的 ValueError（非法序号）转换为 400"""
    return JSONResponse(status_code=400, content={"detail": str(exc)})
```

> **风险**：`ValueError` 是 Python 内置异常，此 handler 会捕获所有未被其他 handler 处理的 `ValueError`。消息直接暴露给客户端，确保 `OrderService.raise ValueError(...)` 的消息不含敏感信息（当前消息如 `"Invalid position 5, valid range: [1, 3]"` 均无敏感内容，安全）。

---

### Step 5 — 🟠 M2：编写 `OrderService` 回归测试

**文件**（新建）：`backend/tests/test_order_service.py`

测试矩阵（优先级顺序）：

| 测试名 | 场景 | 核心断言 |
|-------|------|---------|
| `test_delete_compact_null_order` | 全 NULL 场景删除第一条 | 不抛异常；剩余 order_index = [1,2] |
| `test_delete_compact_partial_null` | 部分 NULL 场景删除有序记录 | 不抛异常；序号连续 |
| `test_get_next_order_all_null` | 全 NULL 场景追加 | 返回正确序号；旧记录被回填 |
| `test_get_next_order_partial_null` | 部分 NULL 追加 | NULL 记录被补齐 |
| `test_insert_at_null_scope` | 全 NULL 场景在位置 1 插入 | 不抛异常；序号正确 |
| `test_move_to_null_scope` | 全 NULL 场景移动 | 不抛异常；序号正确 |
| `test_compact_after_batch_delete` | 批量删除后压缩 | 序号紧凑 1..n |
| `test_reorder_batch_validates_ids` | 非法 ID 集合 | 抛 ValueError |

**伪代码骨架**：

```python
# backend/tests/test_order_service.py
import pytest
from sqlalchemy import create_engine, Column, Integer, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, Session

from src.services.order_service import OrderService


class Base(DeclarativeBase): pass

class FakeItem(Base):
    __tablename__ = "fake_item"
    __table_args__ = (UniqueConstraint("scope_id", "order_index"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scope_id: Mapped[int] = mapped_column(Integer)
    order_index: Mapped[int | None] = mapped_column(Integer, nullable=True)


@pytest.fixture
def session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


def make_items(session, scope_id, order_indices):
    """创建测试数据，order_index 按参数设置（None 表示 NULL）"""
    items = [FakeItem(scope_id=scope_id, order_index=oi) for oi in order_indices]
    session.add_all(items)
    session.flush()
    return items


SCOPE = lambda scope_id: FakeItem.scope_id == scope_id


def test_delete_compact_null_order(session):
    """C1 修复验证：全 NULL 场景删除不崩溃"""
    items = make_items(session, 1, [None, None, None])
    # 删除第一条（NULL order_index）
    OrderService.delete_and_compact(session, FakeItem, SCOPE(1), items[0])
    session.flush()
    remaining = session.query(FakeItem).filter(SCOPE(1)).order_by(FakeItem.order_index).all()
    assert len(remaining) == 2
    assert [r.order_index for r in remaining] == [1, 2]


def test_get_next_order_all_null(session):
    """M1 修复验证：全 NULL 场景 get_next_order 返回正确值并回填"""
    make_items(session, 2, [None, None])
    next_order = OrderService.get_next_order(session, FakeItem, SCOPE(2))
    assert next_order == 3  # 2 条回填为 1,2，下一个应为 3
    # 验证旧记录已被回填
    items = session.query(FakeItem).filter(SCOPE(2)).order_by(FakeItem.order_index).all()
    assert [i.order_index for i in items] == [1, 2]


# ... 其余 6 个测试按矩阵补充 ...
```

---

### Step 6 — 🟡 m3 + 💙 S1：前端消除 `.indexOf()` O(N) 查找

**文件**：`frontend/src/components/CodelistsTab.vue`

#### 6a：模板层（改动极小）

codelist 表格（L226–236）：
```html
<!-- 旧：@change 未传 index -->
<template #default="{ row, $index }">
  <el-input-number
    :model-value="row.order_index ?? ($index + 1)"
    @change="v => updateClOrder(row, v)"
  />
</template>

<!-- 新：传入 $index + 1 作为 fallback -->
<template #default="{ row, $index }">
  <el-input-number
    :model-value="row.order_index ?? ($index + 1)"
    @change="v => updateClOrder(row, v, $index + 1)"
  />
</template>
```

options 拖拽列表（L270–274）：
```html
<!-- 旧：@change 未传 index -->
<template #item="{ element, index }">
  <el-input-number
    :model-value="element.order_index ?? (index + 1)"
    @change="v => updateOptOrder(element, v)"
  />
</template>

<!-- 新：传入 index + 1 作为 fallback -->
<template #item="{ element, index }">
  <el-input-number
    :model-value="element.order_index ?? (index + 1)"
    @change="v => updateOptOrder(element, v, index + 1)"
  />
</template>
```

#### 6b：script 层

```javascript
// 旧
async function updateOptOrder(element, newValue) {
  const currentOrder = element.order_index ?? (selected.value.options.indexOf(element) + 1)
  ...
}

// 新（增加 fallbackIndex 参数）
async function updateOptOrder(element, newValue, fallbackIndex = null) {
  const currentOrder = element.order_index ?? fallbackIndex
  if (newValue == null || newValue === currentOrder) return
  try {
    await api.put(`/api/projects/${currentProjectId.value}/codelists/${selected.value.id}/options/${element.id}`, {
      code: element.code,
      decode: element.decode,
      trailing_underscore: element.trailing_underscore,
      order_index: newValue
    })
    const id = selected.value.id
    await reload()
    selected.value = codelists.value.find(c => c.id === id) || null
  } catch (e) { ElMessage.error(e.message) }
}

// 旧
async function updateClOrder(element, newValue) {
  const currentOrder = element.order_index ?? (codelists.value.indexOf(element) + 1)
  ...
}

// 新
async function updateClOrder(element, newValue, fallbackIndex = null) {
  const currentOrder = element.order_index ?? fallbackIndex
  if (newValue == null || newValue === currentOrder) return
  try {
    await api.put(`/api/projects/${currentProjectId.value}/codelists/${element.id}`, {
      name: element.name,
      code: element.code,
      description: element.description,
      order_index: newValue
    })
    await reload()
  } catch (e) { ElMessage.error(e.message) }
}
```

---

## 文件改动表

| 文件 | 改动类型 | Steps | 风险 |
|------|---------|-------|------|
| `backend/src/services/order_service.py` | 修改 2 处方法 | 1, 2 | 🔴 核心逻辑，需测试保护 |
| `backend/src/models/codelist.py` | 修改 relationship | 3 | 🟡 低（或跳过用备选方案） |
| `backend/src/schemas/codelist.py` | 添加 Field(ge=1) | 4a | 🟢 安全，加约束不破坏旧数据 |
| `backend/main.py` | 添加 ValueError handler | 4b | 🟡 全局 handler，注意消息内容 |
| `backend/tests/test_order_service.py` | 新建测试文件 | 5 | 🟢 只读代码逻辑 |
| `frontend/src/components/CodelistsTab.vue` | 修改 2 函数 + 2 模板行 | 6 | 🟢 行为等价，只消除 indexOf |

---

## 执行顺序约束

```
Step 5（写测试）→ Step 1（C1 修复）→ Step 2（M1 修复）
                              ↓ 验证测试通过
Step 4a（schemas）→ Step 4b（ValueError handler）
Step 3（ORM nullslast，可选）
Step 6（前端，独立）
```

> **TDD 原则**：先写测试（RED），再修复（GREEN），验证测试通过。

---

## 风险与回滚

| 风险 | 概率 | 缓解措施 |
|------|------|---------|
| `_ensure_initialized` 在 delete 前修改 `record.order_index`，导致其他字段被意外刷新 | 低 | 仅操作 `order_index` 字段；ORM flush 是 SQL 级别，不会影响非脏字段 |
| `ValueError` 全局 handler 误捕获其他 ValueError | 中 | 检查现有 codebase 中的 `raise ValueError`，确认消息均无敏感信息 |
| ORM relationship `order_by=lambda` 在旧版 SQLAlchemy 不支持 | 低 | 确认版本 >= 1.4；若不支持，使用备选方案（Python 层排序） |
| 前端 `fallbackIndex=null` 时行为退化 | 低 | 模板总是传入 `$index+1`/`index+1`，null 仅在直接调用时触发 |

---

## 验收标准

- [ ] 所有 `test_order_service.py` 测试通过（含 C1/M1 场景）
- [ ] 现有测试（`test_utils.py` 等）不被破坏
- [ ] API：`DELETE /codelists/{id}` 在 NULL order_index 场景下返回 204，不崩溃
- [ ] API：`POST /codelists` 传 `order_index: 0` 返回 422（ge=1 约束触发）
- [ ] API：`PUT /codelists/{id}` 传越界 order_index 返回 400（ValueError → handler）
- [ ] 前端：拖拽后直接修改序号，行为与之前一致

---

*计划由 ccg:plan 生成 — 请确认后执行 `/ccg:execute` 或口头说「执行」*
