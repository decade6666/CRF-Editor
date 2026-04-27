# 修复计划：VisitsTab 预览弹窗安全与质量修复

## 任务类型
- [x] 前端 (Vue 3 + Element Plus)

## 问题清单（来自代码审查）

| # | 严重度 | 问题 | 文件:行号 |
|---|--------|------|-----------|
| 1 | Critical | XSS — `o.label` / `ff.unit.symbol` 未转义直接 v-html | VisitsTab.vue:157,162 |
| 2 | Critical | DRY — 62 行重复渲染逻辑，绕过已有安全 composable | VisitsTab.vue:151-213 |
| 3 | Critical | 属性名错误 — `is_inline`/`field_type`/`o.label` 均不存在 | VisitsTab.vue:153-176 |
| 4 | Major | 弹窗 width 硬编码 800px，小屏溢出 | VisitsTab.vue:393 |
| 5 | Major | catch 静默吞错，用户无反馈 | VisitsTab.vue:207-208 |
| 6 | Minor | 不相关的 FieldsTab 列宽改动混入 | FieldsTab.vue:183 |
| 7 | Minor | CSS `!important` 可优化 | main.css:228-235 |

## 技术方案

### 核心策略：回归 useCRFRenderer 安全渲染通道

**方案选择**：Codex 推荐方案 B（复用 useCRFRenderer + 数据适配），Gemini 推荐方案 C（Hybrid Alignment）。两者本质一致——让 VisitsTab 不再自造渲染器，而是**复用已有的安全 composable**，仅做数据格式适配。

**核心理由**：
1. `useCRFRenderer.js` 的 `toHtml()` 已经做了完整的 HTML 转义（防 XSS）
2. `renderCtrlHtml()` 已包含所有字段类型的渲染规则（数值/日期/单选/多选/纵向等）
3. `FormDesignerTab.vue:300-319` 已经示范了正确的数据适配模式
4. 不需要改后端，不需要新增 composable 文件——只需要在 VisitsTab 内做映射

**不采用的方案**：
- ❌ 方案 A（局部补字段名 + 手动转义）：DRY 问题未解，领域规则不完整
- ❌ 方案 C（抽共享 preview composable）：属于独立重构，不应与安全修复绑定

---

## 实施步骤

### Step 1：修正 VisitsTab.vue — import 与数据适配

**1.1 新增 import**

在 `VisitsTab.vue` 第 4 行 `import { api, genCode }` 之后添加：
```js
import { renderCtrlHtml, toHtml } from '../composables/useCRFRenderer'
```

**1.2 重写 renderCellHtml 函数**（替换当前第 152-164 行）

复用 `FormDesignerTab.vue:300-319` 的适配模式，将 `FormFieldResponse` 映射为 `renderCtrlHtml` 需要的 shape：

```js
// Word 预览控件渲染（复用 useCRFRenderer，保持与 FormDesignerTab 一致）
function renderCellHtml(ff) {
  if (!ff.field_definition) return '<span class="fill-line"></span>'
  const fd = ff.field_definition
  const ft = fd.field_type
  // 选择题类型直接传含 options 的对象
  if (ft && ['单选', '多选', '单选（纵向）', '多选（纵向）'].includes(ft)) {
    return renderCtrlHtml({ ...fd, options: fd.codelist?.options || [] })
  }
  // inline 字段有 default_value 时，转义后直接返回
  if (ff.inline_mark && ff.default_value) {
    return ff.default_value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')
  }
  // 其他类型：适配为 renderCtrlHtml 的标准输入
  const field = {
    field_type: ft,
    options: fd.codelist?.options || [],
    unit_symbol: fd.unit?.symbol,
    integer_digits: fd.integer_digits,
    decimal_digits: fd.decimal_digits,
    date_format: fd.date_format,
  }
  return renderCtrlHtml(field)
}
```

**1.3 重写 getInlineRows 函数**（替换当前第 166-177 行）

复用 `FormDesignerTab.vue:321-336` 的安全渲染模式：

