# Design: config-migrate-ui-cleanup-darkmode

## 架构决策

### Task 1 — Config 迁移

**目标**：将配置文件唯一来源从 `backend/src/config.yaml` 迁移至项目根目录 `config.yaml`，统一入口。

**方案**：

1. `backend/src/config.py` 中 `CONFIG_FILE` 改为 `Path(__file__).resolve().parents[2] / "config.yaml"`
   - `parents[0]` = `backend/src/`，`parents[1]` = `backend/`，`parents[2]` = 项目根
   - `_CONFIG_DIR` 随 `CONFIG_FILE` 同步变更（代码已自动引用 `CONFIG_FILE.resolve().parent`）

2. 根目录 `config.yaml` 从 `backend/src/config.yaml` **原样复制**，再手工修正相对路径
   - `database.path: ../../crf_editor.db` → `./crf_editor.db`
   - `storage.upload_path: ../../uploads` → `./uploads`
   - 不使用 AppConfig 序列化（会丢失 `app.title` 等非模型字段）

3. `DatabaseConfig` / `StorageConfig` 默认值同步修正（lines 43/47）
   - `../../crf_editor.db` → `./crf_editor.db`
   - `../../uploads` → `./uploads`
   - 保证 config.yaml 丢失时 fallback 路径也正确

4. `backend/crf.spec` 已有 `('config.yaml', '.')` 条目（从 backend/ 目录收集），迁移后路径吻合 ✅ — 无需改动

5. 迁移完成后删除旧文件：`backend/src/config.yaml`、`backend/config.yaml`

**路径解析机制**（不变）：

```
AppConfig.db_path → _resolve_path(self.database.path, _CONFIG_DIR)
_CONFIG_DIR       = CONFIG_FILE.resolve().parent  # 迁移后 = 项目根
```

迁移后 `./crf_editor.db` 基于项目根解析 → `<project_root>/crf_editor.db` ✅

**注意事项**：

- `lru_cache` 仅覆盖 `get_config()`，不覆盖 SQLAlchemy 数据库引擎缓存（`database.py`）
  - 配置迁移视为「启动边界」，迁移后必须重启进程，不支持热切换
- `update_config()` 已有原子写（mkstemp + os.replace），迁移目录可写即可
- `backend/src/services/docx_screenshot_service.py` 和 `docx_import_service.py` 有硬编码路径，**超出本次变更范围**，不处理

---

### Task 2 — UI 清理：隐藏「模板路径」

**目标**：在设置对话框中隐藏「模板路径」输入框，但字段保留以满足后端必填验证。

**方案**：

- `settingsForm.template_path` 保留，`openSettings()` 继续填充，`saveSettings()` 继续传递
- 仅对 `<el-form-item label="模板路径">` 添加 `v-if="false"` —— 零运行时开销，干净利落
- 后端 `PUT /api/settings` 的 `is_safe_path(payload.template_path)` 验证继续通过 ✅

**为什么用 `v-if="false"` 而非 `v-show="false"`**：
- `v-if` 不渲染 DOM，彻底不可见；`v-show` 仍占 DOM 但隐藏——两者功能等效，`v-if` 更干净

---

### Task 3 — UI 清理：隐藏「AI 复核配置」区块

**目标**：临时隐藏设置对话框中的「AI 复核配置」区块，代码完整保留。

**方案**：

- 用 `<template v-if="false">` 包裹分隔线 + 所有 AI 相关 `<el-form-item>`
- `settingsForm` 中的 AI 字段保留，`saveSettings()` 继续传递 AI 字段
- AI 测试连接功能代码保留，仅从视图中隐藏

**隐藏范围**（App.vue 模板区，根据 Grep 结果定位）：

```
<el-divider>AI 复核配置</el-divider>
<el-form-item label="启用AI复核">...</el-form-item>
<el-form-item label="API URL">...</el-form-item>
<el-form-item label="API Key">...</el-form-item>
<el-form-item label="模型">...</el-form-item>
<el-form-item v-if="settingsForm.ai_enabled">  ← 测试连接按钮
  ...
</el-form-item>
```

