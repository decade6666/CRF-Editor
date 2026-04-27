# 实施计划：访视预览弹窗 + 顶部按钮重构

## 任务类型
- [x] 前端 (Vue 3 + Element Plus)

## 技术方案

### Task 1：访视界面表单预览按钮
复用 `FormDesignerTab.vue` 中已有的 Word 预览渲染逻辑，将 `renderCellHtml`、`getInlineRows`、`renderGroups`、`needsLandscape` 移植到 `VisitsTab.vue`，点击"预览"按钮时从 API 拉取字段数据并渲染到 `el-dialog` 中。

### Task 2：顶部按钮重构
将三个 emoji 按钮统一替换为 `el-icon`（`RefreshRight`、`Setting` 已全局注册），新增单一 `.header-icon-btn` 类，删除旧的 glassmorphism 样式块。

---

## 实施步骤

### Step 1：VisitsTab.vue — script 新增

**1.1 新增 import**
在现有 import 语句末尾添加：
```js
import { renderCtrlHtml, toHtml } from '../composables/useCRFRenderer'
```

**1.2 新增状态变量**（在 `showVisitPreview` 等现有变量附近）
```js
const showFormPreview = ref(false)
const formPreviewTitle = ref('')
const formPreviewFields = ref([])
const formPreviewLoading = ref(false)
```

**1.3 新增 renderCellHtml 函数**（完全复制自 FormDesignerTab.vue:300-319）
```js
function renderCellHtml(ff) {
  if (ff.field_definition?.codelist?.options?.length) {
    const opts = ff.field_definition.codelist.options
    const isMulti = ff.field_type === 'checkbox'
    return opts.map(o => `<label style="margin-right:8px">
      <input type="${isMulti ? 'checkbox' : 'radio'}" disabled> ${o.label}
    </label>`).join('')
  }
  if (ff.is_inline) {
    return `<span style="border-bottom:1px solid #333;display:inline-block;min-width:80px">&nbsp;</span>`
  }
  const unit = ff.unit?.symbol ? `<span style="margin-left:4px">${ff.unit.symbol}</span>` : ''
  return `<span style="border-bottom:1px solid #333;display:inline-block;min-width:80px">&nbsp;</span>${unit}`
}
```

**1.4 新增 getInlineRows 函数**（复制自 FormDesignerTab.vue:321-336）
```js
function getInlineRows(fields) {
  if (!fields.length) return []
  const maxOpts = Math.max(...fields.map(f =>
    f.field_definition?.codelist?.options?.length || 1
  ))
  const rows = []
  for (let r = 0; r < maxOpts; r++) {
    rows.push(fields.map(f => {
      const opts = f.field_definition?.codelist?.options
      return opts ? (opts[r] || null) : null
    }))
  }
  return rows
}
```

**1.5 新增 computed 属性**
```js
const previewRenderGroups = computed(() => {
  const fields = formPreviewFields.value
  if (!fields.length) return []
  const groups = []
  let cur = null
  for (const f of fields) {
    if (f.is_inline) {
      if (cur?.type !== 'inline') { cur = { type: 'inline', fields: [] }; groups.push(cur) }
      cur.fields.push(f)
    } else {
      if (cur?.type !== 'normal') { cur = { type: 'normal', fields: [] }; groups.push(cur) }
      cur.fields.push(f)
    }
  }
  return groups
})

const previewNeedsLandscape = computed(() =>
  previewRenderGroups.value.some(g => g.type === 'inline' && g.fields.length > 4)
)
```

**1.6 新增 openFormPreview 函数**
```js
async function openFormPreview(form) {
  formPreviewTitle.value = form.name || '表单预览'
  formPreviewLoading.value = true
  showFormPreview.value = true
  try {
    const data = await api.cachedGet(`/api/forms/${form.id}/fields`)
    formPreviewFields.value = data
  } catch (e) {
    formPreviewFields.value = []
  } finally {
    formPreviewLoading.value = false
  }
}
```

---

### Step 2：VisitsTab.vue — template 修改

**2.1 拓宽"操作"列标题**（line ~224）
```
style="width:60px" → style="width:110px"
```

**2.2 在"移除"按钮前插入"预览"按钮**（line ~237）
```html
<el-button type="primary" size="small" link @click.stop="openFormPreview(f)">预览</el-button>
<el-button type="danger" size="small" link @click.stop="removeFormFromVisit(f.id)">移除</el-button>
```