```js
function getInlineRows(fields) {
  const cols = fields.map(ff => {
    if (ff.default_value) {
      const lines = ff.default_value.split('\n')
      while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
      return {
        lines: lines.map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')),
        repeat: false
      }
    }
    const { renderCtrl } = await import('../composables/useCRFRenderer')
    // 注意：这里不能用 async，改为在文件顶部同时 import renderCtrl
    const ctrl = renderCtrl(ff.field_definition).replace(/_{8,}/, '______')
    return { lines: [toHtml(ctrl)], repeat: true }
  })
  const maxRows = Math.max(1, ...cols.filter(c => !c.repeat).map(c => c.lines.length))
  return Array.from({ length: maxRows }, (_, i) =>
    cols.map(col => col.repeat ? col.lines[0] : (col.lines[i] ?? ''))
  )
}
```

> **注意**：上面 `renderCtrl` 需要在 Step 1.1 的 import 中一并导入：
> ```js
> import { renderCtrl, renderCtrlHtml, toHtml } from '../composables/useCRFRenderer'
> ```

实际同步版本（无 async）：
```js
function getInlineRows(fields) {
  const cols = fields.map(ff => {
    if (ff.default_value) {
      const lines = ff.default_value.split('\n')
      while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
      return {
        lines: lines.map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')),
        repeat: false
      }
    }
    const ctrl = renderCtrl(ff.field_definition).replace(/_{8,}/, '______')
    return { lines: [toHtml(ctrl)], repeat: true }
  })
  const maxRows = Math.max(1, ...cols.filter(c => !c.repeat).map(c => c.lines.length))
  return Array.from({ length: maxRows }, (_, i) =>
    cols.map(col => col.repeat ? col.lines[0] : (col.lines[i] ?? ''))
  )
}
```

**1.4 修正 previewRenderGroups computed**（替换当前第 179-194 行）

使用正确的属性名 `inline_mark`（而非 `is_inline`）：

```js
const previewRenderGroups = computed(() => {
  const fields = formPreviewFields.value
  if (!fields.length) return []
  const groups = []; let i = 0
  while (i < fields.length) {
    const ff = fields[i]
    if (ff.inline_mark) {
      const g = []
      while (i < fields.length && fields[i].inline_mark) { g.push(fields[i]); i++ }
      groups.push({ type: 'inline', fields: g })
    } else {
      const g = []
      while (i < fields.length && !fields[i].inline_mark) { g.push(fields[i]); i++ }
      groups.push({ type: 'normal', fields: g })
    }
  }
  return groups
})
```

> 这同时与 `FormDesignerTab.vue:346-363` 的 `renderGroups` 逻辑完全对齐。

---

### Step 2：修正 VisitsTab.vue — 错误处理

**2.1 openFormPreview 添加错误反馈**（替换当前第 200-212 行的 catch 块）

```js
async function openFormPreview(form) {
  formPreviewTitle.value = form.name || '表单预览'
  formPreviewLoading.value = true
  showFormPreview.value = true
  try {
    const data = await api.cachedGet('/api/forms/' + form.id + '/fields')
    formPreviewFields.value = data
  } catch (e) {
    formPreviewFields.value = []
    ElMessage.error('加载表单字段失败：' + (e.message || '未知错误'))
  } finally {
    formPreviewLoading.value = false
  }
}
```

---

### Step 3：修正 VisitsTab.vue — template 对齐

**3.1 预览弹窗响应式宽度**（修改当前第 393 行的 el-dialog）

```html
<el-dialog v-model="showFormPreview" :title="formPreviewTitle" width="90%" style="max-width:800px" top="5vh">
```

**3.2 预览表格模板对齐 FormDesignerTab**（替换弹窗内容区）

关键变更：
- 标签显示：`ff.label` → `ff.label_override || ff.field_definition?.label`
- 增加对 `标签` 类型字段和 `日志行` 的特殊渲染
- inline 表格的 cell 使用 `v-html` 渲染（因为 `getInlineRows` 返回的是安全 HTML）
- inline 表头也改用 `label_override || field_definition?.label`