---

### Task 4 — 暗色模式切换

**目标**：标题栏 ⚙️ 按钮右侧添加浅色/暗色切换按钮，持久化到 localStorage。

**双轨暗色实现**：

| 轨道 | 用途 | 实现 |
|------|------|------|
| Element Plus 原生暗色 | Element Plus 组件（按钮、输入框、对话框等）| `<html class="dark">` + `import 'element-plus/theme-chalk/dark/css-vars.css'` |
| 自定义 CSS 变量暗色 | 项目自定义设计系统 token | `html[data-theme="dark"] { ... }` 选择器覆盖 `:root` 变量 |

**`applyTheme()` 统一函数**（同步两轨）：

```javascript
function applyTheme() {
  document.documentElement.classList.toggle('dark', isDark.value)
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light')
}
```

**状态初始化**（`onMounted`）：

```javascript
const isDark = ref(localStorage.getItem('crf_theme') === 'dark')

onMounted(() => {
  applyTheme()   // 应用持久化主题（与 loadProjects 独立，可多次 onMounted）
})
```

**持久化约定**：
- localStorage key: `crf_theme`（遵循 `crf_` 前缀约定，与 `crf_sidebarWidth` 一致）
- values: `'light'` / `'dark'`
- 默认值: `'light'`（首次访问 localStorage 无值时）

**图标逻辑**：
- 当前浅色模式 → 显示 🌙（Moon），提示「点我切暗色」
- 当前暗色模式 → 显示 ☀️（Sunny），提示「点我切浅色」

**CSS 暗色变量覆盖值**（基于 Gemini 分析 + main.css 现有 token 推导）：

| Token | Light | Dark |
|-------|-------|------|
| `--indigo-900` | `#1e1b4b` | `#0f172a` |
| `--indigo-500` | `#6366f1` | `#312e81` |
| `--color-bg-body` | `#f1f5f9` | `#020617` |
| `--color-bg-card` | `#ffffff` | `#1e293b` |
| `--color-bg-hover` | `#f8fafc` | `#1e293b` |
| `--color-border` | `#e2e8f0` | `#334155` |
| `--color-text-primary` | `#1e293b` | `#f8fafc` |
| `--color-text-secondary` | `#64748b` | `#94a3b8` |
| `--color-text-muted` | `#94a3b8` | `#64748b` |
| `--color-primary-subtle` | `#f5f3ff` | `#1e1b4b` |

**Import 顺序**（`main.js`）：

```javascript
import 'element-plus/theme-chalk/dark/css-vars.css'  // 必须在 main.css 之前
import './styles/main.css'
```

---

## 文件变更矩阵

| 文件 | 变更类型 | 关键修改点 |
|------|----------|-----------|
| `backend/src/config.py` | 修改 | L15 CONFIG_FILE；L43/47 默认值 |
| `config.yaml`（项目根） | 新建 | 从 backend/src/ 复制 + 修正相对路径 |
| `backend/src/config.yaml` | 删除 | 迁移后删除 |
| `backend/config.yaml` | 删除 | 旧文件删除 |
| `frontend/src/App.vue` | 修改 | 隐藏模板路径 + 隐藏 AI 区块 + 暗色模式逻辑 + 切换按钮 |
| `frontend/src/main.js` | 修改 | 添加 Element Plus dark CSS vars import |
| `frontend/src/styles/main.css` | 修改 | 添加 `html[data-theme="dark"]` 变量块 |

**共 7 个文件，2 删除，1 新建，4 修改。**

---

## 依赖关系

```
Task 1（config 迁移）
  └── 独立，优先执行

Task 2 + Task 3（UI 清理）
  └── 独立，可并行

Task 4（暗色模式）
  ├── main.js import 修改（独立）
  └── main.css dark vars（独立）
  └── App.vue 逻辑 + 按钮（需先确认现有 onMounted 结构）
```

---

## 超出范围

- `docx_screenshot_service.py` / `docx_import_service.py` 硬编码路径修复
- AI 复核功能实际启用
- 后端 `PUT /api/settings` schema 修改