**2.3 在 `</template>` 前添加预览 dialog**
```html
<el-dialog
  v-model="showFormPreview"
  :title="formPreviewTitle"
  width="800px"
  top="5vh"
>
  <div v-if="formPreviewLoading" style="text-align:center;padding:40px">
    <el-icon class="is-loading"><Loading /></el-icon> 加载中...
  </div>
  <div v-else-if="!formPreviewFields.length" style="text-align:center;color:#999;padding:40px">
    暂无字段
  </div>
  <div v-else class="word-preview">
    <div class="word-page" :class="{ landscape: previewNeedsLandscape }">
      <div class="wp-form-title">{{ formPreviewTitle }}</div>
      <table style="width:100%;border-collapse:collapse">
        <template v-for="(group, gi) in previewRenderGroups" :key="gi">
          <template v-if="group.type === 'normal'">
            <tr v-for="ff in group.fields" :key="ff.id">
              <td class="wp-label">{{ ff.label }}</td>
              <td class="wp-ctrl" v-html="renderCellHtml(ff)"></td>
            </tr>
          </template>
          <template v-else>
            <tr class="wp-inline-header">
              <th v-for="ff in group.fields" :key="ff.id">{{ ff.label }}</th>
            </tr>
            <tr v-for="(row, ri) in getInlineRows(group.fields)" :key="ri">
              <td v-for="(cell, ci) in row" :key="ci" class="inline-table">
                {{ cell ? cell.label : '' }}
              </td>
            </tr>
          </template>
        </template>
      </table>
    </div>
  </div>
</el-dialog>
```

---

### Step 3：App.vue — 替换三个按钮

目标位置（lines ~388-392）：

```html
<!-- 新代码：统一 class="header-icon-btn" + el-icon -->
<el-button class="header-icon-btn" text circle aria-label="刷新数据" @click="handleRefresh" title="刷新数据">
  <el-icon><RefreshRight /></el-icon>
</el-button>
<el-button class="header-icon-btn" text circle aria-label="打开设置" @click="openSettings" title="设置">
  <el-icon><Setting /></el-icon>
</el-button>
<el-button class="header-icon-btn" text circle @click="toggleTheme" :title="isDark ? '切换到浅色模式' : '切换到暗色模式'">
  <el-icon><Moon v-if="!isDark" /><Sunny v-else /></el-icon>
</el-button>
```

（RefreshRight、Setting 已通过 main.js 全局注册，无需 import）

---

### Step 4：main.css — 样式替换

**4.1 删除旧 glassmorphism 样式块**：
- `.theme-btn` 规则块（lines ~231-279）
- `.refresh-btn, .settings-btn` 规则块（lines ~281-318）
- 旧 `.settings-btn` 规则（lines ~89-91，含 cursor/font-size/opacity）

**4.2 新增统一样式**：
```css
/* 顶部图标按钮 — 统一风格 */
.header-icon-btn {
  color: var(--el-text-color-primary) !important;
  opacity: 0.75;
  transition: opacity 0.2s, color 0.2s;
}
.header-icon-btn:hover {
  opacity: 1;
  color: var(--el-color-primary) !important;
}
.header-icon-btn .el-icon {
  font-size: 16px;
}
```

---

## 关键文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/VisitsTab.vue` | 修改 | 添加 import、状态、函数、computed、按钮、dialog |
| `frontend/src/App.vue` | 修改 | 替换三个 emoji 按钮为 el-icon + .header-icon-btn |
| `frontend/src/styles/main.css` | 修改 | 删除旧 glassmorphism 样式，新增 .header-icon-btn |

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| renderCellHtml 与 FormDesignerTab 逻辑不同步 | 后续可提取到共享 composable |
| dialog 宽度在小屏溢出 | 设置 max-width: 90vw 和 overflow: auto |
| api.cachedGet 接口签名不一致 | 参考 FormDesignerTab.vue:loadFormFields 的调用方式 |
| 删除 CSS 影响其他组件 | 仅删除 .theme-btn / .refresh-btn / .settings-btn 独有规则 |

## SESSION_ID
- CODEX_SESSION: N/A
- GEMINI_SESSION: N/A
