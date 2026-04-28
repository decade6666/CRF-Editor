# Plan: 表单设计备注文本框

## 执行顺序

> 严格按依赖关系排序。后端必须先于前端完成，因为前端需要 `design_notes` 在 API 响应中存在。

---

## Phase 1：后端（顺序执行）

### Task 1.1 — ORM 模型新增字段
**文件**：`backend/src/models/form.py`

在 `Form` 类中已有字段之后添加：
```python
from sqlalchemy import Text

design_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
```

**验证**：`python -c "from src.models.form import Form; print(Form.design_notes)"` 不报错

---

### Task 1.2 — Pydantic Schema 更新
**文件**：`backend/src/schemas/form.py`

- `FormUpdate` 新增：`design_notes: Optional[str] = None`
- `FormResponse` 新增：`design_notes: Optional[str] = None`
- `FormCreate` **不需要**（创建时备注为空）

**验证**：`FormResponse.model_fields` 包含 `design_notes`

---

### Task 1.3 — 数据库迁移函数
**文件**：`backend/src/database.py`

在 `_migrate_add_order_index()` 之后，`init_db()` 之前，添加：

```python
def _migrate_add_design_notes(engine):
    """给 form 表补上 design_notes 列"""
    insp = inspect(engine)
    if not insp.has_table("form"):
        return
    with engine.begin() as conn:
        cols = [c["name"] for c in insp.get_columns("form")]
        if "design_notes" not in cols:
            conn.execute(text('ALTER TABLE "form" ADD COLUMN design_notes TEXT'))
```

在 `init_db()` 中添加调用：
```python
def init_db():
    engine = get_engine()
    Base.metadata.create_all(engine)
    _migrate_add_code_columns(engine)
    _migrate_add_trailing_underscore(engine)
    _migrate_add_order_index(engine)
    _migrate_add_design_notes(engine)   # ← 新增
```

**验证**：启动后端，检查 DB `form` 表结构有 `design_notes` 列

---

### Task 1.4 — copy_form 路由更新
**文件**：`backend/src/routers/forms.py`

在 `copy_form()` 函数中（约第 137 行），`Form(...)` 构造处补充 `design_notes`：

```python
new_form = Form(
    project_id=src.project_id,
    name=candidate,
    code=generate_code("FORM"),
    domain=src.domain,
    design_notes=src.design_notes,   # ← 新增
)
```

**验证**：调用 `POST /forms/{id}/copy`，返回的 `design_notes` 与原表单一致

---

## Phase 2：前端（顺序执行）

### Task 2.1 — 新增 reactive state 与 debounce 逻辑
**文件**：`frontend/src/components/FormDesignerTab.vue`

在 `<script setup>` 中，找到现有 resize 相关变量（约第 354-377 行），在其下方添加：

```javascript
// ───────────────── 表单设计备注 ─────────────────
const notesHeight = ref(parseInt(localStorage.getItem('crf_notesHeight')) || 120)
watch(notesHeight, v => localStorage.setItem('crf_notesHeight', v))

const formDesignNotes = ref('')
let notesTimer = null

// 切换表单时加载备注，并清除未发出的 debounce
watch(selectedForm, (form) => {
  clearTimeout(notesTimer)
  formDesignNotes.value = form?.design_notes || ''
})

async function saveDesignNotes() {
  if (!selectedForm.value) return
  try {
    await api.put(`/api/forms/${selectedForm.value.id}`, { design_notes: formDesignNotes.value })
    api.invalidateCache(`/api/projects/${props.projectId}/forms`)
  } catch (e) {
    console.error('备注保存失败', e)
  }
}

function onNotesInput() {
  clearTimeout(notesTimer)
  notesTimer = setTimeout(saveDesignNotes, 500)
}
// ──────────────────────────────────────────────
```

---

### Task 2.2 — 模板插入备注区块
**文件**：`frontend/src/components/FormDesignerTab.vue`

在属性面板 `<div>`（`flexDirection:column`）内，紧跟所有 `v-if/v-else-if/v-else` 属性区块之后（约第 788 行，在属性面板的 `</div>` 之前），插入：

```vue
<!-- 表单设计备注 -->
<div style="padding: 8px; border-top: 1px solid var(--color-border); flex-shrink: 0;">
  <div style="font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 4px;">表单设计备注</div>
  <el-input
    v-model="formDesignNotes"
    type="textarea"
    :autosize="false"
    :style="{ height: notesHeight + 'px', resize: 'vertical' }"
    placeholder="在此记录表单设计说明、注意事项…"
    @input="onNotesInput"
  />
</div>
```

**实现 height resize 持久化**（在 `<el-input>` 元素上监听 mouseup）：

由于 CSS `resize` 是原生浏览器行为，无法直接 watch。改用 `@mouseup` 读取元素 `offsetHeight`：

```vue
<el-input
  ref="notesInputRef"
  v-model="formDesignNotes"
  type="textarea"
  :autosize="false"
  :style="{ height: notesHeight + 'px', resize: 'vertical' }"
  placeholder="在此记录表单设计说明、注意事项…"
  @input="onNotesInput"
  @mouseup.native="onNotesResize"
/>
```

对应 script：
```javascript
const notesInputRef = ref(null)

function onNotesResize() {
  const el = notesInputRef.value?.$el?.querySelector('textarea')
  if (el) {
    notesHeight.value = el.offsetHeight
  }
}
```

> **注意**：Element Plus el-input 的 `.native` modifier 在 Vue 3 中失效，改用 `@mouseup`（事件会冒泡）并在父 `<div>` 上监听：

```vue
<div
  style="padding: 8px; border-top: 1px solid var(--color-border); flex-shrink: 0;"
  @mouseup="onNotesResize"
>
```

---

## Phase 3：验证

### Task 3.1 — 后端集成测试
```bash
cd backend
pytest tests/ -k "form" -v
```

验证点：
- `PUT /forms/{id}` 接受 `design_notes` 并持久化
- `GET /projects/{project_id}/forms` 返回 `design_notes` 字段
- `POST /forms/{id}/copy` 新表单 `design_notes` == 原表单 `design_notes`

### Task 3.2 — 前端手动验证（依赖 V1-V8 判据）

见 `spec.md` 可验证成功判据章节。

---

## 风险登记

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| 旧 DB 未迁移导致启动报错 | 🟡 Medium | `_migrate_add_design_notes()` 已做 inspect 检查，安全幂等 |
| 快速切换表单时备注覆盖 | 🟡 Medium | `watch(selectedForm)` 中 `clearTimeout(notesTimer)` 清除 debounce |
| CSS `resize` 最终高度未保存 | 🟢 Low | `@mouseup` on parent div 捕获拖拽结束 |
| el-input type=textarea 的 resize 样式被 Element Plus 覆盖 | 🟢 Low | 需检查 CSS 优先级，必要时加 `!important` 或 `:deep()` |

---

## 实施检查清单

- [x] Task 1.1: `Form.design_notes` 字段已添加
- [x] Task 1.2: `FormUpdate` + `FormResponse` 已更新
- [x] Task 1.3: `_migrate_add_design_notes()` 已注册
- [x] Task 1.4: `copy_form` 已复制 `design_notes`（附带修复 `session.commit()` → `session.flush()` 事务冲突）
- [x] Task 2.1: reactive state + debounce 逻辑已添加
- [x] Task 2.2: 模板备注区块已插入
- [x] Task 3.1: 后端测试通过（6/6 全部通过）
- [ ] Task 3.2: 前端手动验证通过（V1-V8）（待用户手动验证）