```html
<div v-else class="word-preview">
  <div class="word-page" :class="{ landscape: previewNeedsLandscape }">
    <div class="wp-form-title">{{ formPreviewTitle }}</div>
    <template v-for="(group, gi) in previewRenderGroups" :key="gi">
      <table v-if="group.type === 'normal'" style="width:100%;border-collapse:collapse">
        <template v-for="ff in group.fields" :key="ff.id">
          <tr v-if="ff.field_definition?.field_type === '标签'">
            <td colspan="2" style="font-weight:bold">{{ ff.label_override || ff.field_definition?.label }}</td>
          </tr>
          <tr v-else-if="ff.is_log_row || ff.field_definition?.field_type === '日志行'">
            <td colspan="2" style="background:#d9d9d9">{{ ff.label_override || ff.field_definition?.label || '以下为log行' }}</td>
          </tr>
          <tr v-else>
            <td class="wp-label">{{ ff.label_override || ff.field_definition?.label }}</td>
            <td class="wp-ctrl" v-html="renderCellHtml(ff)"></td>
          </tr>
        </template>
      </table>
      <table v-else class="inline-table" style="width:100%;border-collapse:collapse">
        <tr>
          <td v-for="ff in group.fields" :key="ff.id" class="wp-inline-header">
            {{ ff.label_override || ff.field_definition?.label }}
          </td>
        </tr>
        <tr v-for="(row, ri) in getInlineRows(group.fields)" :key="ri">
          <td v-for="(cell, ci) in row" :key="ci" class="wp-ctrl" v-html="cell"></td>
        </tr>
      </table>
    </template>
  </div>
</div>
```

---

### Step 4：FieldsTab.vue — 撤回无关改动

**4.1 恢复列宽**（第 183 行）

```
width="140" → width="200"
```

> 这个改动与本次修复无关，应单独提交。如果确实需要调窄，请在独立 commit 中处理。

---

### Step 5：main.css — 可选优化

**5.1（可选）消除 !important**

将 `.header-icon-btn` 的选择器提高优先级：

```css
/* 当前 */
.header-icon-btn { color: var(--el-text-color-primary) !important; }
.header-icon-btn:hover { color: var(--el-color-primary) !important; }

/* 建议 */
.header .header-icon-btn { color: var(--el-text-color-primary); }
.header .header-icon-btn:hover { color: var(--el-color-primary); }
```

> 标记为可选是因为 Element Plus 的按钮样式优先级较高，可能仍需 `!important`。如果 `.header .header-icon-btn` 不够，保留现状也可接受。

---

## 关键文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/VisitsTab.vue:4` | 修改 | 添加 useCRFRenderer import |
| `frontend/src/components/VisitsTab.vue:151-213` | 重写 | renderCellHtml / getInlineRows / previewRenderGroups 全部对齐 |
| `frontend/src/components/VisitsTab.vue:200-212` | 修改 | openFormPreview 添加 ElMessage.error |
| `frontend/src/components/VisitsTab.vue:393-427` | 重写 | 预览弹窗模板对齐 FormDesignerTab + 响应式宽度 |
| `frontend/src/components/FieldsTab.vue:183` | 回退 | 恢复 width="200"（无关改动） |
| `frontend/src/styles/main.css:228-235` | 可选 | 消除 !important（需验证是否被 EP 覆盖） |

## 验证清单

修复完成后，手动验证以下场景：

- [ ] 含特殊字符的字典选项（`<script>alert(1)</script>`）不会执行脚本
- [ ] 含单位的文本/数值字段显示正确（如 `kg`、`mmHg`）
- [ ] 单选/多选（横向 + 纵向）选项显示正确，使用 `○`/`□` 符号
- [ ] 日期/时间/日期时间格式渲染正确（`yyyy-MM-dd`、`HH:mm`）
- [ ] 数值字段的整数位/小数位格子正确
- [ ] inline 表格分组与横向字段顺序正确
- [ ] 标签类型字段显示为粗体标题行
- [ ] 日志行字段显示灰底标识行
- [ ] 超过 4 列 inline 自动切换 landscape 布局
- [ ] 弹窗在 1024px 以下屏幕不溢出
- [ ] API 加载失败时显示红色错误提示，而非"暂无字段"
- [ ] FormDesignerTab 的预览功能未受影响（回归测试）
- [ ] App.vue 顶部三个按钮图标正常显示、hover 变色

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| renderCellHtml 适配后与 FormDesignerTab 仍不同步 | 后续可提取共享 composable（独立重构 PR） |
| Element Plus 按钮样式覆盖 .header-icon-btn | 保留 !important 作为兜底 |
| getInlineRows 中 renderCtrl 返回格式变化 | 与 FormDesignerTab 完全对齐，使用相同适配逻辑 |
| FieldsTab 列宽回退可能影响用户已适应的布局 | 该改动本就不属于此 PR，回退是正确做法 |

## SESSION_ID（供 /ccg:execute 使用）
- CODEX_SESSION: 019cffce-0ac7-7871-a4e7-8d4896e5dd84
- GEMINI_SESSION: a4b42927-7898-46d3-af91-39f61013afee
