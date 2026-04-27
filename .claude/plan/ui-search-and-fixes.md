# UI 改进计划：搜索框 + 按钮改名 + 分区分割线

## 需求概要

1. 在 5 个 Tab 组件顶部工具栏添加模糊搜索输入框（放在"批量删除"按钮右侧）
2. VisitsTab："预览"按钮改名为"批量编辑"（功能不变），搜索框放在其右侧
3. ProjectInfoTab：表单添加两个分区分割线

---

## Step 1: FormDesignerTab.vue — 表单搜索

**文件**：`frontend/src/components/FormDesignerTab.vue`

### 脚本变更

在 `<script setup>` 中添加：
```js
const searchForm = ref('')
const filteredForms = computed(() => {
  const kw = searchForm.value.trim().toLowerCase()
  if (!kw) return forms.value
  return forms.value.filter(item =>
    Object.values(item).some(v => String(v ?? '').toLowerCase().includes(kw))
  )
})
```

### 模板变更

1. 在 L637 "批量删除"按钮后插入搜索框：
```html
<el-input
  v-model="searchForm"
  placeholder="搜索表单..."
  clearable
  size="small"
  style="width:180px"
/>
```

2. 将 `<el-table :data="forms"` 改为 `<el-table :data="filteredForms"`

---

## Step 2: FieldsTab.vue — 字段搜索

**文件**：`frontend/src/components/FieldsTab.vue`

### 脚本变更

在 `<script setup>` 中添加 `searchField` ref，并扩展现有 `visibleFields` computed（L53）：
```js
const searchField = ref('')
const visibleFields = computed(() => {
  const kw = searchField.value.trim().toLowerCase()
  return fields.value.filter(f => {
    if (f.field_type === '日志行') return false
    if (!kw) return true
    return Object.values(f).some(v => String(v ?? '').toLowerCase().includes(kw))
  })
})
```

### 模板变更

在 L154 "批量删除"按钮后插入：
```html
<el-input
  v-model="searchField"
  placeholder="搜索字段..."
  clearable
  size="small"
  style="width:180px"
/>
```

> `<el-table :data="visibleFields"` 已存在，无需修改表格绑定。

---

## Step 3: VisitsTab.vue — 访视搜索 + 按钮改名

**文件**：`frontend/src/components/VisitsTab.vue`

### 脚本变更

添加：
```js
const searchVisit = ref('')
const filteredVisits = computed(() => {
  const kw = searchVisit.value.trim().toLowerCase()
  if (!kw) return visits.value
  return visits.value.filter(item =>
    Object.values(item).some(v => String(v ?? '').toLowerCase().includes(kw))
  )
})
```

### 模板变更

1. L168：将按钮文字 `预览` 改为 `批量编辑`（`@click` 等属性不变）
2. 在该按钮后插入搜索框：
```html
<el-input
  v-model="searchVisit"
  placeholder="搜索访视..."
  clearable
  size="small"
  style="width:180px"
/>
```
3. L170：`<el-table :data="visits"` → `<el-table :data="filteredVisits"`

---

## Step 4: CodelistsTab.vue — 选项列表搜索（双面板）

**文件**：`frontend/src/components/CodelistsTab.vue`

### 脚本变更

添加两个 ref 及两个 computed：
```js
// 左侧选项集搜索
const searchCl = ref('')
const filteredCodelists = computed(() => {
  const kw = searchCl.value.trim().toLowerCase()
  if (!kw) return codelists.value
  return codelists.value.filter(item =>
    Object.values(item).some(v => String(v ?? '').toLowerCase().includes(kw))
  )
})

// 右侧选项值搜索（用于 v-show 过滤，不破坏 draggable）
const searchOpt = ref('')
```

### 模板变更

1. **左侧面板**（L219 "批量删除"后）插入搜索框：
```html
<el-input
  v-model="searchCl"
  placeholder="搜索选项集..."
  clearable
  size="small"
  style="width:180px"
/>
```
   将 `<el-table :data="codelists"` 改为 `<el-table :data="filteredCodelists"`

2. **右侧面板**（L254 "批量删除"后）插入搜索框：
```html
<el-input
  v-model="searchOpt"
  placeholder="搜索选项..."
  clearable
  size="small"
  style="width:180px"
/>
```
   在 draggable 的 item template 最外层 `<div>` 上添加：
```html
v-show="!searchOpt.trim() || (String(item.code ?? '') + String(item.decode ?? '')).toLowerCase().includes(searchOpt.trim().toLowerCase())"
```

> 注意：右侧使用 `v-show` 而不是过滤数组，保持 draggable 拖拽功能正常。

---

## Step 5: UnitsTab.vue — 单位搜索

**文件**：`frontend/src/components/UnitsTab.vue`

### 脚本变更

添加：
```js
const searchUnit = ref('')
```

### 模板变更

1. 在 L98 "批量删除"按钮后插入：
```html
<el-input
  v-model="searchUnit"
  placeholder="搜索单位..."
  clearable
  size="small"
  style="width:180px"
/>
```

2. 在 draggable（L112）内每个 item 的外层 `<div>` 上添加：
```html
v-show="!searchUnit.trim() || (String(item.code ?? '') + String(item.symbol ?? '')).toLowerCase().includes(searchUnit.trim().toLowerCase())"
```

> 同 CodelistsTab，draggable 内部用 `v-show` 保留拖拽能力。

---

## Step 6: ProjectInfoTab.vue — 分区分割线

**文件**：`frontend/src/components/ProjectInfoTab.vue`

### 模板变更

在 `<el-form>` 内，`项目名称` el-form-item 之前插入：
```html
<el-divider content-position="left">项目信息</el-divider>
```

在 `CRF版本` el-form-item 之前插入：
```html
<el-divider content-position="left">封面页信息</el-divider>
```

**分区归属**：
- 项目信息：项目名称、版本号、试验名称
- 封面页信息：CRF版本、CRF版本日期、方案编号、申办方、数据管理单位、公司Logo

---

## 执行顺序

按 Step 1 → 6 顺序执行，每步修改完成后不需要重启服务（Vite 热更新）。

## 验证要点

- [ ] 搜索框输入关键词时，表格/列表实时过滤
- [ ] 清空搜索框后显示全部数据
- [ ] UnitsTab / CodelistsTab 右侧：过滤后拖拽排序仍可正常使用
- [ ] VisitsTab：按钮显示"批量编辑"，点击功能（打开预览）不变
- [ ] ProjectInfoTab：两个分割线正确显示，表单字段归属正确
