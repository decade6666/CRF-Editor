# Spec 03 — 暗色模式切换

## 目标

在标题栏 ⚙️ 按钮右侧添加浅色/暗色切换按钮，支持 Element Plus 组件和自定义 CSS 变量的双轨暗色适配，状态持久化至 localStorage。

---

## 前提条件

- Vue 3 `<script setup>`，`ref`、`onMounted` 已导入（App.vue L2）
- Element Plus 图标已全局注册，`Moon` 和 `Sunny` 可直接使用
- `frontend/src/styles/main.css` 已定义 `:root` 设计 token
- `frontend/src/main.js` 已导入 `./styles/main.css`
- localStorage 已有 `crf_sidebarWidth`，遵循 `crf_` 前缀约定

---

## 变更规格

### 3.1 修改 `frontend/src/main.js`

在现有 `import './styles/main.css'` **之前**添加：

```javascript
import 'element-plus/theme-chalk/dark/css-vars.css'
```

完整 import 顺序（暗色变量必须先于 main.css 加载，以允许 main.css 中的 :root 在必要时覆盖）：

```javascript
import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'  // ← 新增，置于 main.css 之前
import './styles/main.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'
```

---

### 3.2 修改 `frontend/src/styles/main.css`

在文件末尾追加（置于现有 Element Plus 覆盖规则之后）：

```css
/* ——— 暗色模式自定义变量覆盖 ——— */
html[data-theme="dark"] {
  /* 侧边栏 */
  --indigo-900: #0f172a;

  /* 标题栏/主色（暗色下用更深靛蓝，避免刺眼） */
  --indigo-500: #312e81;

  /* 背景 */
  --color-bg-body:        #020617;
  --color-bg-card:        #1e293b;
  --color-bg-hover:       #1e293b;

  /* 边框 */
  --color-border:         #334155;

  /* 文字 */
  --color-text-primary:   #f8fafc;
  --color-text-secondary: #94a3b8;
  --color-text-muted:     #64748b;

  /* 主色 subtle 背景（暗色下用深靛蓝底） */
  --color-primary-subtle: #1e1b4b;

  /* 阴影（暗色下降低对比度） */
  --shadow-sm:   0 1px 3px rgba(0,0,0,0.30), 0 1px 2px rgba(0,0,0,0.20);
  --shadow-md:   0 4px 6px -1px rgba(0,0,0,0.40), 0 2px 4px -1px rgba(0,0,0,0.20);
  --shadow-lg:   0 10px 15px -3px rgba(0,0,0,0.40), 0 4px 6px -2px rgba(0,0,0,0.20);
  --shadow-page: 0 4px 24px rgba(0,0,0,0.50);
}
```

---

### 3.3 修改 `frontend/src/App.vue`

#### 3.3.1 script setup — 暗色模式状态与逻辑

在 `<script setup>` 块中添加（建议放在 `showSettings` 附近的 UI 状态区域）：

```javascript
// 暗色模式
const isDark = ref(localStorage.getItem('crf_theme') === 'dark')

function applyTheme() {
  // 同步 Element Plus 暗色（class="dark"）和自定义变量（data-theme）
  document.documentElement.classList.toggle('dark', isDark.value)
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light')
}

function toggleTheme() {
  isDark.value = !isDark.value
  localStorage.setItem('crf_theme', isDark.value ? 'dark' : 'light')
  applyTheme()
}
```

#### 3.3.2 script setup — onMounted 补充

Vue 3 支持多个 `onMounted` 调用（不冲突）。新增一个 `onMounted` 用于主题恢复：

```javascript
onMounted(() => {
  applyTheme()  // 恢复持久化主题，防止刷新后闪白
})
```

注意：现有 `onMounted(loadProjects)` 保持不变（位于 App.vue L22 附近）。

#### 3.3.3 模板区 — 标题栏切换按钮

在设置按钮（⚙️）**之后**添加：

```html
<!-- 暗色模式切换按钮 -->
<el-button class="theme-btn" text circle @click="toggleTheme" :title="isDark ? '切换到浅色模式' : '切换到暗色模式'">
  <el-icon><Moon v-if="!isDark" /><Sunny v-else /></el-icon>
</el-button>
```

图标逻辑：
- `!isDark`（当前浅色）→ 显示 Moon（月亮），表示「点我切暗色」
- `isDark`（当前暗色）→ 显示 Sunny（太阳），表示「点我切浅色」

#### 3.3.4 CSS 补充（可选）

`main.css` 已有 `.settings-btn` 样式，`.theme-btn` 可复用相同样式或追加：

```css
.theme-btn { cursor: pointer; opacity: 0.85; transition: opacity 0.2s; }
.theme-btn:hover { opacity: 1; }
```

---

## 验证条件（Success Criteria）

| ID | 条件 |
|----|------|
| SC-4.1 | 标题栏 ⚙️ 右侧可见切换按钮，默认显示 Moon 图标（浅色模式）|
| SC-4.2 | 点击切换按钮，`<html>` 同时拥有 `class="dark"` 和 `data-theme="dark"` |
| SC-4.3 | 暗色模式下 Element Plus 组件（按钮/输入框/对话框）视觉变暗 |
| SC-4.4 | 暗色模式下背景色、文字色、边框色符合 design.md 中的 dark token 值 |
| SC-4.5 | 刷新页面后主题状态保持（localStorage `crf_theme` 持久化）|
| SC-4.6 | 首次访问（无 localStorage 记录）默认为浅色模式 |
| SC-4.7 | 点击两次切换按钮后回到初始主题（切换幂等）|

---

## 风险

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| Element Plus dark CSS vars 未被正确加载 | 中 | import 顺序确保在 main.css 之前；SC-4.3 验证 |
| 刷新时浅色→暗色闪烁（FOUC） | 低 | onMounted 中调用 applyTheme() 尽早同步；浏览器渲染时间窗口极短可接受 |
| Moon/Sunny 图标未全局注册 | 低 | main.js 已有 for...in 全局注册所有 Element Plus 图标；C-08 已确认 |
| 多个 onMounted 执行顺序问题 | 低 | Vue 3 多次 onMounted 均在 DOM 挂载后按声明顺序执行，无冲突 |
